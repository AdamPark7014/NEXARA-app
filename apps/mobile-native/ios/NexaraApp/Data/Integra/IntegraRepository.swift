import Foundation

/// Capa de datos INTEGRA core — paridad con Android `IntegraRepository`.
final class IntegraRepository {
    static let shared = IntegraRepository()

    private init() {
        IntegraSiteScope.load()
    }

    func selectSite(_ siteId: Int?) {
        IntegraSiteScope.select(siteId)
    }

    private func siteQ(_ extra: [String: String] = [:]) -> [String: String] {
        IntegraQuery.merging(extra)
    }

    // MARK: Panorama

    func dashboard() async throws -> [String: Any] {
        IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/dashboard", query: siteQ()))
    }

    func lastSync() async throws -> [String: Any] {
        IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/sync/last", query: siteQ()))
    }

    // MARK: Doors

    struct DoorsResult {
        let items: [[String: Any]]
        /// `mirror` = synced mirror · `live` = polled ACS state.
        let source: String
    }

    func doors(live: Bool = false) async throws -> DoorsResult {
        var q = siteQ()
        if live { q["live"] = "1" }
        let root = IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/doors", query: q))
        return DoorsResult(
            items: IntegraJSON.itemsOf(root),
            source: root.integraStr("source") ?? ""
        )
    }

    /// Momentary open (single-tap shortcut).
    func openDoor(doorId: String, reason: String) async throws -> [String: Any] {
        struct Body: Encodable { let reason: String }
        let data = try await IntegraHTTP.postJSON(
            "integra/doors/\(doorId)/open",
            body: Body(reason: reason.trimmingCharacters(in: .whitespacesAndNewlines)),
            query: siteQ()
        )
        return IntegraJSON.decodeMap(data)
    }

    /// Four door orders: `"0"` remain open, `"1"` close, `"2"` momentary, `"3"` remain closed.
    func controlDoor(doorId: String, controlType: String, reason: String) async throws -> [String: Any] {
        struct Body: Encodable { let controlType: String; let reason: String }
        let data = try await IntegraHTTP.postJSON(
            "integra/doors/\(doorId)/control",
            body: Body(
                controlType: controlType,
                reason: reason.trimmingCharacters(in: .whitespacesAndNewlines)
            ),
            query: siteQ()
        )
        return IntegraJSON.decodeMap(data)
    }

    // MARK: Events

    /// ACS push event log (web primary source). Labels come from the server.
    func pushEvents(
        limit: Int = 60,
        scope: String? = "acs",
        outcome: String? = nil,
        eventState: String? = nil,
        deviceIp: String? = nil,
        personName: String? = nil,
        personId: String? = nil,
        from: Date? = nil,
        to: Date? = nil,
        beforeId: Int64? = nil,
        afterId: Int64? = nil
    ) async throws -> IntegraPage {
        var q = siteQ(["limit": String(limit)])
        if let scope { q["scope"] = scope }
        if let outcome { q["outcome"] = outcome }
        if let eventState { q["eventState"] = eventState }
        if let deviceIp, !deviceIp.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            q["deviceIp"] = deviceIp.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let personId, !personId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            q["personId"] = personId.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let personName, !personName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            q["personName"] = personName.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let from { q["from"] = ISO8601DateFormatter().string(from: from) }
        if let to { q["to"] = ISO8601DateFormatter().string(from: to) }
        if let beforeId { q["beforeId"] = String(beforeId) }
        if let afterId {
            q["afterId"] = String(afterId)
            q["live"] = "1"
        }
        let root = IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/push/events", query: q))
        let items = IntegraJSON.itemsOf(root)
        return IntegraPage(
            items: items,
            total: root.integraInt("total") ?? items.count,
            hasMore: root.integraBool("hasMore") ?? false,
            nextBeforeId: root.integraInt64("nextBeforeId"),
            newestId: root.integraInt64("newestId")
        )
    }

    func pushEventStats() async throws -> [String: Any] {
        IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/push/events/stats", query: siteQ()))
    }

    /// Vendor Artemis/ISAPI log (fallback when site does not push). Pages by `pageNo`.
    func providerEvents(
        pageNo: Int = 1,
        limit: Int = 60,
        doorId: String? = nil,
        personName: String? = nil,
        from: Date? = nil,
        to: Date? = nil
    ) async throws -> IntegraPage {
        let end = to ?? Date()
        let start = from ?? end.addingTimeInterval(-24 * 3600)
        var q = siteQ([
            "limit": String(limit),
            "pageNo": String(pageNo),
            "startTime": ISO8601DateFormatter().string(from: start),
            "endTime": ISO8601DateFormatter().string(from: end),
        ])
        if let doorId, !doorId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            q["doorId"] = doorId.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let personName, !personName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            q["personName"] = personName.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let root = IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/events", query: q))
        let items = IntegraJSON.itemsOf(root)
        let total = root.integraInt("total") ?? items.count
        let pageSize = root.integraInt("pageSize") ?? limit
        return IntegraPage(
            items: items,
            total: total,
            hasMore: pageNo * pageSize < total,
            pageNo: pageNo
        )
    }

    // MARK: People

    func people(live: Bool = false) async throws -> [[String: Any]] {
        var q = siteQ()
        if live { q["live"] = "1" }
        return IntegraJSON.decodeList(try await IntegraHTTP.get("integra/people", query: q))
    }

    func personDetail(personId: String) async throws -> [String: Any] {
        IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/people/\(personId)", query: siteQ()))
    }

    func addPerson(
        personName: String,
        personCode: String? = nil,
        employeeNo: String? = nil,
        autoCode: Bool = true,
        gender: String? = nil,
        userType: String? = nil,
        validFrom: String? = nil,
        validTo: String? = nil
    ) async throws -> [String: Any] {
        struct Body: Encodable {
            let personName: String
            let personCode: String?
            let employeeNo: String?
            let autoCode: Bool
            let gender: String?
            let userType: String?
            let validFrom: String?
            let validTo: String?
            let validEnable: Bool
        }
        func blank(_ s: String?) -> String? {
            let t = s?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return t.isEmpty ? nil : t
        }
        let data = try await IntegraHTTP.postJSON(
            "integra/people",
            body: Body(
                personName: personName.trimmingCharacters(in: .whitespacesAndNewlines),
                personCode: blank(personCode),
                employeeNo: blank(employeeNo),
                autoCode: autoCode,
                gender: blank(gender),
                userType: blank(userType),
                validFrom: blank(validFrom),
                validTo: blank(validTo),
                validEnable: true
            ),
            query: siteQ()
        )
        return IntegraJSON.decodeMap(data)
    }

    func updatePerson(
        personId: String,
        personName: String? = nil,
        gender: String? = nil,
        userType: String? = nil,
        validFrom: String? = nil,
        validTo: String? = nil,
        validEnable: Bool? = nil
    ) async throws -> [String: Any] {
        struct Body: Encodable {
            let personName: String?
            let gender: String?
            let userType: String?
            let validFrom: String?
            let validTo: String?
            let validEnable: Bool?
        }
        func blank(_ s: String?) -> String? {
            let t = s?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return t.isEmpty ? nil : t
        }
        let data = try await IntegraHTTP.patchJSON(
            "integra/people/\(personId)",
            body: Body(
                personName: blank(personName),
                gender: blank(gender),
                userType: blank(userType),
                validFrom: blank(validFrom),
                validTo: blank(validTo),
                validEnable: validEnable
            ),
            query: siteQ()
        )
        return IntegraJSON.decodeMap(data)
    }

    func deletePerson(personId: String, force: Bool = false) async throws -> [String: Any] {
        var q = siteQ()
        if force { q["force"] = "1" }
        return IntegraJSON.decodeMap(try await IntegraHTTP.delete("integra/people/\(personId)", query: q))
    }

    func uploadPersonFace(personId: String, imageBase64: String) async throws -> [String: Any] {
        var raw = imageBase64.trimmingCharacters(in: .whitespacesAndNewlines)
        if let range = raw.range(of: "base64,") {
            raw = String(raw[range.upperBound...])
        }
        struct Body: Encodable { let imageBase64: String }
        let data = try await IntegraHTTP.postJSON(
            "integra/people/\(personId)/face",
            body: Body(imageBase64: raw),
            query: siteQ()
        )
        return IntegraJSON.decodeMap(data)
    }

    func deletePersonFace(personId: String) async throws -> [String: Any] {
        IntegraJSON.decodeMap(try await IntegraHTTP.delete("integra/people/\(personId)/face", query: siteQ()))
    }

    // MARK: Attendance & presence

    func attendance(from: Date, to: Date, personId: String? = nil) async throws -> [[String: Any]] {
        var q = siteQ([
            "from": ISO8601DateFormatter().string(from: from),
            "to": ISO8601DateFormatter().string(from: to),
        ])
        if let personId, !personId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            q["personId"] = personId.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return IntegraJSON.decodeList(try await IntegraHTTP.get("integra/attendance", query: q))
    }

    struct OccupancyResult {
        let items: [[String: Any]]
        let total: Int
        let day: String
        /// Server note: occupancy is inferred, not optical count.
        let note: String
    }

    func occupancy() async throws -> OccupancyResult {
        let root = IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/occupancy", query: siteQ()))
        let items = IntegraJSON.itemsOf(root)
        return OccupancyResult(
            items: items,
            total: root.integraInt("total") ?? items.count,
            day: root.integraStr("day") ?? "",
            note: root.integraStr("note") ?? ""
        )
    }

    func presence(personId: String) async throws -> [String: Any] {
        IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/presence/\(personId)", query: siteQ()))
    }

    // MARK: Visitors

    func visitorAppointments(hoursBack: Double = 8, pageSize: Int = 40) async throws -> [[String: Any]] {
        let end = Date()
        let start = end.addingTimeInterval(-hoursBack * 3600)
        let body: [String: Any] = [
            "pageNo": 1,
            "pageSize": pageSize,
            "visitStartTime": ISO8601DateFormatter().string(from: start),
            "visitEndTime": ISO8601DateFormatter().string(from: end),
        ]
        return IntegraJSON.decodeList(
            try await IntegraHTTP.postMap("integra/visitors/search", body: body, query: siteQ())
        )
    }

    func registerVisitor(body: [String: Any]) async throws -> [String: Any] {
        IntegraJSON.decodeMap(
            try await IntegraHTTP.postMap("integra/visitors/register", body: body, query: siteQ())
        )
    }

    struct RecurringResult {
        let items: [[String: Any]]
        let note: String
    }

    func recurringVisitors() async throws -> RecurringResult {
        let root = IntegraJSON.decodeMap(
            try await IntegraHTTP.get("integra/visitors/recurring", query: siteQ())
        )
        return RecurringResult(
            items: IntegraJSON.itemsOf(root),
            note: root.integraStr("note") ?? ""
        )
    }

    func createRecurringVisitor(
        visitorName: String,
        weekdays: [String],
        timeFrom: String,
        timeTo: String,
        validFrom: String,
        validTo: String,
        phone: String? = nil,
        hostName: String? = nil,
        doorIndexCodes: [String] = [],
        notes: String? = nil
    ) async throws -> [String: Any] {
        struct Body: Encodable {
            let visitorName: String
            let weekdays: [String]
            let timeFrom: String
            let timeTo: String
            let validFrom: String
            let validTo: String
            let phone: String?
            let hostName: String?
            let doorIndexCodes: [String]?
            let notes: String?
        }
        func blank(_ s: String?) -> String? {
            let t = s?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return t.isEmpty ? nil : t
        }
        let data = try await IntegraHTTP.postJSON(
            "integra/visitors/recurring",
            body: Body(
                visitorName: visitorName.trimmingCharacters(in: .whitespacesAndNewlines),
                weekdays: weekdays,
                timeFrom: Self.withSeconds(timeFrom),
                timeTo: Self.withSeconds(timeTo),
                validFrom: validFrom.trimmingCharacters(in: .whitespacesAndNewlines),
                validTo: validTo.trimmingCharacters(in: .whitespacesAndNewlines),
                phone: blank(phone),
                hostName: blank(hostName),
                doorIndexCodes: doorIndexCodes.isEmpty ? nil : doorIndexCodes,
                notes: blank(notes)
            ),
            query: siteQ()
        )
        return IntegraJSON.decodeMap(data)
    }

    private static func withSeconds(_ hhmm: String) -> String {
        let t = hhmm.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.range(of: #"^\d{2}:\d{2}$"#, options: .regularExpression) != nil {
            return "\(t):00"
        }
        return t
    }

    func cancelRecurringVisitor(id: String) async throws -> [String: Any] {
        IntegraJSON.decodeMap(
            try await IntegraHTTP.postEmpty("integra/visitors/recurring/\(id)/cancel", query: siteQ())
        )
    }

    // MARK: SOC alarms

    struct AlarmQueueResult {
        let items: [[String: Any]]
        let openCount: Int
        /// `push` · `artemis` · `mixed` · `hct` · `none` · `empty`.
        let source: String
    }

    func alarmQueue(hours: Int = 24) async throws -> AlarmQueueResult {
        var q = siteQ()
        q["hours"] = String(hours)
        let root = IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/alarms/queue", query: q))
        let items = IntegraJSON.itemsOf(root)
        return AlarmQueueResult(
            items: items,
            openCount: root.integraInt("openCount") ?? 0,
            source: root.integraStr("source") ?? ""
        )
    }

    func ackAlarm(alarmId: String, note: String? = nil) async throws -> [String: Any] {
        struct Body: Encodable { let note: String? }
        let n = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let data = try await IntegraHTTP.postJSON(
            "integra/alarms/\(alarmId)/ack",
            body: Body(note: (n?.isEmpty == false) ? n : nil),
            query: siteQ()
        )
        return IntegraJSON.decodeMap(data)
    }

    func clearAlarm(alarmId: String, note: String? = nil) async throws -> [String: Any] {
        struct Body: Encodable { let note: String? }
        let n = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let data = try await IntegraHTTP.postJSON(
            "integra/alarms/\(alarmId)/clear",
            body: Body(note: (n?.isEmpty == false) ? n : nil),
            query: siteQ()
        )
        return IntegraJSON.decodeMap(data)
    }

    func ticketAlarm(
        alarmId: String,
        title: String,
        description: String,
        severity: String? = nil
    ) async throws -> [String: Any] {
        struct Body: Encodable {
            let title: String
            let description: String
            let severity: String?
        }
        let sev = severity?.trimmingCharacters(in: .whitespacesAndNewlines)
        let data = try await IntegraHTTP.postJSON(
            "integra/alarms/\(alarmId)/ticket",
            body: Body(
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                description: description.trimmingCharacters(in: .whitespacesAndNewlines),
                severity: (sev?.isEmpty == false) ? sev : nil
            ),
            query: siteQ()
        )
        return IntegraJSON.decodeMap(data)
    }

    // MARK: Inventory

    func devices() async throws -> [[String: Any]] {
        IntegraJSON.decodeList(try await IntegraHTTP.get("integra/devices", query: siteQ()))
    }

    /// `integra/sites` returns a bare array (no `items` wrapper).
    func sites() async throws -> [[String: Any]] {
        IntegraJSON.decodeList(try await IntegraHTTP.get("integra/sites"))
    }
}
