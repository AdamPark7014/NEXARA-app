import SwiftUI

// MARK: - WMS móvil (recepción / despacho / transferencia / conteo / historial)

@MainActor
final class WarehouseWmsVM: ObservableObject {
    @Published var stock: [StockLevel] = []
    @Published var warehouses: [WarehouseItem] = []
    @Published var alerts: [StockLevel] = []
    @Published var products: [CatalogProduct] = []
    @Published var movements: [StockMovement] = []
    @Published var tab = 0
    @Published var query = ""
    @Published var skuQuery = ""
    @Published var isLoading = false
    @Published var acting = false
    @Published var message: String?

    var canManage: Bool {
        let u = SessionStore.shared.currentUser
        if u?.isSuperAdmin == true { return true }
        let perms = u?.permissions ?? []
        return perms.contains { $0.contains("stock.manage") || $0.contains("warehouse.manage") || $0.contains("console.admin") }
    }

    var filteredStock: [StockLevel] {
        guard !query.isEmpty else { return stock }
        let q = query.lowercased()
        return stock.filter {
            $0.name.lowercased().contains(q) ||
            $0.sku.lowercased().contains(q) ||
            ($0.warehouseName ?? "").lowercased().contains(q)
        }
    }

    var filteredWh: [WarehouseItem] {
        guard !query.isEmpty else { return warehouses }
        let q = query.lowercased()
        return warehouses.filter {
            $0.name.lowercased().contains(q) ||
            $0.code.lowercased().contains(q) ||
            ($0.city ?? "").lowercased().contains(q)
        }
    }

    var lowCount: Int { max(alerts.count, stock.filter(\.isLow).count) }
    var totalUnits: Int {
        Int(stock.reduce(0.0) { $0 + $1.quantity })
    }

    func load() {
        isLoading = true
        Task {
            async let s = ExtraRepository.shared.stockLevels()
            async let w = ExtraRepository.shared.warehouseItems()
            async let a = ExtraRepository.shared.lowStockLevels()
            async let m = ExtraRepository.shared.stockMovementItems()
            stock = await s
            warehouses = await w
            alerts = await a
            movements = await m
            if canManage {
                products = await ExtraRepository.shared.catalogProductItems()
            }
            isLoading = false
        }
    }

    func createMovement(
        type: String,
        productId: Int64,
        quantity: Double,
        fromWarehouseId: Int64?,
        toWarehouseId: Int64?,
        unitCost: Double?,
        reference: String?,
        notes: String?
    ) async -> Bool {
        acting = true; message = nil
        defer { acting = false }
        do {
            try await ExtraRepository.shared.createStockMovement(
                type: type,
                productId: productId,
                quantity: quantity,
                fromWarehouseId: fromWarehouseId,
                toWarehouseId: toWarehouseId,
                unitCost: unitCost,
                reference: reference,
                notes: notes
            )
            message = "✅ Movimiento registrado"
            load()
            return true
        } catch {
            message = "❌ \(error.localizedDescription)"
            return false
        }
    }
}

struct WarehouseWmsView: View {
    var initialTab: Int = 0
    @StateObject private var vm = WarehouseWmsVM()
    @State private var selected: StockLevel?
    @State private var mode: Mode?
    @State private var productId: Int64?
    @State private var productLabel = ""
    @State private var warehouseId: Int64?
    @State private var warehouseLabel = ""
    @State private var toWarehouseId: Int64?
    @State private var toWarehouseLabel = ""
    @State private var qtyText = ""
    @State private var countedText = ""
    @State private var unitCostText = ""
    @State private var reference = ""
    @State private var notes = ""
    @State private var pickProduct = false
    @State private var pickWarehouse = false
    @State private var pickToWarehouse = false
    @State private var scanBarcode = false

    enum Mode { case receive, issue, count, transfer }

    var body: some View {
        Group {
            if scanBarcode {
                BarcodeScannerView(
                    onResult: { code in
                        vm.skuQuery = code
                        vm.query = code
                        scanBarcode = false
                        pickProduct = true
                    },
                    onCancel: { scanBarcode = false }
                )
            }
            else if pickProduct { productPicker }
            else if pickWarehouse || pickToWarehouse { warehousePicker }
            else if let mode { movementForm(mode) }
            else if let selected { detail(selected) }
            else { hub }
        }
        .navigationTitle(selected == nil && mode == nil ? "Almacén WMS" : "")
        .onAppear { vm.tab = min(max(initialTab, 0), 3) }
        .toolbar {
            if selected == nil && mode == nil && !pickProduct && !pickWarehouse && !pickToWarehouse {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { vm.load() } label: { Image(systemName: "arrow.clockwise") }
                }
            }
        }
        .refreshable { if selected == nil && mode == nil { vm.load() } }
        .task { vm.load() }
    }

    private var hub: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                NxSectionHeader(title: "Almacén WMS", subtitle: "Recepción · despacho · transferencia · conteo")
                    .padding(.horizontal)
                NxKpiGrid(items: [
                    NxKpi(label: "SKUs", value: "\(vm.stock.count)", tone: .brand),
                    NxKpi(label: "Unidades", value: "\(vm.totalUnits)", tone: .info),
                    NxKpi(label: "Stock bajo", value: "\(vm.lowCount)", hint: "≤ reorder",
                          tone: vm.lowCount > 0 ? .danger : .success),
                    NxKpi(label: "Movimientos", value: "\(vm.movements.count)", tone: .neutral),
                ]).padding(.horizontal)

                if vm.lowCount > 0 {
                    NxAlertBanner(alert: NxAlert(
                        id: "low",
                        title: "\(vm.lowCount) SKUs bajo reorden",
                        subtitle: "Prioriza recepción",
                        tone: .danger
                    ), actionLabel: "Ver") {
                        vm.tab = 2
                    }
                    .padding(.horizontal)
                }

                if let msg = vm.message {
                    Text(msg).font(.footnote.weight(.semibold))
                        .foregroundColor(msg.hasPrefix("✅") ? .green : .red)
                        .padding(.horizontal)
                }

                if vm.canManage {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            Button("+ Recibir") { open(.receive) }.buttonStyle(.borderedProminent).tint(.green)
                            Button("Despachar") { open(.issue) }.buttonStyle(.bordered)
                            Button("Transferir") { open(.transfer) }.buttonStyle(.bordered)
                            Button("Conteo") { open(.count) }.buttonStyle(.borderedProminent).tint(.teal)
                        }.padding(.horizontal)
                    }
                }

                Picker("Tab", selection: $vm.tab) {
                    Text("Inventario").tag(0)
                    Text("Bodegas").tag(1)
                    Text("Alertas (\(vm.lowCount))").tag(2)
                    Text("Movimientos").tag(3)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Buscar…", text: $vm.query).autocorrectionDisabled()
                }
                .padding(10)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)

                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    switch vm.tab {
                    case 1:
                        ForEach(vm.filteredWh.prefix(60), id: \.rowKey) { row in
                            whCard(row).padding(.horizontal)
                        }
                    case 2:
                        if vm.alerts.isEmpty {
                            Text("Sin alertas — inventario saludable")
                                .foregroundColor(.green)
                                .frame(maxWidth: .infinity)
                                .padding()
                        } else {
                            ForEach(vm.alerts.prefix(60), id: \.rowKey) { row in
                                Button { selected = row; vm.tab = 0 } label: {
                                    alertCard(row)
                                }
                                .buttonStyle(.plain)
                                .padding(.horizontal)
                            }
                        }
                    case 3:
                        if vm.movements.isEmpty {
                            Text("Sin movimientos registrados")
                                .foregroundColor(.secondary)
                                .frame(maxWidth: .infinity)
                                .padding()
                        } else {
                            ForEach(vm.movements.prefix(80), id: \.rowKey) { row in
                                movementCard(row).padding(.horizontal)
                            }
                        }
                    default:
                        ForEach(vm.filteredStock.prefix(80), id: \.rowKey) { row in
                            Button { selected = row } label: { stockCard(row) }
                                .buttonStyle(.plain)
                                .padding(.horizontal)
                        }
                    }
                }
                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
    }

    private func stockCard(_ row: StockLevel) -> some View {
        let qty = row.quantity
        let low = row.isLow
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(row.name.isEmpty ? "Producto" : row.name).font(.subheadline).bold()
                Text("\(row.sku) · \(row.warehouseName ?? "")")
                    .font(.caption2).foregroundColor(.secondary).lineLimit(1)
            }
            Spacer()
            Text("\(Int(qty))").font(.headline).bold().foregroundColor(low ? .red : .teal)
        }
        .padding(12)
        .background(low ? Color.red.opacity(0.08) : Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func alertCard(_ row: StockLevel) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(row.name).font(.subheadline).bold().foregroundColor(.red)
            Text("Existencia \(Int(row.quantity)) · reorder \(row.reorderPoint.map { "\(Int($0))" } ?? row.minStock.map { "\(Int($0))" } ?? "—")")
                .font(.caption).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.red.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func whCard(_ row: WarehouseItem) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(row.name.isEmpty ? "Bodega" : row.name).font(.subheadline).bold()
            Text([row.code, row.city, row.address].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.caption).foregroundColor(.secondary)
            if row.stockLevelsCount > 0 || row.locationsCount > 0 {
                Text("\(row.stockLevelsCount) SKUs · \(row.locationsCount) ubicaciones")
                    .font(.caption2).foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func movementCard(_ row: StockMovement) -> some View {
        let type = row.type.isEmpty ? "MOV" : row.type
        let qty = Int(row.quantity)
        let from = row.fromWarehouseName ?? ""
        let to = row.toWarehouseName ?? ""
        let route: String = {
            if !from.isEmpty && !to.isEmpty { return "\(from) → \(to)" }
            if !to.isEmpty { return "→ \(to)" }
            if !from.isEmpty { return "← \(from)" }
            return ""
        }()
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(type).font(.subheadline).bold().foregroundColor(.teal)
                Spacer()
                Text("\(qty) uds").font(.subheadline).bold()
            }
            Text(row.productName.isEmpty ? (row.sku.isEmpty ? "Producto" : row.sku) : row.productName).font(.caption)
            if !route.isEmpty {
                Text(route).font(.caption2).foregroundColor(.secondary)
            }
            let meta = [row.reference ?? "", String((row.createdAt ?? "").prefix(16))]
                .filter { !$0.isEmpty }.joined(separator: " · ")
            if !meta.isEmpty {
                Text(meta).font(.caption2).foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func detail(_ row: StockLevel) -> some View {
        let qty = row.quantity
        return List {
            Section { Button("← Inventario") { selected = nil } }
            Section("Producto") {
                whRow("Nombre", row.name)
                whRow("SKU", row.sku)
                whRow("Existencia", "\(Int(qty)) uds")
                whRow("Reorder", row.reorderPoint.map { "\(Int($0))" } ?? row.minStock.map { "\(Int($0))" } ?? "")
                whRow("Bodega", row.warehouseName ?? "")
            }
            if vm.canManage {
                Section("Acciones") {
                    Button("Recibir") { open(.receive, row) }
                    Button("Despachar") { open(.issue, row) }
                    Button("Transferir") { open(.transfer, row) }
                    Button("Conteo físico") { open(.count, row) }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func movementForm(_ mode: Mode) -> some View {
        Form {
            Section(modeTitle(mode)) {
                Button(productLabel.isEmpty ? "Seleccionar producto / SKU" : "Producto: \(productLabel)") {
                    pickProduct = true
                }
                Button(
                    warehouseLabel.isEmpty
                        ? (mode == .transfer ? "Bodega origen" : "Seleccionar bodega")
                        : (mode == .transfer ? "Origen: \(warehouseLabel)" : "Bodega: \(warehouseLabel)")
                ) {
                    pickWarehouse = true
                }
                if mode == .transfer {
                    Button(toWarehouseLabel.isEmpty ? "Bodega destino" : "Destino: \(toWarehouseLabel)") {
                        pickToWarehouse = true
                    }
                }
                if mode == .count {
                    if let sel = selected {
                        Text("Existencia sistema: \(Int(sel.quantity))")
                    }
                    TextField("Cantidad contada", text: $countedText).keyboardType(.decimalPad)
                } else {
                    TextField("Cantidad", text: $qtyText).keyboardType(.decimalPad)
                }
                if mode == .receive {
                    TextField("Costo unitario (opcional)", text: $unitCostText).keyboardType(.decimalPad)
                }
                TextField("Referencia", text: $reference)
                TextField("Notas", text: $notes, axis: .vertical).lineLimit(2...4)
            }
            if let msg = vm.message {
                Section { Text(msg).foregroundColor(msg.hasPrefix("✅") ? .green : .red) }
            }
            Section {
                Button(vm.acting ? "Registrando…" : "Confirmar") {
                    Task { await submit(mode) }
                }
                .disabled(vm.acting)
                Button("Cancelar", role: .cancel) { self.mode = nil; resetForm() }
            }
        }
    }

    private var productPicker: some View {
        let sourceMaps: [[String: Any]] = vm.products.isEmpty
            ? vm.stock.map { $0.toFlatMap() }
            : vm.products.map { $0.toFlatMap() }
        let q = (vm.skuQuery.isEmpty ? vm.query : vm.skuQuery).lowercased()
        let ranked: [(Int, [String: Any])] = sourceMaps.map { p in
            let sku = whStr(p, "sku", "code").lowercased()
            let name = whStr(p, "name", "productName", "nombre").lowercased()
            let score: Int
            if q.isEmpty { score = 3 }
            else if sku == q { score = 0 }
            else if sku.hasPrefix(q) { score = 1 }
            else if sku.contains(q) || name.contains(q) { score = 2 }
            else { score = 9 }
            return (score, p)
        }.filter { $0.0 < 9 || q.isEmpty }.sorted { $0.0 < $1.0 }

        return List {
            Section {
                Button("← Cancelar") { pickProduct = false; vm.skuQuery = ""; vm.query = "" }
                Button {
                    scanBarcode = true
                } label: {
                    Label("Escanear código de barras", systemImage: "barcode.viewfinder")
                }
                TextField("Escanear o escribir SKU…", text: Binding(
                    get: { vm.skuQuery.isEmpty ? vm.query : vm.skuQuery },
                    set: { vm.skuQuery = $0; vm.query = $0 }
                ))
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                Text("Prioriza coincidencia exacta de SKU")
                    .font(.caption2).foregroundColor(.secondary)
            }
            ForEach(ranked.prefix(80), id: \.1.whKey) { score, p in
                let sku = whStr(p, "sku", "code")
                let exact = !q.isEmpty && sku.lowercased() == q
                Button {
                    productId = whInt64(p, "productId", "id")
                    var label = whStr(p, "name", "productName", "sku")
                    if !sku.isEmpty { label += " (\(sku))" }
                    productLabel = label
                    pickProduct = false
                    vm.query = ""
                    vm.skuQuery = ""
                } label: {
                    VStack(alignment: .leading) {
                        Text(whStr(p, "name", "productName")).bold()
                        Text(exact ? "✓ SKU \(sku)" : sku)
                            .font(.caption)
                            .foregroundColor(exact ? .teal : .secondary)
                    }
                }
                .listRowBackground(exact ? Color.teal.opacity(0.12) : nil)
            }
        }
    }

    private var warehousePicker: some View {
        let choosingTo = pickToWarehouse
        return List {
            Section {
                Button("← Cancelar") { pickWarehouse = false; pickToWarehouse = false }
            } header: {
                Text(choosingTo ? "Bodega destino" : "Bodega origen")
            }
            ForEach(vm.warehouses, id: \.rowKey) { w in
                Button {
                    let id = w.id
                    let label = w.label
                    if choosingTo {
                        toWarehouseId = id
                        toWarehouseLabel = label
                        pickToWarehouse = false
                    } else {
                        warehouseId = id
                        warehouseLabel = label
                        pickWarehouse = false
                    }
                } label: {
                    VStack(alignment: .leading) {
                        Text(w.name.isEmpty ? w.code : w.name).bold()
                        Text(w.code).font(.caption).foregroundColor(.secondary)
                    }
                }
            }
        }
    }

    private func open(_ m: Mode, _ row: StockLevel? = nil) {
        resetForm()
        mode = m
        selected = row
        if let row {
            productId = row.productId ?? row.id
            productLabel = row.name.isEmpty ? row.sku : row.name
            warehouseId = row.warehouseId
            warehouseLabel = row.warehouseName ?? ""
            if m == .count {
                countedText = "\(Int(row.quantity))"
            }
        }
    }

    private func resetForm() {
        productId = nil; productLabel = ""
        warehouseId = nil; warehouseLabel = ""
        toWarehouseId = nil; toWarehouseLabel = ""
        qtyText = ""; countedText = ""; unitCostText = ""
        reference = ""; notes = ""
        pickProduct = false; pickWarehouse = false; pickToWarehouse = false
        vm.skuQuery = ""
    }

    private func modeTitle(_ m: Mode) -> String {
        switch m {
        case .receive: return "Recepción"
        case .issue: return "Despacho"
        case .count: return "Conteo físico"
        case .transfer: return "Transferencia entre bodegas"
        }
    }

    private func submit(_ mode: Mode) async {
        guard let pid = productId, let wid = warehouseId else {
            vm.message = "❌ Selecciona producto y bodega"
            return
        }
        switch mode {
        case .receive:
            guard let qty = Double(qtyText), qty > 0 else { vm.message = "❌ Cantidad inválida"; return }
            let ok = await vm.createMovement(
                type: "RECEIPT", productId: pid, quantity: qty,
                fromWarehouseId: nil, toWarehouseId: wid,
                unitCost: Double(unitCostText), reference: reference.nilIfEmpty, notes: notes.nilIfEmpty
            )
            if ok { self.mode = nil; selected = nil; resetForm() }
        case .issue:
            guard let qty = Double(qtyText), qty > 0 else { vm.message = "❌ Cantidad inválida"; return }
            let ok = await vm.createMovement(
                type: "DISPATCH", productId: pid, quantity: qty,
                fromWarehouseId: wid, toWarehouseId: nil,
                unitCost: nil, reference: reference.nilIfEmpty, notes: notes.nilIfEmpty
            )
            if ok { self.mode = nil; selected = nil; resetForm() }
        case .transfer:
            guard let qty = Double(qtyText), qty > 0 else { vm.message = "❌ Cantidad inválida"; return }
            guard let toId = toWarehouseId else { vm.message = "❌ Selecciona bodega destino"; return }
            guard toId != wid else { vm.message = "❌ Origen y destino deben ser distintos"; return }
            let ok = await vm.createMovement(
                type: "TRANSFER", productId: pid, quantity: qty,
                fromWarehouseId: wid, toWarehouseId: toId,
                unitCost: nil, reference: reference.nilIfEmpty, notes: notes.nilIfEmpty
            )
            if ok { self.mode = nil; selected = nil; resetForm() }
        case .count:
            guard let counted = Double(countedText), counted >= 0 else { vm.message = "❌ Conteo inválido"; return }
            let onHand = selected?.quantity ?? 0
            let delta = counted - onHand
            if delta == 0 { vm.message = "✅ Sin diferencia"; return }
            let ok: Bool
            if delta > 0 {
                ok = await vm.createMovement(
                    type: "ADJUSTMENT", productId: pid, quantity: abs(delta),
                    fromWarehouseId: nil, toWarehouseId: wid,
                    unitCost: nil, reference: reference.nilIfEmpty ?? "CONTEO",
                    notes: notes.nilIfEmpty ?? "Conteo físico (+\(Int(delta)))"
                )
            } else {
                ok = await vm.createMovement(
                    type: "ADJUSTMENT", productId: pid, quantity: abs(delta),
                    fromWarehouseId: wid, toWarehouseId: nil,
                    unitCost: nil, reference: reference.nilIfEmpty ?? "CONTEO",
                    notes: notes.nilIfEmpty ?? "Conteo físico (\(Int(delta)))"
                )
            }
            if ok { self.mode = nil; selected = nil; resetForm() }
        }
    }

    @ViewBuilder private func whRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value) }
        }
    }
}

// MARK: Helpers

private func whStr(_ m: [String: Any], _ keys: String...) -> String {
    for k in keys {
        if let s = m[k] as? String, !s.isEmpty, s != "null" { return s }
        if let n = m[k] as? NSNumber { return n.stringValue }
        if let nested = m[k] as? [String: Any] {
            if let s = nested["name"] as? String ?? nested["nombre"] as? String ?? nested["code"] as? String {
                return s
            }
        }
    }
    return ""
}

private func whDouble(_ m: [String: Any], _ keys: String...) -> Double? {
    for k in keys {
        if let n = m[k] as? Double { return n }
        if let n = m[k] as? NSNumber { return n.doubleValue }
        if let s = m[k] as? String, let d = Double(s) { return d }
    }
    return nil
}

private func whInt64(_ m: [String: Any], _ keys: String...) -> Int64? {
    for k in keys {
        if let n = m[k] as? Int64 { return n }
        if let n = m[k] as? Int { return Int64(n) }
        if let n = m[k] as? NSNumber { return n.int64Value }
        if let s = m[k] as? String, let v = Int64(s) { return v }
    }
    return nil
}

private func whIsLow(_ m: [String: Any]) -> Bool {
    let qty = whDouble(m, "quantity", "cantidad") ?? 0
    let reorder = whDouble(m, "reorderPoint", "minStock") ?? 0
    return reorder > 0 && qty <= reorder
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}

private extension Dictionary where Key == String, Value == Any {
    var whKey: String {
        if let id = self["id"] ?? self["productId"] { return "wh-\(id)" }
        return UUID().uuidString
    }
    var whMoveKey: String {
        if let id = self["id"] { return "mov-\(id)" }
        return UUID().uuidString
    }
}
