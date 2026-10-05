import SwiftUI

/// Bienvenida de tres pantallas — igual que `OnboardingScreen` de Android: los
/// mismos tres textos palabra por palabra, los mismos colores (marca, azul y
/// morado), el icono de 64 en una baldosa de 140 con degradado, los puntos que
/// se alargan, «Siguiente» / «Comenzar» y «Omitir» arriba a la derecha.
///
/// Se enseña una sola vez, después del primer inicio de sesión, y no vuelve a
/// salir aunque se cierre sesión (ver `OnboardingStore`).
struct OnboardingView: View {
    let onFinish: () -> Void

    @State private var pagina = 0

    var body: some View {
        ZStack(alignment: .topTrailing) {
            LinearGradient(
                colors: [NxColors.brandSoft, NxColors.surface, Color.white],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer().frame(height: 72)

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
                        .font(NxType.labelLarge)
                        .foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(NxColors.brand, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(NxPressableStyle())

                Spacer().frame(height: 32)
            }
            .padding(.horizontal, 28)

            Button { onFinish() } label: {
                Text("Omitir")
                    .font(NxType.labelLarge)
                    .foregroundStyle(NxColors.muted)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 40)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 8)
            .padding(.trailing, 4)
        }
    }

    private var esUltima: Bool { pagina == Self.laminas.count - 1 }

    private var puntos: some View {
        HStack(spacing: 0) {
            ForEach(Self.laminas.indices, id: \.self) { indice in
                let activo = indice == pagina
                Capsule()
                    .fill(activo ? Self.laminas[indice].acento : NxColors.muted.opacity(0.3))
                    .frame(width: activo ? 24 : 8, height: activo ? 8 : 6)
                    .padding(.horizontal, 4)
                    .animation(.easeInOut(duration: 0.2), value: pagina)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Pantalla \(pagina + 1) de \(Self.laminas.count)")
    }

    // MARK: Contenido

    /// Los tres textos y colores son los de Android, sin tocar una coma.
    private static let laminas: [OnboardingLamina] = [
        OnboardingLamina(
            simbolo: "wrench.and.screwdriver",
            titulo: "Tus actividades",
            texto: "Recibe tus servicios y proyectos, registra entrada y salida con ubicación, y sube evidencias con foto y PDF.",
            acento: NxColors.brand,
            acentoSuave: NxColors.brandSoft
        ),
        OnboardingLamina(
            simbolo: "calendar.badge.checkmark",
            titulo: "Asistencia y comida",
            texto: "Checa tu jornada con GPS y registra tu hora de comida; fuera de 3 a 4 pm, tu jefe revisa la justificación.",
            acento: NxColors.info,
            acentoSuave: NxColors.infoSoft
        ),
        OnboardingLamina(
            simbolo: "text.bubble",
            titulo: "Equipo conectado",
            texto: "Chat en tiempo real, avisos al instante y la revisión de tus evidencias por tus superiores.",
            acento: NxColors.morado,
            acentoSuave: NxColors.rgb(0xEDE9FE)
        ),
    ]
}

struct OnboardingLamina {
    let simbolo: String
    let titulo: String
    let texto: String
    let acento: Color
    let acentoSuave: Color
}

private struct OnboardingSlideView: View {
    let lamina: OnboardingLamina

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            Image(systemName: lamina.simbolo)
                .font(.system(size: 52, weight: .regular))
                .foregroundStyle(lamina.acento)
                .frame(width: 64, height: 64)
                .frame(width: 140, height: 140)
                .background(
                    LinearGradient(
                        colors: [lamina.acentoSuave, Color.white],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    in: RoundedRectangle(cornerRadius: 32, style: .continuous)
                )
                .accessibilityHidden(true)

            Text(lamina.titulo)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .multilineTextAlignment(.center)
                .padding(.top, 40)

            Text(lamina.texto)
                .nxTextStyle(.bodyLarge)
                .foregroundStyle(NxColors.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
                .padding(.horizontal, 8)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
