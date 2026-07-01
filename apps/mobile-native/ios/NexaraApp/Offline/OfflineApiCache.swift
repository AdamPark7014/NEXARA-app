import Foundation

/// Cache GET JSON — paridad Android `OfflineApiCache`.
final class OfflineApiCache {
    static let shared = OfflineApiCache()

    private let dir: URL
    private let queue = DispatchQueue(label: "mx.nexara.offline.cache")

    private init() {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        dir = base.appendingPathComponent("nexara-api-cache", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    private func key(url: String, authTag: String) -> String {
        let raw = "\(authTag)|\(url)"
        return raw.data(using: .utf8)?.base64EncodedString()
            .replacingOccurrences(of: "/", with: "_") ?? UUID().uuidString
    }

    func get(url: String, authTag: String) -> Data? {
        queue.sync {
            let file = dir.appendingPathComponent(key(url: url, authTag: authTag))
            return try? Data(contentsOf: file)
        }
    }

    func put(url: String, authTag: String, data: Data) {
        queue.async {
            let file = self.dir.appendingPathComponent(self.key(url: url, authTag: authTag))
            try? data.write(to: file, options: .atomic)
        }
    }
}
