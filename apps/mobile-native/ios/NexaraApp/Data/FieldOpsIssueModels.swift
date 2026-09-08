import Foundation

// Modelos de la operación de campo que iOS todavía no tenía: incidencias,
// recomendaciones, reasignaciones, la vista detallada de actividades y el GPS.
//
// Por qué un fichero nuevo y no `ActivityModels.swift`: ese fichero lo tocan
// otras pantallas y `ActivityParse` ya rompió la compilación una vez por estar
// declarado dos veces. Aquí solo se **usa** `ActivityParse`, nunca se redeclara.

// MARK: – Parseo con claves alternativas

/// `ActivityParse.int64/int/double` toman **un** valor; estos toman varias
/// claves del mismo mapa porque el API mezcla nombres en castellano y en inglés
/// según el endpoint (`latitud` en GPS, `latitude` en evidencias).
///
/// Devuelven opcional a propósito: en GPS un `0` legítimo y un "no vino" tienen
/// que poder distinguirse, y `ConsoleHelpers.mapDouble` los aplana a `0`.
enum FieldOpsParse {
    static func int64(_ m: [String: Any], _ keys: String...) -> Int64? {
        for k in keys {
            if let v = ActivityParse.int64(m[k]) { return v }
        }
        return nil
    }

    static func double(_ m: [String: Any], _ keys: String...) -> Double? {
        for k in keys {
            if let v = ActivityParse.double(m[k]) { return v }
        }
        return nil
    }
}

// MARK: – Incidencias

/// Incidencia de un servicio — GET/POST `activities/:id/incidencias`.
/// Es lo que impidió o retrasó el trabajo en sitio; acaba en el reporte que ve
/// Dirección, así que no es un campo de texto libre: tipo y severidad son
/// catálogos cerrados (ver `FieldOpsCatalog`).
struct ActivityIncident: Identifiable, Hashable {
    let id: Int64
    let activityId: Int64
    let tipo: String
    let severidad: String
    let descripcion: String
    let accionTomada: String
    let horasPerdidas: Double
    let reportadoPor: String
    let resueltoPor: String
    let resueltoAt: String
    let createdAt: String

    /// Una incidencia está resuelta cuando el backend selló `resueltoAt`.
    /// No se infiere del estado de la actividad: se puede cerrar una OT con
    /// incidencias abiertas y el reporte tiene que reflejarlo.
    var isResolved: Bool { !resueltoAt.isEmpty }

    init(raw: [String: Any]) {
        id = ActivityParse.int64(raw["id"]) ?? 0
        activityId = FieldOpsParse.int64(raw, "activityId", "actividadId") ?? 0
        tipo = ActivityParse.str(raw["tipo"], raw["type"])
        severidad = ActivityParse.str(raw["severidad"], raw["severity"])
        descripcion = ActivityParse.str(raw["descripcion"], raw["description"])
        accionTomada = ActivityParse.str(raw["accionTomada"], raw["actionTaken"])
        horasPerdidas = FieldOpsParse.double(raw, "horasPerdidas", "lostHours") ?? 0
        reportadoPor = ActivityParse.nestedName(raw["reportadoPor"], raw["reportedBy"])
        resueltoPor = ActivityParse.nestedName(raw["resueltoPor"], raw["resolvedBy"])
        resueltoAt = ActivityParse.str(raw["resueltoAt"], raw["resolvedAt"])
        createdAt = ActivityParse.str(raw["createdAt"], raw["fechaCreacion"])
    }

    static func == (lhs: ActivityIncident, rhs: ActivityIncident) -> Bool {
        lhs.id == rhs.id && lhs.resueltoAt == rhs.resueltoAt
    }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: – Recomendaciones

/// Recomendación técnica — GET/POST `activities/:id/recomendaciones`.
/// Es la puerta de Ingeniería a Ventas: lo que el técnico vio en sitio y puede
/// convertirse en cotización.
struct ActivityRecommendation: Identifiable, Hashable {
    let id: Int64
    let activityId: Int64
    let tipo: String
    let prioridad: String
    let estado: String
    let descripcion: String
    let costoEstimado: Double
    let cotizacionNumero: String
    let creadoPor: String
    let createdAt: String

    /// Solo una recomendación abierta se puede descartar; el resto ya pasó por
    /// Ventas y cambiarla desde el móvil pisaría su flujo.
    var isOpen: Bool { estado.uppercased() == "ABIERTA" }

    init(raw: [String: Any]) {
        id = ActivityParse.int64(raw["id"]) ?? 0
        activityId = FieldOpsParse.int64(raw, "activityId", "actividadId") ?? 0
        tipo = ActivityParse.str(raw["tipo"], raw["type"])
        prioridad = ActivityParse.str(raw["prioridad"], raw["priority"])
        estado = ActivityParse.str(raw["estado"], raw["status"])
        descripcion = ActivityParse.str(raw["descripcion"], raw["description"])
        costoEstimado = FieldOpsParse.double(raw, "costoEstimado", "estimatedCost") ?? 0
        let cot = raw["cotizacion"] as? [String: Any]
        cotizacionNumero = ActivityParse.str(cot?["quoteNumber"], cot?["numero"], raw["cotizacionId"])
        creadoPor = ActivityParse.nestedName(raw["creadoPor"], raw["createdBy"])
        createdAt = ActivityParse.str(raw["createdAt"], raw["fechaCreacion"])
    }

    static func == (lhs: ActivityRecommendation, rhs: ActivityRecommendation) -> Bool {
        lhs.id == rhs.id && lhs.estado == rhs.estado
    }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: – Reasignaciones

/// Fila del historial de reasignación — GET `activities/:id/reasignaciones`.
/// El nombre de quién soltó y quién recogió la OT es justamente el dato que
/// pide Dirección cuando un servicio se retrasa.
struct ActivityReassignment: Identifiable, Hashable {
    let id: Int64
    let deUsuario: String
    let aUsuario: String
    let motivo: String
    let porUsuario: String
    let createdAt: String

    init(raw: [String: Any]) {
        id = ActivityParse.int64(raw["id"]) ?? 0
        deUsuario = ActivityParse.nestedName(raw["deUsuario"], raw["fromUser"], raw["anterior"])
        aUsuario = ActivityParse.nestedName(raw["aUsuario"], raw["toUser"], raw["nuevo"])
        motivo = ActivityParse.str(raw["motivo"], raw["reason"])
        porUsuario = ActivityParse.nestedName(raw["reasignadoPor"], raw["porUsuario"], raw["byUser"])
        createdAt = ActivityParse.str(raw["createdAt"], raw["fecha"])
    }

    static func == (lhs: ActivityReassignment, rhs: ActivityReassignment) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: – Actividades detalladas

/// Fila de `GET activities/detailed` (permiso `console.admin`).
/// Trae en una sola llamada lo que hasta ahora exigía abrir cada OT: evidencias
/// con coordenadas, hoja de servicio y la encuesta del cliente.
struct ActivityDetailedItem: Identifiable, Hashable {
    let id: Int64
    let anNumber: String
    let titulo: String
    let estatus: String
    let prioridad: String
    let ticketType: String
    let fechaAsignacion: String
    let fechaFinalizacion: String
    let branchName: String
    let branchCity: String
    let branchState: String
    let responsable: String
    let clientName: String
    let evidenceCount: Int
    /// Evidencias con `latitud`/`longitud` reales. Una evidencia sin coordenada
    /// no se cuenta como georreferenciada: es el dato con el que el dueño
    /// discute si el técnico estuvo o no en sitio.
    let geoEvidenceCount: Int
    let serviceSheetPdfUrl: String
    let clientRating: Int
    let clientComments: String

    init(raw: [String: Any]) {
        id = ActivityParse.int64(raw["id"]) ?? 0
        anNumber = ActivityParse.str(raw["anNumber"])
        titulo = ActivityParse.str(raw["titulo"], raw["title"])
        estatus = ActivityParse.str(raw["estatus"], raw["status"])
        prioridad = ActivityParse.str(raw["prioridad"], raw["priority"])
        ticketType = ActivityParse.str(raw["ticketType"], raw["tipo"])
        fechaAsignacion = ActivityParse.str(raw["fechaAsignacion"])
        fechaFinalizacion = ActivityParse.str(raw["fechaFinalizacion"])
        branchName = ActivityParse.str(raw["branchName"])
        branchCity = ActivityParse.str(raw["branchCity"])
        branchState = ActivityParse.str(raw["branchState"])
        responsable = ActivityParse.nestedName(raw["responsable"])
        clientName = ActivityParse.nestedName(raw["client"], raw["cliente"])

        let evidences = raw["evidencias"] as? [[String: Any]] ?? []
        evidenceCount = evidences.count
        geoEvidenceCount = evidences.filter {
            ActivityParse.double($0["latitud"]) != nil && ActivityParse.double($0["longitud"]) != nil
        }.count

        let sheet = raw["serviceSheet"] as? [String: Any]
        serviceSheetPdfUrl = ActivityParse.str(sheet?["pdfUrl"])

        let feedback = raw["clientFeedback"] as? [String: Any]
        clientRating = ActivityParse.int(feedback?["rating"]) ?? 0
        clientComments = ActivityParse.str(feedback?["comments"])
    }

    var locationLine: String {
        [branchName, branchCity, branchState].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    static func == (lhs: ActivityDetailedItem, rhs: ActivityDetailedItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: – GPS

/// Punto de `LocationTracking` — `gps/me`, `gps/team`, `gps/trajectory`.
/// `latitud`/`longitud` llegan como número o como string según el driver de la
/// base, por eso se parsean con `ActivityParse.double` y no con un `Decodable`.
struct GpsPoint: Identifiable, Hashable {
    let id: Int64
    let usuarioId: Int64
    let latitude: Double?
    let longitude: Double?
    let speedKmh: Double?
    let updatedAt: String
    let userName: String
    let activityTitle: String

    /// Un punto sin par de coordenadas finito no se pinta ni se cuenta.
    /// El `0,0` del Golfo de Guinea es el fallo clásico de estas pantallas y
    /// aquí se descarta explícitamente: nunca es una ubicación real de campo.
    var hasRealCoords: Bool {
        guard let lat = latitude, let lng = longitude else { return false }
        guard lat.isFinite, lng.isFinite else { return false }
        return !(abs(lat) < 0.0001 && abs(lng) < 0.0001)
    }

    init(raw: [String: Any]) {
        id = ActivityParse.int64(raw["id"]) ?? 0
        usuarioId = FieldOpsParse.int64(raw, "usuarioId", "userId") ?? 0
        latitude = FieldOpsParse.double(raw, "latitud", "latitude", "lat")
        longitude = FieldOpsParse.double(raw, "longitud", "longitude", "lng")
        speedKmh = FieldOpsParse.double(raw, "velocidadKmh", "speedKmh")
        updatedAt = ActivityParse.str(raw["ultimaActualizacion"], raw["capturedAt"], raw["createdAt"])
        userName = ActivityParse.nestedName(raw["usuario"], raw["user"], raw["userName"])
        activityTitle = ActivityParse.nestedName(raw["actividad"], raw["activity"])
    }

    var displayName: String {
        userName.isEmpty ? "Usuario \(usuarioId)" : userName
    }

    var coordsLabel: String {
        guard let lat = latitude, let lng = longitude, hasRealCoords else { return "Sin coordenada" }
        return String(format: "%.5f, %.5f", lat, lng)
    }

    var timeLabel: String {
        guard !updatedAt.isEmpty else { return "—" }
        return String(updatedAt.prefix(19)).replacingOccurrences(of: "T", with: " ")
    }

    static func == (lhs: GpsPoint, rhs: GpsPoint) -> Bool {
        lhs.id == rhs.id && lhs.updatedAt == rhs.updatedAt
    }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// Respuesta de `GET gps/me`: consentimiento + último punto propio.
///
/// `consent` es opcional a propósito. `nil` significa "el servidor no lo dijo",
/// que no es lo mismo que "el usuario dijo que no"; la UI tiene que distinguir
/// las dos cosas y no pintar un interruptor apagado como si fuera una negativa
/// del usuario.
struct GpsMeStatus {
    let consent: Bool?
    let location: GpsPoint?

    init(raw: [String: Any]) {
        if let b = raw["consent"] as? Bool {
            consent = b
        } else if let n = raw["consent"] as? NSNumber {
            consent = n.boolValue
        } else if let s = raw["consent"] as? String {
            consent = (s == "true" || s == "1")
        } else {
            consent = nil
        }
        if let loc = raw["location"] as? [String: Any], !loc.isEmpty {
            location = GpsPoint(raw: loc)
        } else {
            location = nil
        }
    }
}

// MARK: – Catálogos

/// Catálogos cerrados que el backend valida (`activity-issues.service.ts`).
/// Están copiados del Android (`ActivityDetailHelpers.kt`) para que las dos
/// apps manden exactamente los mismos códigos; si aquí se inventa un valor, el
/// API lo rechaza con 400.
enum FieldOpsCatalog {
    static let incidentTypes = [
        "ACCESO_DENEGADO", "FALTA_MATERIAL", "FALLA_EQUIPO", "CONDICION_INSEGURA",
        "CLIMA", "ALCANCE_ADICIONAL", "RETRASO_CLIENTE", "DANO_INSTALACION", "OTRO",
    ]
    static let incidentSeverities = ["BAJA", "MEDIA", "ALTA", "CRITICA"]
    static let recommendationTypes = [
        "CORRECTIVO", "PREVENTIVO", "MEJORA", "ACTUALIZACION", "CAPACITACION", "AMPLIACION",
    ]
    static let recommendationPriorities = ["BAJA", "MEDIA", "ALTA", "URGENTE"]

    private static let incidentTypeLabels = [
        "ACCESO_DENEGADO": "No dieron acceso",
        "FALTA_MATERIAL": "Faltó material",
        "FALLA_EQUIPO": "Falló el equipo",
        "CONDICION_INSEGURA": "Condición insegura",
        "CLIMA": "Clima",
        "ALCANCE_ADICIONAL": "Alcance adicional",
        "RETRASO_CLIENTE": "Retraso del cliente",
        "DANO_INSTALACION": "Daño en la instalación",
        "OTRO": "Otro",
    ]

    private static let recommendationTypeLabels = [
        "CORRECTIVO": "Correctivo",
        "PREVENTIVO": "Preventivo",
        "MEJORA": "Mejora",
        "ACTUALIZACION": "Actualización",
        "CAPACITACION": "Capacitación",
        "AMPLIACION": "Ampliación",
    ]

    private static let severityLabels = [
        "BAJA": "Baja", "MEDIA": "Media", "ALTA": "Alta", "CRITICA": "Crítica",
    ]

    private static let priorityLabels = [
        "BAJA": "Baja", "MEDIA": "Media", "ALTA": "Alta", "URGENTE": "Urgente",
    ]

    private static let recommendationStatusLabels = [
        "ABIERTA": "Abierta",
        "COTIZADA": "Cotizada",
        "ACEPTADA": "Aceptada",
        "RECHAZADA": "Rechazada",
        "DESCARTADA": "Descartada",
    ]

    static func incidentTypeLabel(_ code: String) -> String {
        incidentTypeLabels[code.uppercased()] ?? code
    }

    static func recommendationTypeLabel(_ code: String) -> String {
        recommendationTypeLabels[code.uppercased()] ?? code
    }

    static func severityLabel(_ code: String) -> String {
        severityLabels[code.uppercased()] ?? code
    }

    static func priorityLabel(_ code: String) -> String {
        priorityLabels[code.uppercased()] ?? code
    }

    static func recommendationStatusLabel(_ code: String) -> String {
        recommendationStatusLabels[code.uppercased()] ?? code
    }
}
