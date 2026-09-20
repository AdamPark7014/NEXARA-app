import SwiftUI

/// Hub «Más»: los módulos de Core que no caben como pestaña (Cotizaciones,
/// Proyectos, Almacén, Vehículos…), filtrados por `CoreNavigation.extraModules`.
/// Va dentro del `NavigationStack` de la cubierta del shell.
struct CoreMoreHubView: View {
    let modules: [CoreExtraModule]

    var body: some View {
        List {
            ForEach(modules) { module in
                NavigationLink {
                    CoreModulePlaceholderView(module: module)
                } label: {
                    HStack(spacing: 12) {
                        NxIconBadge(systemName: module.systemImage, size: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(module.title)
                                .font(.body.weight(.semibold))
                            Text(module.summary)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Más")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Pantalla provisional de un módulo del hub «Más» mientras no tenga versión
/// nativa: explica qué es y lo abre en la web de Core. Cada frente de trabajo
/// la sustituye por su pantalla real.
struct CoreModulePlaceholderView: View {
    let module: CoreExtraModule
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                NxIconBadge(systemName: module.systemImage, size: 88, circle: true)
                    .padding(.top, 40)
                Text(module.title)
                    .font(.title2.bold())
                    .multilineTextAlignment(.center)
                Text(module.summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Text("Disponible pronto en la app — ábrelo en la web")
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)
                Button {
                    openURL(module.webURL)
                } label: {
                    Label("Abrir en la web", systemImage: "safari")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .tint(NxBrand.primary)
                .padding(.top, 8)
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle(module.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
