import SwiftUI

// MARK: – ViewModel

@MainActor
final class CrmDashboardVM: ObservableObject {
    @Published var cotizaciones: [Cotizacion] = []
    @Published var leads:        [[String: Any]] = []
    @Published var metrics = SalesMetrics()
    @Published var isLoading = false
    @Published var error: String?

    func load() {
        isLoading = true; error = nil
        Task {
            async let cots  = ExtraRepository.shared.cotizacionItems()
            async let leads = ExtraRepository.shared.clientTicketRequests()
            async let mets  = CrmRepository.shared.salesMetricsItem(period: "month")
            let (c, l, m) = await (cots, leads, mets)
            cotizaciones = c
            self.leads   = l
            metrics      = m
            isLoading    = false
        }
    }
}

// MARK: – View

struct CrmDashboardView: View {
    @StateObject private var vm = CrmDashboardVM()

    var body: some View {
        Group {
            if vm.isLoading && vm.cotizaciones.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            } else if let err = vm.error {
                VStack(spacing: 12) {
                    Text("No se pudo cargar").font(.headline)
                    Text(err).font(.footnote).foregroundColor(.secondary)
                    Button("Reintentar") { vm.load() }.buttonStyle(.bordered)
                }.padding()
            } else {
                content
            }
        }
        .navigationTitle("Dashboard CRM")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { vm.load() } label: { Image(systemName: "arrow.clockwise") }
            }
        }
        .refreshable { vm.load() }
        .task { vm.load() }
    }

    private var content: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                kpiSection
                if !vm.metrics.raw.isEmpty { pipelineSection }
                if !vm.cotizaciones.isEmpty { statusSection }
                recentCotSection
                if !vm.leads.isEmpty { leadsSection }
                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
    }

    // ── KPIs
    private var kpiSection: some View {
        let total    = vm.cotizaciones.count
        let totalVal = vm.cotizaciones.reduce(0) { $0 + $1.total }
        let approved = vm.cotizaciones.filter { $0.estatus.localizedLowercase.contains("aprobad") }.count
        let approvedV = vm.cotizaciones.filter { $0.estatus.localizedLowercase.contains("aprobad") }
                            .reduce(0) { $0 + $1.total }
        let pending  = vm.cotizaciones.filter {
            let s = $0.estatus.localizedLowercase
            return s.contains("enviada") || s.contains("borrador")
        }.count

        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            CrmKpi(icon: "📝", label: "Cotizaciones", value: "\(total)", sub: fmtMxn(totalVal), accent: .teal)
            CrmKpi(icon: "✅", label: "Aprobadas", value: "\(approved)", sub: fmtMxn(approvedV), accent: .green)
            CrmKpi(icon: "⏳", label: "En proceso", value: "\(pending)", sub: "Enviadas + borradores", accent: .orange)
            CrmKpi(icon: "🎯", label: "Leads", value: "\(vm.leads.count)", sub: "Solicitudes", accent: .blue)
        }
        .padding(.horizontal)
    }

    // ── Pipeline del mes (API ventas/reportes/metricas — sin duplicar pantalla Reportes)
    private var pipelineSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            CrmSectionRow(title: "Pipeline del mes", detail: "Ver reportes →")
                .padding(.horizontal)
            HStack(spacing: 10) {
                CrmKpi(icon: "dollarsign.circle", label: "Ingresos", value: crmDashFmtMxn(vm.metrics.totalRevenue), sub: "Periodo actual", accent: .green)
                CrmKpi(icon: "chart.bar", label: "Pipeline", value: crmDashFmtMxn(vm.metrics.pipelineValue), sub: "Oportunidades activas", accent: .blue)
                CrmKpi(icon: "target", label: "Conversión", value: crmDashFmtPct(vm.metrics.conversionRate), sub: "Cierre vs opps", accent: .orange)
            }
            .padding(.horizontal)
        }
    }

    // ── Status breakdown
    private var statusSection: some View {
        let groups = Dictionary(grouping: vm.cotizaciones) { $0.estatus.isEmpty ? "Sin estado" : $0.estatus }
            .sorted { $0.value.count > $1.value.count }
        let total = vm.cotizaciones.count

        return VStack(alignment: .leading, spacing: 10) {
            CrmSectionRow(title: "Estado de cotizaciones", detail: "\(total) total")
                .padding(.horizontal)

            VStack(spacing: 10) {
                ForEach(groups, id: \.key) { key, list in
                    let pct = Double(list.count) / Double(max(total, 1))
                    CrmStatusBar(status: key, count: list.count, percent: pct)
                }
            }
            .padding()
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal)
        }
    }

    // ── Recent cotizaciones
    private var recentCotSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            CrmSectionRow(title: "Cotizaciones recientes", detail: "Últimas 8")
                .padding(.horizontal)
            ForEach(vm.cotizaciones.prefix(8)) { c in
                CrmCotCard(item: c).padding(.horizontal)
            }
        }
    }

    // ── Leads
    private var leadsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            CrmSectionRow(title: "Leads · Solicitudes", detail: "\(vm.leads.count) total")
                .padding(.horizontal)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(vm.leads.prefix(8), id: \.crmId) { lead in
                        CrmLeadCard(item: lead)
                    }
                }
                .padding(.horizontal)
            }
        }
    }
}

// MARK: – Subviews

private struct CrmKpi: View {
    let icon: String; let label: String; let value: String; let sub: String; let accent: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(icon).font(.title3)
                Text(label).font(.caption).foregroundColor(accent).lineLimit(1)
            }
            Text(value).font(.title2).bold()
            Text(sub).font(.caption2).foregroundColor(.secondary).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(accent.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct CrmSectionRow: View {
    let title: String; let detail: String
    var body: some View {
        HStack {
            Text(title).font(.headline)
            Spacer()
            Text(detail).font(.caption).foregroundColor(.secondary)
        }
    }
}

private struct CrmStatusBar: View {
    let status: String; let count: Int; let percent: Double
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(status).font(.subheadline)
                Spacer()
                Text("\(count)  (\(Int(percent * 100))%)").font(.caption).foregroundColor(.secondary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3).fill(Color(.systemFill)).frame(height: 6)
                    RoundedRectangle(cornerRadius: 3).fill(cotColor(status))
                        .frame(width: geo.size.width * CGFloat(max(0, min(percent, 1))), height: 6)
                }
            }
            .frame(height: 6)
        }
    }
}

private struct CrmCotCard: View {
    let item: Cotizacion
    var body: some View {
        let color = cotColor(item.estatus)

        HStack(spacing: 12) {
            Rectangle().fill(color).frame(width: 4)
                .clipShape(RoundedRectangle(cornerRadius: 2))
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(item.displayFolio).font(.subheadline).bold().foregroundColor(.teal)
                    Spacer()
                    Text(fmtMxn(item.total)).font(.subheadline).bold()
                }
                HStack {
                    if !item.cliente.isEmpty { Text(item.cliente).font(.caption).foregroundColor(.secondary) }
                    Spacer()
                    if !item.estatus.isEmpty {
                        Text(item.estatus).font(.caption2).bold().foregroundColor(color)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(color.opacity(0.12)).clipShape(Capsule())
                    }
                }
                if !item.dateLabel.isEmpty {
                    Text(item.dateLabel).font(.caption2).foregroundColor(.secondary)
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct CrmLeadCard: View {
    let item: [String: Any]
    var body: some View {
        let title  = cStr(item, "title", "subject", "asunto").ifBlank("Lead")
        let client = cStr(item, "clientName", "cliente")
        let status = cStr(item, "status", "estatus").ifBlank("–")
        VStack(alignment: .leading, spacing: 6) {
            Text("🎯").font(.title2)
            Text(title).font(.subheadline).bold().lineLimit(2)
            if !client.isEmpty { Text(client).font(.caption).foregroundColor(.secondary).lineLimit(1) }
            Text(status).font(.caption2).bold().foregroundColor(.orange)
                .padding(.horizontal, 7).padding(.vertical, 2)
                .background(Color.orange.opacity(0.12)).clipShape(Capsule())
        }
        .frame(width: 160)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

// MARK: – Helpers

private func cStr(_ m: [String: Any], _ keys: String...) -> String {
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

private func cDouble(_ m: [String: Any], _ key: String) -> Double? {
    if let d = m[key] as? Double { return d }
    if let n = m[key] as? NSNumber { return n.doubleValue }
    if let s = m[key] as? String { return Double(s) }
    return nil
}

private func fmtMxn(_ v: Double) -> String {
    let n = NumberFormatter()
    n.numberStyle = .currency; n.currencySymbol = "$"; n.maximumFractionDigits = 0
    return n.string(from: NSNumber(value: v)) ?? "$\(Int(v))"
}

private func cotColor(_ s: String) -> Color {
    let l = s.localizedLowercase
    if l.contains("aprobad") { return .green }
    if l.contains("enviada") { return .blue }
    if l.contains("rechazad") || l.contains("vencid") { return .red }
    return .orange
}

extension String {
    fileprivate func ifBlank(_ fallback: String) -> String { isEmpty ? fallback : self }
}

extension [String: Any] {
    fileprivate var crmId: String {
        if let n = self["id"] as? Int { return String(n) }
        if let s = self["id"] as? String { return s }
        return UUID().uuidString
    }
}

private func crmDashDouble(_ m: [String: Any], _ key: String) -> Double {
    if let d = m[key] as? Double { return d }
    if let n = m[key] as? NSNumber { return n.doubleValue }
    if let s = m[key] as? String, let d = Double(s) { return d }
    return 0
}

private func crmDashFmtMxn(_ v: Double) -> String { fmtMxn(v) }

private func crmDashFmtPct(_ v: Double) -> String { String(format: "%.1f%%", v) }
