import SwiftUI

/// Bodega + almacén en un hub (sin duplicar dashboards).
struct WarehouseHubView: View {
    var initialTab: Int = 0
    @State private var tab = 0
    @State private var warehouses: [[String: Any]] = []
    @State private var stock: [[String: Any]] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var selected: [String: Any]?

    private var items: [[String: Any]] { tab == 0 ? warehouses : stock }

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            whStr($0, "name", "nombre", "productName").lowercased().contains(q) ||
            whStr($0, "code", "sku", "codigo").lowercased().contains(q)
        }
    }

    private var lowStock: Int {
        stock.filter { (whDouble($0, "quantity", "cantidad", "stock") ?? 99) < 5 }.count
    }

    var body: some View {
        Group {
            if let s = selected { whDetail(s) } else { whList }
        }
        .navigationTitle(selected == nil ? (tab == 0 ? "Bodega" : "Almacén") : "")
        .onAppear { tab = initialTab }
        .task { await reload() }
        .refreshable { if selected == nil { await reload() } }
    }

    @ViewBuilder private func whDetail(_ row: [String: Any]) -> some View {
        List {
            Section { Button(tab == 0 ? "← Bodega" : "← Almacén") { selected = nil } }
            Section(tab == 0 ? "Bodega" : "Producto") {
                whRow("Nombre",     whStr(row, "name", "nombre", "productName"))
                whRow("Código",     whStr(row, "code", "sku", "codigo"))
                whRow("Categoría",  whStr(row, "category", "categoria", "type"))
                whRow("Ubicación",  whStr(row, "location", "ubicacion", "address"))
                if tab == 0 {
                    whRow("Responsable", whStr(row, "managerName", "responsable"))
                    whRow("Capacidad",   whStr(row, "capacity", "capacidad"))
                } else {
                    if let q = whDouble(row, "quantity", "cantidad", "stock") {
                        whRow("Cantidad", "\(Int(q)) uds")
                    }
                    if let min = whDouble(row, "minStock", "stockMinimo") {
                        whRow("Stock mínimo", "\(Int(min))")
                    }
                    if let p = whDouble(row, "price", "precio") {
                        whRow("Precio", "$\(Int(p))")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func whRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value).multilineTextAlignment(.trailing) }
        }
    }

    private var whList: some View {
        VStack(spacing: 0) {
            Picker("Sección", selection: $tab) {
                Text("Bodegas").tag(0)
                Text("Stock").tag(1)
            }
            .pickerStyle(.segmented)
            .padding()

            if tab == 1 && !stock.isEmpty {
                HStack(spacing: 0) {
                    whKpi("SKUs", "\(stock.count)", .primary)
                    Divider().frame(height: 32)
                    whKpi("Bajo mínimo", "\(lowStock)", lowStock > 0 ? .red : .green)
                }
                .padding(.horizontal).padding(.bottom, 8)
            }

            HStack {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("Buscar…", text: $query).autocorrectionDisabled()
            }
            .padding(10)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)

            if isLoading {
                Spacer(); ProgressView(); Spacer()
            } else if filtered.isEmpty {
                Spacer()
                Text("Sin registros").foregroundColor(.secondary)
                Spacer()
            } else {
                List(filtered.prefix(100), id: \.whId) { row in
                    Button { selected = row } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(whStr(row, "name", "nombre", "productName", "title")).font(.headline).foregroundColor(.primary)
                            Text(whStr(row, "code", "sku", "codigo", "location", "ubicacion"))
                                .font(.caption).foregroundColor(.secondary)
                            if tab == 1, let q = whDouble(row, "quantity", "cantidad", "stock") {
                                Text("Cantidad: \(Int(q))").font(.caption2).foregroundColor(q < 5 ? .red : .secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }
                .listStyle(.plain)
            }
        }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        async let w = ExtraRepository.shared.warehouse()
        async let s = ExtraRepository.shared.stock()
        warehouses = await w
        stock = await s
    }
}

private struct whKpi: View {
    let label: String; let value: String; let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

private func whStr(_ m: [String: Any], _ keys: String...) -> String {
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

private func whDouble(_ m: [String: Any], _ keys: String...) -> Double? {
    for k in keys {
        if let v = m[k] as? Double { return v }
        if let v = m[k] as? NSNumber { return v.doubleValue }
        if let v = m[k] as? String, let d = Double(v) { return d }
    }
    return nil
}

extension [String: Any] {
    fileprivate var whId: String { "wh-\(self["id"] ?? UUID().uuidString)" }
}
