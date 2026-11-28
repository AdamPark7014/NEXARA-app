import SwiftUI

/// Aviso «Deshacer» de 5 s sobre toda la app (paridad con `AvisoDeshacerHost` de Android). Va en la raíz
/// porque la pantalla que lo pide (asignar, pedir viático) se cierra al guardar.
struct AvisoDeshacerModifier: ViewModifier {
    @ObservedObject private var centro = DeshacerCentro.shared

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if let oferta = centro.oferta {
                AvisoDeshacerTarjeta(oferta: oferta)
                    .id(oferta.id) // una oferta nueva empieza su propia cuenta
                    .padding(.horizontal, 16)
                    .padding(.bottom, 84)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.82), value: centro.oferta?.id)
    }
}

extension View {
    func avisoDeshacer() -> some View {
        modifier(AvisoDeshacerModifier())
    }
}

private struct AvisoDeshacerTarjeta: View {
    let oferta: DeshacerCentro.Oferta

    fileprivate enum Fase: Equatable { case contando, deshaciendo, deshecho, error(String) }

    /// Siempre oscuro, como los avisos del sistema: se lee igual en tema claro y oscuro.
    private static let fondo = Color(red: 0x15 / 255, green: 0x1B / 255, blue: 0x23 / 255)
    private static let fondoError = Color(red: 0x9F / 255, green: 0x1C / 255, blue: 0x1C / 255)
    private static let acento = Color(red: 0x5F / 255, green: 0xE0 / 255, blue: 0xC4 / 255)

    @State private var fase: Fase = .contando
    @State private var restante: TimeInterval = DeshacerCentro.plazo

    private var texto: String {
        switch fase {
        case .contando: return oferta.mensaje
        case .deshaciendo: return "Deshaciendo…"
        case .deshecho: return "Listo, se deshizo"
        case .error(let mensaje): return mensaje
        }
    }

    private var segundos: Int { max(1, Int(restante.rounded(.up))) }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(texto)
                        .font(.subheadline.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                    if fase == .contando, let detalle = oferta.detalle {
                        Text(detalle).font(.footnote).opacity(0.72)
                    }
                }
                Spacer(minLength: 0)
                switch fase {
                case .contando:
                    Button(action: deshacer) {
                        HStack(spacing: 8) {
                            Text("Deshacer").font(.subheadline.weight(.bold))
                            Text("\(segundos)")
                                .font(.caption.weight(.bold).monospacedDigit())
                                .frame(width: 22, height: 22)
                                .background(Circle().fill(Color.white.opacity(0.12)))
                        }
                        .foregroundStyle(Self.acento)
                        .padding(.horizontal, 10)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Deshacer, quedan \(segundos) segundos")
                case .deshaciendo:
                    ProgressView().tint(.white).padding(.horizontal, 12)
                default:
                    Button("Cerrar") { DeshacerCentro.shared.descartar(oferta.id) }
                        .foregroundStyle(.white)
                        .frame(minHeight: 44)
                }
            }
            .padding(.leading, 18)
            .padding(.trailing, 8)
            .padding(.vertical, 8)
            .frame(minHeight: 56)

            if fase == .contando {
                GeometryReader { geo in
                    Self.acento
                        .frame(width: geo.size.width * max(0, restante / DeshacerCentro.plazo))
                        .animation(.linear(duration: 0.1), value: restante)
                }
                .frame(height: 3)
            }
        }
        .foregroundStyle(.white)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(fase.esError ? Self.fondoError : Self.fondo)
                .shadow(color: .black.opacity(0.28), radius: 14, y: 6)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .frame(maxWidth: 520)
        .accessibilityElement(children: .contain)
        .task(id: fase) { await correr() }
    }

    /// Cuenta en pasos de 0.1 s; los mensajes finales se quedan lo justo para leerlos.
    private func correr() async {
        switch fase {
        case .contando:
            while restante > 0 {
                try? await Task.sleep(nanoseconds: 100_000_000)
                if Task.isCancelled { return }
                restante = max(0, restante - 0.1)
            }
            DeshacerCentro.shared.descartar(oferta.id)
        case .deshecho:
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            DeshacerCentro.shared.descartar(oferta.id)
        case .error:
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            DeshacerCentro.shared.descartar(oferta.id)
        case .deshaciendo:
            break
        }
    }

    private func deshacer() {
        guard fase == .contando else { return } // doble toque
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        fase = .deshaciendo
        Task { @MainActor in
            do {
                try await DeshacerCentro.shared.deshacer(oferta)
                fase = .deshecho
            } catch {
                fase = .error(error.toUserMessage(fallback: "No se pudo deshacer. Revisa tu conexión e inténtalo otra vez."))
            }
        }
    }
}

fileprivate extension AvisoDeshacerTarjeta.Fase {
    var esError: Bool {
        if case .error = self { return true }
        return false
    }
}
