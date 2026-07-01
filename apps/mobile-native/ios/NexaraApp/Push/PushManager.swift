import Foundation
import UIKit
import UserNotifications

/// Configuración de notificaciones push APNs + registro con backend.
final class PushManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PushManager()

    private var pendingDeviceToken: Data?

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

    /// Llamar tras login para registrar token pendiente o solicitar permiso.
    func ensureRegisteredAfterLogin() async {
        await requestPermissionAndRegister()
        if let token = pendingDeviceToken {
            pendingDeviceToken = nil
            await registerDeviceTokenWithBackend(token)
        }
    }

    func registerDeviceTokenWithBackend(_ deviceToken: Data) async {
        guard SessionStore.shared.token != nil else {
            pendingDeviceToken = deviceToken
            return
        }
        let tokenString = deviceToken.map { String(format: "%02x", $0) }.joined()
        struct Body: Encodable { let token: String; let platform: String }
        do {
            _ = try await ApiClient.shared.postJSON(
                "devices/push-token",
                body: Body(token: tokenString, platform: "ios")
            )
        } catch {
            print("PushManager: error registrando token - \(error.localizedDescription)")
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .badge, .sound, .list])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        if let url = userInfo["deepLink"] as? String ?? userInfo["url"] as? String,
           let link = URL(string: url) {
            Task { @MainActor in
                DeepLinkCoordinator.shared.ingest(link)
            }
        }
        completionHandler()
    }
}
