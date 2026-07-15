type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
  data?: Record<string, unknown>;
};

type PushEventLike = {
  data?: {
    json: () => unknown;
    text: () => string;
  };
  waitUntil: (promise: Promise<unknown>) => void;
};

type ExtendableEventLike = {
  waitUntil: (promise: Promise<unknown>) => void;
};

type NotificationClickEventLike = {
  notification: {
    close: () => void;
    data?: Record<string, unknown>;
  };
  waitUntil: (promise: Promise<unknown>) => void;
};

type WindowClientLike = {
  url: string;
  focus: () => Promise<unknown>;
  navigate: (url: string) => Promise<WindowClientLike | null>;
};

type WorkerNotificationOptions = NotificationOptions & {
  badge?: string;
  renotify?: boolean;
};

type WorkerScopeLike = {
  location: Location;
  skipWaiting: () => Promise<void>;
  registration: {
    showNotification: (title: string, options: WorkerNotificationOptions) => Promise<void>;
  };
  clients: {
    claim: () => Promise<void>;
    matchAll: (options: { type: "window"; includeUncontrolled: boolean }) => Promise<WindowClientLike[]>;
    openWindow: (url: string) => Promise<unknown>;
  };
  addEventListener(type: "install", listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: "activate", listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: "push", listener: (event: PushEventLike) => void): void;
  addEventListener(type: "notificationclick", listener: (event: NotificationClickEventLike) => void): void;
};

const sw = self as unknown as WorkerScopeLike;

sw.addEventListener("install", (event) => {
  event.waitUntil(sw.skipWaiting());
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(sw.clients.claim());
});

sw.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  const title = payload.title || "東京行程提醒";
  const data: Record<string, unknown> & { url: string } = {
    ...(payload.data ?? {}),
    url: normalizeNotificationUrl(payload.url ?? payload.data?.url),
  };
  const notificationType = typeof data.type === "string" ? data.type : "tokyo-trip-reminder";

  event.waitUntil(
    sw.registration.showNotification(title, {
      body: payload.body || "你有新的東京行程提醒",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data,
      tag: notificationType,
      renotify: true,
    }),
  );
});

sw.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = normalizeNotificationUrl(event.notification?.data?.url);

  event.waitUntil(
    sw.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
      const sameOriginClients = clientList.filter((client) => {
        try {
          return new URL(client.url).origin === sw.location.origin;
        } catch {
          return false;
        }
      });
      const exactClient = sameOriginClients.find((client) => {
        const clientUrl = new URL(client.url);
        return `${clientUrl.pathname}${clientUrl.search}${clientUrl.hash}` === targetUrl;
      });

      if (exactClient) return exactClient.focus();

      const reusableClient = sameOriginClients[0];
      if (reusableClient) {
        // Reuse the already-open PWA/tab even when it is showing another
        // category. WindowClient.navigate keeps notification clicks inside
        // the existing app instead of spawning a duplicate window.
        const navigatedClient = await reusableClient.navigate(targetUrl);
        return (navigatedClient ?? reusableClient).focus();
      }

      return sw.clients.openWindow(targetUrl);
    }),
  );
});

function readPushPayload(event: PushEventLike): PushPayload {
  if (!event.data) return {};
  try {
    const parsed = event.data.json();
    return isPushPayload(parsed) ? parsed : {};
  } catch {
    return { body: event.data.text() };
  }
}

function isPushPayload(value: unknown): value is PushPayload {
  return typeof value === "object" && value !== null;
}

function normalizeNotificationUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "/";

  try {
    const url = new URL(value, sw.location.origin);
    return url.origin === sw.location.origin ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}

export {};
