import Foundation

// Reglas de Core que la web decide por correo. Espejo de
// `apps/web/lib/activity-kinds.ts` y `apps/web/lib/client-sectors.ts`:
// si cambian allá, cambian aquí.

extension CoreOrg {
    static let developerEmail = "developer@nexara.com.mx"
    static let davidEmail = "operaciones@nexara.com.mx"
    static let luisEmail = "direccion.operaciones@nexara.com.mx"
    static let antonioEmail = "jose.ramirez@nexara.com.mx"
    static let carolinaEmail = "soporte@nexara.com.mx"
    static let alejandroEmail = "alejandro.gonzalez@nexara.com.mx"
    static let robertoEmail = "roberto.vivanco@nexara.com.mx"
    static let danielaEmail = "daniela.hernandez@nexara.com.mx"
    static let monicaEmail = "soluciones@nexara.com.mx"
    static let joanEmail = "joan.sanchez@nexara.com.mx"
    static let israelEmail = "israel.ramos@nexara.com.mx"
    static let juanEmail = "juan.gonzalez@nexara.com.mx"
    static let josueEmail = "infraestructura@nexara.com.mx"

    static var fieldInstallerEmails: [String] { [joanEmail, israelEmail, juanEmail] }
    static var servicioDelegateEmails: [String] { [carolinaEmail, alejandroEmail, robertoEmail] }
    static var soporteTeamEmails: [String] { [antonioEmail, carolinaEmail, alejandroEmail, robertoEmail] }
}

// MARK: - Sectores de clientes

enum ClientSector: String, CaseIterable, Identifiable, Hashable {
    case proyecto = "PROYECTO"
    case corporativo = "CORPORATIVO"
    case comercial = "COMERCIAL"

    var id: String { rawValue }

    var slug: String {
        switch self {
        case .proyecto: return "proyecto"
        case .corporativo: return "corporativo"
        case .comercial: return "comercial"
        }
    }

    var title: String {
        switch self {
        case .proyecto: return "Clientes de proyecto"
        case .corporativo: return "Clientes corporativos"
        case .comercial: return "Clientes comerciales"
        }
    }

    var shortTitle: String {
        switch self {
        case .proyecto: return "Proyecto"
        case .corporativo: return "Corporativo"
        case .comercial: return "Comercial"
        }
    }

    var help: String {
        switch self {
        case .proyecto: return "Se usan en actividades de tipo proyecto u obra. Aquí también creas sus proyectos."
        case .corporativo: return "Se usan en actividades de tipo servicio."
        case .comercial: return "Se usan en actividades de tipo comercial (también puedes sumarlos a otros sectores)."
        }
    }

    /// SF Symbol del sector (antes emoji).
    var symbol: String {
        switch self {
        case .proyecto: return "folder"
        case .corporativo: return "building.2"
        case .comercial: return "briefcase"
        }
    }

    private static let matrix: [String: [ClientSector]] = [
        CoreOrg.ceoEmail: ClientSector.allCases,
        CoreOrg.developerEmail: ClientSector.allCases,
        CoreOrg.antonioEmail: ClientSector.allCases,
        CoreOrg.luisEmail: [.corporativo],
        CoreOrg.davidEmail: [.proyecto, .comercial],
        CoreOrg.josueEmail: [.proyecto, .comercial],
        CoreOrg.monicaEmail: [.proyecto, .comercial],
        CoreOrg.danielaEmail: [.comercial],
    ]

    /// `clientSectorsForEmail`: vacío = no ve el módulo Clientes.
    static func sectors(for email: String?) -> [ClientSector] {
        matrix[CoreOrg.normalized(email)] ?? []
    }

    /// `clientSectorsForActivityKind`: sectores de cliente al asignar ese tipo.
    static func forActivityKind(_ kind: CoreActivityKind, email: String?) -> [ClientSector] {
        let allowed = sectors(for: email)
        switch kind {
        case .proyecto, .obra: return allowed.filter { $0 == .proyecto }
        case .servicio: return allowed.filter { $0 == .corporativo }
        case .comercial: return allowed
        case .tarea: return []
        }
    }
}

// MARK: - Tipos de actividad

enum CoreActivityKind: String, CaseIterable, Identifiable, Hashable {
    case tarea, proyecto, obra, servicio, comercial

    var id: String { rawValue }

    var title: String {
        switch self {
        case .tarea: return "Tarea"
        case .proyecto: return "Proyecto"
        case .obra: return "Obra"
        case .servicio: return "Servicio"
        case .comercial: return "Comercial"
        }
    }

    var help: String {
        switch self {
        case .tarea: return "Del día, sin proyecto ni cliente."
        case .proyecto: return "Liga a un proyecto operativo y su cliente."
        case .obra: return "Instalación / obra en sitio, ligada a proyecto."
        case .servicio: return "Cliente de servicio. Luis → Antonio → soporte."
        case .comercial: return "Solo encargados de área."
        }
    }

    /// SF Symbol del tipo (antes emoji).
    var symbol: String {
        switch self {
        case .tarea: return "checklist"
        case .proyecto: return "folder"
        case .obra: return "hammer"
        case .servicio: return "wrench.and.screwdriver"
        case .comercial: return "briefcase"
        }
    }

    /// `projectMode == with_project`.
    var withProject: Bool { self == .proyecto || self == .obra }

    var ticketType: String? {
        switch self {
        case .tarea, .comercial: return "OTRO"
        case .obra: return "INSTALACION"
        case .proyecto, .servicio: return nil
        }
    }

    var ticketTypeCustom: String? { self == .comercial ? "COMERCIAL" : nil }
    var needsServiceClient: Bool { self == .servicio }
    var requiresSchedule: Bool { self == .obra || self == .servicio }
}

/// Subtipos de Tarea: viajan como `ticketType OTRO` + `ticketTypeCustom = label`
/// (o el texto libre de «Otro»).
struct CoreTareaTipo: Identifiable, Hashable {
    let id: String
    let label: String
    /// SF Symbol (antes emoji).
    let symbol: String

    static let all: [CoreTareaTipo] = [
        CoreTareaTipo(id: "levantamiento", label: "Levantamiento", symbol: "ruler"),
        CoreTareaTipo(id: "recoleccion", label: "Recolección", symbol: "shippingbox"),
        CoreTareaTipo(id: "entrega", label: "Entrega", symbol: "truck.box"),
        CoreTareaTipo(id: "junta", label: "Junta", symbol: "person.2"),
        CoreTareaTipo(id: "compra", label: "Compra de material", symbol: "cart"),
        CoreTareaTipo(id: "preparacion", label: "Preparación de equipo", symbol: "wrench.adjustable"),
        CoreTareaTipo(id: "tramite", label: "Trámite", symbol: "doc.text"),
        CoreTareaTipo(id: "capacitacion", label: "Capacitación", symbol: "graduationcap"),
        CoreTareaTipo(id: "documentacion", label: "Reporte / documentación", symbol: "doc.richtext"),
        CoreTareaTipo(id: "otro", label: "Otro", symbol: "pencil"),
    ]
}

/// Encargo al responsable: la ejecuta él o la reparte a su equipo.
enum CoreAssignmentCharge: String, CaseIterable, Identifiable {
    case ejecucion, despacho

    var id: String { rawValue }

    var title: String {
        switch self {
        case .ejecucion: return "Ejecución directa"
        case .despacho: return "Despacho a equipo"
        }
    }

    var help: String {
        switch self {
        case .ejecucion: return "Queda a su cargo personal: la realiza él mismo."
        case .despacho: return "Queda a su cargo coordinar: la asigna a alguien de su subordinación."
        }
    }
}

enum CoreActivityRules {
    private static let all = CoreActivityKind.allCases

    private static let createByEmail: [String: [CoreActivityKind]] = [
        CoreOrg.ceoEmail: CoreActivityKind.allCases,
        CoreOrg.developerEmail: CoreActivityKind.allCases,
        CoreOrg.davidEmail: [.tarea, .proyecto, .obra, .comercial],
        CoreOrg.luisEmail: [.tarea, .proyecto, .servicio, .comercial],
        CoreOrg.antonioEmail: [.tarea, .proyecto, .servicio, .comercial],
        CoreOrg.danielaEmail: [.tarea, .comercial],
        CoreOrg.monicaEmail: [.tarea, .comercial],
        CoreOrg.joanEmail: [.tarea],
        CoreOrg.israelEmail: [.tarea],
        CoreOrg.juanEmail: [.tarea],
        CoreOrg.carolinaEmail: [.tarea],
        CoreOrg.alejandroEmail: [.tarea],
        CoreOrg.robertoEmail: [],
        CoreOrg.josueEmail: [.tarea, .proyecto, .obra, .comercial],
    ]

    private static let receiveByEmail: [String: [CoreActivityKind]] = [
        CoreOrg.ceoEmail: CoreActivityKind.allCases,
        CoreOrg.developerEmail: CoreActivityKind.allCases,
        CoreOrg.davidEmail: [.tarea, .proyecto, .obra, .comercial],
        CoreOrg.luisEmail: [.tarea, .proyecto, .servicio, .comercial],
        CoreOrg.antonioEmail: [.tarea, .proyecto, .servicio, .comercial],
        CoreOrg.joanEmail: [.tarea, .proyecto, .obra],
        CoreOrg.israelEmail: [.tarea, .proyecto, .obra],
        CoreOrg.juanEmail: [.tarea, .proyecto, .obra],
        CoreOrg.carolinaEmail: [.tarea, .proyecto, .servicio],
        CoreOrg.alejandroEmail: [.tarea, .proyecto, .servicio],
        // Roberto: solo atiende servicios.
        CoreOrg.robertoEmail: [.servicio],
        CoreOrg.danielaEmail: [.tarea, .comercial],
        CoreOrg.monicaEmail: [.tarea, .comercial],
        CoreOrg.josueEmail: [.tarea, .proyecto, .obra, .comercial],
    ]

    private static let chargeManagerEmails: Set<String> = [
        CoreOrg.davidEmail, CoreOrg.luisEmail, CoreOrg.antonioEmail, CoreOrg.josueEmail,
    ]

    private static let areaManagerEmails: Set<String> = [
        CoreOrg.developerEmail, CoreOrg.davidEmail, CoreOrg.luisEmail, CoreOrg.antonioEmail,
        CoreOrg.josueEmail, CoreOrg.danielaEmail, CoreOrg.monicaEmail,
    ]

    /// CEO o super admin (`v2Role` CEO / SUPER_ADMIN en la web).
    static func isCeoOrSuperAdmin(_ user: SessionUser?) -> Bool {
        guard let user else { return false }
        if user.isSuperAdmin || CoreOrg.isCeo(user.email) { return true }
        let role = RolePanelMatrix.canonicalRoleKey(
            roleKey: user.roleKey,
            orgRoleKey: user.orgRoleKey,
            roleDisplayName: user.role
        )
        return role == RolePanelMatrix.ceo || role == RolePanelMatrix.superAdmin
    }

    static func kindsForCreator(_ user: SessionUser?) -> [CoreActivityKind] {
        if isCeoOrSuperAdmin(user) { return all }
        return createByEmail[CoreOrg.normalized(user?.email)] ?? [.tarea]
    }

    static func kindsForTarget(email: String?) -> [CoreActivityKind] {
        let normalized = CoreOrg.normalized(email)
        guard !normalized.isEmpty else { return [.tarea] }
        return receiveByEmail[normalized] ?? [.tarea]
    }

    /// Creador × destinatario, en el orden fijo de los tipos.
    static func kindsForAssignment(creator: SessionUser?, targetEmail: String?) -> [CoreActivityKind] {
        let create = kindsForCreator(creator)
        guard let targetEmail, !CoreOrg.normalized(targetEmail).isEmpty else { return create }
        let receive = Set(kindsForTarget(email: targetEmail))
        return all.filter { create.contains($0) && receive.contains($0) }
    }

    static func isAreaManager(_ email: String?) -> Bool {
        areaManagerEmails.contains(CoreOrg.normalized(email))
    }

    static func canOfferAssignmentCharge(_ email: String?) -> Bool {
        chargeManagerEmails.contains(CoreOrg.normalized(email))
    }

    /// Luis + Servicio: siempre «Despacho a equipo» con cupo.
    static func forcesDespachoOnly(_ email: String?, kind: CoreActivityKind?) -> Bool {
        CoreOrg.normalized(email) == CoreOrg.luisEmail && kind == .servicio
    }

    /// Luis + Tarea / Proyecto / Comercial: ejecución directa.
    static func forcesEjecucionOnly(_ email: String?, kind: CoreActivityKind?) -> Bool {
        guard CoreOrg.normalized(email) == CoreOrg.luisEmail, let kind else { return false }
        return kind == .tarea || kind == .proyecto || kind == .comercial
    }

    /// Prefijo del cupo en las indicaciones del LEAD (`formatDispatchHeadcountNote`).
    static func dispatchHeadcountNote(_ count: Int, extra: String?) -> String {
        let cupo = max(1, min(50, count))
        let base = "Cupo: \(cupo) persona\(cupo == 1 ? "" : "s")."
        let more = (extra ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return more.isEmpty ? base : "\(base) \(more)"
    }

    /// Encargado de área del miembro (instaladores → David, soporte → Antonio).
    static func coordinatorEmail(forMember email: String?) -> String? {
        let normalized = CoreOrg.normalized(email)
        guard !normalized.isEmpty else { return nil }
        let managers = [CoreOrg.davidEmail, CoreOrg.antonioEmail, CoreOrg.josueEmail, CoreOrg.luisEmail]
        if managers.contains(normalized) { return normalized }
        if CoreOrg.fieldInstallerEmails.contains(normalized) { return CoreOrg.davidEmail }
        if CoreOrg.servicioDelegateEmails.contains(normalized) { return CoreOrg.antonioEmail }
        return nil
    }

    static func extrasEmails(for kind: CoreActivityKind?) -> [String]? {
        switch kind {
        case .servicio?: return CoreOrg.soporteTeamEmails
        case .obra?: return CoreOrg.fieldInstallerEmails
        case .proyecto?: return CoreOrg.fieldInstallerEmails + CoreOrg.soporteTeamEmails
        default: return nil
        }
    }

    /// Pool de equipo al asignar; vacío = sin filtro (todo el roster).
    static func teamPoolEmails(managerEmail: String?, kind: CoreActivityKind?, charge: CoreAssignmentCharge?) -> [String] {
        let manager = CoreOrg.normalized(managerEmail)
        let fromCharge = charge == .despacho ? CoreOrg.dispatchPool(for: managerEmail) : []
        let fromKind = extrasEmails(for: kind) ?? []
        if fromCharge.isEmpty && fromKind.isEmpty { return [] }
        var seen = Set<String>()
        var out: [String] = []
        for raw in fromCharge + fromKind {
            let email = CoreOrg.normalized(raw)
            if email.isEmpty || email == manager || seen.contains(email) { continue }
            seen.insert(email)
            out.append(email)
        }
        return out
    }

    /// Coordinadores ajenos al responsable que hay que sumar como LEAD.
    static func peerCoordinatorEmails(primaryEmail: String?, memberEmails: [String]) -> [String] {
        let primary = CoreOrg.normalized(primaryEmail)
        var seen = Set<String>()
        var out: [String] = []
        for raw in memberEmails {
            guard let coordinator = coordinatorEmail(forMember: raw),
                  coordinator != primary,
                  !seen.contains(coordinator) else { continue }
            seen.insert(coordinator)
            out.append(coordinator)
        }
        return out
    }

    /// Luis manda servicio primero a Antonio (salvo que el destinatario ya sea Antonio).
    static func servicioShouldGoToBridge(creator: SessionUser?, targetEmail: String?) -> Bool {
        if isCeoOrSuperAdmin(creator) { return false }
        let creatorEmail = CoreOrg.normalized(creator?.email)
        let target = CoreOrg.normalized(targetEmail)
        if creatorEmail.isEmpty || target.isEmpty { return false }
        if creatorEmail == CoreOrg.developerEmail || creatorEmail == CoreOrg.antonioEmail { return false }
        if target == CoreOrg.antonioEmail { return false }
        return creatorEmail == CoreOrg.luisEmail
    }
}
