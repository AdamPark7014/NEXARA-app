import Foundation
import SwiftUI

/// Cola de deep links pendientes hasta que el usuario esté en sesión.
@MainActor
final class DeepLinkCoordinator: ObservableObject {
    static let shared = DeepLinkCoordinator()

    @Published private(set) var pending: DeepLinkDestination?

    private init() {}

    func ingest(_ url: URL) {
        if let destination = DeepLinkParser.parse(url) {
            pending = destination
        }
    }

    /// Destino ya resuelto (toque en un push o en la bandeja de notificaciones).
    func ingest(destination: DeepLinkDestination) {
        pending = destination
    }

    func clear() {
        pending = nil
    }

    /// Lo consume el shell de Core. El personal nunca ve el portal externo:
    /// un enlace de `/tickets` abre Actividades.
    func consumeCore() -> DeepLinkDestination? {
        guard let destination = pending else { return nil }
        pending = nil
        if case .portal = destination { return .core(CoreLink.home) }
        return destination
    }

    /// Lo consume el portal de clientes; lo de Core se descarta.
    func consumePortal() -> (key: String, entityId: Int64?)? {
        guard let destination = pending else { return nil }
        pending = nil
        if case .portal(let key, let entityId) = destination { return (key, entityId) }
        return nil
    }
}
