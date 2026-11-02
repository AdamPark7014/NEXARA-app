import SwiftUI
import UIKit

/// Las piezas de «Cargar gasolina» y «Regreso del vehículo» (mockups `AppGasolina` y
/// `AppRegreso` del 01-11-2026, artifact 2DNGd9xCSM7fG9zAfBPijs): tarjetas sin sombra, campos
/// con la etiqueta arriba y las casillas oscuras de foto. Mismas medidas que `PiezasVehiculo.kt`.
enum ColoresVehiculo {
    static let fondoFoto = NxColors.rgb(0x0C1720)
    static let iconoFoto = NxColors.rgb(0x7FE3CB)
    static let pieFoto = NxColors.rgb(0xC9D6DC)
}

private let radioCampo: CGFloat = 10
private let radioTarjeta: CGFloat = 14

struct EncabezadoVehiculo: View {
    let titulo: String
    let lineas: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(titulo)
                .font(NxFont.display(size: 24, weight: .semibold))
                .tracking(-0.36)
                .foregroundStyle(NxColors.fg)
                .padding(.bottom, 2)
            ForEach(lineas, id: \.self) { linea in
                Text(linea)
                    .font(.system(size: 14))
                    .foregroundStyle(NxColors.fg2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct TarjetaVehiculo<Contenido: View>: View {
    let contenido: Contenido

    init(@ViewBuilder contenido: () -> Contenido) {
        self.contenido = contenido()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            contenido
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: radioTarjeta, style: .continuous))
    }
}

/// «Esto leímos en las fotos», o lo que toque según vaya la lectura.
struct RotuloLectura: View {
    let texto: String
    let leyendo: Bool

    var body: some View {
        HStack(spacing: 6) {
            if leyendo {
                ProgressView()
                    .controlSize(.mini)
                    .tint(NxColors.brandText)
            }
            Text(texto)
                .font(.system(size: 13.5, weight: .medium))
                .foregroundStyle(NxColors.brandText)
        }
    }
}

private struct EtiquetaDeCampo: View {
    let texto: String

    var body: some View {
        Text(texto)
            .font(.system(size: 13))
            .foregroundStyle(NxColors.fg2)
    }
}

/// Campo con la etiqueta arriba, alto de 48 y contorno fino, como el mockup.
struct CampoVehiculo: View {
    let etiqueta: String
    @Binding var texto: String
    var teclado: UIKeyboardType = .numberPad
    var prefijo: String? = nil
    var tamano: CGFloat = 15
    var negrita: Bool = false
    var habilitado: Bool = true

    @FocusState private var enfocado: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            EtiquetaDeCampo(texto: etiqueta)
            HStack(spacing: 0) {
                if let prefijo, !texto.isEmpty {
                    Text(prefijo)
                }
                TextField("", text: $texto)
                    .keyboardType(teclado)
                    .focused($enfocado)
                    .disabled(!habilitado)
                    .accessibilityLabel(etiqueta)
            }
            .font(.system(size: tamano, weight: negrita ? .semibold : .regular))
            .foregroundStyle(NxColors.fg)
            .tint(NxColors.brand)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .overlay {
                RoundedRectangle(cornerRadius: radioCampo, style: .continuous)
                    .strokeBorder(enfocado ? NxColors.brand : NxColors.borderStrong, lineWidth: enfocado ? 2 : 1)
            }
            .contentShape(Rectangle())
            .onTapGesture { if habilitado { enfocado = true } }
        }
    }
}

/// Celda de «Total» de quien no ve costos: dice que ya está, sin decir cuánto.
struct CampoSinImporte: View {
    let etiqueta: String
    let texto: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            EtiquetaDeCampo(texto: etiqueta)
            Text(texto)
                .font(.system(size: 13.5))
                .foregroundStyle(NxColors.fg2)
                .padding(.horizontal, 12)
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .background(NxColors.sunken, in: RoundedRectangle(cornerRadius: radioCampo, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: radioCampo, style: .continuous)
                        .strokeBorder(NxColors.borderStrong, lineWidth: 1)
                }
        }
    }
}

/// El nivel se elige de la lista: el API solo acepta `E`, `1/4`, `1/2`, `3/4` y `F`.
struct CampoNivelGasolina: View {
    @Binding var nivel: NivelCombustible?
    var habilitado: Bool = true
    var onCambio: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            EtiquetaDeCampo(texto: "Gasolina")
            Menu {
                ForEach(NivelCombustible.allCases) { opcion in
                    Button(GasolinaRules.textoNivel(opcion)) {
                        nivel = opcion
                        onCambio()
                    }
                }
            } label: {
                HStack {
                    Text(nivel == nil ? "Elegir nivel" : GasolinaRules.textoNivel(nivel))
                        .font(.system(size: 15))
                        .foregroundStyle(nivel == nil ? NxColors.fg2 : NxColors.fg)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(NxColors.fg2)
                }
                .padding(.horizontal, 12)
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .contentShape(Rectangle())
                .overlay {
                    RoundedRectangle(cornerRadius: radioCampo, style: .continuous)
                        .strokeBorder(NxColors.borderStrong, lineWidth: 1)
                }
            }
            .disabled(!habilitado)
            .accessibilityLabel("Gasolina")
            .accessibilityValue(GasolinaRules.textoNivel(nivel))
        }
    }
}

/// Casilla oscura para tomar una foto. Con foto, la foto llena la casilla y el pie va encima de
/// un degradado; así se lee igual sobre un tablero oscuro que sobre un ticket blanco.
struct CasillaFotoVehiculo: View {
    let etiqueta: String
    /// Símbolo del sistema de la casilla vacía.
    let icono: String
    let foto: UIImage?
    let leyendo: Bool
    let alto: CGFloat
    var tamanoIcono: CGFloat = 24
    var pie: String? = nil
    var habilitada: Bool = true
    let onTomar: () -> Void

    var body: some View {
        Button(action: onTomar) {
            ZStack(alignment: .bottom) {
                ColoresVehiculo.fondoFoto
                if let foto {
                    Image(uiImage: foto)
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: .infinity)
                        .frame(height: alto)
                        .clipped()
                    LinearGradient(
                        stops: [
                            .init(color: .clear, location: 0.45),
                            .init(color: ColoresVehiculo.fondoFoto.opacity(0.92), location: 1),
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    textos.padding(.horizontal, 10).padding(.vertical, 8)
                } else {
                    VStack(spacing: 4) {
                        Image(systemName: icono)
                            .font(.system(size: tamanoIcono, weight: .regular))
                            .foregroundStyle(ColoresVehiculo.iconoFoto)
                        textos
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: alto)
            .overlay(alignment: .topTrailing) {
                if leyendo {
                    ProgressView()
                        .controlSize(.small)
                        .tint(ColoresVehiculo.iconoFoto)
                        .padding(10)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: radioTarjeta, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: radioTarjeta, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
        .disabled(!habilitada)
        .accessibilityLabel(etiqueta)
        .accessibilityHint(foto == nil ? "Tomar foto" : "Repetir foto")
        .accessibilityIdentifier(etiqueta)
    }

    private var textos: some View {
        VStack(spacing: 4) {
            Text(etiqueta)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Color.white)
            if let pie {
                Text(pie)
                    .font(.system(size: 13))
                    .foregroundStyle(ColoresVehiculo.pieFoto)
            }
        }
        .multilineTextAlignment(.center)
    }
}

/// La acción de la pantalla: alto de 52 y esquinas de 12, como el mockup.
struct BotonVehiculo: View {
    let texto: String
    var habilitado: Bool = true
    var enviando: Bool = false
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            HStack(spacing: 8) {
                if enviando { SpinnerDeBoton() }
                Text(texto)
                    .font(.system(size: 15, weight: .semibold))
            }
            .foregroundStyle(habilitado ? Color.white : NxColors.fg.opacity(0.38))
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(
                habilitado ? NxColors.brand : NxColors.fg.opacity(0.12),
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
        .disabled(!habilitado)
    }
}

/// Un aviso de la lectura, sin tumbar nada: lo demás se captura a mano.
struct AvisoLectura: View {
    let texto: String

    var body: some View {
        Text(texto)
            .font(.system(size: 13))
            .foregroundStyle(NxColors.warningText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NxColors.warningSoft, in: RoundedRectangle(cornerRadius: radioCampo, style: .continuous))
    }
}

/// Cierra el teclado numérico, que no trae tecla de listo.
func cerrarTeclado() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
}
