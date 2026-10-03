import Foundation

/// Códigos de barras leídos con la cámara o escritos a mano: limpieza, tipo y si el
/// dígito verificador cuadra. Espejo de `apps/api/src/warehouse/codigo-barras.ts`
/// (almacén), de `normalizarCodigoEtiqueta` (herramientas) y de `CodigoBarrasRules.kt`.
/// El API vuelve a validar; esto solo evita mandar lo que de seguro rebota.
enum CodigoBarras {
    static let largoMinimo = 3
    static let largoMaximo = 64

    enum Tipo: String {
        case upcA = "UPC_A"
        case ean13 = "EAN_13"
        case ean8 = "EAN_8"
        case gtin14 = "GTIN_14"
        case interno = "INTERNO"

        var etiqueta: String {
            switch self {
            case .upcA: return "UPC-A"
            case .ean13: return "EAN-13"
            case .ean8: return "EAN-8"
            case .gtin14: return "GTIN-14"
            case .interno: return "Código interno"
            }
        }
    }

    struct Clasificado: Equatable {
        let codigo: String
        let tipo: Tipo
        /// Parece UPC/EAN (12 o 13 dígitos) pero el verificador no cuadra: casi siempre un dedazo.
        let sospechoso: Bool
    }

    private static let largosGtin: Set<Int> = [8, 12, 13, 14]

    private static func sinControl(_ valor: String?) -> String {
        let escalares = (valor ?? "").unicodeScalars.filter { $0.value >= 0x20 && $0.value != 0x7f }
        return String(String.UnicodeScalarView(escalares))
    }

    /// Quita el prefijo AIM (`]C1`, `]E0`) que meten algunos lectores.
    private static func sinPrefijoAim(_ texto: String) -> String {
        var t = texto
        if let rango = t.range(of: "^\\][A-Za-z][0-9A-Za-z]", options: .regularExpression) {
            t.removeSubrange(rango)
        }
        return t
    }

    private static func soloDigitos(_ texto: String) -> Bool {
        !texto.isEmpty && texto.unicodeScalars.allSatisfy { $0.value >= 0x30 && $0.value <= 0x39 }
    }

    private static func imprimible(_ texto: String) -> Bool {
        !texto.isEmpty && texto.unicodeScalars.allSatisfy { $0.value >= 0x20 && $0.value <= 0x7e }
    }

    /// Quita espacios, caracteres de control y el prefijo AIM.
    static func limpiar(_ valor: String?) -> String {
        let base = sinControl(valor).trimmingCharacters(in: .whitespacesAndNewlines)
        return sinPrefijoAim(base).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Dígito verificador GTIN del cuerpo sin verificador (pesos 3-1 desde la derecha).
    /// nil si el cuerpo no son solo dígitos.
    static func digitoVerificadorGtin(_ cuerpo: String) -> Int? {
        guard soloDigitos(cuerpo) else { return nil }
        var suma = 0
        for (i, escalar) in cuerpo.unicodeScalars.reversed().enumerated() {
            let digito = Int(escalar.value) - 0x30
            suma += digito * (i % 2 == 0 ? 3 : 1)
        }
        return (10 - (suma % 10)) % 10
    }

    static func esGtinValido(_ codigo: String) -> Bool {
        guard soloDigitos(codigo), largosGtin.contains(codigo.count),
              let ultimo = codigo.unicodeScalars.last else { return false }
        return digitoVerificadorGtin(String(codigo.dropLast())) == Int(ultimo.value) - 0x30
    }

    static func clasificar(_ valor: String?) -> Clasificado {
        let codigo = limpiar(valor)
        if esGtinValido(codigo) {
            let tipo: Tipo
            switch codigo.count {
            case 12: tipo = .upcA
            case 13: tipo = .ean13
            case 8: tipo = .ean8
            default: tipo = .gtin14
            }
            return Clasificado(codigo: codigo, tipo: tipo, sospechoso: false)
        }
        // 8 dígitos sin verificador válido puede ser un UPC-E legítimo: no se marca.
        let sospechoso = soloDigitos(codigo) && (codigo.count == 12 || codigo.count == 13)
        return Clasificado(codigo: codigo, tipo: .interno, sospechoso: sospechoso)
    }

    /// Por qué no se puede buscar este código de producto, o nil si está bien.
    static func motivoInvalido(_ valor: String?) -> String? {
        let c = clasificar(valor)
        if c.codigo.isEmpty { return "Escanea o escribe un código de barras" }
        if c.codigo.count < largoMinimo { return "El código es demasiado corto (mínimo \(largoMinimo) caracteres)" }
        if c.codigo.count > largoMaximo { return "El código es demasiado largo (máximo \(largoMaximo) caracteres)" }
        if !imprimible(c.codigo) { return "El código trae caracteres que un lector no puede leer" }
        if c.sospechoso { return "Parece un UPC/EAN pero el dígito verificador no cuadra. Vuelve a escanearlo." }
        return nil
    }

    /// ¿Tiene caso pedirle datos al catálogo internacional? Solo GTIN de 12 a 14 dígitos.
    static func esConsultableInternacional(_ valor: String?) -> Bool {
        [.upcA, .ean13, .gtin14].contains(clasificar(valor).tipo)
    }

    /// Etiqueta de herramienta (Code 128 con la nomenclatura `PREFIJO-SERIE`): sin lo que mete
    /// el lector alrededor y en mayúsculas, igual que la compara el API.
    static func normalizarEtiquetaHerramienta(_ valor: String?) -> String {
        let base = sinControl(valor).trimmingCharacters(in: .whitespacesAndNewlines)
        return sinPrefijoAim(base).trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    }

    static func motivoEtiquetaInvalida(_ valor: String?) -> String? {
        let codigo = normalizarEtiquetaHerramienta(valor)
        if codigo.isEmpty { return "Escanea o escribe la etiqueta de la herramienta" }
        if codigo.count > largoMaximo { return "La etiqueta es demasiado larga (máximo \(largoMaximo) caracteres)" }
        if !imprimible(codigo) { return "La etiqueta trae caracteres que un lector no puede leer" }
        return nil
    }

    /// Cantidad de un movimiento: entera o decimal con punto o coma, mayor que cero.
    static func parseCantidad(_ texto: String?) -> Double? {
        let limpio = (texto ?? "").trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard let n = Double(limpio), n.isFinite, n > 0 else { return nil }
        return n
    }
}
