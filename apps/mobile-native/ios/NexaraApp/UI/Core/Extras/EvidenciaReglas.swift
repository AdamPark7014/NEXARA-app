import Foundation

/// Evidencia de préstamos y salidas (21-11-2026). Reglas puras, espejo de
/// `EvidenciaPrestamoRules.kt` y `EvidenciaSalidaRules.kt` en Android y de lo que aplica el
/// servidor (`evidencia-prestamo.ts`, `evidencia-salida.ts`): aquí se validan antes para decir
/// qué falta sin gastar un viaje con mala señal; quien decide al final es la API.

/// Cómo volvió la herramienta. El valor crudo es lo que viaja en `condicion`.
enum CondicionDeDevolucion: String, CaseIterable, Identifiable {
    case bien = "BIEN"
    case desgaste = "DESGASTE"
    case danada = "DANADA"
    case incompleta = "INCOMPLETA"
    case extraviada = "EXTRAVIADA"

    var id: String { rawValue }

    var etiqueta: String {
        switch self {
        case .bien: return "Bien"
        case .desgaste: return "Con desgaste"
        case .danada: return "Dañada"
        case .incompleta: return "Incompleta"
        case .extraviada: return "Extraviada"
        }
    }

    var ayuda: String {
        switch self {
        case .bien: return "Vuelve como salió."
        case .desgaste: return "Uso normal: sigue sirviendo."
        case .danada: return "No sirve así: pasa a reparación."
        case .incompleta: return "Le falta una pieza o accesorio: pasa a revisión."
        case .extraviada: return "No regresó: se da de baja del inventario."
        }
    }

    /// Hay que contar qué le pasó.
    var pideExplicacion: Bool { self == .danada || self == .incompleta || self == .extraviada }

    /// Hay algo que fotografiar. De lo que no regresó no hay foto.
    var pideFoto: Bool { self != .extraviada }

    static func deApi(_ valor: String?) -> CondicionDeDevolucion? {
        guard let limpio = valor?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() else { return nil }
        return CondicionDeDevolucion(rawValue: limpio)
    }
}

enum EvidenciaPrestamoReglas {

    /// Tope de fotos por entrega o por entrada (el del `FilesInterceptor`).
    static let maxFotos = 6

    /// Qué le falta a la entrega; `nil` si ya se puede registrar.
    static func faltaParaEntregar(pideCodigo: Bool, codigo: String, fotos: Int) -> String? {
        if pideCodigo, codigo.nilSiVacio == nil { return "Teclea el código que enseña quien la recoge." }
        if fotos <= 0 { return "Toma al menos una foto de cómo sale la herramienta." }
        return nil
    }

    /// Qué le falta a la entrada; `nil` si ya se puede registrar.
    static func faltaParaRecibir(condicion: CondicionDeDevolucion?, descripcion: String, fotos: Int) -> String? {
        guard let condicion else { return "Elige cómo volvió." }
        if condicion.pideExplicacion, descripcion.nilSiVacio == nil {
            switch condicion {
            case .incompleta: return "Escribe qué le falta."
            case .extraviada: return "Escribe qué pasó con la herramienta."
            default: return "Describe el daño."
            }
        }
        if condicion.pideFoto, fotos <= 0 { return "Toma al menos una foto de cómo volvió." }
        return nil
    }

    /// La pregunta del campo de texto según la condición.
    static func preguntaDescripcion(_ condicion: CondicionDeDevolucion?) -> String {
        switch condicion {
        case .danada: return "¿Qué daño trae?"
        case .incompleta: return "¿Qué le falta?"
        case .extraviada: return "¿Qué pasó?"
        default: return "Observaciones (opcional)"
        }
    }

    /// El aviso cuando la entrada quedó registrada.
    static func avisoEntrada(_ condicion: CondicionDeDevolucion) -> String {
        switch condicion {
        case .bien, .desgaste: return "Entrada registrada."
        case .danada: return "Entrada registrada con daño: queda en reparación."
        case .incompleta: return "Entrada registrada incompleta: queda en revisión."
        case .extraviada: return "Registrada como extraviada: se dio de baja del inventario."
        }
    }

    /// Las direcciones de las fotos que sí traen una.
    static func urls(_ fotos: [FotoDeEvidencia]?) -> [String] {
        (fotos ?? []).compactMap { $0.url?.nilSiVacio }
    }

    /// «Cómo volvió» de un préstamo ya recibido; `nil` en los de antes de la evidencia.
    static func etiquetaCondicion(_ prestamo: PrestamoHerramienta) -> String? {
        CondicionDeDevolucion.deApi(prestamo.returnCondition)?.etiqueta
    }

    /// Lo que le falta de evidencia a un préstamo, para decirlo en su tarjeta: una herramienta
    /// que ya salió sin foto de salida, o que ya volvió sin foto de entrada (lo registró una
    /// versión vieja de la app). `nil` si no falta nada o todavía no sale.
    static func faltaEvidencia(_ prestamo: PrestamoHerramienta) -> String? {
        let estado = prestamo.status ?? ""
        let salio = ["IN_USE", "RETURNED", "DAMAGED"].contains(estado)
        let volvio = ["RETURNED", "DAMAGED"].contains(estado)
        let sinSalida = salio && urls(prestamo.deliveryPhotos).isEmpty
        let sinEntrada = volvio
            && CondicionDeDevolucion.deApi(prestamo.returnCondition) != .extraviada
            && urls(prestamo.returnPhotos).isEmpty
        if sinSalida && sinEntrada { return "Sin fotos de salida ni de entrada" }
        if sinSalida { return "Salió sin foto" }
        if sinEntrada { return "Volvió sin foto" }
        return nil
    }

    /// «Entregó Iván · Recibió Christian», con lo que se sepa. Vacío si no se sabe nada.
    static func quienesFirmaron(_ prestamo: PrestamoHerramienta) -> String {
        [
            prestamo.deliveredBy?.nombre?.nilSiVacio.map { "Entregó \($0)" },
            prestamo.receivedBy?.nombre?.nilSiVacio.map { "Recibió \($0)" },
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }
}

enum EvidenciaSalidaReglas {

    /// Fotos por subida (el tope del `FilesInterceptor` de `stock/movements/:id/evidencia`).
    static let maxFotos = 8

    /// Largo máximo de un número de serie (el del DTO del servidor).
    private static let maxLargoSerie = 80

    /// Números de serie como se teclean o se pegan: uno por renglón (también coma o punto y
    /// coma), en mayúsculas y sin repetir.
    static func series(_ texto: String) -> [String] {
        var vistas = Set<String>()
        var salida: [String] = []
        for cruda in texto.components(separatedBy: CharacterSet(charactersIn: "\n\r,;")) {
            let serie = cruda
                .components(separatedBy: .whitespaces)
                .filter { !$0.isEmpty }
                .joined(separator: " ")
                .uppercased()
            guard !serie.isEmpty, serie.count <= maxLargoSerie, vistas.insert(serie).inserted else { continue }
            salida.append(serie)
        }
        return salida
    }

    /// Piezas que de verdad se mueven: si se leyó una caja, la cantidad cuenta cajas.
    static func piezas(cantidad: Double, piezasPorCaja: Double?) -> Double {
        if let porCaja = piezasPorCaja, porCaja > 0 { return cantidad * porCaja }
        return cantidad
    }

    /// No puede haber más series que piezas; `nil` si cuadra.
    static func errorSeries(series: Int, piezas: Double) -> String? {
        guard Double(series) > piezas.rounded(.up) else { return nil }
        let deSerie = series == 1 ? "número de serie" : "números de serie"
        let dePiezas = piezas == 1 ? "pieza" : "piezas"
        return "Hay \(series) \(deSerie) y el movimiento es de \(CoreExtrasFormato.numero(piezas)) \(dePiezas)."
    }

    /// Qué le falta a una salida para registrarse; `nil` si ya está completa.
    static func errorSalida(recibeId: Int?, fotos: Int, actividadId: Int?, motivo: String) -> String? {
        if recibeId == nil { return "Elige quién se lleva el material." }
        if fotos <= 0 { return "Toma al menos una foto de lo que sale." }
        if actividadId == nil, motivo.nilSiVacio == nil { return "Liga la salida a una actividad o escribe para qué es." }
        return nil
    }

    /// «AN-120 · Instalación día 1», con lo que haya.
    static func textoActividad(_ actividad: HerramientaActividad) -> String {
        let texto = [actividad.anNumber?.nilSiVacio, actividad.titulo?.nilSiVacio]
            .compactMap { $0 }
            .joined(separator: " · ")
        if !texto.isEmpty { return texto }
        return actividad.id.map { "Actividad \($0)" } ?? "Actividad"
    }

    /// El movimiento quedó hecho pero las fotos no subieron: se dice, no se esconde.
    static func avisoFotosPendientes(_ aviso: String) -> String {
        "\(aviso) Las fotos no se subieron: agrégalas desde la web, en Movimientos."
    }
}
