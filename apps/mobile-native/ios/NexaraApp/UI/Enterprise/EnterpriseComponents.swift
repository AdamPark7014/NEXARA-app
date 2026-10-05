import SwiftUI
import UIKit

// MARK: - Enterprise design system (paridad Android `ui/enterprise/EnterpriseComponents.kt`)

/// Tono semántico. Mismos colores que `NxTone.fg()` / `NxTone.bg()` de Android:
/// el texto o el icono van en `fg` y el fondo suave en `bg` (no una opacidad
/// calculada: los suaves de Android son colores propios).
enum NxTone {
    case neutral, success, warning, danger, info, brand

    var fg: Color {
        switch self {
        case .neutral: return NxColors.muted
        case .success: return NxColors.success
        case .warning: return NxColors.warning
        case .danger:  return NxColors.danger
        case .info:    return NxColors.info
        case .brand:   return NxColors.brand
        }
    }

    var bg: Color {
        switch self {
        case .neutral: return NxColors.sunken
        case .success: return NxColors.successSoft
        case .warning: return NxColors.warningSoft
        case .danger:  return NxColors.dangerSoft
        case .info:    return NxColors.infoSoft
        case .brand:   return NxColors.brandSoft
        }
    }

    var systemImage: String {
        switch self {
        case .neutral: return "info.circle.fill"
        case .success: return "checkmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .danger:  return "xmark.octagon.fill"
        case .info:    return "info.circle.fill"
        case .brand:   return "sparkles"
        }
    }
}

struct NxKpi: Identifiable {
    let id = UUID()
    var label: String
    var value: String
    var hint: String? = nil
    var delta: String? = nil
    var tone: NxTone = .brand
    var sparkline: [CGFloat] = []
}

struct NxAlert: Identifiable {
    let id: String
    var title: String
    var subtitle: String? = nil
    var tone: NxTone = .warning
}

/// Encabezado de sección (Android `NxSectionHeader`): título 16 Bold, subtítulo
/// 12,5 gris y, si se da, algo a la derecha (un botón, una cuenta).
struct NxSectionHeader<Trailing: View>: View {
    let title: String
    var subtitle: String? = nil
    let trailing: Trailing

    init(title: String, subtitle: String? = nil, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.subtitle = subtitle
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .center, spacing: NxSpacing.s) {
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .accessibilityAddTraits(.isHeader)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing
        }
    }
}

extension NxSectionHeader where Trailing == EmptyView {
    init(title: String, subtitle: String? = nil) {
        self.init(title: title, subtitle: subtitle, trailing: { EmptyView() })
    }
}

/// Tarjeta de cifra (Android `NxKpiCard`): etiqueta 12, cifra 22 Bold, pista y
/// variación 11, minigráfica a la derecha.
struct NxKpiCard: View {
    let kpi: NxKpi

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(kpi.label)
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
                .lineLimit(2)
            Text(kpi.value)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 0) {
                    if let hint = kpi.hint, !hint.isEmpty {
                        Text(hint).font(NxType.labelSmall).foregroundStyle(NxColors.muted)
                    }
                    if let delta = kpi.delta, !delta.isEmpty {
                        Text(delta)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(kpi.tone.fg)
                    }
                }
                Spacer(minLength: 0)
                if kpi.sparkline.count >= 2 {
                    NxSparkline(values: kpi.sparkline, color: kpi.tone.fg)
                        .frame(width: 64, height: 28)
                        .accessibilityHidden(true)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nxCardSurface()
        .accessibilityElement(children: .combine)
    }
}

struct NxKpiGrid: View {
    let items: [NxKpi]
    var columns: Int = 2

    var body: some View {
        let rows = stride(from: 0, to: items.count, by: columns).map {
            Array(items[$0..<min($0 + columns, items.count)])
        }
        VStack(spacing: 10) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 10) {
                    ForEach(row) { kpi in NxKpiCard(kpi: kpi) }
                    if row.count < columns {
                        ForEach(0..<(columns - row.count), id: \.self) { _ in
                            Color.clear.frame(maxWidth: .infinity)
                        }
                    }
                }
            }
        }
    }
}

struct NxSparkline: View {
    let values: [CGFloat]
    var color: Color = NxBrand.primary

    var body: some View {
        GeometryReader { geo in
            let minV = values.min() ?? 0
            let maxV = values.max() ?? 1
            let range = max(maxV - minV, 0.001)
            let stepX = geo.size.width / CGFloat(max(values.count - 1, 1))
            let lastY = geo.size.height - (((values.last ?? 0) - minV) / range) * geo.size.height
            ZStack(alignment: .topLeading) {
                Path { path in
                    for (i, v) in values.enumerated() {
                        let x = stepX * CGFloat(i)
                        let y = geo.size.height - ((v - minV) / range) * geo.size.height
                        if i == 0 { path.move(to: CGPoint(x: x, y: y)) }
                        else { path.addLine(to: CGPoint(x: x, y: y)) }
                    }
                }
                .stroke(color, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                // Punto final, como el `drawCircle` de Android.
                Circle()
                    .fill(color)
                    .frame(width: 3, height: 3)
                    .position(x: stepX * CGFloat(max(values.count - 1, 0)), y: lastY)
            }
        }
    }
}

/// Aviso con tono (Android `NxAlertBanner`): fondo suave del tono, radio 16,
/// cuadrito de color, título 14 SemiBold y acción opcional en negritas.
struct NxAlertBanner: View {
    let alert: NxAlert
    var actionLabel: String? = nil
    var onAction: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(alert.tone.fg)
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text(alert.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
                if let sub = alert.subtitle, !sub.isEmpty {
                    Text(sub)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let actionLabel, let onAction {
                Button(action: onAction) {
                    Text(actionLabel)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(alert.tone.fg)
                }
                .buttonStyle(.plain)
                .nxTapTarget()
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alert.tone.bg, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// Chip de estado (Android `NxStatusChip`): radio 8, fondo suave del tono, texto
/// 11 SemiBold en el color del tono e icono opcional de 12.
struct NxStatusChip: View {
    let text: String
    var tone: NxTone = .neutral
    /// SF Symbol opcional delante del texto.
    var systemImage: String? = nil

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 10, weight: .semibold))
                    .frame(width: 12, height: 12)
                    .accessibilityHidden(true)
            }
            Text(text)
                .font(.system(size: 11, weight: .semibold))
                .lineLimit(1)
        }
        .foregroundStyle(tone.fg)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(tone.bg, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Estado: \(text)")
    }
}

extension NxStatusChip {
    /// Chip a partir del estado crudo del API, con etiqueta y color de campo.
    init(status: String?) {
        self.init(text: NxStatusText.label(status), tone: NxStatusText.tone(status))
    }
}

/// Estado vacío (Android `NxEmptyState`): círculo de 56 en tinte de marca con el
/// icono en teal, título 16 SemiBold, texto 14 gris centrado y, si hay acción,
/// el botón principal del tamaño de su texto.
struct NxEmptyState: View {
    let title: String
    let subtitle: String
    var systemImage: String? = nil
    var actionLabel: String? = nil
    var onAction: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: NxSpacing.s) {
            ZStack {
                Circle().fill(NxColors.brandTint)
                Image(systemName: systemImage ?? "tray.fill")
                    .font(.system(size: 22, weight: .regular))
                    .foregroundStyle(NxColors.brand)
            }
            .frame(width: 56, height: 56)
            .accessibilityHidden(true)
            .padding(.bottom, NxSpacing.xs)
            Text(title)
                .font(NxType.titleMedium)
                .foregroundStyle(NxColors.fg)
                .multilineTextAlignment(.center)
            Text(subtitle)
                .font(NxType.bodyMedium)
                .foregroundStyle(NxColors.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if let actionLabel, let onAction {
                NxPrimaryButton(actionLabel, fullWidth: false, action: onAction)
                    .padding(.top, 6)
            }
        }
        .padding(.vertical, 36)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
    }
}

/// Aprobar / Rechazar. Se conserva por compatibilidad; dibuja `NxDecisionButtons`.
struct NxDecisionActions: View {
    var approveLabel: String = "Aprobar"
    var rejectLabel: String = "Rechazar"
    var acting: Bool = false
    var onApprove: () -> Void
    var onReject: () -> Void

    var body: some View {
        NxDecisionButtons(
            approveLabel: approveLabel,
            rejectLabel: rejectLabel,
            acting: acting,
            onApprove: onApprove,
            onReject: onReject
        )
    }
}

func sparklineFromCounts(_ counts: [Int], padTo: Int = 7) -> [CGFloat] {
    var padded = counts
    if padded.count < padTo {
        padded = Array(repeating: 0, count: padTo - padded.count) + padded
    } else {
        padded = Array(padded.suffix(padTo))
    }
    return padded.map { CGFloat($0) }
}
