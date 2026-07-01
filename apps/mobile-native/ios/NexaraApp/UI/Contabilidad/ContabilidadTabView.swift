import SwiftUI

/// Hub financiero — paridad Android `ContabilidadNavHost` (sin duplicar ERP/OPS).
struct ContabilidadTabView: View {
    let onExit: () -> Void
    @State private var tab: ContaTab = .dashboard

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack {
                ContabilidadDashboardView()
                    .toolbar {
                        ToolbarItem(placement: .navigationBarLeading) {
                            Button("Paneles", action: onExit)
                        }
                    }
            }
            .tabItem { Label("Inicio", systemImage: "chart.pie") }
            .tag(ContaTab.dashboard)

            NavigationStack { InvoicesView() }
                .tabItem { Label("Facturas", systemImage: "doc.text") }
                .tag(ContaTab.invoicing)

            NavigationStack { ExpensesView() }
                .tabItem { Label("Gastos", systemImage: "chart.bar") }
                .tag(ContaTab.expenses)

            NavigationStack {
                ContabilidadMoreView(onExit: onExit)
                    .navigationTitle("Más módulos")
            }
            .tabItem { Label("Más", systemImage: "ellipsis.circle") }
            .tag(ContaTab.more)
        }
    }
}

private enum ContaTab: Hashable {
    case dashboard, invoicing, expenses, more
}

private struct ContabilidadMoreView: View {
    let onExit: () -> Void
    @State private var path: [String] = []

    var body: some View {
        List {
            Section("Finanzas") {
                nav("accounting", "📒", "Contabilidad")
                nav("banking", "🏦", "Banca")
                nav("employee-payments", "💳", "Pagos a empleados")
                nav("pagos", "💳", "Pagos")
                nav("multas", "⚠️", "Multas")
            }
            Section("Operación") {
                nav("viaticos", "💼", "Viáticos")
                nav("work-projects", "🛠️", "Proyectos internos")
                nav("proyectos", "📐", "Proyectos")
                nav("horas", "🍽️", "Comidas (equipo)")
            }
            Section {
                Button("Cambiar panel", role: .destructive) { onExit() }
            }
        }
        .navigationDestination(for: String.self) { key in
            contaScreen(key)
        }
    }

    @ViewBuilder
    private func nav(_ key: String, _ icon: String, _ label: String) -> some View {
        NavigationLink(value: key) {
            HStack(spacing: 12) {
                Text(icon).font(.title3)
                Text(label)
            }
        }
    }

    @ViewBuilder
    private func contaScreen(_ key: String) -> some View {
        switch key {
        case "invoicing": InvoicesView()
        case "expenses": ExpensesView()
        case "banking": BankingView()
        case "viaticos": ViaticsView(personalOnly: false)
        case "horas": LunchBreaksAdminView()
        default:
            ModuleRouter.view(portal: .contabilidad, key: key)
        }
    }
}
