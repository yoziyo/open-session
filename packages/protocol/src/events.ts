export type EventKind = "click" | "keydown" | "network" | "console" | "error" | "react-error" | "lifecycle" | "truncate" | "navigation";

export type PrivacyLevel = "safe" | "redacted" | "masked";

export interface BaseReplayEvent {
  id: string;
  kind: EventKind;
  timestamp: number;
  pageUrl?: string | undefined;
}

export interface DomTargetDescriptor {
  strategy: "id" | "attribute" | "class" | "nth" | "unknown";
  selector: string;
  tagName?: string | undefined;
  redacted?: boolean | undefined;
}

export interface ClickReplayEvent extends BaseReplayEvent {
  kind: "click";
  target: DomTargetDescriptor;
  button?: number | undefined;
  count?: number | undefined;
  lastTimestamp?: number | undefined;
}

export interface KeydownReplayEvent extends BaseReplayEvent {
  kind: "keydown";
  target: DomTargetDescriptor;
  key?: string | undefined;
  code?: string | undefined;
  privacy: PrivacyLevel;
  count?: number | undefined;
  lastTimestamp?: number | undefined;
}

export interface NetworkReplayEvent extends BaseReplayEvent {
  kind: "network";
  method: string;
  url: string;
  status?: number | undefined;
  durationMs?: number | undefined;
  ok?: boolean | undefined;
  error?: string | undefined;
  redactions: string[];
  count?: number | undefined;
  lastTimestamp?: number | undefined;
  minDurationMs?: number | undefined;
  maxDurationMs?: number | undefined;
}

export interface NavigationReplayEvent extends BaseReplayEvent {
  kind: "navigation";
  navigationType: "pushState" | "replaceState" | "popstate" | "hashchange";
  fromUrl?: string | undefined;
  toUrl: string;
}

export interface ConsoleReplayEvent extends BaseReplayEvent {
  kind: "console";
  level: "log" | "info" | "warn" | "error" | "debug";
  args: unknown[];
  redactions: string[];
  count?: number | undefined;
  lastTimestamp?: number | undefined;
}

export interface ErrorReplayEvent extends BaseReplayEvent {
  kind: "error" | "react-error";
  name?: string | undefined;
  message: string;
  stack?: string | undefined;
  componentStack?: string | undefined;
}

export interface LifecycleReplayEvent extends BaseReplayEvent {
  kind: "lifecycle";
  name: "init" | "flush" | "shutdown";
  detail?: string | undefined;
}

export interface TruncateReplayEvent extends BaseReplayEvent {
  kind: "truncate";
  reason: "event-limit" | "byte-limit" | "redaction";
  droppedEvents?: number | undefined;
  truncatedBytes?: number | undefined;
}

export type ReplayEvent =
  | ClickReplayEvent
  | KeydownReplayEvent
  | NetworkReplayEvent
  | NavigationReplayEvent
  | ConsoleReplayEvent
  | ErrorReplayEvent
  | LifecycleReplayEvent
  | TruncateReplayEvent;

export interface ReplaySessionMetadata {
  appId?: string | undefined;
  sessionId: string;
  userId?: string | undefined;
  sdkVersion: string;
  url?: string | undefined;
  userAgent?: string | undefined;
  viewport?: { width: number; height: number } | undefined;
  createdAt: string;
}

export interface ReplayStats {
  eventCount: number;
  droppedEvents: number;
  truncatedEvents: number;
  redactionCount: number;
}

export interface ReplaySession {
  metadata: ReplaySessionMetadata;
  events: ReplayEvent[];
  errors: ErrorReplayEvent[];
  stats: ReplayStats;
  privacy: {
    defaultRedactions: string[];
    notes: string[];
  };
}

export const SENSITIVE_QUERY_KEYS = [
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "password",
  "pass",
  "secret",
  "client_secret",
  "key",
  "api_key",
  "code",
  "otp",
  "email",
  "auth",
  "authorization",
  "session",
  "jwt",
  "signature",
  "sig",
] as const;

export function isReplaySession(value: unknown): value is ReplaySession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ReplaySession>;
  return Boolean(
    session.metadata &&
      typeof session.metadata.sessionId === "string" &&
      Array.isArray(session.events) &&
      Array.isArray(session.errors) &&
      session.stats &&
      typeof session.stats.eventCount === "number",
  );
}
