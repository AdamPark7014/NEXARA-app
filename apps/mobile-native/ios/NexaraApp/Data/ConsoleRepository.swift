import Foundation

/// Capa de datos de Asistencias (Core) y clientes de servicio.
final class ConsoleRepository {
    static let shared = ConsoleRepository()
    private let api = ApiClient.shared
    private init() {}

    // MARK: Attendance

    func attendanceCurrentItem() async throws -> AttendanceCurrent? {
        let data = try await api.get("attendance/current")
        let map = ConsoleHelpers.decodeMap(data)
        return map.isEmpty ? nil : AttendanceCurrent(raw: map)
    }

    func attendanceRangeItem(from: String, to: String, hierarchy: Bool = true) async throws -> AttendanceRange {
        // Las dos rutas se escriben literales en la llamada, no en una variable.
        // Mismo comportamiento, pero `parity-report.py` sólo reconoce la ruta
        // cuando es el primer argumento escrito a mano, y con la variable estos
        // dos endpoints salían en el informe como si iOS no los llamara.
        let query = ["from": from, "to": to]
        let data: Data
        if hierarchy {
            data = try await api.get("attendance/hierarchy/range", query: query)
        } else {
            data = try await api.get("attendance/range", query: query)
        }
        return AttendanceRange(raw: ConsoleHelpers.decodeMap(data))
    }

    /// `photoBase64` es obligatoria en el API (`CreateAttendanceDto`): data URL JPEG.
    func attendanceCheckInResult(
        type: String,
        lat: Double? = nil,
        lng: Double? = nil,
        photoBase64: String? = nil
    ) async throws -> AttendanceCheckInResult {
        struct Body: Encodable {
            let type: String
            let timestamp: String
            let photoBase64: String?
            let latitude: Double?
            let longitude: Double?
        }
        let data = try await api.postJSON("attendance", body: Body(
            type: type, timestamp: ConsoleHelpers.isoNow(), photoBase64: photoBase64, latitude: lat, longitude: lng
        ))
        return AttendanceCheckInResult(raw: ConsoleHelpers.decodeMap(data))
    }

    // MARK: Clients

    func serviceClients() async throws -> [[String: Any]] {
        ApiClient.decodeMapList(try await api.get("service-clients"))
    }

    func serviceClientReportPdf(clientId: Int64) async throws -> Data {
        try await api.get("service-clients/\(clientId)/report")
    }

    func createServiceClient(
        name: String,
        contactName: String?, contactEmail: String?, contactPhone: String?,
        address: String?, city: String?, state: String?, country: String?,
        accountCode: String?, portalEmail: String?, portalPassword: String?,
        isActive: Bool,
        logoData: Data?, logoFileName: String?
    ) async throws -> [String: Any] {
        var fields: [String: String] = ["name": name, "isActive": isActive ? "true" : "false"]
        if let v = contactName?.nilIfEmpty { fields["contactName"] = v }
        if let v = contactEmail?.nilIfEmpty { fields["contactEmail"] = v }
        if let v = contactPhone?.nilIfEmpty { fields["contactPhone"] = v }
        if let v = address?.nilIfEmpty { fields["address"] = v }
        if let v = city?.nilIfEmpty { fields["city"] = v }
        if let v = state?.nilIfEmpty { fields["state"] = v }
        if let v = country?.nilIfEmpty { fields["country"] = v }
        if let v = accountCode?.nilIfEmpty { fields["accountCode"] = v }
        if let v = portalEmail?.nilIfEmpty { fields["portalEmail"] = v }
        if let v = portalPassword?.nilIfEmpty { fields["portalPassword"] = v }
        let data = try await api.uploadMultipart(
            "service-clients",
            fields: fields,
            fileField: logoData != nil ? "logo" : nil,
            fileData: logoData,
            fileName: logoFileName ?? "logo.jpg"
        )
        return ConsoleHelpers.decodeMap(data)
    }

    func updateServiceClient(
        id: Int64,
        name: String,
        contactName: String?, contactEmail: String?, contactPhone: String?,
        address: String?, city: String?, state: String?, country: String?,
        accountCode: String?, portalEmail: String?, portalPassword: String?,
        isActive: Bool,
        logoData: Data?, logoFileName: String?
    ) async throws -> [String: Any] {
        if let logoData {
            var fields: [String: String] = ["name": name, "isActive": isActive ? "true" : "false"]
            if let v = contactName?.nilIfEmpty { fields["contactName"] = v }
            if let v = contactEmail?.nilIfEmpty { fields["contactEmail"] = v }
            if let v = contactPhone?.nilIfEmpty { fields["contactPhone"] = v }
            if let v = address?.nilIfEmpty { fields["address"] = v }
            if let v = city?.nilIfEmpty { fields["city"] = v }
            if let v = state?.nilIfEmpty { fields["state"] = v }
            if let v = country?.nilIfEmpty { fields["country"] = v }
            if let v = accountCode?.nilIfEmpty { fields["accountCode"] = v }
            if let v = portalEmail?.nilIfEmpty { fields["portalEmail"] = v }
            if let v = portalPassword?.nilIfEmpty { fields["portalPassword"] = v }
            let data = try await api.uploadMultipart(
                "service-clients/\(id)",
                method: "PUT",
                fields: fields,
                fileField: "logo",
                fileData: logoData,
                fileName: logoFileName ?? "logo.jpg"
            )
            return ConsoleHelpers.decodeMap(data)
        }
        struct Body: Encodable {
            let name: String
            let contactName, contactEmail, contactPhone: String?
            let address, city, state, country: String?
            let accountCode, portalEmail, portalPassword: String?
            let isActive: Bool
        }
        let data = try await api.putJSON("service-clients/\(id)", body: Body(
            name: name,
            contactName: contactName?.nilIfEmpty,
            contactEmail: contactEmail?.nilIfEmpty,
            contactPhone: contactPhone?.nilIfEmpty,
            address: address?.nilIfEmpty,
            city: city?.nilIfEmpty,
            state: state?.nilIfEmpty,
            country: country?.nilIfEmpty,
            accountCode: accountCode?.nilIfEmpty,
            portalEmail: portalEmail?.nilIfEmpty,
            portalPassword: portalPassword?.nilIfEmpty,
            isActive: isActive
        ))
        return ConsoleHelpers.decodeMap(data)
    }

    // MARK: GPS

    /// `POST gps` (`CreateGpsDto`). `estaActivo` va en true como en la web: es
    /// lo que hace que el punto salga en `gps/team` y en el recorrido del día.
    /// `actividadId` liga el punto a la actividad en curso (geocerca de 100 m).
    func gpsPost(lat: Double, lng: Double, speedKmh: Double? = nil, actividadId: Int? = nil) async throws {
        struct Body: Encodable {
            let latitud: Double
            let longitud: Double
            let velocidadKmh: Double?
            let estaActivo: Bool
            let ultimaActualizacion: String
            let actividadId: Int?
        }
        _ = try await api.postJSON("gps", body: Body(
            latitud: lat, longitud: lng, velocidadKmh: speedKmh, estaActivo: true,
            ultimaActualizacion: ConsoleHelpers.isoNow(),
            actividadId: actividadId
        ))
    }
}
