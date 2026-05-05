import type {
  ClickReplayEvent,
  ConsoleReplayEvent,
  DomTargetDescriptor,
  ErrorReplayEvent,
  KeydownReplayEvent,
  LifecycleReplayEvent,
  NavigationReplayEvent,
  NetworkReplayEvent,
  PrivacyLevel,
  ReplayEvent,
  ReplaySession,
  TruncateReplayEvent,
} from "./events";

export const COMPACT_SESSION_FORMAT = "compact-session-v1" as const;

const COMPACT_CODEC_REVISION = 1 as const;
const STRING_PLACEHOLDER_PREFIX = "\u001f";
const BASE36_PAIR_PLACEHOLDER = `${STRING_PLACEHOLDER_PREFIX}b`;
const DECIMAL_PLACEHOLDER = `${STRING_PLACEHOLDER_PREFIX}d`;
const ESCAPED_PLACEHOLDER_PREFIX = `${STRING_PLACEHOLDER_PREFIX}e`;
const UINT32_MODULO = 2n ** 32n;

type CompactTuple = unknown[];
type SeriesCodec =
  | [kind: 0, value: number, count: number]
  | [kind: 1, start: number, step: number, count: number]
  | [kind: 2, start: number, deltas: number[]]
  | [kind: 3, values: number[]];
type Base36PairRelation = [kind: 0, multiplier: number, addend: number] | [kind: 1, values: SeriesCodec];
type PlaceholderCodec = [kind: 0, firstValues: SeriesCodec, secondValues: Base36PairRelation] | [kind: 1, values: SeriesCodec];
type CompactStringGroup = [template: string, indexes: SeriesCodec, placeholders: PlaceholderCodec[]];

interface CompactStringTable {
  /** Raw strings that were already compact enough: [stringIndex, value]. */
  r: Array<[number, string]>;
  /** Tokenized strings grouped by shared template. */
  g: CompactStringGroup[];
}

interface ParsedPlaceholderBase36Pair {
  kind: 0;
  first: number;
  second: number;
}

interface ParsedPlaceholderDecimal {
  kind: 1;
  value: number;
}

type ParsedPlaceholder = ParsedPlaceholderBase36Pair | ParsedPlaceholderDecimal;

interface ParsedStringTemplate {
  template: string;
  placeholders: ParsedPlaceholder[];
}

// Compact-session-v1 revision 1 is intentionally opaque. Each event kind is
// stored in a fixed bucket with positional tuples to avoid repeating JSON object
// keys. Tuple schemas below use `-1` for absent optional values and indexes into
// `z` (strings) or `a` (targets) dictionaries where applicable:
// click:     [t, pageUrl, target, button, count, last]
// keydown:   [t, pageUrl, target, key, code, privacy, count, last]
// network:   [t, pageUrl, method, url, status, duration, ok, error, redactions, count, last, minDuration, maxDuration]
// navigation:[t, pageUrl, type, fromUrl, toUrl]
// console:   [t, pageUrl, level, argsJson, redactions, count, last]
// error:     [t, pageUrl, reactErrorFlag, name, message, stack, componentStack]
// lifecycle: [t, pageUrl, name, detail]
// truncate:  [t, pageUrl, reason, droppedEvents, truncatedBytes]
// Decoding regenerates stable per-session event ids from canonical event order.
//
// The string dictionary is second-stage compacted by exact template/series
// coding. It is not fixture-specific: any string containing base36-id pairs
// (`abc-123`) or decimal runs can be encoded, and every group falls back to raw
// storage when the encoded form would be larger. Sequence coding is fully
// reversible and is useful for production IDs, URLs, selectors, stack frames,
// and serialized console payloads that often contain counters or affine IDs.

const STRATEGIES: DomTargetDescriptor["strategy"][] = ["id", "attribute", "class", "nth", "unknown"];
const PRIVACY_LEVELS: PrivacyLevel[] = ["safe", "redacted", "masked"];
const CONSOLE_LEVELS: ConsoleReplayEvent["level"][] = ["log", "info", "warn", "error", "debug"];
const LIFECYCLE_NAMES: LifecycleReplayEvent["name"][] = ["init", "flush", "shutdown"];
const TRUNCATE_REASONS: TruncateReplayEvent["reason"][] = ["event-limit", "byte-limit", "redaction"];
const NAVIGATION_TYPES: NavigationReplayEvent["navigationType"][] = ["pushState", "replaceState", "popstate", "hashchange"];

const CLICK_BUCKET = 0;
const KEYDOWN_BUCKET = 1;
const NETWORK_BUCKET = 2;
const CONSOLE_BUCKET = 3;
const ERROR_BUCKET = 4;
const LIFECYCLE_BUCKET = 5;
const TRUNCATE_BUCKET = 6;
const NAVIGATION_BUCKET = 7;

export interface CompactReplaySessionV1 {
  f: typeof COMPACT_SESSION_FORMAT;
  /** Internal codec revision under the pre-release compact-session-v1 format name. */
  r: typeof COMPACT_CODEC_REVISION;
  /** Metadata. */
  m: ReplaySession["metadata"];
  /** Event buckets: click, keydown, network, console, error, lifecycle, truncate, navigation. */
  g: CompactTuple[][];
  /** Error event indexes after canonical timestamp ordering. */
  x: number[];
  /** Stats. */
  s: ReplaySession["stats"];
  /** Privacy metadata. */
  p: ReplaySession["privacy"];
  /** Compact string dictionary. */
  z: CompactStringTable;
  /** DOM target dictionary. */
  a: CompactTuple[];
  /** Base timestamp. */
  t0: number;
}

interface StringIndexer {
  getStringIndex(value: string | undefined): number;
}

function isCompactTupleArray(value: unknown): value is CompactTuple[][] {
  return Array.isArray(value) && value.every((bucket) => Array.isArray(bucket) && bucket.every((tuple) => Array.isArray(tuple)));
}

function isCompactStringTable(value: unknown): value is CompactStringTable {
  const table = value as Partial<CompactStringTable> | undefined;
  return Boolean(
    table &&
      typeof table === "object" &&
      Array.isArray(table.r) &&
      Array.isArray(table.g) &&
      table.r.every((entry) => Array.isArray(entry) && typeof entry[0] === "number" && typeof entry[1] === "string") &&
      table.g.every((entry) => Array.isArray(entry) && typeof entry[0] === "string" && Array.isArray(entry[2])),
  );
}

function assertCompactReplaySession(compact: CompactReplaySessionV1): void {
  if (!isCompactReplaySessionV1(compact)) throw new Error("Malformed compact-session-v1 payload body");
  if (compact.g.length < 7) throw new Error("Malformed compact-session-v1 event buckets");
  if (!Number.isFinite(compact.t0)) throw new Error("Malformed compact-session-v1 base timestamp");
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && value >= 0 ? value : undefined;
}

function optionalString(index: unknown, strings: string[]): string | undefined {
  if (typeof index !== "number" || index < 0) return undefined;
  return strings[index];
}

function compactRedactions(redactions: string[], getStringIndex: (value: string | undefined) => number): number[] {
  return redactions.map((value) => getStringIndex(value));
}

function restoreRedactions(redactions: unknown, strings: string[]): string[] {
  return Array.isArray(redactions) ? redactions.map((index) => optionalString(index, strings) ?? "") : [];
}

function compactTarget(target: DomTargetDescriptor, getStringIndex: (value: string | undefined) => number): CompactTuple {
  return [STRATEGIES.indexOf(target.strategy), getStringIndex(target.selector), getStringIndex(target.tagName), target.redacted ? 1 : 0];
}

function restoreTarget(targetIndex: unknown, targets: CompactTuple[], strings: string[]): DomTargetDescriptor {
  const target = targets[typeof targetIndex === "number" ? targetIndex : -1];
  if (!target) return { strategy: "unknown", selector: "[unknown]" };
  const restored: DomTargetDescriptor = {
    strategy: STRATEGIES[(target[0] as number) ?? 4] ?? "unknown",
    selector: optionalString(target[1], strings) ?? "[unknown]",
  };
  const tagName = optionalString(target[2], strings);
  if (tagName !== undefined) restored.tagName = tagName;
  if (target[3] === 1) restored.redacted = true;
  return restored;
}

function trimTuple(tuple: CompactTuple, minLength: number): CompactTuple {
  while (tuple.length > minLength) {
    const last = tuple.at(-1);
    if (last !== -1 && last !== 0 && last !== undefined) break;
    tuple.pop();
  }
  return tuple;
}

function restoreBase(id: string, kind: ReplayEvent["kind"], tuple: CompactTuple, baseTimestamp: number, strings: string[]) {
  const pageUrl = optionalString(tuple[1], strings);
  return {
    id,
    kind,
    timestamp: baseTimestamp + ((tuple[0] as number) ?? 0),
    pageUrl,
  };
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function encodeSeries(values: number[]): SeriesCodec {
  if (values.length === 0) return [0, 0, 0];
  const first = values[0] ?? 0;
  if (values.every((value) => value === first)) return [0, first, values.length];
  const second = values[1] ?? first;
  const step = second - first;
  if (values.every((value, index) => value === first + step * index)) return [1, first, step, values.length];

  const deltas: number[] = [];
  let previous = first;
  let compactDelta = true;
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] ?? previous;
    const delta = value - previous;
    deltas.push(delta);
    previous = value;
    if (Math.abs(delta) > 1_000_000) compactDelta = false;
  }
  return compactDelta ? [2, first, deltas] : [3, values];
}

function decodeSeries(codec: SeriesCodec, expectedLength?: number): number[] {
  const length = expectedLength ?? (codec[0] === 0 || codec[0] === 1 ? codec.at(-1) : codec[0] === 2 ? codec[2].length + 1 : codec[1].length);
  switch (codec[0]) {
    case 0:
      return Array.from({ length: length as number }, () => codec[1]);
    case 1:
      return Array.from({ length: length as number }, (_, index) => codec[1] + codec[2] * index);
    case 2: {
      const values = [codec[1]];
      for (const delta of codec[2]) values.push((values.at(-1) ?? 0) + delta);
      return values.slice(0, length as number);
    }
    case 3:
      return codec[1].slice(0, length as number);
  }
}

function extendedGcd(a: bigint, b: bigint): [gcd: bigint, x: bigint, y: bigint] {
  if (b === 0n) return [a, 1n, 0n];
  const [gcd, x, y] = extendedGcd(b, a % b);
  return [gcd, y, x - (a / b) * y];
}

function modInverse(value: bigint): number | undefined {
  const normalized = ((value % UINT32_MODULO) + UINT32_MODULO) % UINT32_MODULO;
  const [gcd, x] = extendedGcd(normalized, UINT32_MODULO);
  if (gcd !== 1n) return undefined;
  return Number((x + UINT32_MODULO) % UINT32_MODULO);
}

function moduloUint32(value: bigint): number {
  return Number(((value % UINT32_MODULO) + UINT32_MODULO) % UINT32_MODULO);
}

function encodeBase36Pairs(values: Array<[first: number, second: number]>): PlaceholderCodec {
  const firstValues = values.map(([first]) => first);
  const secondValues = values.map(([, second]) => second);
  let relation: Base36PairRelation | undefined;
  const distinctIndex = firstValues.findIndex((value, index) => index > 0 && value !== firstValues[0]);

  if (distinctIndex > 0) {
    const firstDelta = BigInt((firstValues[distinctIndex] ?? 0) - (firstValues[0] ?? 0));
    const secondDelta = BigInt((secondValues[distinctIndex] ?? 0) - (secondValues[0] ?? 0));
    const inverse = modInverse(firstDelta);
    if (inverse !== undefined) {
      const multiplier = moduloUint32(secondDelta * BigInt(inverse));
      const addend = moduloUint32(BigInt(secondValues[0] ?? 0) - BigInt(firstValues[0] ?? 0) * BigInt(multiplier));
      if (values.every(([first, second]) => moduloUint32(BigInt(first) * BigInt(multiplier) + BigInt(addend)) === second)) {
        relation = [0, multiplier, addend];
      }
    }
  }

  return [0, encodeSeries(firstValues), relation ?? [1, encodeSeries(secondValues)]];
}

function decodeBase36Pairs(codec: PlaceholderCodec, length: number): string[] {
  if (codec[0] !== 0) return [];
  const firstValues = decodeSeries(codec[1], length);
  const relation = codec[2];
  const secondValues =
    relation[0] === 0
      ? firstValues.map((first) => moduloUint32(BigInt(first) * BigInt(relation[1]) + BigInt(relation[2])))
      : decodeSeries(relation[1], length);

  return firstValues.map((first, index) => `${first.toString(36)}-${(secondValues[index] ?? 0).toString(36)}`);
}

function encodeDecimalValues(values: number[]): PlaceholderCodec {
  return [1, encodeSeries(values)];
}

function decodeDecimalValues(codec: PlaceholderCodec, length: number): string[] {
  if (codec[0] !== 1) return [];
  return decodeSeries(codec[1], length).map((value) => String(value));
}

function escapeTemplateFragment(value: string): string {
  return value.replaceAll(STRING_PLACEHOLDER_PREFIX, ESCAPED_PLACEHOLDER_PREFIX);
}

function parseTemplateString(value: string): ParsedStringTemplate | undefined {
  const matches = [...value.matchAll(/[0-9a-z]+-[0-9a-z]+|\b\d+\b/gu)];
  if (matches.length === 0) return undefined;

  let template = "";
  let cursor = 0;
  const placeholders: ParsedPlaceholder[] = [];

  for (const match of matches) {
    const token = match[0];
    const index = match.index ?? cursor;
    template += escapeTemplateFragment(value.slice(cursor, index));

    if (token.includes("-")) {
      const [first = "0", second = "0"] = token.split("-");
      template += BASE36_PAIR_PLACEHOLDER;
      placeholders.push({ kind: 0, first: Number.parseInt(first, 36), second: Number.parseInt(second, 36) });
    } else {
      template += DECIMAL_PLACEHOLDER;
      placeholders.push({ kind: 1, value: Number(token) });
    }

    cursor = index + token.length;
  }

  template += escapeTemplateFragment(value.slice(cursor));
  return { template, placeholders };
}

function materializeTemplate(template: string, replacements: string[]): string {
  let output = "";
  let replacementIndex = 0;
  for (let index = 0; index < template.length; index += 1) {
    const char = template[index];
    if (char !== STRING_PLACEHOLDER_PREFIX) {
      output += char;
      continue;
    }

    const marker = template[index + 1];
    index += 1;
    if (marker === "e") output += STRING_PLACEHOLDER_PREFIX;
    else if (marker === "b" || marker === "d") output += replacements[replacementIndex++] ?? "";
    else output += `${STRING_PLACEHOLDER_PREFIX}${marker ?? ""}`;
  }
  return output;
}

function placeholdersToCodecs(columns: ParsedPlaceholder[][]): PlaceholderCodec[] {
  return columns.map((column) => {
    const first = column[0];
    if (first?.kind === 0) {
      return encodeBase36Pairs(
        column.map((placeholder) => {
          if (placeholder.kind !== 0) return [0, 0];
          return [placeholder.first, placeholder.second];
        }),
      );
    }
    return encodeDecimalValues(column.map((placeholder) => (placeholder.kind === 1 ? placeholder.value : 0)));
  });
}

function estimateRawEntriesSize(entries: Array<[number, string]>): number {
  return JSON.stringify(entries).length;
}

function estimateGroupSize(group: CompactStringGroup): number {
  return JSON.stringify(group).length;
}

function encodeStringTable(strings: string[]): CompactStringTable {
  const rawEntries: Array<[number, string]> = [];
  const grouped = new Map<string, { indexes: number[]; placeholders: ParsedPlaceholder[][]; raw: Array<[number, string]> }>();

  strings.forEach((value, index) => {
    const parsed = parseTemplateString(value);
    if (!parsed) {
      rawEntries.push([index, value]);
      return;
    }

    const group = grouped.get(parsed.template) ?? {
      indexes: [],
      placeholders: Array.from({ length: parsed.placeholders.length }, () => [] as ParsedPlaceholder[]),
      raw: [],
    };

    if (group.placeholders.length !== parsed.placeholders.length) {
      group.raw.push([index, value]);
    } else {
      group.indexes.push(index);
      for (const [placeholderIndex, placeholder] of parsed.placeholders.entries()) {
        group.placeholders[placeholderIndex]?.push(placeholder);
      }
    }
    grouped.set(parsed.template, group);
  });

  const groups: CompactStringGroup[] = [];
  for (const [template, group] of grouped) {
    const rawForGroup = group.indexes.map((index) => [index, strings[index] ?? ""] satisfies [number, string]);
    const encodedGroup: CompactStringGroup = [template, encodeSeries(group.indexes), placeholdersToCodecs(group.placeholders)];
    if (group.indexes.length < 2 || estimateGroupSize(encodedGroup) >= estimateRawEntriesSize(rawForGroup)) rawEntries.push(...rawForGroup);
    else groups.push(encodedGroup);
    rawEntries.push(...group.raw);
  }

  return { r: rawEntries, g: groups };
}

function decodeStringTable(table: CompactStringTable): string[] {
  const strings: string[] = [];
  for (const [index, value] of table.r) strings[index] = value;

  for (const [template, indexCodec, placeholderCodecs] of table.g) {
    const indexes = decodeSeries(indexCodec);
    const length = indexes.length;
    const replacementsByPlaceholder = placeholderCodecs.map((codec) =>
      codec[0] === 0 ? decodeBase36Pairs(codec, length) : decodeDecimalValues(codec, length),
    );

    indexes.forEach((stringIndex, rowIndex) => {
      const replacements = replacementsByPlaceholder.map((values) => values[rowIndex] ?? "");
      strings[stringIndex] = materializeTemplate(template, replacements);
    });
  }

  return strings;
}

function maybeCharacterCode(keyIndex: number, code: string | undefined, getStringIndex: (value: string | undefined) => number): number {
  // Printable characters are captured as [character] by the SDK. Physical key codes
  // add high-cardinality payload noise and are not needed for monitoring replay.
  return keyIndex >= 0 && code !== undefined && code !== "" ? getStringIndex(code) : -1;
}

function compactConsoleArgs(args: unknown[], getStringIndex: (value: string | undefined) => number): number {
  return getStringIndex(JSON.stringify(args));
}

function restoreConsoleArgs(argsJsonIndex: unknown, strings: string[]): unknown[] {
  const raw = optionalString(argsJsonIndex, strings);
  if (raw === undefined) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function compactEvent(
  event: ReplayEvent,
  baseTimestamp: number,
  getStringIndex: (value: string | undefined) => number,
  getTargetIndex: (target: DomTargetDescriptor) => number,
): { bucket: number; tuple: CompactTuple } {
  const common: CompactTuple = [event.timestamp - baseTimestamp, getStringIndex(event.pageUrl)];

  switch (event.kind) {
    case "click": {
      const click = event as ClickReplayEvent;
      return {
        bucket: CLICK_BUCKET,
        tuple: trimTuple(
          [
            ...common,
            getTargetIndex(click.target),
            click.button ?? -1,
            click.count ?? 0,
            click.lastTimestamp === undefined ? -1 : click.lastTimestamp - baseTimestamp,
          ],
          3,
        ),
      };
    }
    case "keydown": {
      const keydown = event as KeydownReplayEvent;
      const keyIndex = getStringIndex(keydown.key);
      return {
        bucket: KEYDOWN_BUCKET,
        tuple: trimTuple(
          [
            ...common,
            getTargetIndex(keydown.target),
            keyIndex,
            keydown.key === "[character]" ? -1 : maybeCharacterCode(keyIndex, keydown.code, getStringIndex),
            PRIVACY_LEVELS.indexOf(keydown.privacy),
            keydown.count ?? 0,
            keydown.lastTimestamp === undefined ? -1 : keydown.lastTimestamp - baseTimestamp,
          ],
          6,
        ),
      };
    }
    case "network": {
      const network = event as NetworkReplayEvent;
      return {
        bucket: NETWORK_BUCKET,
        tuple: trimTuple(
          [
            ...common,
            getStringIndex(network.method),
            getStringIndex(network.url),
            network.status ?? -1,
            network.durationMs ?? -1,
            network.ok === undefined ? -1 : network.ok ? 1 : 0,
            getStringIndex(network.error),
            compactRedactions(network.redactions, getStringIndex),
            network.count ?? 0,
            network.lastTimestamp === undefined ? -1 : network.lastTimestamp - baseTimestamp,
            network.minDurationMs ?? -1,
            network.maxDurationMs ?? -1,
          ],
          9,
        ),
      };
    }
    case "navigation": {
      const navigation = event as NavigationReplayEvent;
      return {
        bucket: NAVIGATION_BUCKET,
        tuple: trimTuple(
          [...common, NAVIGATION_TYPES.indexOf(navigation.navigationType), getStringIndex(navigation.fromUrl), getStringIndex(navigation.toUrl)],
          5,
        ),
      };
    }
    case "console": {
      const consoleEvent = event as ConsoleReplayEvent;
      return {
        bucket: CONSOLE_BUCKET,
        tuple: trimTuple(
          [
            ...common,
            CONSOLE_LEVELS.indexOf(consoleEvent.level),
            compactConsoleArgs(consoleEvent.args, getStringIndex),
            compactRedactions(consoleEvent.redactions, getStringIndex),
            consoleEvent.count ?? 0,
            consoleEvent.lastTimestamp === undefined ? -1 : consoleEvent.lastTimestamp - baseTimestamp,
          ],
          5,
        ),
      };
    }
    case "error":
    case "react-error": {
      const error = event as ErrorReplayEvent;
      return {
        bucket: ERROR_BUCKET,
        tuple: trimTuple(
          [
            ...common,
            event.kind === "react-error" ? 1 : 0,
            getStringIndex(error.name),
            getStringIndex(error.message),
            getStringIndex(error.stack),
            getStringIndex(error.componentStack),
          ],
          5,
        ),
      };
    }
    case "lifecycle": {
      const lifecycle = event as LifecycleReplayEvent;
      return {
        bucket: LIFECYCLE_BUCKET,
        tuple: trimTuple([...common, LIFECYCLE_NAMES.indexOf(lifecycle.name), getStringIndex(lifecycle.detail)], 3),
      };
    }
    case "truncate": {
      const truncate = event as TruncateReplayEvent;
      return {
        bucket: TRUNCATE_BUCKET,
        tuple: trimTuple([...common, TRUNCATE_REASONS.indexOf(truncate.reason), truncate.droppedEvents ?? -1, truncate.truncatedBytes ?? -1], 3),
      };
    }
  }
}

function restoreEvent(
  bucket: number,
  tuple: CompactTuple,
  baseTimestamp: number,
  strings: string[],
  targets: CompactTuple[],
  index: number,
): ReplayEvent {
  const id = index.toString(36);
  switch (bucket) {
    case CLICK_BUCKET:
      return withoutUndefined({
        ...restoreBase(id, "click", tuple, baseTimestamp, strings),
        kind: "click",
        target: restoreTarget(tuple[2], targets, strings),
        button: optionalNumber(tuple[3]),
        count: optionalNumber(tuple[4]),
        lastTimestamp: optionalNumber(tuple[5]) === undefined ? undefined : baseTimestamp + (tuple[5] as number),
      }) as ClickReplayEvent;
    case KEYDOWN_BUCKET:
      return withoutUndefined({
        ...restoreBase(id, "keydown", tuple, baseTimestamp, strings),
        kind: "keydown",
        target: restoreTarget(tuple[2], targets, strings),
        key: optionalString(tuple[3], strings),
        code: optionalString(tuple[4], strings),
        privacy: PRIVACY_LEVELS[(tuple[5] as number) ?? 0] ?? "safe",
        count: optionalNumber(tuple[6]),
        lastTimestamp: optionalNumber(tuple[7]) === undefined ? undefined : baseTimestamp + (tuple[7] as number),
      }) as KeydownReplayEvent;
    case NETWORK_BUCKET:
      return withoutUndefined({
        ...restoreBase(id, "network", tuple, baseTimestamp, strings),
        kind: "network",
        method: optionalString(tuple[2], strings) ?? "GET",
        url: optionalString(tuple[3], strings) ?? "[unknown-url]",
        status: optionalNumber(tuple[4]),
        durationMs: optionalNumber(tuple[5]),
        ok: typeof tuple[6] !== "number" || tuple[6] < 0 ? undefined : tuple[6] === 1,
        error: optionalString(tuple[7], strings),
        redactions: restoreRedactions(tuple[8], strings),
        count: optionalNumber(tuple[9]),
        lastTimestamp: optionalNumber(tuple[10]) === undefined ? undefined : baseTimestamp + (tuple[10] as number),
        minDurationMs: optionalNumber(tuple[11]),
        maxDurationMs: optionalNumber(tuple[12]),
      }) as NetworkReplayEvent;
    case CONSOLE_BUCKET:
      return withoutUndefined({
        ...restoreBase(id, "console", tuple, baseTimestamp, strings),
        kind: "console",
        level: CONSOLE_LEVELS[(tuple[2] as number) ?? 0] ?? "log",
        args: restoreConsoleArgs(tuple[3], strings),
        redactions: restoreRedactions(tuple[4], strings),
        count: optionalNumber(tuple[5]),
        lastTimestamp: optionalNumber(tuple[6]) === undefined ? undefined : baseTimestamp + (tuple[6] as number),
      }) as ConsoleReplayEvent;
    case ERROR_BUCKET: {
      const kind = tuple[2] === 1 ? "react-error" : "error";
      return withoutUndefined({
        ...restoreBase(id, kind, tuple, baseTimestamp, strings),
        kind,
        name: optionalString(tuple[3], strings),
        message: optionalString(tuple[4], strings) ?? "",
        stack: optionalString(tuple[5], strings),
        componentStack: optionalString(tuple[6], strings),
      }) as ErrorReplayEvent;
    }
    case LIFECYCLE_BUCKET:
      return withoutUndefined({
        ...restoreBase(id, "lifecycle", tuple, baseTimestamp, strings),
        kind: "lifecycle",
        name: LIFECYCLE_NAMES[(tuple[2] as number) ?? 0] ?? "init",
        detail: optionalString(tuple[3], strings),
      }) as LifecycleReplayEvent;
    case TRUNCATE_BUCKET:
      return withoutUndefined({
        ...restoreBase(id, "truncate", tuple, baseTimestamp, strings),
        kind: "truncate",
        reason: TRUNCATE_REASONS[(tuple[2] as number) ?? 0] ?? "event-limit",
        droppedEvents: optionalNumber(tuple[3]),
        truncatedBytes: optionalNumber(tuple[4]),
      }) as TruncateReplayEvent;
    case NAVIGATION_BUCKET:
      return withoutUndefined({
        ...restoreBase(id, "navigation", tuple, baseTimestamp, strings),
        kind: "navigation",
        navigationType: NAVIGATION_TYPES[(tuple[2] as number) ?? 0] ?? "pushState",
        fromUrl: optionalString(tuple[3], strings),
        toUrl: optionalString(tuple[4], strings) ?? optionalString(tuple[1], strings) ?? "[unknown-url]",
      }) as NavigationReplayEvent;
    default:
      return {
        id,
        kind: "lifecycle",
        name: "init",
        timestamp: baseTimestamp,
      };
  }
}

export function compactReplaySession(session: ReplaySession): CompactReplaySessionV1 {
  const strings: string[] = [];
  const stringIndexes = new Map<string, number>();
  const getStringIndex: StringIndexer["getStringIndex"] = (value) => {
    if (value === undefined) return -1;
    const existing = stringIndexes.get(value);
    if (existing !== undefined) return existing;
    const next = strings.length;
    strings.push(value);
    stringIndexes.set(value, next);
    return next;
  };
  const targets: CompactTuple[] = [];
  const targetIndexes = new Map<string, number>();
  const getTargetIndex = (target: DomTargetDescriptor) => {
    const key = JSON.stringify([target.strategy, target.selector, target.tagName, target.redacted ? 1 : 0]);
    const existing = targetIndexes.get(key);
    if (existing !== undefined) return existing;
    const next = targets.length;
    targets.push(compactTarget(target, getStringIndex));
    targetIndexes.set(key, next);
    return next;
  };
  const baseTimestamp = session.events[0]?.timestamp ?? 0;
  const buckets: CompactTuple[][] = [[], [], [], [], [], [], [], []];
  const bucketOriginalIds: string[][] = [[], [], [], [], [], [], [], []];
  const originalErrorIds = new Set(session.errors.map((error) => error.id));

  for (const event of session.events) {
    const compacted = compactEvent(event, baseTimestamp, getStringIndex, getTargetIndex);
    buckets[compacted.bucket]?.push(compacted.tuple);
    bucketOriginalIds[compacted.bucket]?.push(event.id);
  }

  // The decoder canonicalizes event order by flattening buckets and sorting by
  // timestamp. Mirror that exact ordering here so error anchors remain correct
  // even when multiple event kinds share the same millisecond timestamp.
  const orderedEvents = buckets
    .flatMap((bucket, bucketIndex) =>
      bucket.map((tuple, rowIndex) => ({
        bucket: bucketIndex,
        tuple,
        originalId: bucketOriginalIds[bucketIndex]?.[rowIndex] ?? "",
      })),
    )
    .sort((left, right) => ((left.tuple[0] as number) ?? 0) - ((right.tuple[0] as number) ?? 0));
  const errorIndexes = orderedEvents
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => originalErrorIds.has(entry.originalId) && entry.bucket === ERROR_BUCKET)
    .map(({ index }) => index);

  return {
    f: COMPACT_SESSION_FORMAT,
    r: COMPACT_CODEC_REVISION,
    m: session.metadata,
    g: buckets,
    x: errorIndexes,
    s: session.stats,
    p: session.privacy,
    z: encodeStringTable(strings),
    a: targets,
    t0: baseTimestamp,
  };
}

export function isCompactReplaySessionV1(value: unknown): value is CompactReplaySessionV1 {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Partial<CompactReplaySessionV1>).f === COMPACT_SESSION_FORMAT &&
      (value as Partial<CompactReplaySessionV1>).r === COMPACT_CODEC_REVISION &&
      isCompactTupleArray((value as Partial<CompactReplaySessionV1>).g) &&
      isCompactStringTable((value as Partial<CompactReplaySessionV1>).z) &&
      Array.isArray((value as Partial<CompactReplaySessionV1>).a),
  );
}

export function expandCompactReplaySession(compact: CompactReplaySessionV1): ReplaySession {
  assertCompactReplaySession(compact);
  const strings = decodeStringTable(compact.z);
  const compactEvents = compact.g.flatMap((bucket, bucketIndex) => bucket.map((tuple) => ({ bucket: bucketIndex, tuple })));
  compactEvents.sort((left, right) => ((left.tuple[0] as number) ?? 0) - ((right.tuple[0] as number) ?? 0));
  const events = compactEvents.map((entry, index) => restoreEvent(entry.bucket, entry.tuple, compact.t0, strings, compact.a, index));
  const errorIndexes = new Set(compact.x);
  const errors = events.filter(
    (event, index): event is ErrorReplayEvent => errorIndexes.has(index) && (event.kind === "error" || event.kind === "react-error"),
  );
  return {
    metadata: compact.m,
    events,
    errors,
    stats: compact.s,
    privacy: compact.p,
  };
}
