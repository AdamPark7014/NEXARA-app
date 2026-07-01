import Foundation

/// Replay de mutaciones encoladas al recuperar red.
final class OfflineSyncCoordinator {
    static let shared = OfflineSyncCoordinator()

    private let lock = NSLock()
    private var isReplaying = false

    private init() {}

    func replay() async {
        lock.lock()
        if isReplaying { lock.unlock(); return }
        isReplaying = true
        lock.unlock()
        defer {
            lock.lock()
            isReplaying = false
            lock.unlock()
        }

        guard await NetworkMonitor.shared.isOnline else { return }
        guard let token = SessionStore.shared.token, !token.isEmpty else { return }

        let pending = OfflineMutationQueue.shared.load()
        guard !pending.isEmpty else { return }

        var done = Set<String>()
        for item in pending {
            var req = URLRequest(url: URL(string: item.url)!)
            req.httpMethod = item.method
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.setValue(item.contentType, forHTTPHeaderField: "Content-Type")
            if let body = item.body { req.httpBody = body.data(using: .utf8) }
            do {
                let (_, res) = try await URLSession.shared.data(for: req)
                if let http = res as? HTTPURLResponse, (200..<300).contains(http.statusCode) || (400..<500).contains(http.statusCode) {
                    done.insert(item.id)
                }
            } catch { continue }
        }
        if !done.isEmpty {
            OfflineMutationQueue.shared.removeIds(done)
        }
    }
}
