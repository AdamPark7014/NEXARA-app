import SwiftUI

/// Banda de conexión de arriba (Android `OfflineBanner`): ámbar #B45309 sin red,
/// azul #0369A1 con cambios pendientes de subir; texto blanco 12 SemiBold. El
/// color llega hasta la barra de estado, como `statusBarsPadding` en Android.
/// Un dato por renglón. Con red y pendientes, toda la banda es el botón «Reintentar»
/// (el mismo `replay`); sin red no se ofrece, porque el envío no sale.
struct OfflineBanner: View {
    @ObservedObject private var network = NetworkMonitor.shared
    @State private var pending = 0
    @State private var syncing = false

    private static let ambar = NxColors.rgb(0xB45309)
    private static let azul = NxColors.rgb(0x0369A1)

    var body: some View {
        Group {
            if DemoMode.isActive {
                // Modo demostración: nada sale del teléfono, no hay banda de conexión.
                EmptyView()
            } else if !network.isOnline || pending > 0 {
                banda(
                    lineas(online: network.isOnline, pending: pending),
                    color: network.isOnline ? Self.azul : Self.ambar,
                    reintentar: network.isOnline && pending > 0
                )
            }
        }
        .task {
            pending = OfflineMutationQueue.shared.pendingCount
        }
        .onReceive(NotificationCenter.default.publisher(for: .nexaraOfflineQueueChanged)) { _ in
            pending = OfflineMutationQueue.shared.pendingCount
        }
    }

    private func lineas(online: Bool, pending: Int) -> [String] {
        if !online && pending > 0 {
            return ["Sin conexión", "\(pending) en cola (incl. fotos)"]
        }
        if !online {
            return ["Sin conexión", "cambios y fotos se encolan localmente"]
        }
        if pending > 0 {
            return ["Pendientes de sync: \(pending)"]
        }
        return []
    }

    @ViewBuilder
    private func banda(_ lineas: [String], color: Color, reintentar: Bool) -> some View {
        let contenido = VStack(alignment: .leading, spacing: 2) {
            ForEach(Array(lineas.enumerated()), id: \.offset) { _, linea in
                Text(linea)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if reintentar {
                Text("Reintentar")
                    .font(.system(size: 12, weight: .semibold))
                    .underline()
                    .foregroundStyle(Color.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(color.ignoresSafeArea(edges: .top))
        if reintentar {
            // Toda la banda es el botón, como antes: el área táctil no se encoge al renglón «Reintentar».
            Button {
                guard !syncing else { return }
                Task {
                    syncing = true
                    await OfflineSyncCoordinator.shared.replay()
                    pending = OfflineMutationQueue.shared.pendingCount
                    syncing = false
                }
            } label: {
                contenido.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Reintenta enviar los cambios pendientes")
        } else {
            contenido
                .accessibilityAddTraits(.isStaticText)
        }
    }
}

extension Notification.Name {
    static let nexaraOfflineQueueChanged = Notification.Name("nexara.offline.queue.changed")
}
