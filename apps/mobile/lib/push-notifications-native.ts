import { isCapacitorNative } from "./capacitor-env";

/**
 * Registers for device push (FCM / APNs). You still need:
 * - Android: `google-services.json` + Firebase in the Android project
 * - iOS: push capability + APNs key in Apple Developer
 * - Backend: endpoint to store the token per user
 */
export async function registerNativePushNotifications(
  onToken?: (token: string) => void | Promise<void>,
): Promise<void> {
  if (!isCapacitorNative()) return;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    await PushNotifications.removeAllListeners();

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
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("nexara-native-push", { detail: notification }));
      }
    });

    await PushNotifications.register();
  } catch (e) {
    console.warn("[push] native setup unavailable", e);
  }
}
