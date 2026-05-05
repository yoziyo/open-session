import { base64UrlToBytes, bytesToBase64Url } from "./encoding";

export const CRYPTO_ALGORITHM = "AES-GCM" as const;
export const KDF_ALGORITHM = "PBKDF2" as const;
export const DEFAULT_ITERATIONS = 120_000;
export const KEY_LENGTH = 256;

export interface CryptoMetadata {
  algorithm: typeof CRYPTO_ALGORITHM;
  kdf: typeof KDF_ALGORITHM;
  salt: string;
  iv: string;
  iterations: number;
  keyLength: number;
}

function getCrypto(): Crypto {
  const cryptoRef = globalThis.crypto;
  if (!cryptoRef?.subtle) throw new Error("Web Crypto API is required for replay payload encryption");
  return cryptoRef;
}

function toBufferSource(bytes: Uint8Array): BufferSource {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const cryptoRef = getCrypto();
  const material = await cryptoRef.subtle.importKey("raw", new TextEncoder().encode(passphrase), KDF_ALGORITHM, false, ["deriveKey"]);
  return cryptoRef.subtle.deriveKey(
    {
      name: KDF_ALGORITHM,
      salt: toBufferSource(salt),
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: CRYPTO_ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBytes(bytes: Uint8Array, passphrase: string): Promise<{ metadata: CryptoMetadata; ciphertext: Uint8Array }> {
  const cryptoRef = getCrypto();
  const salt = cryptoRef.getRandomValues(new Uint8Array(16));
  const iv = cryptoRef.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, DEFAULT_ITERATIONS);
  const encrypted = await cryptoRef.subtle.encrypt({ name: CRYPTO_ALGORITHM, iv: toBufferSource(iv) }, key, toBufferSource(bytes));
  return {
    metadata: {
      algorithm: CRYPTO_ALGORITHM,
      kdf: KDF_ALGORITHM,
      salt: bytesToBase64Url(salt),
      iv: bytesToBase64Url(iv),
      iterations: DEFAULT_ITERATIONS,
      keyLength: KEY_LENGTH,
    },
    ciphertext: new Uint8Array(encrypted),
  };
}

export async function decryptBytes(ciphertext: Uint8Array, passphrase: string, metadata: CryptoMetadata): Promise<Uint8Array> {
  if (metadata.algorithm !== CRYPTO_ALGORITHM || metadata.kdf !== KDF_ALGORITHM) {
    throw new Error(`Unsupported crypto metadata: ${metadata.algorithm}/${metadata.kdf}`);
  }
  const key = await deriveKey(passphrase, base64UrlToBytes(metadata.salt), metadata.iterations);
  const output = await getCrypto().subtle.decrypt(
    {
      name: CRYPTO_ALGORITHM,
      iv: toBufferSource(base64UrlToBytes(metadata.iv)),
    },
    key,
    toBufferSource(ciphertext),
  );
  return new Uint8Array(output);
}
