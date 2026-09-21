import SwiftUI

/// Bienvenida de tres pantallas. Espejo de `OnboardingScreen` de Android, con los
/// mismos tres textos palabra por palabra: quien cambia de teléfono no debe leer
/// dos explicaciones distintas de la misma app.
///
/// Se enseña una sola vez, después del primer inicio de sesión, y no vuelve a
/// salir aunque se cierre sesión (ver `OnboardingStore`).
struct OnboardingView: View {
    let onFinish: () -> Void

    @State private var pagina = 0

    var body: some View {
        ZStack(alignment: .topTrailing) {
            fondo

            VStack(spacing: 0) {
                TabView(selection: $pagina) {
                    ForEach(Self.laminas.indices, id: \.self) { indice in
                        OnboardingSlideView(lamina: Self.laminas[indice])
                            .tag(indice)
                    }
                }
                // Los puntos se dibujan abajo a mano para poder alargar el activo,
                // como en Android; los de serie no se pueden alargar.
                .tabViewStyle(.page(indexDisplayMode: .never))

                puntos
                    .padding(.bottom, 24)

                Button {
                    if esUltima {
                        onFinish()
                    } else {
                        withAnimation { pagina += 1 }
                    }
                } label: {
                    Text(esUltima ? "Comenzar" : "Siguiente")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
                .tint(NxBrand.primary)
                .padding(.horizontal, 28)
                .padding(.bottom, 32)
            }

            Button("Omitir") { onFinish() }
                .font(.callout)
                .foregroundStyle(.secondary)
                .padding(.top, 8)
                .padding(.trailing, 12)
        }
    }

    private var esUltima: Bool { pagina == Self.laminas.count - 1 }

    /// Tinte suave de marca que se apaga en modo oscuro (`softFill` ya es adaptable).
    private var fondo: some View {
        LinearGradient(
            colors: [NxBrand.softFill, Color(.systemBackground)],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    private var puntos: some View {
        HStack(spacing: 8) {
            ForEach(Self.laminas.indices, id: \.self) { indice in
                let activo = indice == pagina
                Capsule()
                    .fill(activo ? Self.laminas[indice].acento : Color.secondary.opacity(0.3))
                    .frame(width: activo ? 24 : 8, height: activo ? 8 : 6)
                    .animation(.easeInOut(duration: 0.2), value: pagina)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Pantalla \(pagina + 1) de \(Self.laminas.count)")
    }

    // MARK: Contenido

    /// Los tres textos son los de Android, sin tocar una coma.
    ///
    /// Los colores no pueden serlo: Android trae su propio `NxColors.Info`, que aquí
    /// no existe. Se usan los tokens que ya tiene iOS —marca, cian y morado de
    /// `CorePalette`— en vez de inventar un `Color(red:…)` suelto.
    private static let laminas: [OnboardingLamina] = [
        OnboardingLamina(
            simbolo: "list.bullet.rectangle.fill",
            titulo: "Tus actividades",
            texto: "Recibe tus servicios y proyectos, registra entrada y salida con ubicación, y sube evidencias con foto y PDF.",
            acento: NxBrand.primary
        ),
        OnboardingLamina(
            simbolo: "clock.fill",
            titulo: "Asistencia y comida",
            texto: "Checa tu jornada con GPS y registra tu hora de comida; fuera de 3 a 4 pm, tu jefe revisa la justificación.",
            acento: CorePalette.cyan
        ),
        OnboardingLamina(
            simbolo: "bubble.left.and.bubble.right.fill",
            titulo: "Equipo conectado",
            texto: "Chat en tiempo real, avisos al instante y la revisión de tus evidencias por tus superiores.",
            acento: CorePalette.purple
        ),
    ]
}

struct OnboardingLamina {
    let simbolo: String
    let titulo: String
    let texto: String
    let acento: Color
}

private struct OnboardingSlideView: View {
    let lamina: OnboardingLamina

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            Image(systemName: lamina.simbolo)
                .font(.system(size: 64, weight: .semibold))
                .foregroundStyle(lamina.acento)
                .frame(width: 140, height: 140)
                .background(
                    lamina.acento.opacity(0.14),
                    in: RoundedRectangle(cornerRadius: 32, style: .continuous)
                )
                .accessibilityHidden(true)

            Text(lamina.titulo)
                .font(.title2.bold())
                .multilineTextAlignment(.center)
                .padding(.top, 40)

            Text(lamina.texto)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.top, 12)
                .padding(.horizontal, 8)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
