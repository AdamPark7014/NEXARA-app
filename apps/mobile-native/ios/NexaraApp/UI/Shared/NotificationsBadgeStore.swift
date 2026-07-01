import Combine
import Foundation

/// Contador global de no leídas para el hub de paneles (badge).
@MainActor
final class NotificationsBadgeStore: ObservableObject {
    static let shared = NotificationsBadgeStore()

    @Published private(set) var unreadCount = 0

    private var cancellable: AnyCancellable?
    private var lastRefreshAt: TimeInterval = 0

    private init() {
        cancellable = RealtimeBus.shared.events
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                let model = event.model?.lowercased() ?? ""
                guard model.isEmpty || model == "notification" else { return }
                Task { await self?.refresh() }
            }
    }

    func refresh() async {
        let now = Date().timeIntervalSince1970
        if now - lastRefreshAt < 0.75 { return }
        lastRefreshAt = now
        unreadCount = (try? await NotificationsRepository.shared.unreadCount()) ?? unreadCount
    }
}
