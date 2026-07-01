import SwiftUI

/// Console (ERP/OPS) portal con TabView inferior — paridad con ConsoleNavHost de Android.
/// Tabs: Inicio · Actividades · Asistencia · GPS · Más
struct ConsoleTabView: View {
    let panel: PanelId   // .erp o .ops
    let onExit: () -> Void
    @State private var selectedTab: ConsoleTab = .dashboard
    @State private var deepLinkModuleKey: String?
    @EnvironmentObject var session: SessionStore
    @ObservedObject private var deepLink = DeepLinkCoordinator.shared

    private var user: SessionUser? { session.currentUser }
    private var isAdmin: Bool {
        guard let u = user else { return false }
        return u.isSuperAdmin || u.permissions.contains("console.admin")
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            // ── Inicio / Dashboard
            NavigationStack {
                ConsoleDashboardView(isOps: panel == .ops)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarLeading) {
                            Button("Paneles", action: onExit)
                        }
                    }
            }
            .tabItem { Label("Inicio", systemImage: "house") }
            .tag(ConsoleTab.dashboard)

            // ── Actividades
            NavigationStack {
                ActivitiesView()
            }
            .tabItem { Label("Actividades", systemImage: "list.clipboard") }
            .tag(ConsoleTab.activities)

            // ── Asistencia
            NavigationStack {
                AttendanceView()
            }
            .tabItem { Label("Asistencia", systemImage: "clock") }
            .tag(ConsoleTab.attendance)

            // ── GPS
            NavigationStack {
                GpsMapView()
            }
            .tabItem { Label("GPS", systemImage: "map") }
            .tag(ConsoleTab.gps)

            // ── Más módulos
            NavigationStack {
                ConsoleMoreView(panel: panel, onExit: onExit)
                    .navigationTitle("Más módulos")
            }
            .tabItem { Label("Más", systemImage: "ellipsis.circle") }
            .tag(ConsoleTab.more)
        }
        .deepLinkModulePresenter(panel: panel, presentedKey: $deepLinkModuleKey)
        .onAppear { applyDeepLinkIfNeeded() }
        .onChange(of: deepLink.pending) { _, _ in applyDeepLinkIfNeeded() }
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
    @State private var navPath: [String] = []
    @State private var showContabilidad = false
    @EnvironmentObject var session: SessionStore

    private var isAdmin: Bool {
        guard let u = session.currentUser else { return false }
        return u.isSuperAdmin || u.permissions.contains("console.admin")
    }

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

// MARK: – Tab enum

private enum ConsoleTab: Hashable {
    case dashboard, activities, attendance, gps, more
}
