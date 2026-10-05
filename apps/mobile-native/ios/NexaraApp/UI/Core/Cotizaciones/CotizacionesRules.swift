import Foundation

/// Cotizaciones en el teléfono: qué se enseña de cada una y en qué orden.
/// Espejo de `CotizacionesRules.kt` de Android (y de sus pruebas,
/// `CotizacionesRulesTest`).
///
/// Cada cotización es una tarjeta con la jerarquía que pide el teléfono: **folio
/// y cliente arriba, el monto grande, el estado al lado**, y debajo la única
/// alerta que obliga a hacer algo hoy — que una enviada esté a punto de vencer.
///
/// Los importes pasan por `centavos`, que se traga número o texto y devuelve
/// `nil` si no entiende — nunca un cero fingido, que en dinero es una mentira cara.
enum CotizacionesRules {

    // MARK: - Estado

    /// `EstadoCotizacion` del servidor (`apps/api/src/cotizaciones/estado-cotizacion.ts`).
    enum Estado: String, CaseIterable {
        case borrador = "BORRADOR"
        case enviada = "ENVIADA"
        case aprobada = "APROBADA"
        case rechazada = "RECHAZADA"
        case vencida = "VENCIDA"
        case desconocido = ""

        var etiqueta: String {
            switch self {
            case .borrador: return "Borrador"
            case .enviada: return "Enviada"
            case .aprobada: return "Aprobada"
            case .rechazada: return "Rechazada"
            case .vencida: return "Vencida"
            case .desconocido: return "Sin estado"
            }
        }
    }

    /// Estado a partir de lo que mande el servidor. Acepta también el enum en
    /// inglés de la base (`DRAFT`, `SENT`…).
    static func estado(_ valor: String?) -> Estado {
        let clave = (valor ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if let estado = Estado(rawValue: clave), estado != .desconocido { return estado }
        switch clave {
        case "DRAFT": return .borrador
        case "SENT": return .enviada
        case "APPROVED": return .aprobada
        case "REJECTED": return .rechazada
        case "EXPIRED": return .vencida
        default: return .desconocido
        }
    }

    static func estadoDe(_ row: CotizacionResumen) -> Estado { estado(row.estado) }

    /// La etiqueta del servidor si viene; si no, la nuestra.
    static func etiquetaEstado(_ row: CotizacionResumen) -> String {
        limpio(row.estadoEtiqueta) ?? estadoDe(row).etiqueta
    }

    static func etiquetaEstado(_ detalle: CotizacionDetalle) -> String {
        limpio(detalle.estadoEtiqueta) ?? estado(detalle.estado).etiqueta
    }

    /// Etiqueta del segmento; el servidor la manda en español (`ETIQUETA_SEGMENTO`).
    static func etiquetaSegmento(_ row: CotizacionResumen) -> String? {
        if let etiqueta = limpio(row.segmentoEtiqueta) { return etiqueta }
        guard let segmento = limpio(row.segmento) else { return nil }
        let minusculas = segmento.lowercased(with: espanol)
        return minusculas.prefix(1).uppercased(with: espanol) + String(minusculas.dropFirst())
    }

    // MARK: - Filtros

    /// Los filtros de arriba, pensados por lo que se hace con cada grupo:
    /// - **Por cerrar**: enviadas, el dinero que está en la mesa.
    /// - **Borradores**: lo que falta terminar (se termina en la web).
    /// - **Aprobadas**: lo que ya se ganó.
    /// - **Perdidas**: rechazadas y vencidas juntas: no se cobró.
    enum Filtro: String, CaseIterable, Hashable {
        case todas, porCerrar, borradores, aprobadas, perdidas

        var etiqueta: String {
            switch self {
            case .todas: return "Todas"
            case .porCerrar: return "Por cerrar"
            case .borradores: return "Borradores"
            case .aprobadas: return "Aprobadas"
            case .perdidas: return "Perdidas"
            }
        }
    }

    static func cumple(_ row: CotizacionResumen, _ filtro: Filtro) -> Bool {
        let estado = estadoDe(row)
        switch filtro {
        case .todas: return true
        case .porCerrar: return estado == .enviada
        case .borradores: return estado == .borrador
        case .aprobadas: return estado == .aprobada
        case .perdidas: return estado == .rechazada || estado == .vencida
        }
    }

    /// Lo que la búsqueda mira: lo mismo que la web (folio, cliente, empresa,
    /// proyecto, quien la hizo y quienes intervinieron con nombre y siglas).
    /// Buscar «JA» tiene que encontrar la que revisó Juan Aguilar.
    private static func camposBuscables(_ row: CotizacionResumen) -> [String] {
        var campos = [
            row.folio, row.clienteNombre, row.clienteEmpresa, row.projectName,
            row.elaboro?.nombre, row.elaboro?.siglas,
        ].compactMap { $0 }
        for persona in row.intervinieron ?? [] {
            if let nombre = persona.nombre { campos.append(nombre) }
            if let siglas = persona.siglas { campos.append(siglas) }
        }
        return campos
    }

    static func coincide(_ row: CotizacionResumen, _ consulta: String) -> Bool {
        let q = consulta.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(with: espanol)
        if q.isEmpty { return true }
        return camposBuscables(row).contains { $0.lowercased(with: espanol).contains(q) }
    }

    /// El orden de la web: la más reciente primero. `createdAt` es ISO y se
    /// compara como texto; las que no traen fecha caen al final por `id`.
    static func ordenar(_ cotizaciones: [CotizacionResumen]) -> [CotizacionResumen] {
        cotizaciones.sorted { a, b in
            let fa = a.createdAt ?? ""
            let fb = b.createdAt ?? ""
            if fa != fb { return fa > fb }
            return (a.id ?? 0) > (b.id ?? 0)
        }
    }

    /// Filtro + búsqueda, ya ordenado: lo que se pinta.
    static func aplicar(_ cotizaciones: [CotizacionResumen], filtro: Filtro, consulta: String) -> [CotizacionResumen] {
        ordenar(cotizaciones.filter { cumple($0, filtro) && coincide($0, consulta) })
    }

    /// Cuántas hay en cada filtro, para el número de la pastilla.
    static func conteos(_ cotizaciones: [CotizacionResumen]) -> [Filtro: Int] {
        var resultado: [Filtro: Int] = [:]
        for filtro in Filtro.allCases {
            resultado[filtro] = cotizaciones.filter { cumple($0, filtro) }.count
        }
        return resultado
    }

    // MARK: - Dinero

    /// Importe del API → centavos. `nil` si no es un número.
    ///
    /// Se redondea a centavo «hacia arriba en el medio» (`HALF_UP`), la misma
    /// regla que el servidor (`Math.round(n * 100)`), con aritmética decimal
    /// para que `12.345` dé 1,235 y no 1,234 por el error de coma flotante.
    static func centavos(_ valor: String?) -> Int? {
        guard let texto = valor?.trimmingCharacters(in: .whitespacesAndNewlines),
              !texto.isEmpty, texto != "null",
              texto.range(of: numeroValido, options: .regularExpression) != nil else { return nil }
        var decimal: Decimal
        if let leido = Decimal(string: texto, locale: Locale(identifier: "en_US_POSIX")) {
            decimal = leido
        } else if let doble = Double(texto), doble.isFinite {
            decimal = Decimal(doble)
        } else {
            return nil
        }
        decimal *= 100
        var redondeado = Decimal()
        NSDecimalRound(&redondeado, &decimal, 0, .plain)
        let numero = NSDecimalNumber(decimal: redondeado)
        guard abs(numero.doubleValue) < 9.0e18 else { return nil }
        return Int(numero.int64Value)
    }

    /// Número decimal escrito como lo manda el API (`14500.5`, `-3`, `1e9`).
    private static let numeroValido = "^[+-]?([0-9]+\\.?[0-9]*|\\.[0-9]+)([eE][+-]?[0-9]+)?$"

    /// Importe listo para leer: `"$1,234.56"`, o `"—"` si no hay cifra. Usa
    /// `Dinero`, el mismo formateador de pesos que Viáticos.
    static func pesos(_ valor: String?) -> String {
        guard let centavos = centavos(valor) else { return "—" }
        return Dinero.pesos(centavos)
    }

    /// Monto de la cotización, con la moneda cuando no es el peso mexicano.
    static func montoTexto(_ row: CotizacionResumen) -> String {
        let monto = pesos(row.total)
        let moneda = limpio(row.currency)?.uppercased(with: espanol)
        if monto != "—", let moneda, moneda != "MXN" { return "\(monto) \(moneda)" }
        return monto
    }

    /// Las dos cifras de arriba: lo que está en la mesa y lo que ya se ganó.
    /// Las cotizaciones sin importe legible no suman.
    struct Cifras: Equatable {
        let porCerrarCentavos: Int
        let porCerrar: Int
        let aprobadoCentavos: Int
        let aprobadas: Int
    }

    static func cifras(_ cotizaciones: [CotizacionResumen]) -> Cifras {
        let enviadas = cotizaciones.filter { estadoDe($0) == .enviada }
        let aprobadas = cotizaciones.filter { estadoDe($0) == .aprobada }
        return Cifras(
            porCerrarCentavos: enviadas.reduce(0) { $0 + (centavos($1.total) ?? 0) },
            porCerrar: enviadas.count,
            aprobadoCentavos: aprobadas.reduce(0) { $0 + (centavos($1.total) ?? 0) },
            aprobadas: aprobadas.count
        )
    }

    // MARK: - Textos de la tarjeta

    /// A quién se le cotizó. La empresa manda sobre el contacto.
    static func clienteTexto(_ row: CotizacionResumen) -> String {
        let empresa = limpio(row.clienteEmpresa)
        let persona = limpio(row.clienteNombre)
        if let empresa, let persona, empresa.caseInsensitiveCompare(persona) != .orderedSame {
            return "\(empresa) · \(persona)"
        }
        return empresa ?? persona ?? "Sin cliente"
    }

    /// Proyecto y segmento en una línea; ninguno es obligatorio.
    static func contextoTexto(_ row: CotizacionResumen) -> String? {
        let partes = [limpio(row.projectName), etiquetaSegmento(row)].compactMap { $0 }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    /// Siglas de quienes intervinieron, sin repetir y en orden. Si nadie quedó
    /// registrado, las de quien la hizo.
    static func siglas(_ row: CotizacionResumen) -> [String] {
        var vistas: [String] = []
        for persona in row.intervinieron ?? [] {
            if let siglas = limpio(persona.siglas), !vistas.contains(siglas) { vistas.append(siglas) }
        }
        if !vistas.isEmpty { return vistas }
        return [limpio(row.elaboro?.siglas)].compactMap { $0 }
    }

    /// «Elaboró Ana López · revisión 2» — el folio en palabras, corto.
    static func autoriaTexto(_ row: CotizacionResumen) -> String? {
        let revision = row.revision ?? 1
        let partes = [
            limpio(row.elaboro?.nombre).map { "Elaboró \($0)" },
            revision > 1 ? "revisión \(revision)" : nil,
        ].compactMap { $0 }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    // MARK: - Vigencia

    /// A partir de cuántos días antes se avisa de una vigencia que se acaba.
    static let avisoVigenciaDias = 7

    /// Días que faltan para que venza; negativo si ya pasó. `nil` sin fecha.
    static func diasParaVencer(_ validUntil: String?, hoy: Dia = CotizacionesRules.hoyEnMexico()) -> Int? {
        guard let fecha = dia(validUntil) else { return nil }
        return diasEntre(hoy, fecha)
    }

    /// La única alerta de la lista: una **enviada** a punto de vencer, o ya
    /// vencida sin que nadie la haya marcado.
    static func vigenciaTexto(_ row: CotizacionResumen, hoy: Dia = CotizacionesRules.hoyEnMexico()) -> String? {
        guard estadoDe(row) == .enviada, let dias = diasParaVencer(row.validUntil, hoy: hoy) else { return nil }
        if dias < -1 { return "Venció hace \(-dias) días" }
        if dias == -1 { return "Venció ayer" }
        if dias == 0 { return "Vence hoy" }
        if dias == 1 { return "Vence mañana" }
        if dias <= avisoVigenciaDias { return "Vence en \(dias) días" }
        return nil
    }

    /// ¿Ese aviso de vigencia es ya un problema (venció o vence hoy)?
    static func vigenciaVencida(_ row: CotizacionResumen, hoy: Dia = CotizacionesRules.hoyEnMexico()) -> Bool {
        guard estadoDe(row) == .enviada, let dias = diasParaVencer(row.validUntil, hoy: hoy) else { return false }
        return dias <= 0
    }

    // MARK: - Fechas

    /// Un día del calendario, sin hora ni zona.
    struct Dia: Hashable, Comparable {
        let anio: Int
        let mes: Int
        let dia: Int

        static func < (a: Dia, b: Dia) -> Bool {
            (a.anio, a.mes, a.dia) < (b.anio, b.mes, b.dia)
        }
    }

    static let zonaMexico: TimeZone = TimeZone(identifier: "America/Mexico_City") ?? TimeZone(secondsFromGMT: -6 * 3600) ?? .current

    private static let calendario: Calendar = {
        var calendario = Calendar(identifier: .gregorian)
        calendario.timeZone = zonaMexico
        return calendario
    }()

    /// Hoy en la Ciudad de México, no en el huso del teléfono.
    static func hoyEnMexico(_ ahora: Date = Date()) -> Dia {
        diaEnMexico(ahora)
    }

    /// Fecha del API como día del calendario.
    ///
    /// Igual que `formatoFecha` de la web (`lib/cotizaciones-api.ts`): emisión y
    /// vigencia son días sin hora guardados a medianoche UTC, y se leen tal cual
    /// (pasarlas a la hora de México las retrasaba un día: «2026-09-18» se leía 17
    /// de septiembre). Un instante de verdad (`sentAt`, `createdAt`, cuándo
    /// intervino alguien) sí se pasa a la hora de México: una cotización enviada
    /// a las 19:00 del 17 es `01:00Z` del 18 y cortar el texto diría que salió al
    /// día siguiente (Android corta siempre; aquí se sigue a la web).
    static func dia(_ iso: String?) -> Dia? {
        guard let texto = iso?.trimmingCharacters(in: .whitespacesAndNewlines),
              texto.count >= 10, texto != "null",
              let base = diaDeTexto(String(texto.prefix(10))) else { return nil }
        let resto = texto.dropFirst(10)
        if resto.isEmpty || resto == "T00:00:00Z" || resto == "T00:00:00.000Z" { return base }
        if let instante = NxFormat.parseISO(texto) { return diaEnMexico(instante) }
        return base
    }

    /// «25 sept» · `nil` si no se puede leer: antes ninguna fecha que una inventada.
    static func fechaCorta(_ iso: String?) -> String? {
        dia(iso).map(corto)
    }

    /// «25 sept 2026» — para el detalle, donde el año sí importa.
    static func fechaLarga(_ iso: String?) -> String? {
        dia(iso).map(largo)
    }

    /// La fecha que corresponde al estado: cuándo salió si ya se envió, cuándo
    /// se creó si sigue en borrador.
    static func fechaTexto(_ row: CotizacionResumen) -> String? {
        if estadoDe(row) == .borrador {
            return fechaCorta(row.createdAt).map { "Creada \($0)" }
        }
        if let enviada = fechaCorta(row.sentAt) { return "Enviada \(enviada)" }
        return fechaCorta(row.createdAt).map { "Creada \($0)" }
    }

    // MARK: - Detalle

    /// Etiqueta del grupo; el servidor ya la manda en español (`ETIQUETA_GRUPO`).
    static func etiquetaGrupo(_ grupo: CotizacionGrupo) -> String {
        if let etiqueta = limpio(grupo.etiqueta) { return etiqueta }
        switch (grupo.grupo ?? "").trimmingCharacters(in: .whitespaces).uppercased() {
        case "EQUIPOS": return "Equipos"
        case "MATERIALES": return "Materiales"
        case "MANO_DE_OBRA": return "Mano de obra"
        default: return "Otros conceptos"
        }
    }

    /// Grupos con partidas, en el orden en que llegan.
    static func gruposConPartidas(_ detalle: CotizacionDetalle) -> [CotizacionGrupo] {
        (detalle.grupos ?? []).filter { !($0.partidas ?? []).isEmpty }
    }

    static func totalPartidas(_ detalle: CotizacionDetalle) -> Int {
        gruposConPartidas(detalle).reduce(0) { $0 + ($1.partidas ?? []).count }
    }

    /// Nombre de la partida; si no hay, la categoría, y si tampoco, algo honesto.
    static func partidaTitulo(_ partida: CotizacionPartida) -> String {
        limpio(partida.name) ?? limpio(partida.category) ?? "Concepto sin nombre"
    }

    /// «3 pza × $1,200.00» — cantidad, unidad y precio unitario en una línea.
    static func partidaCantidadTexto(_ partida: CotizacionPartida) -> String? {
        let izquierdaPartes = [numeroTexto(partida.qty), limpio(partida.unit)].compactMap { $0 }
        let izquierda = izquierdaPartes.isEmpty ? nil : izquierdaPartes.joined(separator: " ")
        let precio = centavos(partida.unitPrice).map { Dinero.pesos($0) }
        switch (izquierda, precio) {
        case let (izquierda?, precio?): return "\(izquierda) × \(precio)"
        case let (izquierda?, nil): return izquierda
        case let (nil, precio?): return precio
        default: return nil
        }
    }

    /// Importe de la partida, o `"—"` cuando el servidor no lo mandó.
    static func partidaImporteTexto(_ partida: CotizacionPartida) -> String {
        pesos(partida.lineTotal)
    }

    /// Un número del API sin decimales de adorno: `"3"`, `"2.5"`, `nil`.
    static func numeroTexto(_ valor: String?) -> String? {
        guard let texto = valor?.trimmingCharacters(in: .whitespacesAndNewlines),
              !texto.isEmpty, texto != "null",
              texto.range(of: numeroValido, options: .regularExpression) != nil else { return nil }
        if let decimal = Decimal(string: texto, locale: Locale(identifier: "en_US_POSIX")) {
            return NSDecimalNumber(decimal: decimal).stringValue
        }
        guard let doble = Double(texto), doble.isFinite else { return nil }
        return NSDecimalNumber(decimal: Decimal(doble)).stringValue
    }

    /// A quién se le pasó por dentro; `nil` si no se pasó a nadie.
    static func asignacionTexto(_ detalle: CotizacionDetalle) -> String? {
        guard let quien = limpio(detalle.asignadoA?.nombre) else { return nil }
        if let dePor = limpio(detalle.asignadoPor?.nombre) {
            return "En manos de \(quien) · se la pasó \(dePor)"
        }
        return "En manos de \(quien)"
    }

    /// Por qué se rechazó y quién lo dijo; `nil` si no está rechazada.
    static func rechazoTexto(_ detalle: CotizacionDetalle) -> String? {
        guard estado(detalle.estado) == .rechazada else { return nil }
        let motivo = limpio(detalle.rejectedReason)
        let quien = limpio(detalle.rejectedByName)
        switch (motivo, quien) {
        case let (motivo?, quien?): return "\(quien) la rechazó: \(motivo)"
        case let (motivo?, nil): return "Motivo: \(motivo)"
        case let (nil, quien?): return "\(quien) la rechazó, sin motivo registrado."
        default: return "Rechazada sin motivo registrado."
        }
    }

    /// Nombre con el que se guarda o comparte el PDF: el folio, no «cotizacion-482».
    static func nombreArchivoPdf(id: Int, folio: String?, interno: Bool = false) -> String {
        let base = limpio(folio) ?? "cotizacion-\(id)"
        var nombre = base
            .replacingOccurrences(of: "[^A-Za-z0-9._-]", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        if nombre.isEmpty { nombre = "cotizacion-\(id)" }
        return (interno ? "\(nombre)-interno" : nombre) + ".pdf"
    }

    /// Qué no hace esta pantalla.
    static let limite =
        "Consulta. Crear y editar una cotización, mandarla al cliente y decidirla se hacen desde la computadora."

    // MARK: - Utilidades

    private static let espanol = Locale(identifier: "es_MX")

    /// Abreviaturas fijas (las mismas que `NxFormat.patron` de Android): la misma
    /// fecha no puede verse «sep», «sept» o «sep.» según la versión del sistema.
    private static let mesesCortos = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]

    private static func limpio(_ valor: String?) -> String? {
        guard let texto = valor?.trimmingCharacters(in: .whitespacesAndNewlines), !texto.isEmpty else { return nil }
        return texto
    }

    private static func corto(_ dia: Dia) -> String {
        let mes = (1...12).contains(dia.mes) ? mesesCortos[dia.mes - 1] : "?"
        return "\(dia.dia) \(mes)"
    }

    private static func largo(_ dia: Dia) -> String {
        "\(corto(dia)) \(dia.anio)"
    }

    private static func diaEnMexico(_ fecha: Date) -> Dia {
        let c = calendario.dateComponents([.year, .month, .day], from: fecha)
        return Dia(anio: c.year ?? 1970, mes: c.month ?? 1, dia: c.day ?? 1)
    }

    /// `AAAA-MM-DD` → día, validando que exista (`2026-13-45` no es una fecha).
    private static func diaDeTexto(_ texto: String) -> Dia? {
        let partes = texto.split(separator: "-", omittingEmptySubsequences: false)
        guard partes.count == 3, partes[0].count == 4, partes[1].count == 2, partes[2].count == 2,
              let anio = Int(partes[0]), let mes = Int(partes[1]), let dia = Int(partes[2]),
              (1...12).contains(mes), dia >= 1,
              let primero = calendario.date(from: DateComponents(year: anio, month: mes, day: 1, hour: 12)),
              let dias = calendario.range(of: .day, in: .month, for: primero),
              dias.contains(dia) else { return nil }
        return Dia(anio: anio, mes: mes, dia: dia)
    }

    private static func diasEntre(_ desde: Dia, _ hasta: Dia) -> Int? {
        guard let a = calendario.date(from: DateComponents(year: desde.anio, month: desde.mes, day: desde.dia, hour: 12)),
              let b = calendario.date(from: DateComponents(year: hasta.anio, month: hasta.mes, day: hasta.dia, hour: 12))
        else { return nil }
        return calendario.dateComponents([.day], from: a, to: b).day
    }
}
