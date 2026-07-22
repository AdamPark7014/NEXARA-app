import SwiftUI

// MARK: - Enterprise design system (paridad Android Nx*)

enum NxTone {
    case neutral, success, warning, danger, info, brand

    var fg: Color {
        switch self {
        case .neutral: return Color(red: 0.39, green: 0.45, blue: 0.55)
        case .success: return Color(red: 0.06, green: 0.73, blue: 0.51)
        case .warning: return Color(red: 0.96, green: 0.62, blue: 0.04)
        case .danger:  return Color(red: 0.94, green: 0.27, blue: 0.27)
        case .info:    return Color(red: 0.23, green: 0.51, blue: 0.96)
        case .brand:   return Color(red: 0.05, green: 0.58, blue: 0.53)
        }
    }

    var bg: Color { fg.opacity(0.12) }
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
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.headline)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle).font(.caption).foregroundColor(.secondary)
            }
        }
    }
}

struct NxKpiCard: View {
    let kpi: NxKpi

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(kpi.label).font(.caption).foregroundColor(.secondary)
            Text(kpi.value).font(.title2.bold()).lineLimit(1)
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    if let hint = kpi.hint { Text(hint).font(.caption2).foregroundColor(.secondary) }
                    if let delta = kpi.delta {
                        Text(delta).font(.caption2.weight(.semibold)).foregroundColor(kpi.tone.fg)
                    }
                }
                Spacer()
                if kpi.sparkline.count >= 2 {
                    NxSparkline(values: kpi.sparkline, color: kpi.tone.fg)
                        .frame(width: 64, height: 28)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
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
    var color: Color = .teal

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
        HStack(spacing: 10) {
            Circle().fill(alert.tone.fg).frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text(alert.title).font(.subheadline.weight(.semibold))
                if let sub = alert.subtitle { Text(sub).font(.caption).foregroundColor(.secondary) }
            }
            Spacer()
            if let actionLabel, let onAction {
                Button(actionLabel, action: onAction).font(.caption.bold()).foregroundColor(alert.tone.fg)
            }
        }
        .padding(14)
        .background(alert.tone.bg)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

struct NxStatusChip: View {
    let text: String
    var tone: NxTone = .neutral

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundColor(tone.fg)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(tone.bg)
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

struct NxEmptyState: View {
    let title: String
    let subtitle: String
    var actionLabel: String? = nil
    var onAction: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 8) {
            Text(title).font(.headline)
            Text(subtitle).font(.caption).foregroundColor(.secondary).multilineTextAlignment(.center)
            if let actionLabel, let onAction {
                Button(actionLabel, action: onAction).buttonStyle(.borderedProminent).tint(.teal)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

struct NxDecisionActions: View {
    var approveLabel: String = "Aprobar"
    var rejectLabel: String = "Rechazar"
    var acting: Bool = false
    var onApprove: () -> Void
    var onReject: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(approveLabel, action: onApprove)
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .disabled(acting)
            Button(rejectLabel, role: .destructive, action: onReject)
                .buttonStyle(.bordered)
                .disabled(acting)
        }
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
