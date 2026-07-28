import SwiftUI

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – Shared ops helper
// ─────────────────────────────────────────────────────────────────────────────

private func oStr(_ m: [String: Any], _ keys: String...) -> String {
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

private func oDouble(_ m: [String: Any], _ keys: String...) -> Double? {
    for k in keys {
        if let v = m[k] {
            if let d = v as? Double { return d }
            if let n = v as? NSNumber { return n.doubleValue }
            if let s = v as? String, let d = Double(s) { return d }
        }
    }
    return nil
}

private func oInt(_ m: [String: Any], _ keys: String...) -> Int? {
    for k in keys {
        if let v = m[k] {
            if let i = v as? Int { return i }
            if let n = v as? NSNumber { return n.intValue }
            if let s = v as? String, let i = Int(s) { return i }
        }
    }
    return nil
}

private func fmtOps(_ v: Double) -> String {
    if v >= 1_000_000 { return String(format: "$%.1fM", v / 1_000_000) }
    if v >= 1_000 { return String(format: "$%.0fK", v / 1_000) }
    return String(format: "$%.0f", v)
}

private func opsIdKey(_ m: [String: Any], _ prefix: String) -> String {
    if let n = m["id"] as? Int { return "\(prefix)-\(n)" }
    if let s = m["id"] as? String { return "\(prefix)-\(s)" }
    return UUID().uuidString
}

@ViewBuilder private func oRow(_ label: String, _ value: String) -> some View {
    if !value.isEmpty {
        HStack {
            Text(label).foregroundColor(.secondary)
            Spacer()
            Text(value).multilineTextAlignment(.trailing)
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – MaintenanceView (Órdenes de trabajo + activos)
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class MaintenanceVM: ObservableObject {
    @Published var orders: [WorkOrder] = []
    @Published var assets: [MaintenanceAsset] = []
    @Published var tab    = 0
    @Published var query  = ""
    @Published var isLoading = false
    @Published var selectedOrder: WorkOrder?
    @Published var selectedAsset: MaintenanceAsset?
    @Published var acting = false
    @Published var message: String?
    @Published var statusFilter = "todos"
    @Published var completeNotes = ""

    var filteredOrders: [WorkOrder] {
        let q = query.lowercased()
        return orders.filter { row in
            let st = row.status
            let matchStatus: Bool = {
                switch statusFilter {
                case "abiertas": return woIsOpen(st)
                case "progreso": return woInProgress(st)
                case "cerradas": return woIsDone(st)
                default: return true
                }
            }()
            let matchQ = q.isEmpty ||
                row.displayTitle.lowercased().contains(q) ||
                row.description.lowercased().contains(q) ||
                row.orderNumber.lowercased().contains(q) ||
                row.assetName.lowercased().contains(q)
            return matchStatus && matchQ
        }
    }
    var filteredAssets: [MaintenanceAsset] {
        guard !query.isEmpty else { return assets }
        let q = query.lowercased()
        return assets.filter {
            $0.displayName.lowercased().contains(q) ||
            $0.code.lowercased().contains(q) ||
            $0.serialNumber.lowercased().contains(q) ||
            $0.category.lowercased().contains(q)
        }
    }

    var openOrders: Int {
        orders.filter { woIsOpen($0.status) || woInProgress($0.status) }.count
    }

    func load() {
        isLoading = true
        Task {
            async let o = ExtraRepository.shared.workOrderItems()
            async let a = ExtraRepository.shared.maintenanceAssetItems()
            orders = await o; assets = await a
            isLoading = false
        }
    }

    func startOrder(_ id: Int64) async {
        acting = true; defer { acting = false }
        do {
            let coord = await DeviceLocation.shared.current()
            _ = try await OpsRepository.shared.startWorkOrder(id: id)
            message = "✅ Orden iniciada\(coord.messageSuffixOrNone)"
            selectedOrder = nil
            load()
        } catch { message = "❌ \(error.localizedDescription)" }
    }

    func completeOrder(_ id: Int64) async {
        acting = true; defer { acting = false }
        do {
            let coord = await DeviceLocation.shared.current()
            let notes = completeNotes.trimmingCharacters(in: .whitespacesAndNewlines)
            let merged = coord.mergeIntoNotes(notes.isEmpty ? nil : notes)
            _ = try await OpsRepository.shared.completeWorkOrder(
                id: id,
                notes: merged.isEmpty ? nil : merged
            )
            message = "✅ Orden completada\(coord.messageSuffixOrNone)"
            completeNotes = ""
            selectedOrder = nil
            load()
        } catch { message = "❌ \(error.localizedDescription)" }
    }
}

struct MaintenanceView: View {
    var initialTab: Int = 0
    @StateObject private var vm = MaintenanceVM()

    var body: some View {
        Group {
            if let order = vm.selectedOrder {
                orderDetail(order)
            } else if let asset = vm.selectedAsset {
                assetDetail(asset)
            } else {
                mainBody
            }
        }
        .navigationTitle("Mantenimiento")
        .onAppear { vm.tab = initialTab }
        .task { vm.load() }
    }

    private var mainBody: some View {
        VStack(spacing: 0) {
            if let msg = vm.message {
                Text(msg).font(.footnote).foregroundColor(.green).padding(.horizontal)
            }
            // KPI strip
            if !vm.orders.isEmpty || !vm.assets.isEmpty {
                HStack(spacing: 0) {
                    OpsKpi(label: "Órdenes",   value: "\(vm.orders.count)",  color: .primary)
                    Divider().frame(height: 32)
                    OpsKpi(label: "Abiertas",  value: "\(vm.openOrders)",    color: .orange)
                    Divider().frame(height: 32)
                    OpsKpi(label: "Activos",   value: "\(vm.assets.count)",  color: .blue)
                }
                .padding(.horizontal).padding(.vertical, 6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal).padding(.top, 8)
            }

            Picker("Tab", selection: $vm.tab) {
                Text("Órdenes").tag(0)
                Text("Activos").tag(1)
            }
            .pickerStyle(.segmented).padding(.horizontal).padding(.top, 8)

            if vm.tab == 0 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach([("todos","Todas"),("abiertas","Abiertas"),("progreso","En progreso"),("cerradas","Cerradas")], id: \.0) { key, label in
                            Button(label) { vm.statusFilter = key }
                                .buttonStyle(.bordered)
                                .tint(vm.statusFilter == key ? .teal : .secondary)
                        }
                    }.padding(.horizontal)
                }
                .padding(.top, 6)
            }

            // Search
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("Buscar…", text: $vm.query).autocorrectionDisabled()
                if !vm.query.isEmpty {
                    Button { vm.query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) }
                }
            }
            .padding(10)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal).padding(.top, 6).padding(.bottom, 4)

            if vm.isLoading {
                Spacer(); ProgressView(); Spacer()
            } else if vm.tab == 0 {
                List(vm.filteredOrders.prefix(60), id: \.rowKey) { item in
                    Button { vm.selectedOrder = item } label: {
                        WorkOrderRow(item: item)
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                    .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
            } else {
                List(vm.filteredAssets.prefix(60), id: \.rowKey) { item in
                    Button { vm.selectedAsset = item } label: {
                        AssetRow(item: item)
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                    .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
            }
        }
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { vm.load() } label: { Image(systemName: "arrow.clockwise") } } }
        .refreshable { vm.load() }
    }

    private func assetDetail(_ asset: MaintenanceAsset) -> some View {
        List {
            Section("Activo") {
                detailRow("Nombre", asset.displayName)
                detailRow("Código", asset.code)
                detailRow("Serie", asset.serialNumber)
                detailRow("Tipo", asset.category)
                detailRow("Estado", asset.status)
                detailRow("Ubicación", asset.location)
                detailRow("Responsable", asset.responsibleName)
                detailRow("Fabricante", asset.manufacturer)
                detailRow("Modelo", asset.model)
                detailRow("Última mantto.", String(asset.lastMaintenanceDate.prefix(10)))
            }
            Button("Volver") { vm.selectedAsset = nil }
        }
    }

    private func orderDetail(_ order: WorkOrder) -> some View {
        let id = order.id
        let status = order.status
        return List {
            Section("Orden de trabajo") {
                detailRow("Folio", order.orderNumber)
                detailRow("Título", order.displayTitle)
                detailRow("Activo", order.assetName)
                detailRow("Prioridad", order.priority)
                detailRow("Estado", status)
                detailRow("Programada", order.plannedDate)
            }
            Section {
                LocationPermissionBanner(
                    message: "Al iniciar o completar la orden se registrará tu GPS en notas de campo.",
                    requestOnAppear: true
                )
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            if let id {
                Section("Acciones") {
                    if woIsOpen(status) {
                        Button("Iniciar orden") { Task { await vm.startOrder(id) } }.disabled(vm.acting)
                    }
                    if woInProgress(status) || woIsOpen(status) {
                        TextField("Notas de cierre", text: $vm.completeNotes, axis: .vertical)
                            .lineLimit(2...4)
                        Button("Completar orden") { Task { await vm.completeOrder(id) } }.disabled(vm.acting)
                    }
                }
            }
            Button("Volver") { vm.selectedOrder = nil; vm.completeNotes = "" }
        }
    }

    @ViewBuilder private func detailRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }
}

private struct WorkOrderRow: View {
    let item: WorkOrder
    var body: some View {
        let title  = item.displayTitle
        let asset  = item.assetName
        let status = item.status
        let date   = String(item.plannedDate.prefix(10))
        let color  = maintenanceStatusColor(status)
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 8).fill(color.opacity(0.12)).frame(width:38,height:38)
                Image(systemName:"wrench.and.screwdriver").foregroundColor(color).font(.system(size:17))
            }
            VStack(alignment:.leading, spacing:2) {
                Text(title.isEmpty ? "Orden" : title).font(.subheadline).bold().lineLimit(1)
                if !asset.isEmpty { Text(asset).font(.caption).foregroundColor(.secondary) }
            }
            Spacer()
            VStack(alignment:.trailing, spacing:2) {
                Text(status.capitalized).font(.caption2).bold().foregroundColor(color)
                    .padding(.horizontal,6).padding(.vertical,2)
                    .background(color.opacity(0.12)).clipShape(Capsule())
                if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
            }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
}

private struct AssetRow: View {
    let item: MaintenanceAsset
    var body: some View {
        let name   = item.displayName
        let code   = item.code.isEmpty ? item.serialNumber : item.code
        let status = item.status
        let color  = maintenanceStatusColor(status)
        HStack(spacing:10) {
            ZStack {
                RoundedRectangle(cornerRadius:8).fill(Color.blue.opacity(0.10)).frame(width:38,height:38)
                Image(systemName:"desktopcomputer").foregroundColor(.blue).font(.system(size:16))
            }
            VStack(alignment:.leading, spacing:2) {
                Text(name.isEmpty ? "Activo" : name).font(.subheadline).bold()
                if !code.isEmpty { Text(code).font(.caption2).foregroundColor(.secondary) }
            }
            Spacer()
            if !status.isEmpty {
                Text(status.capitalized).font(.caption2).bold().foregroundColor(color)
                    .padding(.horizontal,6).padding(.vertical,2)
                    .background(color.opacity(0.12)).clipShape(Capsule())
            }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
}

private func maintenanceStatusColor(_ s: String) -> Color {
    switch s.lowercased() {
    case "completada","completado","cerrada","cerrado","done": return .green
    case "abierta","abierto","open","pendiente": return .orange
    case "en proceso","in_progress": return .blue
    case "cancelada","cancelado": return .red
    default: return .secondary
    }
}

private func woIsOpen(_ status: String) -> Bool {
    let s = status.lowercased()
    return s.contains("pendiente") || s == "open" || s.contains("abierta") || s.contains("scheduled") || s.contains("new")
}

private func woInProgress(_ status: String) -> Bool {
    let s = status.lowercased()
    return s.contains("progreso") || s.contains("in_progress") || s.contains("in-progress") || s.contains("started") || s == "active"
}

private func woIsDone(_ status: String) -> Bool {
    let s = status.lowercased()
    return s.contains("complet") || s.contains("cerrad") || s.contains("done") || s.contains("closed")
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – ServiceSheetsView (Hojas de servicio)
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class ServiceSheetsVM: ObservableObject {
    @Published var items: [ServiceSheetItem] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [ServiceSheetItem] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.displayTitle.lowercased().contains(q) ||
            $0.clientName.lowercased().contains(q) ||
            $0.serviceType.lowercased().contains(q)
        }
    }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.serviceSheetItems(); isLoading = false }
    }
}

struct ServiceSheetsView: View {
    @StateObject private var vm = ServiceSheetsVM()
    @State private var selected: ServiceSheetItem?
    var body: some View {
        Group {
            if let s = selected { ssDetail(s) } else { listBody }
        }
        .navigationTitle(selected == nil ? "Hojas de servicio" : "")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) {
            if selected == nil { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } }
        }}
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    private var listBody: some View {
        VStack(spacing: 0) {
            if !vm.items.isEmpty {
                HStack(spacing: 0) {
                    OpsKpi(label: "Hojas", value: "\(vm.items.count)", color: .primary)
                    let signed = vm.items.filter { $0.status.lowercased().contains("firmada") || !$0.signedName.isEmpty }.count
                    Divider().frame(height:32)
                    OpsKpi(label: "Firmadas", value: "\(signed)", color: .green)
                }
                .padding(.horizontal).padding(.vertical,6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius:12))
                .padding(.horizontal).padding(.top,8)
            }
            searchBar("Buscar hoja…", text: $vm.query)
            if vm.isLoading { Spacer(); ProgressView(); Spacer() }
            else if vm.filtered.isEmpty { Spacer(); Text("Sin hojas de servicio").foregroundColor(.secondary); Spacer() }
            else {
                List(vm.filtered.prefix(60)) { item in
                    Button { selected = item } label: { ServiceSheetRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func ssDetail(_ s: ServiceSheetItem) -> some View {
        let status = s.status
        let color: Color = status.lowercased().contains("firmada") ? .green : (status.lowercased().contains("pendiente") ? .orange : .secondary)
        List {
            Section {
                HStack {
                    Button("← Hojas") { selected = nil }
                    Spacer()
                    if !status.isEmpty {
                        Text(status.capitalized).font(.caption).bold().foregroundColor(color)
                            .padding(.horizontal,8).padding(.vertical,3)
                            .background(color.opacity(0.12)).clipShape(Capsule())
                    }
                }
            }
            Section("Hoja de servicio") {
                ssRow("Folio",       s.displayTitle)
                ssRow("Cliente",     s.clientName)
                ssRow("Técnico",     s.technicianName)
                ssRow("Fecha",       String(s.createdAt.prefix(10)))
                ssRow("Tipo",        s.serviceType)
                if s.activityId > 0 { ssRow("Actividad", "\(s.activityId)") }
            }
            if !s.workSummary.isEmpty { Section("Resumen") { Text(s.workSummary).font(.subheadline) } }
            if !s.equipmentList.isEmpty {
                Section("Materiales (\(s.equipmentList.count))") {
                    ForEach(Array(s.equipmentList.enumerated()), id: \.offset) { _, m in
                        HStack {
                            Text(oStr(m, "name", "nombre", "description")).font(.caption)
                            Spacer()
                            let qty = oStr(m, "quantity", "cantidad")
                            if !qty.isEmpty { Text("x\(qty)").font(.caption2).foregroundColor(.secondary) }
                        }
                    }
                }
            }
            if !s.observations.isEmpty { Section("Observaciones") { Text(s.observations).font(.subheadline) } }
            Section("Firma del cliente") {
                if s.signedName.isEmpty {
                    Text("Sin firma del cliente").foregroundColor(.secondary)
                } else {
                    ssRow("Firmado por", s.signedName)
                }
            }
            if !s.pdfUrl.isEmpty {
                Section {
                    Link(destination: URL(string: s.pdfUrl) ?? URL(string:"https://nexara.com.mx")!) {
                        Label("Abrir PDF", systemImage: "arrow.up.right.square")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func ssRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }
}

private struct ServiceSheetRow: View {
    let item: ServiceSheetItem
    var body: some View {
        let folio  = item.displayTitle
        let client = item.clientName
        let status = item.status
        let date   = String(item.createdAt.prefix(10))
        let tech   = item.technicianName
        let color: Color = status.lowercased().contains("firmada") ? .green : (status.lowercased().contains("pendiente") ? .orange : .secondary)
        HStack(spacing:0) {
            Rectangle().fill(color).frame(width:4).clipShape(RoundedRectangle(cornerRadius:2))
            VStack(alignment:.leading, spacing:4) {
                HStack {
                    Text(folio.isEmpty ? "Sin folio" : folio).font(.subheadline).bold()
                    Spacer()
                    Text(status.capitalized).font(.caption2).bold().foregroundColor(color)
                        .padding(.horizontal,6).padding(.vertical,2)
                        .background(color.opacity(0.12)).clipShape(Capsule())
                }
                if !client.isEmpty { Text(client).font(.caption).foregroundColor(.secondary) }
                HStack {
                    if !tech.isEmpty { Label(tech, systemImage:"person.fill").font(.caption2).foregroundColor(.secondary) }
                    Spacer()
                    if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
                }
            }
            .padding(.horizontal,10).padding(.vertical,8)
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – StockView (Almacén + Bodega combinado)
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class StockVM: ObservableObject {
    @Published var stock: [[String: Any]] = []
    @Published var warehouse: [[String: Any]] = []
    @Published var tab = 0; @Published var query = ""; @Published var isLoading = false

    var filteredStock: [[String: Any]] {
        guard !query.isEmpty else { return stock }
        let q = query.lowercased()
        return stock.filter {
            oStr($0,"name","nombre","productName").lowercased().contains(q) ||
            oStr($0,"sku","code").lowercased().contains(q)
        }
    }
    var filteredWh: [[String: Any]] {
        guard !query.isEmpty else { return warehouse }
        let q = query.lowercased()
        return warehouse.filter {
            oStr($0,"name","nombre").lowercased().contains(q) ||
            oStr($0,"code","location").lowercased().contains(q)
        }
    }
    var lowStock: Int { stock.filter { (oInt($0,"quantity","cantidad") ?? 99) <= 5 }.count }

    func load() {
        isLoading = true
        Task {
            async let s = ExtraRepository.shared.stock()
            async let w = ExtraRepository.shared.warehouse()
            stock = await s; warehouse = await w
            isLoading = false
        }
    }
}

struct StockView: View {
    var initialTab: Int = 0
    @StateObject private var vm = StockVM()
    @State private var selectedStock: [String: Any]?
    @State private var selectedWh: [String: Any]?
    var body: some View {
        Group {
            if let s = selectedStock { stockDetail(s) }
            else if let w = selectedWh { whDetail(w) }
            else { stockList }
        }
        .navigationTitle(selectedStock == nil && selectedWh == nil ? "Almacén · Bodega" : "")
        .onAppear { vm.tab = initialTab }
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) {
            if selectedStock == nil && selectedWh == nil {
                Button { vm.load() } label: { Image(systemName:"arrow.clockwise") }
            }
        }}
        .refreshable { if selectedStock == nil && selectedWh == nil { vm.load() } }
        .task { vm.load() }
    }

    private var stockList: some View {
        VStack(spacing: 0) {
            if !vm.stock.isEmpty || !vm.warehouse.isEmpty {
                HStack(spacing: 0) {
                    OpsKpi(label: "Productos", value: "\(vm.stock.count)",     color: .primary)
                    Divider().frame(height:32)
                    OpsKpi(label: "Stock bajo", value: "\(vm.lowStock)",       color: vm.lowStock > 0 ? .red : .green)
                    Divider().frame(height:32)
                    OpsKpi(label: "Bodegas",   value: "\(vm.warehouse.count)", color: .blue)
                }
                .padding(.horizontal).padding(.vertical,6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius:12))
                .padding(.horizontal).padding(.top,8)
            }
            Picker("Tab", selection: $vm.tab) {
                Text("Inventario").tag(0); Text("Bodegas").tag(1)
            }
            .pickerStyle(.segmented).padding(.horizontal).padding(.top,8)
            searchBar("Buscar…", text: $vm.query)
            if vm.isLoading { Spacer(); ProgressView(); Spacer() }
            else if vm.tab == 0 {
                List(vm.filteredStock.prefix(60), id: { opsIdKey($0,"stk") }) { item in
                    Button { selectedStock = item } label: { StockItemRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
            } else {
                List(vm.filteredWh.prefix(60), id: { opsIdKey($0,"wh") }) { item in
                    Button { selectedWh = item } label: { WarehouseRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
            }
        }
    }

    @ViewBuilder private func stockDetail(_ item: [String: Any]) -> some View {
        let name     = oStr(item,"name","nombre","productName")
        let sku      = oStr(item,"sku","code","codigo")
        let qty      = oInt(item,"quantity","cantidad") ?? 0
        let minStock = oStr(item,"minStock","stockMinimo")
        let location = oStr(item,"location","ubicacion","bodega")
        let unit     = oStr(item,"unit","unidad")
        let price    = oDouble(item,"price","precio","costo")
        let category = oStr(item,"category","categoria")
        let notes    = oStr(item,"notes","notas","descripcion")
        List {
            Section { Button("← Inventario") { selectedStock = nil } }
            Section {
                VStack(spacing: 4) {
                    Text("Stock").font(.caption).foregroundColor(.secondary)
                    Text("\(qty)").font(.system(size: 32, weight: .bold, design: .rounded)).foregroundColor(qty <= 5 ? .red : .primary)
                    Text(unit.isEmpty ? "unidades" : unit).font(.caption2).foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 8)
            }
            Section("Producto") {
                oRow("Nombre",    name)
                oRow("SKU",       sku)
                oRow("Categoría", category)
                oRow("Mínimo",    minStock)
                oRow("Ubicación", location)
                if let p = price { oRow("Precio", fmtOps(p)) }
            }
            if !notes.isEmpty {
                Section("Descripción") { Text(notes).font(.body) }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func whDetail(_ item: [String: Any]) -> some View {
        let name     = oStr(item,"name","nombre")
        let code     = oStr(item,"code","codigo")
        let location = oStr(item,"location","ubicacion","address")
        let manager  = oStr(item,"managerName","responsable","encargado")
        let capacity = oStr(item,"capacity","capacidad")
        List {
            Section { Button("← Bodegas") { selectedWh = nil } }
            Section("Bodega") {
                oRow("Nombre",      name)
                oRow("Código",      code)
                oRow("Ubicación",   location)
                oRow("Responsable", manager)
                oRow("Capacidad",   capacity)
            }
        }
        .listStyle(.insetGrouped)
    }
}

private struct StockItemRow: View {
    let item: [String: Any]
    var body: some View {
        let name = oStr(item,"name","nombre","productName")
        let sku  = oStr(item,"sku","code")
        let qty  = oInt(item,"quantity","cantidad") ?? 0
        let low  = qty <= 5
        HStack(spacing:12) {
            ZStack {
                RoundedRectangle(cornerRadius:8).fill((low ? Color.red : Color.teal).opacity(0.10)).frame(width:38,height:38)
                Image(systemName:"cube.box").foregroundColor(low ? .red : .teal).font(.system(size:16))
            }
            VStack(alignment:.leading, spacing:2) {
                Text(name.isEmpty ? "Producto" : name).font(.subheadline).bold()
                if !sku.isEmpty { Text(sku).font(.caption2).foregroundColor(.secondary) }
            }
            Spacer()
            VStack(alignment:.trailing, spacing:2) {
                Text("\(qty)").font(.headline).bold().foregroundColor(low ? .red : .primary)
                Text("unidades").font(.caption2).foregroundColor(.secondary)
            }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
}

private struct WarehouseRow: View {
    let item: [String: Any]
    var body: some View {
        let name     = oStr(item,"name","nombre")
        let code     = oStr(item,"code","codigo")
        let location = oStr(item,"location","ubicacion","address")
        HStack(spacing:12) {
            Image(systemName:"building.2").foregroundColor(.blue).font(.title2)
            VStack(alignment:.leading, spacing:2) {
                Text(name.isEmpty ? "Bodega" : name).font(.subheadline).bold()
                if !code.isEmpty { Text(code).font(.caption2).foregroundColor(.secondary) }
                if !location.isEmpty { Text(location).font(.caption).foregroundColor(.secondary) }
            }
            Spacer()
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – EmployeePaymentsView
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class EmployeePaymentsVM: ObservableObject {
    @Published var items: [EmployeePaymentItem] = []
    @Published var query = ""
    @Published var isLoading = false

    var filtered: [EmployeePaymentItem] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.concepto.lowercased().contains(q) || $0.userName.lowercased().contains(q)
        }
    }
    var totalPaid: Double { items.reduce(0) { $0 + $1.monto } }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.employeePaymentItems(); isLoading = false }
    }
}

struct EmployeePaymentsView: View {
    @StateObject private var vm = EmployeePaymentsVM()
    @State private var selected: EmployeePaymentItem?
    var body: some View {
        Group {
            if let s = selected { epDetail(s) } else { epList }
        }
        .navigationTitle(selected == nil ? "Pagos a empleados" : "")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) {
            if selected == nil { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } }
        }}
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    private var epList: some View {
        VStack(spacing: 0) {
            if !vm.items.isEmpty {
                HStack(spacing: 0) {
                    OpsKpi(label: "Pagos", value: "\(vm.items.count)", color: .primary)
                    Divider().frame(height:32)
                    OpsKpi(label: "Total", value: fmtOps(vm.totalPaid), color: .green)
                }
                .padding(.horizontal).padding(.vertical,6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius:12))
                .padding(.horizontal).padding(.top,8)
            }
            searchBar("Buscar pago…", text: $vm.query)
            if vm.isLoading { Spacer(); ProgressView(); Spacer() }
            else if vm.filtered.isEmpty {
                NxEmptyState(
                    title: "Sin pagos",
                    subtitle: "No hay pagos a empleados con este filtro.",
                    actionLabel: "Actualizar",
                    onAction: { vm.load() }
                )
            } else {
                List(vm.filtered.prefix(60)) { item in
                    Button { selected = item } label: { PaymentRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
            }
        }
    }

    @ViewBuilder private func epDetail(_ p: EmployeePaymentItem) -> some View {
        List {
            Section { Button("← Pagos") { selected = nil } }
            if p.monto != 0 {
                Section {
                    VStack(spacing: 4) {
                        Text("Monto").font(.caption).foregroundColor(.secondary)
                        Text(fmtOps(p.monto)).font(.system(size: 28, weight: .bold, design: .rounded)).foregroundColor(.green)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 8)
                }
            }
            Section("Detalle") {
                oRow("Concepto",  p.concepto)
                oRow("Empleado",  p.userName)
                oRow("Estatus",   p.estatus)
                oRow("Fecha",     p.dateLabel)
                oRow("Periodo",   [p.periodoInicio, p.periodoFin].filter { !$0.isEmpty }.joined(separator: " → "))
            }
        }
        .listStyle(.insetGrouped)
    }
}

private struct PaymentRow: View {
    let item: EmployeePaymentItem
    var body: some View {
        HStack(spacing:12) {
            ZStack {
                Circle().fill(Color.green.opacity(0.12)).frame(width:38,height:38)
                Image(systemName:"dollarsign.circle.fill").foregroundColor(.green).font(.system(size:18))
            }
            VStack(alignment:.leading, spacing:2) {
                Text(item.displayConcepto).font(.subheadline).bold().lineLimit(1)
                if !item.userName.isEmpty { Text(item.userName).font(.caption).foregroundColor(.secondary) }
            }
            Spacer()
            VStack(alignment:.trailing, spacing:2) {
                if item.monto != 0 { Text(fmtOps(item.monto)).font(.subheadline).bold().foregroundColor(.green) }
                if !item.dateLabel.isEmpty { Text(item.dateLabel).font(.caption2).foregroundColor(.secondary) }
            }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – FinesView (Multas)
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class FinesVM: ObservableObject {
    @Published var items: [FineItem] = []
    @Published var query = ""
    @Published var isLoading = false
    @Published var loadError: String?

    var filtered: [FineItem] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.motivo.lowercased().contains(q) || $0.userName.lowercased().contains(q)
        }
    }
    var totalAmount: Double { items.reduce(0) { $0 + $1.monto } }
    func load() {
        isLoading = true
        loadError = nil
        Task {
            items = await ExtraRepository.shared.fineItems()
            isLoading = false
        }
    }
}

struct FinesView: View {
    @StateObject private var vm = FinesVM()
    @State private var selected: FineItem?
    var body: some View {
        Group {
            if let s = selected { fineDetail(s) } else { fineList }
        }
        .navigationTitle(selected == nil ? "Multas" : "")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) {
            if selected == nil { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } }
        }}
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    private var fineList: some View {
        VStack(spacing: 0) {
            if !vm.items.isEmpty {
                HStack(spacing: 0) {
                    OpsKpi(label: "Multas", value: "\(vm.items.count)", color: .primary)
                    Divider().frame(height:32)
                    OpsKpi(label: "Total",  value: fmtOps(vm.totalAmount), color: .red)
                }
                .padding(.horizontal).padding(.vertical,6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius:12))
                .padding(.horizontal).padding(.top,8)
            }
            searchBar("Buscar multa…", text: $vm.query)
            if vm.isLoading { Spacer(); ProgressView(); Spacer() }
            else if vm.filtered.isEmpty {
                NxEmptyState(
                    title: "Sin multas",
                    subtitle: "No hay multas registradas con este filtro.",
                    actionLabel: "Actualizar",
                    onAction: { vm.load() }
                )
            } else {
                List(vm.filtered.prefix(60)) { item in
                    Button { selected = item } label: { FineRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }.listStyle(.plain)
            }
        }
    }

    @ViewBuilder private func fineDetail(_ f: FineItem) -> some View {
        List {
            Section { Button("← Multas") { selected = nil } }
            if f.monto != 0 {
                Section {
                    VStack(spacing: 4) {
                        Text("Monto").font(.caption).foregroundColor(.secondary)
                        Text(fmtOps(f.monto)).font(.system(size: 28, weight: .bold, design: .rounded)).foregroundColor(.red)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 8)
                }
            }
            Section("Detalle") {
                oRow("Motivo",   f.motivo)
                oRow("Empleado", f.userName)
                oRow("Estatus",  f.estatus)
                oRow("Fecha",    f.dateLabel)
            }
            if !f.notes.isEmpty {
                Section("Descripción") { Text(f.notes).font(.body) }
            }
        }
        .listStyle(.insetGrouped)
    }
}

private struct FineRow: View {
    let item: FineItem
    var body: some View {
        HStack(spacing:12) {
            ZStack {
                Circle().fill(Color.red.opacity(0.12)).frame(width:38,height:38)
                Image(systemName:"exclamationmark.triangle.fill").foregroundColor(.red).font(.system(size:16))
            }
            VStack(alignment:.leading, spacing:2) {
                Text(item.displayMotivo).font(.subheadline).bold().lineLimit(1)
                if !item.userName.isEmpty { Text(item.userName).font(.caption).foregroundColor(.secondary) }
            }
            Spacer()
            VStack(alignment:.trailing, spacing:2) {
                if item.monto != 0 { Text(fmtOps(item.monto)).font(.subheadline).bold().foregroundColor(.red) }
                if !item.dateLabel.isEmpty { Text(item.dateLabel).font(.caption2).foregroundColor(.secondary) }
            }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – AuditView (Auditoría)
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class AuditVM: ObservableObject {
    @Published var items: [AuditEntry] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [AuditEntry] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.action.lowercased().contains(q) || $0.userName.lowercased().contains(q)
        }
    }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.auditItems(); isLoading = false }
    }
}

struct AuditView: View {
    @StateObject private var vm = AuditVM()
    @State private var selected: AuditEntry?
    var body: some View {
        Group {
            if let s = selected { auditDetail(s) } else { auditList }
        }
        .navigationTitle(selected == nil ? "Auditoría" : "")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) {
            if selected == nil { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } }
        }}
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    private var auditList: some View {
        VStack(spacing: 0) {
            if !vm.items.isEmpty {
                HStack(spacing: 0) {
                    OpsKpi(label: "Registros", value: "\(vm.items.count)", color: .primary)
                    let todayStr: String = {
                        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.string(from: Date())
                    }()
                    let today = vm.items.filter { $0.createdAt.prefix(10) == todayStr }.count
                    Divider().frame(height:32)
                    OpsKpi(label: "Hoy", value: "\(today)", color: .teal)
                }
                .padding(.horizontal).padding(.vertical,6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius:12))
                .padding(.horizontal).padding(.top,8)
            }
            searchBar("Buscar acción…", text: $vm.query)
            if vm.isLoading { Spacer(); ProgressView(); Spacer() }
            else if vm.filtered.isEmpty { Spacer(); Text("Sin registros").foregroundColor(.secondary); Spacer() }
            else {
                List(vm.filtered.prefix(80)) { item in
                    Button { selected = item } label: { AuditRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }.listStyle(.plain)
            }
        }
    }

    @ViewBuilder private func auditDetail(_ a: AuditEntry) -> some View {
        let action   = a.action
        let user     = a.userName
        let entity   = a.entityType
        let entityId = a.entityId
        let date     = a.createdAt
        let details  = a.details
        List {
            Section { Button("← Auditoría") { selected = nil } }
            Section("Acción") {
                Text(action.isEmpty ? "—" : action).font(.body)
                oRow("Usuario",   user)
                oRow("Entidad",   entity)
                oRow("ID entidad",entityId)
                oRow("Fecha",     String(date.prefix(19)))
            }
            if !details.isEmpty {
                Section("Detalles") { Text(details).font(.caption).foregroundColor(.secondary) }
            }
        }
        .listStyle(.insetGrouped)
    }
}

private struct AuditRow: View {
    let item: AuditEntry
    var body: some View {
        let action = item.action
        let user   = item.userName
        let date   = String(item.createdAt.prefix(16))
        HStack(spacing:10) {
            Image(systemName:"doc.text.magnifyingglass").foregroundColor(.secondary).font(.system(size:18))
            VStack(alignment:.leading, spacing:2) {
                Text(action.isEmpty ? "Acción" : action).font(.subheadline).lineLimit(2)
                if !user.isEmpty { Text(user).font(.caption).foregroundColor(.secondary) }
            }
            Spacer()
            if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – DocumentsView
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class DocumentsVM: ObservableObject {
    @Published var items: [DocumentItem] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [DocumentItem] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.displayTitle.lowercased().contains(q) ||
            $0.type.lowercased().contains(q)
        }
    }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.documentItems(); isLoading = false }
    }
}

struct DocumentsView: View {
    @StateObject private var vm = DocumentsVM()
    @State private var selected: DocumentItem?
    var body: some View {
        Group {
            if let s = selected { docDetail(s) } else { docList }
        }
        .navigationTitle(selected == nil ? "Documentos" : "")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) {
            if selected == nil { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } }
        }}
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    private var docList: some View {
        VStack(spacing: 0) {
            searchBar("Buscar documento…", text: $vm.query)
            if vm.isLoading { Spacer(); ProgressView(); Spacer() }
            else if vm.filtered.isEmpty { Spacer(); Text("Sin documentos").foregroundColor(.secondary); Spacer() }
            else {
                List(vm.filtered.prefix(60)) { item in
                    Button { selected = item } label: { DocumentRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }.listStyle(.plain)
            }
        }
    }

    @ViewBuilder private func docDetail(_ d: DocumentItem) -> some View {
        let name     = d.displayTitle
        let category = d.type
        let date     = String(d.createdAt.prefix(10))
        let url      = d.fileUrl
        let size     = StockParse.str(d.raw["size"], d.raw["fileSize"])
        let author   = StockParse.str(d.raw["authorName"], d.raw["uploadedBy"], d.raw["createdBy"])
        List {
            Section { Button("← Documentos") { selected = nil } }
            Section("Documento") {
                oRow("Nombre",     name)
                oRow("Categoría",  category)
                oRow("Fecha",      date)
                oRow("Tamaño",     size)
                oRow("Subido por", author)
            }
            if !url.isEmpty {
                Section {
                    Link(destination: URL(string: url) ?? URL(string:"https://nexara.com.mx")!) {
                        Label("Abrir documento", systemImage: "arrow.up.right.square")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }
}

private struct DocumentRow: View {
    let item: DocumentItem
    var body: some View {
        let name     = item.displayTitle
        let category = item.type
        let date     = String(item.createdAt.prefix(10))
        let url      = item.fileUrl
        HStack(spacing:12) {
            Image(systemName: docIcon(url)).foregroundColor(.blue).font(.title3)
            VStack(alignment:.leading, spacing:2) {
                Text(name.isEmpty ? "Documento" : name).font(.subheadline).bold().lineLimit(1)
                if !category.isEmpty { Text(category.capitalized).font(.caption).foregroundColor(.secondary) }
            }
            Spacer()
            if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
    private func docIcon(_ url: String) -> String {
        let ext = url.split(separator:".").last?.lowercased() ?? ""
        switch ext {
        case "pdf": return "doc.richtext"
        case "xlsx","xls","csv": return "tablecells"
        case "docx","doc": return "doc.text"
        case "png","jpg","jpeg","webp": return "photo"
        default: return "doc"
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – CvsView (Hojas de vida / Currículos)
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class CvsVM: ObservableObject {
    @Published var items: [CandidateItem] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [CandidateItem] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.displayName.lowercased().contains(q) ||
            $0.position.lowercased().contains(q) ||
            $0.email.lowercased().contains(q) ||
            $0.category.lowercased().contains(q)
        }
    }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.candidateItems(); isLoading = false }
    }
}

struct CvsView: View {
    @StateObject private var vm = CvsVM()
    @State private var selected: CandidateItem?
    var body: some View {
        Group {
            if let s = selected { cvDetail(s) } else { cvList }
        }
        .navigationTitle(selected == nil ? "CVs · Candidatos" : "")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) {
            if selected == nil { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } }
        }}
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    private var cvList: some View {
        VStack(spacing: 0) {
            if !vm.items.isEmpty {
                OpsKpi(label: "CVs recibidos", value: "\(vm.items.count)", color: .primary)
                    .padding(.horizontal).padding(.vertical,6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius:12))
                    .padding(.horizontal).padding(.top,8)
            }
            searchBar("Buscar candidato…", text: $vm.query)
            if vm.isLoading { Spacer(); ProgressView(); Spacer() }
            else if vm.filtered.isEmpty { Spacer(); Text("Sin CVs").foregroundColor(.secondary); Spacer() }
            else {
                List(vm.filtered.prefix(60)) { item in
                    Button { selected = item } label: { CvRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }.listStyle(.plain)
            }
        }
    }

    @ViewBuilder private func cvDetail(_ cv: CandidateItem) -> some View {
        let name     = cv.displayName
        let position = cv.position.isEmpty ? cv.category : cv.position
        let email    = cv.email
        let phone    = cv.whatsapp
        let date     = String(cv.createdAt.prefix(10))
        let url      = cv.cvUrl
        let exp      = cv.experience
        let skills   = StockParse.str(cv.raw["skills"], cv.raw["habilidades"], cv.raw["stack"])
        let notes    = cv.notes
        List {
            Section { Button("← CVs") { selected = nil } }
            Section("Candidato") {
                oRow("Nombre",   name)
                oRow("Posición", position)
                oRow("Email",    email)
                oRow("Teléfono", phone)
                oRow("Fecha",    date)
                oRow("Experiencia", exp)
                oRow("Habilidades", skills)
            }
            if !url.isEmpty {
                Section {
                    Link(destination: URL(string: url) ?? URL(string:"https://nexara.com.mx")!) {
                        Label("Abrir CV", systemImage: "arrow.up.right.square")
                    }
                }
            }
            if !notes.isEmpty {
                Section("Notas") { Text(notes).font(.body) }
            }
        }
        .listStyle(.insetGrouped)
    }
}

private struct CvRow: View {
    let item: CandidateItem
    var body: some View {
        let name     = item.displayName
        let position = item.position.isEmpty ? item.category : item.position
        let date     = String(item.createdAt.prefix(10))
        let email    = item.email
        HStack(spacing:12) {
            ZStack {
                Circle().fill(Color.purple.opacity(0.12)).frame(width:40,height:40)
                Image(systemName:"person.text.rectangle").foregroundColor(.purple).font(.system(size:18))
            }
            VStack(alignment:.leading, spacing:2) {
                Text(name.isEmpty ? "Candidato" : name).font(.subheadline).bold()
                if !position.isEmpty { Text(position).font(.caption).foregroundColor(.secondary) }
                if !email.isEmpty { Text(email).font(.caption2).foregroundColor(.secondary) }
            }
            Spacer()
            if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – ContactMessagesView
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class ContactMessagesVM: ObservableObject {
    @Published var items: [ConsoleContactMessage] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [ConsoleContactMessage] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.name.lowercased().contains(q) ||
            $0.subject.lowercased().contains(q) ||
            $0.email.lowercased().contains(q)
        }
    }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.contactMessageItems(); isLoading = false }
    }
}

struct ContactMessagesView: View {
    @StateObject private var vm = ContactMessagesVM()
    @State private var selected: ConsoleContactMessage?
    var body: some View {
        Group {
            if let s = selected { msgDetail(s) } else { listBody }
        }
        .navigationTitle(selected == nil ? "Mensajes de contacto" : "")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) {
            if selected == nil { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } }
        }}
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    private var listBody: some View {
        VStack(spacing: 0) {
            if !vm.items.isEmpty {
                OpsKpi(label: "Mensajes", value: "\(vm.items.count)", color: .primary)
                    .padding(.horizontal).padding(.vertical,6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius:12))
                    .padding(.horizontal).padding(.top,8)
            }
            searchBar("Buscar mensaje…", text: $vm.query)
            if vm.isLoading { Spacer(); ProgressView(); Spacer() }
            else if vm.filtered.isEmpty { Spacer(); Text("Sin mensajes").foregroundColor(.secondary); Spacer() }
            else {
                List(vm.filtered.prefix(60)) { item in
                    Button { selected = item } label: { ContactMsgRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }.listStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func msgDetail(_ m: ConsoleContactMessage) -> some View {
        let name    = m.name
        let email   = m.email
        let phone   = m.phone
        let subject = m.subject
        let message = m.message
        let date    = String(m.createdAt.prefix(10))
        List {
            Section {
                Button("← Mensajes") { selected = nil }
            }
            Section("De") {
                cmRow("Nombre",  name)
                if !email.isEmpty {
                    HStack {
                        Text("Email")
                        Spacer()
                        Link(email, destination: URL(string: "mailto:\(email)")!)
                            .font(.subheadline).foregroundColor(.blue)
                    }
                }
                if !phone.isEmpty {
                    HStack {
                        Text("Teléfono")
                        Spacer()
                        Link(phone, destination: URL(string: "tel:\(phone)")!)
                            .font(.subheadline).foregroundColor(.blue)
                    }
                }
                cmRow("Fecha", date)
                cmRow("Estado", m.status)
            }
            if !subject.isEmpty { Section("Asunto") { Text(subject).font(.subheadline) } }
            if !message.isEmpty { Section("Mensaje") { Text(message).font(.subheadline) } }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func cmRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }
}

private struct ContactMsgRow: View {
    let item: ConsoleContactMessage
    var body: some View {
        let name    = item.displayName
        let subject = item.subject.prefix(60).description
        let email   = item.email
        let phone   = item.phone
        let date    = String(item.createdAt.prefix(10))
        let read    = (item.raw["read"] as? Bool) ?? (item.raw["leido"] as? Bool) ?? false
        HStack(spacing:12) {
            ZStack {
                Circle().fill(read ? Color.secondary.opacity(0.08) : Color.blue.opacity(0.12)).frame(width:40,height:40)
                Image(systemName: read ? "envelope.open" : "envelope.fill")
                    .foregroundColor(read ? .secondary : .blue).font(.system(size:17))
            }
            VStack(alignment:.leading, spacing:2) {
                HStack {
                    Text(name.isEmpty ? "Contacto" : name).font(.subheadline).bold()
                    if !read { Circle().fill(Color.blue).frame(width:6,height:6) }
                }
                if !subject.isEmpty { Text(subject).font(.caption).foregroundColor(.secondary).lineLimit(2) }
                HStack(spacing:8) {
                    if !email.isEmpty { Text(email).font(.caption2).foregroundColor(.secondary) }
                    if !phone.isEmpty { Text(phone).font(.caption2).foregroundColor(.secondary) }
                }
            }
            Spacer()
            if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – NewsView (Noticias nativas)
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class NewsVM: ObservableObject {
    @Published var items: [ConsoleNewsItem] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [ConsoleNewsItem] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.title.lowercased().contains(q) ||
            $0.excerpt.lowercased().contains(q) ||
            $0.slug.lowercased().contains(q)
        }
    }
    var published: Int { items.filter { !$0.isDraft }.count }
    var drafts:    Int { items.filter { $0.isDraft }.count }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.newsItems(); isLoading = false }
    }
}

struct NewsView: View {
    @StateObject private var vm = NewsVM()
    @State private var selected: ConsoleNewsItem?
    var body: some View {
        Group {
            if let s = selected { newsDetail(s) } else { listBody }
        }
        .navigationTitle(selected == nil ? "Noticias" : "")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) {
            if selected == nil { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } }
        }}
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    private var listBody: some View {
        VStack(spacing: 0) {
            if !vm.items.isEmpty {
                HStack(spacing: 0) {
                    OpsKpi(label: "Total",      value: "\(vm.items.count)", color: .primary)
                    Divider().frame(height:32)
                    OpsKpi(label: "Publicadas", value: "\(vm.published)",   color: .green)
                    Divider().frame(height:32)
                    OpsKpi(label: "Borradores", value: "\(vm.drafts)",      color: .orange)
                }
                .padding(.horizontal).padding(.vertical,6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius:12))
                .padding(.horizontal).padding(.top,8)
            }
            searchBar("Buscar noticia…", text: $vm.query)
            if vm.isLoading { Spacer(); ProgressView(); Spacer() }
            else if vm.filtered.isEmpty { Spacer(); Text("Sin noticias").foregroundColor(.secondary); Spacer() }
            else {
                List(vm.filtered.prefix(60)) { item in
                    Button { selected = item } label: { NewsRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }.listStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func newsDetail(_ n: ConsoleNewsItem) -> some View {
        let isDraft = n.isDraft
        List {
            Section {
                HStack {
                    Button("← Noticias") { selected = nil }
                    Spacer()
                    Text(isDraft ? "Borrador" : "Publicada").font(.caption).bold()
                        .foregroundColor(isDraft ? .orange : .green)
                        .padding(.horizontal,8).padding(.vertical,3)
                        .background((isDraft ? Color.orange : Color.green).opacity(0.12)).clipShape(Capsule())
                }
            }
            Section("Noticia") {
                if !n.title.isEmpty { Text(n.title).font(.headline).bold() }
                nwRow("Fecha", String(n.publishedAt.prefix(10)))
                nwRow("Autor", StockParse.str(n.raw["author"], n.raw["autor"], n.raw["authorName"]))
                nwRow("Slug",  n.slug)
                nwRow("Tags",  StockParse.str(n.raw["tags"], n.raw["categorias"]))
            }
            if !n.excerpt.isEmpty { Section("Resumen") { Text(n.excerpt).font(.subheadline) } }
            if !n.content.isEmpty { Section("Contenido") { Text(n.content).font(.subheadline) } }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func nwRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }
}

private struct NewsRow: View {
    let item: ConsoleNewsItem
    var body: some View {
        let title   = item.title
        let excerpt = String(item.excerpt.prefix(80))
        let date    = String(item.publishedAt.prefix(10))
        let isDraft = item.isDraft
        HStack(spacing:12) {
            ZStack {
                RoundedRectangle(cornerRadius:8).fill(isDraft ? Color.orange.opacity(0.10) : Color.blue.opacity(0.10)).frame(width:38,height:38)
                Image(systemName: isDraft ? "doc.badge.ellipsis" : "newspaper").foregroundColor(isDraft ? .orange : .blue).font(.system(size:16))
            }
            VStack(alignment:.leading, spacing:2) {
                Text(title.isEmpty ? "Noticia" : title).font(.subheadline).bold().lineLimit(1)
                if !excerpt.isEmpty { Text(excerpt).font(.caption).foregroundColor(.secondary).lineLimit(2) }
            }
            Spacer()
            VStack(alignment:.trailing, spacing:2) {
                Text(isDraft ? "Borrador" : "Publicada").font(.caption2).bold()
                    .foregroundColor(isDraft ? .orange : .green)
                if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
            }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – AccountingView (Asientos contables)
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class AccountingVM: ObservableObject {
    @Published var items: [JournalEntryItem] = []
    @Published var query = ""
    @Published var isLoading = false

    var filtered: [JournalEntryItem] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.description.lowercased().contains(q) || $0.account.lowercased().contains(q) || $0.reference.lowercased().contains(q)
        }
    }
    var totalDebit: Double { items.reduce(0) { $0 + $1.totalDebit } }
    var totalCredit: Double { items.reduce(0) { $0 + $1.totalCredit } }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.journalEntryItems(); isLoading = false }
    }
}

struct AccountingView: View {
    @StateObject private var vm = AccountingVM()
    @State private var selected: JournalEntryItem?
    var body: some View {
        Group {
            if let s = selected { acDetail(s) } else { acList }
        }
        .navigationTitle(selected == nil ? "Contabilidad" : "")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) {
            if selected == nil { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } }
        }}
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    private var acList: some View {
        VStack(spacing: 0) {
            if !vm.items.isEmpty {
                HStack(spacing: 0) {
                    OpsKpi(label: "Asientos", value: "\(vm.items.count)", color: .primary)
                    Divider().frame(height:32)
                    OpsKpi(label: "Debe",   value: fmtOps(vm.totalDebit),  color: .red)
                    Divider().frame(height:32)
                    OpsKpi(label: "Haber",  value: fmtOps(vm.totalCredit), color: .green)
                }
                .padding(.horizontal).padding(.vertical,6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius:12))
                .padding(.horizontal).padding(.top,8)
            }
            searchBar("Buscar asiento…", text: $vm.query)
            if vm.isLoading { Spacer(); ProgressView(); Spacer() }
            else if vm.filtered.isEmpty {
                NxEmptyState(
                    title: "Sin asientos",
                    subtitle: "No hay asientos contables con este filtro.",
                    actionLabel: "Actualizar",
                    onAction: { vm.load() }
                )
            } else {
                List(vm.filtered.prefix(60)) { item in
                    Button { selected = item } label: { AccountingRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }.listStyle(.plain)
            }
        }
    }

    @ViewBuilder private func acDetail(_ e: JournalEntryItem) -> some View {
        List {
            Section { Button("← Contabilidad") { selected = nil } }
            Section {
                HStack {
                    VStack {
                        Text("Debe").font(.caption).foregroundColor(.secondary)
                        Text(fmtOps(e.totalDebit)).font(.title3).bold().foregroundColor(.red)
                    }
                    Spacer()
                    VStack {
                        Text("Haber").font(.caption).foregroundColor(.secondary)
                        Text(fmtOps(e.totalCredit)).font(.title3).bold().foregroundColor(.green)
                    }
                }
                .frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            Section("Asiento") {
                oRow("Descripción", e.description)
                oRow("Cuenta",      e.account)
                oRow("Fecha",       e.dateLabel)
                oRow("Referencia",  e.reference)
                oRow("Estatus",     e.status)
            }
        }
        .listStyle(.insetGrouped)
    }
}

private struct AccountingRow: View {
    let item: JournalEntryItem
    var body: some View {
        HStack(spacing:10) {
            Image(systemName:"book.closed").foregroundColor(.secondary).font(.title3)
            VStack(alignment:.leading, spacing:2) {
                Text(item.displayDescription).font(.subheadline).lineLimit(1)
                if !item.account.isEmpty { Text(item.account).font(.caption).foregroundColor(.secondary) }
            }
            Spacer()
            VStack(alignment:.trailing, spacing:2) {
                if item.totalDebit > 0  { Text("D: \(fmtOps(item.totalDebit))").font(.caption2).foregroundColor(.red) }
                if item.totalCredit > 0 { Text("H: \(fmtOps(item.totalCredit))").font(.caption2).foregroundColor(.green) }
                if !item.dateLabel.isEmpty { Text(item.dateLabel).font(.caption2).foregroundColor(.secondary) }
            }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – WorkProjectsView (Proyectos internos)
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class WorkProjectsVM: ObservableObject {
    @Published var items: [PortfolioProject] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [PortfolioProject] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.title.lowercased().contains(q) ||
            $0.sector.lowercased().contains(q) ||
            $0.summary.lowercased().contains(q) ||
            $0.impact.lowercased().contains(q)
        }
    }
    var withImpact: Int { items.filter { !$0.impact.isEmpty }.count }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.portfolioProjects(); isLoading = false }
    }
}

struct WorkProjectsView: View {
    @StateObject private var vm = WorkProjectsVM()
    @State private var selected: PortfolioProject?
    var body: some View {
        Group {
            if let s = selected { wpDetail(s) } else { listBody }
        }
        .navigationTitle(selected == nil ? "Proyectos internos" : "")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) {
            if selected == nil { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } }
        }}
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    private var listBody: some View {
        VStack(spacing: 0) {
            if !vm.items.isEmpty {
                HStack(spacing: 0) {
                    OpsKpi(label: "Proyectos", value: "\(vm.items.count)", color: .primary)
                    Divider().frame(height:32)
                    OpsKpi(label: "Con impacto", value: "\(vm.withImpact)", color: .green)
                }
                .padding(.horizontal).padding(.vertical,6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius:12))
                .padding(.horizontal).padding(.top,8)
            }
            searchBar("Buscar proyecto…", text: $vm.query)
            if vm.isLoading { Spacer(); ProgressView(); Spacer() }
            else if vm.filtered.isEmpty { Spacer(); Text("Sin proyectos").foregroundColor(.secondary); Spacer() }
            else {
                List(vm.filtered.prefix(60)) { item in
                    Button { selected = item } label: { WorkProjectRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }.listStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func wpDetail(_ p: PortfolioProject) -> some View {
        List {
            Section {
                Button("← Proyectos") { selected = nil }
            }
            Section("Proyecto") {
                wpRow("Título",    p.title)
                wpRow("Sector",    p.sector)
                wpRow("Resumen",   p.summary)
                wpRow("Impacto",   p.impact)
                wpRow("Servicios", p.services.joined(separator: ", "))
                wpRow("Tags",      p.tags.joined(separator: ", "))
                wpRow("Highlights", p.highlights.joined(separator: ", "))
                wpRow("Slug",      p.slug)
                wpRow("Fecha",     String(p.createdAt.prefix(10)))
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func wpRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }
}

private struct WorkProjectRow: View {
    let item: PortfolioProject
    var body: some View {
        let name    = item.displayTitle
        let sub     = item.subtitle
        let date    = String(item.createdAt.prefix(10))
        let color: Color = item.impact.isEmpty ? .orange : .green
        HStack(spacing:0) {
            Rectangle().fill(color).frame(width:4).clipShape(RoundedRectangle(cornerRadius:2))
            VStack(alignment:.leading, spacing:4) {
                Text(name.isEmpty ? "Proyecto" : name).font(.subheadline).bold().lineLimit(1)
                if !sub.isEmpty { Text(sub).font(.caption).foregroundColor(.secondary) }
                HStack {
                    if !item.sector.isEmpty {
                        Text(item.sector.capitalized).font(.caption2).bold().foregroundColor(color)
                            .padding(.horizontal,6).padding(.vertical,2)
                            .background(color.opacity(0.12)).clipShape(Capsule())
                    }
                    Spacer()
                    if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
                }
            }
            .padding(.horizontal,10).padding(.vertical,8)
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – NewsletterView (suscriptores)
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class NewsletterVM: ObservableObject {
    @Published var items: [ConsoleNewsletterSubscriber] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [ConsoleNewsletterSubscriber] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.email.lowercased().contains(q) ||
            $0.name.lowercased().contains(q)
        }
    }
    var active: Int { items.filter { !$0.isUnsubscribed }.count }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.newsletterItems(); isLoading = false }
    }
}

struct NewsletterView: View {
    @StateObject private var vm = NewsletterVM()
    @State private var selected: ConsoleNewsletterSubscriber?
    var body: some View {
        Group {
            if let s = selected { nlDetail(s) } else { nlList }
        }
        .navigationTitle(selected == nil ? "Newsletter" : "")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) {
            if selected == nil { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } }
        }}
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    private var nlList: some View {
        VStack(spacing: 0) {
            if !vm.items.isEmpty {
                HStack(spacing: 0) {
                    OpsKpi(label: "Suscriptores", value: "\(vm.items.count)", color: .primary)
                    Divider().frame(height:32)
                    OpsKpi(label: "Activos", value: "\(vm.active)", color: .green)
                }
                .padding(.horizontal).padding(.vertical,6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius:12))
                .padding(.horizontal).padding(.top,8)
            }
            searchBar("Buscar suscriptor…", text: $vm.query)
            if vm.isLoading { Spacer(); ProgressView(); Spacer() }
            else if vm.filtered.isEmpty { Spacer(); Text("Sin suscriptores").foregroundColor(.secondary); Spacer() }
            else {
                List(vm.filtered.prefix(60)) { item in
                    Button { selected = item } label: { NewsletterRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }.listStyle(.plain)
            }
        }
    }

    @ViewBuilder private func nlDetail(_ s: ConsoleNewsletterSubscriber) -> some View {
        let email   = s.email
        let name    = s.name
        let unsub   = s.isUnsubscribed
        let date    = String(s.createdAt.prefix(10))
        let source  = StockParse.str(s.raw["source"], s.raw["fuente"], s.raw["origen"])
        List {
            Section { Button("← Newsletter") { selected = nil } }
            Section("Suscriptor") {
                oRow("Email",     email)
                oRow("Nombre",    name)
                oRow("Estado",    unsub ? "Dado de baja" : "Activo")
                oRow("Fecha",     date)
                oRow("Fuente",    source)
            }
            if !email.isEmpty {
                Section {
                    Link(destination: URL(string: "mailto:\(email)")!) {
                        Label("Escribir email", systemImage: "envelope")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }
}

private struct NewsletterRow: View {
    let item: ConsoleNewsletterSubscriber
    var body: some View {
        let email  = item.email
        let name   = item.name
        let unsub  = item.isUnsubscribed
        HStack(spacing:12) {
            ZStack {
                Circle().fill((unsub ? Color.secondary : Color.teal).opacity(0.12)).frame(width:38,height:38)
                Image(systemName: unsub ? "envelope.badge.slash" : "envelope.badge")
                    .foregroundColor(unsub ? .secondary : .teal).font(.system(size:16))
            }
            VStack(alignment:.leading, spacing:2) {
                Text(email.isEmpty ? "Sin email" : email).font(.subheadline).bold()
                if !name.isEmpty { Text(name).font(.caption).foregroundColor(.secondary) }
            }
            Spacer()
            Text(unsub ? "Baja" : "Activo").font(.caption2).bold()
                .foregroundColor(unsub ? .secondary : .teal)
                .padding(.horizontal,6).padding(.vertical,2)
                .background((unsub ? Color.secondary : Color.teal).opacity(0.10)).clipShape(Capsule())
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius:12))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – Shared UI helpers (file-private)
// ─────────────────────────────────────────────────────────────────────────────

struct OpsKpi: View {
    let label: String; let value: String; let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 4)
    }
}

@ViewBuilder
func searchBar(_ placeholder: String, text: Binding<String>) -> some View {
    HStack(spacing: 8) {
        Image(systemName: "magnifyingglass").foregroundColor(.secondary)
        TextField(placeholder, text: text).autocorrectionDisabled()
        if !text.wrappedValue.isEmpty {
            Button { text.wrappedValue = "" } label: {
                Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
            }
        }
    }
    .padding(10)
    .background(Color(.secondarySystemGroupedBackground))
    .clipShape(RoundedRectangle(cornerRadius: 12))
    .padding(.horizontal).padding(.top, 6).padding(.bottom, 2)
}
