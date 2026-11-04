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

    /// Quién mira la pantalla. Se decide igual que en el servidor: dirección por rol o
    /// correo; quien administra, porque trae `tools.manage` sin ser dirección; los demás
    /// son personal. Es pista para no enseñar botones de más: quien decide es el API.
    enum Perfil: Hashable {
        case direccion, administra, personal
    }

    /// Las pestañas de la pantalla. Cada perfil ve las suyas (`vistas(_:)`) y abre en la primera.
    enum Vista: CaseIterable, Hashable {
        case porAprobar, prestamosEmpresa, inventario, kit, prestamos

        var etiqueta: String {
            switch self {
            case .porAprobar: return "Por aprobar"
            case .prestamosEmpresa: return "Préstamos"
            case .inventario: return "Inventario"
            case .kit: return "Mi kit"
            case .prestamos: return "Mis préstamos"
            }
        }
    }

    /// El único botón principal de cada pestaña.
    enum BotonPrincipal: Hashable {
        case pedirPrestamo, nuevaHerramienta

        var etiqueta: String {
            switch self {
            case .pedirPrestamo: return "Pedir préstamo"
            case .nuevaHerramienta: return "Nueva herramienta"
            }
        }
    }

    /// Filtro de los préstamos de toda la empresa.
    enum FiltroEmpresa: CaseIterable, Hashable {
        case abiertos, vencidos, historial

        var etiqueta: String {
            switch self {
            case .abiertos: return "Abiertos"
            case .vencidos: return "Vencidos"
            case .historial: return "Historial"
            }
        }
    }

    /// Lo que se puede hacer con un préstamo de otra persona desde «Préstamos».
    enum AccionDePrestamo: Hashable {
        case entregar, recibir

        var etiqueta: String { self == .entregar ? "Entregar" : "Recibir" }
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

    /// Código, modelo y serie, cada uno listo para su renglón y en ese orden.
    /// Vacío si no hay nada: la pantalla pone entonces «Sin identificación registrada».
    static func renglonesPieza(_ asignacion: KitAsignacion) -> [String] {
        let item = asignacion.inventoryItem
        return [
            item?.codigoInterno?.nilSiVacio,
            item?.model?.nilSiVacio,
            item?.serialNumber?.nilSiVacio.map { "Serie \($0)" },
        ].compactMap { $0 }
    }

    /// «MUL-12345 · Makita HP1640 · Serie 4419B» — la misma identificación, dicha de un tirón.
    static func identificacionPieza(_ asignacion: KitAsignacion) -> String {
        let partes = renglonesPieza(asignacion)
        return partes.isEmpty ? "Sin identificación registrada" : partes.joined(separator: " · ")
    }

    /// Lo mismo para un préstamo, que guarda su propia copia de los datos.
    static func tituloPrestamo(_ prestamo: PrestamoHerramienta) -> String {
        prestamo.toolName?.nilSiVacio ?? prestamo.model?.nilSiVacio ?? "Herramienta sin nombre"
    }

    /// Modelo y serie del préstamo, cada uno en su renglón. El préstamo no trae código interno.
    static func renglonesPrestamo(_ prestamo: PrestamoHerramienta) -> [String] {
        [
            prestamo.model?.nilSiVacio,
            prestamo.serialNumber?.nilSiVacio.map { "Serie \($0)" },
        ].compactMap { $0 }
    }

    static func identificacionPrestamo(_ prestamo: PrestamoHerramienta) -> String {
        let partes = renglonesPrestamo(prestamo)
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

    /// Buscar por nombre, modelo, serie, motivo o persona, que es como se busca a ojo.
    static func buscarPrestamos(_ prestamos: [PrestamoHerramienta], consulta: String) -> [PrestamoHerramienta] {
        let q = consulta.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return prestamos }
        return prestamos.filter { p in
            [p.toolName, p.model, p.serialNumber, p.reason, p.usuario?.nombre]
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

    // MARK: - Por rol

    static func perfil(esDireccion: Bool, permisos: [String]) -> Perfil {
        if esDireccion { return .direccion }
        return permisos.contains("tools.manage") ? .administra : .personal
    }

    static func perfil(de usuario: SessionUser?) -> Perfil {
        perfil(
            esDireccion: CoreOrg.esDireccion(email: usuario?.email, roleKey: usuario?.roleKey),
            permisos: usuario?.permissions ?? []
        )
    }

    static func vistas(_ perfil: Perfil) -> [Vista] {
        switch perfil {
        case .direccion: return [.prestamosEmpresa, .inventario]
        case .administra: return [.porAprobar, .prestamosEmpresa, .inventario, .kit, .prestamos]
        case .personal: return [.kit, .prestamos]
        }
    }

    static func vistaInicial(_ perfil: Perfil) -> Vista {
        vistas(perfil).first ?? .kit
    }

    /// Solo quien lleva el inventario escanea: registrar salidas y entradas es suyo.
    static func muestraEscaner(_ perfil: Perfil) -> Bool { perfil == .administra }

    /// Dirección administra, no pide: el servidor se lo rechaza (`assertCanCreateToolLoan`).
    static func botonPrincipal(_ perfil: Perfil, vista: Vista) -> BotonPrincipal? {
        switch (perfil, vista) {
        case (.personal, _), (.administra, .prestamos): return .pedirPrestamo
        case (.administra, .inventario): return .nuevaHerramienta
        default: return nil
        }
    }

    /// Lo que la pantalla no hace, según quién la mira.
    static func limite(_ perfil: Perfil) -> String {
        switch perfil {
        case .direccion:
            return "Consulta de toda la empresa. Aprobar, entregar y dar de alta lo hace quien lleva el inventario."
        case .administra:
            return "Asignar kits, dictaminar daños y dar de baja piezas se hacen desde la computadora."
        case .personal:
            return "Tú pides y reportas. Aprobar, entregar y recibir lo hace quien lleva el inventario."
        }
    }

    // MARK: - Préstamos de la empresa

    /// El estado dicho por quien mira desde fuera: `IN_USE` ya no es «la traes tú».
    static func etiquetaEstadoEmpresa(_ status: String?) -> String {
        clave(status) == "IN_USE" ? "En uso" : etiquetaEstado(status)
    }

    /// De quién es el préstamo. Sin nombre, el id: es feo, pero es cierto.
    static func nombreDe(_ prestamo: PrestamoHerramienta) -> String {
        if let nombre = prestamo.usuario?.nombre?.nilSiVacio { return nombre }
        if let id = prestamo.usuarioId { return "Usuario #\(id)" }
        return "Sin persona registrada"
    }

    /// El que lleva más tiempo esperando va primero.
    static func pendientes(_ prestamos: [PrestamoHerramienta]) -> [PrestamoHerramienta] {
        prestamos
            .filter { clave($0.status) == "PENDING" }
            .sorted { ($0.requestDate ?? "") < ($1.requestDate ?? "") }
    }

    /// La lista del API ya viene filtrada, pero una prórroga que alguien decidió mientras
    /// tanto no debe volver a ofrecer los botones.
    static func renovacionesPendientes(_ renovaciones: [RenovacionHerramienta]) -> [RenovacionHerramienta] {
        renovaciones.filter { clave($0.status) == "PENDING" }
    }

    /// Lo que se ve en «Préstamos». Quien administra ya tiene lo pendiente en «Por aprobar».
    static func prestamosDeEmpresa(
        _ prestamos: [PrestamoHerramienta],
        perfil: Perfil,
        filtro: FiltroEmpresa,
        hoy: Dia
    ) -> [PrestamoHerramienta] {
        let base = perfil == .administra ? prestamos.filter { clave($0.status) != "PENDING" } : prestamos
        switch filtro {
        case .abiertos: return base.filter { estaAbierto($0) }
        case .vencidos: return base.filter { estaVencido($0, hoy: hoy) }
        case .historial: return base
        }
    }

    /// `APPROVED` se entrega y `IN_USE` se recibe. Lo demás ya no es de la ventanilla.
    static func accionDePrestamo(_ prestamo: PrestamoHerramienta) -> AccionDePrestamo? {
        switch clave(prestamo.status) {
        case "APPROVED": return .entregar
        case "IN_USE": return .recibir
        default: return nil
        }
    }

    /// Un préstamo con código pide teclearlo al entregar (`validarPickup` del servidor).
    static func pideCodigoAlEntregar(_ prestamo: PrestamoHerramienta) -> Bool {
        prestamo.pickupCode?.nilSiVacio != nil
    }

    static func tituloRenovacion(_ renovacion: RenovacionHerramienta) -> String {
        renovacion.toolRequest.map { tituloPrestamo($0) } ?? "Herramienta sin nombre"
    }

    static func nombreDe(_ renovacion: RenovacionHerramienta) -> String {
        renovacion.toolRequest.map { nombreDe($0) } ?? "Sin persona registrada"
    }

    // MARK: - Inventario

    static func tituloPieza(_ pieza: PiezaDeInventario) -> String {
        pieza.toolName?.nilSiVacio ?? pieza.model?.nilSiVacio ?? pieza.codigoInterno?.nilSiVacio ?? "Herramienta sin nombre"
    }

    /// Código, modelo y serie, cada uno listo para su renglón y en ese orden.
    static func renglonesPieza(_ pieza: PiezaDeInventario) -> [String] {
        [
            pieza.codigoInterno?.nilSiVacio,
            pieza.model?.nilSiVacio,
            pieza.serialNumber?.nilSiVacio.map { "Serie \($0)" },
        ].compactMap { $0 }
    }

    /// El inventario del API no dice quién la tiene: se cruza con los préstamos y los kits.
    /// `nil` = ninguna de las dos fuentes la tiene a nombre de alguien.
    static func quienLaTrae(
        _ pieza: PiezaDeInventario,
        prestamos: [PrestamoHerramienta],
        kits: [KitAsignacion]
    ) -> String? {
        let suyos = prestamos.filter { $0.inventoryItemId == pieza.id }
        if let enUso = suyos.first(where: { clave($0.status) == "IN_USE" }) {
            return "La trae \(nombreDe(enUso))"
        }
        if let apartada = suyos.first(where: { clave($0.status) == "APPROVED" }) {
            return "Apartada para \(nombreDe(apartada))"
        }
        let kit = kits.first { $0.inventoryItemId == pieza.id && $0.isActive != false && $0.returnedAt == nil }
        if let nombre = kit?.user?.nombre?.nilSiVacio {
            return "En el kit de \(nombre)"
        }
        return nil
    }

    /// Buscar por nombre, modelo, serie o código, que es lo que trae la etiqueta.
    static func buscarInventario(_ piezas: [PiezaDeInventario], consulta: String) -> [PiezaDeInventario] {
        let q = consulta.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return piezas }
        return piezas.filter { p in
            [p.toolName, p.model, p.serialNumber, p.codigoInterno, p.barcode]
                .compactMap { $0 }
                .contains { $0.lowercased().contains(q) }
        }
    }

    /// Lo que falta para dar de alta una pieza. El servidor exige las dos fotos.
    static func faltaParaAlta(
        nombre: String,
        modelo: String,
        serie: String,
        conPanoramica: Bool,
        conFotoDeSerie: Bool
    ) -> String? {
        if nombre.nilSiVacio == nil { return "Escribe el nombre de la herramienta" }
        if modelo.nilSiVacio == nil { return "Escribe el modelo" }
        if serie.nilSiVacio == nil { return "Escribe el número de serie" }
        if !conPanoramica { return "Falta la foto de la herramienta completa" }
        if !conFotoDeSerie { return "Falta la foto del modelo y la serie" }
        return nil
    }

    // MARK: - Pedir préstamo

    /// Hasta cuándo se pide. Sin calendario, igual que la prórroga: en campo se piensa en
    /// «una semana». Nunca hoy: un préstamo que nace vencido no le sirve a nadie.
    static func plazosParaPedir(hoy: Dia) -> [OpcionPlazo] {
        [
            OpcionPlazo(etiqueta: "Mañana", fecha: hoy.sumando(dias: 1)),
            OpcionPlazo(etiqueta: "3 días", fecha: hoy.sumando(dias: 3)),
            OpcionPlazo(etiqueta: "1 semana", fecha: hoy.sumando(dias: 7)),
            OpcionPlazo(etiqueta: "2 semanas", fecha: hoy.sumando(dias: 14)),
            OpcionPlazo(etiqueta: "1 mes", fecha: hoy.sumando(dias: 30)),
        ]
    }

    /// El plazo que viene marcado: una semana.
    static let plazoPorOmision = 2

    static func faltaParaPedir(tienePieza: Bool, motivo: String) -> String? {
        if !tienePieza { return "Elige la herramienta que necesitas" }
        if motivo.nilSiVacio == nil { return "Di para qué la necesitas" }
        return nil
    }

    /// El vacío de la búsqueda no es un error: hoy el inventario está vacío y es lo normal.
    static let vacioBusquedaTitulo = "Todavía no hay herramientas dadas de alta"

    static func vacioBusquedaTexto(consulta: String) -> String {
        let q = consulta.trimmingCharacters(in: .whitespacesAndNewlines)
        return "Con «\(q)» no salió ninguna libre. Prueba con otra palabra o pregunta en almacén: "
            + "en cuanto la registren, aquí aparece para pedirla."
    }

    static func etiquetaActividad(_ actividad: ActividadDeSolicitud) -> String {
        let texto = [actividad.anNumber?.nilSiVacio, actividad.titulo?.nilSiVacio]
            .compactMap { $0 }
            .joined(separator: " · ")
        return texto.isEmpty ? "Actividad \(actividad.id)" : texto
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
}
