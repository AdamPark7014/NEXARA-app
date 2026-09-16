import Foundation
import Security
import UIKit

/// Usuario en sesión (espejo del `SessionUser` de Android).
struct SessionUser: Codable, Equatable {
    var id: String
    var nombre: String
    var email: String
    var role: String?
    var department: String?
    var token: String
    var permissions: [String]
    var isSuperAdmin: Bool
    var isClient: Bool
    var isBranchUser: Bool
    var clientId: String?
    var branchId: String?
    /// Clave canónica del backend (`mapSessionUser`); prioriza sobre `role`.
    var roleKey: String? = nil
    var orgRoleKey: String? = nil
    /// Paneles de `GET /me/navigation` cuando la sesión los trae.
    var navPanels: [String]? = nil
    /// `moduleKeys` ∪ `webModuleIds` de `GET /me/navigation`: filtran el menú de Core.
    var navModules: [String]? = nil
    /// Tenant activo — se manda como `X-Company-Id` (paridad Android).
    var companyId: Int64? = nil
    /// ISO-8601 de caducidad del JWT; `maybeExtendSession` lo usa.
    var expiresAt: String? = nil
}

/// Almacén seguro de sesión basado en Keychain.
/// Paridad con `AuthRepository` de Android (EncryptedSharedPreferences).
final class SessionStore: ObservableObject {
    static let shared = SessionStore()

    private let service = "mx.nexara.mobile.NexaraApp.session"
    private let account = "currentUser"

    @Published private(set) var currentUser: SessionUser?

    /// Se publica cuando la sesión se recupera del llavero después del arranque.
    static let didRestoreNotification = Notification.Name("SessionStore.didRestore")

    /// Estado de la última lectura del llavero.
    private var lastLoadStatus: OSStatus = errSecSuccess
    /// Observadores activos mientras el llavero siga bloqueado.
    private var unlockObservers: [NSObjectProtocol] = []

    private init() {
        self.currentUser = load()
        if let token = currentUser?.token {
            RealtimeBus.shared.start(token: token)
        }
        if currentUser == nil, lastLoadStatus == errSecInteractionNotAllowed {
            restoreWhenKeychainUnlocks()
        }
    }

    var token: String? { currentUser?.token }

    func save(_ user: SessionUser) {
        currentUser = user
        guard let data = try? JSONEncoder().encode(user) else { return }
        writeKeychain(data)
        QuickProfileStore.remember(user)
        RealtimeBus.shared.start(token: user.token)
        Task { await PushManager.shared.ensureRegisteredAfterLogin() }
    }

    func clear() {
        stopWaitingForUnlock()
        currentUser = nil
        deleteKeychain()
        RealtimeBus.shared.stop()
    }

    // MARK: Llavero bloqueado

    /// Un arranque en segundo plano con el teléfono bloqueado (relanzamiento por
    /// ubicación o por un push) no puede leer el llavero. Eso NO es una sesión
    /// cerrada: se vuelve a leer en cuanto iOS libera los datos protegidos o la
    /// app pasa a primer plano.
    private func restoreWhenKeychainUnlocks() {
        guard unlockObservers.isEmpty else { return }
        let center = NotificationCenter.default
        let names = [
            UIApplication.protectedDataDidBecomeAvailableNotification,
            UIApplication.didBecomeActiveNotification,
        ]
        unlockObservers = names.map { name in
            center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.retryKeychainRestore()
            }
        }
    }

    private func retryKeychainRestore() {
        guard currentUser == nil else {
            stopWaitingForUnlock()
            return
        }
        guard let user = load() else {
            // Sigue bloqueado: se espera al siguiente aviso. Cualquier otro
            // resultado (no hay sesión guardada) termina la espera.
            if lastLoadStatus != errSecInteractionNotAllowed {
                stopWaitingForUnlock()
            }
            return
        }
        stopWaitingForUnlock()
        currentUser = user
        RealtimeBus.shared.start(token: user.token)
        NotificationCenter.default.post(name: SessionStore.didRestoreNotification, object: nil)
    }

    private func stopWaitingForUnlock() {
        for observer in unlockObservers {
            NotificationCenter.default.removeObserver(observer)
        }
        unlockObservers = []
    }

    // MARK: Keychain

    private func writeKeychain(_ data: Data) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        // `AfterFirstUnlock`: legible en segundo plano con el teléfono bloqueado
        // (tras el primer desbloqueo desde que se encendió). Con el valor por
        // defecto (`WhenUnlocked`) un relanzamiento por GPS o push no encontraba
        // la sesión. El `SecItemUpdate` migra también los elementos ya guardados.
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
        if status == errSecItemNotFound {
            var new = query
            new[kSecValueData as String] = data
            new[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(new as CFDictionary, nil)
        }
    }

    private func load() -> SessionUser? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        lastLoadStatus = status
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(SessionUser.self, from: data)
    }

    private func deleteKeychain() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
