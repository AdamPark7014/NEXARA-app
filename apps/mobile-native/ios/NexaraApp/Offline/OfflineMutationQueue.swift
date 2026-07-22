import Foundation

struct QueuedMutation: Codable, Identifiable {
    let id: String
    let method: String
    let url: String
    let body: String?
    let contentType: String
    var attempts: Int
    var lastAttemptAt: Double?
    var lastError: String?

    init(
        id: String,
        method: String,
        url: String,
        body: String?,
        contentType: String,
        attempts: Int = 0,
        lastAttemptAt: Double? = nil,
        lastError: String? = nil
    ) {
        self.id = id
        self.method = method
        self.url = url
        self.body = body
        self.contentType = contentType
        self.attempts = attempts
        self.lastAttemptAt = lastAttemptAt
        self.lastError = lastError
    }

    enum CodingKeys: String, CodingKey {
        case id, method, url, body, contentType, attempts, lastAttemptAt, lastError
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        method = try c.decode(String.self, forKey: .method)
        url = try c.decode(String.self, forKey: .url)
        body = try c.decodeIfPresent(String.self, forKey: .body)
        contentType = try c.decodeIfPresent(String.self, forKey: .contentType) ?? "application/json"
        attempts = try c.decodeIfPresent(Int.self, forKey: .attempts) ?? 0
        lastAttemptAt = try c.decodeIfPresent(Double.self, forKey: .lastAttemptAt)
        lastError = try c.decodeIfPresent(String.self, forKey: .lastError)
    }
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

    func upsert(_ item: QueuedMutation) {
        queue.sync {
            var all = loadUnlocked()
            if let idx = all.firstIndex(where: { $0.id == item.id }) {
                all[idx] = item
            } else {
                all.append(item)
            }
            saveUnlocked(all)
        }
        NotificationCenter.default.post(name: .nexaraOfflineQueueChanged, object: nil)
    }

    func removeIds(_ ids: Set<String>) {
        queue.sync {
            let all = loadUnlocked().filter { !ids.contains($0.id) }
            saveUnlocked(all)
        }
        NotificationCenter.default.post(name: .nexaraOfflineQueueChanged, object: nil)
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
