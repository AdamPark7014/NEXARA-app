import SwiftUI

/// NavigationStack genérico para un panel. Muestra la lista de módulos y
/// navega a la pantalla nativa correspondiente.
struct PortalNavView: View {
    let panel: PanelId
    let onExit: () -> Void

    @State private var path: [String] = []

    var body: some View {
        NavigationStack(path: $path) {
            ModuleListView(panel: panel, onOpen: { key in path.append(key) }, onBack: onExit)
                .navigationDestination(for: String.self) { key in
                    ModuleRouter.view(for: panel, key: key)
                }
        }
    }
}

struct ModuleListView: View {
    let panel: PanelId
    let onOpen: (String) -> Void
    let onBack: () -> Void

    var body: some View {
        List(ModuleCatalog.modules(for: panel)) { m in
            Button {
                onOpen(m.key)
            } label: {
                HStack(spacing: 12) {
                    Text(m.icon).font(.title3)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(m.label).font(.body)
                        Text(m.webPath).font(.caption2).foregroundColor(.secondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundColor(.secondary)
                }
            }
            .buttonStyle(.plain)
        }
        .navigationTitle(panel.displayName)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Paneles", action: onBack)
            }
        }
    }
}
