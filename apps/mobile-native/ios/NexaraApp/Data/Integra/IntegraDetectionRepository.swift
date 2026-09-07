import Foundation
import CoreGraphics

// MARK: - Detection contract (subset ported from Android DetectionContract.kt)

enum DetectionDefaults {
    /// Manufacturer example value — never fall back to 0 (deaf camera bug).
    static let sensitivity = 50
    static let maxRegions = 4
    static let minRegionPoints = 3
    static let maxRegionPoints = 10
    static let confidenceOrder = ["low", "mediumLow", "mediumHigh", "high"]
    static let targetOrder = ["human", "vehicle", "human,vehicle"]
}

struct DetectionWindow {
    /// `HH:MM` site-local.
    var start: String
    var end: String
    /// 0 Sunday … 6 Saturday.
    var days: [Int]
}

let defaultDetectionWindow = DetectionWindow(
    start: "00:00",
    end: "23:59",
    days: [0, 1, 2, 3, 4, 5, 6]
)

struct DetectionLimits {
    var sensitivityMin: Int = 0
    var sensitivityMax: Int = 100
    var sensitivityDefault: Int = DetectionDefaults.sensitivity
    var maxRegions: Int = DetectionDefaults.maxRegions
    var alarmConfidences: [String] = DetectionDefaults.confidenceOrder
    var detectionTargets: [String] = DetectionDefaults.targetOrder
    var baseEventTypes: [String] = []
    var catalogEventTypes: [String] = []
}

enum CapabilityState {
    case supported, unsupported, unverified
}

func capabilityStateOf(_ flag: Bool?) -> CapabilityState {
    switch flag {
    case .some(true): return .supported
    case .some(false): return .unsupported
    case .none: return .unverified
    }
}

struct CameraCapabilities {
    var cameraId: String?
    var probeOk: Bool = false
    var probeNote: String?
    var probedAt: String?
    var flags: [(key: String, state: CapabilityState)] = []
    var supportedEventTypes: [String] = []
}

struct DetectionProfile {
    let cameraId: String
    let cameraName: String?
    let deviceIp: String?
    let channel: Int?
    let enabled: Bool
    let hasStoredProfile: Bool
    let sensitivity: Int
    let alarmConfidence: String
    let detectionTarget: String
    /// `nil` = full frame. Mobile does not edit polygons.
    let regions: [[String: Any]]?
    /// Normalized 0…1 vertices per polygon (read-only UI).
    let regionPolygons: [[CGPoint]]
    let timeThresholdSec: Int
    let eventTypes: [String]
    let window: DetectionWindow?
    let lastAppliedAt: String?
    let lastAppliedNote: String?
    let capabilities: CameraCapabilities?
    let limits: DetectionLimits
}

struct DetectionDraft {
    var enabled: Bool
    var sensitivity: Int
    var alarmConfidence: String
    var detectionTarget: String
    var window: DetectionWindow
}

struct DetectionCamera {
    let id: String
    let name: String
    let region: String?
    let sourceIp: String?
    let model: String?
    let isPtz: Bool
}

struct ApplyOutcome {
    let applied: Bool
    let note: String
}

struct SiteProbeItem {
    let cameraId: String
    let name: String?
    let probeOk: Bool
    let note: String?
}

struct SiteProbeOutcome {
    let total: Int
    let ok: Int
    let items: [SiteProbeItem]
}

struct SiteCapabilityRow {
    let cameraId: String
    let capabilities: CameraCapabilities
}

enum DetectionParsing {
    private static let hhmm = try! NSRegularExpression(pattern: #"^([01]\d|2[0-3]):([0-5]\d)$"#)

    static func parseProfile(_ raw: [String: Any], cameraId: String) -> DetectionProfile {
        let limits = readLimits(raw["limits"])
        let eff = IntegraJSON.asMap(raw["effective"]) ?? [:]
        let stored = IntegraJSON.asMap(raw["stored"])

        let sensitivity = (eff.integraInt("sensitivity") ?? limits.sensitivityDefault)
            .clamped(to: limits.sensitivityMin...limits.sensitivityMax)

        let confidence = eff.integraStr("alarmConfidence")
            .flatMap { limits.alarmConfidences.contains($0) ? $0 : nil }
            ?? "mediumHigh"
        let target = eff.integraStr("detectionTarget")
            .flatMap { limits.detectionTargets.contains($0) ? $0 : nil }
            ?? "human"

        return DetectionProfile(
            cameraId: raw.integraStr("cameraId") ?? cameraId,
            cameraName: raw.integraStr("cameraName"),
            deviceIp: raw.integraStr("deviceIp"),
            channel: raw.integraInt("channel"),
            enabled: raw.integraBool("enabled") ?? true,
            hasStoredProfile: stored != nil,
            sensitivity: sensitivity,
            alarmConfidence: confidence,
            detectionTarget: target,
            regions: IntegraJSON.asMapList(eff["regions"]),
            regionPolygons: readRegionPolygons(eff["regions"]),
            timeThresholdSec: eff.integraInt("timeThresholdSec") ?? 0,
            eventTypes: stringList(eff["eventTypes"]),
            window: readWindow(stored?["schedule"]),
            lastAppliedAt: raw.integraStr("lastAppliedAt"),
            lastAppliedNote: raw.integraStr("lastAppliedNote"),
            capabilities: parseCapabilities(raw["capabilities"], cameraId: cameraId),
            limits: limits
        )
    }

    /// Android `readRegions`: list of polygons, each a list of `{x,y}` in 0…1.
    static func readRegionPolygons(_ v: Any?) -> [[CGPoint]] {
        guard let list = v as? [Any] else { return [] }
        var out: [[CGPoint]] = []
        for raw in list {
            let pts: [CGPoint]
            if let arr = raw as? [Any] {
                pts = arr.compactMap { item -> CGPoint? in
                    guard let m = IntegraJSON.asMap(item),
                          let x = m.integraDouble("x"),
                          let y = m.integraDouble("y") else { return nil }
                    return CGPoint(x: min(1, max(0, x)), y: min(1, max(0, y)))
                }
            } else if let m = IntegraJSON.asMap(raw),
                      let nested = IntegraJSON.asMapList(m["points"]) {
                pts = nested.compactMap { p in
                    guard let x = p.integraDouble("x"), let y = p.integraDouble("y") else { return nil }
                    return CGPoint(x: min(1, max(0, x)), y: min(1, max(0, y)))
                }
            } else {
                pts = []
            }
            if pts.count >= DetectionDefaults.minRegionPoints {
                out.append(Array(pts.prefix(DetectionDefaults.maxRegionPoints)))
            }
            if out.count >= DetectionDefaults.maxRegions { break }
        }
        return out
    }

    /// Omits `regions` on purpose — phone does not draw polygons; server keeps zones.
    static func patchFromDraft(_ d: DetectionDraft) -> [String: Any] {
        [
            "enabled": d.enabled,
            "sensitivity": d.sensitivity,
            "alarmConfidence": d.alarmConfidence,
            "detectionTarget": d.detectionTarget,
            "schedule": [
                "start": d.window.start,
                "end": d.window.end,
                "days": d.window.days,
            ],
        ]
    }

    static func parseCapabilities(_ raw: Any?, cameraId: String?) -> CameraCapabilities? {
        guard let m = IntegraJSON.asMap(raw) else { return nil }
        let flagsMap = IntegraJSON.asMap(m["flags"]) ?? [:]
        let known = [
            "fieldDetection", "lineDetection", "faceDetect", "regionEntrance",
            "regionExiting", "loitering", "unattendedBaggage", "attendedBaggage",
            "peopleGathering", "defocus", "sceneChange", "audioException",
            "peopleCounting", "heatMap",
        ]
        let extra = flagsMap.keys.filter { !known.contains($0) }.sorted()
        let flags = (known + extra).map { key -> (String, CapabilityState) in
            (key, capabilityStateOf(flagsMap[key] as? Bool))
        }
        return CameraCapabilities(
            cameraId: m.integraStr("cameraId") ?? cameraId,
            probeOk: m.integraBool("probeOk") ?? false,
            probeNote: m.integraStr("probeNote"),
            probedAt: m.integraStr("probedAt"),
            flags: flags,
            supportedEventTypes: stringList(m["supportedEventTypes"])
        )
    }

    private static func readLimits(_ v: Any?) -> DetectionLimits {
        guard let m = IntegraJSON.asMap(v) else { return DetectionLimits() }
        var limits = DetectionLimits()
        if let n = m.integraInt("sensitivityMin") { limits.sensitivityMin = n }
        if let n = m.integraInt("sensitivityMax") { limits.sensitivityMax = n }
        if let n = m.integraInt("sensitivityDefault") { limits.sensitivityDefault = n }
        if let n = m.integraInt("maxRegions") { limits.maxRegions = n }
        let conf = stringList(m["alarmConfidences"])
        if !conf.isEmpty { limits.alarmConfidences = conf }
        let targets = stringList(m["detectionTargets"])
        if !targets.isEmpty { limits.detectionTargets = targets }
        limits.baseEventTypes = stringList(m["baseEventTypes"])
        limits.catalogEventTypes = stringList(m["catalogEventTypes"])
        return limits
    }

    private static func readWindow(_ v: Any?) -> DetectionWindow? {
        guard let m = IntegraJSON.asMap(v),
              let start = m.integraStr("start"),
              let end = m.integraStr("end") else { return nil }
        let startRange = NSRange(start.startIndex..., in: start)
        let endRange = NSRange(end.startIndex..., in: end)
        guard hhmm.firstMatch(in: start, range: startRange) != nil,
              hhmm.firstMatch(in: end, range: endRange) != nil else { return nil }
        let days: [Int]
        if let list = m["days"] as? [Any] {
            days = list.compactMap { ($0 as? NSNumber)?.intValue ?? ($0 as? Int) }
                .filter { (0...6).contains($0) }
                .sorted()
        } else {
            days = []
        }
        return DetectionWindow(start: start, end: end, days: days)
    }

    private static func stringList(_ v: Any?) -> [String] {
        guard let list = v as? [Any] else { return [] }
        return list.compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}

// MARK: - Repository

final class IntegraDetectionRepository {
    static let shared = IntegraDetectionRepository()
    private init() {}

    private func siteQ(_ siteId: Int?) -> [String: String] {
        IntegraQuery.site(siteId ?? IntegraSiteScope.current)
    }

    func cameras(siteId: Int? = nil) async throws -> [DetectionCamera] {
        IntegraJSON.decodeList(try await IntegraHTTP.get("integra/cameras", query: siteQ(siteId)))
            .compactMap { row in
                guard let id = row.integraStr("id"), !id.isEmpty else { return nil }
                return DetectionCamera(
                    id: id,
                    name: row.integraStr("name") ?? id,
                    region: row.integraStr("region"),
                    sourceIp: row.integraStr("sourceIp"),
                    model: row.integraStr("model"),
                    isPtz: row.integraBool("isPtz") ?? false
                )
            }
    }

    func profile(cameraId: String, siteId: Int? = nil) async throws -> DetectionProfile {
        let root = IntegraJSON.decodeMap(
            try await IntegraHTTP.get("integra/cameras/\(cameraId)/detection", query: siteQ(siteId))
        )
        return DetectionParsing.parseProfile(root, cameraId: cameraId)
    }

    /// Saves profile. Does **not** write to the device (see `apply`).
    func saveProfile(cameraId: String, draft: DetectionDraft, siteId: Int? = nil) async throws -> DetectionProfile {
        let root = IntegraJSON.decodeMap(
            try await IntegraHTTP.patchMap(
                "integra/cameras/\(cameraId)/detection",
                body: DetectionParsing.patchFromDraft(draft),
                query: siteQ(siteId)
            )
        )
        return DetectionParsing.parseProfile(root, cameraId: cameraId)
    }

    /// Writes stored profile to the camera.
    func apply(cameraId: String, siteId: Int? = nil) async throws -> ApplyOutcome {
        let root = IntegraJSON.decodeMap(
            try await IntegraHTTP.postEmpty(
                "integra/cameras/\(cameraId)/detection/apply",
                query: siteQ(siteId)
            )
        )
        return ApplyOutcome(
            applied: root.integraBool("applied") ?? false,
            note: root.integraStr("note") ?? ""
        )
    }

    func probeCamera(cameraId: String, siteId: Int? = nil) async throws -> CameraCapabilities? {
        let root = IntegraJSON.decodeMap(
            try await IntegraHTTP.postEmpty(
                "integra/cameras/\(cameraId)/detection/capabilities",
                query: siteQ(siteId)
            )
        )
        return DetectionParsing.parseCapabilities(root, cameraId: cameraId)
    }

    func siteCapabilities(siteId: Int? = nil) async throws -> [SiteCapabilityRow] {
        let root = IntegraJSON.decodeMap(
            try await IntegraHTTP.get("integra/detection/capabilities", query: siteQ(siteId))
        )
        return IntegraJSON.itemsOf(root).compactMap { row in
            guard let id = row.integraStr("cameraId"), !id.isEmpty,
                  let caps = DetectionParsing.parseCapabilities(row, cameraId: id) else { return nil }
            return SiteCapabilityRow(cameraId: id, capabilities: caps)
        }
    }

    func probeSite(siteId: Int? = nil) async throws -> SiteProbeOutcome {
        let root = IntegraJSON.decodeMap(
            try await IntegraHTTP.postEmpty("integra/detection/capabilities/probe", query: siteQ(siteId))
        )
        let items = IntegraJSON.itemsOf(root).compactMap { row -> SiteProbeItem? in
            guard let id = row.integraStr("cameraId"), !id.isEmpty else { return nil }
            return SiteProbeItem(
                cameraId: id,
                name: row.integraStr("name"),
                probeOk: row.integraBool("probeOk") ?? false,
                note: row.integraStr("note")
            )
        }
        return SiteProbeOutcome(
            total: root.integraInt("total") ?? items.count,
            ok: root.integraInt("ok") ?? items.filter(\.probeOk).count,
            items: items
        )
    }
}
