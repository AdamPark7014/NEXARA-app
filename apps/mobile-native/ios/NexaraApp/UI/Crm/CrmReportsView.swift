import SwiftUI

enum CrmReportMode {
    case reportes, crecimiento, equipoComparativa

    var title: String {
        switch self {
        case .reportes: return "Reportes de ventas"
        case .crecimiento: return "Crecimiento"
        case .equipoComparativa: return "Comparativa equipo"
        }
    }

    var subtitle: String {
        switch self {
        case .reportes: return "KPIs del periodo y desempeño del equipo"
        case .crecimiento: return "Ingresos, conversión y pipeline"
        case .equipoComparativa: return "Ranking y cuotas por vendedor"
        }
    }
}

@MainActor
final class CrmReportsVM: ObservableObject {
    @Published var period = "month"
    @Published var metrics = SalesMetrics()
    @Published var vendors: [VendorReportItem] = []
    @Published var isLoading = false
    @Published var error: String?

    func load() {
        isLoading = true; error = nil
        Task {
            async let m = CrmRepository.shared.salesMetricsItem(period: period)
            async let v = CrmRepository.shared.vendorReportItems(period: period)
            metrics = await m
            vendors = await v
            if metrics.raw.isEmpty && vendors.isEmpty { error = "No se pudieron cargar los reportes." }
            isLoading = false
        }
    }

    func setPeriod(_ p: String) {
        guard period != p else { return }
        period = p
        load()
    }
}

struct CrmReportsView: View {
    let mode: CrmReportMode
    @StateObject private var vm = CrmReportsVM()
    @State private var selectedVendor: VendorReportItem?

    var body: some View {
        Group {
            if let v = selectedVendor { vendorDetail(v) } else { reportList }
        }
        .navigationTitle(mode.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { vm.load() }
        .refreshable { if selectedVendor == nil { vm.load() } }
    }

    @ViewBuilder
    private func vendorDetail(_ v: VendorReportItem) -> some View {
        let statusColor = vendorStatusColor(v.status)
        List {
            Section { Button("← Reportes") { selectedVendor = nil } }
            Section {
                HStack {
                    Text(v.displayName).font(.headline)
                    Spacer()
                    if !v.status.isEmpty {
                        Text(v.status.replacingOccurrences(of: "-", with: " ").capitalized)
                            .font(.caption2.bold()).foregroundColor(statusColor)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(statusColor.opacity(0.12)).clipShape(Capsule())
                    }
                }
            }
            Section("Ventas") {
                vrRow("Ingresos",       crmFmtMxn(v.revenue))
                vrRow("Meta",           crmFmtMxn(v.targetRevenue))
                if v.targetRevenue > 0 { vrRow("Cumplimiento", crmFmtPct(v.attainmentRevenue)) }
                vrRow("Oportunidades",  "\(v.opportunities)")
                vrRow("Proyectos",      "\(v.projects)")
                vrRow("Leads",          "\(v.leads)")
                vrRow("Actividades",    "\(v.activities)")
                if v.performance > 0 { vrRow("Performance", crmFmtPct(v.performance)) }
                vrRow("Email",          v.email)
                vrRow("Rol",            v.role)
            }
            if v.targetRevenue > 0 {
                Section("Cuota") {
                    ProgressView(value: min(v.attainmentRevenue / 100, 1)).tint(statusColor)
                    Text("\(crmFmtPct(v.attainmentRevenue)) de \(crmFmtMxn(v.targetRevenue))")
                        .font(.caption).foregroundColor(statusColor)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func vrRow(_ label: String, _ value: String) -> some View {
        let nonZero = value != "0" && value != "$0" && !value.contains("$0.") && !value.isEmpty
        if nonZero {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value).multilineTextAlignment(.trailing) }
        }
    }

    private var reportList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(mode.title).font(.title2).bold()
                    Text(mode.subtitle).font(.caption).foregroundColor(.secondary)
                }

                periodChips

                if vm.isLoading && vm.metrics.raw.isEmpty {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 24)
                } else if let err = vm.error {
                    NxEmptyState(
                        title: "Sin reportes",
                        subtitle: err,
                        actionLabel: "Reintentar",
                        onAction: { vm.load() }
                    )
                } else {
                    content
                }
            }
            .padding()
        }
    }

    private var periodChips: some View {
        HStack(spacing: 8) {
            ForEach([("week", "Semana"), ("month", "Mes"), ("year", "Año")], id: \.0) { id, label in
                Button {
                    vm.setPeriod(id)
                } label: {
                    Text(label)
                        .font(.caption.bold())
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(vm.period == id ? Color.teal.opacity(0.2) : Color(.systemFill))
                        .foregroundColor(vm.period == id ? .teal : .primary)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch mode {
        case .reportes:
            metricsGrid(full: true)
            if !vm.vendors.isEmpty {
                sectionHeader("Equipo de ventas", "\(vm.vendors.count) vendedores")
                ForEach(vm.vendors) { v in
                    Button { selectedVendor = v } label: { VendorCardView(vendor: v) }.buttonStyle(.plain)
                }
            }
        case .crecimiento:
            growthHighlight
            metricsGrid(full: false)
        case .equipoComparativa:
            if vm.vendors.isEmpty {
                NxEmptyState(
                    title: "Sin vendedores",
                    subtitle: "No hay datos de vendedores para este periodo.",
                    actionLabel: "Actualizar",
                    onAction: { vm.load() }
                )
            } else {
                sectionHeader("Ranking", periodLabel(vm.period))
                ForEach(vm.vendors.sorted { $0.revenue > $1.revenue }) { v in
                    Button { selectedVendor = v } label: { VendorCardView(vendor: v, showQuota: true) }.buttonStyle(.plain)
                }
            }
        }
    }

    private func sectionHeader(_ title: String, _ detail: String) -> some View {
        HStack {
            Text(title).font(.headline)
            Spacer()
            Text(detail).font(.caption).foregroundColor(.secondary)
        }
        .padding(.top, 8)
    }

    private func metricsGrid(full: Bool) -> some View {
        let m = vm.metrics
        let items: [(String, String, Color)] = if full {
            [
                ("Ingresos", crmFmtMxn(m.totalRevenue), .green),
                ("Pipeline", crmFmtMxn(m.pipelineValue), .blue),
                ("Oportunidades", "\(m.opportunityCount)", .teal),
                ("Proyectos", "\(m.projectCount)", .indigo),
                ("Conversión", crmFmtPct(m.conversionRate), .orange),
                ("Margen prom.", crmFmtPct(m.averageMargin), .purple),
                ("Cerrados", "\(m.closedProjects)", .mint),
                ("Clientes nuevos", "\(m.activeClients)", .pink),
            ]
        } else {
            [
                ("Ingresos", crmFmtMxn(m.totalRevenue), .green),
                ("Pipeline", crmFmtMxn(m.pipelineValue), .blue),
                ("Conversión", crmFmtPct(m.conversionRate), .orange),
                ("Oportunidades", "\(m.opportunityCount)", .teal),
            ]
        }

        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                CrmMetricTile(label: item.0, value: item.1, accent: item.2)
            }
        }
    }

    private var growthHighlight: some View {
        let m = vm.metrics
        return VStack(alignment: .leading, spacing: 8) {
            Text("Resumen de crecimiento").font(.headline)
            Text("Ingresos \(crmFmtMxn(m.totalRevenue)) · Pipeline \(crmFmtMxn(m.pipelineValue)) · Conversión \(crmFmtPct(m.conversionRate))")
                .font(.subheadline).foregroundColor(.secondary)
            if m.opportunityCount > 0 {
                ProgressView(value: Double(m.closedProjects) / Double(m.opportunityCount))
                    .tint(.green)
                Text("\(m.closedProjects) de \(m.opportunityCount) oportunidades cerradas").font(.caption2).foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func periodLabel(_ period: String) -> String {
        switch period {
        case "week": return "Esta semana"
        case "year": return "Este año"
        default: return "Este mes"
        }
    }
}

private struct CrmMetricTile: View {
    let label: String; let value: String; let accent: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption).foregroundColor(accent)
            Text(value).font(.title3).bold()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(accent.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct VendorCardView: View {
    let vendor: VendorReportItem
    var showQuota: Bool = false

    var body: some View {
        let statusColor = vendorStatusColor(vendor.status)

        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(vendor.displayName).font(.subheadline).bold()
                Spacer()
                Text(crmFmtMxn(vendor.revenue)).font(.subheadline).bold().foregroundColor(.teal)
            }
            HStack(spacing: 12) {
                Text("\(vendor.opportunities) opps").font(.caption2).foregroundColor(.secondary)
                Text("\(vendor.projects) proy.").font(.caption2).foregroundColor(.secondary)
                if vendor.performance > 0 {
                    Text("\(Int(vendor.performance))% perf.").font(.caption2).foregroundColor(.secondary)
                }
            }
            if showQuota, vendor.targetRevenue > 0 {
                ProgressView(value: min(vendor.attainmentRevenue / 100, 1))
                    .tint(statusColor)
                Text("Cuota \(crmFmtMxn(vendor.targetRevenue)) · \(crmFmtPct(vendor.attainmentRevenue)) cumplimiento")
                    .font(.caption2).foregroundColor(statusColor)
            }
            if !vendor.status.isEmpty {
                Text(vendor.status.replacingOccurrences(of: "-", with: " ").capitalized)
                    .font(.caption2.bold()).foregroundColor(statusColor)
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background(statusColor.opacity(0.12)).clipShape(Capsule())
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: – Shared CRM report helpers

private func crmFmtMxn(_ v: Double) -> String {
    let n = NumberFormatter()
    n.numberStyle = .currency; n.currencySymbol = "$"; n.maximumFractionDigits = 0
    return n.string(from: NSNumber(value: v)) ?? "$\(Int(v))"
}

private func crmFmtPct(_ v: Double) -> String { String(format: "%.1f%%", v) }

private func vendorStatusColor(_ status: String) -> Color {
    switch status {
    case "on-track": return .green
    case "risk": return .orange
    case "off-track": return .red
    default: return .secondary
    }
}
