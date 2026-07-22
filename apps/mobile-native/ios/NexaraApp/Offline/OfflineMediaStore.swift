import Foundation

/// Persiste blobs de media (data URLs) en disco para no inflar la cola JSON offline.
/// Usa referencias `nexara-media://{id}` en el body encolado y las reexpande al replay.
final class OfflineMediaStore {
    static let shared = OfflineMediaStore()

    private let dir: URL
    private let queue = DispatchQueue(label: "mx.nexara.offline.media")

    private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        dir = base.appendingPathComponent("nexara-offline-media", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    func externalizeDataUrls(_ body: String?) -> String? {
        guard var body, body.contains("data:") else { return body }
        let pattern = #"data:([\w/+.-]+);base64,([A-Za-z0-9+/=\r\n]+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return body }
        let ns = body as NSString
        let matches = regex.matches(in: body, range: NSRange(location: 0, length: ns.length))
        for match in matches.reversed() {
            guard match.numberOfRanges >= 3,
                  let mimeRange = Range(match.range(at: 1), in: body),
                  let b64Range = Range(match.range(at: 2), in: body),
                  let fullRange = Range(match.range, in: body)
            else { continue }
            let mime = String(body[mimeRange])
            let b64 = String(body[b64Range])
            guard let id = saveBase64(b64, mime: mime) else { continue }
            body.replaceSubrange(fullRange, with: "nexara-media://\(id)")
        }
        return body
    }

    func expandMediaRefs(_ body: String?) -> String? {
        guard var body, body.contains("nexara-media://") else { return body }
        let pattern = #"nexara-media://([0-9a-fA-F\-]{36})"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return body }
        let ns = body as NSString
        let matches = regex.matches(in: body, range: NSRange(location: 0, length: ns.length))
        for match in matches.reversed() {
            guard match.numberOfRanges >= 2,
                  let idRange = Range(match.range(at: 1), in: body),
                  let fullRange = Range(match.range, in: body)
            else { continue }
            let id = String(body[idRange])
            guard let dataUrl = loadAsDataUrl(id) else { continue }
            body.replaceSubrange(fullRange, with: dataUrl)
        }
        return body
    }

    func purgeRefs(in body: String?) {
        guard let body, body.contains("nexara-media://") else { return }
        let pattern = #"nexara-media://([0-9a-fA-F\-]{36})"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return }
        let ns = body as NSString
        for match in regex.matches(in: body, range: NSRange(location: 0, length: ns.length)) {
            guard match.numberOfRanges >= 2,
                  let idRange = Range(match.range(at: 1), in: body)
            else { continue }
            delete(String(body[idRange]))
        }
    }

    private func saveBase64(_ b64: String, mime: String) -> String? {
        queue.sync {
            guard let data = Data(base64Encoded: b64, options: [.ignoreUnknownCharacters]) else { return nil }
            let id = UUID().uuidString
            let file = dir.appendingPathComponent(id)
            let mimeFile = dir.appendingPathComponent("\(id).mime")
            do {
                try data.write(to: file, options: .atomic)
                try mime.data(using: .utf8)?.write(to: mimeFile, options: .atomic)
                return id
            } catch {
                return nil
            }
        }
    }

    private func loadAsDataUrl(_ id: String) -> String? {
        queue.sync {
            let file = dir.appendingPathComponent(id)
            guard let data = try? Data(contentsOf: file) else { return nil }
            let mime = (try? String(contentsOf: dir.appendingPathComponent("\(id).mime"), encoding: .utf8))?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                ?? "application/octet-stream"
            return "data:\(mime);base64,\(data.base64EncodedString())"
        }
    }

    private func delete(_ id: String) {
        queue.sync {
            try? FileManager.default.removeItem(at: dir.appendingPathComponent(id))
            try? FileManager.default.removeItem(at: dir.appendingPathComponent("\(id).mime"))
        }
    }
}
