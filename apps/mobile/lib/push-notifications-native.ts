import { isCapacitorNative } from "./capacitor-env";

function worstNotificationPermission(
  a: "granted" | "denied" | "prompt",
  b: "granted" | "denied" | "prompt",
): "granted" | "denied" | "prompt" {
  if (a === "denied" || b === "denied") return "denied";
  if (a === "prompt" || b === "prompt") return "prompt";
  return "granted";
}

/**
 * Crea el canal de notificaciones Android y solicita permiso LOCAL (independiente de Firebase/FCM).
 * Devuelve el estado del permiso para que la UI pueda reaccionar si el usuario lo denegó.
 */
export async function ensureLocalNotificationPermission(): Promise<"granted" | "denied" | "prompt"> {
  if (!isCapacitorNative()) return "granted";
  try {
    const { Capacitor } = await import("@capacitor/core");
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    // Android 8+ requiere canal antes de mostrar notificaciones
    if (Capacitor.getPlatform() === "android") {
      await LocalNotifications.createChannel({
        id: "nexara_push_mirror",
        name: "NEXARA",
        description: "Alertas operativas y mensajes del servidor",
        importance: 5,
        visibility: 1,
      });
    }
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      perm = await LocalNotifications.requestPermissions();
    }
    return perm.display as "granted" | "denied" | "prompt";
  } catch (e) {
    console.warn("[push] permiso local no disponible", e);
    return "prompt";
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

    // Canal ya fue creado por ensureLocalNotificationPermission; re-crear es idempotente
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.getPlatform() === "android") {
      await LocalNotifications.createChannel({
        id: "nexara_push_mirror",
        name: "NEXARA",
        description: "Alertas operativas y mensajes del servidor",
        importance: 5,
        visibility: 1,
      });
    }

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
 * Primero configura LOCAL notifications de forma independiente (funciona sin Firebase).
 * Devuelve el estado del permiso de notificaciones para que la UI pueda reaccionar.
 */
export async function registerNativePushNotifications(
  onToken?: (token: string) => void | Promise<void>,
): Promise<"granted" | "denied" | "prompt"> {
  if (!isCapacitorNative()) return "granted";

  // ── Paso 1: Notificaciones LOCALES (independiente de Firebase) ──────────────
  const localPerm = await ensureLocalNotificationPermission();

  // ── Paso 2: Push / FCM (requiere google-services.json; falla silenciosamente sin él) ──
  let pushPermResolved: "granted" | "denied" | "prompt" | null = null;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.removeAllListeners();

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      perm = await PushNotifications.requestPermissions();
    }
    pushPermResolved = perm.receive as "granted" | "denied" | "prompt";
    if (perm.receive !== "granted") {
      return worstNotificationPermission(localPerm, pushPermResolved);
    }

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
    // Sin google-services.json → FCM no disponible. Notificaciones locales siguen funcionando.
    console.warn("[push] FCM/APNs no disponible (¿falta google-services.json?)", e);
  }

  return worstNotificationPermission(localPerm, pushPermResolved ?? "granted");
}
