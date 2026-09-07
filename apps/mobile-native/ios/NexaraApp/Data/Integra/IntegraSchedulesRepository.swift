import Foundation

/// Horarios y espacios — paridad con Android `SchedulesRepository`.
/// List rows stay as `[String: Any]`; UI agents map them as needed.
final class IntegraSchedulesRepository {
    static let shared = IntegraSchedulesRepository()
    private init() {}

    private func siteQ(_ siteId: Int?) -> [String: String] {
        IntegraQuery.site(siteId ?? IntegraSiteScope.current)
    }

    // MARK: Schedules

    func catalog(siteId: Int? = nil) async throws -> [String: Any] {
        IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/schedules", query: siteQ(siteId)))
    }

    func personSchedule(personId: String, siteId: Int? = nil) async throws -> [String: Any] {
        IntegraJSON.decodeMap(
            try await IntegraHTTP.get("integra/schedules/people/\(personId)", query: siteQ(siteId))
        )
    }

    func doorAccess(doorId: String, siteId: Int? = nil) async throws -> [String: Any] {
        // doorId may contain `|` (e.g. `10.0.0.5|1`); URLComponents encodes it.
        let encoded = doorId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? doorId
        return IntegraJSON.decodeMap(
            try await IntegraHTTP.get("integra/schedules/doors/\(encoded)", query: siteQ(siteId))
        )
    }

    func peopleBrief() async throws -> [[String: Any]] {
        try await IntegraRepository.shared.people()
    }

    /// Push validity + per-door plan template.
    /// `beginTime`/`endTime` are ISAPI wall-clock strings — no timezone conversion.
    func savePersonSchedule(
        personId: String,
        body: [String: Any],
        siteId: Int? = nil
    ) async throws -> [String: Any] {
        IntegraJSON.decodeMap(
            try await IntegraHTTP.patchMap(
                "integra/schedules/people/\(personId)",
                body: body,
                query: siteQ(siteId)
            )
        )
    }

    // MARK: Spaces

    func spacesOverview(siteId: Int? = nil) async throws -> [String: Any] {
        IntegraJSON.decodeMap(try await IntegraHTTP.get("integra/spaces", query: siteQ(siteId)))
    }

    func spaceDetail(doorId: String, siteId: Int? = nil) async throws -> [String: Any] {
        let encoded = doorId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? doorId
        return IntegraJSON.decodeMap(
            try await IntegraHTTP.get("integra/spaces/\(encoded)", query: siteQ(siteId))
        )
    }

    func saveSpacePolicy(doorId: String, templateKey: String, siteId: Int? = nil) async throws {
        let encoded = doorId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? doorId
        _ = try await IntegraHTTP.putMap(
            "integra/spaces/\(encoded)/policy",
            body: ["templateKey": templateKey],
            query: siteQ(siteId)
        )
    }

    /// `startsAtUtc` / `endsAtUtc` must already be UTC ISO (`toIsoUtc` on Android).
    func createBooking(
        doorId: String,
        title: String,
        startsAtUtc: String,
        endsAtUtc: String,
        hostPersonId: String? = nil,
        notes: String? = nil,
        siteId: Int? = nil
    ) async throws {
        var body: [String: Any] = [
            "doorIndexCode": doorId,
            "title": title,
            "startsAt": startsAtUtc,
            "endsAt": endsAtUtc,
        ]
        if let host = hostPersonId?.trimmingCharacters(in: .whitespacesAndNewlines), !host.isEmpty {
            body["hostPersonId"] = host
        }
        if let notes = notes?.trimmingCharacters(in: .whitespacesAndNewlines), !notes.isEmpty {
            body["notes"] = notes
        }
        _ = try await IntegraHTTP.postMap("integra/spaces-bookings", body: body, query: siteQ(siteId))
    }

    func cancelBooking(bookingId: Int64) async throws {
        _ = try await IntegraHTTP.delete("integra/spaces-bookings/\(bookingId)")
    }

    // MARK: Capabilities

    /// On network failure assumes allowed (server still enforces).
    func capabilities(siteId: Int? = nil) async throws -> [String: Any] {
        do {
            return IntegraJSON.decodeMap(
                try await IntegraHTTP.get("integra/capabilities", query: siteQ(siteId))
            )
        } catch {
            return [:]
        }
    }
}
