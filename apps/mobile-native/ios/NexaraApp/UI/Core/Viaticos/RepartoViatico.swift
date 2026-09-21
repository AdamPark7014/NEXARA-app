import Foundation

/// El cuadre del reparto de un viático, en centavos enteros.
///
/// Espejo exacto de `apps/api/src/viaticos/viatico-reparto.ts` y de
/// `RepartoViatico.kt` en Android. La regla que lo sostiene todo: **la suma de
/// las partes es exactamente el total del viático**. Ni más (el costo se duplica
/// en el P&L por proyecto) ni menos (se pierde).
///
/// Se cuenta en centavos enteros —nunca en `Double`— por el mismo motivo que el
/// servidor: en coma flotante `0.1 + 0.2` no es `0.3`, y un reparto legítimo de
/// $0.10 y $0.20 sobre un viático de $0.30 sería rechazado sin que nadie
/// entienda por qué. El teclado entrega texto, el texto se vuelve centavos con
/// aritmética entera, y solo al armar la petición se divide entre 100.
///
/// Sin SwiftUI ni red a propósito: la regla se lee y se comprueba sola.

/// Una parte del reparto: qué actividad carga cuánto.
struct ParteReparto: Hashable, Identifiable {
    let actividadId: Int
    var centavos: Int
    var nota: String?

    var id: Int { actividadId }

    init(actividadId: Int, centavos: Int, nota: String? = nil) {
        self.actividadId = actividadId
        self.centavos = centavos
        self.nota = nota
    }
}

/// En qué estado está el reparto que se está capturando.
enum CuadreReparto: Equatable {
    /// Sin partes: el viático sigue siendo de una sola actividad. Es válido.
    case sinReparto
    case cuadra
    /// Faltan estos centavos por repartir (siempre positivo).
    case falta(Int)
    /// Sobran estos centavos (siempre positivo).
    case sobra(Int)
    case duplicada(actividadId: Int)
    case parteSinImporte(actividadId: Int)
    /// El viático no trae monto válido: no hay nada que repartir.
    case sinTotal

    var puedeGuardarse: Bool {
        switch self {
        case .cuadra, .sinReparto: return true
        default: return false
        }
    }
}

enum RepartoViatico {

    /// Tope del servidor (`@ArrayMaxSize(50)` en `SetViaticoRepartoDto`).
    static let maxPartes = 50

    /// Revisa el reparto contra el total, en el mismo orden que el servidor,
    /// para que la app nunca acepte algo que allá vaya a rebotar.
    static func revisar(_ partes: [ParteReparto], totalCentavos: Int) -> CuadreReparto {
        guard !partes.isEmpty else { return .sinReparto }
        guard totalCentavos > 0 else { return .sinTotal }

        var vistas = Set<Int>()
        for parte in partes {
            if vistas.contains(parte.actividadId) {
                return .duplicada(actividadId: parte.actividadId)
            }
            vistas.insert(parte.actividadId)
            if parte.centavos <= 0 {
                return .parteSinImporte(actividadId: parte.actividadId)
            }
        }

        let diferencia = totalCentavos - partes.reduce(0) { $0 + $1.centavos }
        if diferencia == 0 { return .cuadra }
        return diferencia > 0 ? .falta(diferencia) : .sobra(-diferencia)
    }

    /// El aviso que va debajo de los campos mientras se captura. `nil` cuando no
    /// hay nada que corregir.
    static func mensaje(_ cuadre: CuadreReparto) -> String? {
        switch cuadre {
        case .cuadra, .sinReparto:
            return nil
        case .sinTotal:
            return "Este viático no tiene monto, así que no hay nada que repartir."
        case .falta(let centavos):
            return "Faltan \(Dinero.pesos(centavos)) por repartir."
        case .sobra(let centavos):
            return "Sobran \(Dinero.pesos(centavos)): baja alguna parte."
        case .duplicada:
            return "Esa actividad ya está en el reparto. Junta las dos partes en una sola."
        case .parteSinImporte:
            return "Hay una actividad sin importe. Captura cuánto carga o quítala del reparto."
        }
    }

    /// Reparte `totalCentavos` entre `cuantas` partes iguales.
    ///
    /// Los centavos que no caen parejos se suman uno a uno a las primeras
    /// partes, así que el resultado **siempre** suma el total exacto: 10.00
    /// entre 3 da 3.34 + 3.33 + 3.33, no tres veces 3.33 con un centavo perdido.
    static func repartirEnPartesIguales(totalCentavos: Int, cuantas: Int) -> [Int] {
        guard cuantas > 0, totalCentavos > 0 else { return [] }
        let base = totalCentavos / cuantas
        let sobrantes = totalCentavos % cuantas
        return (0..<cuantas).map { base + ($0 < sobrantes ? 1 : 0) }
    }

    /// «Repartir el resto»: acomoda la diferencia sin tocar lo que la persona ya
    /// escribió a propósito.
    ///
    /// - Si faltan centavos, se suman a las partes vacías; si están todas
    ///   capturadas, se reparte entre todas.
    /// - Si sobran, se bajan de las partes capturadas de mayor a menor, sin
    ///   dejar ninguna en cero: bajar a cero sería borrar una actividad a
    ///   escondidas.
    static func cuadrarResto(_ partes: [ParteReparto], totalCentavos: Int) -> [ParteReparto] {
        guard !partes.isEmpty, totalCentavos > 0 else { return partes }
        let diferencia = totalCentavos - partes.reduce(0) { $0 + $1.centavos }
        if diferencia == 0 { return partes }

        var montos = partes.map(\.centavos)

        if diferencia > 0 {
            let vacias = montos.indices.filter { montos[$0] <= 0 }
            let destinos = vacias.isEmpty ? Array(montos.indices) : vacias
            let trozos = repartirEnPartesIguales(totalCentavos: diferencia, cuantas: destinos.count)
            for (i, idx) in destinos.enumerated() {
                montos[idx] += trozos[i]
            }
        } else {
            // De mayor a menor: quien más carga es quien mejor absorbe el ajuste.
            var porBajar = -diferencia
            for idx in montos.indices.sorted(by: { montos[$0] > montos[$1] }) {
                if porBajar <= 0 { break }
                // Nunca a cero: una parte en cero es una actividad que dejó de
                // cargar sin que nadie lo decidiera.
                let disponible = montos[idx] - 1
                if disponible <= 0 { continue }
                let baja = min(disponible, porBajar)
                montos[idx] -= baja
                porBajar -= baja
            }
        }

        return partes.enumerated().map { i, parte in
            var copia = parte
            copia.centavos = montos[i]
            return copia
        }
    }
}

/// Importes como se leen y se escriben en el teléfono.
///
/// Todo entra y sale en centavos enteros. `Double` solo aparece en el último
/// paso, al serializar la petición: el servidor recibe el importe con dos
/// decimales y vuelve a redondearlo a centavos, así que el viaje es exacto.
enum Dinero {

    /// Lo máximo que se admite teclear: $99,999,999.99.
    static let maxCentavos = 9_999_999_999

    /// Texto tecleado → centavos. `nil` si no es un importe válido.
    ///
    /// Admite lo que la gente escribe de verdad: `1,234.56`, `$1234.5`, `1234`,
    /// y la coma decimal del teclado latino (`1234,56`) cuando no hay punto.
    /// Rechaza más de dos decimales: el servidor tampoco los acepta
    /// (`@IsNumber({ maxDecimalPlaces: 2 })`).
    static func parsearCentavos(_ texto: String) -> Int? {
        var limpio = texto.trimmingCharacters(in: .whitespaces)
        if limpio.hasPrefix("$") { limpio.removeFirst() }
        limpio = limpio.trimmingCharacters(in: .whitespaces)
        guard !limpio.isEmpty else { return nil }

        // Coma decimal solo si no hay punto: en "1,234.56" la coma es de millares.
        limpio = limpio.contains(".")
            ? limpio.replacingOccurrences(of: ",", with: "")
            : limpio.replacingOccurrences(of: ",", with: ".")

        let partes = limpio.split(separator: ".", omittingEmptySubsequences: false)
        guard partes.count <= 2 else { return nil }
        let enterosTexto = String(partes.first ?? "")
        let decimalesTexto = partes.count == 2 ? String(partes[1]) : ""

        guard enterosTexto.allSatisfy(\.isNumber), decimalesTexto.allSatisfy(\.isNumber) else { return nil }
        guard decimalesTexto.count <= 2 else { return nil }

        let pesos = enterosTexto.isEmpty ? 0 : Int(enterosTexto)
        guard let pesos else { return nil }
        let decimalesRellenos = decimalesTexto.padding(toLength: 2, withPad: "0", startingAt: 0)
        guard let centavos = Int(decimalesRellenos) else { return nil }
        guard pesos <= maxCentavos / 100 else { return nil }
        return pesos * 100 + centavos
    }

    /// `123456` → `"1,234.56"`. Sin símbolo: va dentro de un campo de importe.
    static func formatear(_ centavos: Int) -> String {
        let signo = centavos < 0 ? "-" : ""
        let abs = Swift.abs(centavos)
        let enteros = String(abs / 100)
        let decimales = String(format: "%02d", abs % 100)
        return "\(signo)\(agruparMillares(enteros)).\(decimales)"
    }

    /// `123456` → `"$1,234.56"`. Para leer, no para teclear.
    static func pesos(_ centavos: Int) -> String { "$" + formatear(centavos) }

    /// Importe del servidor → centavos, redondeando igual que `aCentavos` del
    /// servidor (`Math.round(n * 100)`), para que los dos lados cuenten lo mismo.
    static func deApi(_ monto: Double?) -> Int {
        guard let monto, monto.isFinite else { return 0 }
        return Int((monto * 100).rounded())
    }

    /// Centavos → el número que viaja en la petición. El error de coma flotante
    /// queda muy por debajo de medio centavo, así que el `Math.round(n * 100)`
    /// del servidor recupera exactamente estos centavos.
    static func aApi(_ centavos: Int) -> Double { Double(centavos) / 100.0 }

    /// Lo que viaja en un campo de texto del multipart: dos decimales, sin comas.
    static func textoApi(_ centavos: Int) -> String {
        formatear(centavos).replacingOccurrences(of: ",", with: "")
    }

    /// Solo dígitos y a lo sumo un punto: lo que el campo de importe deja escribir.
    static func sanitizarEntrada(_ texto: String) -> String {
        var resultado = ""
        var puntoUsado = false
        for c in texto {
            if c.isNumber {
                resultado.append(c)
            } else if (c == "." || c == ","), !puntoUsado, !resultado.isEmpty {
                puntoUsado = true
                resultado.append(".")
            }
        }
        guard let punto = resultado.firstIndex(of: ".") else {
            return String(resultado.prefix(maxEnteros))
        }
        let enteros = String(resultado[resultado.startIndex..<punto].prefix(maxEnteros))
        let decimales = String(resultado[resultado.index(after: punto)...].prefix(2))
        return "\(enteros).\(decimales)"
    }

    /// `"1234567"` → `"1,234,567"`.
    static func agruparMillares(_ enteros: String) -> String {
        guard enteros.count > 3 else { return enteros }
        var resultado = ""
        let total = enteros.count
        for (i, c) in enteros.enumerated() {
            if i > 0, (total - i) % 3 == 0 { resultado.append(",") }
            resultado.append(c)
        }
        return resultado
    }

    /// Cómo se ve el texto crudo mientras se teclea: millares agrupados y el
    /// punto conservado aunque todavía no haya decimales («1,234.»).
    static func formatearEntrada(_ crudo: String) -> String {
        guard !crudo.isEmpty else { return "" }
        guard let punto = crudo.firstIndex(of: ".") else {
            return agruparMillares(crudo)
        }
        let enteros = String(crudo[crudo.startIndex..<punto])
        let decimales = String(crudo[crudo.index(after: punto)...])
        return "\(agruparMillares(enteros)).\(decimales)"
    }

    /// Dígitos enteros que caben antes del punto (99,999,999).
    private static let maxEnteros = 8
}
