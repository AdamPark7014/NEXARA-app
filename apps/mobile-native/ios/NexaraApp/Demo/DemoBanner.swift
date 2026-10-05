import SwiftUI

/// Franja fija de la shell mientras `DemoMode.isActive`: dice que los datos son de muestra y
/// da una salida a un toque (`DemoMode.exit()`). Desde la paridad con Android va justo encima
/// de la barra inferior: arriba, la barra teal tiene que llegar hasta la hora sin nada en medio.
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
        // Solo debajo de la barra de estado. Antes el color se extendía detrás de ella
        // (`ignoresSafeArea(edges: .top)`): hora negra sobre una franja azul sólida, el
        // aspecto de una barra de estado de Android. Apple rechazó por eso la 1.0 (6) con
        // la regla 2.3.10 («remove non-iOS status bar images»).
        .background(NxBrand.dark)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("demo-banner")
    }
}
