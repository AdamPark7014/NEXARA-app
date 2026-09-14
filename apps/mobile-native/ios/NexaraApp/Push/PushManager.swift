import Foundation
import UIKit
import UserNotifications
#if canImport(FirebaseCore) && canImport(FirebaseMessaging)
import FirebaseCore
import FirebaseMessaging
#endif

/// Notificaciones push.
///
/// El API envía con firebase-admin (FCM), y FCM no acepta tokens APNs crudos:
/// por eso el token que se registra en `POST devices/push-token` es el de FCM,
/// que Firebase obtiene a partir del token APNs. Si el binario se construyó sin
/// `GoogleService-Info.plist`, Firebase no se configura y se registra el token
/// APNs como antes (la app funciona, pero esos push no llegan).
final class PushManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PushManager()

    /// `true` cuando Firebase quedó configurado en este arranque.
    private(set) var firebaseEnabled = false
    /// Token recibido antes de iniciar sesión.
    private var pendingToken: String?

    func configure() {
        UNUserNotificationCenter.current().delegate = self
        #if canImport(FirebaseCore) && canImport(FirebaseMessaging)
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            if FirebaseApp.app() == nil {
                FirebaseApp.configure()
            }
            Messaging.messaging().delegate = self
            firebaseEnabled = true
        } else {
            print("PushManager: sin GoogleService-Info.plist; se usa el token APNs crudo.")
        }
        #endif
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

    /// Llamar tras login: pide permiso y registra el token vigente.
    func ensureRegisteredAfterLogin() async {
        await requestPermissionAndRegister()
        #if canImport(FirebaseCore) && canImport(FirebaseMessaging)
        if firebaseEnabled {
            do {
                let token = try await Messaging.messaging().token()
                pendingToken = nil
                await sendTokenToBackend(token)
            } catch {
                // Aún sin token APNs: el de FCM llegará por `didReceiveRegistrationToken`.
                if let token = pendingToken {
                    pendingToken = nil
                    await sendTokenToBackend(token)
                }
            }
            return
        }
        #endif
        if let token = pendingToken {
            pendingToken = nil
            await sendTokenToBackend(token)
        }
    }

    /// Token APNs del sistema. Con Firebase se le entrega a Messaging; sin él, se registra crudo.
    func didRegisterForRemoteNotifications(deviceToken: Data) {
        #if canImport(FirebaseCore) && canImport(FirebaseMessaging)
        if firebaseEnabled {
            Messaging.messaging().apnsToken = deviceToken
            return
        }
        #endif
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { await self.sendTokenToBackend(hex) }
    }

    /// Compatibilidad con llamadas anteriores.
    func registerDeviceTokenWithBackend(_ deviceToken: Data) async {
        didRegisterForRemoteNotifications(deviceToken: deviceToken)
    }

    fileprivate func sendTokenToBackend(_ token: String) async {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard SessionStore.shared.token != nil else {
            pendingToken = trimmed
            return
        }
        struct Body: Encodable {
            let token: String
            let platform: String
        }
        do {
            _ = try await ApiClient.shared.postJSON(
                "devices/push-token",
                body: Body(token: trimmed, platform: "ios")
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

    /// Toque en la notificación: `url`/`relatedUrl` → `entityType` + `relatedEntityId` → `category`.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        if let destination = NotificationDeepLinkResolver.resolve(userInfo: userInfo) {
            Task { @MainActor in
                DeepLinkCoordinator.shared.ingest(destination: destination)
            }
        }
        completionHandler()
    }
}

#if canImport(FirebaseCore) && canImport(FirebaseMessaging)
extension PushManager: MessagingDelegate {
    /// Llega al arrancar y cada vez que FCM rota el token.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken, !fcmToken.isEmpty else { return }
        Task { await self.sendTokenToBackend(fcmToken) }
    }
}
#endif
