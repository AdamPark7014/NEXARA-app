import SwiftUI

// Reglas de presentación de Actividades, Inicio y la pizarra del equipo, sin
// SwiftUI de por medio (salvo `Color`). Espejo de Android:
// `ActividadesUx.kt`, `ActivitySemaforo.kt`, `BoardRange.kt`, `EquipoEstado.kt`,
// `BoardKpis.kt` y los formatos de `CoreActivityRules.kt`. Si una regla cambia
// allá, cambia aquí.

// MARK: - Formatos y textos

/// Formatos de Actividades (Android `CoreActivityRules`: `formatMinutes`,
/// `formatBoardMinutes`, `formatWhen`, `formatClock`, `boardEstadoTexto`…).
/// Las horas se pintan en hora de México, la misma zona con la que se capturan
/// («Cambiar fecha y hora» y la rejilla 10:00–18:00): un teléfono con otra zona
/// no corre la agenda.
enum ActividadesTexto {
    static let zona = TimeZone(identifier: "America/Mexico_City") ?? .current

    private static let cuandoFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.timeZone = zona
        f.dateFormat = "EEE d MMM · HH:mm"
        return f
    }()

    private static let horaFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.timeZone = zona
        f.dateFormat = "HH:mm"
        return f
    }()

    /// «lun 14 sep · 09:30»; nil sin fecha.
    static func cuando(_ iso: String?) -> String? {
        guard let date = CoreFormat.date(iso) else { return nil }
        return cuando(date)
    }

    static func cuando(_ date: Date) -> String {
        cuandoFormatter.string(from: date).replacingOccurrences(of: ".", with: "")
    }

    /// «09:30» · «—».
    static func hora(_ iso: String?) -> String {
        guard let date = CoreFormat.date(iso) else { return "—" }
        return horaFormatter.string(from: date)
    }

    /// «45 min» · «2 h» · «2 h 5 min»; «—» sin dato (Android `formatMinutes`).
    static func minutos(_ value: Double?) -> String {
        guard let value, value.isFinite, value > 0 else { return "—" }
        let total = Int(value.rounded())
        let h = total / 60
        let m = total % 60
        if h <= 0 { return "\(m) min" }
        if m == 0 { return "\(h) h" }
        return "\(h) h \(m) min"
    }

    /// «5 min» · «2 h 05 min»; «—» sin dato (Android `formatBoardMinutes`).
    static func minutosPizarra(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "—" }
        let total = max(0, Int(value))
        let h = total / 60
        let m = total % 60
        if h <= 0 { return "\(m) min" }
        return "\(h) h \(String(format: "%02d", m)) min"
    }

    static func minutosPizarra(_ value: Int?) -> String {
        minutosPizarra(value.map { Double($0) })
    }

    /// Primera palabra del nombre: «Fernanda».
    static func primerNombre(_ nombre: String?) -> String {
        (nombre ?? "").split(whereSeparator: { $0.isWhitespace }).first.map(String.init) ?? ""
    }

    /// Nombre y primer apellido: «Fernanda Cruz».
    static func nombreCorto(_ nombre: String?) -> String {
        (nombre ?? "").split(whereSeparator: { $0.isWhitespace }).prefix(2).joined(separator: " ")
    }

    /// «FC»; «?» sin nombre.
    static func iniciales(_ nombre: String?) -> String {
        let letras = (nombre ?? "").split(whereSeparator: { $0.isWhitespace }).prefix(2).compactMap { $0.first }
        let texto = String(letras).uppercased()
        return texto.isEmpty ? "?" : texto
    }

    /// Texto sin espacios de sobra; nil si queda vacío.
    static func limpio(_ texto: String?) -> String? {
        let t = (texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }

    // MARK: Pizarra

    /// `boardStatusLabel`: «Activo», «Atrasado», «Terminó», «Sin actividad».
    static func estadoPizarra(_ status: String?) -> String {
        switch status ?? "" {
        case "activo": return "Activo"
        case "atrasado": return "Atrasado"
        case "libre": return "Terminó"
        case "inactivo": return "Inactivo"
        default: return "Sin actividad"
        }
    }

    /// `boardStatusColor`.
    static func colorPizarra(_ status: String?) -> Color {
        switch status ?? "" {
        case "activo": return NxColors.verde
        case "atrasado": return NxColors.rojo
        case "libre": return NxColors.cian
        default: return NxColors.gris
        }
    }

    /// «Atrasado 1 h 20 min» · «Sin actividad desde hace 2 h 05 min» · o la etiqueta del estado.
    static func estadoTexto(status: String?, lateMinutes: Int?, idleSinceAt: String?, now: Date = Date()) -> String {
        if status == "atrasado", let late = lateMinutes, late > 0 {
            return "Atrasado \(minutosPizarra(late))"
        }
        if status == "libre", let idle = CoreFormat.date(idleSinceAt) {
            let mins = max(0, Int(now.timeIntervalSince(idle) / 60))
            return mins < 1
                ? "Sin actividad desde hace un momento"
                : "Sin actividad desde hace \(minutosPizarra(mins))"
        }
        return estadoPizarra(status)
    }

    static func estadoTexto(_ user: TeamBoardUser, now: Date = Date()) -> String {
        estadoTexto(status: user.status, lateMinutes: user.currentLateMinutes, idleSinceAt: user.idleSinceAt, now: now)
    }

    /// «Finalizó a las 10:49 con 1 h 20 min de atraso» · «…, a tiempo» · sin fecha máxima.
    static func terminoTexto(finishedAt: String?, lateMinutes: Int?) -> String {
        let h = hora(finishedAt)
        guard let late = lateMinutes else { return "Finalizó a las \(h)" }
        if late <= 0 { return "Finalizó a las \(h), a tiempo" }
        return "Finalizó a las \(h) con \(minutosPizarra(late)) de atraso"
    }

    /// «En espera de aprobación» · «3 en espera de aprobación».
    static func enEsperaTexto(_ count: Int) -> String {
        count > 1 ? "\(count) en espera de aprobación" : "En espera de aprobación"
    }

    // MARK: Formulario capturado

    /// Campos capturados con su etiqueta (Android `formEntries`): primero los del
    /// tipo, luego cualquier clave vieja que traiga; una firma se nombra, no se pinta.
    static func formEntries(_ data: JSONValue?, coreKind: String?) -> [(label: String, value: String)] {
        guard let map = data?.objectValue else { return [] }
        let campos = CoreEvidence.formFields(for: coreKind)
        let conocidas = Set(campos.map(\.key))
        var out: [(label: String, value: String)] = campos.compactMap { campo in
            guard let valor = map[campo.key]?.displayText else { return nil }
            return (label: campo.label, value: valor)
        }
        for key in map.keys.sorted() where !conocidas.contains(key) {
            guard let value = map[key] else { continue }
            switch value {
            case .object, .array, .null:
                continue
            default:
                guard let texto = value.displayText else { continue }
                if texto.lowercased().hasPrefix("data:image") {
                    out.append((label: humanizar(key), value: "Firma capturada"))
                } else {
                    out.append((label: humanizar(key), value: texto))
                }
            }
        }
        return out
    }

    /// `gerenteEncargado` → «Gerente encargado».
    static func humanizar(_ key: String) -> String {
        var spaced = ""
        var anterior: Character?
        for ch in key {
            if ch.isUppercase, let a = anterior, a.isLowercase || a.isNumber {
                spaced.append(" ")
            }
            spaced.append(ch == "_" || ch == "-" ? " " : ch)
            anterior = ch
        }
        let limpio = spaced
            .split(separator: " ", omittingEmptySubsequences: true)
            .joined(separator: " ")
            .lowercased()
        return limpio.prefix(1).uppercased() + limpio.dropFirst()
    }
}

// MARK: - Semáforo, plan contra real e inicio (Android `ActivitySemaforo`)

enum ActividadesSemaforo {
    static let rojo = "rojo"
    static let amarillo = "amarillo"
    static let verde = "verde"

    /// Regla del dueño (18-09): quien recibe una actividad no la acepta ni la
    /// rechaza, únicamente la inicia. Marca la hora real de inicio.
    static let accionIniciar = "Iniciar actividad"
    /// Chip mientras no la ha iniciado.
    static let chipSinIniciar = "Sin iniciar"

    struct Luz: Hashable {
        let clave: String
        let etiqueta: String
        let color: Color
    }

    /// nil cuando el API no manda semáforo.
    static func luz(_ semaforo: String?) -> Luz? {
        switch (semaforo ?? "").trimmingCharacters(in: .whitespaces).lowercased() {
        case rojo: return Luz(clave: rojo, etiqueta: "Atrasada", color: NxColors.rojo)
        case amarillo: return Luz(clave: amarillo, etiqueta: "Por vencer", color: NxColors.naranja)
        case verde: return Luz(clave: verde, etiqueta: "En tiempo", color: NxColors.verde)
        default: return nil
        }
    }

    /// «Plan 2 h · real 2 h 30 min»; nil sin plan ni tiempo real.
    static func planRealTexto(plan: Double?, real: Double?) -> String? {
        let p: Double? = (plan ?? 0) > 0 ? plan : nil
        let r: Double? = (real ?? 0) > 0 ? real : nil
        if let p, let r {
            return "Plan \(ActividadesTexto.minutos(p)) · real \(ActividadesTexto.minutos(r))"
        }
        if let p { return "Plan \(ActividadesTexto.minutos(p))" }
        if let r { return "Real \(ActividadesTexto.minutos(r))" }
        return nil
    }

    /// Rojo cuando ya pasó del plan; si no, el gris de siempre.
    static func planRealColor(excedida: Bool?) -> Color {
        excedida == true ? NxColors.rojo : NxColors.gris
    }

    /// ¿Se ofrece «Iniciar actividad»? Mientras no tenga hora real de inicio. No a
    /// quien solo reparte un despacho ni a lo cerrado. Sin `aceptacion` la API es
    /// anterior al contrato: no se sabe, y la foto de entrada marca el inicio.
    static func puedeIniciar(aceptacion: String?, inicioRealAt: String?, despachador: Bool?, estatus: String?) -> Bool {
        guard let aceptacion, !aceptacion.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        if despachador == true { return false }
        if cerrada(estatus) { return false }
        return (inicioRealAt ?? "").trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// Para quien asignó: todavía no la inicia.
    static func sinIniciar(aceptacion: String?, inicioRealAt: String?, estatus: String?) -> Bool {
        puedeIniciar(aceptacion: aceptacion, inicioRealAt: inicioRealAt, despachador: false, estatus: estatus)
    }

    /// Histórico: rechazos de antes de la regla del 18-09.
    static func fueRechazada(_ aceptacion: String?) -> Bool {
        (aceptacion ?? "").trimmingCharacters(in: .whitespaces).uppercased() == "RECHAZADA"
    }

    /// «Rechazada: no tengo la llave del site».
    static func rechazadaTexto(_ motivo: String?) -> String {
        guard let m = ActividadesTexto.limpio(motivo) else { return "Rechazada" }
        return "Rechazada: \(m)"
    }

    /// «Asignada por Luis Torres»; nil si nadie la asignó.
    static func asignadaPorTexto(_ nombre: String?) -> String? {
        guard let n = ActividadesTexto.limpio(nombre) else { return nil }
        return "Asignada por \(ActividadesTexto.nombreCorto(n))"
    }

    static func cerrada(_ estatus: String?) -> Bool {
        (estatus ?? "").range(of: "finalizada|completada|cancelada|aprobada", options: [.regularExpression, .caseInsensitive]) != nil
    }
}

// MARK: - Botón principal, colores y cifras de «Mis actividades» (Android `ActividadesUx`)

enum ActividadesUx {
    static let tabEvidencias = "evidencias"

    enum PrimaryKind: Equatable {
        /// Despachador que aún no la pasa a nadie.
        case repartir
        /// Sin iniciar: marca la hora real y abre Evidencias.
        case iniciar
        /// Ya empezó: le faltan pasos de evidencia.
        case continuar
        /// Se la regresaron para corregir.
        case corregir
        /// Evidencia enviada o en revisión: solo consultar.
        case ver
        /// Solo reparte (no captura).
        case abrir
    }

    struct PrimaryAction: Equatable {
        let kind: PrimaryKind
        let label: String
        /// Pestaña del detalle que abre (`evidencias`) o nil para Detalle.
        let tab: String?
        /// Antes de abrir guarda la hora real de inicio (`me/activities/:id/iniciar`).
        var marcaInicio: Bool = false
    }

    /// Botón principal de una actividad propia. Todo lleva a Evidencias; aquí solo
    /// se elige la palabra del siguiente paso. Sin inicio real: «Iniciar actividad».
    static func primaryAction(_ a: MyActivityItem) -> PrimaryAction {
        if a.porRepartir == true { return PrimaryAction(kind: .repartir, label: "Repartir", tab: nil) }
        if a.despachador == true { return PrimaryAction(kind: .abrir, label: "Abrir", tab: nil) }
        let estatus = (a.estatus ?? "").lowercased()
        let step = a.evidenceStatus
        if estatus.contains("rechazada") {
            return PrimaryAction(kind: .corregir, label: "Corregir evidencias", tab: tabEvidencias)
        }
        if step == CoreEvidence.completed || estatus.contains("validar") {
            return PrimaryAction(kind: .ver, label: "Ver evidencias", tab: tabEvidencias)
        }
        // Aunque un compañero ya la tenga «En Proceso», cada quien marca su propio inicio.
        if (step == nil || step == CoreEvidence.entryPhoto)
            && ActividadesSemaforo.puedeIniciar(
                aceptacion: a.aceptacion,
                inicioRealAt: a.inicioRealAt,
                despachador: a.despachador,
                estatus: a.estatus
            ) {
            return PrimaryAction(kind: .iniciar, label: ActividadesSemaforo.accionIniciar, tab: tabEvidencias, marcaInicio: true)
        }
        if (step != nil && step != CoreEvidence.entryPhoto) || estatus.contains("proceso") {
            return PrimaryAction(kind: .continuar, label: "Continuar evidencias", tab: tabEvidencias)
        }
        return PrimaryAction(kind: .iniciar, label: ActividadesSemaforo.accionIniciar, tab: tabEvidencias)
    }

    /// Rojo si urge, ámbar si va justa; en verde no se tiñe nada.
    static func colorSemaforo(_ semaforo: String?) -> Color? {
        switch (semaforo ?? "").trimmingCharacters(in: .whitespaces).lowercased() {
        case ActividadesSemaforo.rojo: return NxColors.rojo
        case ActividadesSemaforo.amarillo: return NxColors.naranja
        default: return nil
        }
    }

    /// «Te la regresaron» en rojo y «Terminada» en verde; el flujo normal va en gris.
    static func colorEstatus(_ estatus: String?) -> Color? {
        let label = CoreStatusUI.estatus(estatus).label
        if label == "Te la regresaron" { return NxColors.rojo }
        if label == "Terminada" { return NxColors.verde }
        return nil
    }

    /// Solo lo urgente se pinta.
    static func colorPrioridad(_ prioridad: String?) -> Color? {
        esUrgente(prioridad) ? NxColors.rojo : nil
    }

    static func esUrgente(_ prioridad: String?) -> Bool {
        CoreStatusUI.priority(prioridad).label == "Urgente"
    }

    /// Lo que dice el encabezado bajo el saludo: qué hacer ahora.
    static func instruccionDia(porHacer: Int, cargando: Bool) -> String {
        if cargando { return "Cargando tus actividades…" }
        if porHacer <= 0 { return "Nada pendiente por ahora." }
        if porHacer == 1 { return "Tienes 1 actividad. Empieza por ella." }
        return "Tienes \(porHacer) por hacer. Empieza por la #1."
    }

    /// «Auto-asignarme» del encabezado: siempre que se pueda, aunque haya cola.
    static func muestraAutoasignar(_ puede: Bool) -> Bool { puede }

    /// Botón lleno «Auto-asignarme una actividad»: solo con la cola vacía.
    static func autoasignarProminente(_ puede: Bool, porHacer: Int) -> Bool { puede && porHacer <= 0 }

    static let metricaPorHacer = "por_hacer"
    static let metricaHechas = "hechas_hoy"
    static let metricaSeguimiento = "seguimiento"

    /// La tira de cifras: por hacer, hechas hoy y —solo si las hay— en seguimiento.
    /// Un día sin nada no pinta ceros.
    static func metricas(porHacer: Int, urgentes: Int, hechasHoy: Int, seguimiento: Int) -> [NxMetric] {
        if porHacer == 0 && hechasHoy == 0 && seguimiento == 0 { return [] }
        let pista: String
        if urgentes == 1 {
            pista = "1 urgente"
        } else if urgentes > 1 {
            pista = "\(urgentes) urgentes"
        } else if porHacer == 0 {
            pista = "nada en tu cola"
        } else {
            pista = "en tu cola"
        }
        var out: [NxMetric] = [
            NxMetric(
                clave: metricaPorHacer,
                etiqueta: "Por hacer",
                valor: "\(porHacer)",
                pista: pista,
                // El rojo es la alarma de que algo no aguanta hasta mañana.
                color: urgentes > 0 ? NxColors.rojo : nil
            ),
            NxMetric(
                clave: metricaHechas,
                etiqueta: "Hechas hoy",
                valor: "\(hechasHoy)",
                pista: hechasHoy == 0 ? "aún ninguna" : "van del día"
            ),
        ]
        if seguimiento > 0 {
            out.append(NxMetric(
                clave: metricaSeguimiento,
                etiqueta: "En seguimiento",
                valor: "\(seguimiento)",
                pista: "las repartiste"
            ))
        }
        return out
    }
}

// MARK: - Estado de pantalla (Android `nxEstadoPantalla`)

/// Los cuatro estados son excluyentes: nunca se pintan dos a la vez. Con datos
/// manda el contenido aunque el último refresco haya fallado.
enum ActividadesPantalla: Equatable {
    case cargando, error, vacio, contenido

    static func de(cargando: Bool, error: String?, hayDatos: Bool) -> ActividadesPantalla {
        if hayDatos { return .contenido }
        if cargando { return .cargando }
        if let error, !error.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .error }
        return .vacio
    }
}

// MARK: - Rango Hoy · Semana · Mes (Android `BoardRange`)

/// La semana empieza en lunes y ningún rango pasa de hoy. Fechas en hora de México.
enum ActividadesRango: String, CaseIterable, Identifiable, Hashable {
    case hoy, semana, mes

    var id: String { rawValue }

    var etiqueta: String {
        switch self {
        case .hoy: return "Hoy"
        case .semana: return "Semana"
        case .mes: return "Mes"
        }
    }

    private static let zona = TimeZone(identifier: "America/Mexico_City") ?? .current

    private static var calendario: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = zona
        c.firstWeekday = 2
        return c
    }

    private static let isoDia: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = zona
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let diaMes: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.timeZone = zona
        f.dateFormat = "d 'de' MMMM"
        return f
    }()

    /// `desde` a `hasta` en `AAAA-MM-DD`.
    static func fechas(_ rango: ActividadesRango, hoy: Date = Date()) -> (desde: String, hasta: String) {
        let cal = calendario
        let inicio: Date
        switch rango {
        case .hoy:
            inicio = hoy
        case .semana:
            // domingo = 1 … sábado = 7: días desde el lunes.
            let weekday = cal.component(.weekday, from: hoy)
            let desdeLunes = (weekday + 5) % 7
            inicio = cal.date(byAdding: .day, value: -desdeLunes, to: hoy) ?? hoy
        case .mes:
            inicio = cal.date(from: cal.dateComponents([.year, .month], from: hoy)) ?? hoy
        }
        return (isoDia.string(from: inicio), isoDia.string(from: hoy))
    }

    /// «Hoy» · «Del 14 al 17 de septiembre» — lo que se lee bajo los botones.
    static func descripcion(_ rango: ActividadesRango, hoy: Date = Date()) -> String {
        if rango == .hoy { return "Hoy" }
        let (desde, hasta) = fechas(rango, hoy: hoy)
        if desde == hasta { return "Hoy" }
        guard let inicio = isoDia.date(from: desde) else { return "Hoy" }
        let cal = calendario
        let mismoMes = cal.component(.month, from: inicio) == cal.component(.month, from: hoy)
            && cal.component(.year, from: inicio) == cal.component(.year, from: hoy)
        let inicioTexto = mismoMes ? "\(cal.component(.day, from: inicio))" : diaMes.string(from: inicio)
        return "Del \(inicioTexto) al \(diaMes.string(from: hoy))"
    }
}

// MARK: - Cómo se lee la pizarra (Android `EquipoEstado`)

/// Los cinco estados del API en tres aros: ¿trabaja, hay que ir a ver, o ya terminó?
enum ActividadesAro: String, CaseIterable, Hashable {
    case trabajando, retraso, libre

    var clave: String { rawValue }

    var etiqueta: String {
        switch self {
        case .trabajando: return "Trabajando"
        case .retraso: return "Con retraso"
        case .libre: return "Libres"
        }
    }

    var color: Color {
        switch self {
        case .trabajando: return NxColors.verde
        case .retraso: return NxColors.naranja
        case .libre: return NxColors.cian
        }
    }
}

enum ActividadesEquipo {
    /// Marca corta bajo el nombre: por qué esa persona necesita atención ahora.
    struct Marca: Hashable {
        let texto: String
        let color: Color
    }

    /// Una opción de la barra de filtros.
    struct Filtro: Hashable {
        let aro: ActividadesAro?
        let etiqueta: String
        let conteo: Int
        let color: Color?
    }

    /// Lo desconocido cae en «Con retraso» a propósito: es lo que hay que ir a mirar.
    static func aro(_ status: String?) -> ActividadesAro {
        switch (status ?? "").trimmingCharacters(in: .whitespaces).lowercased() {
        case "activo": return .trabajando
        case "libre": return .libre
        default: return .retraso
        }
    }

    /// Primer renglón de la tarjeta: qué está haciendo esa persona.
    static func queHace(_ user: TeamBoardUser) -> String {
        if let t = ActividadesTexto.limpio(user.openActivities?.first?.titulo) { return t }
        if let t = ActividadesTexto.limpio(user.currentActivity?.titulo) { return t }
        if let t = ActividadesTexto.limpio(user.lastFinished?.titulo) { return "Última: \(t)" }
        return "Sin actividad asignada"
    }

    /// «AN-1042 · Despacho · Atrasado 1 h 20 min».
    static func contexto(_ user: TeamBoardUser, now: Date = Date()) -> String {
        let abierta = user.openActivities?.first
        var partes: [String] = []
        if let folio = ActividadesTexto.limpio(abierta?.anNumber) { partes.append(folio) }
        if let carga = cargaTexto(abierta?.assignmentCharge) { partes.append(carga) }
        partes.append(ActividadesTexto.estadoTexto(user, now: now))
        return partes.joined(separator: " · ")
    }

    /// `despacho` / `ejecucion` en palabras; lo demás no se nombra.
    static func cargaTexto(_ charge: String?) -> String? {
        switch (charge ?? "").trimmingCharacters(in: .whitespaces).lowercased() {
        case "despacho": return "Despacho"
        case "ejecucion": return "Ejecución"
        default: return nil
        }
    }

    /// «Tú», quién corrige evidencia devuelta y cuántas entregas esperan aprobación.
    static func marcas(_ user: TeamBoardUser, meId: Int?) -> [Marca] {
        var out: [Marca] = []
        if let meId, user.id == meId { out.append(Marca(texto: "Tú", color: NxColors.azul)) }
        if (user.enCorreccion ?? 0) > 0 { out.append(Marca(texto: "Corrigiendo", color: NxColors.naranja)) }
        let enEspera = user.enEsperaAprobacion ?? 0
        if enEspera > 0 {
            out.append(Marca(texto: enEspera == 1 ? "1 en espera" : "\(enEspera) en espera", color: NxColors.morado))
        }
        return out
    }

    private static func conteo(_ users: [TeamBoardUser]) -> [ActividadesAro: Int] {
        var out: [ActividadesAro: Int] = [:]
        for user in users { out[aro(user.status), default: 0] += 1 }
        return out
    }

    /// Tira de cifras del equipo; con la pizarra vacía no se pinta nada.
    static func metricas(_ users: [TeamBoardUser]) -> [NxMetric] {
        if users.isEmpty { return [] }
        let porAro = conteo(users)
        let trabajando = porAro[.trabajando] ?? 0
        let retraso = porAro[.retraso] ?? 0
        let libres = porAro[.libre] ?? 0
        return [
            NxMetric(
                clave: ActividadesAro.trabajando.clave,
                etiqueta: "Trabajando",
                valor: "\(trabajando)",
                pista: "de \(users.count) en el equipo"
            ),
            NxMetric(
                clave: ActividadesAro.retraso.clave,
                etiqueta: "Con retraso",
                valor: "\(retraso)",
                pista: retraso == 0 ? "nadie pendiente" : "hay que ir a ver",
                color: retraso > 0 ? NxColors.naranja : nil
            ),
            NxMetric(
                clave: ActividadesAro.libre.clave,
                etiqueta: "Libres",
                valor: "\(libres)",
                pista: "terminaron lo suyo"
            ),
        ]
    }

    /// «Todos 8 · Trabajando 3 · Con retraso 2 · Libres 3».
    static func filtros(_ users: [TeamBoardUser]) -> [Filtro] {
        if users.isEmpty { return [] }
        let porAro = conteo(users)
        var out = [Filtro(aro: nil, etiqueta: "Todos", conteo: users.count, color: nil)]
        for aro in ActividadesAro.allCases {
            out.append(Filtro(aro: aro, etiqueta: aro.etiqueta, conteo: porAro[aro] ?? 0, color: aro.color))
        }
        return out
    }

    /// nil = todos.
    static func filtrar(_ users: [TeamBoardUser], _ aro: ActividadesAro?) -> [TeamBoardUser] {
        guard let aro else { return users }
        return users.filter { self.aro($0.status) == aro }
    }
}

// MARK: - KPI de una persona (Android `BoardKpis`)

enum ActividadesKpis {
    struct Tile: Hashable {
        let etiqueta: String
        let valor: String
        let pie: String
        let color: Color
    }

    /// Debajo de esto el número dice algo: rojo. Arriba de `pctBueno`, verde.
    static let pctMalo = 60.0
    static let pctBueno = 85.0

    static func pct(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "—" }
        return "\(Int(value.rounded())) %"
    }

    static func colorPct(_ value: Double?) -> Color {
        guard let value, value.isFinite else { return NxColors.gris }
        if value >= pctBueno { return NxColors.verde }
        if value >= pctMalo { return NxColors.naranja }
        return NxColors.rojo
    }

    /// «4/6» · «—» cuando no hay nada que contar.
    static func razon(_ hechas: Int?, _ total: Int?) -> String {
        if hechas == nil && total == nil { return "—" }
        return "\(hechas ?? 0)/\(total ?? 0)"
    }

    static func rechazadasTexto(_ rechazadas: Int?) -> String {
        guard let rechazadas else { return "de lo asignado" }
        if rechazadas <= 0 { return "ninguna rechazada" }
        return rechazadas == 1 ? "1 rechazada" : "\(rechazadas) rechazadas"
    }

    /// Vacío cuando el API todavía no manda KPI: la rejilla no se pinta.
    static func tiles(_ kpis: TeamBoardKpis?) -> [Tile] {
        guard let k = kpis else { return [] }
        return [
            Tile(
                etiqueta: "A tiempo",
                valor: pct(k.aTiempoPct?.value),
                pie: razon(k.aTiempo, k.cerradas) + " cerradas",
                color: colorPct(k.aTiempoPct?.value)
            ),
            Tile(
                etiqueta: "Eficiencia",
                valor: pct(k.eficienciaPct?.value),
                pie: "plan \(ActividadesTexto.minutosPizarra(k.minutosPlan?.value)) · "
                    + "real \(ActividadesTexto.minutosPizarra(k.minutosReales?.value))",
                color: colorPct(k.eficienciaPct?.value)
            ),
            Tile(
                etiqueta: "Productividad",
                valor: pct(k.productividadPct?.value),
                pie: "\(ActividadesTexto.minutosPizarra(k.minutosEnActividad?.value)) de "
                    + ActividadesTexto.minutosPizarra(k.minutosAsistidos?.value),
                color: colorPct(k.productividadPct?.value)
            ),
            Tile(
                etiqueta: "Cerradas",
                valor: razon(k.cerradas, k.asignadas),
                pie: rechazadasTexto(k.rechazadas),
                color: NxColors.azul
            ),
        ]
    }
}
