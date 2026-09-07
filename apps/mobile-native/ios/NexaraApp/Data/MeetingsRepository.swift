import Foundation

// MARK: - Catálogo del dominio (espejo Android MeetingCatalog / API meeting-rhythm)

enum MeetingCatalog {
    static let types: [(String, String)] = [
        ("DIARIA", "Reunión diaria"),
        ("PLANEACION_SEMANAL", "Planeación semanal"),
        ("REVISION_AVANCES", "Revisión de avances"),
        ("CIERRE_SEMANAL", "Junta de cierre"),
        ("EXTRAORDINARIA", "Reunión extraordinaria"),
    ]

    static let defaultTime: [String: String] = [
        "DIARIA": "10:00",
        "PLANEACION_SEMANAL": "09:00",
        "REVISION_AVANCES": "10:00",
        "CIERRE_SEMANAL": "16:00",
        "EXTRAORDINARIA": "10:00",
    ]

    static let meetingStatuses: [(String, String)] = [
        ("PROGRAMADA", "Programada"),
        ("REALIZADA", "Realizada"),
        ("CANCELADA", "Cancelada"),
    ]

    static let agreementKinds: [(String, String)] = [
        ("ACUERDO", "Acuerdo"),
        ("LECCION", "Lección aprendida"),
        ("RIESGO", "Riesgo"),
    ]

    static let agreementStatuses: [(String, String)] = [
        ("PENDIENTE", "Pendiente"),
        ("EN_PROCESO", "En proceso"),
        ("CUMPLIDO", "Cumplido"),
        ("CANCELADO", "Cancelado"),
    ]

    static let agenda: [String: [String]] = [
        "DIARIA": [
            "Prioridades del día",
            "Servicios programados",
            "Materiales y herramienta requeridos",
            "Bloqueos e incidencias abiertas",
        ],
        "PLANEACION_SEMANAL": [
            "Metas de la semana",
            "Asignación de actividades por técnico",
            "Compras y materiales a gestionar",
            "Riesgos previstos",
        ],
        "REVISION_AVANCES": [
            "Avance contra el plan del lunes",
            "Actividades en riesgo de SLA",
            "Ajustes de asignación",
        ],
        "CIERRE_SEMANAL": [
            "Resultados de la semana",
            "Problemas encontrados",
            "Lecciones aprendidas",
            "Acuerdos para la semana entrante",
        ],
        "EXTRAORDINARIA": ["Motivo de la convocatoria", "Acuerdos"],
    ]

    static let openAgreementStatuses: Set<String> = ["PENDIENTE", "EN_PROCESO"]

    static func suggestedAgenda(_ tipo: String) -> String {
        (agenda[tipo.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()] ?? [])
            .map { "• \($0)" }
            .joined(separator: "\n")
    }

    static func defaultTitle(_ tipo: String) -> String { typeLabel(tipo) }

    static func typeLabel(_ raw: String) -> String { label(types, raw) }
    static func meetingStatusLabel(_ raw: String) -> String { label(meetingStatuses, raw) }
    static func agreementKindLabel(_ raw: String) -> String { label(agreementKinds, raw) }
    static func agreementStatusLabel(_ raw: String) -> String { label(agreementStatuses, raw) }

    static func requiresOwner(_ kind: String) -> Bool {
        kind.trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare("ACUERDO") == .orderedSame
    }

    static func isOpen(_ status: String) -> Bool {
        openAgreementStatuses.contains(status.trimmingCharacters(in: .whitespacesAndNewlines).uppercased())
    }

    private static func label(_ pairs: [(String, String)], _ raw: String) -> String {
        let key = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if let hit = pairs.first(where: { $0.0.caseInsensitiveCompare(key) == .orderedSame }) {
            return hit.1
        }
        return key.isEmpty ? "—" : key
    }
}

// MARK: - Form helpers (espejo Android MeetingForms)

enum MeetingForms {
    /// Roles que conducen la reunión — espejo `MEETINGS_LEAD_URL_RULES`.
    static let leadRoles: Set<String> = [
        "super_admin", "ceo", "arquitecto", "dir_operaciones", "dir_admin",
        "coord_admin", "coord_operaciones", "coord_ventas", "lider_diseno", "rh",
    ]

    static func canLeadMeetings(role: String?, isSuperAdmin: Bool) -> Bool {
        if isSuperAdmin { return true }
        guard let role else { return false }
        let key = role
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: " ", with: "_")
            .replacingOccurrences(of: "-", with: "_")
        return leadRoles.contains(key)
    }

    static func validateMeeting(
        tipo: String,
        fecha: String,
        titulo: String,
        horaInicio: String,
        agenda: String,
        asistentes: [Int64]
    ) -> Result<(tipo: String, fecha: String, titulo: String?, horaInicio: String?, agenda: String?, asistentes: [Int64]), String> {
        let cleanTipo = tipo.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if cleanTipo.isEmpty { return .failure("Elige el tipo de reunión") }
        if !MeetingCatalog.types.contains(where: { $0.0 == cleanTipo }) {
            return .failure("Tipo de reunión no reconocido")
        }
        let fechaLimpia = fecha.trimmingCharacters(in: .whitespacesAndNewlines)
        if fechaLimpia.isEmpty { return .failure("Indica la fecha de la reunión") }
        if !isValidDate(fechaLimpia) { return .failure("La fecha debe ser AAAA-MM-DD") }

        let hora = horaInicio.trimmingCharacters(in: .whitespacesAndNewlines)
        if !hora.isEmpty && !isValidTime(hora) {
            return .failure("La hora debe ser HH:MM de 24 horas")
        }

        let ids = Array(Set(asistentes.filter { $0 > 0 }))
        return .success((
            cleanTipo,
            fechaLimpia,
            titulo.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            hora.nilIfEmpty,
            agenda.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            ids
        ))
    }

    static func validateAgreement(
        tipo: String,
        descripcion: String,
        responsableId: Int64?,
        fechaCompromiso: String
    ) -> Result<(tipo: String, descripcion: String, responsableId: Int64?, fechaCompromiso: String?), String> {
        let cleanTipo = tipo.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if !MeetingCatalog.agreementKinds.contains(where: { $0.0 == cleanTipo }) {
            return .failure("Tipo de apunte no reconocido")
        }
        let texto = descripcion.trimmingCharacters(in: .whitespacesAndNewlines)
        if texto.isEmpty { return .failure("Escribe de qué se trata") }

        let owner = responsableId.flatMap { $0 > 0 ? $0 : nil }
        if MeetingCatalog.requiresOwner(cleanTipo) && owner == nil {
            return .failure("Un acuerdo necesita responsable; una lección o un riesgo, no")
        }

        let fecha = fechaCompromiso.trimmingCharacters(in: .whitespacesAndNewlines)
        if !fecha.isEmpty && !isValidDate(fecha) {
            return .failure("La fecha compromiso debe ser AAAA-MM-DD")
        }
        let fechaFinal = MeetingCatalog.requiresOwner(cleanTipo) ? fecha.nilIfEmpty : nil
        return .success((
            cleanTipo,
            texto,
            MeetingCatalog.requiresOwner(cleanTipo) ? owner : nil,
            fechaFinal
        ))
    }

    private static func isValidDate(_ value: String) -> Bool {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: value) != nil
    }

    private static func isValidTime(_ value: String) -> Bool {
        value.range(of: #"^([01]\d|2[0-3]):[0-5]\d$"#, options: .regularExpression) != nil
    }
}

// MARK: - DTOs

struct MeetingDto: Identifiable, Hashable {
    let id: Int64
    let tipo: String
    let titulo: String
    let fecha: String
    let horaInicio: String
    let estado: String
    let agenda: String
    let notas: String
    let facilitadorNombre: String
    let asistentes: Int
    let acuerdos: Int

    var tipoLabel: String { MeetingCatalog.typeLabel(tipo) }
    var estadoLabel: String { MeetingCatalog.meetingStatusLabel(estado) }
    var isClosed: Bool {
        estado.trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare("PROGRAMADA") != .orderedSame
    }

    var whenLabel: String {
        [String(fecha.prefix(10)), horaInicio]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    init(raw: [String: Any]) {
        let facilitador = raw["facilitador"] as? [String: Any]
        id = ConsoleHelpers.mapInt64(raw, "id") ?? 0
        tipo = ConsoleHelpers.mapStr(raw, "tipo")
        titulo = ConsoleHelpers.mapStr(raw, "titulo")
        fecha = ConsoleHelpers.mapStr(raw, "fecha")
        horaInicio = ConsoleHelpers.mapStr(raw, "horaInicio")
        estado = ConsoleHelpers.mapStr(raw, "estado")
        agenda = ConsoleHelpers.mapStr(raw, "agenda")
        notas = ConsoleHelpers.mapStr(raw, "notas")
        facilitadorNombre = facilitador.map {
            ConsoleHelpers.mapStr($0, "nombre", "email")
        } ?? ""
        asistentes = Self.countOrSize(raw["asistentes"])
        acuerdos = Self.countOrSize(raw["acuerdos"])
    }

    private static func countOrSize(_ value: Any?) -> Int {
        if let n = value as? NSNumber { return n.intValue }
        if let list = value as? [Any] { return list.count }
        return 0
    }
}

struct MeetingAgreementDto: Identifiable, Hashable {
    let id: Int64
    let meetingId: Int64
    let tipo: String
    let descripcion: String
    let estado: String
    let responsableId: Int64?
    let responsableNombre: String
    let fechaCompromiso: String
    let vencido: Bool
    let diasVencido: Int
    let meetingTitulo: String
    let meetingFecha: String
    let activityId: Int64?
    let activityNumero: String
    let activityTitulo: String

    var tipoLabel: String { MeetingCatalog.agreementKindLabel(tipo) }
    var estadoLabel: String { MeetingCatalog.agreementStatusLabel(estado) }
    var isOpen: Bool { MeetingCatalog.isOpen(estado) }

    var dueLabel: String {
        if vencido && diasVencido == 1 { return "Vencido hace 1 día" }
        if vencido { return "Vencido hace \(diasVencido) días" }
        if !fechaCompromiso.isEmpty { return "Vence el \(String(fechaCompromiso.prefix(10)))" }
        return "Sin fecha compromiso"
    }

    var activityLabel: String {
        [activityNumero, activityTitulo].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    init(raw: [String: Any]) {
        let responsable = raw["responsable"] as? [String: Any]
        let meeting = raw["meeting"] as? [String: Any]
        let activity = raw["activity"] as? [String: Any]
        id = ConsoleHelpers.mapInt64(raw, "id") ?? 0
        meetingId = ConsoleHelpers.mapInt64(raw, "meetingId")
            ?? (meeting.flatMap { ConsoleHelpers.mapInt64($0, "id") })
            ?? 0
        tipo = {
            let t = ConsoleHelpers.mapStr(raw, "tipo")
            return t.isEmpty ? "ACUERDO" : t
        }()
        descripcion = ConsoleHelpers.mapStr(raw, "descripcion")
        estado = ConsoleHelpers.mapStr(raw, "estado")
        responsableId = ConsoleHelpers.mapInt64(raw, "responsableId")
            ?? responsable.flatMap { ConsoleHelpers.mapInt64($0, "id") }
        responsableNombre = responsable.map {
            ConsoleHelpers.mapStr($0, "nombre", "email")
        } ?? ""
        fechaCompromiso = ConsoleHelpers.mapStr(raw, "fechaCompromiso")
        vencido = (raw["vencido"] as? Bool) == true
        diasVencido = Int(ConsoleHelpers.mapInt64(raw, "diasVencido") ?? 0)
        meetingTitulo = meeting.map { ConsoleHelpers.mapStr($0, "titulo") } ?? ""
        meetingFecha = meeting.map { ConsoleHelpers.mapStr($0, "fecha") } ?? ""
        activityId = ConsoleHelpers.mapInt64(raw, "activityId")
            ?? activity.flatMap { ConsoleHelpers.mapInt64($0, "id") }
        activityNumero = activity.map { ConsoleHelpers.mapStr($0, "anNumber") } ?? ""
        activityTitulo = activity.map { ConsoleHelpers.mapStr($0, "titulo") } ?? ""
    }
}

/// Persona convocada. Lleva `userId` a propósito: PUT asistencia reemplaza el acta
/// entero y necesita ids de todos los convocados, no sólo nombres.
struct MeetingAttendeeDto: Identifiable, Hashable {
    let userId: Int64
    let nombre: String
    let asistio: Bool

    var id: Int64 { userId }
    var displayName: String { nombre.isEmpty ? "Usuario \(userId)" : nombre }

    init(raw: [String: Any]) {
        let user = raw["user"] as? [String: Any]
        userId = ConsoleHelpers.mapInt64(raw, "userId")
            ?? (user.flatMap { ConsoleHelpers.mapInt64($0, "id") })
            ?? 0
        nombre = user.map { ConsoleHelpers.mapStr($0, "nombre", "email") } ?? ""
        asistio = (raw["asistio"] as? Bool) == true
    }
}

struct MeetingAttendeeMark: Encodable {
    let userId: Int64
    let asistio: Bool
}

struct MeetingDetailDto {
    let meeting: MeetingDto
    let acuerdos: [MeetingAgreementDto]
    let asistentes: [MeetingAttendeeDto]

    var attendanceLabel: String {
        if asistentes.isEmpty { return "Sin convocados" }
        let present = asistentes.filter(\.asistio).count
        return "\(present) de \(asistentes.count) asistieron"
    }

    init(raw: [String: Any]) {
        meeting = MeetingDto(raw: raw)
        let acuerdosRaw = (raw["acuerdos"] as? [[String: Any]]) ?? []
        let asistentesRaw = (raw["asistentes"] as? [[String: Any]]) ?? []
        acuerdos = acuerdosRaw.map { MeetingAgreementDto(raw: $0) }
        // Sin id de usuario no se puede reenviar en el acta.
        asistentes = asistentesRaw
            .map { MeetingAttendeeDto(raw: $0) }
            .filter { $0.userId > 0 }
    }
}

struct MyAgreementsDto {
    let total: Int
    let vencidos: Int
    let acuerdos: [MeetingAgreementDto]
}

struct MeetingStaffPerson: Identifiable, Hashable {
    let id: Int64
    let nombre: String

    init(raw: [String: Any]) {
        id = ConsoleHelpers.mapInt64(raw, "id") ?? 0
        let name = ConsoleHelpers.mapStr(raw, "nombre", "name", "email")
        nombre = name.isEmpty ? "Usuario \(id)" : name
    }
}

// MARK: - Repository

/// Ritmo operativo: reuniones, acuerdos y lecciones. Espejo Android `MeetingsRepository`.
final class MeetingsRepository {
    static let shared = MeetingsRepository()
    private let api = ApiClient.shared
    private init() {}

    func meetings(
        tipo: String? = nil,
        estado: String? = nil,
        desde: String? = nil,
        hasta: String? = nil
    ) async throws -> [MeetingDto] {
        var q: [String: String] = [:]
        if let tipo, !tipo.isEmpty { q["tipo"] = tipo }
        if let estado, !estado.isEmpty { q["estado"] = estado }
        if let desde, !desde.isEmpty { q["desde"] = desde }
        if let hasta, !hasta.isEmpty { q["hasta"] = hasta }
        return rows(try await api.get("reuniones", query: q)).map { MeetingDto(raw: $0) }
    }

    func meeting(id: Int64) async throws -> MeetingDetailDto {
        MeetingDetailDto(raw: ConsoleHelpers.decodeMap(try await api.get("reuniones/\(id)")))
    }

    func createMeeting(
        tipo: String,
        fecha: String,
        titulo: String? = nil,
        horaInicio: String? = nil,
        agenda: String? = nil,
        asistentes: [Int64] = []
    ) async throws -> MeetingDetailDto {
        struct Body: Encodable {
            let tipo: String
            let fecha: String
            let titulo: String?
            let horaInicio: String?
            let agenda: String?
            let asistentes: [Int64]?
        }
        let data = try await api.postJSON(
            "reuniones",
            body: Body(
                tipo: tipo,
                fecha: fecha,
                titulo: titulo,
                horaInicio: horaInicio,
                agenda: agenda,
                // Lista vacía como null: el servidor no interpreta «convoca a nadie» como borrado.
                asistentes: asistentes.isEmpty ? nil : asistentes
            )
        )
        return MeetingDetailDto(raw: ConsoleHelpers.decodeMap(data))
    }

    func closeMeeting(id: Int64, notas: String?) async throws -> MeetingDetailDto {
        struct Body: Encodable { let notas: String? }
        let data = try await api.postJSON("reuniones/\(id)/cerrar", body: Body(notas: notas))
        return MeetingDetailDto(raw: ConsoleHelpers.decodeMap(data))
    }

    /// Pasa lista. El servidor **reemplaza** la lista completa: hay que mandar
    /// a todos los convocados (presentes y ausentes). Mandar sólo los presentes
    /// borra a los ausentes del acta.
    func setAttendance(id: Int64, marks: [MeetingAttendeeMark]) async throws -> MeetingDetailDto {
        struct Body: Encodable { let asistentes: [MeetingAttendeeMark] }
        let data = try await api.putJSON("reuniones/\(id)/asistencia", body: Body(asistentes: marks))
        return MeetingDetailDto(raw: ConsoleHelpers.decodeMap(data))
    }

    func addAgreement(
        meetingId: Int64,
        tipo: String,
        descripcion: String,
        responsableId: Int64? = nil,
        fechaCompromiso: String? = nil,
        activityId: Int64? = nil
    ) async throws -> MeetingDetailDto {
        struct Body: Encodable {
            let tipo: String
            let descripcion: String
            let responsableId: Int64?
            let fechaCompromiso: String?
            let activityId: Int64?
        }
        let data = try await api.postJSON(
            "reuniones/\(meetingId)/acuerdos",
            body: Body(
                tipo: tipo,
                descripcion: descripcion.trimmingCharacters(in: .whitespacesAndNewlines),
                responsableId: responsableId,
                fechaCompromiso: fechaCompromiso,
                activityId: activityId
            )
        )
        return MeetingDetailDto(raw: ConsoleHelpers.decodeMap(data))
    }

    func updateAgreement(
        meetingId: Int64,
        agreementId: Int64,
        estado: String? = nil,
        descripcion: String? = nil,
        responsableId: Int64? = nil,
        fechaCompromiso: String? = nil
    ) async throws -> MeetingDetailDto {
        struct Body: Encodable {
            let estado: String?
            let descripcion: String?
            let responsableId: Int64?
            let fechaCompromiso: String?
        }
        let data = try await api.patchJSON(
            "reuniones/\(meetingId)/acuerdos/\(agreementId)",
            body: Body(
                estado: estado,
                descripcion: descripcion,
                responsableId: responsableId,
                fechaCompromiso: fechaCompromiso
            )
        )
        return MeetingDetailDto(raw: ConsoleHelpers.decodeMap(data))
    }

    func myAgreements() async throws -> MyAgreementsDto {
        let body = ConsoleHelpers.decodeMap(try await api.get("reuniones/mis-acuerdos"))
        let acuerdos = listUnder(body, "acuerdos").map { MeetingAgreementDto(raw: $0) }
        let total = intOf(body["total"]) ?? acuerdos.count
        let vencidos = intOf(body["vencidos"]) ?? acuerdos.filter(\.vencido).count
        return MyAgreementsDto(total: total, vencidos: vencidos, acuerdos: acuerdos)
    }

    func updateMyAgreement(agreementId: Int64, estado: String) async throws {
        struct Body: Encodable { let estado: String }
        _ = try await api.patchJSON("reuniones/mis-acuerdos/\(agreementId)", body: Body(estado: estado))
    }

    func overdueAgreements() async throws -> [MeetingAgreementDto] {
        let body = ConsoleHelpers.decodeMap(try await api.get("reuniones/acuerdos/vencidos"))
        return listUnder(body, "acuerdos").map { MeetingAgreementDto(raw: $0) }
    }

    func lessons(query: String? = nil) async throws -> [MeetingAgreementDto] {
        var q: [String: String] = [:]
        if let query, !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            q["q"] = query.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return rows(try await api.get("reuniones/lecciones", query: q)).map { MeetingAgreementDto(raw: $0) }
    }

    // MARK: - Lectura cruda

    private func rows(_ data: Data) -> [[String: Any]] {
        if let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            return arr
        }
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            for key in ["items", "data", "acuerdos", "results", "rows"] {
                let list = listUnder(obj, key)
                if !list.isEmpty { return list }
            }
        }
        return []
    }

    private func listUnder(_ map: [String: Any], _ key: String) -> [[String: Any]] {
        (map[key] as? [[String: Any]]) ?? []
    }

    private func intOf(_ value: Any?) -> Int? {
        if let n = value as? NSNumber { return n.intValue }
        if let s = value as? String { return Int(s) }
        return nil
    }
}
