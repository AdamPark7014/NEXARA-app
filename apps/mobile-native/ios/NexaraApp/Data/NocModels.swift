import Foundation

struct NocAlert: Hashable, Identifiable {
    let id: String
    let severity: String
    let deviceId: String
    let deviceName: String
    let title: String
    let message: String
    let triggeredAt: String
    let ackBy: String

    var rowKey: String { "na-\(id)" }
    var displayTitle: String {
        if !title.isEmpty { return title }
        if !deviceName.isEmpty { return deviceName }
        return "Alerta"
    }
    var isCritical: Bool { severity.lowercased() == "critical" }
    var isWarningBand: Bool {
        let s = severity.lowercased()
        return s == "warning" || s == "high" || s == "medium"
    }

    func toFlatMap() -> [String: Any] {
        [
            "id": id,
            "severity": severity,
            "deviceId": deviceId,
            "deviceName": deviceName,
            "title": title,
            "message": message,
            "triggeredAt": triggeredAt,
            "ackBy": ackBy,
        ]
    }

    init(raw: [String: Any]) {
        id = StockParse.str(raw["id"])
        severity = StockParse.str(raw["severity"])
        deviceId = StockParse.str(raw["deviceId"])
        deviceName = StockParse.str(raw["deviceName"], raw["name"])
        title = StockParse.str(raw["title"])
        message = StockParse.str(raw["message"], raw["description"])
        triggeredAt = StockParse.str(raw["triggeredAt"], raw["createdAt"])
        ackBy = StockParse.str(raw["ackBy"])
    }
}

struct NocDevice: Hashable, Identifiable {
    let id: String
    let name: String
    let type: String
    let status: String
    let clientName: String
    let branch: String
    let lastSeen: String
    let uptimePct30d: Double?

    var rowKey: String { "nd-\(id)" }
    var displayName: String { name.isEmpty ? "Dispositivo" : name }

    func toFlatMap() -> [String: Any] {
        var out: [String: Any] = [
            "id": id,
            "name": name,
            "type": type,
            "status": status,
            "clientName": clientName,
            "branch": branch,
            "lastSeen": lastSeen,
        ]
        if let uptimePct30d {
            out["uptimePct30d"] = uptimePct30d
            out["uptime"] = uptimePct30d
        }
        return out
    }

    init(raw: [String: Any]) {
        let client = raw["client"] as? [String: Any]
        id = StockParse.str(raw["id"])
        name = StockParse.str(raw["name"], raw["deviceName"], raw["title"])
        type = StockParse.str(raw["type"], raw["deviceType"])
        status = StockParse.str(raw["status"], raw["estado"])
        clientName = StockParse.str(client?["name"], raw["clientName"], raw["cliente"])
        branch = StockParse.str(raw["branch"], raw["branchName"])
        lastSeen = StockParse.str(raw["lastSeen"], raw["updatedAt"])
        uptimePct30d = StockParse.dbl(raw["uptimePct30d"], raw["uptime"], raw["avgUptime"])
    }
}
