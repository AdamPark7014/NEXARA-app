import SwiftUI

// Días festivos en «Mi día» (mockup aprobado el 29-10). Espejo de `FestivoSection.kt` de
// Android: `FestivoDescansaContenido` (quien descansa) y `FestivoLaboraTarjeta` (a quien le
// toca laborar). Los textos salen de `FestivoRules`.

/// Colores del mockup de festivos.
private enum FestivoColor {
    /// Naranja de «festivo trabajado» (tablero «App · a quien le toca laborar»).
    static let trabajadoFondo = NxColors.rgb(0xFDF0E1)
    static let trabajadoTexto = NxColors.rgb(0x8A4A00)
    /// Fondo casi negro de la banda y del círculo de la nota.
    static let banda = NxColors.rgb(0x0D0F12)
    /// Texto secundario sobre la banda.
    static let tenue = NxColors.rgb(0xD7DBE3)
}

/// «Hoy descansas»: la banda oscura con el festivo, el siguiente día de trabajo y los próximos
/// festivos. Sustituye a la tarjeta de la jornada: ese día no se checa.
struct FestivoDescansaContenido: View {
    let festivos: FestivosMio

    var body: some View {
        if let hoy = festivos.festivoHoy {
            VStack(alignment: .leading, spacing: 12) {
                FestivoDescansaBanda(festivo: hoy)
                if let dia = FestivoRules.dia(festivos.hoy),
                   let siguiente = FestivoRules.siguienteDiaDeTrabajo(festivos) {
                    FestivoSiguienteDiaTarjeta(hoy: dia, siguiente: siguiente)
                }
                FestivoProximosTarjeta(proximos: FestivoRules.proximos(festivos))
            }
        }
    }
}

/// «Hoy te toca de 10:00 a 14:00»: el festivo trabajado con su horario y, mientras no haya
/// entrada, el botón de checar (la misma checada con foto y ubicación de la tarjeta de la
/// jornada: quien la usa le pasa el mismo `onMark("entrada")`).
struct FestivoLaboraTarjeta: View {
    let festivo: Festivo
    /// nil = sin botón (ya checó entrada, o su rol no checa).
    let onEntrada: (() -> Void)?
    var loading: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            FestivoTarjeta(radio: NxRadius.xl, relleno: 20) {
                VStack(alignment: .leading, spacing: 14) {
                    FestivoChip(
                        texto: FestivoRules.chip(festivo, estado: .labora),
                        fondo: FestivoColor.trabajadoFondo,
                        color: FestivoColor.trabajadoTexto
                    )
                    VStack(alignment: .leading, spacing: 4) {
                        Text(FestivoRules.tituloLabora(festivo))
                            .font(NxFont.display(size: 28))
                            .tracking(-0.4)
                            .foregroundStyle(NxColors.fg)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                        if let texto = FestivoRules.textoLabora(festivo) {
                            Text(texto)
                                .font(.system(size: 14))
                                .lineSpacing(4)
                                .foregroundStyle(NxColors.fg2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    let cifras = FestivoRules.cifras(festivo)
                    if !cifras.isEmpty {
                        HStack(alignment: .top, spacing: 8) {
                            ForEach(cifras, id: \.etiqueta) { cifra in
                                FestivoCifraBaldosa(cifra: cifra)
                            }
                        }
                    }
                    if let onEntrada {
                        FestivoBotonEntrada(loading: loading, action: onEntrada)
                    }
                }
            }
            if let nota = FestivoRules.nota(festivo) {
                FestivoTarjeta {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "megaphone")
                            .font(.system(size: 15, weight: .regular))
                            .foregroundStyle(Color.white)
                            .frame(width: 34, height: 34)
                            .background(FestivoColor.banda, in: Circle())
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Nota de dirección")
                                .font(.system(size: 13))
                                .foregroundStyle(NxColors.muted)
                            Text(nota)
                                .font(.system(size: 14))
                                .lineSpacing(4)
                                .foregroundStyle(NxColors.fg2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}

// MARK: - Piezas

/// La banda oscura de «Hoy descansas»: chip blanco translúcido, el título en Inter Tight 30 y
/// el texto del descanso pagado, sobre #0D0F12 con su aurora.
private struct FestivoDescansaBanda: View {
    let festivo: Festivo

    private static let radio: CGFloat = 24

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Self.radio, style: .continuous)
        VStack(alignment: .leading, spacing: 12) {
            FestivoChip(
                texto: FestivoRules.chip(festivo, estado: .descansa),
                fondo: Color.white.opacity(0.14),
                color: Color.white
            )
            Text(FestivoRules.tituloDescansa)
                .font(NxFont.display(size: 30))
                .tracking(-0.5)
                .foregroundStyle(Color.white)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(FestivoRules.textoDescansa)
                .font(.system(size: 14))
                .lineSpacing(4)
                .foregroundStyle(FestivoColor.tenue)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background { FestivoResplandor() }
        .clipShape(forma)
        // La sombra va fuera del recorte (si no, la corta la forma), como la banda de «Mi día».
        .background {
            forma
                .fill(FestivoColor.banda)
                .shadow(color: NxColors.rgb(0x0D0F12, alpha: 0.35), radius: 18, x: 0, y: 12)
        }
    }
}

/// Fondo de la banda con su aurora (Android `drawBehind` de `FestivoDescansaBanda`): verde de
/// marca arriba a la derecha y azul abajo a la izquierda.
private struct FestivoResplandor: View {
    var body: some View {
        GeometryReader { geo in
            let ancho = geo.size.width
            ZStack {
                FestivoColor.banda
                RadialGradient(
                    colors: [NxColors.rgb(0x168570, alpha: 0.6), NxColors.rgb(0x168570, alpha: 0)],
                    center: .topTrailing,
                    startRadius: 0,
                    endRadius: ancho * 0.85
                )
                RadialGradient(
                    colors: [NxColors.rgb(0x0060F0, alpha: 0.45), NxColors.rgb(0x0060F0, alpha: 0)],
                    center: UnitPoint(x: 0, y: 1.2),
                    startRadius: 0,
                    endRadius: ancho * 0.75
                )
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// «Siguiente día de trabajo»: la baldosa del día (mes, número y día de la semana) y
/// «Vuelves mañana» / «Vuelves el lunes».
private struct FestivoSiguienteDiaTarjeta: View {
    let hoy: Date
    let siguiente: Date

    var body: some View {
        FestivoTarjeta {
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .center, spacing: 0) {
                    Text(FestivoRules.mesCorto(siguiente))
                        .font(.system(size: 11, weight: .bold))
                    Text(verbatim: String(FestivoRules.diaDelMes(siguiente)))
                        .font(NxFont.display(size: 19))
                        .monospacedDigit()
                    Text(FestivoRules.diaSemanaCorto(siguiente))
                        .font(.system(size: 11))
                }
                .foregroundStyle(NxColors.brandText)
                .lineLimit(1)
                .frame(width: 48, height: 52)
                .background(NxColors.brandSoft, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Siguiente día de trabajo")
                        .font(.system(size: 13))
                        .foregroundStyle(NxColors.muted)
                    Text(FestivoRules.vuelves(hoy: hoy, siguiente: siguiente))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// «Próximos festivos»: un renglón por festivo con su día, su nombre y si le toca laborarlo.
private struct FestivoProximosTarjeta: View {
    let proximos: [FestivoRules.Proximo]

    var body: some View {
        if !proximos.isEmpty {
            FestivoTarjeta {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Próximos festivos")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(NxColors.fg2)
                        .accessibilityAddTraits(.isHeader)
                    ForEach(Array(proximos.enumerated()), id: \.offset) { _, p in
                        HStack(alignment: .center, spacing: 10) {
                            Text(p.dia)
                                .font(.system(size: 14))
                                .foregroundStyle(NxColors.muted)
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                                .frame(width: 76, alignment: .leading)
                            Text(p.nombre)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(NxColors.fg)
                                .lineLimit(2)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            FestivoChip(
                                texto: p.como,
                                fondo: p.labora ? FestivoColor.trabajadoFondo : NxColors.sunken,
                                color: p.labora ? FestivoColor.trabajadoTexto : NxColors.fg2,
                                chico: true
                            )
                            .fixedSize()
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
    }
}

/// Entrada, salida o jornada del festivo trabajado: etiqueta 12 gris y la cifra en Inter Tight 18,
/// sobre la superficie hundida.
private struct FestivoCifraBaldosa: View {
    let cifra: FestivoRules.Cifra

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(cifra.etiqueta)
                .font(.system(size: 12))
                .foregroundStyle(NxColors.muted)
                .lineLimit(1)
            Text(cifra.valor)
                .font(NxFont.display(size: 18))
                .monospacedDigit()
                .foregroundStyle(NxColors.fg)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.sunken, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// «Checar entrada»: botón verde de 52 y radio 16 al ancho de la tarjeta.
private struct FestivoBotonEntrada: View {
    let loading: Bool
    let action: () -> Void

    private var forma: RoundedRectangle { RoundedRectangle(cornerRadius: 16, style: .continuous) }

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 10) {
                if loading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(Color.white)
                        .frame(width: 20, height: 20)
                } else {
                    Image(systemName: "rectangle.portrait.and.arrow.forward")
                        .font(.system(size: 17, weight: .medium))
                        .frame(width: 20, height: 20)
                        .accessibilityHidden(true)
                    Text("Checar entrada")
                        .font(.system(size: 16, weight: .semibold))
                        .lineLimit(1)
                }
            }
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity, minHeight: NxMetrics.primaryButtonHeight)
            .background(NxColors.brand.opacity(loading ? 0.7 : 1), in: forma)
            .contentShape(forma)
        }
        .buttonStyle(NxPressableStyle())
        .disabled(loading)
        .accessibilityLabel(loading ? "Registrando" : "Checar entrada")
        .accessibilityIdentifier("festivo-checar-entrada")
    }
}

/// Tarjeta blanca que flota (Android `Tarjeta` de `FestivoSection.kt`): radio 20, relleno
/// 18 × 16 por omisión.
private struct FestivoTarjeta<Contenido: View>: View {
    private let radio: CGFloat
    private let relleno: CGFloat
    private let contenido: Contenido

    init(radio: CGFloat = NxRadius.l, relleno: CGFloat = 16, @ViewBuilder contenido: () -> Contenido) {
        self.radio = radio
        self.relleno = relleno
        self.contenido = contenido()
    }

    var body: some View {
        contenido
            .padding(.horizontal, relleno + 2)
            .padding(.vertical, relleno)
            .frame(maxWidth: .infinity, alignment: .leading)
            .nxCardSurface(radius: radio)
    }
}

/// Pastilla de texto 12 SemiBold.
private struct FestivoChip: View {
    let texto: String
    let fondo: Color
    let color: Color
    var chico: Bool = false

    var body: some View {
        Text(texto)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, chico ? 9 : 10)
            .padding(.vertical, chico ? 3 : 4)
            .background(fondo, in: Capsule())
    }
}
