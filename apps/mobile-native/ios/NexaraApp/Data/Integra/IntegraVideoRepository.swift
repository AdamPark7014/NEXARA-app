import Foundation

// MARK: - Camera / stream models
// Honest: preview frames via go2rtc JPEG — NOT live MSE. No "EN VIVO" labels.

struct IntegraCamera {
    let id: String
    let name: String
    let region: String?
    let status: String?
    let isPtz: Bool
    let hasAudio: Bool
    let isDoorCamera: Bool
    let sourceIp: String?
    let model: String?
    let channelNumber: Int?

    /// Same rule as web `onlineish`: missing status is NOT offline.
    var online: Bool {
        let s = (status ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        switch s {
        case "", "1", "online": return true
        case "0", "offline": return false
        default:
            if let d = Double(s) { return Int(d) == 1 }
            return false
        }
    }

    static func fromMap(_ m: [String: Any]) -> IntegraCamera? {
        guard let id = m.integraStr("id", "cameraIndexCode", "indexCode") else { return nil }
        return IntegraCamera(
            id: id,
            name: m.integraStr("name", "cameraName") ?? id,
            region: m.integraStr("region", "regionName"),
            status: m.integraStr("status"),
            isPtz: m.integraBool("isPtz") ?? false,
            hasAudio: m.integraBool("hasAudio") ?? false,
            isDoorCamera: m.integraBool("isDoorCamera") ?? false,
            sourceIp: m.integraStr("sourceIp"),
            model: m.integraStr("model"),
            channelNumber: m.integraInt("channelNumber")
        )
    }
}

/// What the server opened for one camera. `ok` does not guarantee an image.
struct IntegraStreamSlot {
    let cameraId: String
    let ok: Bool
    let hls: String?
    let rtsp: String?
    let provider: String?
    let note: String?
    let error: String?
    let hasAudio: Bool?

    static func fromBatchItem(_ m: [String: Any]) -> IntegraStreamSlot? {
        guard let id = m.integraStr("cameraIndexCode", "id") else { return nil }
        let stream = IntegraJSON.asMap(m["stream"])
        return IntegraStreamSlot(
            cameraId: id,
            ok: m.integraBool("ok") ?? (stream != nil),
            hls: stream?.integraStr("hls"),
            rtsp: stream?.integraStr("rtsp"),
            provider: stream?.integraStr("provider"),
            note: stream?.integraStr("note"),
            error: m.integraStr("error"),
            hasAudio: stream?.integraBool("hasAudio")
        )
    }

    static func fromSingle(cameraId: String, _ m: [String: Any]) -> IntegraStreamSlot {
        IntegraStreamSlot(
            cameraId: m.integraStr("cameraIndexCode") ?? cameraId,
            ok: true,
            hls: m.integraStr("hls"),
            rtsp: m.integraStr("rtsp"),
            provider: m.integraStr("provider"),
            note: m.integraStr("note"),
            error: nil,
            hasAudio: m.integraBool("hasAudio")
        )
    }
}

/// Why a cell cannot paint an image. Empty string = it can.
func motivoSinImagen(_ slot: IntegraStreamSlot?) -> String {
    guard let slot else {
        return "El servidor no devolvió estado para esta cámara."
    }
    if !slot.ok {
        if let e = slot.error, !e.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return e
        }
        return "El sitio rechazó abrir esta cámara."
    }
    if let p = slot.provider, p.caseInsensitiveCompare("HCT") == .orderedSame {
        return "Sitio en la nube (HCT): su video no pasa por go2rtc y no entrega " +
            "fotogramas sueltos. Se ve solo desde la web."
    }
    if slot.hls?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
        if let n = slot.note, !n.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return n
        }
        return "El sitio no publicó un stream para esta cámara."
    }
    if Go2rtcFrame.parseHls(slot.hls) == nil {
        return "La URL de video que devolvió el servidor no tiene el formato " +
            "esperado; no se puede derivar el fotograma."
    }
    return ""
}

struct IntegraPtzPreset {
    let id: Int
    let name: String

    static func fromMap(_ m: [String: Any]) -> IntegraPtzPreset? {
        guard let id = m.integraInt("id", "presetId"),
              let name = m.integraStr("name", "presetName") else { return nil }
        return IntegraPtzPreset(id: id, name: name)
    }
}

/// Capture is saved on the device; returned URL is often LAN-only.
struct IntegraCaptureResult {
    let picUrl: String?
    let raw: [String: Any]

    static func fromMap(_ m: [String: Any]) -> IntegraCaptureResult {
        let data = IntegraJSON.asMap(m["data"]) ?? m
        return IntegraCaptureResult(
            picUrl: data.integraStr("picUrl", "url", "picurl", "imageUrl"),
            raw: m
        )
    }
}

// MARK: - go2rtc frame derivation (preview JPEG, not live MSE)

enum Go2rtcFrame {
    private static let hlsSuffix = "/api/stream.m3u8"
    private static let framePath = "/api/frame.jpeg"

    struct Parsed {
        let base: String
        let streamName: String
    }

    /// `https://host/go2rtc/api/stream.m3u8?src=cam_x` → base + stream name.
    static func parseHls(_ hls: String?) -> Parsed? {
        let raw = (hls ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty, let url = URL(string: raw) else { return nil }
        let scheme = (url.scheme ?? "").lowercased()
        guard scheme == "http" || scheme == "https" else { return nil }
        guard let host = url.host, !host.isEmpty else { return nil }
        let path = url.path
        guard path.hasSuffix(hlsSuffix) else { return nil }
        guard let streamName = queryParam(url: url, name: "src"),
              !streamName.isEmpty else { return nil }
        let basePath = String(path.dropLast(hlsSuffix.count))
        let port = url.port.map { ":\($0)" } ?? ""
        return Parsed(base: "\(scheme)://\(host)\(port)\(basePath)", streamName: streamName)
    }

    static func frameUrl(hls: String?, nonce: Int64) -> String? {
        guard let parsed = parseHls(hls) else { return nil }
        return frameUrl(parsed: parsed, nonce: nonce)
    }

    static func frameUrl(parsed: Parsed, nonce: Int64) -> String {
        let encoded = parsed.streamName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)?
            .replacingOccurrences(of: "+", with: "%20") ?? parsed.streamName
        return "\(parsed.base)\(framePath)?src=\(encoded)&t=\(nonce)"
    }

    private static func queryParam(url: URL, name: String) -> String? {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == name })?
            .value
    }
}

/// Self-paced frame refresh — never a fixed timer (parity with Android FramePacing).
enum FramePacing {
    static let minGapMs: Int64 = 900
    static let maxBackoffMs: Int64 = 15_000

    static func nextDelayMs(consecutiveFailures: Int) -> Int64 {
        if consecutiveFailures <= 0 { return minGapMs }
        let shift = min(consecutiveFailures, 6)
        let backoff = minGapMs << shift
        return min(backoff, maxBackoffMs)
    }
}

// MARK: - Repository

final class IntegraVideoRepository {
    static let shared = IntegraVideoRepository()
    private static let maxIdsPerBatch = 40

    private init() {}

    private func siteQ(_ siteId: Int?) -> [String: String] {
        IntegraQuery.site(siteId ?? IntegraSiteScope.current)
    }

    func cameras(siteId: Int? = nil) async throws -> [IntegraCamera] {
        IntegraJSON.decodeList(try await IntegraHTTP.get("integra/cameras", query: siteQ(siteId)))
            .compactMap { IntegraCamera.fromMap($0) }
    }

    /// Opens several cameras. Chunked by 40 (server `StreamsBatchDto` limit). Serial batches.
    func openStreams(cameraIds: [String], siteId: Int? = nil) async throws -> [String: IntegraStreamSlot] {
        let unique = Array(Set(cameraIds.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }))
        if unique.isEmpty { return [:] }

        struct Body: Encodable {
            let cameraIds: [String]
            let quality: String
            let audio: Bool
        }

        var out: [String: IntegraStreamSlot] = [:]
        for chunkStart in stride(from: 0, to: unique.count, by: Self.maxIdsPerBatch) {
            let end = min(chunkStart + Self.maxIdsPerBatch, unique.count)
            let lote = Array(unique[chunkStart..<end])
            let root = IntegraJSON.decodeMap(
                try await IntegraHTTP.postJSON(
                    "integra/cameras/streams/batch",
                    body: Body(cameraIds: lote, quality: "sub", audio: false),
                    query: siteQ(siteId)
                )
            )
            for item in IntegraJSON.itemsOf(root) {
                if let slot = IntegraStreamSlot.fromBatchItem(item) {
                    out[slot.cameraId] = slot
                }
            }
        }
        return out
    }

    func openStream(cameraId: String, siteId: Int? = nil) async throws -> IntegraStreamSlot {
        let root = IntegraJSON.decodeMap(
            try await IntegraHTTP.postEmpty("integra/cameras/\(cameraId)/stream", query: siteQ(siteId))
        )
        return IntegraStreamSlot.fromSingle(cameraId: cameraId, root)
    }

    func ptzPresets(cameraId: String, siteId: Int? = nil) async throws -> [IntegraPtzPreset] {
        do {
            return IntegraJSON.decodeList(
                try await IntegraHTTP.get("integra/cameras/\(cameraId)/ptz/presets", query: siteQ(siteId))
            ).compactMap { IntegraPtzPreset.fromMap($0) }
        } catch {
            // Non-ISAPI sites error; empty list so UI hides PTZ controls.
            return []
        }
    }

    func ptzMove(cameraId: String, pan: Int = 0, tilt: Int = 0, zoom: Int = 0, siteId: Int? = nil) async throws {
        struct Body: Encodable {
            let pan: Int
            let tilt: Int
            let zoom: Int
            let durationMs: Int
            let continuous: Bool
        }
        _ = try await IntegraHTTP.postJSON(
            "integra/cameras/\(cameraId)/ptz",
            body: Body(
                pan: min(100, max(-100, pan)),
                tilt: min(100, max(-100, tilt)),
                zoom: min(100, max(-100, zoom)),
                durationMs: 500,
                continuous: false
            ),
            query: siteQ(siteId)
        )
    }

    func ptzGoToPreset(cameraId: String, preset: Int, siteId: Int? = nil) async throws {
        struct Body: Encodable { let preset: Int }
        _ = try await IntegraHTTP.postJSON(
            "integra/cameras/\(cameraId)/ptz",
            body: Body(preset: min(300, max(1, preset))),
            query: siteQ(siteId)
        )
    }

    func ptzStop(cameraId: String, siteId: Int? = nil) async throws {
        struct Body: Encodable { let stop: Bool }
        _ = try await IntegraHTTP.postJSON(
            "integra/cameras/\(cameraId)/ptz",
            body: Body(stop: true),
            query: siteQ(siteId)
        )
    }

    func capture(cameraId: String, siteId: Int? = nil) async throws -> IntegraCaptureResult {
        IntegraCaptureResult.fromMap(
            IntegraJSON.decodeMap(
                try await IntegraHTTP.postEmpty("integra/cameras/\(cameraId)/capture", query: siteQ(siteId))
            )
        )
    }

    /// Raw RTSP URL (technical only — iOS does not play RTSP here).
    func previewRtsp(cameraId: String, siteId: Int? = nil) async throws -> String? {
        let root = IntegraJSON.decodeMap(
            try await IntegraHTTP.postEmpty("integra/cameras/\(cameraId)/preview", query: siteQ(siteId))
        )
        return root.integraStr("url")
    }
}
