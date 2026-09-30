import SwiftUI

/// Hub «Más»: los módulos de Core que no caben como pestaña (Cotizaciones,
/// Proyectos, Almacén, Vehículos…), filtrados por `CoreNavigation.extraModules`.
/// Va dentro del `NavigationStack` de la cubierta del shell.
///
/// A dónde va cada uno lo decide `CoreExtraDestination`. La lista avisa con un
/// «En la web» en los que todavía sacan al navegador: si no, dos entradas
/// idénticas hacen dos cosas muy distintas y no hay forma de saberlo hasta
/// después de tocarlas.
struct CoreMoreHubView: View {
    let modules: [CoreExtraModule]
    @ObservedObject private var session = SessionStore.shared

    private static let order: [CoreExtraModule.Group] = [.hoy, .recursos, .finanzas, .gobierno]

    private var sections: [CoreMoreHubSection] {
        let grouped = Dictionary(grouping: modules, by: { $0.group })
        return Self.order.compactMap { group in
            guard let items = grouped[group], !items.isEmpty else { return nil }
            return CoreMoreHubSection(group: group, modules: items)
        }
    }

    var body: some View {
        List {
            if let user = session.currentUser {
                Section {
                    NavigationLink {
                        MyProfileView()
                    } label: {
                        CoreMoreHubProfileRow(user: user)
                    }
                }
            }
            ForEach(sections) { section in
                Section {
                    ForEach(section.modules) { module in
                        NavigationLink {
                            CoreExtraDestination(module: module)
                        } label: {
                            CoreMoreHubRow(module: module)
                        }
                    }
                } header: {
                    Text(section.group.rawValue)
                }
            }
        }
        .listStyle(.insetGrouped)
        .overlay {
            if modules.isEmpty {
                ContentUnavailableView(
                    "Sin módulos adicionales",
                    systemImage: "square.grid.2x2",
                    description: Text("Tu rol no tiene módulos extra. Si necesitas uno, pídelo a tu jefe.")
                )
            }
        }
        .navigationTitle("Más")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct CoreMoreHubSection: Identifiable {
    let group: CoreExtraModule.Group
    let modules: [CoreExtraModule]
    var id: String { group.rawValue }
}

private struct CoreMoreHubRow: View {
    let module: CoreExtraModule

    private var nativo: Bool { CoreExtraDestination.tienePantallaNativa(module) }

    var body: some View {
        HStack(spacing: NxSpacing.m) {
            NxIconBadge(systemName: module.systemImage, size: 40)
            VStack(alignment: .leading, spacing: NxSpacing.xxs) {
                Text(module.title)
                    .font(.body.weight(.semibold))
                Text(module.summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if !nativo {
                Spacer(minLength: NxSpacing.xs)
                Label("En la web", systemImage: "safari")
                    .labelStyle(.titleAndIcon)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, NxSpacing.s)
                    .padding(.vertical, NxSpacing.xxs + 1)
                    .background(Color.secondary.opacity(0.12), in: Capsule())
            }
        }
        .padding(.vertical, NxSpacing.xs)
        .frame(minHeight: NxMetrics.minTap)
        .accessibilityElement(children: .combine)
        .accessibilityHint(nativo ? "Abre el módulo" : "Se abre en la web de NEXARA")
    }
}

/// Quién eres, arriba del todo: foto (o iniciales) y nombre — «Más» hace de menú de cuenta.
private struct CoreMoreHubProfileRow: View {
    let user: SessionUser

    private var initials: String {
        let letters = user.nombre.split(separator: " ").prefix(2).compactMap { $0.first }
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }

    var body: some View {
        HStack(spacing: NxSpacing.m) {
            ZStack {
                if let avatarUrl = user.avatarUrl, !avatarUrl.isEmpty {
                    AuthenticatedImage(url: avatarUrl, contentMode: .fill)
                } else {
                    Circle().fill(NxBrand.primary)
                    Text(initials)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.white)
                }
            }
            .frame(width: 52, height: 52)
            .clipShape(Circle())
            .overlay(Circle().strokeBorder(NxBrand.primary, lineWidth: 2))
            VStack(alignment: .leading, spacing: NxSpacing.xxs) {
                Text(user.nombre.isEmpty ? "Tu cuenta" : user.nombre)
                    .font(.body.weight(.semibold))
                if let department = user.department, !department.isEmpty {
                    Text(department)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, NxSpacing.xs)
        .frame(minHeight: NxMetrics.minTap)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Abre tu perfil")
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
            VStack(spacing: NxSpacing.l) {
                NxIconBadge(systemName: module.systemImage, size: 88, circle: true)
                    .padding(.top, NxSpacing.xxl + NxSpacing.s)
                Text(module.title)
                    .font(.title2.bold())
                    .multilineTextAlignment(.center)
                Text(module.summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Label("Por ahora este módulo se usa desde la web, con tu misma cuenta.", systemImage: "info.circle")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
                    .nxCard(padding: NxSpacing.m)
                    .padding(.top, NxSpacing.s)
                Button {
                    openURL(module.webURL)
                } label: {
                    Label("Abrir en la web", systemImage: "safari")
                }
                .buttonStyle(NxPrimaryButtonStyle())
                .padding(.top, NxSpacing.s)
            }
            .padding(.horizontal, NxSpacing.xl)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(module.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
