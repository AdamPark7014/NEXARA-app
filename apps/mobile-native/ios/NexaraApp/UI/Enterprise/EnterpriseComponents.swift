import SwiftUI
import UIKit

// MARK: - Enterprise design system (paridad Android Nx*)

enum NxTone {
    case neutral, success, warning, danger, info, brand

    var fg: Color {
        switch self {
        case .neutral: return NxTone.neutralFg
        case .success: return NxTone.successFg
        case .warning: return NxTone.warningFg
        case .danger:  return NxTone.dangerFg
        case .info:    return NxTone.infoFg
        case .brand:   return NxBrand.adaptive
        }
    }

    var bg: Color { fg.opacity(0.14) }

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

    // Variante oscura más clara para que el texto sobre fondo negro pase contraste AA.
    private static func dynamic(light: (CGFloat, CGFloat, CGFloat), dark: (CGFloat, CGFloat, CGFloat)) -> Color {
        Color(uiColor: UIColor { traits in
            let c = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: 1)
        })
    }

    private static let neutralFg = dynamic(light: (0.39, 0.45, 0.55), dark: (0.58, 0.64, 0.72))
    private static let successFg = dynamic(light: (0.02, 0.59, 0.41), dark: (0.20, 0.83, 0.60))
    private static let warningFg = dynamic(light: (0.85, 0.47, 0.02), dark: (0.98, 0.75, 0.14))
    private static let dangerFg = dynamic(light: (0.86, 0.15, 0.15), dark: (0.97, 0.44, 0.44))
    private static let infoFg = dynamic(light: (0.15, 0.39, 0.92), dark: (0.38, 0.65, 0.98))
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

struct NxSectionHeader: View {
    let title: String
    var subtitle: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: NxSpacing.xxs) {
            Text(title)
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct NxKpiCard: View {
    let kpi: NxKpi

    var body: some View {
        VStack(alignment: .leading, spacing: NxSpacing.xs + 2) {
            HStack(spacing: NxSpacing.xs + 2) {
                Circle().fill(kpi.tone.fg).frame(width: 6, height: 6)
                Text(kpi.label)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Text(kpi.value)
                .font(.title2.weight(.bold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: NxSpacing.xxs) {
                    if let hint = kpi.hint { Text(hint).font(.caption2).foregroundStyle(.secondary) }
                    if let delta = kpi.delta {
                        Text(delta).font(.caption2.weight(.semibold)).foregroundStyle(kpi.tone.fg)
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
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(NxSpacing.m + 2)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
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
            Path { path in
                for (i, v) in values.enumerated() {
                    let x = geo.size.width * CGFloat(i) / CGFloat(max(values.count - 1, 1))
                    let y = geo.size.height - ((v - minV) / range) * geo.size.height
                    if i == 0 { path.move(to: CGPoint(x: x, y: y)) }
                    else { path.addLine(to: CGPoint(x: x, y: y)) }
                }
            }
            .stroke(color, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        }
    }
}

struct NxAlertBanner: View {
    let alert: NxAlert
    var actionLabel: String? = nil
    var onAction: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .top, spacing: NxSpacing.m) {
            Image(systemName: alert.tone.systemImage)
                .foregroundStyle(alert.tone.fg)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: NxSpacing.xxs) {
                Text(alert.title)
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                if let sub = alert.subtitle { Text(sub).font(.caption).foregroundStyle(.secondary) }
            }
            Spacer(minLength: 0)
            if let actionLabel, let onAction {
                Button(actionLabel, action: onAction)
                    .font(.caption.bold())
                    .foregroundStyle(alert.tone.fg)
                    .nxTapTarget()
            }
        }
        .padding(NxSpacing.m + 2)
        .background(alert.tone.bg, in: RoundedRectangle(cornerRadius: NxRadius.m + 2, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

struct NxStatusChip: View {
    let text: String
    var tone: NxTone = .neutral

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(tone.fg)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(tone.bg, in: Capsule())
            .accessibilityLabel("Estado: \(text)")
    }
}

extension NxStatusChip {
    /// Chip a partir del estado crudo del API, con etiqueta y color de campo.
    init(status: String?) {
        self.init(text: NxStatusText.label(status), tone: NxStatusText.tone(status))
    }
}

struct NxEmptyState: View {
    let title: String
    let subtitle: String
    var systemImage: String? = nil
    var actionLabel: String? = nil
    var onAction: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: NxSpacing.s + 2) {
            NxIconBadge(systemName: systemImage ?? "tray", tint: .secondary, size: 56, circle: true)
                .padding(.bottom, NxSpacing.xs)
            Text(title)
                .font(.headline)
                .multilineTextAlignment(.center)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if let actionLabel, let onAction {
                Button(actionLabel, action: onAction)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .tint(NxBrand.primary)
                    .padding(.top, NxSpacing.xs)
            }
        }
        .padding(NxSpacing.xxl)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
    }
}

struct NxDecisionActions: View {
    var approveLabel: String = "Aprobar"
    var rejectLabel: String = "Rechazar"
    var acting: Bool = false
    var onApprove: () -> Void
    var onReject: () -> Void

    var body: some View {
        HStack(spacing: NxSpacing.s) {
            Button(approveLabel, action: onApprove)
                .buttonStyle(.borderedProminent)
                .tint(NxTone.success.fg)
                .disabled(acting)
            Button(rejectLabel, role: .destructive, action: onReject)
                .buttonStyle(.bordered)
                .disabled(acting)
        }
        .controlSize(.large)
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
