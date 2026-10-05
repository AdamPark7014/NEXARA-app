import SwiftUI

/// Piezas de Material 3 que usan Gastos y Aprobaciones y que la base de la fase A
/// todavía no tiene: el campo con contorno y etiqueta flotante
/// (`OutlinedTextField` / `NxFormTextField`), el campo de importe de Viáticos
/// (`CampoImporte`), el chip de opción (`FilterChip`), los botones de píldora
/// (`Button` / `OutlinedButton` / `TextButton`), la cinta `NxSnackbarHost` y una
/// fila con pesos (`Modifier.weight`). Medidas y colores salen del tema de
/// Android (`ui/theme/Theme.kt`): contorno #CBD5E1, foco de marca de 2, radio 6
/// de los campos, `secondaryContainer` #CFECE4 en el chip elegido.

// MARK: - Campo con contorno

/// `OutlinedTextField` de Material 3: contorno de 1 (#CBD5E1), 2 de marca con
/// foco, radio 6, etiqueta que flota sobre el borde al escribir y texto de
/// ayuda o de error debajo.
struct FinanzasCampoContorno: View {
    let etiqueta: String
    @Binding var texto: String
    var placeholder: String? = nil
    var error: String? = nil
    var ayuda: String? = nil
    var multilinea: Bool = false
    var lineasMinimas: Int = 1
    var habilitado: Bool = true
    /// Color de lo que hay detrás: la etiqueta flotante lo usa para «cortar» el borde.
    var fondo: Color = NxColors.card

    @FocusState private var foco: Bool

    private var flotante: Bool { foco || !texto.isEmpty }

    private var colorBorde: Color {
        if error != nil { return NxColors.danger }
        return foco ? NxColors.brand : NxColors.borderStrong
    }

    private var colorEtiqueta: Color {
        if error != nil { return NxColors.danger }
        return foco ? NxColors.brand : NxColors.fg2
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack(alignment: .topLeading) {
                campo
                    .font(NxType.bodyLarge)
                    .foregroundStyle(NxColors.fg)
                    .tint(NxColors.brand)
                    .focused($foco)
                    .disabled(!habilitado)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 16)
                    .frame(maxWidth: .infinity, minHeight: 56, alignment: .topLeading)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .strokeBorder(colorBorde, lineWidth: foco || error != nil ? 2 : 1)
                    )
                etiquetaFlotante
            }
            .contentShape(Rectangle())
            .onTapGesture { if habilitado { foco = true } }
            .opacity(habilitado ? 1 : 0.6)
            .animation(.easeOut(duration: 0.15), value: flotante)

            if let error {
                Text(error)
                    .font(.system(size: 12))
                    .foregroundStyle(NxColors.danger)
                    .padding(.horizontal, 16)
                    .fixedSize(horizontal: false, vertical: true)
            } else if let ayuda, !ayuda.isEmpty {
                Text(ayuda)
                    .font(.system(size: 12))
                    .foregroundStyle(NxColors.fg2)
                    .padding(.horizontal, 16)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var campo: some View {
        let prompt = flotante ? placeholder.map { Text($0).foregroundColor(NxColors.muted) } : nil
        if multilinea {
            TextField("", text: $texto, prompt: prompt, axis: .vertical)
                .lineLimit(max(lineasMinimas, 1)...max(lineasMinimas, 6))
                .accessibilityLabel(etiqueta)
        } else {
            TextField("", text: $texto, prompt: prompt)
                .accessibilityLabel(etiqueta)
        }
    }

    @ViewBuilder
    private var etiquetaFlotante: some View {
        if flotante {
            Text(etiqueta)
                .font(.system(size: 12))
                .foregroundStyle(colorEtiqueta)
                .lineLimit(1)
                .padding(.horizontal, 4)
                .background(fondo)
                .offset(x: 12, y: -7)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        } else {
            Text(etiqueta)
                .font(NxType.bodyLarge)
                .foregroundStyle(colorEtiqueta)
                .lineLimit(1)
                .padding(.leading, 16)
                .padding(.top, 16)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

// MARK: - Campo de importe

/// `CampoImporte` de Android (Viáticos y Gastos): contorno con «$» de 20 Bold
/// gris a la izquierda, cifra de 22 Bold alineada a la derecha, 64 de alto y
/// teclado numérico. Guarda el texto **sin formato** (dígitos y un punto) y
/// solo pinta las comas de millares.
struct FinanzasCampoImporte: View {
    let etiqueta: String
    @Binding var crudo: String
    var ayuda: String? = nil
    var error: String? = nil
    var habilitado: Bool = true
    var fondo: Color = NxColors.card

    @FocusState private var foco: Bool

    private var texto: Binding<String> {
        Binding(
            get: { Dinero.formatearEntrada(crudo) },
            set: { crudo = Dinero.sanitizarEntrada($0) }
        )
    }

    private var colorBorde: Color {
        if error != nil { return NxColors.danger }
        return foco ? NxColors.brand : NxColors.borderStrong
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack(alignment: .topLeading) {
                HStack(spacing: 8) {
                    Text("$")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(NxColors.muted)
                        .accessibilityHidden(true)
                    TextField("", text: texto, prompt: Text("0.00").foregroundColor(NxColors.fg4))
                        .keyboardType(.decimalPad)
                        .font(.system(size: 22, weight: .bold).monospacedDigit())
                        .foregroundStyle(NxColors.fg)
                        .multilineTextAlignment(.trailing)
                        .tint(NxColors.brand)
                        .focused($foco)
                        .disabled(!habilitado)
                        .accessibilityLabel(etiqueta)
                        .accessibilityValue(Dinero.parsearCentavos(crudo).map { Dinero.pesos($0) } ?? "sin capturar")
                }
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity, minHeight: 64)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(colorBorde, lineWidth: foco || error != nil ? 2 : 1)
                )

                Text(etiqueta)
                    .font(.system(size: 12))
                    .foregroundStyle(error != nil ? NxColors.danger : (foco ? NxColors.brand : NxColors.fg2))
                    .padding(.horizontal, 4)
                    .background(fondo)
                    .offset(x: 12, y: -7)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
            .onTapGesture { if habilitado { foco = true } }
            .opacity(habilitado ? 1 : 0.6)

            if let error {
                Text(error)
                    .font(.system(size: 12))
                    .foregroundStyle(NxColors.danger)
                    .padding(.horizontal, 16)
            } else if let ayuda, !ayuda.isEmpty {
                Text(ayuda)
                    .font(.system(size: 12))
                    .foregroundStyle(NxColors.fg2)
                    .padding(.horizontal, 16)
            }
        }
    }
}

// MARK: - Chip de opción

/// `FilterChip` de Material 3: radio 8, contorno #CBD5E1 y letra gris; elegido,
/// relleno #CFECE4 (`secondaryContainer`) con letra #0F5F4F y sin contorno.
struct FinanzasChip: View {
    let texto: String
    let elegido: Bool
    var habilitado: Bool = true
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            Text(texto)
                .font(NxType.labelLarge)
                .foregroundStyle(elegido ? NxColors.brandDeep : NxColors.fg2)
                .lineLimit(1)
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .background(
                    RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous)
                        .fill(elegido ? NxColors.brandSoft2 : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous)
                        .strokeBorder(elegido ? Color.clear : NxColors.borderStrong, lineWidth: 1)
                )
                .contentShape(RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!habilitado)
        .opacity(habilitado ? 1 : 0.5)
        .accessibilityAddTraits(elegido ? AccessibilityTraits.isSelected : [])
    }
}

// MARK: - Botones

/// Botones de Material 3 con el alto que pide cada pantalla: lleno de marca
/// (`Button`), con contorno (`OutlinedButton`) o solo texto (`TextButton`).
/// `radio == nil` es la píldora por omisión de Material 3.
struct FinanzasBotonEstilo: ButtonStyle {
    enum Tipo { case lleno, contorno, texto }

    var tipo: Tipo
    var alto: CGFloat = 48
    var radio: CGFloat? = nil
    var tinta: Color = NxColors.brand
    /// Color de la letra del contorno o del texto (por omisión, la tinta).
    var letra: Color? = nil

    func makeBody(configuration: Configuration) -> some View {
        FinanzasBotonCuerpo(configuration: configuration, estilo: self)
    }
}

private struct FinanzasBotonCuerpo: View {
    let configuration: ButtonStyleConfiguration
    let estilo: FinanzasBotonEstilo
    @Environment(\.isEnabled) private var habilitado

    private var forma: AnyShape {
        if let radio = estilo.radio {
            return AnyShape(RoundedRectangle(cornerRadius: radio, style: .continuous))
        }
        return AnyShape(Capsule())
    }

    private var colorLetra: Color {
        guard habilitado else { return NxColors.fg.opacity(0.38) }
        switch estilo.tipo {
        case .lleno: return .white
        case .contorno, .texto: return estilo.letra ?? estilo.tinta
        }
    }

    private var relleno: Color {
        switch estilo.tipo {
        case .lleno: return habilitado ? estilo.tinta : NxColors.fg.opacity(0.12)
        case .contorno, .texto: return .clear
        }
    }

    var body: some View {
        configuration.label
            .foregroundStyle(colorLetra)
            .lineLimit(1)
            .padding(.horizontal, 20)
            .frame(maxWidth: .infinity, minHeight: estilo.alto)
            .background(relleno, in: forma)
            .overlay {
                if estilo.tipo == .contorno {
                    forma.stroke(habilitado ? NxColors.borderStrong : NxColors.fg.opacity(0.12), lineWidth: 1)
                }
            }
            .contentShape(forma)
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

// MARK: - Cinta de aviso

/// `NxSnackbarHost` de Android: fondo #0F172A, letra blanca de 14, radio 16.
struct FinanzasSnackbar: View {
    let mensaje: String

    var body: some View {
        Text(mensaje)
            .font(NxType.bodyMedium)
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(NxColors.fg, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
            .nxElevation(6)
            .padding(.horizontal, 12)
            .accessibilityAddTraits(.updatesFrequently)
    }
}

// MARK: - Fila con pesos

/// `Row` con `Modifier.weight(...)`: reparte el ancho en proporción a los pesos
/// (lo que sobra tras los espacios) y alinea arriba.
struct FinanzasFilaPonderada: Layout {
    var pesos: [CGFloat]
    var espacio: CGFloat = 0

    private func anchos(_ total: CGFloat, _ cuantos: Int) -> [CGFloat] {
        guard cuantos > 0 else { return [] }
        let ps = (0..<cuantos).map { $0 < pesos.count ? max(pesos[$0], 0.0001) : 1 }
        let suma = ps.reduce(0, +)
        let libre = max(0, total - espacio * CGFloat(cuantos - 1))
        return ps.map { libre * $0 / suma }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let ideal = subviews.reduce(CGFloat(0)) { $0 + $1.sizeThatFits(.unspecified).width }
            + espacio * CGFloat(max(subviews.count - 1, 0))
        let ancho = proposal.width ?? ideal
        let ws = anchos(ancho, subviews.count)
        var alto: CGFloat = 0
        for (i, subview) in subviews.enumerated() {
            alto = max(alto, subview.sizeThatFits(ProposedViewSize(width: ws[i], height: nil)).height)
        }
        return CGSize(width: ancho, height: alto)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let ws = anchos(bounds.width, subviews.count)
        var x = bounds.minX
        for (i, subview) in subviews.enumerated() {
            subview.place(
                at: CGPoint(x: x, y: bounds.minY),
                anchor: .topLeading,
                proposal: ProposedViewSize(width: ws[i], height: bounds.height)
            )
            x += ws[i] + espacio
        }
    }
}
