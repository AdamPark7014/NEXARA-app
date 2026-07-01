import SwiftUI

/// NavigationStack genérico para un panel. Muestra la lista de módulos y
/// navega a la pantalla nativa correspondiente.
struct PortalNavView: View {
    let panel: PanelId
    let onExit: () -> Void

    @State private var path: [String] = []
    @State private var deepLinkModuleKey: String?
    @ObservedObject private var deepLink = DeepLinkCoordinator.shared

    var body: some View {
        NavigationStack(path: $path) {
            ModuleListView(panel: panel, onOpen: { key in path.append(key) }, onBack: onExit)
                .navigationDestination(for: String.self) { key in
                    ModuleRouter.view(for: panel, key: key)
                }
        }
        .deepLinkModulePresenter(panel: panel, presentedKey: $deepLinkModuleKey)
        .onAppear { if let k = deepLink.consumeModule(for: panel) { deepLinkModuleKey = k } }
        .onChange(of: deepLink.pending) { _, _ in
            if let k = deepLink.consumeModule(for: panel) { deepLinkModuleKey = k }
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
