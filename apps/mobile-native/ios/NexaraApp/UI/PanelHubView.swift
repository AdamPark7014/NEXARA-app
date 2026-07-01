import SwiftUI

struct PanelHubView: View {
    let onOpen: (PanelId) -> Void
    let onOpenNotifications: () -> Void
    let onLogout: () -> Void

    @EnvironmentObject var session: SessionStore
    @ObservedObject private var badge = NotificationsBadgeStore.shared

    private var panels: [PanelId] {
        PanelAccessResolver.accessiblePanels(user: session.currentUser)
    }

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
                Section("Paneles") {
                    if panels.isEmpty {
                        Text("Sin paneles asignados para este usuario.")
                            .foregroundColor(.secondary)
                            .font(.footnote)
                    } else {
                        ForEach(panels) { panel in
                            Button { onOpen(panel) } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: panel.icon)
                                        .foregroundColor(panel.accent)
                                        .frame(width: 28, height: 28)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(panel.displayName).font(.body)
                                        Text(panel.tagline)
                                            .font(.caption2)
                                            .foregroundColor(.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .foregroundColor(.secondary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                Section {
                    Button(action: onOpenNotifications) {
                        HStack {
                            Label("Notificaciones", systemImage: "bell")
                            Spacer()
                            if badge.unreadCount > 0 {
                                Text("\(badge.unreadCount)")
                                    .font(.caption.bold())
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(Color.red)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }
                Section {
                    Button(role: .destructive) { onLogout() } label: {
                        Label("Cerrar sesión", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("NEXARA")
            .task { await badge.refresh() }
        }
    }
}
