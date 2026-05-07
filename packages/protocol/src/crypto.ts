import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
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

function getCrypto(): Crypto | null {
  const cryptoRef = globalThis.crypto;
  if (!cryptoRef?.subtle) return null;
  return cryptoRef;
}

function randomBytes(byteLength: number): Uint8Array {
  const cryptoRef = globalThis.crypto;
  if (!cryptoRef?.getRandomValues) {
    throw new Error("Crypto.getRandomValues is required for replay payload encryption");
  }
  return cryptoRef.getRandomValues(new Uint8Array(byteLength));
}

function toBufferSource(bytes: Uint8Array): BufferSource {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveWebCryptoKey(cryptoRef: Crypto, passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
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

function keyLengthBytes(): number {
  return KEY_LENGTH / 8;
}

async function derivePortableKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  return pbkdf2Async(sha256, new TextEncoder().encode(passphrase), salt, {
    c: iterations,
    dkLen: keyLengthBytes(),
  });
}

export async function encryptBytes(bytes: Uint8Array, passphrase: string): Promise<{ metadata: CryptoMetadata; ciphertext: Uint8Array }> {
  const cryptoRef = getCrypto();
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const ciphertext = cryptoRef
    ? new Uint8Array(
        await cryptoRef.subtle.encrypt(
          { name: CRYPTO_ALGORITHM, iv: toBufferSource(iv) },
          await deriveWebCryptoKey(cryptoRef, passphrase, salt, DEFAULT_ITERATIONS),
          toBufferSource(bytes),
        ),
      )
    : gcm(await derivePortableKey(passphrase, salt, DEFAULT_ITERATIONS), iv).encrypt(bytes);
  return {
    metadata: {
      algorithm: CRYPTO_ALGORITHM,
      kdf: KDF_ALGORITHM,
      salt: bytesToBase64Url(salt),
      iv: bytesToBase64Url(iv),
      iterations: DEFAULT_ITERATIONS,
      keyLength: KEY_LENGTH,
    },
    ciphertext,
  };
}

export async function decryptBytes(ciphertext: Uint8Array, passphrase: string, metadata: CryptoMetadata): Promise<Uint8Array> {
  if (metadata.algorithm !== CRYPTO_ALGORITHM || metadata.kdf !== KDF_ALGORITHM) {
    throw new Error(`Unsupported crypto metadata: ${metadata.algorithm}/${metadata.kdf}`);
  }
  const cryptoRef = getCrypto();
  const salt = base64UrlToBytes(metadata.salt);
  const iv = base64UrlToBytes(metadata.iv);
  if (!cryptoRef) {
    const key = await derivePortableKey(passphrase, salt, metadata.iterations);
    return gcm(key, iv).decrypt(ciphertext);
  }
  const key = await deriveWebCryptoKey(cryptoRef, passphrase, salt, metadata.iterations);
  const output = await cryptoRef.subtle.decrypt({ name: CRYPTO_ALGORITHM, iv: toBufferSource(iv) }, key, toBufferSource(ciphertext));
  return new Uint8Array(output);
}
