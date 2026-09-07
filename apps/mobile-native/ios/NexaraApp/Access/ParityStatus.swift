import Foundation

/// Estado de paridad nativo vs web — espejo de Android `ParityStatus`.
enum ParityStatus: String, Hashable, Codable {
    case nativo = "NATIVO"
    case soloLectura = "SOLO_LECTURA"
    case cascaron = "CASCARON"
    case ausente = "AUSENTE"
}
