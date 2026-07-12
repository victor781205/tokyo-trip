// scripts/generate-vapid-keys.mjs
//
// 產生一組 VAPID 公私鑰，供 Web Push 模式使用。
// 執行：npm run web-push:generate-keys
//
// 產出後請把金鑰寫進 Vercel 環境變數（或 .env.local）：
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT       （例如 mailto:you@example.com）
//
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("✅ 已產生 VAPID 金鑰（請勿外流 private key）：\n");
console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
console.log('\n接著設定 VAPID_SUBJECT，例如：\n  VAPID_SUBJECT=mailto:your-email@example.com');
