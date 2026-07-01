import SwiftUI
import Combine

/// Refresca una vista cuando el backend emite `entity:updated` para los modelos indicados.
struct RealtimeRefreshModifier: ViewModifier {
    let models: Set<String>
    let throttleSeconds: TimeInterval
    let refresh: () async -> Void

    @State private var lastRefresh: Date = .distantPast

    func body(content: Content) -> some View {
        content.onReceive(RealtimeBus.shared.events) { ev in
            let normalized = Set(models.map { $0.lowercased() })
            guard let model = ev.model?.lowercased(), normalized.contains(model) else { return }
            let now = Date()
            guard now.timeIntervalSince(lastRefresh) >= throttleSeconds else { return }
            lastRefresh = now
            Task { await refresh() }
        }
    }
}

extension View {
    func refreshOnModels(_ models: Set<String>, throttleSeconds: TimeInterval = 0.9, refresh: @escaping () async -> Void) -> some View {
        modifier(RealtimeRefreshModifier(models: models, throttleSeconds: throttleSeconds, refresh: refresh))
    }
}
