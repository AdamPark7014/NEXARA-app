import Foundation

/// Perfil de acceso rápido — paridad Android `QuickProfile` / `SessionStore.saveQuickProfile`.
struct QuickProfile: Codable, Identifiable, Equatable {
    let id: String
    let nombre: String
    let email: String
    let role: String?

    var displayName: String { nombre.isEmpty ? email : nombre }
}

enum QuickProfileStore {
    private static let key = "nexara_quick_profiles"
    private static let maxProfiles = 5

    static func load() -> [QuickProfile] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let list = try? JSONDecoder().decode([QuickProfile].self, from: data) else { return [] }
        return list
    }

    static func remember(_ user: SessionUser) {
        var list = load().filter { $0.email.lowercased() != user.email.lowercased() }
        list.insert(QuickProfile(
            id: user.id,
            nombre: user.nombre,
            email: user.email,
            role: user.role
        ), at: 0)
        if list.count > maxProfiles { list = Array(list.prefix(maxProfiles)) }
        if let data = try? JSONEncoder().encode(list) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
