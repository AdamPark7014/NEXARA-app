import Foundation

struct QueuedMutation: Codable, Identifiable {
    let id: String
    let method: String
    let url: String
    let body: String?
    let contentType: String
}

/// Cola de mutaciones offline — paridad Android `OfflineMutationQueue`.
final class OfflineMutationQueue {
    static let shared = OfflineMutationQueue()

    private let file: URL
    private let queue = DispatchQueue(label: "mx.nexara.offline.queue")

    private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = base.appendingPathComponent("nexara-offline", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        file = dir.appendingPathComponent("mutations.json")
    }

    func load() -> [QueuedMutation] {
        queue.sync {
            guard let data = try? Data(contentsOf: file) else { return [] }
            return (try? JSONDecoder().decode([QueuedMutation].self, from: data)) ?? []
        }
    }

    func enqueue(_ item: QueuedMutation) {
        queue.sync {
            var all = loadUnlocked()
            all.append(item)
            saveUnlocked(all)
        }
        NotificationCenter.default.post(name: .nexaraOfflineQueueChanged, object: nil)
    }

    func removeIds(_ ids: Set<String>) {
        queue.sync {
            var all = loadUnlocked().filter { !ids.contains($0.id) }
            saveUnlocked(all)
        }
    }

    var pendingCount: Int { load().count }

    private func loadUnlocked() -> [QueuedMutation] {
        guard let data = try? Data(contentsOf: file) else { return [] }
        return (try? JSONDecoder().decode([QueuedMutation].self, from: data)) ?? []
    }

    private func saveUnlocked(_ items: [QueuedMutation]) {
        if let data = try? JSONEncoder().encode(items) {
            try? data.write(to: file, options: .atomic)
        }
    }
}
