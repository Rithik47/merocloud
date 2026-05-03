// Browser-only: Web Crypto API utilities for end-to-end encryption.
// Never import this file in server components or server actions.

const APP_SALT = "merocloud-e2ee-v1";

function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Derives a 256-bit AES-KW master key from the user's ID via PBKDF2.
// Used only to wrap / unwrap per-file AES-GCM keys — never for direct encryption.
export async function deriveMasterKey(userId: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encode(userId),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encode(APP_SALT),
      iterations: 200_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

// Generates a random 256-bit AES-GCM key for a single file.
export async function generateFileKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

// Encrypts an ArrayBuffer with the file key.
// Returns the ciphertext and a 12-byte random IV (nonce).
export async function encryptBuffer(
  fileKey: CryptoKey,
  buffer: ArrayBuffer,
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    fileKey,
    buffer,
  );
  return { ciphertext, iv };
}

// Decrypts a ciphertext with the file key and IV.
export async function decryptBuffer(
  fileKey: CryptoKey,
  ciphertext: ArrayBuffer,
  iv: Uint8Array,
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, fileKey, ciphertext);
}

// Wraps (encrypts) a file key using the master key (AES-KW).
export async function wrapFileKey(
  masterKey: CryptoKey,
  fileKey: CryptoKey,
): Promise<ArrayBuffer> {
  return crypto.subtle.wrapKey("raw", fileKey, masterKey, "AES-KW");
}

// Unwraps (decrypts) a file key using the master key.
export async function unwrapFileKey(
  masterKey: CryptoKey,
  wrappedKeyBuffer: ArrayBuffer,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    wrappedKeyBuffer,
    masterKey,
    "AES-KW",
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

// Full encrypt flow: File → { encryptedFile, encryptedFileKey (base64), iv (base64) }
export async function encryptFileForUpload(
  file: File,
  userId: string,
): Promise<{ encryptedFile: File; encryptedFileKey: string; iv: string }> {
  const buffer = await file.arrayBuffer();
  const masterKey = await deriveMasterKey(userId);
  const fileKey = await generateFileKey();
  const { ciphertext, iv } = await encryptBuffer(fileKey, buffer);
  const wrappedKey = await wrapFileKey(masterKey, fileKey);

  const encryptedFile = new File([ciphertext], file.name, {
    type: "application/octet-stream",
  });

  return {
    encryptedFile,
    encryptedFileKey: bufferToBase64(wrappedKey),
    iv: bufferToBase64(iv.buffer as ArrayBuffer),
  };
}

// Full decrypt flow: fetches ciphertext from URL, decrypts and returns plaintext bytes.
export async function decryptFileFromStorage(
  url: string,
  encryptedFileKey: string,
  ivBase64: string,
  userId: string,
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch encrypted file.");

  const ciphertext = await response.arrayBuffer();
  const masterKey = await deriveMasterKey(userId);
  const wrappedKeyBuffer = base64ToBuffer(encryptedFileKey);
  const fileKey = await unwrapFileKey(masterKey, wrappedKeyBuffer);
  const iv = new Uint8Array(base64ToBuffer(ivBase64));

  return decryptBuffer(fileKey, ciphertext, iv);
}

// Triggers a browser download from a decrypted ArrayBuffer.
export function downloadDecryptedFile(buffer: ArrayBuffer, fileName: string): void {
  const blob = new Blob([buffer]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
