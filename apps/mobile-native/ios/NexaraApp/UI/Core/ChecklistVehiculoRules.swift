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

/// Un error del check list: el campo que lo provoca y lo que se le dice a quien
/// está parado junto al coche (`ErrorChecklist` del API).
struct ErrorChecklist: Identifiable, Hashable {
    let campo: String
    let mensaje: String

    var id: String { "\(campo)|\(mensaje)" }
}

enum ChecklistVehiculoRules {
    /// Los siete slots en el orden en que se piden en pantalla.
    static let slots: [SlotChecklist] = SlotChecklist.allCases

    /// Paso 1 del flujo: las cuatro caras del 360°.
    static let exterior: [SlotChecklist] = [.frontal, .trasera, .lateralIzq, .lateralDer]

    /// Paso 1 del flujo: habitáculo y cajuela.
    static let interior: [SlotChecklist] = [.interiorDelantera, .interiorTrasera]

    /// Paso 2: el tablero va solo, con el kilometraje y la gasolina.
    static let tablero: SlotChecklist = .tablero

    /// Margen para aceptar una captura como «en vivo» (`VENTANA_CAPTURA_HORAS`).
    static let ventanaCapturaHoras: Double = 12

    /// Los slots que todavía no tienen foto.
    static func faltantes(capturas: [SlotChecklist: Date]) -> [SlotChecklist] {
        slots.filter { capturas[$0] == nil }
    }

    /// Todos los errores juntos, en el mismo orden que `revisarChecklist`: que
    /// nadie descubra el segundo error después de arreglar el primero.
    /// Vacío == se puede enviar.
    ///
    /// - Parameters:
    ///   - capturas: slot → instante en que la cámara tomó la foto
    ///     (`CapturedGeoPhoto.capturedAt`). Sin entrada == sin foto.
    ///   - odometroKm: lo tecleado en el paso de kilometraje; `nil` si está vacío.
    ///   - combustible: nivel marcado en el selector; `nil` si no se ha tocado.
    ///   - odometroInicio: en la devolución, el kilometraje con el que salió.
    ///   - ahora: inyectable para no depender del reloj real.
    static func validar(
        capturas: [SlotChecklist: Date],
        odometroKm: Int?,
        combustible: NivelCombustible?,
        odometroInicio: Int? = nil,
        ahora: Date = Date()
    ) -> [ErrorChecklist] {
        var errores: [ErrorChecklist] = []

        for slot in slots {
            guard let capturedAt = capturas[slot] else {
                errores.append(ErrorChecklist(campo: slot.field, mensaje: "Falta la foto: \(slot.label)"))
                continue
            }
            let edadHoras = ahora.timeIntervalSince(capturedAt) / 3600
            if edadHoras > ventanaCapturaHoras {
                errores.append(ErrorChecklist(
                    campo: slot.field,
                    mensaje: "\(slot.label): la foto no es de ahora, vuelve a tomarla"
                ))
            }
        }

        if let odometroKm {
            if odometroKm < 0 {
                errores.append(ErrorChecklist(campo: "odometroKm", mensaje: "Captura el kilometraje del tablero"))
            } else if let odometroInicio, odometroKm < odometroInicio {
                errores.append(ErrorChecklist(
                    campo: "odometroKm",
                    mensaje: "El kilometraje final no puede ser menor al inicial (\(odometroInicio) km)"
                ))
            }
        } else {
            errores.append(ErrorChecklist(campo: "odometroKm", mensaje: "Captura el kilometraje del tablero"))
        }

        if combustible == nil {
            errores.append(ErrorChecklist(
                campo: "combustible",
                mensaje: "Marca el nivel de gasolina (E, ¼, ½, ¾, F)"
            ))
        }

        return errores
    }

    /// Un solo renglón con todo lo que falta (`mensajeErrores` del API).
    static func mensaje(_ errores: [ErrorChecklist]) -> String {
        errores.map(\.mensaje).joined(separator: ". ")
    }
}
