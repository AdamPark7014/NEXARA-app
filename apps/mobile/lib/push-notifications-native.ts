import { isCapacitorNative } from "./capacitor-env";

/**
 * En primer plano, FCM no pinta sola la tarjeta del sistema en todas las versiones.
 * Duplicamos el contenido del push como notificación local (heads-up / bandeja), como cualquier app.
 * En segundo plano / app cerrada, el payload `notification` de FCM sigue siendo el del sistema.
 */
async function ensureAndroidPushMirrorChannel(): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.getPlatform() !== "android") return;
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.createChannel({
      id: "nexara_push_mirror",
      name: "NEXARA",
      description: "Alertas operativas y mensajes del servidor",
      importance: 5,
      visibility: 1,
    });
  } catch {
    /* sin canal no rompe iOS / web */
  }
}

async function presentHeadsUpFromRemotePush(notification: unknown): Promise<void> {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      perm = await LocalNotifications.requestPermissions();
    }
    if (perm.display !== "granted") return;

    await ensureAndroidPushMirrorChannel();

    const n = notification as {
      title?: string;
      body?: string;
      data?: Record<string, unknown>;
    };
    const data = n?.data && typeof n.data === "object" ? n.data : {};
    const title =
      (typeof data.title === "string" && data.title.trim()) ||
      (typeof n?.title === "string" && n.title.trim()) ||
      "NEXARA";
    const body =
      (typeof data.body === "string" && data.body.trim()) ||
      (typeof n?.body === "string" && n.body.trim()) ||
      "";

    const id = Math.abs(Math.floor(Math.random() * 2147483000)) + 1;
    const { Capacitor } = await import("@capacitor/core");
    const payload: Record<string, unknown> = {
      id,
      title,
      body,
      schedule: { at: new Date(Date.now() + 350) },
      extra: { url: typeof data.url === "string" ? data.url : "" },
    };
    if (Capacitor.getPlatform() === "android") {
      payload.channelId = "nexara_push_mirror";
    }

    await LocalNotifications.schedule({
      notifications: [payload as never],
    });
  } catch (e) {
    console.warn("[push] notificación local (primer plano) no disponible", e);
  }
}

/**
 * Registra FCM/APNs y, en primer plano, refleja cada push como notificación del sistema (bandeja superior).
 */
export async function registerNativePushNotifications(
  onToken?: (token: string) => void | Promise<void>,
): Promise<void> {
  if (!isCapacitorNative()) return;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    await PushNotifications.removeAllListeners();

    await ensureAndroidPushMirrorChannel();
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    let localPerm = await LocalNotifications.checkPermissions();
    if (localPerm.display !== "granted") {
      localPerm = await LocalNotifications.requestPermissions();
    }

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return;

    await PushNotifications.addListener("registration", (token) => {
      if (token.value) void Promise.resolve(onToken?.(token.value));
    });

    await PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push] registration error", err);
    });

    await PushNotifications.addListener("pushNotificationReceived", (notification) => {
      void presentHeadsUpFromRemotePush(notification);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("nexara-native-push", { detail: notification }));
      }
    });

    await PushNotifications.register();
  } catch (e) {
    console.warn("[push] native setup unavailable", e);
  }
}
