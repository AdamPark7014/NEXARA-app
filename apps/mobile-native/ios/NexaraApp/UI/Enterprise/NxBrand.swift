import SwiftUI
import UIKit

// MARK: - Tabla de color de Android (paridad exacta)

/// Los colores de la app Android, con los MISMOS valores: `NxColors` +
/// `NxLightPalette` + `NxUi` (`ui/enterprise/*.kt`) y los colores de dominio de
/// `CoreActivityRules` (VERDE, NARANJA, ROJO…).
///
/// Es la única tabla de color de iOS. Los nombres viejos (`NxBrand`, `NxSurface`,
/// `NxTone`, `CorePalette`, `CoreExtrasSemaforo`) apuntan aquí en vez de llevar
/// sus propios números. Todos son FIJOS, sin variante oscura: la app se pinta
/// siempre en claro (`UIUserInterfaceStyle = Light`), igual que Android.
enum NxColors {
    // ── Marca ───────────────────────────────────────────────────────────────
    /// #1F9E84 — botones, pestaña activa, chips, enlaces, progreso, FAB, barra superior.
    static let brand = rgb(0x1F9E84)
    /// #12715E — texto de marca sobre fondo claro y suave.
    static let brandText = rgb(0x12715E)
    /// #0F5F4F — superficies fuertes con letra blanca; icono activo de la barra inferior.
    static let brandDeep = rgb(0x0F5F4F)
    /// #E7F5F1 — fondo de chips, iconos y baldosas.
    static let brandSoft = rgb(0xE7F5F1)
    /// #CFECE4 — pastilla activa de la barra inferior, bordes de marca.
    static let brandSoft2 = rgb(0xCFECE4)
    /// #F2FAF8 — tinte de superficie (círculo del estado vacío, tarjetas destacadas).
    static let brandTint = rgb(0xF2FAF8)
    /// #2BBD9D — acento claro para gráficas e insignias.
    static let accent = rgb(0x2BBD9D)

    // ── Texto ───────────────────────────────────────────────────────────────
    /// #0F172A — texto principal.
    static let fg = rgb(0x0F172A)
    /// #475569 — texto secundario que SÍ hay que leer.
    static let fg2 = rgb(0x475569)
    /// #6B7889 — texto terciario (metadatos, iconos inactivos).
    static let muted = rgb(0x6B7889)
    /// #94A3B8 — solo deshabilitado.
    static let fg4 = rgb(0x94A3B8)

    // ── Superficies y bordes ────────────────────────────────────────────────
    /// #F8FAFC — fondo de TODAS las pantallas y de la barra inferior.
    static let surface = rgb(0xF8FAFC)
    /// #FFFFFF — tarjetas.
    static let card = rgb(0xFFFFFF)
    /// #F1F5F9 — superficie hundida (pista de progreso, campo de solo lectura).
    static let sunken = rgb(0xF1F5F9)
    /// #E2E8F0 — borde por omisión de tarjeta, campo y botón secundario.
    static let border = rgb(0xE2E8F0)
    /// #EEF2F6 — separadores internos (entre filas, entre celdas).
    static let borderSubtle = rgb(0xEEF2F6)
    /// #CBD5E1 — divisor de sección, contorno de campos y botones de contorno.
    static let borderStrong = rgb(0xCBD5E1)

    // ── Semánticos ──────────────────────────────────────────────────────────
    static let success = rgb(0x10B981)
    static let successSoft = rgb(0xD1FAE5)
    static let warning = rgb(0xF59E0B)
    static let warningSoft = rgb(0xFEF3C7)
    /// Texto sobre `warningSoft`.
    static let warningText = rgb(0x92400E)
    static let danger = rgb(0xEF4444)
    static let dangerSoft = rgb(0xFEE2E2)
    /// Texto sobre `dangerSoft`.
    static let dangerText = rgb(0x991B1B)
    static let info = rgb(0x3B82F6)
    static let infoSoft = rgb(0xDBEAFE)

    // ── Categorías (del logotipo). Color de TIPO, nunca de estado. ──────────
    /// Cielo #3AA9CC: Redes.
    static let categorySky = rgb(0x3AA9CC)
    /// Magenta #A64CA6: Acceso.
    static let categoryMagenta = rgb(0xA64CA6)
    /// Naranja #EE8A2A: Obra.
    static let categoryOrange = rgb(0xEE8A2A)
    /// CCTV va en el teal de marca.
    static let categoryCctv = brand

    // ── Dominio (`CoreActivityRules` de Android) ────────────────────────────
    static let verde = rgb(0x16A34A)
    static let naranja = rgb(0xD97706)
    static let rojo = rgb(0xDC2626)
    static let azul = rgb(0x2563EB)
    static let morado = rgb(0x7C3AED)
    static let gris = rgb(0x94A3B8)
    static let cian = rgb(0x0284C7)

    /// Color fijo desde `0xRRGGBB`.
    static func rgb(_ hex: UInt32, alpha: Double = 1) -> Color {
        Color(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

// MARK: - Marca NEXARA (nombres de siempre, valores de Android)

/// Paleta de marca. Única fuente de los tonos de marca de la app: nada de
/// `Color(red:…)` sueltos ni `.teal` en las pantallas. El color de acento global
/// (`Color.accentColor`) sale de `Assets.xcassets/AccentColor` con el mismo teal;
/// su variante oscura es BLANCA a propósito: el único sitio de la app que se pinta
/// con rasgo oscuro es la barra superior teal (`nxBrandNavBar`), y ahí los botones
/// y la flecha de volver tienen que salir en blanco, como en Android.
///
/// Los valores salen de `NxColors` (paridad exacta con Android). Los colores
/// semánticos NO son marca y siguen en `NxTone` / `CorePalette`.
enum NxBrand {
    /// #1F9E84 — botones, iconos, acentos.
    static let primary = NxColors.brand
    /// #0F5F4F — superficies con texto blanco encima (baldosa del logo, tarjeta de jornada).
    static let dark = NxColors.brandDeep
    /// #E7F5F1 — fondo suave de baldosas e iconos.
    static let soft = NxColors.brandSoft
    /// #F2FAF8 — tinte de superficie (fondos de pantalla de acceso).
    static let surface = NxColors.brandTint
    /// #4FC4A8 — el teal aclarado del modo oscuro de Android. La app ya no tiene
    /// modo oscuro; se conserva para quien lo use en gráficas.
    static let light = NxColors.rgb(0x4FC4A8)

    /// Antes cambiaba con el modo oscuro; hoy es el teal de marca fijo (#1F9E84).
    static let adaptive = NxColors.brand

    /// Fondo suave de baldosa: #E7F5F1.
    static let softFill = NxColors.brandSoft

    /// Texto de marca legible sobre fondo claro y suave: #12715E.
    static let text = NxColors.brandText
    /// Suave 2 (#CFECE4): pastilla activa, bordes de marca.
    static let soft2 = NxColors.brandSoft2
    /// Teal profundo de la tarjeta de jornada (letras blancas).
    static let deep = NxColors.brandDeep
    /// Degradado de la tarjeta de jornada de Inicio (`movil-inicio.png`).
    static let heroGradient = LinearGradient(
        colors: [
            NxColors.accent,           // #2BBD9D
            NxColors.rgb(0x1A8A73),    // #1A8A73
            NxColors.brandDeep,        // #0F5F4F
        ],
        startPoint: .topTrailing,
        endPoint: .bottomLeading
    )

    // MARK: Acentos de categoría (del logotipo). Color de TIPO, nunca de estado.

    /// Cielo #3AA9CC: Redes.
    static let categorySky = NxColors.categorySky
    /// Magenta #A64CA6: Acceso.
    static let categoryMagenta = NxColors.categoryMagenta
    /// Naranja #EE8A2A: Obra.
    static let categoryOrange = NxColors.categoryOrange
    /// CCTV va en el teal de marca.
    static let categoryCctv = NxColors.categoryCctv

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

    /// Antes daba un color con variante clara y oscura. La app es solo clara
    /// (como Android), así que devuelve siempre el valor claro; `dark` se ignora.
    static func dynamic(light: UInt32, dark: UInt32) -> Color {
        NxColors.rgb(light)
    }
}

// MARK: - Superficies y texto (valores de Android, fijos)

/// Tonos neutros de pantalla. Mismos valores que `NxLightPalette` de Android.
enum NxSurface {
    /// Fondo de pantalla: #F8FAFC (no el `systemGroupedBackground` de iOS).
    static let screen = NxColors.surface
    /// Tarjeta: blanco.
    static let card = NxColors.card
    /// Superficie hundida (pista de progreso, paso pendiente): #F1F5F9.
    static let sunken = NxColors.sunken
    /// Filo de tarjeta: #E2E8F0.
    static let border = NxColors.border
    /// Separador interno: #EEF2F6.
    static let borderSubtle = NxColors.borderSubtle
    /// Filo fuerte (botón secundario, contorno de campo): #CBD5E1.
    static let borderStrong = NxColors.borderStrong
    /// Texto principal: #0F172A.
    static let fg = NxColors.fg
    /// Texto secundario que hay que leer: #475569.
    static let fg2 = NxColors.fg2
    /// Texto terciario: #6B7889 (≈4.6:1).
    static let muted = NxColors.muted
    /// Solo deshabilitado: #94A3B8.
    static let fg4 = NxColors.fg4
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
