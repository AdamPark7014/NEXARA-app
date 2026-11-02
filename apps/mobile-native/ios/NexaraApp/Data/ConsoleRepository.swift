import Foundation

/// Una actividad que se detiene o queda «No cumplida» si la persona checa salida ahora.
struct ActividadEnRiesgo: Hashable {
    let id: Int
    let folio: String
    let titulo: String

    init(id: Int, folio: String, titulo: String) {
        self.id = id
        self.folio = folio
        self.titulo = titulo
    }

    init(raw: [String: Any]) {
        id = ActivityParse.int(raw["id"]) ?? 0
        folio = ActivityParse.str(raw["folio"])
        titulo = ActivityParse.str(raw["titulo"])
    }
}

/// `GET attendance/salida/riesgo`: qué se detiene si checa salida ahora. No registra nada.
struct RiesgoSalida: Hashable {
    let corriendo: [ActividadEnRiesgo]
    let porCerrar: [ActividadEnRiesgo]

    init(corriendo: [ActividadEnRiesgo] = [], porCerrar: [ActividadEnRiesgo] = []) {
        self.corriendo = corriendo
        self.porCerrar = porCerrar
    }

    init(raw: [String: Any]) {
        corriendo = (raw["corriendo"] as? [[String: Any]] ?? []).map { ActividadEnRiesgo(raw: $0) }
        porCerrar = (raw["porCerrar"] as? [[String: Any]] ?? []).map { ActividadEnRiesgo(raw: $0) }
    }
}

/// `POST attendance/salida/deshacer`: la propia persona, dentro de 10 minutos.
struct DeshacerSalidaResultado {
    let message: String
    /// Folios que ya no quedan «No cumplida». El API puede mandar `null` en alguno.
    let noCumplidasRegresadas: [String?]
    let relojesReabiertos: Int

    init(raw: [String: Any]) {
        message = ActivityParse.str(raw["message"])
        let folios: [Any] = raw["noCumplidasRegresadas"] as? [Any] ?? []
        noCumplidasRegresadas = folios.map { $0 as? String }
        relojesReabiertos = ActivityParse.int(raw["relojesReabiertos"]) ?? 0
    }
}

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

    /// Checada. `photoBase64` es obligatoria en el API (`CreateAttendanceDto`): data URL JPEG.
    ///
    /// Los tres campos de confianza viajan igual que en Android: `accuracyM` (qué tan
    /// buena era la señal), `mockLocation` (el punto lo produjo software — el servidor
    /// contesta 422 y avisa a sus jefes) y `fixAgeMs` (de cuándo es la medición). Hasta
    /// ahora el iPhone no mandaba ninguno, así que una ubicación falsa desde iOS entraba
    /// a la nómina sin que nadie pudiera notarlo.
    ///
    /// `capturedAt` es la hora del teléfono y es informativa: la hora del registro la pone
    /// el servidor (contrato A). Igual que Android ya no se manda `timestamp`, el campo
    /// viejo de la app 1.0.2 que el API solo tolera por compatibilidad.
    ///
    /// `ubicacionFalla` dice por qué no hubo coordenadas (`UbicacionFalla`); solo viaja si
    /// de verdad faltan: con coordenadas no hay nada que explicar.
    ///
    /// `confirmada`: la persona ya vio qué se detiene en la hoja de «Terminar mi jornada»; el
    /// servidor no la vuelve a frenar. Solo viaja si es verdadero.
    func attendanceCheckInResult(
        type: String,
        lat: Double? = nil,
        lng: Double? = nil,
        accuracyM: Double? = nil,
        mockLocation: Bool = false,
        fixAgeMs: Int? = nil,
        photoBase64: String? = nil,
        ubicacionFalla: String? = nil,
        confirmada: Bool = false
    ) async throws -> AttendanceCheckInResult {
        struct Body: Encodable {
            let type: String
            let capturedAt: String
            let photoBase64: String?
            let latitude: Double?
            let longitude: Double?
            let accuracyM: Double?
            let mockLocation: Bool
            let fixAgeMs: Int?
            let ubicacionFalla: String?
            let confirmada: Bool?
        }
        let data = try await api.postJSON("attendance", body: Body(
            type: type,
            capturedAt: ConsoleHelpers.isoNow(),
            photoBase64: photoBase64,
            latitude: lat,
            longitude: lng,
            accuracyM: accuracyM.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil },
            mockLocation: mockLocation,
            fixAgeMs: fixAgeMs.flatMap { $0 >= 0 ? $0 : nil },
            ubicacionFalla: (lat == nil || lng == nil) ? ubicacionFalla : nil,
            confirmada: confirmada ? true : nil
        ))
        return AttendanceCheckInResult(raw: ConsoleHelpers.decodeMap(data))
    }

    /// `GET attendance/salida/riesgo`: lo que se detiene si checa salida ahora.
    func riesgoSalida() async throws -> RiesgoSalida {
        let data = try await api.get("attendance/salida/riesgo")
        return RiesgoSalida(raw: ConsoleHelpers.decodeMap(data))
    }

    /// `POST attendance/salida/deshacer`. Solo en línea (`ApiClient.isOnlineOnly`): vale 10
    /// minutos y, encolada, caería cuando ya no aplica.
    func deshacerSalida() async throws -> DeshacerSalidaResultado {
        struct Body: Encodable {}
        try await CoreRepository.requireOnline()
        let data = try await api.postJSON("attendance/salida/deshacer", body: Body())
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
        return DeshacerSalidaResultado(raw: ConsoleHelpers.decodeMap(data))
    }

    /// `POST attendance/estado-ubicacion { estado }`: APAGADA, SIN_PERMISO o ENCENDIDA
    /// (`EstadoUbicacion`). Va por el cliente normal, con la identidad del teléfono, y sin
    /// conexión espera en la cola como cualquier otro envío. El servidor pone la hora.
    func attendanceEstadoUbicacion(_ estado: String) async throws {
        struct Body: Encodable {
            let estado: String
        }
        _ = try await api.postJSON("attendance/estado-ubicacion", body: Body(estado: estado))
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
    /// - Parameter mockLocation: el punto lo produjo software. Aquí el servidor **no**
    ///   rechaza nada —el recorrido de la jornada no decide nómina, y un hueco no se puede
    ///   leer— pero lo guarda marcado, que es lo que permite ver después que media jornada
    ///   venía de una app de GPS falso.
    func gpsPost(
        lat: Double,
        lng: Double,
        speedKmh: Double? = nil,
        actividadId: Int? = nil,
        mockLocation: Bool? = nil,
        /// Hora en que se midió (un punto que se reenvía al volver la sesión); nil = ahora.
        medidoEn: Date? = nil
    ) async throws {
        struct Body: Encodable {
            let latitud: Double
            let longitud: Double
            let velocidadKmh: Double?
            let estaActivo: Bool
            let ultimaActualizacion: String
            let actividadId: Int?
            let mockLocation: Bool?
        }
        _ = try await api.postJSON("gps", body: Body(
            latitud: lat, longitud: lng, velocidadKmh: speedKmh, estaActivo: true,
            ultimaActualizacion: medidoEn.map { ISO8601DateFormatter().string(from: $0) } ?? ConsoleHelpers.isoNow(),
            actividadId: actividadId,
            mockLocation: mockLocation
        ))
    }
}
