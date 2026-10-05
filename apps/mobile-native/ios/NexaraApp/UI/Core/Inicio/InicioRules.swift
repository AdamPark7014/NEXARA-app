import Foundation

/// Reglas de la pantalla Inicio (rediseño v2): qué actividad es «la de ahora»,
/// qué botón lleva, cuáles van después y qué aviso importa hoy. Todo sale de lo
/// que la app ya consulta (`GET me/activities`, `attendance/current`,
/// `attendance/me`); no hay endpoint nuevo.
///
/// Espejo de `InicioRules.kt` en Android. Sin SwiftUI: lógica pura.
enum InicioRules {

    enum AccionKind: Equatable {
        case iniciar, continuar, reanudar, corregir, ver, repartir, abrir
    }

    struct Accion: Equatable {
        let kind: AccionKind
        let label: String
        /// Pestaña del detalle que abre (`evidencias`) o nil para Detalle.
        let tab: String?
        /// Antes de abrir guarda la hora real de inicio (`me/activities/:id/iniciar`).
        var marcaInicio: Bool = false

        /// Icono del botón (Android: PlayArrow · PhotoCamera · Send · Info).
        var systemImage: String {
            switch kind {
            case .iniciar, .reanudar: return "play.fill"
            case .continuar, .corregir: return "camera"
            case .repartir: return "paperplane"
            case .ver, .abrir: return "info.circle"
            }
        }
    }

    /// Tono del chip de estado y del aviso (color con significado, no decorativo).
    enum Tono: Equatable { case info, warning, danger, success, neutral }

    struct Estado: Equatable {
        let label: String
        let tono: Tono
    }

    struct Aviso: Equatable {
        let titulo: String
        let detalle: String
        /// Actividad que abre al tocarlo; nil = solo informa.
        let activityId: Int?
        let tono: Tono
    }

    enum Jornada: Equatable { case enJornada, completada, sinEntrada }

    static let siguientesMax = 3
    static let tabEvidencias = ActividadesUx.tabEvidencias

    /// ¿Ya la empezó? Hora real de inicio, evidencia más allá de la entrada o «En Proceso».
    static func empezada(_ a: MyActivityItem) -> Bool {
        if !(a.inicioRealAt ?? "").isEmpty { return true }
        if let step = a.evidenceStatus, step != CoreEvidence.entryPhoto { return true }
        return (a.estatus ?? "").localizedCaseInsensitiveContains("proceso")
    }

    /// La actividad «de ahora»: la que tiene el reloj corriendo; si no, la que
    /// está en pausa; si no, la primera ya empezada; si no, la #1 de la cola (el
    /// orden de `me/activities` ya es el orden de trabajo).
    static func actual(_ open: [MyActivityItem]) -> MyActivityItem? {
        if let a = open.first(where: { $0.enCurso == true }) { return a }
        if let a = open.first(where: { $0.enPausa == true }) { return a }
        if let a = open.first(where: { empezada($0) }) { return a }
        return open.first
    }

    /// Lo que sigue después de `actual`, en el orden de la cola, como mucho `max`.
    static func siguientes(_ open: [MyActivityItem], actual: MyActivityItem?, max: Int = siguientesMax) -> [MyActivityItem] {
        Array(open.filter { $0.id != actual?.id }.prefix(max))
    }

    /// Botón grande de la tarjeta «Ahora». En pausa → «Reanudar» (llama al API
    /// directo); lo demás sale de `ActividadesUx.primaryAction` con etiquetas
    /// cortas para un botón de 52.
    static func accion(_ a: MyActivityItem) -> Accion {
        if a.sesion.puedeReanudar(despachador: a.despachador == true, estatus: a.estatus) {
            return Accion(kind: .reanudar, label: "Reanudar", tab: tabEvidencias)
        }
        let p = ActividadesUx.primaryAction(a)
        switch p.kind {
        case .repartir: return Accion(kind: .repartir, label: "Repartir", tab: nil)
        case .abrir: return Accion(kind: .abrir, label: "Abrir", tab: nil)
        case .iniciar:
            return Accion(kind: .iniciar, label: ActividadesSemaforo.accionIniciar, tab: p.tab, marcaInicio: p.marcaInicio)
        case .continuar: return Accion(kind: .continuar, label: "Continuar evidencia", tab: p.tab)
        case .corregir: return Accion(kind: .corregir, label: "Corregir evidencias", tab: p.tab)
        case .ver: return Accion(kind: .ver, label: "Ver evidencias", tab: p.tab)
        }
    }

    /// Chip de estado de la tarjeta «Ahora»: el reloj manda sobre el estatus.
    static func estado(_ a: MyActivityItem) -> Estado {
        if a.enPausa == true { return Estado(label: "En pausa", tono: .warning) }
        if a.enCurso == true { return Estado(label: "En curso", tono: .info) }
        let s = (a.estatus ?? "").lowercased()
        let label = CoreStatusUI.estatus(a.estatus).label
        if s.contains("proceso") || s.contains("validar") { return Estado(label: label, tono: .info) }
        if s.contains("rechazada") { return Estado(label: label, tono: .danger) }
        if s.contains("finalizada") || s.contains("completada") || s.contains("aprobada") {
            return Estado(label: label, tono: .success)
        }
        return Estado(label: label, tono: .neutral)
    }

    /// Avance de evidencia como (hechos, total), o nil si no ha empezado a capturar.
    static func avance(_ a: MyActivityItem) -> (hechos: Int, total: Int)? {
        let steps = CoreEvidence.steps(for: a.coreKind)
        guard let step = a.evidenceStatus else { return nil }
        if step == CoreEvidence.completed { return (steps.count, steps.count) }
        guard let i = steps.firstIndex(of: step) else { return nil }
        return (i, steps.count)
    }

    /// Cliente o proyecto: dónde es el trabajo.
    static func lugar(_ a: MyActivityItem) -> String? {
        ActividadesTexto.limpio(a.cliente) ?? ActividadesTexto.limpio(a.proyecto)
    }

    /// El único aviso de Inicio, por orden de urgencia: una actividad devuelta,
    /// una que un jefe te pausó, una atrasada (semáforo rojo). Nada más: un aviso
    /// por pantalla o deja de ser aviso.
    static func aviso(_ open: [MyActivityItem], miId: Int?) -> Aviso? {
        if let a = open.first(where: { ($0.estatus ?? "").localizedCaseInsensitiveContains("rechazada") }) {
            return Aviso(
                titulo: "Te regresaron «\(titulo(a))»",
                detalle: "Corrige las evidencias que te marcaron y vuelve a enviarla.",
                activityId: a.id,
                tono: .danger
            )
        }
        if let a = open.first(where: { item in
            guard item.enPausa == true, item.pausaTipo == "PAUSA", let quien = item.pausadaPor?.id else { return false }
            return quien != miId
        }) {
            return Aviso(
                titulo: "Te pausaron «\(titulo(a))»",
                detalle: a.sesion.textoPausa(miId: miId, propia: true) ?? "Reanúdala cuando vuelvas a ella.",
                activityId: a.id,
                tono: .warning
            )
        }
        if let a = open.first(where: { item in
            (item.semaforo ?? "").trimmingCharacters(in: .whitespaces).lowercased() == ActividadesSemaforo.rojo
                && !SesionActividad.cerrada(item.estatus)
        }) {
            return Aviso(
                titulo: "«\(titulo(a))» va atrasada",
                detalle: "Pasó su fecha límite. Empiézala ya o avisa a tu jefe.",
                activityId: a.id,
                tono: .danger
            )
        }
        return nil
    }

    /// Título, folio o «Actividad #id».
    static func titulo(_ a: MyActivityItem) -> String {
        ActividadesTexto.limpio(a.titulo) ?? ActividadesTexto.limpio(a.anNumber) ?? "Actividad #\(a.id)"
    }

    static func jornada(abierta: Bool, hayEntrada: Bool, haySalida: Bool) -> Jornada {
        if abierta { return .enJornada }
        if hayEntrada && haySalida { return .completada }
        return .sinEntrada
    }

    /// Cifra grande de la tarjeta de jornada: «6:41» (horas:minutos).
    static func horasMinutos(_ seconds: TimeInterval) -> String {
        let total = Int(max(0, seconds)) / 60
        return "\(total / 60):" + String(format: "%02d", total % 60)
    }

    /// «Hola, Fernanda» · sin nombre, «Hola».
    static func saludo(_ nombre: String?) -> String {
        let first = ActividadesTexto.primerNombre(nombre)
        return first.isEmpty ? "Hola" : "Hola, \(first)"
    }

    private static let fechaLargaFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.timeZone = ActividadesTexto.zona
        f.dateFormat = "EEEE d 'de' MMMM"
        return f
    }()

    /// «Viernes 2 de octubre».
    static func fechaLarga(_ date: Date) -> String {
        let texto = fechaLargaFormatter.string(from: date).replacingOccurrences(of: ".", with: "")
        return texto.prefix(1).uppercased() + texto.dropFirst()
    }

    /// Hora programada de una actividad («16:00»), o nil si no trae.
    static func horaDe(_ iso: String?) -> String? {
        let h = ActividadesTexto.hora(iso)
        return h == "—" ? nil : h
    }

    /// Bajo la hora de «Después, hoy»: «Día 3» o la prioridad, corto.
    static func subHora(_ a: MyActivityItem) -> String {
        if let dia = a.periodo?.dia { return "Día \(dia)" }
        return String(CoreStatusUI.priority(a.prioridad).label.prefix(12))
    }

    /// Línea de detalle de «Después, hoy»: lugar · plan (o el tipo).
    static func detalleSiguiente(_ a: MyActivityItem) -> String {
        let plan: Double? = {
            if let p = a.minutosPlan?.value, p > 0 { return p }
            if let e = a.tiempoEstimadoMin, e > 0 { return Double(e) }
            return nil
        }()
        let partes = [lugar(a), plan.map { ActividadesTexto.minutos($0) }].compactMap { $0 }
        let texto = partes.joined(separator: " · ")
        return texto.isEmpty ? CoreStatusUI.kind(a.coreKind, ticketTypeCustom: a.ticketTypeCustom) : texto
    }

    /// Insignia de la pestaña Actividades: lo que falta por hacer.
    static func pendientes(_ open: [MyActivityItem]) -> Int { open.count }
}
