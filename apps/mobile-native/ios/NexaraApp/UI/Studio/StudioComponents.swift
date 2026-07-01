import SwiftUI

enum StudioTheme {
    static let accent = Color(red: 0.66, green: 0.33, blue: 0.97)
    static let accentDark = Color(red: 0.49, green: 0.23, blue: 0.93)
    static let muted = Color.secondary
}

struct StudioGradientBar: View {
    var body: some View {
        LinearGradient(
            colors: [StudioTheme.accent, StudioTheme.accentDark, Color(red: 0.06, green: 0.65, blue: 0.91)],
            startPoint: .leading,
            endPoint: .trailing
        )
        .frame(height: 4)
    }
}

struct StudioKpiCard: View {
    let icon: String
    let label: String
    let value: String
    let hint: String
    var accent: Color = StudioTheme.accent

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text(icon).font(.title2)
                    .frame(width: 40, height: 40)
                    .background(accent.opacity(0.12))
                    .cornerRadius(12)
                Text(label).font(.caption).foregroundColor(StudioTheme.muted)
            }
            Text(value).font(.title2).bold()
            Text(hint).font(.caption2).foregroundColor(StudioTheme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(16)
    }
}

struct StudioStatusChip: View {
    let text: String
    var color: Color = StudioTheme.accent

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundColor(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
    }
}

struct StudioLoadingView: View {
    var body: some View {
        ProgressView().tint(StudioTheme.accent).frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct StudioErrorView: View {
    let message: String
    var onRetry: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Text("⚠️").font(.largeTitle)
            Text(message).foregroundColor(.red).multilineTextAlignment(.center)
            if let onRetry {
                Button("Reintentar", action: onRetry).buttonStyle(.borderedProminent).tint(StudioTheme.accent)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct StudioEmptyView: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 6) {
            Text(title).font(.headline)
            Text(subtitle).font(.caption).foregroundColor(StudioTheme.muted).multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

struct StudioFab: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: "plus")
                .font(.title2.weight(.semibold))
                .foregroundColor(.white)
                .frame(width: 56, height: 56)
                .background(StudioTheme.accent)
                .clipShape(Circle())
                .shadow(radius: 4, y: 2)
        }
    }
}

/// Campo de formulario estándar STUDIO.
struct StudioField: View {
    let label: String
    @Binding var text: String
    var axis: Axis = .horizontal
    var lines: Int = 1

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundColor(StudioTheme.muted)
            if axis == .vertical {
                TextEditor(text: $text)
                    .frame(minHeight: CGFloat(lines) * 22)
                    .padding(8)
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(10)
            } else {
                TextField(label, text: $text)
                    .textFieldStyle(.roundedBorder)
            }
        }
    }
}
