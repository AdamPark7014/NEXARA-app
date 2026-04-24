import SwiftUI

/// NavigationStack genérico para un portal. Muestra la lista de módulos y
/// navega a la pantalla nativa correspondiente.
struct PortalNavView: View {
    let portal: PortalKind
    let onExit: () -> Void

    @State private var path: [String] = []  // key del módulo

    var body: some View {
        NavigationStack(path: $path) {
            ModuleListView(portal: portal, onOpen: { key in path.append(key) }, onBack: onExit)
                .navigationDestination(for: String.self) { key in
                    ModuleRouter.view(for: portal, key: key)
                }
        }
    }
}

struct ModuleListView: View {
    let portal: PortalKind
    let onOpen: (String) -> Void
    let onBack: () -> Void

    var body: some View {
        List(ModuleCatalog.modules(for: portal)) { m in
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
        .navigationTitle(portal.title)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Portales", action: onBack)
            }
        }
    }
}
