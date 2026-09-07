import Foundation

// MARK: - Map models (read-only honesty — no write APIs)

enum MapPinKind {
    case door, camera, other
}

func mapPinKind(of raw: String?) -> MapPinKind {
    switch (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
    case "DOOR": return .door
    case "CAMERA": return .camera
    default: return .other
    }
}

struct MapPin {
    let id: Int
    let kind: MapPinKind
    let entityType: String
    let entityId: String
    let label: String?
    let xPct: Float
    let yPct: Float

    var displayName: String {
        if let label, !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return label
        }
        return entityId
    }

    static func fromMap(_ m: [String: Any]) -> MapPin? {
        guard let id = m.integraInt("id"),
              let entityId = m.integraStr("entityId"),
              let x = m.integraFloat("xPct"),
              let y = m.integraFloat("yPct") else { return nil }
        let type = m.integraStr("entityType") ?? ""
        return MapPin(
            id: id,
            kind: mapPinKind(of: type),
            entityType: type,
            entityId: entityId,
            label: m.integraStr("label"),
            xPct: min(100, max(0, x)),
            yPct: min(100, max(0, y))
        )
    }
}

struct Floorplan {
    let id: Int
    let name: String
    let imageData: String?
    let pins: [MapPin]

    var doorPins: Int { pins.filter { $0.kind == .door }.count }
    var cameraPins: Int { pins.filter { $0.kind == .camera }.count }

    static func fromMap(_ m: [String: Any]) -> Floorplan? {
        guard let id = m.integraInt("id") else { return nil }
        let pinMaps = IntegraJSON.asMapList(m["pins"]) ?? []
        return Floorplan(
            id: id,
            name: m.integraStr("name") ?? "Plano \(id)",
            imageData: m.integraStr("imageData"),
            pins: pinMaps.compactMap { MapPin.fromMap($0) }
        )
    }
}

/// Door or camera inventory row with live-ish state.
/// `online == nil` means the mirror did not report status (do not invent counts).
struct MapEntity {
    let id: String
    let kind: MapPinKind
    let name: String
    let location: String?
    let online: Bool?
    /// Doors only: `open`, `closed`, `remain_open`, `remain_closed`, `unknown`.
    let doorState: String?
    let rawStatus: String?

    static func door(_ m: [String: Any]) -> MapEntity? {
        guard let id = m.integraStr("id", "doorIndexCode", "indexCode") else { return nil }
        return MapEntity(
            id: id,
            kind: .door,
            name: m.integraStr("name", "doorName") ?? id,
            location: m.integraStr("location", "regionName", "region"),
            online: m.integraBool("online"),
            doorState: m.integraStr("status"),
            rawStatus: m.integraStr("status")
        )
    }

    static func camera(_ m: [String: Any]) -> MapEntity? {
        guard let id = m.integraStr("id", "cameraIndexCode", "indexCode") else { return nil }
        let status = m.integraStr("status")
        return MapEntity(
            id: id,
            kind: .camera,
            name: m.integraStr("name", "cameraName") ?? id,
            location: m.integraStr("region", "regionName"),
            online: cameraOnlineOrNull(status),
            doorState: nil,
            rawStatus: status
        )
    }
}

func cameraOnlineOrNull(_ status: String?) -> Bool? {
    let s = (status ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if s.isEmpty || s == "null" || s == "undefined" { return nil }
    switch s {
    case "1", "online", "true": return true
    case "0", "offline", "false": return false
    default:
        if let d = Double(s) { return Int(d) == 1 }
        return nil
    }
}

struct MapSnapshot {
    let floorplans: [Floorplan]
    let doors: [MapEntity]
    let cameras: [MapEntity]
}

// MARK: - Repository (READ ONLY)

/**
 Lectura del plano del sitio.

 **No escribe nada — decisión, no carencia.**

 Server allows `POST integra/floorplans`, pin create/delete behind settings.
 Precision placement on a phone is unsafe (web even deleted pins on tap).
 Module is SOLO_LECTURA: pan/zoom/inspect only. Edit stays on web console.
 */
final class IntegraMapRepository {
    static let shared = IntegraMapRepository()
    private init() {}

    private func siteQ() -> [String: String] {
        IntegraQuery.site(IntegraSiteScope.current)
    }

    /// Floorplans + inventory in parallel. Door/camera failures do not blank the plan.
    func snapshot() async throws -> MapSnapshot {
        let q = siteQ()
        async let plansData = IntegraHTTP.get("integra/floorplans", query: q)
        let doorsTask = Task { try? await IntegraHTTP.get("integra/doors", query: q) }
        let camsTask = Task { try? await IntegraHTTP.get("integra/cameras", query: q) }

        let plans = IntegraJSON.decodeList(try await plansData)
            .compactMap { Floorplan.fromMap($0) }
        let doors = IntegraJSON.decodeList(await doorsTask.value ?? Data())
            .compactMap { MapEntity.door($0) }
        let cameras = IntegraJSON.decodeList(await camsTask.value ?? Data())
            .compactMap { MapEntity.camera($0) }

        return MapSnapshot(floorplans: plans, doors: doors, cameras: cameras)
    }

    // No write methods by design:
    // TODO: do not add POST integra/floorplans, POST …/pins, DELETE integra/map-pins/:id
}
