import Foundation
import SwiftUI

/// Cola de deep links pendientes hasta que el usuario esté en sesión.
@MainActor
final class DeepLinkCoordinator: ObservableObject {
    static let shared = DeepLinkCoordinator()

    @Published private(set) var pending: DeepLinkDestination?

    private init() {}

    func ingest(_ url: URL) {
        pending = DeepLinkParser.parse(url)
    }

    func clear() {
        pending = nil
    }

    /// Módulo pendiente para un panel concreto (se consume al presentar).
    func consumeModule(for panel: PanelId) -> String? {
        guard case .module(let p, let key) = pending, p == panel else { return nil }
        pending = nil
        return key
    }

    func consumeNotifications() -> Bool {
        guard case .notifications = pending else { return false }
        pending = nil
        return true
    }
}

/// Presenta un módulo en full-screen sin duplicar tabs del panel.
struct DeepLinkModulePresenter: ViewModifier {
    let panel: PanelId
    @Binding var presentedKey: String?

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding(
                get: { presentedKey != nil },
                set: { if !$0 { presentedKey = nil } }
            )) {
                if let key = presentedKey {
                    NavigationStack {
                        ModuleRouter.view(for: panel, key: key)
                            .toolbar {
                                ToolbarItem(placement: .cancellationAction) {
                                    Button("Cerrar") { presentedKey = nil }
                                }
                            }
                    }
                }
            }
    }
}

extension View {
    func deepLinkModulePresenter(panel: PanelId, presentedKey: Binding<String?>) -> some View {
        modifier(DeepLinkModulePresenter(panel: panel, presentedKey: presentedKey))
    }
}
