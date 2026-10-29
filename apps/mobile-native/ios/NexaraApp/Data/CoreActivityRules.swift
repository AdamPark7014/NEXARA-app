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
    static let paulinaEmail = "finanzas@nexara.com.mx"
    static let joanEmail = "joan.sanchez@nexara.com.mx"
    static let israelEmail = "israel.ramos@nexara.com.mx"
    static let juanEmail = "juan.gonzalez@nexara.com.mx"
    static let josueEmail = "infraestructura@nexara.com.mx"

    static var fieldInstallerEmails: [String] { [joanEmail, israelEmail, juanEmail] }
    static var servicioDelegateEmails: [String] { [carolinaEmail, alejandroEmail, robertoEmail] }
    static var soporteTeamEmails: [String] { [antonioEmail, carolinaEmail, alejandroEmail] }
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
        if CoreOrg.isCeo(email) { return ClientSector.allCases }
        return matrix[CoreOrg.normalized(email)] ?? []
    }

    /// `clientSectorsForActivityKind`: sectores de cliente al asignar ese tipo.
    static func forActivityKind(_ kind: CoreActivityKind, email: String?) -> [ClientSector] {
        let allowed = sectors(for: email)
        switch kind {
        case .proyecto, .obra: return allowed.filter { $0 == .proyecto }
        case .servicio: return allowed.filter { $0 == .corporativo }
        // Quien crea comercial sin estar en la matriz de Clientes (Paulina) usa el padrón
        // comercial: sin él, el cliente obligatorio salía vacío y no podía guardar.
        case .comercial: return allowed.isEmpty ? [.comercial] : allowed
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

/// Familias del catálogo cerrado de tareas (`FAMILIAS_TAREA` web, 28-10), en el orden en que
/// se pintan.
enum CoreFamiliaTarea: String, CaseIterable, Identifiable, Hashable {
    case campo, oficina, administracion, transversal

    var id: String { rawValue }

    var label: String {
        switch self {
        case .campo: return "En campo"
        case .oficina: return "Oficina técnica"
        case .administracion: return "Administración"
        case .transversal: return "Para todos"
        }
    }
}

/// Subtipos de Tarea (`TAREA_TIPOS` web): viajan como `ticketType OTRO` + `ticketTypeCustom = label`.
///
/// 28-10: catálogo cerrado en cuatro familias, sin «Otro». En producción había 100 valores
/// escritos a mano y sin un tipo confiable no se puede medir cuánto tarda cada trabajo. Las
/// actividades viejas con texto libre se siguen leyendo tal cual (`CoreStatusUI.kind`).
struct CoreTareaTipo: Identifiable, Hashable {
    let id: String
    let label: String
    /// SF Symbol equivalente al ícono de `ActivityKindIcon` web.
    let symbol: String
    let familia: CoreFamiliaTarea

    static let all: [CoreTareaTipo] = [
        CoreTareaTipo(id: "instalacion", label: "Instalación", symbol: "video", familia: .campo),
        CoreTareaTipo(id: "cableado", label: "Cableado y canalización", symbol: "cable.connector", familia: .campo),
        CoreTareaTipo(id: "mantenimiento", label: "Mantenimiento preventivo", symbol: "bubbles.and.sparkles", familia: .campo),
        CoreTareaTipo(id: "correctivo", label: "Correctivo y diagnóstico", symbol: "ladybug", familia: .campo),
        CoreTareaTipo(id: "levantamiento", label: "Levantamiento", symbol: "ruler", familia: .campo),
        CoreTareaTipo(id: "recoleccion", label: "Recolección", symbol: "shippingbox", familia: .campo),
        CoreTareaTipo(id: "entrega", label: "Entrega", symbol: "truck.box", familia: .campo),
        CoreTareaTipo(id: "preparacion", label: "Preparación de equipo", symbol: "wrench.adjustable", familia: .campo),
        CoreTareaTipo(id: "diseno", label: "Diseño, CAD y memoria técnica", symbol: "pencil.and.ruler", familia: .oficina),
        CoreTareaTipo(
            id: "configuracion", label: "Configuración y soporte remoto",
            symbol: "antenna.radiowaves.left.and.right", familia: .oficina
        ),
        CoreTareaTipo(id: "tramite", label: "Trámite", symbol: "doc.text", familia: .administracion),
        CoreTareaTipo(id: "compra", label: "Compra de material", symbol: "cart", familia: .administracion),
        CoreTareaTipo(id: "facturacion", label: "Facturación y contabilidad", symbol: "receipt", familia: .administracion),
        CoreTareaTipo(id: "documentacion", label: "Reporte / documentación", symbol: "doc.richtext", familia: .transversal),
        CoreTareaTipo(id: "capacitacion", label: "Capacitación", symbol: "graduationcap", familia: .transversal),
        CoreTareaTipo(id: "junta", label: "Junta", symbol: "person.2", familia: .transversal),
        CoreTareaTipo(id: "evento", label: "Evento o guardia", symbol: "calendar", familia: .transversal),
    ]

    /// Los tipos de una familia, en el orden del catálogo.
    static func deFamilia(_ familia: CoreFamiliaTarea) -> [CoreTareaTipo] {
        all.filter { $0.familia == familia }
    }
}

// MARK: - Complejidad al asignar

/// Complejidad de la actividad (`apps/web/lib/complejidad.ts`). La IA sugiere un nivel; quien
/// asigna decide y las dos quedan guardadas (`complejidad` y `complejidadSugerida`).
enum CoreComplejidad: String, CaseIterable, Identifiable, Hashable {
    case basica = "BASICA"
    case estandar = "ESTANDAR"
    case compleja = "COMPLEJA"
    case critica = "CRITICA"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .basica: return "Básica"
        case .estandar: return "Estándar"
        case .compleja: return "Compleja"
        case .critica: return "Crítica"
        }
    }

    /// Lo que se lee bajo el nivel cuando aún no hay tiempo típico.
    var ayuda: String {
        switch self {
        case .basica: return "Rutina corta"
        case .estandar: return "Lo normal"
        case .compleja: return "Más volumen"
        case .critica: return "Cliente detenido"
        }
    }

    /// Qué cuenta en cada nivel (`COMPLEJIDAD_NIVEL_TITULO` web): lo mismo que lee la IA.
    var definicion: String {
        switch self {
        case .basica: return "Rutina corta y conocida, un solo punto o equipo"
        case .estandar: return "Lo normal de este tipo de trabajo"
        case .compleja: return "Más volumen o más difícil: varios puntos, altura, falla sin causa clara o coordinar con otros"
        case .critica: return "El cliente está detenido o hay riesgo: sistema caído, incidente o plazo de horas"
        }
    }

    /// El nivel que guarda la API (`BASICA`…`CRITICA`); nil si viene vacío o es otro texto.
    static func de(_ valor: String?) -> CoreComplejidad? {
        CoreComplejidad(rawValue: (valor ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// Tope de la rueda de tiempo estimado (12 h por actividad, como la web).
    static let topeEstimadoMin = 720

    /// Lo típico para el nivel elegido; si ese nivel aún no junta anteriores suficientes, el
    /// del tipo completo (y se dice). `tipicoPara` web.
    static func tipicoPara(_ tiempos: CoreTiemposTipicos?, _ nivel: CoreComplejidad?) -> CoreTipicoElegido? {
        guard let tiempos else { return nil }
        if let nivel, let delNivel = tiempos.porComplejidad[nivel], let mediana = delNivel.medianaMin {
            return CoreTipicoElegido(minutos: mediana, muestras: delNivel.muestras, delNivel: true)
        }
        if let mediana = tiempos.total.medianaMin {
            return CoreTipicoElegido(minutos: mediana, muestras: tiempos.total.muestras, delNivel: false)
        }
        return nil
    }

    /// «Lo típico en Instalación · Compleja: 3 h 40 min (9 anteriores).» (`textoTipico` web).
    static func textoTipico(tipoLabel: String, nivel: CoreComplejidad?, tipico: CoreTipicoElegido?) -> String? {
        guard let tipico else { return nil }
        let delNivel = tipico.delNivel ? (nivel.map { " · \($0.label)" } ?? "") : ""
        let cuantas = "\(tipico.muestras) anterior\(tipico.muestras == 1 ? "" : "es")"
        return "Lo típico en \(tipoLabel)\(delNivel): \(formatoMinutos(tipico.minutos)) (\(cuantas))."
    }

    /// «45 min», «2 h», «3 h 40 min» (`formatoMinutos` web, con el formateador de `CoreFormat`).
    static func formatoMinutos(_ minutos: Int) -> String {
        CoreFormat.minutes(minutos) ?? "0 min"
    }

    /// Minutos que deja «Usar … como tiempo estimado»: tope de 12 h y redondeados a 5 min,
    /// porque la rueda de minutos va de 5 en 5.
    static func minutosParaEstimado(_ minutos: Int) -> Int {
        let tope = min(topeEstimadoMin, max(0, minutos))
        return min(topeEstimadoMin, Int((Double(tope) / 5).rounded()) * 5)
    }

    /// Texto de la sugerencia después de «Sugerencia: X.»: el motivo y quién decide.
    static func textoSugerencia(_ sugerencia: CoreSugerenciaComplejidad, elegida: CoreComplejidad?) -> String {
        var motivo = sugerencia.motivo.trimmingCharacters(in: .whitespacesAndNewlines)
        if motivo.hasSuffix(".") { motivo.removeLast() }
        let cierre = elegida != nil && elegida != sugerencia.complejidad
            ? "Elegiste otra: quedan las dos registradas."
            : "Tú decides; si la cambias, queda registrado."
        return motivo.isEmpty ? cierre : "\(motivo). \(cierre)"
    }

    /// Renglón «Complejidad» del detalle: la etiqueta y, si la IA sugirió otra, «La IA sugirió
    /// compleja». nil cuando la actividad no trae una complejidad válida.
    static func detalle(complejidad: String?, sugerida: String?) -> (valor: String, nota: String?)? {
        guard let elegida = de(complejidad) else { return nil }
        let nota: String? = de(sugerida).flatMap { $0 == elegida ? nil : "La IA sugirió \($0.label.lowercased())" }
        return (elegida.label, nota)
    }
}

/// Anteriores de un nivel y su mediana en minutos (nil = menos de las mínimas para enseñarla).
struct CoreTipico: Hashable {
    let muestras: Int
    let medianaMin: Int?
}

/// `GET ai/complejidad/tiempos`: lo típico del tipo de trabajo, en total y por nivel.
struct CoreTiemposTipicos: Hashable {
    let clave: String?
    let total: CoreTipico
    let porComplejidad: [CoreComplejidad: CoreTipico]
}

/// `POST ai/complejidad/sugerir` → `sugerencia`.
struct CoreSugerenciaComplejidad: Hashable {
    let complejidad: CoreComplejidad
    let motivo: String
}

// MARK: - Tiempo y entrega que fija el sistema (autoasignación)

/// Autoasignación (regla de Adam, 29-10): el tiempo, la complejidad y la entrega los fija el
/// sistema desde el título y el tipo; solo un superior los ajusta al asignar a alguien de su
/// equipo. En el alta propia se enseñan en solo lectura con su desglose
/// (`POST me/activities/tiempo-calculado`). Espejo de `TiempoCalculado.kt` de Android.
struct CoreTiempoCalculado: Hashable {
    struct Concepto: Hashable {
        let concepto: String
        /// 0 en las líneas «Supuesto: …»: se enseñan sin minutos.
        let minutos: Double?
    }

    /// Renglón del desglose ya listo para pintarse.
    struct Linea: Hashable {
        let texto: String
        let minutos: String?
    }

    let tiempoEstandarMin: Double?
    let desglose: [Concepto]
    let supuestos: [String]
    let complejidad: String?
    let fechaEntregaEsperada: String?

    /// El desglose: «Supuesto: …» va sin minutos (llega con 0); los conceptos vacíos no se pintan.
    var lineas: [Linea] {
        desglose.compactMap { d in
            let concepto = d.concepto.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !concepto.isEmpty else { return nil }
            let esSupuesto = concepto.lowercased().hasPrefix("supuesto")
            let minutos = d.minutos.flatMap { $0.isFinite && $0 > 0 && !esSupuesto ? Int($0.rounded()) : nil }
            return Linea(texto: concepto, minutos: minutos.flatMap { CoreFormat.minutes($0) })
        }
    }

    /// «Supuesto: una sola visita» por cada supuesto que no venga ya como línea del desglose.
    var supuestosTexto: [String] {
        let yaEnDesglose = Set(lineas.map(\.texto))
        return supuestos.compactMap { s in
            var limpio = s.trimmingCharacters(in: .whitespacesAndNewlines)
            if limpio.lowercased().hasPrefix("supuesto:") {
                limpio = String(limpio.dropFirst("supuesto:".count)).trimmingCharacters(in: .whitespacesAndNewlines)
            }
            guard !limpio.isEmpty else { return nil }
            let texto = "Supuesto: \(limpio)"
            return yaEnDesglose.contains(texto) ? nil : texto
        }
    }

    /// «Estándar 2 h 20 min · Compleja»; nil si no trae ni tiempo ni complejidad.
    var resumen: String? {
        let tiempo = tiempoEstandarMin
            .flatMap { $0.isFinite && $0 > 0 ? Int($0.rounded()) : nil }
            .flatMap { CoreFormat.minutes($0) }
            .map { "Estándar \($0)" }
        let nivel = CoreComplejidad.de(complejidad)?.label
        let partes = [tiempo, nivel].compactMap { $0 }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    /// «Entrega a más tardar 17:20» o, si no cae el día del inicio (en México),
    /// «Entrega a más tardar el 30/10 a las 09:20». nil sin entrega.
    func entrega(inicio: Date?) -> String? {
        guard let fin = NxFormat.parseISO(fechaEntregaEsperada) else { return nil }
        let hora = CoreSchedule.hhmm(fin)
        if let inicio, NxHoraMexico.dia(inicio) != NxHoraMexico.dia(fin) {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = CoreSchedule.mexico
            let p = calendar.dateComponents([.day, .month], from: fin)
            return "Entrega a más tardar el \(p.day ?? 1)/\(p.month ?? 1) a las \(hora)"
        }
        return "Entrega a más tardar \(hora)"
    }
}

/// Lo típico que se enseña: del nivel elegido o, si aún no hay suficientes, del tipo completo.
struct CoreTipicoElegido: Hashable {
    let minutos: Int
    let muestras: Int
    let delNivel: Bool
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
        // Paulina (contadora): lo comercial es parte de su trabajo; sin estar aquí solo veía Tarea.
        CoreOrg.paulinaEmail: [.tarea, .comercial],
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
        CoreOrg.robertoEmail: [.tarea, .proyecto, .servicio],
        CoreOrg.danielaEmail: [.tarea, .comercial],
        CoreOrg.monicaEmail: [.tarea, .comercial],
        CoreOrg.paulinaEmail: [.tarea, .comercial],
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
        if CoreOrg.isCeo(email) { return all }
        return receiveByEmail[normalized] ?? [.tarea]
    }

    /// Creador × destinatario, en el orden fijo de los tipos.
    static func kindsForAssignment(creator: SessionUser?, targetEmail: String?) -> [CoreActivityKind] {
        let create = kindsForCreator(creator)
        guard let targetEmail, !CoreOrg.normalized(targetEmail).isEmpty else {
            return create.isEmpty ? [.tarea] : create
        }
        let receive = Set(kindsForTarget(email: targetEmail))
        let visibles = all.filter { create.contains($0) && receive.contains($0) }
        if visibles.isEmpty && CoreOrg.normalized(creator?.email) == CoreOrg.normalized(targetEmail) {
            return [.tarea]
        }
        return visibles
    }

    static func isAreaManager(_ email: String?) -> Bool {
        areaManagerEmails.contains(CoreOrg.normalized(email))
    }

    static func canOfferAssignmentCharge(_ email: String?) -> Bool {
        chargeManagerEmails.contains(CoreOrg.normalized(email))
    }

    /// Servicio a Luis (cupo, se lo pasa a Antonio) o a Antonio (él elige al ingeniero):
    /// siempre despacho, sin elegir ejecutor.
    static func forcesDespachoOnly(_ email: String?, kind: CoreActivityKind?) -> Bool {
        guard kind == .servicio else { return false }
        let normalized = CoreOrg.normalized(email)
        return normalized == CoreOrg.luisEmail || normalized == CoreOrg.antonioEmail
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
        // Roberto solo atiende servicios: entra aquí y no en proyectos.
        case .servicio?: return CoreOrg.soporteTeamEmails + [CoreOrg.robertoEmail]
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

    // MARK: Entregar a más tardar (`apps/web/lib/ops-activity-form.ts`)

    /// Hora de inicio cuando no hay una.
    static let horaPorOmision = "09:00"

    /// El compromiso vale vacío o, si es `HH:MM`, solo después de la hora de inicio.
    static func compromisoValido(hora: String, compromiso: String) -> Bool {
        if compromiso.isEmpty { return true }
        guard compromiso.range(of: #"^\d{2}:\d{2}$"#, options: .regularExpression) != nil else { return false }
        return compromiso > (hora.isEmpty ? horaPorOmision : hora)
    }

    /// La hora de la fecha máxima y de la entrega esperada: la del compromiso si es válida; si
    /// no, la de inicio (la API la lee como «fin del día»). Con periodo de varios días no aplica.
    static func horaLimite(hora: String, compromiso: String, conPeriodo: Bool = false) -> String {
        let inicio = hora.isEmpty ? horaPorOmision : hora
        guard !conPeriodo, !compromiso.isEmpty, compromisoValido(hora: inicio, compromiso: compromiso) else { return inicio }
        return compromiso
    }

    /// La hora compromiso («HH:mm») de una actividad guardada: su fecha máxima, si cae el mismo
    /// día (en México) y después del inicio. Una fecha máxima igual al inicio es «fin del día» y
    /// da nil; con periodo de varios días tampoco aplica (igual que Android).
    static func horaCompromisoDe(fechaInicio: String?, fechaMaxima: String?, conPeriodo: Bool) -> String? {
        guard !conPeriodo,
              let inicio = NxFormat.parseISO(fechaInicio),
              let maxima = NxFormat.parseISO(fechaMaxima),
              maxima > inicio,
              NxHoraMexico.dia(maxima) == NxHoraMexico.dia(inicio) else { return nil }
        let hora = NxHoraMexico.hhmm(fechaMaxima)
        // 23:59 es el fin del día escrito a mano, no un compromiso (`limiteEsFinDeDia` de la API).
        return hora == "23:59" ? nil : hora
    }

    /// La entrega al editar el detalle (`CoreActivityKinds.entregaEditada` de Android): nil si el
    /// día (en México) no cambió, y entonces no se manda: desde el 29-10 la API cuenta como cambio
    /// cualquier valor distinto y solo un superior de quien la ejecuta puede hacerlo (403). Si
    /// cambió, el día nuevo a la misma hora de México que tenía (18:00 si no tenía).
    ///
    /// Antes iba siempre «día T12:00Z»: aun sin tocarla, la entrega se movía a las 6:00 de México.
    /// El campo se llena con `ActivityDetailFormat.parse` y se pinta en hora de México, así que se
    /// compara el día de México (no los 10 primeros caracteres del ISO, que son el día UTC).
    static func entregaEditada(original: String?, nuevoDia: Date?) -> String? {
        guard let nuevoDia else { return nil }
        let antes = ActivityDetailFormat.parse(original)
        if let antes, NxHoraMexico.dia(antes) == NxHoraMexico.dia(nuevoDia) { return nil }
        let hora = antes.map { CoreSchedule.hhmm($0) } ?? "18:00"
        guard let fecha = CoreSchedule.at(day: nuevoDia, hhmm: hora) else { return nil }
        return CoreFormat.isoString(fecha)
    }

    // MARK: Complejidad: cuándo se pide y cómo se nombra el tipo de trabajo

    /// `SERVICIO_LABEL` web: el tipo de servicio como se lee en la pista de lo típico.
    static let servicioLabel: [String: String] = [
        "PREVENTIVO": "Servicio preventivo",
        "CORRECTIVO": "Servicio correctivo",
        "EMERGENCIA": "Servicio de emergencia",
        "INSTALACION": "Servicio de instalación",
    ]

    /// El tipo que se manda a `ai/complejidad/tiempos` y `sugerir`: en tarea, la etiqueta del chip (nil sin
    /// elegir); en servicio, su `ticketType`; en los demás, ninguno.
    static func tipoParaComplejidad(kind: CoreActivityKind, tareaTipo: CoreTareaTipo?, ticketType: String) -> String? {
        switch kind {
        case .tarea: return tareaTipo?.label
        case .servicio: return ticketType
        case .proyecto, .obra, .comercial: return nil
        }
    }

    /// La complejidad se ve en todos los tipos; en tarea, después de elegir su tipo.
    static func complejidadVisible(kind: CoreActivityKind, tipo: String?) -> Bool {
        kind != .tarea || !(tipo ?? "").isEmpty
    }

    /// «Instalación», «Servicio correctivo», «Obra»: el tipo de trabajo como se lee en la pista.
    static func etiquetaTipoTrabajo(kind: CoreActivityKind, tipo: String?) -> String {
        let limpio = (tipo ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        switch kind {
        case .tarea: return limpio.isEmpty ? kind.title : limpio
        case .servicio: return servicioLabel[limpio.isEmpty ? "PREVENTIVO" : limpio] ?? "Servicio"
        case .proyecto, .obra, .comercial: return kind.title
        }
    }
}
