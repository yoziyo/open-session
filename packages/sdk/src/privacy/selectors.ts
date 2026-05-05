import type { DomTargetDescriptor } from "@open-session/protocol";
import type { RedactionOptions } from "./redact";
import { isSensitiveName, matchesPattern } from "./redact";

const SAFE_ATTRIBUTE_NAMES = ["data-testid", "data-test", "data-cy", "aria-label", "name", "role"];

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/gu, "\\$&");
}

function nthPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === 1 && parts.length < 5) {
    const parent: Element | null = current.parentElement;
    const tag = current.tagName.toLowerCase();
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const siblings = [...parent.children].filter((child) => child.tagName === current?.tagName);
    const index = siblings.indexOf(current) + 1;
    parts.unshift(`${tag}:nth-of-type(${index})`);
    current = parent;
  }
  return parts.join(" > ");
}

function isMasked(element: Element, options: RedactionOptions): boolean {
  if (element.closest('input[type="password"], [data-replay-mask], [data-mask], [aria-hidden="true"]')) return true;
  return matchesSelector(element, options.maskSelectors);
}

function matchesSelector(element: Element, selectors: string[] = []): boolean {
  for (const selector of selectors) {
    try {
      if (element.matches(selector) || element.closest(selector)) return true;
    } catch {
      if (matchesPattern(element.tagName.toLowerCase(), [selector])) return true;
    }
  }
  return false;
}

export function isExcludedTarget(target: EventTarget | null, options: RedactionOptions = {}): boolean {
  return target instanceof Element ? matchesSelector(target, options.excludeSelectors) : false;
}

export function describeTarget(target: EventTarget | null, options: RedactionOptions = {}): DomTargetDescriptor {
  if (!(target instanceof Element)) return { strategy: "unknown", selector: "[unknown]" };
  const tagName = target.tagName.toLowerCase();
  const redacted = isMasked(target, options);
  if (redacted)
    return {
      strategy: "unknown",
      selector: `${tagName}[data-redacted]`,
      tagName,
      redacted: true,
    };

  if (target.id && !isSensitiveName(target.id)) {
    return { strategy: "id", selector: `#${cssEscape(target.id)}`, tagName };
  }

  for (const attr of SAFE_ATTRIBUTE_NAMES) {
    const value = target.getAttribute(attr);
    if (value && !isSensitiveName(value) && !isSensitiveName(attr)) {
      const safeValue = value.length > 80 ? `${value.slice(0, 80)}…` : value;
      return {
        strategy: "attribute",
        selector: `${tagName}[${attr}="${cssEscape(safeValue)}"]`,
        tagName,
      };
    }
  }

  const firstClass = [...target.classList].find((className) => !isSensitiveName(className));
  if (firstClass)
    return {
      strategy: "class",
      selector: `${tagName}.${cssEscape(firstClass)}`,
      tagName,
    };

  return { strategy: "nth", selector: nthPath(target), tagName };
}
