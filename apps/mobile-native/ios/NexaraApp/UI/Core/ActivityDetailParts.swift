import SwiftUI

// Piezas del detalle de actividad v2 (`.ai/ui-maquetas/movil-actividad-ios.png`):
// cabecera con chips y título grande, tarjeta del sitio, lista de pasos de
// evidencia y el dock inferior. Colores con variante oscura (`NxSurface`, `NxBrand`).

/// Cabecera: tipo · estado · urgencia · despacho, título grande y folio.
struct ActivityHeaderV2: View {
    let titulo: String
    let folio: String
    let coreKind: String?
    let ticketTypeCustom: String?
    let estatus: String?
    let prioridad: String?
    let sesion: SesionActividad?
    let isDespacho: Bool

    private var estado: (label: String, color: Color) {
        if sesion?.enPausa == true { return ("En pausa", NxTone.warning.fg) }
        if sesion?.enCurso == true { return ("En curso", NxTone.info.fg) }
        let ui = CoreStatusUI.estatus(estatus)
        return (ui.label, ui.color ?? NxTone.neutral.fg)
    }

    var body: some View {
        let kindColor = NxBrand.category(coreKind)
        let priority = CoreStatusUI.priority(prioridad)
        VStack(alignment: .leading, spacing: NxSpacing.s) {
            CoreFlowLayout {
                CoreChip(
                    icon: CoreStatusUI.kindSymbol(coreKind),
                    text: CoreStatusUI.kind(coreKind, ticketTypeCustom: ticketTypeCustom),
                    color: kindColor
                )
                ActivityDotChip(text: estado.label, color: estado.color)
                if priority.label == "Urgente" {
                    CoreChip(icon: "flag.fill", text: priority.label, color: priority.color)
                }
                if isDespacho {
                    CoreChip(icon: "paperplane", text: "Despacho", color: NxBrand.categoryMagenta)
                }
            }
            Text(titulo.isEmpty ? "Actividad" : titulo)
                .font(.title2.weight(.bold))
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if !folio.isEmpty {
                Text("Folio \(folio)")
                    .font(.subheadline)
                    .foregroundStyle(NxSurface.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Chip con punto de color: el estado se lee por el punto y la palabra.
struct ActivityDotChip: View {
    let text: String
    let color: Color

    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(text).lineLimit(1)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(color)
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .background(color.opacity(0.12), in: Capsule())
    }
}

/// Dónde es el trabajo: cliente, sucursal y «Mapa» si hay coordenadas.
struct ActivityPlaceCardV2: View {
    let titulo: String
    let detalle: String
    let mapsURL: URL?
    @Environment(\.openURL) private var openURL

    var body: some View {
        HStack(spacing: NxSpacing.m) {
            Image(systemName: "mappin.and.ellipse")
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(NxTone.info.fg)
                .frame(width: 44, height: 44)
                .background(NxTone.info.bg, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo).font(.subheadline.weight(.bold)).lineLimit(1)
                if !detalle.isEmpty {
                    Text(detalle).font(.footnote).foregroundStyle(NxSurface.muted).lineLimit(2)
                }
            }
            Spacer(minLength: 0)
            if let mapsURL {
                Button {
                    openURL(mapsURL)
                } label: {
                    Label("Mapa", systemImage: "map")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(NxBrand.text)
                        .padding(.horizontal, 14)
                        .frame(minHeight: NxMetrics.minTap)
                        .background(NxBrand.softFill, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(NxSpacing.m)
        .background(NxSurface.card, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                .strokeBorder(NxSurface.border, lineWidth: 1)
        )
    }
}

/// Lista de pasos de evidencia: hecho · actual · pendiente, con avance arriba.
struct ActivityStepsCardV2: View {
    let pasos: [ActivityDockRules.Paso]
    let onOpen: () -> Void

    var body: some View {
        let hechos = ActivityDockRules.hechos(pasos)
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Pasos de evidencia").font(.headline)
                    Spacer()
                    Text("\(hechos) de \(pasos.count)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NxSurface.muted)
                }
                ProgressView(value: Double(hechos), total: Double(max(pasos.count, 1)))
                    .tint(NxBrand.primary)
            }
            .padding(.horizontal, NxSpacing.l)
            .padding(.top, 14)
            .padding(.bottom, NxSpacing.s)
            ForEach(Array(pasos.enumerated()), id: \.element.id) { index, paso in
                if index > 0 { Divider() }
                fila(paso)
            }
        }
        .background(NxSurface.card, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                .strokeBorder(NxSurface.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
    }

    private func fila(_ paso: ActivityDockRules.Paso) -> some View {
        let actual = paso.estado == .actual
        let hecho = paso.estado == .hecho
        return Button(action: onOpen) {
            HStack(spacing: NxSpacing.m) {
                ZStack {
                    RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                        .fill(hecho ? NxTone.success.bg : (actual ? NxBrand.primary : NxSurface.sunken))
                    if !hecho && !actual {
                        RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                            .strokeBorder(NxSurface.borderStrong, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                    }
                    Image(systemName: hecho ? "checkmark" : paso.systemImage)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(hecho ? NxTone.success.fg : (actual ? Color.white : NxSurface.muted))
                }
                .frame(width: 40, height: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(paso.label)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(hecho || actual ? Color.primary : Color.secondary)
                        .lineLimit(1)
                    Text(paso.detalle)
                        .font(.footnote)
                        .foregroundStyle(NxSurface.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if actual {
                    Text("Sigue")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(NxBrand.text)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 4)
                        .background(NxBrand.softFill, in: Capsule())
                } else {
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                }
            }
            .padding(.horizontal, NxSpacing.l)
            .padding(.vertical, NxSpacing.m)
            .background(actual ? NxBrand.softFill : Color.clear)
            .overlay(alignment: .leading) {
                if actual {
                    Rectangle().fill(NxBrand.primary).frame(width: 3)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityValue(paso.estado == .hecho ? "Hecho" : (actual ? "Paso actual" : "Pendiente"))
    }
}

/// Acción secundaria del dock (Pausar, Adjuntar…).
struct ActivityDockSecondary: Identifiable {
    let label: String
    let systemImage: String?
    var enabled: Bool = true
    let action: () -> Void
    var id: String { label }
}

/// Dock inferior fijo: botón principal de 56 pt al alcance del pulgar, las
/// secundarias en una fila debajo y una línea de ayuda. Va en `safeAreaInset`.
struct ActivityDockBar: View {
    let label: String
    var systemImage: String? = nil
    var enabled: Bool = true
    var loading: Bool = false
    var hint: String? = nil
    var error: String? = nil
    var secondary: [ActivityDockSecondary] = []
    let onPrimary: () -> Void

    var body: some View {
        VStack(spacing: NxSpacing.s) {
            Button(action: onPrimary) {
                HStack(spacing: NxSpacing.s) {
                    if loading {
                        ProgressView().tint(.white)
                    } else if let systemImage {
                        Image(systemName: systemImage)
                    }
                    Text(label).lineLimit(1).minimumScaleFactor(0.8)
                }
                .font(.headline)
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: NxMetrics.dockButtonHeight)
                .background(
                    enabled ? NxBrand.primary : Color.secondary.opacity(0.35),
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!enabled || loading)

            if !secondary.isEmpty {
                HStack(spacing: NxSpacing.s) {
                    ForEach(secondary) { item in
                        Button(action: item.action) {
                            HStack(spacing: 6) {
                                if let icon = item.systemImage { Image(systemName: icon) }
                                Text(item.label).lineLimit(1).minimumScaleFactor(0.8)
                            }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.primary)
                            .frame(maxWidth: .infinity, minHeight: NxMetrics.primaryButtonHeight)
                            .background(NxSurface.card, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                                    .strokeBorder(NxSurface.borderStrong, lineWidth: 1)
                            )
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(!item.enabled || loading)
                        .opacity(item.enabled ? 1 : 0.5)
                    }
                }
            }

            if let nota = error ?? hint, !nota.isEmpty {
                Text(nota)
                    .font(.footnote)
                    .foregroundStyle(error != nil ? CorePalette.red : NxSurface.muted)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, NxSpacing.l)
        .padding(.top, NxSpacing.m)
        .padding(.bottom, NxSpacing.s)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
    }
}

#Preview("Dock y pasos") {
    VStack(spacing: 16) {
        ActivityStepsCardV2(
            pasos: ActivityDockRules.pasos(flow: nil, coreKind: "servicio", fotosRequeridas: 4),
            onOpen: {}
        )
        Spacer()
        ActivityDockBar(
            label: "Tomar foto de entrada",
            systemImage: "camera",
            hint: "Paso 1 de 5",
            secondary: [ActivityDockSecondary(label: "Pausar", systemImage: "pause", action: {})],
            onPrimary: {}
        )
    }
    .padding(.top)
    .background(NxSurface.screen)
}
