import Foundation

/// Las cuentas de Herramientas, sin una sola línea de SwiftUI. Espejo exacto de
/// `HerramientasRules.kt` en Android (y de sus pruebas `HerramientasRulesTest`).
///
/// Toda la lógica de esta pantalla es de fechas, y las fechas del API llegan como
/// texto ISO en UTC. Compararlas «a ojo» con `hasPrefix` es de donde salen los
/// «vence hoy» que en realidad vencieron ayer: aquí se pasan siempre por
/// `fecha(_:)`, que devuelve `nil` cuando no entiende en vez de inventar una.
///
/// El vocabulario de estados es el del servidor (`ToolRequestStatus` y
/// `ToolInventoryStatus` de `schema.prisma`), traducido a lo que una persona de
/// campo diría: `IN_USE` no es «en uso», es «la traes tú».
enum HerramientasReglas {

    /// La zona en la que trabaja la gente; con ella se decide qué día es «hoy».
    static let zona: TimeZone = TimeZone(identifier: "America/Mexico_City") ?? .current

    /// Tono de la tarjeta, en vocabulario propio (la pantalla lo traduce a `NxTone`).
    enum Tono {
        case neutro, exito, aviso, peligro, info, marca

        var nx: NxTone {
            switch self {
            case .neutro: return .neutral
            case .exito: return .success
            case .aviso: return .warning
            case .peligro: return .danger
            case .info: return .info
            case .marca: return .brand
            }
        }
    }

    /// Las dos mitades de la pantalla. La primera es la que se abre.
    enum Vista: CaseIterable, Hashable {
        case kit, prestamos

        var etiqueta: String {
            switch self {
            case .kit: return "Mi kit"
            case .prestamos: return "Mis préstamos"
            }
        }
    }

    /// Qué préstamos se enseñan. «Abiertos» es lo que todavía se debe.
    enum FiltroPrestamo: CaseIterable, Hashable {
        case abiertos, todos

        var etiqueta: String {
            switch self {
            case .abiertos: return "Abiertos"
            case .todos: return "Historial"
            }
        }
    }

    // MARK: - Día de calendario

    /// Un día, sin hora ni huso (Android `LocalDate`). Una fecha de vencimiento es
    /// un **día**, no un instante.
    struct Dia: Hashable, Comparable {
        let anio: Int
        let mes: Int
        let dia: Int

        /// Calendario en UTC: sin cambios de horario, la resta de días es exacta.
        private static let calendarioUTC: Calendar = {
            var cal = Calendar(identifier: .gregorian)
            cal.timeZone = TimeZone(identifier: "UTC") ?? TimeZone(secondsFromGMT: 0) ?? .current
            return cal
        }()

        /// Qué día es hoy en México, no donde está el servidor ni el teléfono.
        static func hoy(_ ahora: Date = Date()) -> Dia {
            var cal = Calendar(identifier: .gregorian)
            cal.timeZone = HerramientasReglas.zona
            let c = cal.dateComponents([.year, .month, .day], from: ahora)
            return Dia(anio: c.year ?? 1970, mes: c.month ?? 1, dia: c.day ?? 1)
        }

        /// `AAAA-MM-DD` estricto (como `LocalDate.parse`); `nil` si el día no existe.
        static func desdeTexto(_ texto: String) -> Dia? {
            let partes = texto.split(separator: "-", omittingEmptySubsequences: false)
            guard partes.count == 3,
                  partes[0].count == 4, partes[1].count == 2, partes[2].count == 2,
                  partes.allSatisfy({ $0.allSatisfy(\.isASCII) && $0.allSatisfy(\.isNumber) }),
                  let a = Int(partes[0]), let m = Int(partes[1]), let d = Int(partes[2]),
                  (1...12).contains(m), (1...31).contains(d) else { return nil }
            let candidato = Dia(anio: a, mes: m, dia: d)
            // El 31 de septiembre no existe: si al ir y volver cambia, no era un día.
            guard let fecha = candidato.fechaUTC else { return nil }
            let c = calendarioUTC.dateComponents([.year, .month, .day], from: fecha)
            guard c.year == a, c.month == m, c.day == d else { return nil }
            return candidato
        }

        /// Medianoche UTC de este día.
        var fechaUTC: Date? {
            Dia.calendarioUTC.date(from: DateComponents(year: anio, month: mes, day: dia))
        }

        /// Días desde el 1 de enero de 1970 (Android `toEpochDay`).
        var numero: Int {
            guard let fecha = fechaUTC else { return 0 }
            return Int((fecha.timeIntervalSince1970 / 86_400).rounded(.down))
        }

        func sumando(dias: Int) -> Dia {
            guard let fecha = fechaUTC,
                  let nueva = Dia.calendarioUTC.date(byAdding: .day, value: dias, to: fecha) else { return self }
            let c = Dia.calendarioUTC.dateComponents([.year, .month, .day], from: nueva)
            return Dia(anio: c.year ?? anio, mes: c.month ?? mes, dia: c.day ?? dia)
        }

        /// `2026-09-30`.
        var iso: String { String(format: "%04d-%02d-%02d", anio, mes, dia) }

        static func < (a: Dia, b: Dia) -> Bool { (a.anio, a.mes, a.dia) < (b.anio, b.mes, b.dia) }
    }

    // MARK: - Estados

    private static func clave(_ valor: String?) -> String {
        (valor ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    }

    /// `ToolRequestStatus` dicho como se dice en campo.
    static func etiquetaEstado(_ status: String?) -> String {
        switch clave(status) {
        case "PENDING": return "Por aprobar"
        case "APPROVED": return "Lista para recoger"
        case "IN_USE": return "La traes tú"
        case "RETURNED": return "Devuelta"
        case "DAMAGED": return "Devuelta con daño"
        case "REJECTED": return "Rechazada"
        default: return "Sin estado"
        }
    }

    static func tonoEstado(_ status: String?) -> Tono {
        switch clave(status) {
        case "PENDING": return .aviso
        case "APPROVED": return .info
        case "IN_USE": return .marca
        case "RETURNED": return .exito
        case "DAMAGED", "REJECTED": return .peligro
        default: return .neutro
        }
    }

    /// `ToolInventoryStatus` de la pieza del kit.
    static func etiquetaEstadoPieza(_ status: String?) -> String {
        switch clave(status) {
        case "AVAILABLE": return "Disponible"
        case "ASSIGNED": return "Asignada"
        case "IN_REPAIR": return "En reparación"
        case "RETIRED": return "Dada de baja"
        default: return "Sin estado"
        }
    }

    static func tonoEstadoPieza(_ status: String?) -> Tono {
        switch clave(status) {
        case "ASSIGNED": return .marca
        case "AVAILABLE": return .exito
        case "IN_REPAIR": return .aviso
        case "RETIRED": return .peligro
        default: return .neutro
        }
    }

    /// Todavía cuenta: o la esperas, o la tienes. Lo devuelto y lo rechazado es historia.
    static func estaAbierto(_ prestamo: PrestamoHerramienta) -> Bool {
        ["PENDING", "APPROVED", "IN_USE"].contains(clave(prestamo.status))
    }

    /// Solo se pide más plazo de algo que ya te dieron: con la solicitud en
    /// `PENDING` no hay fecha que correr y la prórroga quedaría colgando de un
    /// préstamo que quizá se rechace.
    static func sePuedeRenovar(_ prestamo: PrestamoHerramienta) -> Bool {
        ["APPROVED", "IN_USE"].contains(clave(prestamo.status))
    }

    // MARK: - Fechas

    /// Abreviaturas fijas de Android (`NxFormat.MESES_CORTOS`): la misma fecha se
    /// ve igual en los dos teléfonos.
    private static let mesesCortos = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]

    /// Texto ISO del API → el día que le toca. Prisma serializa `2026-09-30T00:00:00.000Z`;
    /// ese instante en México es el 29 a las 18:00, así que se lee el día que trae el
    /// texto tal cual, igual que la web.
    static func fecha(_ iso: String?) -> Dia? {
        guard let texto = iso?.trimmingCharacters(in: .whitespacesAndNewlines), texto.count >= 10 else {
            return nil
        }
        return Dia.desdeTexto(String(texto.prefix(10)))
    }

    private static let isoConFraccion: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoSinFraccion: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// El instante completo; solo hace falta para saber si un código ya caducó.
    static func instante(_ iso: String?) -> Date? {
        guard let texto = iso?.trimmingCharacters(in: .whitespacesAndNewlines), !texto.isEmpty else { return nil }
        return isoConFraccion.date(from: texto) ?? isoSinFraccion.date(from: texto)
    }

    /// «30 sept 2026», o vacío si no hay fecha: nunca un «nil» en pantalla.
    static func fechaCorta(_ iso: String?) -> String {
        guard let dia = fecha(iso) else { return "" }
        return fechaCorta(dia)
    }

    static func fechaCorta(_ dia: Dia) -> String {
        let mes = (1...12).contains(dia.mes) ? mesesCortos[dia.mes - 1] : ""
        return "\(dia.dia) \(mes) \(dia.anio)"
    }

    /// Días que faltan para `iso`. Negativo = ya venció. `nil` = no hay fecha.
    static func diasPara(_ iso: String?, hoy: Dia) -> Int? {
        guard let dia = fecha(iso) else { return nil }
        return dia.numero - hoy.numero
    }

    /// «Venció hace 3 días», «Venció ayer», «Vence hoy», «Vence mañana», «Faltan 5 días».
    /// Siempre con letras además del color.
    static func textoPlazo(_ iso: String?, hoy: Dia) -> String? {
        guard let dias = diasPara(iso, hoy: hoy) else { return nil }
        switch dias {
        case ..<(-1): return "Venció hace \(-dias) días"
        case -1: return "Venció ayer"
        case 0: return "Vence hoy"
        case 1: return "Vence mañana"
        default: return "Faltan \(dias) días"
        }
    }

    /// Rojo pasado el plazo, ámbar en los tres días previos, gris el resto.
    static func tonoPlazo(_ iso: String?, hoy: Dia) -> Tono {
        guard let dias = diasPara(iso, hoy: hoy) else { return .neutro }
        if dias < 0 { return .peligro }
        if dias <= 3 { return .aviso }
        return .neutro
    }

    /// Pasado de fecha y todavía sin devolver: lo que hay que resolver hoy mismo.
    static func estaVencido(_ prestamo: PrestamoHerramienta, hoy: Dia) -> Bool {
        guard estaAbierto(prestamo), let dias = diasPara(prestamo.expectedReturnDate, hoy: hoy) else { return false }
        return dias < 0
    }

    /// ¿El código de recolección sigue sirviendo? Sin `pickupExpiresAt` se da por
    /// bueno: esconderlo por falta de un dato dejaría a alguien en la ventanilla sin
    /// nada que enseñar.
    static func codigoVigente(_ prestamo: PrestamoHerramienta, ahora: Date) -> Bool {
        guard prestamo.pickupCode?.nilSiVacio != nil else { return false }
        if prestamo.pickedUpAt != nil { return false }
        guard let caduca = instante(prestamo.pickupExpiresAt) else { return true }
        return ahora < caduca
    }

    // MARK: - Kit

    /// Partes de daño que nadie ha dictaminado todavía.
    static func eventosAbiertos(_ asignacion: KitAsignacion) -> Int {
        asignacion.events.filter { clave($0.resolution) == "PENDING" || $0.resolvedAt == nil }.count
    }

    /// Revisión periódica pasada de fecha. Sin revisión programada no hay nada que vencer.
    static func revisionVencida(_ asignacion: KitAsignacion, hoy: Dia) -> Bool {
        guard let dias = diasPara(asignacion.proximaInspeccion, hoy: hoy) else { return false }
        return dias < 0
    }

    /// Lo que traigo encima ahora mismo: asignaciones vivas, sin devolver.
    static func kitActivo(_ kit: [KitAsignacion]) -> [KitAsignacion] {
        kit.filter { $0.isActive != false && $0.returnedAt == nil }
    }

    /// Nombre de la pieza; si el inventario no trae nombre, al menos el modelo.
    static func tituloPieza(_ asignacion: KitAsignacion) -> String {
        let item = asignacion.inventoryItem
        return item?.toolName?.nilSiVacio
            ?? item?.model?.nilSiVacio
            ?? item?.codigoInterno?.nilSiVacio
            ?? "Herramienta sin nombre"
    }

    /// «MUL-12345 · Makita HP1640 · Serie 4419B» — con lo que haya, en ese orden.
    static func identificacionPieza(_ asignacion: KitAsignacion) -> String {
        let item = asignacion.inventoryItem
        let partes = [
            item?.codigoInterno?.nilSiVacio,
            item?.model?.nilSiVacio,
            item?.serialNumber?.nilSiVacio.map { "Serie \($0)" },
        ].compactMap { $0 }
        return partes.isEmpty ? "Sin identificación registrada" : partes.joined(separator: " · ")
    }

    /// Lo mismo para un préstamo, que guarda su propia copia de los datos.
    static func tituloPrestamo(_ prestamo: PrestamoHerramienta) -> String {
        prestamo.toolName?.nilSiVacio ?? prestamo.model?.nilSiVacio ?? "Herramienta sin nombre"
    }

    static func identificacionPrestamo(_ prestamo: PrestamoHerramienta) -> String {
        let partes = [
            prestamo.model?.nilSiVacio,
            prestamo.serialNumber?.nilSiVacio.map { "Serie \($0)" },
        ].compactMap { $0 }
        return partes.isEmpty ? "Sin identificación registrada" : partes.joined(separator: " · ")
    }

    // MARK: - Orden y filtros

    /// Primero lo que urge: lo vencido, luego lo abierto por fecha de devolución más
    /// cercana, y al final el historial de lo más reciente a lo más viejo. Un préstamo
    /// abierto sin fecha va detrás de los que sí la tienen. Orden estable, como
    /// `sortedWith` de Kotlin.
    static func ordenarPrestamos(_ prestamos: [PrestamoHerramienta], hoy: Dia) -> [PrestamoHerramienta] {
        func llave(_ p: PrestamoHerramienta) -> (Int, Int, Int) {
            let grupo = estaVencido(p, hoy: hoy) ? 0 : (estaAbierto(p) ? 1 : 2)
            let dias = diasPara(p.expectedReturnDate, hoy: hoy) ?? Int.max
            let pedido = fecha(p.requestDate).map { -$0.numero } ?? 0
            return (grupo, dias, pedido)
        }
        return prestamos.enumerated()
            .sorted { a, b in
                let la = llave(a.element), lb = llave(b.element)
                if la != lb { return la < lb }
                return a.offset < b.offset
            }
            .map { $0.element }
    }

    /// El kit se ordena por lo que reclama atención: daño abierto, revisión vencida,
    /// y el resto por nombre.
    static func ordenarKit(_ kit: [KitAsignacion], hoy: Dia) -> [KitAsignacion] {
        func llave(_ k: KitAsignacion) -> (Int, Int, String) {
            (eventosAbiertos(k) > 0 ? 0 : 1, revisionVencida(k, hoy: hoy) ? 0 : 1, tituloPieza(k).lowercased())
        }
        return kit.enumerated()
            .sorted { a, b in
                let la = llave(a.element), lb = llave(b.element)
                if la != lb { return la < lb }
                return a.offset < b.offset
            }
            .map { $0.element }
    }

    static func filtrarPrestamos(_ prestamos: [PrestamoHerramienta], filtro: FiltroPrestamo) -> [PrestamoHerramienta] {
        switch filtro {
        case .abiertos: return prestamos.filter { estaAbierto($0) }
        case .todos: return prestamos
        }
    }

    /// Buscar por nombre, modelo, serie o motivo, que es como se busca una herramienta a ojo.
    static func buscarPrestamos(_ prestamos: [PrestamoHerramienta], consulta: String) -> [PrestamoHerramienta] {
        let q = consulta.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return prestamos }
        return prestamos.filter { p in
            [p.toolName, p.model, p.serialNumber, p.reason]
                .compactMap { $0 }
                .contains { $0.lowercased().contains(q) }
        }
    }

    // MARK: - Resúmenes

    /// «2 vencidas · 3 abiertas», o `nil` cuando no hay nada abierto que contar.
    static func resumenPrestamos(_ prestamos: [PrestamoHerramienta], hoy: Dia) -> String? {
        let abiertos = prestamos.filter { estaAbierto($0) }
        guard !abiertos.isEmpty else { return nil }
        let vencidos = abiertos.filter { estaVencido($0, hoy: hoy) }.count
        var partes: [String] = []
        if vencidos > 0 { partes.append(vencidos == 1 ? "1 vencida" : "\(vencidos) vencidas") }
        let resto = abiertos.count - vencidos
        if resto > 0 { partes.append(resto == 1 ? "1 abierta" : "\(resto) abiertas") }
        return partes.joined(separator: " · ")
    }

    /// Lo que el kit reclama: daños sin cerrar y revisiones pasadas de fecha.
    static func resumenKit(_ kit: [KitAsignacion], hoy: Dia) -> String? {
        let activo = kitActivo(kit)
        let conDanio = activo.filter { eventosAbiertos($0) > 0 }.count
        let conRevision = activo.filter { revisionVencida($0, hoy: hoy) }.count
        var partes: [String] = []
        if conDanio > 0 { partes.append(conDanio == 1 ? "1 con daño sin cerrar" : "\(conDanio) con daño sin cerrar") }
        if conRevision > 0 {
            partes.append(conRevision == 1 ? "1 con revisión vencida" : "\(conRevision) con revisión vencida")
        }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    // MARK: - Renovación

    /// Una opción de prórroga: «+7 días» y la fecha que resultaría.
    struct OpcionPlazo: Hashable {
        let etiqueta: String
        let fecha: Dia
    }

    /// Los plazos que se ofrecen al renovar, contados desde la fecha que hoy tiene el
    /// préstamo — o desde hoy si ya venció, porque ampliar una fecha pasada dejaría
    /// un plazo que nace vencido.
    static func fechasSugeridas(_ prestamo: PrestamoHerramienta, hoy: Dia, dias: [Int] = [7, 15, 30]) -> [OpcionPlazo] {
        let vigente = fecha(prestamo.expectedReturnDate)
        let base = (vigente.map { !($0 < hoy) } ?? false) ? (vigente ?? hoy) : hoy
        return dias.map { OpcionPlazo(etiqueta: "+\($0) días", fecha: base.sumando(dias: $0)) }
    }

    /// La fecha elegida, en el texto que espera el API. Mediodía UTC a propósito:
    /// con `T00:00:00Z` el mismo día se leería como el anterior en México («pedí hasta
    /// el 30 y me dieron hasta el 29»).
    static func fechaParaApi(_ dia: Dia) -> String { "\(dia.iso)T12:00:00.000Z" }

    /// Lo que esta pantalla no hace, dicho al pie sin mandar a nadie al navegador.
    /// Texto idéntico al de Android (`HerramientasRules.LIMITE`).
    static let limite =
        "Consulta, prórrogas y escáner de etiquetas. Entregar y recibir con el escáner solo lo " +
        "puede quien lleva el inventario; pedir una herramienta prestada y aprobar se hacen desde almacén."
}
