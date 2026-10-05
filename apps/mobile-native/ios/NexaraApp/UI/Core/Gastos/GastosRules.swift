import SwiftUI

/// Gastos administrativos en el teléfono: qué se enseña de cada uno, en qué
/// orden y qué se puede hacer con él. Traducción línea a línea de
/// `GastosRules.kt` de Android (probado en `GastosRulesTest.kt`).
///
/// Cada gasto es una fila densa que contesta **qué se compró y cuánto**, **en
/// qué va** y **si falta el comprobante**, que es lo único que bloquea el
/// cierre contable.
///
/// Los importes pasan por `centavos`, que se traga número o texto y devuelve
/// `nil` si no entiende — nunca un cero fingido.
enum GastosRules {

    // MARK: Estado

    /// Los cuatro estados de `estatusPago` (`expenses.service.ts`). Pendiente →
    /// Aprobado → Pagado; Rechazado es la salida.
    enum Estado: CaseIterable {
        case pendiente, aprobado, pagado, rechazado, desconocido

        var clave: String {
            switch self {
            case .pendiente: return "Pendiente"
            case .aprobado: return "Aprobado"
            case .pagado: return "Pagado"
            case .rechazado: return "Rechazado"
            case .desconocido: return ""
            }
        }

        var etiqueta: String {
            switch self {
            case .pendiente: return "Por autorizar"
            case .aprobado: return "Autorizado"
            case .pagado: return "Pagado"
            case .rechazado: return "Rechazado"
            case .desconocido: return "Sin estado"
            }
        }
    }

    /// Estado a partir de lo que mande el servidor, con las equivalencias de
    /// `normalizeStatus` (mayúsculas viejas y sinónimos en inglés).
    static func estado(_ valor: String?) -> Estado {
        let crudo = (valor ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if crudo.isEmpty { return .desconocido }
        switch crudo.lowercased(with: espanol) {
        case "pagado", "paid", "aprobado_pagado": return .pagado
        case "aprobado", "approved", "autorizado": return .aprobado
        case "rechazado", "rejected", "cancelado": return .rechazado
        case "pendiente", "borrador", "pendiente_aprobacion", "draft": return .pendiente
        default: return .desconocido
        }
    }

    static func estadoDe(_ gasto: Gasto) -> Estado { estado(gasto.estatusPago) }

    static func etiquetaEstado(_ gasto: Gasto) -> String { estadoDe(gasto).etiqueta }

    /// Color del punto de estado: solo cuando el renglón pide acción o algo
    /// salió mal. «Autorizado» va en gris: es el flujo normal.
    static func colorEstado(_ estado: Estado) -> Color? {
        switch estado {
        case .pendiente: return NxColors.naranja
        case .pagado: return NxColors.verde
        case .rechazado: return NxColors.rojo
        case .aprobado, .desconocido: return nil
        }
    }

    /// Un gasto sin su ticket. Los rechazados no cuentan: ya no van a ninguna póliza.
    static func sinComprobante(_ gasto: Gasto) -> Bool {
        let url = (gasto.ticketEvidenciaUrl ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return url.isEmpty && estadoDe(gasto) != .rechazado
    }

    /// Solo un pendiente se autoriza o se rechaza (`approveOrReject` lo exige).
    static func puedeAutorizar(_ gasto: Gasto) -> Bool { estadoDe(gasto) == .pendiente }

    /// Solo un autorizado se marca pagado (`markPagado` lo exige).
    static func puedePagar(_ gasto: Gasto) -> Bool { estadoDe(gasto) == .aprobado }

    // MARK: Filtros

    /// Los filtros, por lo que hay que hacer con cada grupo. `rawValue` es la
    /// clave de la celda de la tira, para que tocar la cifra filtre sin traducir.
    enum Filtro: String, CaseIterable, Identifiable {
        case todos = "todos"
        case porAutorizar = "por_autorizar"
        case porPagar = "por_pagar"
        case sinComprobante = "sin_comprobante"
        case pagados = "pagados"
        case rechazados = "rechazados"

        var id: String { rawValue }
        var clave: String { rawValue }

        var etiqueta: String {
            switch self {
            case .todos: return "Todos"
            case .porAutorizar: return "Por autorizar"
            case .porPagar: return "Por pagar"
            case .sinComprobante: return "Sin comprobante"
            case .pagados: return "Pagados"
            case .rechazados: return "Rechazados"
            }
        }

        static func porClave(_ clave: String?) -> Filtro? {
            guard let clave else { return nil }
            let buscada = clave.trimmingCharacters(in: .whitespaces).lowercased(with: GastosRules.espanol)
            return Filtro.allCases.first { $0.clave == buscada }
        }
    }

    static func cumple(_ gasto: Gasto, _ filtro: Filtro) -> Bool {
        switch filtro {
        case .todos: return true
        case .porAutorizar: return estadoDe(gasto) == .pendiente
        case .porPagar: return estadoDe(gasto) == .aprobado
        case .sinComprobante: return sinComprobante(gasto)
        case .pagados: return estadoDe(gasto) == .pagado
        case .rechazados: return estadoDe(gasto) == .rechazado
        }
    }

    /// Lo que mira la búsqueda: concepto, quién y folio (como la web) más la categoría.
    private static func camposBuscables(_ gasto: Gasto) -> [String] {
        [
            gasto.concepto,
            gasto.razonGasto,
            gasto.categoria,
            gasto.usuario?.nombre,
            gasto.createdBy?.nombre,
            gasto.contabilidadRef,
            gasto.actividad?.anNumber,
        ].compactMap { $0 }
    }

    static func coincide(_ gasto: Gasto, _ consulta: String) -> Bool {
        let q = consulta.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(with: espanol)
        if q.isEmpty { return true }
        return camposBuscables(gasto).contains { $0.lowercased(with: espanol).contains(q) }
    }

    /// El orden del servidor: el más reciente primero, por `fechaSolicitud`
    /// (la clave de `findAllAdministrative`), y sin fecha, por id descendente.
    /// Las fechas ISO se comparan como texto, que para ese formato ordena igual.
    static func ordenar(_ gastos: [Gasto]) -> [Gasto] {
        gastos.sorted { a, b in
            let fa = a.fechaSolicitud ?? a.fechaGasto ?? ""
            let fb = b.fechaSolicitud ?? b.fechaGasto ?? ""
            if fa != fb { return fa > fb }
            return (a.idServidor ?? 0) > (b.idServidor ?? 0)
        }
    }

    /// Filtro + búsqueda, ya ordenado: lo que se pinta.
    static func aplicar(_ gastos: [Gasto], filtro: Filtro, consulta: String) -> [Gasto] {
        ordenar(gastos.filter { cumple($0, filtro) && coincide($0, consulta) })
    }

    /// Cuántos hay en cada filtro, para el número de la pastilla.
    static func conteos(_ gastos: [Gasto]) -> [Filtro: Int] {
        var resultado: [Filtro: Int] = [:]
        for filtro in Filtro.allCases {
            resultado[filtro] = gastos.filter { cumple($0, filtro) }.count
        }
        return resultado
    }

    // MARK: Dinero

    /// Importe del API → centavos, con el `HALF_UP` del servidor
    /// (`Math.round(n * 100)`). `nil` si no es un número: nunca cero fingido.
    static func centavos(_ valor: String?) -> Int? {
        DineroApi.centavos(valor)
    }

    /// `"$1,234.56"`, o `"—"` si no hay cifra legible.
    static func pesos(_ valor: String?) -> String {
        centavos(valor).map { Dinero.pesos($0) } ?? "—"
    }

    static func montoTexto(_ gasto: Gasto) -> String { pesos(gasto.montoSolicitado) }

    // MARK: Tira de cifras

    /// Las cuatro cifras de arriba, en el orden de la web: por autorizar, por
    /// pagar, pagado y qué bloquea el cierre. Sobre la lista completa (la tira es
    /// el mando del filtro). Sin filas no se dibuja; los importes ilegibles no suman.
    static func cifras(_ gastos: [Gasto]) -> [NxMetric] {
        if gastos.isEmpty { return [] }

        func suma(_ filas: [Gasto]) -> Int { filas.reduce(0) { $0 + (centavos($1.montoSolicitado) ?? 0) } }
        let porAutorizar = gastos.filter { estadoDe($0) == .pendiente }
        let porPagar = gastos.filter { estadoDe($0) == .aprobado }
        let pagados = gastos.filter { estadoDe($0) == .pagado }
        let sinTicket = gastos.filter { sinComprobante($0) }

        return [
            NxMetric(
                clave: Filtro.porAutorizar.clave,
                etiqueta: "Por autorizar",
                valor: Dinero.pesos(suma(porAutorizar)),
                pista: plural(porAutorizar.count, "gasto esperando", "gastos esperando"),
                color: porAutorizar.isEmpty ? nil : NxColors.naranja
            ),
            NxMetric(
                clave: Filtro.porPagar.clave,
                etiqueta: "Por pagar",
                valor: Dinero.pesos(suma(porPagar)),
                pista: plural(porPagar.count, "autorizado sin pagar", "autorizados sin pagar")
            ),
            NxMetric(
                clave: Filtro.pagados.clave,
                etiqueta: "Pagado",
                valor: Dinero.pesos(suma(pagados)),
                pista: plural(pagados.count, "gasto liquidado", "gastos liquidados")
            ),
            NxMetric(
                clave: Filtro.sinComprobante.clave,
                etiqueta: "Sin comprobante",
                // Un conteo, no dinero: lo que bloquea el cierre son los papeles.
                valor: String(sinTicket.count),
                pista: sinTicket.isEmpty ? "todo comprobado" : "bloquean el cierre",
                color: sinTicket.isEmpty ? nil : NxColors.rojo
            ),
        ]
    }

    // MARK: Fechas

    /// Un día del calendario, sin hora ni huso.
    struct Dia: Hashable, Comparable {
        let anio: Int
        let mes: Int
        let dia: Int

        static func < (a: Dia, b: Dia) -> Bool {
            (a.anio, a.mes, a.dia) < (b.anio, b.mes, b.dia)
        }

        /// `YYYY-MM-DD`: lo que espera el servidor.
        var valorApi: String { String(format: "%04d-%02d-%02d", anio, mes, dia) }
    }

    /// Fecha del API como **el día, no el instante**: se cortan los diez primeros
    /// caracteres. `fechaGasto` se guarda a mediodía, y convertir
    /// `2026-09-18T00:00:00.000Z` a hora de México lo retrasaría al 17.
    static func fecha(_ iso: String?) -> Dia? {
        guard let texto = iso?.trimmingCharacters(in: .whitespacesAndNewlines), texto.count >= 10 else { return nil }
        let corte = Array(texto.prefix(10))
        guard corte[4] == "-", corte[7] == "-",
              let anio = Int(String(corte[0..<4])),
              let mes = Int(String(corte[5..<7])),
              let dia = Int(String(corte[8..<10])),
              (1...12).contains(mes), (1...31).contains(dia) else { return nil }
        return Dia(anio: anio, mes: mes, dia: dia)
    }

    /// El día del gasto: el que se capturó, y si falta, el de la solicitud.
    static func fechaDelGasto(_ gasto: Gasto) -> Dia? {
        fecha(gasto.fechaGasto) ?? fecha(gasto.fechaSolicitud)
    }

    /// «18 sept» · `nil` si no se puede leer.
    static func fechaCorta(_ iso: String?) -> String? { fecha(iso).map(corta) }

    /// «18 sept 2026» — para la ficha, donde el año sí importa.
    static func fechaLarga(_ iso: String?) -> String? { fecha(iso).map { "\(corta($0)) \($0.anio)" } }

    /// La fecha de la fila, ya corta. `"—"` cuando no hay ninguna legible.
    static func fechaTexto(_ gasto: Gasto) -> String { fechaDelGasto(gasto).map(corta) ?? "—" }

    private static func corta(_ dia: Dia) -> String {
        "\(dia.dia) \(mesesCortos[max(0, min(11, dia.mes - 1))])"
    }

    /// Las abreviaturas de Android (`NxFormat.patron`): «sept», sin punto.
    static let mesesCortos = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]

    /// Un día del alta: la etiqueta que se toca y el `YYYY-MM-DD` que se manda.
    struct OpcionFecha: Hashable, Identifiable {
        let dia: Dia
        let etiqueta: String
        var valorApi: String { dia.valorApi }
        var id: String { valorApi }
    }

    /// Cuántos días atrás ofrece el alta, hoy incluido.
    static let diasDeAlta = 4

    /// Los días que ofrece el alta, del más reciente al más viejo: «Hoy», «Ayer»
    /// y dos fechas. «Hoy» es el de la Ciudad de México, la zona de la operación.
    static func opcionesDeFecha(hoy: Date = Date()) -> [OpcionFecha] {
        (0..<diasDeAlta).compactMap { atras -> OpcionFecha? in
            guard let fecha = calendarioMx.date(byAdding: .day, value: -atras, to: hoy) else { return nil }
            let c = calendarioMx.dateComponents([.year, .month, .day], from: fecha)
            guard let anio = c.year, let mes = c.month, let dia = c.day else { return nil }
            let d = Dia(anio: anio, mes: mes, dia: dia)
            let etiqueta: String
            switch atras {
            case 0: etiqueta = "Hoy"
            case 1: etiqueta = "Ayer"
            default: etiqueta = corta(d)
            }
            return OpcionFecha(dia: d, etiqueta: etiqueta)
        }
    }

    static let calendarioMx: Calendar = {
        var calendario = Calendar(identifier: .gregorian)
        calendario.timeZone = TimeZone(identifier: "America/Mexico_City") ?? .current
        calendario.locale = Locale(identifier: "es_MX")
        return calendario
    }()

    // MARK: Textos de la fila

    /// Qué se compró: `concepto` y, si falta, el texto libre heredado (`razonGasto`).
    static func conceptoTexto(_ gasto: Gasto) -> String {
        noVacio(gasto.concepto) ?? noVacio(gasto.razonGasto) ?? "Gasto sin concepto"
    }

    /// De quién es el gasto; si no se sabe, quién lo capturó.
    static func solicitanteTexto(_ gasto: Gasto) -> String? {
        noVacio(gasto.usuario?.nombre) ?? noVacio(gasto.createdBy?.nombre)
    }

    static func categoriaTexto(_ gasto: Gasto) -> String {
        noVacio(gasto.categoria) ?? "Sin categoría"
    }

    /// Categoría, quién y si se repite cada mes, en una línea de 11,5.
    static func contextoTexto(_ gasto: Gasto) -> String {
        [
            categoriaTexto(gasto),
            solicitanteTexto(gasto),
            gasto.esRecurrente == true ? "Recurrente" : nil,
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }

    /// Folio de la póliza. `nil` mientras el API no lo haya escrito.
    static func referenciaTexto(_ gasto: Gasto) -> String? {
        noVacio(gasto.contabilidadRef).map { "Ref. \($0)" }
    }

    // MARK: Alta

    /// Las categorías que acepta el servidor (`EXPENSE_CATEGORIES`), en orden:
    /// `normalizeCategory` convierte en «Otro» lo que no reconozca, sin avisar.
    static let categorias = [
        "Renta", "Servicios", "Suscripciones", "Material", "Publicidad",
        "Equipo", "Nómina", "Impuestos", "Otro",
    ]

    /// Con la que abre el alta: la más frecuente en la operación.
    static let categoriaPorOmision = "Servicios"

    /// Qué le falta al alta para poder mandarse, en el orden del formulario.
    /// `nil` = completo. Son las condiciones de `createAdministrative`.
    static func faltaParaRegistrar(concepto: String, importe: String, tieneTicket: Bool) -> String? {
        let montoCentavos = Dinero.parsearCentavos(importe)
        if importe.trimmingCharacters(in: .whitespaces).isEmpty { return "Captura cuánto se gastó" }
        guard let montoCentavos else { return "Ese importe no se entiende" }
        if montoCentavos <= 0 { return "El importe tiene que ser mayor que cero" }
        if concepto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Di en qué se gastó" }
        if !tieneTicket { return "Falta la foto del comprobante" }
        return nil
    }

    /// Qué no hace esta pantalla, al pie y sin botón que eche al navegador.
    static let limite =
        "Registrar, autorizar y pagar. Corregir un gasto ya capturado, borrarlo y " +
        "sacar el reporte por rango de fechas se hacen desde la computadora."

    // MARK: Utilidades

    static let espanol = Locale(identifier: "es_MX")

    private static func plural(_ n: Int, _ singular: String, _ plural: String) -> String {
        "\(n) \(n == 1 ? singular : plural)"
    }

    private static func noVacio(_ texto: String?) -> String? {
        guard let limpio = texto?.trimmingCharacters(in: .whitespacesAndNewlines), !limpio.isEmpty else { return nil }
        return limpio
    }
}

/// Importes del API (texto o número de un `Decimal` de Prisma) → centavos, con
/// el mismo redondeo `HALF_UP` que `BigDecimal` en Android y `Math.round(n * 100)`
/// en el servidor. Compartido por Gastos y Aprobaciones.
enum DineroApi {
    private static let patron = "^[+-]?([0-9]+\\.?[0-9]*|\\.[0-9]+)([eE][+-]?[0-9]+)?$"

    static func centavos(_ valor: String?) -> Int? {
        guard let texto = valor?.trimmingCharacters(in: .whitespacesAndNewlines),
              !texto.isEmpty, texto != "null",
              texto.range(of: patron, options: .regularExpression) != nil,
              let decimal = Decimal(string: texto, locale: Locale(identifier: "en_US_POSIX")) else {
            return nil
        }
        var porCien: Decimal = decimal * Decimal(100)
        var redondeado = Decimal()
        // `.plain` redondea la mitad alejándose del cero: el `HALF_UP` de Java.
        NSDecimalRound(&redondeado, &porCien, 0, .plain)
        let numero = NSDecimalNumber(decimal: redondeado)
        guard numero.doubleValue.magnitude < 9.0e15 else { return nil }
        return numero.intValue
    }
}
