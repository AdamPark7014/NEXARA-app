import SwiftUI

/// Aviso de cumpleaños y aniversarios arriba de Actividades (`GET me/celebraciones/hoy`).
/// Quien celebra se ve primero; «Cerrar» lo oculta hasta el día siguiente.
struct CelebracionesBanner: View {
    @ObservedObject private var session = SessionStore.shared
    @State private var hoy: CelebracionesHoy?
    @State private var cerrado = false

    /// Tope de renglones: si hay más, se resume con «y N más».
    private let maxRenglones = 3

    private var lista: [CelebracionHoy] {
        (hoy?.celebraciones ?? []).sorted { $0.soyYo && !$1.soyYo }
    }

    var body: some View {
        VStack(spacing: 0) {
            if let hoy, !cerrado, !lista.isEmpty {
                card(fecha: hoy.fecha)
                    .padding(.horizontal)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity)
        .task(id: session.currentUser?.id) { await load() }
    }

    private func card(fecha: String) -> some View {
        let cumple = lista.first?.esCumpleanos ?? true
        let visibles = Array(lista.prefix(maxRenglones))
        let resto = lista.count - visibles.count
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: cumple ? "birthday.cake.fill" : "party.popper.fill")
                .font(.title2)
                .foregroundStyle(Color.white)
                .frame(width: 44, height: 44)
                .background(Color.white.opacity(0.22), in: Circle())
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 8) {
                ForEach(visibles) { c in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.titulo)
                            .font(.subheadline.weight(.bold))
                            .fixedSize(horizontal: false, vertical: true)
                        Text(c.detalle)
                            .font(.caption)
                            .opacity(0.9)
                    }
                }
                if resto > 0 {
                    Text(resto == 1 ? "y 1 celebración más hoy" : "y \(resto) celebraciones más hoy")
                        .font(.caption.weight(.semibold))
                        .opacity(0.9)
                }
            }
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                withAnimation { cerrado = true }
                CelebracionesAviso.cerrar(fecha: fecha, userId: session.currentUser?.id)
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.white)
                    .padding(8)
                    .background(Color.white.opacity(0.22), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cerrar aviso de celebraciones")
        }
        .padding(14)
        .background(
            LinearGradient(
                colors: cumple
                    ? [NotificationIcon.birthdayPink, CorePalette.orange]
                    : [NotificationIcon.anniversaryViolet, CorePalette.blue],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 16)
        )
    }

    @MainActor
    private func load() async {
        // Sin sesión de personal (o si falla) simplemente no hay aviso.
        guard let user = session.currentUser, !user.isClient, !user.isBranchUser,
              let data = try? await CelebracionesRepository.shared.deHoy() else { return }
        cerrado = CelebracionesAviso.cerrado(fecha: data.fecha, userId: user.id)
        hoy = data
    }
}
