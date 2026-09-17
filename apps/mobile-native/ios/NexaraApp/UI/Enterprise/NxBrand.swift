import SwiftUI
import UIKit

// MARK: - Marca NEXARA (azul)

/// Paleta de marca. Única fuente de los tonos de marca de la app: nada de
/// `Color(red:…)` sueltos ni `.teal` en las pantallas. El color de acento global
/// (`Color.accentColor`) sale de `Assets.xcassets/AccentColor` con el mismo azul.
///
/// Los colores semánticos NO son marca y siguen en `CorePalette`: verde para
/// aprobado/terminado, naranja para avisos, rojo para errores.
enum NxBrand {
    /// #2563EB — botones, iconos, acentos.
    static let primary = Color(red: 0.145, green: 0.388, blue: 0.922)
    /// #1E40AF — superficies con texto blanco encima (baldosa del logo).
    static let dark = Color(red: 0.118, green: 0.251, blue: 0.686)
    /// #DBEAFE — fondo suave de baldosas e iconos (modo claro).
    static let soft = Color(red: 0.859, green: 0.918, blue: 0.996)
    /// #EFF6FF — tinte de superficie (fondos de pantalla de acceso).
    static let surface = Color(red: 0.937, green: 0.965, blue: 1.0)
    /// #3B82F6 — variante clara del primario para modo oscuro.
    static let light = Color(red: 0.231, green: 0.510, blue: 0.965)

    /// Primario que se aclara en modo oscuro (#2563EB / #3B82F6).
    static let adaptive = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.231, green: 0.510, blue: 0.965, alpha: 1)
            : UIColor(red: 0.145, green: 0.388, blue: 0.922, alpha: 1)
    })

    /// Fondo suave de baldosa: #DBEAFE en claro, azul translúcido en oscuro.
    static let softFill = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.231, green: 0.510, blue: 0.965, alpha: 0.22)
            : UIColor(red: 0.859, green: 0.918, blue: 0.996, alpha: 1)
    })
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
