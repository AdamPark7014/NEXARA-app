import SwiftUI
import UIKit

// MARK: - Marca NEXARA (teal, rediseño v2)

/// Paleta de marca. Única fuente de los tonos de marca de la app: nada de
/// `Color(red:…)` sueltos ni `.teal` en las pantallas. El color de acento global
/// (`Color.accentColor`) sale de `Assets.xcassets/AccentColor` con el mismo teal.
///
/// Rediseño v2 (`.ai/ui-maquetas/PLAN.md` §2): el teal `#1F9E84` que ya usa la
/// web, con su escala (texto `#12715E`, suaves `#E7F5F1` / `#CFECE4`) y los
/// acentos del logotipo como color de CATEGORÍA, nunca de estado.
///
/// Los colores semánticos NO son marca y siguen en `CorePalette` / `NxTone`:
/// verde para aprobado/terminado, naranja para avisos, rojo para errores.
enum NxBrand {
    /// #1F9E84 — botones, iconos, acentos.
    static let primary = Color(red: 0.122, green: 0.620, blue: 0.518)
    /// #0F5F4F — superficies con texto blanco encima (baldosa del logo, tarjeta de jornada).
    static let dark = Color(red: 0.059, green: 0.373, blue: 0.310)
    /// #E7F5F1 — fondo suave de baldosas e iconos (modo claro).
    static let soft = Color(red: 0.906, green: 0.961, blue: 0.945)
    /// #F2FAF8 — tinte de superficie (fondos de pantalla de acceso).
    static let surface = Color(red: 0.949, green: 0.980, blue: 0.973)
    /// #4FC4A8 — variante clara del primario para modo oscuro.
    static let light = Color(red: 0.310, green: 0.769, blue: 0.659)

    /// Primario que se aclara en modo oscuro (#1F9E84 / #4FC4A8).
    static let adaptive = dynamic(light: 0x1F9E84, dark: 0x4FC4A8)

    /// Fondo suave de baldosa: #E7F5F1 en claro, teal translúcido en oscuro.
    static let softFill = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.310, green: 0.769, blue: 0.659, alpha: 0.20)
            : UIColor(red: 0.906, green: 0.961, blue: 0.945, alpha: 1)
    })

    /// Texto de marca legible sobre fondo claro y suave: #12715E / #8FDCC8.
    static let text = dynamic(light: 0x12715E, dark: 0x8FDCC8)
    /// Suave 2 (#CFECE4): pastilla activa, bordes de marca.
    static let soft2 = dynamic(light: 0xCFECE4, dark: 0x1B4C49)
    /// Teal profundo de la tarjeta de jornada (igual en los dos modos, letras blancas).
    static let deep = Color(red: 0.059, green: 0.373, blue: 0.310)
    /// Degradado de la tarjeta de jornada de Inicio (`movil-inicio.png`).
    static let heroGradient = LinearGradient(
        colors: [
            Color(red: 0.169, green: 0.741, blue: 0.616), // #2BBD9D
            Color(red: 0.102, green: 0.541, blue: 0.451), // #1A8A73
            Color(red: 0.059, green: 0.373, blue: 0.310), // #0F5F4F
        ],
        startPoint: .topTrailing,
        endPoint: .bottomLeading
    )

    // MARK: Acentos de categoría (del logotipo). Color de TIPO, nunca de estado.

    /// Cielo #3AA9CC: Redes.
    static let categorySky = dynamic(light: 0x3AA9CC, dark: 0x5CC0DE)
    /// Magenta #A64CA6: Acceso.
    static let categoryMagenta = dynamic(light: 0xA64CA6, dark: 0xC06FC0)
    /// Naranja #EE8A2A: Obra.
    static let categoryOrange = dynamic(light: 0xEE8A2A, dark: 0xF4A456)
    /// CCTV va en el teal de marca.
    static let categoryCctv = adaptive

    /// Color de categoría por tipo de actividad (mismo mapa que Android `categoryColor`).
    static func category(_ coreKind: String?) -> Color {
        switch (coreKind ?? "").trimmingCharacters(in: .whitespaces).lowercased() {
        case "obra": return categoryOrange
        case "proyecto": return categorySky
        case "comercial": return categoryMagenta
        case "servicio": return categoryCctv
        default: return adaptive
        }
    }

    /// Color con variante clara y oscura a partir de dos hex `0xRRGGBB`.
    static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            uiColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }

    private static func uiColor(hex: UInt32) -> UIColor {
        UIColor(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

// MARK: - Superficies y texto v2 (con variante oscura)

/// Tonos neutros del rediseño v2 que cambian con el modo oscuro. Las pantallas
/// nuevas (Inicio, detalle de actividad) leen de aquí en vez de fijar blancos.
enum NxSurface {
    /// Fondo de pantalla: #F4F6F8 / #090F19.
    static let screen = NxBrand.dynamic(light: 0xF4F6F8, dark: 0x090F19)
    /// Tarjeta: blanco / #11202F.
    static let card = NxBrand.dynamic(light: 0xFFFFFF, dark: 0x11202F)
    /// Superficie hundida (pista de progreso, paso pendiente): #F1F5F9 / #0E1A30.
    static let sunken = NxBrand.dynamic(light: 0xF1F5F9, dark: 0x0E1A30)
    /// Filo de tarjeta: #E2E8F0 / #1F3548.
    static let border = NxBrand.dynamic(light: 0xE2E8F0, dark: 0x1F3548)
    /// Filo fuerte (botón secundario): #CBD5E1 / #3A5873.
    static let borderStrong = NxBrand.dynamic(light: 0xCBD5E1, dark: 0x3A5873)
    /// Texto terciario v2: #6B7889 (≈4.6:1) / #91ACC7.
    static let muted = NxBrand.dynamic(light: 0x6B7889, dark: 0x91ACC7)
}

// MARK: - Iconos (SF Symbols en lugar de emojis)

/// Icono SF Symbol dentro de una baldosa redondeada con fondo suave.
/// Sustituye a los emojis decorativos de encabezados y estados vacíos.
struct NxIconBadge: View {
    let systemName: String
    var tint: Color = NxBrand.primary
    var size: CGFloat = 36
    var circle: Bool = false

    var body: some View {
        Image(systemName: systemName)
            .symbolRenderingMode(.hierarchical)
            .font(.system(size: size * 0.46, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: size, height: size)
            .background(
                tint.opacity(0.14),
                in: RoundedRectangle(cornerRadius: circle ? size / 2 : size * 0.28, style: .continuous)
            )
            .accessibilityHidden(true)
    }
}

/// Texto con un SF Symbol al frente, alineado a la primera línea.
/// Sustituye a los textos que empezaban con emoji.
struct NxIconText: View {
    let systemName: String
    let text: String
    var tint: Color? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Image(systemName: systemName)
                .symbolRenderingMode(.hierarchical)
                // Sin tinte hereda el estilo del texto que lo rodea.
                .foregroundStyle(tint.map { AnyShapeStyle($0) } ?? AnyShapeStyle(HierarchicalShapeStyle.primary))
                .accessibilityHidden(true)
            Text(text)
        }
    }
}
