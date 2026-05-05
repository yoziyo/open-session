export const COMPRESSION_ALGORITHM = "brotli" as const;

export interface CompressionResult {
  algorithm: typeof COMPRESSION_ALGORITHM;
  originalBytes: number;
  compressedBytes: number;
  level: CompressionLevel;
  bytes: Uint8Array;
}

export type CompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface CompressionOptions {
  /**
   * Brotli quality level. Levels 0-6 use the fast/default budget; 7-9 are
   * explicit higher-CPU opt-ins.
   */
  level?: CompressionLevel | undefined;
}

export const DEFAULT_COMPRESSION_LEVEL: CompressionLevel = 6;

function compressionLevel(level: CompressionOptions["level"]): CompressionLevel {
  return level ?? DEFAULT_COMPRESSION_LEVEL;
}

function brotliQuality(level: CompressionLevel): number {
  if (level <= 0) return 1;
  if (level <= 6) return 6;
  return Math.min(11, level + 2);
}

function isNodeRuntime(): boolean {
  const maybeProcess = (globalThis as { process?: { versions?: { node?: string } } }).process;
  return Boolean(maybeProcess?.versions?.node);
}

async function compressBrotli(input: Uint8Array, quality: number): Promise<Uint8Array> {
  if (isNodeRuntime()) {
    const nodeZlib = "node:zlib";
    const { brotliCompressSync, constants } = (await import(/* @vite-ignore */ nodeZlib)) as {
      brotliCompressSync: (input: Uint8Array, options: { params: Record<number, number> }) => Uint8Array;
      constants: { BROTLI_PARAM_QUALITY: number };
    };
    return new Uint8Array(
      brotliCompressSync(input, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: quality,
        },
      }),
    );
  }

  const { default: brotliWasmPromise } = await import("brotli-wasm");
  const brotli = await brotliWasmPromise;
  return brotli.compress(input, { quality });
}

async function decompressBrotli(input: Uint8Array): Promise<Uint8Array> {
  if (isNodeRuntime()) {
    const nodeZlib = "node:zlib";
    const { brotliDecompressSync } = (await import(/* @vite-ignore */ nodeZlib)) as { brotliDecompressSync: (input: Uint8Array) => Uint8Array };
    return new Uint8Array(brotliDecompressSync(input));
  }

  const { default: brotliWasmPromise } = await import("brotli-wasm");
  const brotli = await brotliWasmPromise;
  return brotli.decompress(input);
}

export async function compressJson(value: unknown, options: CompressionOptions = {}): Promise<CompressionResult> {
  const json = JSON.stringify(value);
  const input = new TextEncoder().encode(json);
  const level = compressionLevel(options.level);
  const bytes = await compressBrotli(input, brotliQuality(level));
  return {
    algorithm: COMPRESSION_ALGORITHM,
    originalBytes: input.byteLength,
    compressedBytes: bytes.byteLength,
    level,
    bytes,
  };
}

export async function decompressJson<T>(bytes: Uint8Array): Promise<T> {
  const output = await decompressBrotli(bytes);
  return JSON.parse(new TextDecoder().decode(output)) as T;
}
