import Foundation

/// Replay de mutaciones encoladas al recuperar red.
final class OfflineSyncCoordinator {
    static let shared = OfflineSyncCoordinator()

    private let lock = NSLock()
    private var isReplaying = false
    private let maxAttempts = 8
    private let permanentClient: Set<Int> = [400, 401, 403, 404, 409, 410, 422]

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
        let now = Date().timeIntervalSince1970
        for item in pending {
            if let last = item.lastAttemptAt, item.attempts > 0 {
                let wait = min(300.0, pow(2.0, Double(min(item.attempts, 8))))
                if now - last < wait { continue }
            }
            var req = URLRequest(url: URL(string: item.url)!)
            req.httpMethod = item.method
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.setValue(item.contentType, forHTTPHeaderField: "Content-Type")
            if let body = OfflineMediaStore.shared.expandMediaRefs(item.body) {
                req.httpBody = body.data(using: .utf8)
            }
            do {
                let (_, res) = try await URLSession.shared.data(for: req)
                guard let http = res as? HTTPURLResponse else { continue }
                if (200..<300).contains(http.statusCode) {
                    done.insert(item.id)
                    OfflineMediaStore.shared.purgeRefs(in: item.body)
                } else if permanentClient.contains(http.statusCode) {
                    done.insert(item.id)
                    OfflineMediaStore.shared.purgeRefs(in: item.body)
                } else {
                    let next = item.attempts + 1
                    if next >= maxAttempts {
                        done.insert(item.id)
                        OfflineMediaStore.shared.purgeRefs(in: item.body)
                    } else {
                        var updated = item
                        updated.attempts = next
                        updated.lastAttemptAt = Date().timeIntervalSince1970
                        updated.lastError = "HTTP \(http.statusCode)"
                        OfflineMutationQueue.shared.upsert(updated)
                    }
                }
            } catch {
                let next = item.attempts + 1
                if next >= maxAttempts {
                    done.insert(item.id)
                    OfflineMediaStore.shared.purgeRefs(in: item.body)
                } else {
                    var updated = item
                    updated.attempts = next
                    updated.lastAttemptAt = Date().timeIntervalSince1970
                    updated.lastError = error.localizedDescription
                    OfflineMutationQueue.shared.upsert(updated)
                }
            }
            try? await Task.sleep(nanoseconds: 80_000_000)
        }
        if !done.isEmpty {
            OfflineMutationQueue.shared.removeIds(done)
        }
    }
}
