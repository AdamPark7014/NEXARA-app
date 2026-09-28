import SwiftUI

/// Franja fija de la parte alta de la shell mientras `DemoMode.isActive`: dice que los datos
/// son de muestra y da una salida a un toque (`DemoMode.exit()`).
struct DemoBanner: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "sparkles")
                .imageScale(.small)
                .accessibilityHidden(true)
            Text("Modo demostración · datos ficticios")
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
            Spacer(minLength: 8)
            Button {
                DemoMode.exit()
            } label: {
                Text("Salir")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(Color.white.opacity(0.22), in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Salir del modo demostración")
            .accessibilityIdentifier("demo-exit-button")
        }
        .foregroundColor(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity)
        .background(NxBrand.dark.ignoresSafeArea(edges: .top))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("demo-banner")
    }
}
