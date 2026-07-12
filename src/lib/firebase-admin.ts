/**
 * Firebase Admin SDK 單例
 *
 * 在 Next.js server 環境中只初始化一次，
 * 提供 admin.messaging() 給 /api/push/send 使用。
 *
 * 環境變數（Vercel 或 .env.local）：
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY   ← 注意：實體 .p8 不放，改用環境變數
 *
 * 若環境變數未設定，呼叫會回傳 null，
 * /api/push/send 會回 503 表示推播未設定。
 */
import type { App, ServiceAccount } from "firebase-admin/app";
import type { Messaging } from "firebase-admin/messaging";

let app: App | null = null;
let messaging: Messaging | null = null;
let initError: string | null = null;

async function getAdmin() {
  if (app && messaging) return { app, messaging };
  if (initError) return { app: null, messaging: null, initError };

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY?.trim();

  if (!projectId || !clientEmail || !privateKeyRaw) {
    initError = "缺少 FIREBASE_* 環境變數";
    return { app: null, messaging: null, initError };
  }

  // 把環境變數裡的 \n 還原為真正的換行
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  try {
    const admin = await import("firebase-admin/app");
    const messagingMod = await import("firebase-admin/messaging");
    const serviceAccount: ServiceAccount = {
      projectId,
      clientEmail,
      privateKey,
    };
    app = admin.initializeApp(
      { credential: admin.cert(serviceAccount) },
      "tokyo-trip-push",
    );
    messaging = messagingMod.getMessaging(app);
    return { app, messaging };
  } catch (e) {
    initError = e instanceof Error ? e.message : String(e);
    return { app: null, messaging: null, initError };
  }
}

export async function getMessagingSafe() {
  return getAdmin();
}

export type AdminMessaging = NonNullable<Awaited<ReturnType<typeof getAdmin>>["messaging"]>;
