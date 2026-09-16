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
    /// Último registro enviado a `devices/push-token` (token push + sesión).
    /// `SessionStore.save` llama a `ensureRegisteredAfterLogin` en cada guardado;
    /// solo se repite el POST si cambia el token de push, el usuario o el token
    /// de sesión (login nuevo o renovación).
    private var lastRegistrationKey: String?
    private let registrationLock = NSLock()

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

    /// Pide permiso de avisos (alerta, sonido, globo) solo si aún no se ha
    /// decidido y registra el dispositivo en APNs. `prompt: false` no muestra el
    /// diálogo (arranque sin sesión): el permiso se pide al iniciar sesión.
    func requestPermissionAndRegister(prompt: Bool = true) async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            guard prompt else { return }
            do {
                _ = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            } catch {
                print("PushManager: permiso denegado - \(error.localizedDescription)")
            }
        }
        // Se registra aunque la persona haya negado los avisos: si luego los
        // activa en Ajustes, el servidor ya tiene a dónde mandarlos.
        await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
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
        guard let session = SessionStore.shared.currentUser, !session.token.isEmpty else {
            pendingToken = trimmed
            return
        }
        let key = "\(trimmed)|\(session.id)|\(session.token.hashValue)"
        guard claimRegistration(key) else { return }
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
            releaseRegistration(key)
            print("PushManager: error registrando token - \(error.localizedDescription)")
        }
    }

    /// `true` si este registro aún no se ha enviado (y lo marca como enviado).
    private func claimRegistration(_ key: String) -> Bool {
        registrationLock.lock()
        defer { registrationLock.unlock() }
        if lastRegistrationKey == key { return false }
        lastRegistrationKey = key
        return true
    }

    /// El POST falló: el siguiente guardado de sesión lo vuelve a intentar.
    private func releaseRegistration(_ key: String) {
        registrationLock.lock()
        defer { registrationLock.unlock() }
        if lastRegistrationKey == key { lastRegistrationKey = nil }
    }

    /// Aviso con la app abierta: SIEMPRE banner + bandeja + sonido + globo, como
    /// WhatsApp. Única excepción: un mensaje de chat (`kind=chat`) de la misma
    /// conversación que la persona tiene abierta en pantalla.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // La campana del shell se refresca con cada push, no solo cada 45 s.
        Task { @MainActor in await NotificationsBadgeStore.shared.refresh() }
        let content = notification.request.content
        if Self.isChat(content.userInfo),
           let channelId = Self.chatChannelId(userInfo: content.userInfo, threadIdentifier: content.threadIdentifier),
           ActiveConversation.shared.isOpen(channelId) {
            completionHandler([])
            return
        }
        completionHandler([.banner, .list, .sound, .badge])
    }

    /// Toque en la notificación: `url`/`relatedUrl` → `entityType` + `relatedEntityId` → `category`.
    /// Un chat sin `url` abre su conversación por `thread_id`.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let content = response.notification.request.content
        let userInfo = content.userInfo
        Task { @MainActor in await NotificationsBadgeStore.shared.refresh() }
        var destination = NotificationDeepLinkResolver.resolve(userInfo: userInfo)
        if Self.isChat(userInfo), Self.lacksChatChannel(destination) {
            let channelId = Self.chatChannelId(userInfo: userInfo, threadIdentifier: content.threadIdentifier)
            if channelId != nil || destination == nil {
                let messageId = Self.text(userInfo, "message_id").flatMap { Int64($0) }
                destination = .core(CoreLink(module: .chat, chatChannelId: channelId, chatMessageId: messageId))
            }
        }
        if let destination {
            Task { @MainActor in
                DeepLinkCoordinator.shared.ingest(destination: destination)
            }
        }
        completionHandler()
    }

    // MARK: Datos del push

    private static func text(_ userInfo: [AnyHashable: Any], _ key: String) -> String? {
        let value = userInfo[AnyHashable(key)]
        if let string = value as? String {
            let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        if let number = value as? NSNumber {
            return number.stringValue
        }
        return nil
    }

    private static func isChat(_ userInfo: [AnyHashable: Any]) -> Bool {
        text(userInfo, "kind")?.lowercased() == "chat"
    }

    /// Sin destino, o un chat genérico sin canal: vale la pena usar `thread_id`.
    private static func lacksChatChannel(_ destination: DeepLinkDestination?) -> Bool {
        guard let destination else { return true }
        if case .core(let link) = destination, link.module == .chat, link.chatChannelId == nil {
            return true
        }
        return false
    }

    /// Canal de chat del push: primero la ruta `url` (`/erp/chat/:id`), luego
    /// `thread_id` (o el `thread-id` de APNs) si es un id numérico, con o sin
    /// prefijo (`12`, `chat:12`, `chat-12`).
    private static func chatChannelId(userInfo: [AnyHashable: Any], threadIdentifier: String) -> Int64? {
        if let url = text(userInfo, "url") ?? text(userInfo, "relatedUrl"),
           case .core(let link)? = DeepLinkParser.parseWebPath(url),
           link.module == .chat,
           let id = link.chatChannelId, id > 0 {
            return id
        }
        let candidates = [text(userInfo, "thread_id"), threadIdentifier.isEmpty ? nil : threadIdentifier]
        for raw in candidates.compactMap({ $0 }) {
            if let id = numericThreadId(raw) { return id }
        }
        return nil
    }

    /// `12` / `chat:12` / `chat-12` / `chat_channel_12` → 12. Con más de un número
    /// (p. ej. `dm-3-9`) no se adivina: `nil`, y el aviso se muestra.
    private static func numericThreadId(_ raw: String) -> Int64? {
        let parts = raw.split(whereSeparator: { !$0.isNumber })
        guard parts.count == 1, let last = raw.last, last.isNumber,
              let id = Int64(parts[0]), id > 0 else {
            return nil
        }
        return id
    }
}

/// Conversación de chat abierta en pantalla. La fija y la limpia `ChatView`;
/// `PushManager` la consulta para no mostrar el aviso de esa misma conversación.
/// Con candado porque `willPresent` puede llegar desde cualquier hilo.
final class ActiveConversation: @unchecked Sendable {
    static let shared = ActiveConversation()

    private let lock = NSLock()
    private var channelId: Int64?

    private init() {}

    func set(_ id: Int64?) {
        lock.lock()
        defer { lock.unlock() }
        if let id, id > 0 {
            channelId = id
        } else {
            channelId = nil
        }
    }

    func clear() {
        set(nil)
    }

    func isOpen(_ id: Int64) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return id > 0 && channelId == id
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
