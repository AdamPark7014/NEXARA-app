import Foundation

// Modelos de NEXARA Core (ERP): Mis actividades, pizarra del equipo, evidencias
// por persona y el flujo de captura del ejecutor. Espejo de
// `apps/web/lib/my-activities-api.ts`, `apps/web/lib/team-board-api.ts` y de lo
// que devuelve `activity-evidence/:id`. Casi todo es opcional a propósito: una
// fila con un campo nulo no debe tumbar la lista entera.

// MARK: - JSON flexible

/// Valor JSON arbitrario (`serviceSheetData`, `rejectedSteps` y demás columnas `Json`).
enum JSONValue: Decodable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .null
        }
    }

    var objectValue: [String: JSONValue]? {
        if case .object(let value) = self { return value }
        return nil
    }

    var arrayValue: [JSONValue]? {
        if case .array(let value) = self { return value }
        return nil
    }

    var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    /// Texto legible para mostrar un campo de formulario.
    var displayText: String? {
        switch self {
        case .string(let value):
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        case .number(let value):
            if value.rounded() == value, abs(value) < 1e15 { return String(Int64(value)) }
            return String(value)
        case .bool(let value):
            return value ? "Sí" : "No"
        case .array(let values):
            let parts = values.compactMap { $0.displayText }
            return parts.isEmpty ? nil : parts.joined(separator: ", ")
        case .object, .null:
            return nil
        }
    }
}

/// Número que puede llegar como número o como texto (los `Decimal` de Prisma viajan como texto).
struct FlexDouble: Decodable, Hashable {
    let value: Double?

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let number = try? container.decode(Double.self) {
            value = number
        } else if let text = try? container.decode(String.self) {
            value = Double(text.trimmingCharacters(in: .whitespaces))
        } else {
            value = nil
        }
    }
}

private func coreHasText(_ value: String?) -> Bool {
    !(value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
}

// MARK: - Reglas de evidencia (espejo de evidence-flow-helpers)

struct CoreFormField: Hashable, Identifiable {
    let key: String
    let label: String
    var id: String { key }
}

enum CoreEvidence {
    static let entryPhoto = "ENTRY_PHOTO"
    static let evidencePhotos = "EVIDENCE_PHOTOS"
    static let serviceSheetPdf = "SERVICE_SHEET_PDF"
    static let serviceSheetData = "SERVICE_SHEET_DATA"
    static let exitPhoto = "EXIT_PHOTO"
    static let completed = "COMPLETED"

    static func requiresServiceSheetPdf(_ coreKind: String?) -> Bool {
        (coreKind ?? "").lowercased() == "servicio"
    }

    /// Pasos en orden, sin el marcador `COMPLETED`.
    static func steps(for coreKind: String?) -> [String] {
        if requiresServiceSheetPdf(coreKind) {
            return [entryPhoto, evidencePhotos, serviceSheetPdf, serviceSheetData, exitPhoto]
        }
        return [entryPhoto, evidencePhotos, serviceSheetData, exitPhoto]
    }

    static func label(_ step: String) -> String {
        switch step {
        case entryPhoto: return "Foto de entrada"
        case evidencePhotos: return "Fotos en sitio"
        case serviceSheetPdf: return "Hoja de servicio (PDF)"
        case serviceSheetData: return "Formulario"
        case exitPhoto: return "Foto de salida"
        case completed: return "Enviada"
        default: return step
        }
    }

    /// Campos del formulario digital por tipo (espejo de `digitalFormLabels`).
    static func formFields(for coreKind: String?) -> [CoreFormField] {
        switch (coreKind ?? "tarea").lowercased() {
        case "servicio":
            return [
                CoreFormField(key: "sucursal", label: "Sucursal"),
                CoreFormField(key: "gerenteEncargado", label: "Gerente / encargado"),
                CoreFormField(key: "queSeHizo", label: "Qué se hizo"),
                CoreFormField(key: "observaciones", label: "Observaciones"),
            ]
        case "proyecto", "obra":
            return [
                CoreFormField(key: "lugar", label: "Lugar"),
                CoreFormField(key: "encargadoSitio", label: "Encargado en sitio"),
                CoreFormField(key: "queSeHizo", label: "Qué se hizo"),
                CoreFormField(key: "observaciones", label: "Observaciones"),
            ]
        case "comercial":
            return [
                CoreFormField(key: "queHiciste", label: "Qué hiciste"),
                CoreFormField(key: "clienteOProyecto", label: "Cliente o proyecto"),
            ]
        default:
            return [CoreFormField(key: "queHiciste", label: "Qué hiciste")]
        }
    }

    static let ratingLabels = ["", "Deficiente", "Regular", "Buena", "Muy buena", "Excelente"]

    static func ratingLabel(_ value: Int) -> String {
        ratingLabels.indices.contains(value) ? ratingLabels[value] : ""
    }
}

// MARK: - Organización (mismas reglas que el API)

enum CoreOrg {
    static let ceoEmail = "gerencia@nexara.com.mx"
    static let serviceCoordinatorEmail = "direccion.operaciones@nexara.com.mx"
    /// Tester: debe tener EXACTAMENTE los mismos permisos que Christian sin
    /// aparecer como empleada. Owner rule (Adam) — ver `isCeo` / `isNonEmployee`.
    static let claudiaTesterEmail = "claudia.bernal@nexara.com.mx"
    /// Cuenta demo de revisión de tiendas (Apple/Google).
    static let playReviewEmail = "play.review@nexara.com.mx"

    /// Christian y su equivalente de permisos (Claudia). Cualquier decisión de
    /// permisos que comparaba contra `ceoEmail` directo debe usar `isCeo(_:)`.
    static let ceoEquivalentEmails: Set<String> = [ceoEmail, claudiaTesterEmail]

    /// Cuentas de plataforma / pruebas que NUNCA deben listarse como empleados
    /// (equipo, pizarra, pickers de "asignar a", listas de asistencia/comida).
    static var nonEmployeeEmails: Set<String> { [ceoEmail, developerEmail, claudiaTesterEmail, playReviewEmail] }

    /// A quién puede pasar cada encargado un despacho (espejo de `DISPATCH_POOLS`).
    static let dispatchPools: [String: [String]] = [
        "direccion.operaciones@nexara.com.mx": ["jose.ramirez@nexara.com.mx"],
        "jose.ramirez@nexara.com.mx": ["soporte@nexara.com.mx", "alejandro.gonzalez@nexara.com.mx"],
        "operaciones@nexara.com.mx": [
            "joan.sanchez@nexara.com.mx",
            "israel.ramos@nexara.com.mx",
            "juan.gonzalez@nexara.com.mx",
        ],
        "infraestructura@nexara.com.mx": [
            "joan.sanchez@nexara.com.mx",
            "israel.ramos@nexara.com.mx",
            "juan.gonzalez@nexara.com.mx",
        ],
    ]

    static func normalized(_ email: String?) -> String {
        (email ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    static func isCeo(_ email: String?) -> Bool {
        ceoEquivalentEmails.contains(normalized(email))
    }

    /// Cuentas que nunca deben listarse como empleado (equipo/asignar/asistencia).
    static func isNonEmployee(_ email: String?) -> Bool {
        nonEmployeeEmails.contains(normalized(email))
    }

    static func dispatchPool(for email: String?) -> [String] {
        dispatchPools[normalized(email)] ?? []
    }
}

// MARK: - Formato

enum CoreFormat {
    private static let whenFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_MX")
        formatter.dateFormat = "EEE d MMM, HH:mm"
        return formatter
    }()

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_MX")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    static func date(_ iso: String?) -> Date? {
        guard let iso, !iso.isEmpty else { return nil }
        return ActivityParse.isoDate(iso)
    }

    /// «lun 14 sep, 10:30».
    static func when(_ iso: String?) -> String? {
        guard let date = date(iso) else { return nil }
        return whenFormatter.string(from: date)
    }

    static func when(_ date: Date) -> String {
        whenFormatter.string(from: date)
    }

    static func time(_ iso: String?) -> String? {
        guard let date = date(iso) else { return nil }
        return timeFormatter.string(from: date)
    }

    static func minutes(_ value: Int?) -> String? {
        guard let value, value > 0 else { return nil }
        let hours = value / 60
        let mins = value % 60
        if hours <= 0 { return "\(mins) min" }
        return mins > 0 ? "\(hours) h \(mins) min" : "\(hours) h"
    }

    /// Nombre y primer apellido.
    static func shortName(_ name: String?) -> String {
        (name ?? "").split(whereSeparator: { $0.isWhitespace }).prefix(2).joined(separator: " ")
    }

    static func initials(_ name: String) -> String {
        name.split(whereSeparator: { $0.isWhitespace })
            .prefix(2)
            .compactMap { $0.first.map { String($0) } }
            .joined()
            .uppercased()
    }

    static func isoString(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}

// MARK: - Mis actividades (GET me/activities)

struct MyActivityAssigner: Decodable, Hashable {
    let id: Int?
    let nombre: String?
}

struct MyActivityPassedTo: Decodable, Hashable {
    let nombre: String?
    let rol: String?
    let at: String?
    let por: String?
    let evidenceStatus: String?
}

struct MyActivityReschedule: Decodable, Hashable {
    let at: String?
    let por: String?
    let de: String?
    let a: String?
    let motivo: String?
}

struct MyActivityItem: Decodable, Identifiable, Hashable {
    let id: Int
    let anNumber: String?
    let titulo: String?
    let descripcion: String?
    let estatus: String?
    let prioridad: String?
    let coreKind: String?
    let ticketTypeCustom: String?
    let assignmentCharge: String?
    let fechaInicio: String?
    let fechaMaxima: String?
    let fechaAsignacion: String?
    let fechaFinalizacion: String?
    let tiempoEstimadoMin: Int?
    let tiempoMaximoMin: Int?
    let rol: String?
    let indicaciones: String?
    let asignadaPor: MyActivityAssigner?
    let autoAsignada: Bool?
    let proyecto: String?
    let cliente: String?
    let evidenceStatus: String?
    let orden: Int?
    let ordenJustificacion: String?
    let ordenActualizadoAt: String?
    let despachador: Bool?
    let porRepartir: Bool?
    let pasadaA: [MyActivityPassedTo]?
    let ultimaReprogramacion: MyActivityReschedule?

    var displayTitle: String {
        let title = (titulo ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return title.isEmpty ? "Actividad" : title
    }

    var folio: String { anNumber ?? "#\(id)" }
    var passedTo: [MyActivityPassedTo] { pasadaA ?? [] }
}

struct MyActivitiesResponse: Decodable {
    var canReorder: Bool
    var canSelfAssign: Bool
    var open: [MyActivityItem]
    var seguimiento: [MyActivityItem]
    var doneToday: [MyActivityItem]

    private enum CodingKeys: String, CodingKey {
        case canReorder, canSelfAssign, open, seguimiento, doneToday
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        canReorder = (try? container.decode(Bool.self, forKey: .canReorder)) ?? false
        canSelfAssign = (try? container.decode(Bool.self, forKey: .canSelfAssign)) ?? false
        open = try container.decodeIfPresent([MyActivityItem].self, forKey: .open) ?? []
        seguimiento = try container.decodeIfPresent([MyActivityItem].self, forKey: .seguimiento) ?? []
        doneToday = try container.decodeIfPresent([MyActivityItem].self, forKey: .doneToday) ?? []
    }
}

// MARK: - Pizarra del equipo (GET me/board)

struct TeamBoardActivity: Decodable, Hashable {
    let id: Int
    let anNumber: String?
    let titulo: String?
    let estatus: String?
    let fechaMaxima: String?
    let bucket: String?
}

struct TeamBoardOpenActivity: Decodable, Identifiable, Hashable {
    let id: Int
    let anNumber: String?
    let titulo: String?
    let estatus: String?
    let evidenceStatus: String?
    let progressPct: Double?
    let coreKind: String?
    let assignmentCharge: String?
    let fechaFinalizacion: String?
    let indicaciones: String?
    let teamEmails: [String]?
    let reparte: Bool?
    let fechaInicio: String?
}

struct TeamBoardUser: Decodable, Identifiable, Hashable {
    let id: Int
    let nombre: String
    let email: String?
    let avatarUrl: String?
    let puesto: String?
    let status: String?
    let currentActivity: TeamBoardActivity?
    let openActivities: [TeamBoardOpenActivity]?
    let clockInAt: String?
    let workedMinutes: Int?
    let activityStartedAt: String?
    let activityElapsedMinutes: Int?
    /// Atrasado: minutos pasados de la fecha máxima de lo que está haciendo.
    let currentLateMinutes: Int?
    /// Libre: desde cuándo no tiene nada abierto.
    let idleSinceAt: String?
    /// Libre: última actividad que terminó hoy.
    let lastFinished: TeamBoardLastFinished?
    /// Entregadas que nadie ha aprobado.
    let enEsperaAprobacion: Int?
    /// Con evidencia devuelta que está corrigiendo.
    let enCorreccion: Int?
}

/// `lastFinished` del tablero. `lateMinutes` nulo = la actividad no tenía fecha máxima.
struct TeamBoardLastFinished: Decodable, Hashable {
    let id: Int?
    let anNumber: String?
    let titulo: String?
    let finishedAt: String?
    let lateMinutes: Int?
}

struct TeamBoardResponse: Decodable {
    let scope: String?
    let users: [TeamBoardUser]
}

struct TeamBoardHistoryEvidence: Decodable, Hashable {
    let status: String?
    let progressPct: Double?
    let entryPhotoUrl: String?
    let evidencePhotos: [String]?
    let exitPhotoUrl: String?
    let serviceSheetPdfUrl: String?
    let serviceSheetData: JSONValue?
}

struct TeamBoardHistoryItem: Decodable, Identifiable, Hashable {
    let id: Int
    let anNumber: String?
    let titulo: String?
    let estatus: String?
    let coreKind: String?
    let ticketTypeCustom: String?
    let assignmentCharge: String?
    let fechaAsignacion: String?
    let fechaFinalizacion: String?
    let evidence: TeamBoardHistoryEvidence?
}

// MARK: - Evidencias del equipo (GET me/activities/:id/evidencias)

struct PhotoGeo: Decodable, Hashable {
    let latitude: FlexDouble?
    let longitude: FlexDouble?
    let capturedAt: String?
}

/// Lo que subió una persona. Sirve para la evidencia actual y para la copia
/// guardada al devolverla (`snapshot`), que no trae los campos de revisión.
struct TeamEvidenceData: Decodable, Hashable {
    let entryPhotoUrl: String?
    let entryLatitude: FlexDouble?
    let entryLongitude: FlexDouble?
    let entryPhotoUploadedAt: String?
    let evidencePhotos: [String]?
    let evidencePhotosGeo: [PhotoGeo?]?
    let evidencePhotosUploadedAt: String?
    let serviceSheetPdfUrl: String?
    let serviceSheetUploadedAt: String?
    let serviceSheetData: JSONValue?
    let serviceSheetCompletedAt: String?
    let exitPhotoUrl: String?
    let exitLatitude: FlexDouble?
    let exitLongitude: FlexDouble?
    let exitPhotoUploadedAt: String?
    let status: String?
    let completedAt: String?
    /// Cuándo reenvió lo que le devolvieron (COMPLETED + PENDING = corrección por revisar).
    let correctionSubmittedAt: String?
    let reviewStatus: String?
    let reviewNotes: String?
    let reviewedAt: String?
    let reviewedBy: String?

    var photos: [String] { evidencePhotos ?? [] }

    func geo(at index: Int) -> PhotoGeo? {
        guard let list = evidencePhotosGeo, list.indices.contains(index) else { return nil }
        return list[index]
    }

    var hasEntry: Bool { coreHasText(entryPhotoUrl) }
    var hasExit: Bool { coreHasText(exitPhotoUrl) }
    var hasPdf: Bool { coreHasText(serviceSheetPdfUrl) }

    /// Hora del paso: `nil` si falta; vacío si se hizo pero no hay hora registrada.
    func stepTime(_ step: String) -> String? {
        switch step {
        case CoreEvidence.entryPhoto:
            return hasEntry ? (entryPhotoUploadedAt ?? "") : nil
        case CoreEvidence.evidencePhotos:
            return photos.isEmpty ? nil : (evidencePhotosUploadedAt ?? "")
        case CoreEvidence.serviceSheetPdf:
            return hasPdf ? (serviceSheetUploadedAt ?? "") : nil
        case CoreEvidence.serviceSheetData:
            return serviceSheetCompletedAt
        case CoreEvidence.exitPhoto:
            return hasExit ? (exitPhotoUploadedAt ?? "") : nil
        default:
            return nil
        }
    }
}

struct TeamEvidencePassed: Decodable, Hashable {
    let nombre: String?
    let at: String?
}

struct TeamEvidenceReview: Decodable, Identifiable, Hashable {
    let id: Int
    /// APROBADA | DEVUELTA_PASOS | DEVUELTA_TODO
    let decision: String
    let pasos: [String]
    let observaciones: String
    let calificacion: Int?
    let at: String?
    let revisor: String?
    let snapshot: TeamEvidenceData?

    private enum CodingKeys: String, CodingKey {
        case id, decision, pasos, observaciones, calificacion, at, revisor, snapshot
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        decision = (try? container.decode(String.self, forKey: .decision)) ?? ""
        pasos = (try? container.decode([String].self, forKey: .pasos)) ?? []
        observaciones = (try? container.decode(String.self, forKey: .observaciones)) ?? ""
        calificacion = try? container.decode(Int.self, forKey: .calificacion)
        at = try? container.decode(String.self, forKey: .at)
        revisor = try? container.decode(String.self, forKey: .revisor)
        // La copia es JSON libre guardado en la base: si no cuadra, se ignora en vez de tumbar la vista.
        snapshot = try? container.decode(TeamEvidenceData.self, forKey: .snapshot)
    }
}

struct TeamEvidenceMember: Decodable, Identifiable, Hashable {
    let userId: Int
    let nombre: String
    let puesto: String?
    let avatarUrl: String?
    let rol: String?
    let reparte: Bool?
    let asignadoAt: String?
    let asignadoPor: String?
    let retiradoAt: String?
    let indicaciones: String?
    let pasoA: [TeamEvidencePassed]?
    let progressPct: Double?
    let puedoRevisar: Bool?
    let rejectedSteps: [String]?
    let eficienciaScore: Int?
    let revisiones: [TeamEvidenceReview]?
    let evidence: TeamEvidenceData?
    /// Salidas de la zona de 100 m alrededor de su punto de inicio, la más reciente primero.
    let alertasZona: [ActivityGeofenceAlert]?

    var id: Int { userId }
    var splits: Bool { reparte == true }
    var canReview: Bool { puedoRevisar == true }
    var zoneAlerts: [ActivityGeofenceAlert] { alertasZona ?? [] }
}

struct TeamEvidenceActivity: Decodable, Hashable {
    let id: Int
    let anNumber: String?
    let titulo: String?
    let estatus: String?
    let coreKind: String?
    let assignmentCharge: String?
    let evidencePhotoRequired: Int?
    let fechaFinalizacion: String?
}

struct TeamEvidenceSummary: Decodable, Hashable {
    let ejecutores: Int
    let terminaron: Int
    let aprobadas: Int
    let porRevisarMias: Int
}

struct TeamEvidenceResponse: Decodable {
    let activity: TeamEvidenceActivity
    /// todo · equipo · propio
    let alcance: String?
    let creador: String?
    let responsable: String?
    let soloLectura: Bool?
    let resumen: TeamEvidenceSummary
    let members: [TeamEvidenceMember]
}

struct ReviewEvidenceInput: Encodable {
    /// aprobar | devolver
    let decision: String
    let pasos: [String]?
    let todo: Bool?
    let observaciones: String
    let calificacion: Int
}

// MARK: - Flujo de captura (GET activity-evidence/:id)

struct EvidenceFlowActivityInfo: Decodable, Hashable {
    let id: Int?
    let indicaciones: String?
    let coreKind: String?
    let evidencePhotoRequired: Int?
    let responsableId: Int?
    let estatus: String?
}

struct EvidenceFlowState: Decodable, Hashable {
    let id: Int?
    let activityId: Int?
    let userId: Int?
    let status: String?
    let reviewStatus: String?
    let rejectedStep: String?
    let rejectedSteps: JSONValue?
    let reviewNotes: String?
    let entryPhotoUrl: String?
    let entryLatitude: FlexDouble?
    let entryLongitude: FlexDouble?
    let entryPhotoUploadedAt: String?
    let evidencePhotos: [String]?
    let evidencePhotosUploadedAt: String?
    let serviceSheetPdfUrl: String?
    let serviceSheetUploadedAt: String?
    let serviceSheetData: JSONValue?
    let serviceSheetCompletedAt: String?
    let exitPhotoUrl: String?
    let exitLatitude: FlexDouble?
    let exitLongitude: FlexDouble?
    let exitPhotoUploadedAt: String?
    let completedAt: String?
    let activity: EvidenceFlowActivityInfo?
    let assigneeIndicaciones: String?
    let progressPct: Double?

    var isCorrection: Bool { reviewStatus == "REJECTED" }
    /// Enviada y esperando revisión (o aprobada): ya no se toca.
    var isLocked: Bool { !isCorrection && status == CoreEvidence.completed }
    var photoList: [String] { evidencePhotos ?? [] }

    /// Pasos devueltos (espejo de `rejectedStepsList`).
    var rejectedList: [String] {
        if let values = rejectedSteps?.arrayValue {
            let list = values.compactMap { $0.stringValue }
            if !list.isEmpty { return list }
        }
        if let single = rejectedStep, !single.isEmpty { return [single] }
        return []
    }

    func isDone(_ step: String) -> Bool {
        switch step {
        case CoreEvidence.entryPhoto: return coreHasText(entryPhotoUrl)
        case CoreEvidence.evidencePhotos: return !photoList.isEmpty
        case CoreEvidence.serviceSheetPdf: return coreHasText(serviceSheetPdfUrl)
        case CoreEvidence.serviceSheetData: return serviceSheetCompletedAt != nil || serviceSheetData != nil
        case CoreEvidence.exitPhoto: return coreHasText(exitPhotoUrl)
        default: return false
        }
    }
}

// MARK: - Historial (GET activities/:id/timeline)

struct ActivityTimelineEvent: Decodable, Identifiable, Hashable {
    let id: String
    let at: String?
    let kind: String?
    let title: String?
    let subtitle: String?
    let icon: String?

    private enum CodingKeys: String, CodingKey {
        case id, at, kind, title, subtitle, icon
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let text = try? container.decode(String.self, forKey: .id) {
            id = text
        } else if let number = try? container.decode(Int.self, forKey: .id) {
            id = String(number)
        } else {
            id = UUID().uuidString
        }
        at = try? container.decode(String.self, forKey: .at)
        kind = try? container.decode(String.self, forKey: .kind)
        title = try? container.decode(String.self, forKey: .title)
        subtitle = try? container.decode(String.self, forKey: .subtitle)
        icon = try? container.decode(String.self, forKey: .icon)
    }
}

struct ActivityTimelineResponse: Decodable {
    let events: [ActivityTimelineEvent]?
}
