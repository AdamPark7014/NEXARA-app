import SwiftUI

struct SupplierStatsSection: View {
    let stats: [String: Any]?
    let loading: Bool
    let error: String?
    let onRefresh: () -> Void

    var body: some View {
        if loading && stats == nil {
            HStack {
                ProgressView()
                Text("Cargando economía por mayorista…").font(.caption)
            }
        } else if let error, stats == nil {
            VStack(alignment: .leading, spacing: 6) {
                Text(error).font(.caption).foregroundStyle(.red)
                Button("Reintentar", action: onRefresh)
            }
        } else if let stats {
            let suppliers = stats["suppliers"] as? [[String: Any]] ?? []
            if suppliers.isEmpty { EmptyView() } else {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Economía por mayorista").font(.headline)
                        Spacer()
                        Button("Actualizar", action: onRefresh).disabled(loading)
                    }
                    if let totals = stats["totals"] as? [String: Any] {
                        let margin = ConsoleHelpers.mapDouble(totals, "marginPercent")
                        let sellWithTax = ConsoleHelpers.mapDouble(totals, "sellWithTax")
                        Text("Margen global: \(String(format: "%.1f", margin))% · \(fmtMoney(sellWithTax)) c/IVA")
                            .font(.caption)
                            .padding(8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.teal.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    ForEach(suppliers.indices, id: \.self) { idx in
                        let row = suppliers[idx]
                        VStack(alignment: .leading, spacing: 4) {
                            Text(
                                ConsoleHelpers.mapStr(row, "label", "supplierCode").isEmpty
                                    ? "Proveedor"
                                    : ConsoleHelpers.mapStr(row, "label", "supplierCode")
                            )
                            .font(.subheadline.weight(.semibold))
                            Text(
                                "\(ConsoleHelpers.mapInt(row, "quoteCount")) cotiz. · \(ConsoleHelpers.mapInt(row, "lineCount")) partidas"
                            )
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            HStack {
                                Text("Margen")
                                Spacer()
                                Text(
                                    "\(fmtMoney(ConsoleHelpers.mapDouble(row, "marginAmount"))) (\(String(format: "%.1f", ConsoleHelpers.mapDouble(row, "marginPercent")))%)"
                                )
                                .font(.caption.weight(.semibold))
                            }
                        }
                        .padding(8)
                        .background(Color(.secondarySystemGroupedBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        } else {
            EmptyView()
        }
    }

    private func fmtMoney(_ value: Double) -> String {
        String(format: "$%.0f MXN", value)
    }
}
