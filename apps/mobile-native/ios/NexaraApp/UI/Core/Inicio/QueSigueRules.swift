import Foundation

/// Lo que decide «¿Qué sigue?» en el teléfono. Espejo de `QueSigueRules.kt`. Sin SwiftUI: lógica pura.
enum QueSigueRules {
    static let largoPendiente = 200

    enum Boton { case empezar, abrirActividad, abrirActividades, ninguno }

    /// Solo cuando no trae nada corriendo: con el reloj andando, estorba.
    static func mostrar(algoCorriendo: Bool) -> Bool { !algoCorriendo }

    static func actividadDe(_ href: String?) -> Int? {
        guard let href, href.hasPrefix("/erp/actividades/") else { return nil }
        let resto = href.dropFirst("/erp/actividades/".count)
        return Int(resto.prefix { $0.isNumber })
    }

    /// Lo de Mesa contable y Obra vive en la web: en el teléfono se lee, sin botón que no lleve a ningún lado.
    static func boton(de s: SugerenciaQueSigue) -> Boton {
        if s.accion == "empezar" { return .empezar }
        if actividadDe(s.href) != nil { return .abrirActividad }
        if s.href?.hasPrefix("/erp/pizarra") == true { return .abrirActividades }
        return .ninguno
    }

    static func pendienteValido(_ texto: String) -> Bool {
        let limpio = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        return !limpio.isEmpty && limpio.count <= largoPendiente
    }
}

/// La foto de la comida: todos, de su escritorio; quien no está en oficina, la personal diciendo por qué
/// (Adam, 04-11). Espejo de `ComidasRules.kt`.
enum ComidasFotoRules {
    static let motivosFuera = ["En obra", "Con un cliente", "En ruta", "Trabajando en casa"]
    static let minMotivoFuera = 3

    static func motivoValido(_ texto: String) -> Bool {
        texto.trimmingCharacters(in: .whitespacesAndNewlines).count >= minMotivoFuera
    }

    static func fotoTipo(enOficina: Bool) -> String { enOficina ? "escritorio" : "personal" }

    static func titulo(checkIn: Bool, enOficina: Bool) -> String {
        if enOficina { return checkIn ? "Foto de tu escritorio limpio" : "Foto de tu escritorio en orden" }
        return checkIn ? "Tu foto de salida a comer" : "Tu foto de regreso"
    }

    static func subtitulo(checkIn: Bool, enOficina: Bool) -> String {
        if enOficina {
            return checkIn ? "Déjalo en orden antes de salir: se guarda con la hora en que sales." : "Al volver a tu lugar: se guarda con la hora en que regresas."
        }
        return checkIn ? "Acomódate y toma la foto: se guarda con la hora en que sales." : "Toma la foto al volver a tu lugar: se guarda con la hora en que regresas."
    }
}
