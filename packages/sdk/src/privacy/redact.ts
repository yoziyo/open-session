import { SENSITIVE_QUERY_KEYS } from "@open-session/protocol";

export interface RedactionOptions {
  additionalQueryKeys?: string[];
  maskSelectors?: string[];
  excludeSelectors?: string[];
  excludeUrls?: Array<string | RegExp>;
  excludeConsole?: Array<string | RegExp>;
  maxSanitizedStringLength?: number;
  maxConsoleArgs?: number;
  maxConsoleObjectKeys?: number;
  maxConsoleArrayEntries?: number;
  maxErrorStackLength?: number;
  maxComponentStackLength?: number;
}

export const REDACTED_VALUE = "[redacted]";

export const SENSITIVE_FIELD_PATTERN = /(password|passwd|pwd|secret|token|jwt|auth|cookie|session|email|credit|card|ssn|private|key)/iu;

const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(password|passwd|pwd|secret|token|jwt|auth|cookie|session|email|api[_-]?key|access[_-]?token|refresh[_-]?token)=([^&\s),;]+)/giu;

const BEARER_PATTERN = /\bBearer\s+[-._~+/A-Za-z0-9]+=*/giu;

const LONG_SECRET_PATTERN = /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|xox[baprs])[-_A-Za-z0-9]{8,}\b/gu;

export function matchesPattern(value: string, patterns: Array<string | RegExp> = []): boolean {
  return patterns.some((pattern) => (typeof pattern === "string" ? value.includes(pattern) : pattern.test(value)));
}

export function isSensitiveName(value: string | null | undefined): boolean {
  return Boolean(value && SENSITIVE_FIELD_PATTERN.test(value));
}

export function sanitizeString(value: string, redactions: string[] = [], maxLength = 500): string {
  let output = value;
  output = output.replace(SENSITIVE_ASSIGNMENT_PATTERN, (_match, key) => {
    redactions.push(`string:${String(key).toLowerCase()}`);
    return `${key}=${REDACTED_VALUE}`;
  });
  output = output.replace(BEARER_PATTERN, () => {
    redactions.push("string:bearer-token");
    return `Bearer ${REDACTED_VALUE}`;
  });
  output = output.replace(LONG_SECRET_PATTERN, () => {
    redactions.push("string:secret-token");
    return REDACTED_VALUE;
  });
  if (output.length > maxLength) return `${output.slice(0, maxLength)}…[truncated]`;
  if (output !== value) return output;
  if (SENSITIVE_FIELD_PATTERN.test(value)) {
    redactions.push("string:sensitive-pattern");
    return REDACTED_VALUE;
  }
  return output;
}

export function redactUrl(rawUrl: string, options: RedactionOptions = {}): { url: string; redactions: string[] } {
  const redactions: string[] = [];
  try {
    const url = new URL(rawUrl, globalThis.location?.href ?? "http://localhost");
    const sensitiveKeys = new Set([...SENSITIVE_QUERY_KEYS, ...(options.additionalQueryKeys ?? [])].map((key) => key.toLowerCase()));
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveKeys.has(key.toLowerCase()) || isSensitiveName(key)) {
        url.searchParams.set(key, REDACTED_VALUE);
        redactions.push(`query:${key}`);
      }
    }
    return { url: url.toString(), redactions };
  } catch {
    return { url: "[invalid-url]", redactions: ["url:invalid"] };
  }
}

export function currentRedactedUrl(options: RedactionOptions = {}): string | undefined {
  if (typeof location === "undefined") return undefined;
  return redactUrl(location.href, options).url;
}

export function sanitizeUnknown(value: unknown, redactions: string[] = [], depth = 0, options: RedactionOptions = {}): unknown {
  if (depth > 3) return "[truncated-depth]";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return sanitizeString(value, redactions, options.maxSanitizedStringLength);
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message, redactions, options.maxSanitizedStringLength),
      stack: value.stack ? sanitizeString(value.stack, redactions) : undefined,
    };
  }
  if (Array.isArray(value))
    return value.slice(0, options.maxConsoleArrayEntries ?? 20).map((entry) => sanitizeUnknown(entry, redactions, depth + 1, options));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, options.maxConsoleObjectKeys ?? 30)) {
      if (isSensitiveName(key)) {
        output[key] = REDACTED_VALUE;
        redactions.push(`object:${key}`);
      } else {
        output[key] = sanitizeUnknown(entry, redactions, depth + 1, options);
      }
    }
    return output;
  }
  return String(value);
}
