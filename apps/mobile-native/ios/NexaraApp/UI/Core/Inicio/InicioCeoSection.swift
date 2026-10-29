import SwiftUI

/// Inicio de dirección general (canvas «App · Inicio CEO», 29-10). Espejo de
/// `InicioCeoSection.kt` de Android: la banda oscura con el equipo de hoy, «Requiere tu
/// atención», el desempeño de 7 días y «Para atender». Lo que no llegue no se pinta. Mismo
/// lenguaje que «Mi día»: banda #0D0F12 con resplandor, tarjetas blancas de radio 22 que
/// flotan y cifras en Inter Tight.
struct InicioCeoContenido: View {
    let ceo: CeoInicio
    let onPizarra: () -> Void
    /// Clave del renglón de «Requiere tu atención» (`InicioCeoRules.clave*`).
    let onPendiente: (String) -> Void
    let onDesempeno: () -> Void
    let onPersona: (Int) -> Void

    var body: some View {
        let ahora = Date()
        let equipo = ceo.equipo ?? []
        let pendientes = InicioCeoRules.pendientes(
            revisiones: ceo.revisiones,
            aprobaciones: ceo.aprobaciones,
            pagos: ceo.pagos,
            ahora: ahora
        )
        let atender = InicioCeoRules.paraAtender(equipo, ahora: ahora)
        VStack(alignment: .leading, spacing: 12) {
            if let hoy = InicioCeoRules.equipoHoy(equipo) {
                InicioCeoBanda(equipo: hoy, onPizarra: onPizarra)
            }
            if !pendientes.isEmpty {
                InicioCeoTitulo(texto: "Requiere tu atención")
                InicioCeoPendientesCard(pendientes: pendientes, onTap: onPendiente)
            }
            if let desempeno = InicioCeoRules.desempeno(ceo.kpis) {
                InicioCeoDesempenoCard(desempeno: desempeno, onTap: onDesempeno)
            }
            if !atender.isEmpty {
                InicioCeoTitulo(texto: "Para atender")
                InicioCeoAtenderCard(renglones: atender, onPersona: onPersona)
            }
        }
    }
}

// MARK: - Piezas

/// Título de sección del tablero (Android `Titulo`): 15 SemiBold.
private struct InicioCeoTitulo: View {
    let texto: String

    var body: some View {
        Text(texto)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(NxColors.fg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 4)
            .padding(.top, 2)
            .accessibilityAddTraits(.isHeader)
    }
}

/// La banda oscura (Android `EquipoHoyBanda`): «EN JORNADA» y «Pizarra ›», cuántos checaron
/// entrada en grande y tres cifras (Trabajando · Sin actividad · Atrasadas). Toda la banda
/// abre la pizarra.
private struct InicioCeoBanda: View {
    let equipo: InicioCeoRules.EquipoHoy
    let onPizarra: () -> Void

    private static let radio: CGFloat = 26
    private static let fondo = NxColors.rgb(0x0D0F12)
    /// Texto secundario sobre la banda (#C9CED8).
    private static let tenue = NxColors.rgb(0xC9CED8)

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Self.radio, style: .continuous)
        Button(action: onPizarra) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center, spacing: 8) {
                    Text("EN JORNADA")
                        .font(.system(size: 12, weight: .semibold))
                        .tracking(0.5)
                        .foregroundStyle(NxColors.rgb(0xB9BFCC))
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("Pizarra ›")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .lineLimit(1)
                }
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    Text("\(equipo.enJornada)")
                        .font(NxFont.display(size: 44))
                        .monospacedDigit()
                        .foregroundStyle(Color.white)
                        .lineLimit(1)
                    Text("de \(equipo.total) checaron entrada")
                        .font(.system(size: 15))
                        .foregroundStyle(Self.tenue)
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                }
                .accessibilityElement(children: .combine)
                HStack(alignment: .top, spacing: 8) {
                    InicioCeoCifra(n: equipo.trabajando, etiqueta: "Trabajando")
                    InicioCeoCifra(n: equipo.sinActividad, etiqueta: "Sin actividad")
                    InicioCeoCifra(
                        n: equipo.atrasadas,
                        etiqueta: "Atrasadas",
                        color: equipo.atrasadas > 0 ? NxColors.rgb(0xFFB27A) : Color.white
                    )
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background { InicioCeoResplandor(fondo: Self.fondo) }
            .clipShape(forma)
            // La sombra va fuera del recorte (si no, la corta la forma), como la banda de «Mi día».
            .background {
                forma
                    .fill(Self.fondo)
                    .shadow(color: NxColors.rgb(0x0D0F12, alpha: 0.35), radius: 18, x: 0, y: 12)
            }
            .contentShape(forma)
        }
        .buttonStyle(NxPressableStyle())
        .accessibilityHint("Abre la pizarra del equipo")
    }
}

/// Una cifra de la banda (Android `Cifra`): número en Inter Tight 22 y su etiqueta, sobre
/// una baldosa blanca al 8 %.
private struct InicioCeoCifra: View {
    let n: Int
    let etiqueta: String
    var color: Color = .white

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(n)")
                .font(NxFont.display(size: 22))
                .monospacedDigit()
                .foregroundStyle(color)
                .lineLimit(1)
            Text(etiqueta)
                .font(.system(size: 12))
                .foregroundStyle(NxColors.rgb(0xC9CED8))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(etiqueta): \(n)")
    }
}

/// Fondo casi negro de la banda con su resplandor (Android `drawBehind` de `EquipoHoyBanda`):
/// verde arriba a la derecha y azul abajo a la izquierda.
private struct InicioCeoResplandor: View {
    let fondo: Color

    var body: some View {
        GeometryReader { geo in
            let ancho = geo.size.width
            ZStack {
                fondo
                RadialGradient(
                    colors: [NxColors.rgb(0x10A183, alpha: 0.55), NxColors.rgb(0x10A183, alpha: 0)],
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

/// «Requiere tu atención»: un renglón por pendiente, con su número a la derecha.
private struct InicioCeoPendientesCard: View {
    let pendientes: [InicioCeoRules.Pendiente]
    let onTap: (String) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(pendientes.enumerated()), id: \.element.id) { index, p in
                if index > 0 { NxRowDivider() }
                Button { onTap(p.clave) } label: {
                    HStack(alignment: .center, spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.titulo)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(NxColors.fg)
                                .lineLimit(1)
                            Text(p.detalle)
                                .font(.system(size: 13))
                                .foregroundStyle(NxColors.muted)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .multilineTextAlignment(.leading)
                        Text("\(p.cuenta)")
                            .font(NxFont.display(size: 20))
                            .monospacedDigit()
                            .foregroundStyle(NxColors.fg)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 13)
                    .contentShape(Rectangle())
                }
                .buttonStyle(NxPressableStyle())
            }
        }
        .nxCardSurface(radius: 22)
    }
}

/// «Desempeño · 7 días»: el anillo del cumplimiento y dos renglones; abre los KPI del equipo.
private struct InicioCeoDesempenoCard: View {
    let desempeno: InicioCeoRules.Desempeno
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .center, spacing: 16) {
                InicioCeoAnillo(pct: desempeno.cumplimientoPct)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Desempeño · 7 días")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                    ForEach(desempeno.renglones, id: \.self) { renglon in
                        Text(renglon)
                            .font(.system(size: 13))
                            .foregroundStyle(NxColors.fg2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .multilineTextAlignment(.leading)
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.fg4)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .nxCardSurface(radius: 22)
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
    }
}

/// Anillo de 76 con trazo de 8 (Android `Anillo`): pista #EEF0F4 y el avance en el verde de
/// marca desde las 12; el porcentaje al centro, o «—» sin entregas que medir.
private struct InicioCeoAnillo: View {
    let pct: Int?

    var body: some View {
        ZStack {
            Circle()
                .stroke(NxColors.borderSubtle, lineWidth: 8)
                .padding(4)
            if let pct, pct > 0 {
                Circle()
                    .trim(from: 0, to: CGFloat(min(pct, 100)) / 100)
                    .stroke(NxColors.brand, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .padding(4)
            }
            Text(pct.map { "\($0) %" } ?? "—")
                .font(NxFont.display(size: 16))
                .monospacedDigit()
                .foregroundStyle(NxColors.fg)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(width: 76, height: 76)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(pct.map { "Cumplimiento \($0) %" } ?? "Cumplimiento sin entregas que medir")
    }
}

/// «Para atender»: hasta cuatro personas con el punto de su grupo; cada una abre su ficha.
private struct InicioCeoAtenderCard: View {
    let renglones: [InicioCeoRules.Atender]
    let onPersona: (Int) -> Void

    private func color(_ grupo: String) -> Color {
        switch grupo {
        case "atrasados": return NxColors.rojo
        case "sin-nada": return NxColors.naranja
        default: return NxColors.fg4
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(renglones.enumerated()), id: \.element.id) { index, r in
                if index > 0 { NxRowDivider() }
                Button { onPersona(r.personaId) } label: {
                    HStack(alignment: .center, spacing: 12) {
                        Circle()
                            .fill(color(r.grupo))
                            .frame(width: 8, height: 8)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.titulo)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(NxColors.fg)
                                .lineLimit(1)
                            if let detalle = r.detalle {
                                Text(detalle)
                                    .font(.system(size: 13))
                                    .foregroundStyle(NxColors.muted)
                                    .lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .multilineTextAlignment(.leading)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .contentShape(Rectangle())
                }
                .buttonStyle(NxPressableStyle())
            }
        }
        .nxCardSurface(radius: 22)
    }
}
