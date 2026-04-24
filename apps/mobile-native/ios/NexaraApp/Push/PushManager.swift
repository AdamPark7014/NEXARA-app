import Foundation
import UIKit
import UserNotifications

/// Configuración de notificaciones push APNs + registro con backend.
/// En el siguiente paso (dentro de Mac) se conectará con Firebase Messaging
/// iOS para mapear APNs <-> FCM token.
final class PushManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PushManager()

    func configure() {
        UNUserNotificationCenter.current().delegate = self
    }

    func requestPermissionAndRegister() async {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            if granted {
                await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
            }
        } catch {
            print("PushManager: permiso denegado - \(error.localizedDescription)")
        }
    }

    /// Registra el APNs token en el backend (POST /devices/push-token).
    func registerDeviceTokenWithBackend(_ deviceToken: Data) async {
        guard !SessionStore.shared.token.isEmpty else { return }
        let tokenString = deviceToken.map { String(format: "%02x", $0) }.joined()
        struct Body: Encodable { let token: String; let platform: String }
        do {
            let _: [String: String]? = try? await ApiClient.shared.postJSON(
                path: "devices/push-token",
                body: Body(token: tokenString, platform: "ios")
            )
            print("PushManager: token registrado ✓")
        }
    }

    // Presentar banners en foreground.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .badge, .sound, .list])
    }
}
