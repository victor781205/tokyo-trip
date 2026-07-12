/**
 * 密碼學安全的 ID / secret 產生工具
 * 取代 Math.random().toString(36) 的弱熵實作。
 */

/** 產生 URL-safe 的隨機 token（預設 16 bytes → 約 22 字元 base64url） */
export function generateSecureToken(byteLength = 16): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
  }

  // Node / 測試環境 fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("crypto") as typeof import("crypto");
    return nodeCrypto.randomBytes(byteLength).toString("base64url");
  } catch {
    // 最後手段：仍避免 Math.random 單獨使用，混入時間戳
    const fallback = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    return fallback.slice(0, Math.max(16, byteLength));
  }
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
