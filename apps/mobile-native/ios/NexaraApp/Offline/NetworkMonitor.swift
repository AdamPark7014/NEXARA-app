import Foundation
import Network

/// Paridad con Android `NetworkMonitor`.
@MainActor
final class NetworkMonitor: ObservableObject {
    static let shared = NetworkMonitor()

    @Published private(set) var isOnline = true

    private let monitor = NWPathMonitor()
    private var started = false

    private init() {}

    func start() {
        guard !started else { return }
        started = true
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                let online = path.status == .satisfied
                let wasOffline = self?.isOnline == false
                self?.isOnline = online
                if online && wasOffline {
                    await OfflineSyncCoordinator.shared.replay()
                }
            }
        }
        monitor.start(queue: DispatchQueue(label: "mx.nexara.network"))
    }
}
