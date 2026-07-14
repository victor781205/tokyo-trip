/**
 * 密碼學安全的 ID / secret 產生工具
 * 取代 Math.random().toString(36) 的弱熵實作。
 */

/** 產生 URL-safe 的隨機 token（預設 16 bytes → 約 22 字元 base64url） */
export function generateSecureToken(byteLength = 16): string {
  if (byteLength < 1 || !Number.isSafeInteger(byteLength)) {
    throw new RangeError("byteLength must be a positive safe integer");
  }

  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(byteLength);
    globalThis.crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
  }

  // Credentials must never silently downgrade to Math.random/time-based data.
  throw new Error("A cryptographically secure random number generator is required");
}

/** trip_id：trip_ + 16 bytes */
export function generateTripId(): string {
  return `trip_${generateSecureToken(16)}`;
}

/** trip_secret：sec_ + 24 bytes（更高熵，用於授權） */
export function generateTripSecret(): string {
  return `sec_${generateSecureToken(24)}`;
}

/** 短 ID（打包清單項目等非安全敏感用途，仍用 CSPRNG） */
export function generateShortId(byteLength = 8): string {
  return generateSecureToken(byteLength);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
