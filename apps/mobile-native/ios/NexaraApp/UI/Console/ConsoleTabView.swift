import SwiftUI

/// Console (ERP/OPS) portal con TabView inferior — paridad con `ConsoleNavHost` de Android.
/// Tabs dinámicos según rol: admin ve Operación/Evidencias; campo ve Mis act./Mis evid.
struct ConsoleTabView: View {
    let panel: PanelId
    let onExit: () -> Void
    @State private var selectedTab: String = "dashboard"
    @State private var deepLinkModuleKey: String?
    @EnvironmentObject var session: SessionStore
    @ObservedObject private var deepLink = DeepLinkCoordinator.shared

    private var user: SessionUser? { session.currentUser }

    private var bottomTabs: [ConsoleBottomTabItem] {
        ConsoleAccessRules.consoleBottomTabs(user: user, panel: panel)
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            ForEach(bottomTabs) { tab in
                NavigationStack {
                    consoleTabContent(tab)
                }
                .tabItem { Label(tab.label, systemImage: tab.systemImage) }
                .tag(tab.id)
            }
        }
        .deepLinkModulePresenter(panel: panel, presentedKey: $deepLinkModuleKey)
        .onAppear {
            syncSelectedTab()
            applyDeepLinkIfNeeded()
        }
        .onChange(of: user?.id) { _, _ in syncSelectedTab() }
        .onChange(of: bottomTabs.map(\.id)) { _, _ in syncSelectedTab() }
        .onChange(of: deepLink.pending) { _, _ in applyDeepLinkIfNeeded() }
    }

    @ViewBuilder
    private func consoleTabContent(_ tab: ConsoleBottomTabItem) -> some View {
        switch tab.moduleKey {
        case "dashboard":
            ConsoleDashboardView(isOps: panel == .ops, panel: panel)
                .navigationTitle("Inicio")
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button("Paneles", action: onExit)
                    }
                }
        case "activities":
            ActivitiesView()
                .navigationTitle("Operación")
        case "my-activities":
            ActivitiesView(filterForUserId: user?.id)
                .navigationTitle("Mis actividades")
        case "evidences":
            EvidencesView(reviewMode: true)
                .navigationTitle("Evidencias")
        case "my-evidences":
            EvidencesView(reviewMode: false)
                .navigationTitle("Mis evidencias")
        case "attendance":
            AttendanceView()
                .navigationTitle("Asistencia")
        case "gps":
            GpsMapView()
                .navigationTitle("GPS")
        case nil:
            ConsoleMoreView(panel: panel, onExit: onExit)
                .navigationTitle("Más módulos")
        default:
            EmptyView()
        }
    }

    private func syncSelectedTab() {
        let ids = bottomTabs.map(\.id)
        if !ids.contains(selectedTab) {
            selectedTab = ids.first(where: { $0 != "more" }) ?? ids.first ?? "more"
        }
    }

    private func applyDeepLinkIfNeeded() {
        if let key = deepLink.consumeModule(for: panel) {
            deepLinkModuleKey = key
        }
    }
}

// MARK: – More screen

private struct ConsoleMoreView: View {
    let panel: PanelId
    let onExit: () -> Void
    @State private var showContabilidad = false
    @EnvironmentObject var session: SessionStore

    private var canFinance: Bool {
        guard let u = session.currentUser else { return false }
        return u.isSuperAdmin
            || u.permissions.contains(where: { $0.lowercased().contains("contabilidad") })
            || (u.role ?? "").lowercased().contains("contab")
    }

    var body: some View {
        List {
            if let u = session.currentUser {
                Section {
                    HStack(spacing: 12) {
                        Text(u.isSuperAdmin ? "⚡" : "👤").font(.largeTitle)
                        VStack(alignment: .leading) {
                            Text(u.nombre).font(.headline)
                            Text(u.email).font(.caption).foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            if canFinance {
                Section {
                    Button { showContabilidad = true } label: {
                        HStack(spacing: 12) {
                            Text("📊").font(.title3)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Hub Contabilidad")
                                Text("Facturas, gastos y finanzas").font(.caption).foregroundColor(.secondary)
                            }
                        }
                    }
                }
            }

            Section {
                NavigationLink {
                    OfflineQueueView()
                } label: {
                    HStack(spacing: 12) {
                        Text("☁️").font(.title3)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Cola offline")
                            Text("Sincronizar cambios y fotos pendientes")
                                .font(.caption).foregroundColor(.secondary)
                        }
                    }
                }
            }

            ForEach(ConsoleAccessRules.consoleSidebarGroupsForMore(user: session.currentUser, panel: panel)) { group in
                Section(group.title) {
                    ForEach(group.modules) { m in
                        NavigationLink(value: m.key) {
                            HStack(spacing: 12) {
                                Text(m.icon).font(.title3)
                                Text(m.label)
                            }
                        }
                    }
                }
            }

            Section {
                Button(role: .destructive) { onExit() } label: {
                    Label("Cambiar panel", systemImage: "arrow.left.circle")
                }
            }
        }
        .navigationDestination(for: String.self) { key in
            ModuleRouter.view(for: panel, key: key)
        }
        .fullScreenCover(isPresented: $showContabilidad) {
            ContabilidadTabView(onExit: { showContabilidad = false })
        }
    }
}
