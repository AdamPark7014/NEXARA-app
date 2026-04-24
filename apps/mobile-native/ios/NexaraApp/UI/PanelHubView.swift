import SwiftUI

struct PanelHubView: View {
    let onOpen: (PortalKind) -> Void
    let onLogout: () -> Void

    @EnvironmentObject var session: SessionStore

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if let u = session.currentUser {
                        VStack(alignment: .leading) {
                            Text(u.nombre).font(.headline)
                            Text(u.email).font(.caption).foregroundColor(.secondary)
                        }
                    }
                }
                Section("Portales") {
                    ForEach(PortalKind.allCases) { portal in
                        Button { onOpen(portal) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: portal.icon)
                                    .frame(width: 28, height: 28)
                                Text(portal.title)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .foregroundColor(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                Section {
                    Button(role: .destructive) { onLogout() } label: {
                        Label("Cerrar sesión", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("NEXARA")
        }
    }
}
