import Foundation

/// Reglas puras del check list de entrega y recepción de vehículos utilitarios.
///
/// Espejo de `apps/api/src/vehicles/checklist-entrega.ts` (la fuente de verdad)
/// y del `ChecklistVehiculoRules.kt` de Android: los mismos siete slots, las
/// mismas etiquetas cortas, los mismos niveles de gasolina y —palabra por
/// palabra— los mismos mensajes de error, para que la app no deje enviar algo
/// que el API va a rechazar con un 400.
///
/// Aquí no entra SwiftUI ni UIKit: solo Foundation, para que la regla se pueda
/// leer y comparar contra el TypeScript de un vistazo.

// MARK: - Slots

/// Las siete fotos del check list. El `rawValue` es el nombre del campo del
/// multipart y la clave dentro del JSON de `meta`.
enum SlotChecklist: String, CaseIterable, Identifiable, Hashable {
    // Las cuatro caras del 360°.
    case frontal
    case trasera
    case lateralIzq = "lateral-izq"
    case lateralDer = "lateral-der"
    // Habitáculo y cajuela.
    case interiorDelantera = "interior-delantera"
    case interiorTrasera = "interior-trasera"
    // Odómetro y aguja de gasolina en la misma foto.
    case tablero

    var id: String { rawValue }

    /// Nombre del campo del multipart (`SLOTS_CHECKLIST`).
    var field: String { rawValue }

    /// Etiqueta corta (`ETIQUETA_SLOT`). Sin prosa: cabe en un botón.
    var label: String {
        switch self {
        case .frontal: return "Frente"
        case .trasera: return "Trasera"
        case .lateralIzq: return "Lateral izq."
        case .lateralDer: return "Lateral der."
        case .interiorDelantera: return "Interior frente"
        case .interiorTrasera: return "Interior atrás"
        case .tablero: return "Tablero"
        }
    }

    /// Icono del paso en la cuadrícula.
    var systemImage: String {
        switch self {
        case .frontal: return "car.front.waves.up"
        case .trasera: return "car.rear"
        case .lateralIzq: return "car.side"
        case .lateralDer: return "car.side"
        case .interiorDelantera: return "carseat.left"
        case .interiorTrasera: return "carseat.right"
        case .tablero: return "gauge.with.dots.needle.bottom.50percent"
        }
    }
}

// MARK: - Combustible

/// Selector rápido junto a la foto del tablero (`NIVELES_COMBUSTIBLE`). Nadie
/// lee una aguja en porcentajes: se lee E, ¼, ½, ¾, F. El porcentaje es lo que
/// guarda el API.
enum NivelCombustible: String, CaseIterable, Identifiable, Hashable {
    case vacio = "E"
    case unCuarto = "1/4"
    case medio = "1/2"
    case tresCuartos = "3/4"
    case lleno = "F"

    var id: String { rawValue }

    /// Lo que viaja en el campo `combustible` del multipart.
    var apiValue: String { rawValue }

    /// Lo que se ve en el selector segmentado.
    var label: String {
        switch self {
        case .vacio: return "E"
        case .unCuarto: return "¼"
        case .medio: return "½"
        case .tresCuartos: return "¾"
        case .lleno: return "F"
        }
    }

    var pct: Int {
        switch self {
        case .vacio: return 0
        case .unCuarto: return 25
        case .medio: return 50
        case .tresCuartos: return 75
        case .lleno: return 100
        }
    }

    /// 40 → ½ (el más cercano). `nivelDesdeCombustiblePct` del API, para pintar
    /// de vuelta el nivel con el que salió el vehículo.
    static func from(pct: Int?) -> NivelCombustible? {
        guard let pct else { return nil }
        return allCases.min { abs($0.pct - pct) < abs($1.pct - pct) }
    }
}

// MARK: - Validación

/// Lo que falta del check list, ya en español (Android
/// `ChecklistVehiculoRules.Validacion`).
struct ValidacionChecklist: Equatable {
    /// Etiquetas de las casillas sin foto (o con una foto que ya no es de ahora).
    var faltantes: [String] = []
    /// Km y combustible: lo que hay que corregir.
    var errores: [String] = []

    var ok: Bool { faltantes.isEmpty && errores.isEmpty }

    /// Una sola línea con todo; `nil` si todo está bien.
    var mensaje: String? {
        guard !ok else { return nil }
        var partes: [String] = []
        if !faltantes.isEmpty { partes.append("Faltan fotos: \(faltantes.joined(separator: ", "))") }
        partes.append(contentsOf: errores)
        return partes.joined(separator: ". ")
    }
}

enum ChecklistVehiculoRules {
    /// Los siete slots en el orden en que se piden en pantalla.
    static let slots: [SlotChecklist] = SlotChecklist.allCases

    /// Paso 1 del flujo: las cuatro caras del 360°.
    static let exterior: [SlotChecklist] = [.frontal, .trasera, .lateralIzq, .lateralDer]

    /// Paso 1 del flujo: habitáculo y cajuela.
    static let interior: [SlotChecklist] = [.interiorDelantera, .interiorTrasera]

    /// Paso 1 completo (Android `SLOTS_FOTOS`): 4 exterior + 2 interior.
    static let fotos: [SlotChecklist] = exterior + interior

    /// Paso 2: el tablero va solo, con el kilometraje y la gasolina.
    static let tablero: SlotChecklist = .tablero

    /// Margen para aceptar una captura como «en vivo» (`VENTANA_CAPTURA_HORAS`
    /// del API): una foto más vieja la rechaza el servidor, así que aquí cuenta
    /// como faltante.
    static let ventanaCapturaHoras: Double = 12

    /// «Faltan fotos: Frente, Trasera» de unas casillas; `nil` si están todas.
    static func faltaEn(_ casillas: [SlotChecklist], capturas: [SlotChecklist: Date]) -> String? {
        let faltan = casillas.filter { capturas[$0] == nil }.map(\.label)
        return faltan.isEmpty ? nil : "Faltan fotos: \(faltan.joined(separator: ", "))"
    }

    /// Mismas reglas y mismas palabras que Android (`validar`).
    ///
    /// - Parameters:
    ///   - capturas: slot → instante en que la cámara tomó la foto. Sin entrada == sin foto.
    ///   - odometroKm: lo tecleado; `nil` si está vacío o no es número.
    ///   - combustible: nivel marcado; `nil` si no se ha tocado.
    ///   - kmInicio: en la devolución, el km con el que salió (piso del km final).
    ///   - ahora: inyectable para no depender del reloj real.
    static func validar(
        capturas: [SlotChecklist: Date],
        odometroKm: Int?,
        combustible: NivelCombustible?,
        kmInicio: Int? = nil,
        ahora: Date = Date()
    ) -> ValidacionChecklist {
        let faltantes = slots.filter { slot in
            guard let capturedAt = capturas[slot] else { return true }
            return ahora.timeIntervalSince(capturedAt) / 3600 > ventanaCapturaHoras
        }
        .map(\.label)

        var errores: [String] = []
        if let km = odometroKm {
            if km < 0 {
                errores.append("El kilometraje no puede ser negativo")
            } else if let kmInicio, km < kmInicio {
                errores.append("El kilometraje final (\(km)) no puede ser menor al de salida (\(kmInicio))")
            }
        } else {
            errores.append("Escribe el kilometraje")
        }
        if combustible == nil {
            errores.append("Elige el nivel de combustible")
        }
        return ValidacionChecklist(faltantes: faltantes, errores: errores)
    }

    /// La misma validación, renglón por renglón, para las pantallas que pintan
    /// una lista (`ChecklistVehiculoView`).
    static func validar(
        capturas: [SlotChecklist: Date],
        odometroKm: Int?,
        combustible: NivelCombustible?,
        odometroInicio: Int?,
        ahora: Date = Date()
    ) -> [ErrorChecklist] {
        let v: ValidacionChecklist = validar(
            capturas: capturas,
            odometroKm: odometroKm,
            combustible: combustible,
            kmInicio: odometroInicio,
            ahora: ahora
        )
        var lista: [ErrorChecklist] = []
        if !v.faltantes.isEmpty {
            lista.append(ErrorChecklist(campo: "fotos", mensaje: "Faltan fotos: \(v.faltantes.joined(separator: ", "))"))
        }
        lista.append(contentsOf: v.errores.map { ErrorChecklist(campo: "datos", mensaje: $0) })
        return lista
    }
}

/// Un renglón de `ValidacionChecklist`, identificable para `ForEach`.
struct ErrorChecklist: Identifiable, Hashable {
    let campo: String
    let mensaje: String
    var id: String { "\(campo)|\(mensaje)" }
}
