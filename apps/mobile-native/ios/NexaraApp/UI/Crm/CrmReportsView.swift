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
    @Published var metrics: [String: Any] = [:]
    @Published var vendors: [[String: Any]] = []
    @Published var isLoading = false
    @Published var error: String?

    func load() {
        isLoading = true; error = nil
        Task {
            async let m = CrmRepository.shared.salesMetrics(period: period)
            async let v = CrmRepository.shared.vendorStats(period: period)
            metrics = await m
            vendors = await v
            if metrics.isEmpty && vendors.isEmpty { error = "No se pudieron cargar los reportes." }
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

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(mode.title).font(.title2).bold()
                    Text(mode.subtitle).font(.caption).foregroundColor(.secondary)
                }

                periodChips

                if vm.isLoading && vm.metrics.isEmpty {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 24)
                } else if let err = vm.error {
                    Text(err).foregroundColor(.red)
                    Button("Reintentar") { vm.load() }.buttonStyle(.bordered)
                } else {
                    content
                }
            }
            .padding()
        }
        .navigationTitle(mode.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { vm.load() }
        .refreshable { vm.load() }
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
                ForEach(vm.vendors, id: \.vendorId) { v in VendorCardView(vendor: v) }
            }
        case .crecimiento:
            growthHighlight
            metricsGrid(full: false)
        case .equipoComparativa:
            if vm.vendors.isEmpty {
                Text("Sin datos de vendedores para este periodo.").foregroundColor(.secondary)
            } else {
                sectionHeader("Ranking", periodLabel(vm.period))
                ForEach(vm.vendors.sorted { crmDouble($0, "revenue") > crmDouble($1, "revenue") }, id: \.vendorId) { v in
                    VendorCardView(vendor: v, showQuota: true)
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
        let items: [(String, String, Color)] = if full {
            [
                ("Ingresos", crmFmtMxn(crmDouble(vm.metrics, "totalRevenue")), .green),
                ("Pipeline", crmFmtMxn(crmDouble(vm.metrics, "pipelineValue")), .blue),
                ("Oportunidades", "\(crmInt(vm.metrics, "opportunityCount"))", .teal),
                ("Proyectos", "\(crmInt(vm.metrics, "projectCount"))", .indigo),
                ("Conversión", crmFmtPct(crmDouble(vm.metrics, "conversionRate")), .orange),
                ("Margen prom.", crmFmtPct(crmDouble(vm.metrics, "averageMargin")), .purple),
                ("Cerrados", "\(crmInt(vm.metrics, "closedProjects"))", .mint),
                ("Clientes nuevos", "\(crmInt(vm.metrics, "activeClients"))", .pink),
            ]
        } else {
            [
                ("Ingresos", crmFmtMxn(crmDouble(vm.metrics, "totalRevenue")), .green),
                ("Pipeline", crmFmtMxn(crmDouble(vm.metrics, "pipelineValue")), .blue),
                ("Conversión", crmFmtPct(crmDouble(vm.metrics, "conversionRate")), .orange),
                ("Oportunidades", "\(crmInt(vm.metrics, "opportunityCount"))", .teal),
            ]
        }

        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                CrmMetricTile(label: item.0, value: item.1, accent: item.2)
            }
        }
    }

    private var growthHighlight: some View {
        let revenue = crmDouble(vm.metrics, "totalRevenue")
        let pipeline = crmDouble(vm.metrics, "pipelineValue")
        let conversion = crmDouble(vm.metrics, "conversionRate")
        let closed = crmInt(vm.metrics, "closedProjects")
        let opps = crmInt(vm.metrics, "opportunityCount")

        return VStack(alignment: .leading, spacing: 8) {
            Text("Resumen de crecimiento").font(.headline).foregroundColor(Color(red: 0.02, green: 0.37, blue: 0.27))
            Text("Ingresos \(crmFmtMxn(revenue)) · Pipeline \(crmFmtMxn(pipeline)) · Conversión \(crmFmtPct(conversion))")
                .font(.subheadline).foregroundColor(Color(red: 0.02, green: 0.47, blue: 0.34))
            if opps > 0 {
                ProgressView(value: Double(closed) / Double(opps))
                    .tint(.green)
                Text("\(closed) de \(opps) oportunidades cerradas").font(.caption2).foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(red: 0.94, green: 0.99, blue: 0.96))
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
    let vendor: [String: Any]
    var showQuota: Bool = false

    var body: some View {
        let name = crmStr(vendor, "userName", "nombre", "name").ifBlank("Vendedor")
        let revenue = crmDouble(vendor, "revenue")
        let status = crmStr(vendor, "status")
        let statusColor = vendorStatusColor(status)

        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(name).font(.subheadline).bold()
                Spacer()
                Text(crmFmtMxn(revenue)).font(.subheadline).bold().foregroundColor(.teal)
            }
            HStack(spacing: 12) {
                Text("\(crmInt(vendor, "opportunities")) opps").font(.caption2).foregroundColor(.secondary)
                Text("\(crmInt(vendor, "projects")) proy.").font(.caption2).foregroundColor(.secondary)
                if let perf = crmOptionalDouble(vendor, "performance") {
                    Text("\(Int(perf))% perf.").font(.caption2).foregroundColor(.secondary)
                }
            }
            if showQuota {
                let target = crmDouble(vendor, "targetRevenue")
                let att = crmDouble(vendor, "attainmentRevenue")
                if target > 0 {
                    ProgressView(value: min(att / 100, 1))
                        .tint(statusColor)
                    Text("Cuota \(crmFmtMxn(target)) · \(crmFmtPct(att)) cumplimiento")
                        .font(.caption2).foregroundColor(statusColor)
                }
            }
            if !status.isEmpty {
                Text(status.replacingOccurrences(of: "-", with: " ").capitalized)
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

private func crmStr(_ m: [String: Any], _ keys: String...) -> String {
    for k in keys {
        if let v = m[k] {
            let s: String
            if let ss = v as? String { s = ss }
            else if let n = v as? NSNumber { s = n.stringValue }
            else { s = String(describing: v) }
            if !s.isEmpty && s != "null" { return s }
        }
    }
    return ""
}

private func crmOptionalDouble(_ m: [String: Any], _ key: String) -> Double? {
    if let d = m[key] as? Double { return d }
    if let n = m[key] as? NSNumber { return n.doubleValue }
    if let s = m[key] as? String { return Double(s) }
    return nil
}

private func crmDouble(_ m: [String: Any], _ key: String) -> Double { crmOptionalDouble(m, key) ?? 0 }

private func crmInt(_ m: [String: Any], _ key: String) -> Int { Int(crmDouble(m, key)) }

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

extension String {
    fileprivate func ifBlank(_ fallback: String) -> String { isEmpty ? fallback : self }
}

extension [String: Any] {
    fileprivate var vendorId: String {
        if let n = self["userId"] as? Int { return "v-\(n)" }
        if let s = self["userId"] as? String { return "v-\(s)" }
        if let n = self["id"] as? Int { return "v-\(n)" }
        return UUID().uuidString
    }
}
