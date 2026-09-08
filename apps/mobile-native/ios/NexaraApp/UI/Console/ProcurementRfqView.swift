import SwiftUI

/// RFQ — peticiones de cotización y su comparativa por proveedor.
///
/// Pantalla propia y no una quinta pestaña dentro de `ProcurementModuleView`:
/// el selector segmentado ya lleva cuatro secciones y una quinta etiqueta no
/// cabe legible en un teléfono.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// SOLO CONSULTA, a propósito. No hay adjudicar (`POST rfq/:id/award`, que crea
/// una orden de compra y compromete dinero), ni cancelar (`PATCH
/// rfq/:id/cancel`), ni capturar precios (`POST rfq/:id/lines/:id/quote`). Lo
/// que sí aporta el móvil es la comparativa ya hecha: quién sale más barato y
/// quién entrega antes.
/// ─────────────────────────────────────────────────────────────────────────────
struct ProcurementRfqView: View {
    @State private var items: [RfqItem] = []
    @State private var comparison: RfqComparison?
    @State private var selected: RfqItem?
    @State private var isLoading = true
    @State private var isLoadingCompare = false
    @State private var query = ""

    private var filtered: [RfqItem] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.displayTitle.lowercased().contains(q) ||
            $0.requisitionNumber.lowercased().contains(q) ||
            $0.requisitionTitle.lowercased().contains(q)
        }
    }

    var body: some View {
        Group {
            if let s = selected { detail(s) } else { listBody }
        }
        .navigationTitle(selected == nil ? "Cotizaciones (RFQ)" : "")
        .task { await reload() }
        .refreshable { if selected == nil { await reload() } }
    }

    private var listBody: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("Buscar RFQ…", text: $query).autocorrectionDisabled()
            }
            .padding(10)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)
            .padding(.top, 8)

            if isLoading {
                Spacer(); ProgressView(); Spacer()
            } else if filtered.isEmpty {
                NxEmptyState(
                    title: "Sin cotizaciones",
                    subtitle: "No hay peticiones de cotización registradas.",
                    actionLabel: "Actualizar",
                    onAction: { Task { await reload() } }
                )
            } else {
                List(filtered.prefix(80), id: \.rowKey) { r in
                    Button {
                        selected = r
                        loadComparison(r.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(r.displayTitle).font(.headline)
                                Spacer()
                                Text(r.status).font(.caption2).bold().foregroundColor(rfqColor(r))
                            }
                            if !r.requisitionTitle.isEmpty {
                                Text(r.requisitionTitle).font(.caption).foregroundColor(.secondary).lineLimit(1)
                            }
                            HStack {
                                Text("\(r.linesCount) líneas").font(.caption2).foregroundColor(.secondary)
                                Spacer()
                                if !r.dueLabel.isEmpty {
                                    Text("Vence \(r.dueLabel)").font(.caption2).foregroundColor(.orange)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func detail(_ r: RfqItem) -> some View {
        List {
            Section {
                Button("← Cotizaciones") { selected = nil; comparison = nil }
            }
            Section("RFQ") {
                row("Número", r.displayTitle)
                row("Estado", r.status)
                row("Requisición", [r.requisitionNumber, r.requisitionTitle].filter { !$0.isEmpty }.joined(separator: " · "))
                row("Vence", r.dueLabel)
                if let c = comparison, !c.awardedPoNumber.isEmpty {
                    row("Adjudicada a OC", c.awardedPoNumber)
                }
            }
            Section {
                if isLoadingCompare {
                    ProgressView().frame(maxWidth: .infinity)
                } else if let c = comparison, !c.suppliers.isEmpty {
                    ForEach(c.suppliers, id: \.rowKey) { s in
                        supplierBlock(s, comparison: c)
                    }
                } else {
                    Text("Todavía no hay cotizaciones capturadas para esta RFQ.")
                        .font(.caption).foregroundColor(.secondary)
                }
            } header: {
                Text("Comparativa")
            } footer: {
                Text("Adjudicar y capturar precios se hacen en la web.")
                    .font(.caption2)
            }
            if !r.notes.isEmpty {
                Section("Notas") { Text(r.notes).font(.subheadline) }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder
    private func supplierBlock(_ s: RfqSupplierQuote, comparison c: RfqComparison) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(s.supplierName.isEmpty ? "Proveedor \(s.supplierId)" : s.supplierName)
                    .font(.subheadline).bold().lineLimit(1)
                Spacer()
                Text(fmtRfq(s.totalPrice)).font(.subheadline).bold()
            }
            HStack(spacing: 6) {
                if c.bestPriceSupplierId == s.supplierId {
                    badge("Mejor precio", .green)
                }
                if c.bestLeadTimeSupplierId == s.supplierId {
                    badge("Mejor plazo", .blue)
                }
                if !s.isComplete {
                    // Una cotización incompleta no se puede adjudicar: la API lo
                    // rechaza. Mejor verlo aquí que descubrirlo al intentarlo.
                    badge("Incompleta", .orange)
                }
            }
            HStack {
                Text(s.coverageLabel).font(.caption2).foregroundColor(.secondary)
                Spacer()
                if s.maxLeadTimeDays > 0 {
                    Text("\(s.maxLeadTimeDays) días").font(.caption2).foregroundColor(.secondary)
                }
            }
            ForEach(s.lines, id: \.rowKey) { line in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(line.displayDescription).font(.caption).lineLimit(2)
                        Text("Cant. \(fmtRfqQty(line.quantity))").font(.caption2).foregroundColor(.secondary)
                    }
                    Spacer()
                    if let total = line.lineTotal {
                        Text(fmtRfq(total)).font(.caption2)
                    } else {
                        Text("sin cotizar").font(.caption2).foregroundColor(.orange)
                    }
                }
                .padding(.leading, 6)
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder private func row(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }

    @ViewBuilder private func badge(_ text: String, _ color: Color) -> some View {
        Text(text).font(.caption2).bold().foregroundColor(color)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(color.opacity(0.12)).clipShape(Capsule())
    }

    private func rfqColor(_ r: RfqItem) -> Color {
        if r.isAwarded { return .green }
        if r.isCancelled { return .red }
        return .secondary
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        items = await ProcurementRepository.shared.rfqs()
    }

    private func loadComparison(_ id: Int64) {
        comparison = nil
        isLoadingCompare = true
        Task { @MainActor in
            let c = await ProcurementRepository.shared.rfqComparison(id: id)
            comparison = c.hasData ? c : nil
            isLoadingCompare = false
        }
    }
}

private func fmtRfq(_ v: Double) -> String {
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.currencyCode = "MXN"
    f.maximumFractionDigits = 2
    return f.string(from: NSNumber(value: v)) ?? "$\(v)"
}

private func fmtRfqQty(_ v: Double) -> String {
    if v == v.rounded() { return String(Int(v)) }
    return String(format: "%.2f", v)
}
