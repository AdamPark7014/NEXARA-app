import Foundation
import Security

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
}

/// Almacén seguro de sesión basado en Keychain.
/// Paridad con `AuthRepository` de Android (EncryptedSharedPreferences).
final class SessionStore: ObservableObject {
    static let shared = SessionStore()

    private let service = "mx.nexara.mobile.NexaraApp.session"
    private let account = "currentUser"

    @Published private(set) var currentUser: SessionUser?

    private init() {
        self.currentUser = load()
        if let token = currentUser?.token {
            RealtimeBus.shared.start(token: token)
        }
    }

    var token: String? { currentUser?.token }

    func save(_ user: SessionUser) {
        currentUser = user
        guard let data = try? JSONEncoder().encode(user) else { return }
        writeKeychain(data)
        QuickProfileStore.remember(user)
        RealtimeBus.shared.start(token: user.token)
    }

    func clear() {
        currentUser = nil
        deleteKeychain()
        RealtimeBus.shared.stop()
    }

    // MARK: Keychain

    private func writeKeychain(_ data: Data) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let attrs: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
        if status == errSecItemNotFound {
            var new = query
            new[kSecValueData as String] = data
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
