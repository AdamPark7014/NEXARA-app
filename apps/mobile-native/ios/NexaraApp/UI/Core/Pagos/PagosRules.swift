import SwiftUI

/// Pagos a empleados en el teléfono: qué se enseña de cada pago, en qué orden y
/// qué cifras van arriba. Espejo de `PagosRules.kt` de Android (y de sus
/// pruebas, `PagosRulesTest`).
///
/// **Esto es nómina.** La regla que manda sobre todas: un importe que no se
/// puede interpretar con certeza se enseña como `"—"`, nunca como cero. Por el
/// mismo motivo, un `status` que no se reconozca **no se da por pagado**: el
/// servidor normaliza lo raro a `Pagado` al escribir, pero al leer eso sería
/// afirmar que el dinero salió sin saberlo.
///
/// Aquí no se paga nada: se consulta. Cada pago es una fila densa que contesta
/// **a quién, cuánto, de qué periodo y si ya salió**.
enum PagosRules {

    // MARK: - Estado

    /// Los tres estados del servidor (`STATUS` de `employee-payments.service.ts`)
    /// más `desconocido`, que el servidor no tiene y esta pantalla sí necesita.
    enum Estado: String, CaseIterable {
        case borrador = "Borrador"
        case pagado = "Pagado"
        case anulado = "Anulado"
        case desconocido = ""

        var etiqueta: String {
            switch self {
            case .borrador: return "Borrador"
            case .pagado: return "Pagado"
            case .anulado: return "Anulado"
            case .desconocido: return "Estado desconocido"
            }
        }
    }

    /// Estado a partir de lo que mande el servidor. Se aceptan los mismos
    /// sinónimos que `normalizeStatus` y el inglés de la base; lo que no se
    /// reconoce se queda en `desconocido` (el `else` del servidor NO se copia).
    static func estado(_ valor: String?) -> Estado {
        switch (valor ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased(with: espanol) {
        case "borrador", "draft", "pendiente": return .borrador
        case "pagado", "paid": return .pagado
        case "anulado", "cancelado", "void", "canceled", "cancelled": return .anulado
        default: return .desconocido
        }
    }

    static func estadoDe(_ row: PagoEmpleado) -> Estado { estado(row.status) }

    /// Los colores de `.ai/DISENO-TOKENS.md` que usa Android: `--ui-success`,
    /// `--ui-warning` y `--ui-fg-3`.
    static let verde = NxColors.verde      // #16A34A
    static let ambar = NxColors.naranja    // #D97706
    static let gris = NxColors.fg4         // #94A3B8

    /// Gris para el flujo normal, color **solo** cuando el renglón pide acción o
    /// algo salió mal: un borrador pide autorización y un estado ilegible, que
    /// alguien lo mire.
    static func colorDe(_ estado: Estado) -> Color {
        switch estado {
        case .pagado: return verde
        case .borrador: return ambar
        case .anulado: return gris
        case .desconocido: return ambar
        }
    }

    // MARK: - Dinero

    /// Importe del API → centavos. `nil` si no es un número. Redondeo a centavo
    /// «hacia arriba en el medio», igual que `Math.round(n * 100)` del servidor.
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

    private static let numeroValido = "^[+-]?([0-9]+\\.?[0-9]*|\\.[0-9]+)([eE][+-]?[0-9]+)?$"

    static func centavosDe(_ row: PagoEmpleado) -> Int? { centavos(row.amount) }

    /// El importe listo para leer: `"$12,345.67"`, o `sinDato` si no hay cifra.
    static func pesos(_ valor: String?) -> String {
        guard let centavos = centavos(valor) else { return sinDato }
        return Dinero.pesos(centavos)
    }

    static func montoTexto(_ row: PagoEmpleado) -> String { pesos(row.amount) }

    static func tieneImporteLegible(_ row: PagoEmpleado) -> Bool { centavosDe(row) != nil }

    // MARK: - Fechas

    /// La zona en la que trabaja la gente; con ella se decide qué día fue un instante.
    static let zona: TimeZone = TimeZone(identifier: "America/Mexico_City") ?? TimeZone(secondsFromGMT: -6 * 3600) ?? .current

    private static let calendario: Calendar = {
        var calendario = Calendar(identifier: .gregorian)
        calendario.timeZone = zona
        return calendario
    }()

    /// Un día del calendario, sin hora ni zona.
    struct Dia: Hashable, Comparable {
        let anio: Int
        let mes: Int
        let dia: Int

        static func < (a: Dia, b: Dia) -> Bool {
            (a.anio, a.mes, a.dia) < (b.anio, b.mes, b.dia)
        }
    }

    /// Un **día** del API (`periodFrom`, `periodTo`): se cortan los diez
    /// primeros caracteres a propósito. Son `@db.Date` guardados a medianoche
    /// UTC; pasarlos a la hora de México correría el periodo un día hacia atrás
    /// por los dos extremos, que es justo el error que la gente nota en su recibo.
    static func dia(_ iso: String?) -> Dia? {
        guard let texto = iso?.trimmingCharacters(in: .whitespacesAndNewlines), texto.count >= 10 else { return nil }
        return diaDeTexto(String(texto.prefix(10)))
    }

    /// Un **instante** del API (`paidAt`, `createdAt`) como el día que fue en
    /// México: un pago marcado a las 19:00 de un martes es `01:00Z` del miércoles.
    static func diaDeInstante(_ iso: String?) -> Dia? {
        guard let texto = iso?.trimmingCharacters(in: .whitespacesAndNewlines),
              !texto.isEmpty, texto != "null",
              let instante = NxFormat.parseISO(texto) else { return nil }
        // `parseISO` también entiende un `AAAA-MM-DD` suelto (lo lee a medianoche
        // del huso del teléfono); ese caso es un día, no un instante.
        if texto.count == 10 { return diaDeTexto(texto) }
        let c = calendario.dateComponents([.year, .month, .day], from: instante)
        guard let anio = c.year, let mes = c.month, let dia = c.day else { return nil }
        return Dia(anio: anio, mes: mes, dia: dia)
    }

    /// El periodo que cubre el pago, en una línea: `"1 – 15 sept 2026"`.
    ///
    /// Dentro del mismo mes solo se escribe una vez el mes, y dentro del mismo año
    /// una vez el año. Si falta cualquiera de las dos fechas devuelve `nil`: media
    /// línea de periodo se lee como el periodo entero y sería mentira.
    static func periodoTexto(_ row: PagoEmpleado) -> String? {
        guard let desde = dia(row.periodFrom), let hasta = dia(row.periodTo) else { return nil }
        if desde == hasta { return largo(desde) }
        if desde.anio == hasta.anio && desde.mes == hasta.mes { return "\(desde.dia) – \(largo(hasta))" }
        if desde.anio == hasta.anio { return "\(corto(desde)) – \(largo(hasta))" }
        return "\(largo(desde)) – \(largo(hasta))"
    }

    /// Cuándo salió el dinero: `"Pagado el 20 sept 2026"`. Solo para los
    /// pagados que traen el instante: un `Pagado` sin `paidAt` no se inventa la
    /// fecha de captura.
    static func pagadoElTexto(_ row: PagoEmpleado) -> String? {
        guard estadoDe(row) == .pagado, let dia = diaDeInstante(row.paidAt) else { return nil }
        return "Pagado el \(largo(dia))"
    }

    // MARK: - Textos de la fila

    /// De quién es el pago. Sin usuario, el id (`Usuario #12`): es feo, pero es
    /// cierto, y permite buscarlo en la web.
    static func empleadoTexto(_ row: PagoEmpleado) -> String {
        if let nombre = limpio(row.user?.nombre) { return nombre }
        guard let id = row.userId else { return "Empleado sin identificar" }
        return "Usuario #\(id)"
    }

    /// Qué se le pagó: concepto, si no la nota, y si no una frase honesta.
    static func conceptoTexto(_ row: PagoEmpleado) -> String {
        limpio(row.concepto) ?? limpio(row.note) ?? "Pago sin concepto"
    }

    /// Las horas que respaldan el pago: `"12 h 30 min"`. Un `0` (bono,
    /// anticipo) no se dice: se leería como «trabajó cero horas».
    static func horasTexto(_ row: PagoEmpleado) -> String? {
        guard let minutos = row.totalMinutes, minutos > 0 else { return nil }
        let horas = minutos / 60
        let resto = minutos % 60
        if horas == 0 { return "\(resto) min" }
        if resto == 0 { return "\(horas) h" }
        return "\(horas) h \(resto) min"
    }

    /// Cuántos comprobantes trae; `nil` si ninguno, para no escribir «0 comprobantes».
    static func comprobantesTexto(_ row: PagoEmpleado) -> String? {
        let total = (row.evidenceUrls ?? []).filter {
            !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }.count
        if total <= 0 { return nil }
        return total == 1 ? "1 comprobante" : "\(total) comprobantes"
    }

    /// La línea secundaria de la fila: periodo, horas y comprobantes.
    static func contextoTexto(_ row: PagoEmpleado) -> String? {
        let partes = [periodoTexto(row), horasTexto(row), comprobantesTexto(row)].compactMap { $0 }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    // MARK: - Filtros, búsqueda y orden

    /// Los filtros de arriba. Los de estado ilegible caen en `todos` y en
    /// ningún otro, que es justo lo que hace que se noten.
    enum Filtro: String, CaseIterable, Hashable {
        case todos, pagados, borradores, anulados

        var etiqueta: String {
            switch self {
            case .todos: return "Todos"
            case .pagados: return "Pagados"
            case .borradores: return "Borradores"
            case .anulados: return "Anulados"
            }
        }
    }

    static func cumple(_ row: PagoEmpleado, _ filtro: Filtro) -> Bool {
        switch filtro {
        case .todos: return true
        case .pagados: return estadoDe(row) == .pagado
        case .borradores: return estadoDe(row) == .borrador
        case .anulados: return estadoDe(row) == .anulado
        }
    }

    static func colorDeFiltro(_ filtro: Filtro) -> Color? {
        switch filtro {
        case .todos: return nil
        case .pagados: return verde
        case .borradores: return ambar
        case .anulados: return gris
        }
    }

    /// Lo que mira la búsqueda: empleado, concepto y nota (como la web) más el
    /// folio de la póliza: en una aclaración, el `PAG-…` es lo único que trae
    /// impreso quien viene a preguntar.
    static func coincide(_ row: PagoEmpleado, _ consulta: String) -> Bool {
        let q = consulta.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(with: espanol)
        if q.isEmpty { return true }
        return [row.user?.nombre, row.concepto, row.note, row.contabilidadRef]
            .compactMap { $0 }
            .contains { $0.lowercased(with: espanol).contains(q) }
    }

    /// El orden del servidor: el más reciente primero (`orderBy: { createdAt: 'desc' }`).
    static func ordenar(_ pagos: [PagoEmpleado]) -> [PagoEmpleado] {
        pagos.sorted { a, b in
            let fa = a.createdAt ?? ""
            let fb = b.createdAt ?? ""
            if fa != fb { return fa > fb }
            return (a.id ?? 0) > (b.id ?? 0)
        }
    }

    /// Filtro + búsqueda, ya ordenado: lo que se pinta.
    static func aplicar(_ pagos: [PagoEmpleado], filtro: Filtro, consulta: String) -> [PagoEmpleado] {
        ordenar(pagos.filter { cumple($0, filtro) && coincide($0, consulta) })
    }

    /// Cuántos hay en cada filtro, para el número de la pastilla.
    static func conteos(_ pagos: [PagoEmpleado]) -> [Filtro: Int] {
        var resultado: [Filtro: Int] = [:]
        for filtro in Filtro.allCases {
            resultado[filtro] = pagos.filter { cumple($0, filtro) }.count
        }
        return resultado
    }

    // MARK: - La tira de cifras

    /// Lo que suman los pagos, contando **solo los importes legibles**.
    struct Cifras: Equatable {
        let pagadoCentavos: Int
        let pagados: Int
        let borradorCentavos: Int
        let borradores: Int
        let empleados: Int
        let anulados: Int
        /// Filas con un importe que no se pudo leer; no suman en ninguna cifra.
        let sinImporte: Int
    }

    static func cifras(_ pagos: [PagoEmpleado]) -> Cifras {
        let pagados = pagos.filter { estadoDe($0) == .pagado }
        let borradores = pagos.filter { estadoDe($0) == .borrador }
        return Cifras(
            pagadoCentavos: pagados.reduce(0) { $0 + (centavosDe($1) ?? 0) },
            pagados: pagados.count,
            borradorCentavos: borradores.reduce(0) { $0 + (centavosDe($1) ?? 0) },
            borradores: borradores.count,
            // Por empleado, no por fila: es «a cuánta gente», no «cuántos pagos».
            empleados: Set(pagos.compactMap { $0.userId }).count,
            anulados: pagos.filter { estadoDe($0) == .anulado }.count,
            // Los anulados no cuentan: nadie va a sumarlos ni a cobrarlos.
            sinImporte: pagos.filter { estadoDe($0) != .anulado && !tieneImporteLegible($0) }.count
        )
    }

    static let metricaPagado = "pagado"
    static let metricaBorrador = "borrador"
    static let metricaEmpleados = "empleados"
    static let metricaAnulados = "anulados"

    /// La tira de cifras. **Sin una sola fila no se pinta nada** (cuatro celdas
    /// en `$0` encima de un vacío no ayudan); un periodo que de verdad cerró en
    /// cero sí se enseña. El color solo aparece donde pide acción.
    static func metricas(_ pagos: [PagoEmpleado]) -> [NxMetric] {
        if pagos.isEmpty { return [] }
        let c = cifras(pagos)
        let pistaPagado: String
        switch c.pagados {
        case 0: pistaPagado = "nada liquidado"
        case 1: pistaPagado = "1 pago"
        default: pistaPagado = "\(c.pagados) pagos"
        }
        let pistaBorrador: String
        switch c.borradores {
        case 0: pistaBorrador = "nada pendiente"
        case 1: pistaBorrador = "1 por autorizar"
        default: pistaBorrador = "\(c.borradores) por autorizar"
        }
        return [
            NxMetric(
                clave: metricaPagado,
                etiqueta: "Pagado",
                valor: Dinero.pesos(c.pagadoCentavos),
                pista: pistaPagado,
                color: c.pagados > 0 ? verde : nil
            ),
            NxMetric(
                clave: metricaBorrador,
                etiqueta: "En borrador",
                valor: Dinero.pesos(c.borradorCentavos),
                pista: pistaBorrador,
                // Solo se tiñe si hay algo esperando.
                color: c.borradores > 0 ? ambar : nil
            ),
            NxMetric(
                clave: metricaEmpleados,
                etiqueta: "Empleados",
                valor: "\(c.empleados)",
                pista: "con registro"
            ),
            NxMetric(
                clave: metricaAnulados,
                etiqueta: "Anulados",
                valor: "\(c.anulados)",
                pista: c.anulados == 0 ? "ninguno" : "no suman"
            ),
        ]
    }

    /// Qué filtro corresponde a cada celda de la tira, para que tocarla filtre.
    static func filtroDeMetrica(_ clave: String) -> Filtro? {
        switch clave {
        case metricaPagado: return .pagados
        case metricaBorrador: return .borradores
        case metricaAnulados: return .anulados
        default: return nil
        }
    }

    /// Y al revés: qué celda queda marcada con el filtro puesto.
    static func metricaDeFiltro(_ filtro: Filtro) -> String? {
        switch filtro {
        case .pagados: return metricaPagado
        case .borradores: return metricaBorrador
        case .anulados: return metricaAnulados
        case .todos: return nil
        }
    }

    /// El aviso de los importes ilegibles, en palabras. `nil` cuando todo se
    /// pudo leer, que es lo normal.
    static func avisoImportesTexto(_ pagos: [PagoEmpleado]) -> String? {
        let sinImporte = cifras(pagos).sinImporte
        if sinImporte <= 0 { return nil }
        if sinImporte == 1 {
            return "Un pago no trae un importe que se pueda leer: se enseña como «—» y no suma en las cifras de arriba."
        }
        return "\(sinImporte) pagos no traen un importe que se pueda leer: se enseñan como «—» y no suman en las cifras de arriba."
    }

    /// El título de la lista: qué se está viendo ahora mismo.
    static func tituloLista(_ filtro: Filtro) -> String {
        filtro == .todos ? "Todos los pagos" : filtro.etiqueta
    }

    // MARK: - Constantes

    /// Lo que se escribe cuando no hay cifra. Nunca un cero.
    static let sinDato = "—"

    /// Qué NO hace esta pantalla. Se dice al pie, sin botón que eche al navegador.
    static let limite =
        "Consulta. Registrar un pago, autorizarlo, marcarlo pagado o anularlo se hacen desde la computadora."

    // MARK: - Utilidades

    private static let espanol = Locale(identifier: "es_MX")

    /// Abreviaturas fijas, las mismas que `NxFormat.patron` de Android.
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
}
