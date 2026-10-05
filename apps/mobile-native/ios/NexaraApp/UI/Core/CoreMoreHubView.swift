import SwiftUI

/// Hub «Más» (quinta pestaña), igual que `MoreHubScreen` de Android: fondo
/// #F8FAFC, tu perfil arriba, «CLIENTES Y OBRA» con Clientes si el rol lo ve, y
/// los módulos de Core agrupados en HOY / RECURSOS / FINANZAS / GOBIERNO,
/// filtrados por `CoreNavigation.extraModules`. Va dentro del `NavigationStack`
/// de la pestaña; la barra teal se la pone el shell.
///
/// A dónde va cada módulo lo decide `CoreExtraDestination`. Solo se enseñan los
/// que ya tienen pantalla nativa (`tienePantallaNativa`): nada de fichas «en la
/// web» ni pantallas a medias en el menú.
struct CoreMoreHubView: View {
    let modules: [CoreExtraModule]
    /// Clientes (`erp-clients`) vive aquí desde el rediseño v2.
    var showClientes: Bool = false
    @ObservedObject private var session = SessionStore.shared

    private static let order: [CoreExtraModule.Group] = [.hoy, .recursos, .finanzas, .gobierno]

    private var sections: [CoreMoreHubSection] {
        let visibles = modules.filter { CoreExtraDestination.tienePantallaNativa($0) }
        let grouped = Dictionary(grouping: visibles, by: { $0.group })
        return Self.order.compactMap { group in
            guard let items = grouped[group], !items.isEmpty else { return nil }
            return CoreMoreHubSection(group: group, modules: items)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NxSpacing.s) {
                if let user = session.currentUser {
                    NavigationLink {
                        MyProfileView()
                            .nxBrandNavBar(title: CoreModule.perfil.title)
                    } label: {
                        CoreMoreHubProfileCard(user: user)
                    }
                    .buttonStyle(NxPressableStyle())
                    .accessibilityIdentifier("more-profile")
                }
                if showClientes {
                    CoreMoreHubGroupHeader(title: "Clientes y obra", topPadding: 0)
                    NavigationLink {
                        ClientesHomeView()
                            .nxBrandNavBar(title: CoreModule.clientes.title)
                    } label: {
                        CoreMoreHubCard(
                            systemImage: "person.2.fill",
                            title: "Clientes",
                            summary: "Padrón por sector: fichas, sucursales y altas."
                        )
                    }
                    .buttonStyle(NxPressableStyle())
                    .accessibilityIdentifier("more-clientes")
                }
                ForEach(Array(sections.enumerated()), id: \.offset) { index, section in
                    CoreMoreHubGroupHeader(
                        title: section.group.rawValue,
                        topPadding: index == 0 && !showClientes ? 0 : NxSpacing.m
                    )
                    ForEach(section.modules) { module in
                        NavigationLink {
                            CoreExtraDestination(module: module)
                                .nxBrandNavBar(title: module.title)
                        } label: {
                            CoreMoreHubCard(
                                systemImage: module.systemImage,
                                title: module.title,
                                summary: module.summary
                            )
                        }
                        .buttonStyle(NxPressableStyle())
                        .accessibilityIdentifier("more-\(module.rawValue)")
                    }
                }
            }
            .padding(.horizontal, NxSpacing.screenH)
            .padding(.vertical, NxSpacing.m)
        }
        .nxScreenBackground()
    }
}

private struct CoreMoreHubSection {
    let group: CoreExtraModule.Group
    let modules: [CoreExtraModule]
}

/// Encabezado de grupo (Android `GroupHeader`): en mayúsculas, 12 Medium gris.
private struct CoreMoreHubGroupHeader: View {
    let title: String
    var topPadding: CGFloat = 0

    var body: some View {
        Text(title.uppercased())
            .font(NxType.labelMedium)
            .foregroundStyle(NxColors.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, topPadding)
            .padding(.bottom, NxSpacing.xxs)
            .padding(.leading, NxSpacing.xs)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Renglón del hub (Android `HubCard`): tarjeta radio 16 con elevación 1, alto
/// mínimo 64, baldosa de 40 en `brandSoft` (radio 12) con el icono de 22 en
/// `brandText`, nombre 14 SemiBold, resumen 12,5 gris (2 líneas) y flecha.
private struct CoreMoreHubCard: View {
    let systemImage: String
    let title: String
    let summary: String

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                    .fill(NxColors.brandSoft)
                Image(systemName: systemImage)
                    .font(.system(size: 19, weight: .regular))
                    .foregroundStyle(NxColors.brandText)
                    .frame(width: 22, height: 22)
            }
            .frame(width: 40, height: 40)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(NxType.titleSmall)
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(1)
                Text(summary)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(NxColors.muted)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .nxCardSurface(elevation: 1)
        .contentShape(RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityHint("Abre el módulo")
    }
}

/// Quién eres, arriba del todo (Android `ProfileHeaderCard`): foto de 52 con aro
/// de marca o iniciales blancas sobre círculo de marca, nombre 16 Bold,
/// departamento y flecha. «Más» hace de menú de cuenta.
private struct CoreMoreHubProfileCard: View {
    let user: SessionUser

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            NxAvatar(
                nombre: user.nombre,
                url: user.avatarUrl,
                size: 52,
                estilo: .marca,
                borde: NxColors.brand
            )
            VStack(alignment: .leading, spacing: 2) {
                Text(user.nombre.isEmpty ? "Tu cuenta" : user.nombre)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(1)
                if let department = user.department, !department.isEmpty {
                    Text(department)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(NxColors.muted)
                .accessibilityHidden(true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nxCardSurface(elevation: 1)
        .contentShape(RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityHint("Abre tu perfil")
    }
}
