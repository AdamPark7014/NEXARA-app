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

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – MaintenanceView (Órdenes de trabajo + activos)
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class MaintenanceVM: ObservableObject {
    @Published var orders: [[String: Any]] = []
    @Published var assets: [[String: Any]] = []
    @Published var tab    = 0
    @Published var query  = ""
    @Published var isLoading = false
    @Published var selectedOrder: [String: Any]?
    @Published var acting = false
    @Published var message: String?

    var filteredOrders: [[String: Any]] {
        guard !query.isEmpty else { return orders }
        let q = query.lowercased()
        return orders.filter {
            oStr($0, "title","description","orderNumber").lowercased().contains(q) ||
            oStr($0, "assetName","equipmentName").lowercased().contains(q)
        }
    }
    var filteredAssets: [[String: Any]] {
        guard !query.isEmpty else { return assets }
        let q = query.lowercased()
        return assets.filter {
            oStr($0, "name","nombre").lowercased().contains(q) ||
            oStr($0, "code","tag","serial").lowercased().contains(q)
        }
    }

    var openOrders: Int { orders.filter { oStr($0,"status","estado").lowercased().contains("abierta") || oStr($0,"status").lowercased() == "open" }.count }

    func load() {
        isLoading = true
        Task {
            async let o = ExtraRepository.shared.workOrders()
            async let a = ExtraRepository.shared.maintenanceAssets()
            orders = await o; assets = await a
            isLoading = false
        }
    }

    func startOrder(_ id: Int64) async {
        acting = true; defer { acting = false }
        do {
            _ = try await OpsRepository.shared.startWorkOrder(id: id)
            message = "Orden iniciada"
            selectedOrder = nil
            load()
        } catch { message = error.localizedDescription }
    }

    func completeOrder(_ id: Int64) async {
        acting = true; defer { acting = false }
        do {
            _ = try await OpsRepository.shared.completeWorkOrder(id: id)
            message = "Orden completada"
            selectedOrder = nil
            load()
        } catch { message = error.localizedDescription }
    }
}

struct MaintenanceView: View {
    var initialTab: Int = 0
    @StateObject private var vm = MaintenanceVM()

    var body: some View {
        Group {
            if let order = vm.selectedOrder { orderDetail(order) } else { mainBody }
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
                List(vm.filteredOrders.prefix(60), id: { opsIdKey($0,"wo") }) { item in
                    Button { vm.selectedOrder = item } label: {
                        WorkOrderRow(item: item)
                    }
                    .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
            } else {
                List(vm.filteredAssets.prefix(60), id: { opsIdKey($0,"ast") }) { item in
                    AssetRow(item: item)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
            }
        }
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { vm.load() } label: { Image(systemName: "arrow.clockwise") } } }
        .refreshable { vm.load() }
    }

    private func orderDetail(_ order: [String: Any]) -> some View {
        let id = ConsoleHelpers.mapInt64(order, "id")
        let status = oStr(order, "status", "estado").uppercased()
        return List {
            Section("Orden de trabajo") {
                detailRow("Título", oStr(order, "title", "description"))
                detailRow("Activo", oStr(order, "assetName", "equipmentName", "asset"))
                detailRow("Prioridad", oStr(order, "priority"))
                detailRow("Estado", oStr(order, "status", "estado"))
                detailRow("Programada", oStr(order, "scheduledAt", "scheduledDate"))
            }
            if let id {
                Section("Acciones") {
                    if status.contains("PENDIENTE") || status == "OPEN" {
                        Button("Iniciar orden") { Task { await vm.startOrder(id) } }.disabled(vm.acting)
                    }
                    if status.contains("PROGRESO") || status.contains("IN_PROGRESS") {
                        Button("Completar orden") { Task { await vm.completeOrder(id) } }.disabled(vm.acting)
                    }
                }
            }
            Button("Volver") { vm.selectedOrder = nil }
        }
    }

    @ViewBuilder private func detailRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }
}

private struct WorkOrderRow: View {
    let item: [String: Any]
    var body: some View {
        let title  = oStr(item, "title","description","orderNumber")
        let asset  = oStr(item, "assetName","equipmentName","asset")
        let status = oStr(item, "status","estado")
        let date   = String(oStr(item,"scheduledDate","createdAt").prefix(10))
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
    let item: [String: Any]
    var body: some View {
        let name   = oStr(item,"name","nombre")
        let code   = oStr(item,"code","tag","serial")
        let status = oStr(item,"status","estado","condition")
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

// ─────────────────────────────────────────────────────────────────────────────
// MARK: – ServiceSheetsView (Hojas de servicio)
// ─────────────────────────────────────────────────────────────────────────────

@MainActor final class ServiceSheetsVM: ObservableObject {
    @Published var items: [[String: Any]] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            oStr($0,"folio","number").lowercased().contains(q) ||
            oStr($0,"clientName","anNumber").lowercased().contains(q)
        }
    }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.serviceSheets(); isLoading = false }
    }
}

struct ServiceSheetsView: View {
    @StateObject private var vm = ServiceSheetsVM()
    @State private var selected: [String: Any]?
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
                    let signed = vm.items.filter { oStr($0,"status","estado").lowercased().contains("firmada") || oStr($0,"signed") == "true" }.count
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
                List(vm.filtered.prefix(60), id: { opsIdKey($0,"ss") }) { item in
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
    private func ssDetail(_ s: [String: Any]) -> some View {
        let status = oStr(s,"status","estado")
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
                ssRow("Folio",       oStr(s,"folio","number"))
                ssRow("Cliente",     oStr(s,"clientName","cliente","anNumber"))
                ssRow("Técnico",     oStr(s,"technicianName","tecnico","assignedTo"))
                ssRow("Fecha",       String(oStr(s,"createdAt","fecha").prefix(10)))
                ssRow("Inicio",      String(oStr(s,"startDate","fechaInicio").prefix(10)))
                ssRow("Fin",         String(oStr(s,"endDate","fechaFin").prefix(10)))
                ssRow("Ubicación",   oStr(s,"location","ubicacion","address"))
                ssRow("Tipo",        oStr(s,"type","tipo"))
            }
            let desc = oStr(s,"description","descripcion","notes","notas")
            if !desc.isEmpty { Section("Descripción") { Text(desc).font(.subheadline) } }
            let tasks = (s["tasks"] as? [[String: Any]]) ?? []
            if !tasks.isEmpty {
                Section("Tareas (\(tasks.count))") {
                    ForEach(Array(tasks.enumerated()), id: \.offset) { _, t in
                        HStack {
                            Image(systemName: (t["completed"] as? Bool == true) ? "checkmark.circle.fill" : "circle")
                                .foregroundColor((t["completed"] as? Bool == true) ? .green : .secondary)
                            Text(oStr(t,"description","name","tarea")).font(.caption)
                        }
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
    let item: [String: Any]
    var body: some View {
        let folio  = oStr(item,"folio","number")
        let client = oStr(item,"clientName","cliente","anNumber")
        let status = oStr(item,"status","estado")
        let date   = String(oStr(item,"createdAt","fecha").prefix(10))
        let tech   = oStr(item,"technicianName","tecnico","assignedTo")
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
    var body: some View {
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
                    StockItemRow(item: item)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
            } else {
                List(vm.filteredWh.prefix(60), id: { opsIdKey($0,"wh") }) { item in
                    WarehouseRow(item: item)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Almacén · Bodega")
        .onAppear { vm.tab = initialTab }
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } } }
        .refreshable { vm.load() }
        .task { vm.load() }
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
    @Published var items: [[String: Any]] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            oStr($0,"concept","concepto").lowercased().contains(q) ||
            oStr($0,"userName","empleado","nombre").lowercased().contains(q)
        }
    }
    var totalPaid: Double { items.reduce(0) { $0 + (oDouble($1,"amount","total","monto") ?? 0) } }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.employeePayments(); isLoading = false }
    }
}

struct EmployeePaymentsView: View {
    @StateObject private var vm = EmployeePaymentsVM()
    var body: some View {
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
            else if vm.filtered.isEmpty { Spacer(); Text("Sin pagos").foregroundColor(.secondary); Spacer() }
            else {
                List(vm.filtered.prefix(60), id: { opsIdKey($0,"ep") }) { item in
                    PaymentRow(item: item)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Pagos a empleados")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } } }
        .refreshable { vm.load() }
        .task { vm.load() }
    }
}

private struct PaymentRow: View {
    let item: [String: Any]
    var body: some View {
        let concept = oStr(item,"concept","concepto","descripcion")
        let user    = oStr(item,"userName","empleado","nombre")
        let amount  = oDouble(item,"amount","total","monto")
        let date    = String(oStr(item,"paidAt","createdAt","fecha").prefix(10))
        HStack(spacing:12) {
            ZStack {
                Circle().fill(Color.green.opacity(0.12)).frame(width:38,height:38)
                Image(systemName:"dollarsign.circle.fill").foregroundColor(.green).font(.system(size:18))
            }
            VStack(alignment:.leading, spacing:2) {
                Text(concept.isEmpty ? "Pago" : concept).font(.subheadline).bold().lineLimit(1)
                if !user.isEmpty { Text(user).font(.caption).foregroundColor(.secondary) }
            }
            Spacer()
            VStack(alignment:.trailing, spacing:2) {
                if let a = amount { Text(fmtOps(a)).font(.subheadline).bold().foregroundColor(.green) }
                if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
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
    @Published var items: [[String: Any]] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            oStr($0,"reason","motivo","concepto").lowercased().contains(q) ||
            oStr($0,"userName","empleado").lowercased().contains(q)
        }
    }
    var totalAmount: Double { items.reduce(0) { $0 + (oDouble($1,"amount","total","monto") ?? 0) } }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.fines(); isLoading = false }
    }
}

struct FinesView: View {
    @StateObject private var vm = FinesVM()
    var body: some View {
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
            else if vm.filtered.isEmpty { Spacer(); Text("Sin multas").foregroundColor(.secondary); Spacer() }
            else {
                List(vm.filtered.prefix(60), id: { opsIdKey($0,"fn") }) { item in FineRow(item: item)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden) }.listStyle(.plain)
            }
        }
        .navigationTitle("Multas")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } } }
        .refreshable { vm.load() }
        .task { vm.load() }
    }
}

private struct FineRow: View {
    let item: [String: Any]
    var body: some View {
        let reason = oStr(item,"reason","motivo","concepto")
        let user   = oStr(item,"userName","empleado","nombre")
        let amount = oDouble(item,"amount","total","monto")
        let date   = String(oStr(item,"createdAt","fecha").prefix(10))
        HStack(spacing:12) {
            ZStack {
                Circle().fill(Color.red.opacity(0.12)).frame(width:38,height:38)
                Image(systemName:"exclamationmark.triangle.fill").foregroundColor(.red).font(.system(size:16))
            }
            VStack(alignment:.leading, spacing:2) {
                Text(reason.isEmpty ? "Multa" : reason).font(.subheadline).bold().lineLimit(1)
                if !user.isEmpty { Text(user).font(.caption).foregroundColor(.secondary) }
            }
            Spacer()
            VStack(alignment:.trailing, spacing:2) {
                if let a = amount { Text(fmtOps(a)).font(.subheadline).bold().foregroundColor(.red) }
                if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
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
    @Published var items: [[String: Any]] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            oStr($0,"action","accion","description").lowercased().contains(q) ||
            oStr($0,"userName","usuario").lowercased().contains(q)
        }
    }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.audit(); isLoading = false }
    }
}

struct AuditView: View {
    @StateObject private var vm = AuditVM()
    var body: some View {
        VStack(spacing: 0) {
            if !vm.items.isEmpty {
                HStack(spacing: 0) {
                    OpsKpi(label: "Registros", value: "\(vm.items.count)", color: .primary)
                    let today = vm.items.filter { oStr($0,"createdAt","fecha").prefix(10) == {
                        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.string(from: Date())
                    }() }.count
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
                List(vm.filtered.prefix(80), id: { opsIdKey($0,"au") }) { item in AuditRow(item: item)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden) }.listStyle(.plain)
            }
        }
        .navigationTitle("Auditoría")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } } }
        .refreshable { vm.load() }
        .task { vm.load() }
    }
}

private struct AuditRow: View {
    let item: [String: Any]
    var body: some View {
        let action = oStr(item,"action","accion","description")
        let user   = oStr(item,"userName","usuario","userId")
        let date   = String(oStr(item,"createdAt","timestamp").prefix(16))
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
    @Published var items: [[String: Any]] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            oStr($0,"name","title","fileName").lowercased().contains(q) ||
            oStr($0,"category","tipo").lowercased().contains(q)
        }
    }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.documents(); isLoading = false }
    }
}

struct DocumentsView: View {
    @StateObject private var vm = DocumentsVM()
    var body: some View {
        VStack(spacing: 0) {
            searchBar("Buscar documento…", text: $vm.query)
            if vm.isLoading { Spacer(); ProgressView(); Spacer() }
            else if vm.filtered.isEmpty { Spacer(); Text("Sin documentos").foregroundColor(.secondary); Spacer() }
            else {
                List(vm.filtered.prefix(60), id: { opsIdKey($0,"doc") }) { item in DocumentRow(item: item)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden) }.listStyle(.plain)
            }
        }
        .navigationTitle("Documentos")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } } }
        .refreshable { vm.load() }
        .task { vm.load() }
    }
}

private struct DocumentRow: View {
    let item: [String: Any]
    var body: some View {
        let name     = oStr(item,"name","title","fileName")
        let category = oStr(item,"category","tipo","type")
        let date     = String(oStr(item,"createdAt","updatedAt").prefix(10))
        let url      = oStr(item,"url","fileUrl","path")
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
    @Published var items: [[String: Any]] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            oStr($0,"fullName","name","fileName").lowercased().contains(q) ||
            oStr($0,"position","role","puesto").lowercased().contains(q)
        }
    }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.cvs(); isLoading = false }
    }
}

struct CvsView: View {
    @StateObject private var vm = CvsVM()
    var body: some View {
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
                List(vm.filtered.prefix(60), id: { opsIdKey($0,"cv") }) { item in CvRow(item: item)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden) }.listStyle(.plain)
            }
        }
        .navigationTitle("CVs · Candidatos")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } } }
        .refreshable { vm.load() }
        .task { vm.load() }
    }
}

private struct CvRow: View {
    let item: [String: Any]
    var body: some View {
        let name     = oStr(item,"fullName","name","fileName")
        let position = oStr(item,"position","role","puesto","cargo")
        let date     = String(oStr(item,"createdAt","receivedAt").prefix(10))
        let email    = oStr(item,"email","correo")
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
    @Published var items: [[String: Any]] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            oStr($0,"name","nombre").lowercased().contains(q) ||
            oStr($0,"subject","asunto","email").lowercased().contains(q)
        }
    }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.contactMessages(); isLoading = false }
    }
}

struct ContactMessagesView: View {
    @StateObject private var vm = ContactMessagesVM()
    @State private var selected: [String: Any]?
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
                List(vm.filtered.prefix(60), id: { opsIdKey($0,"cm") }) { item in
                    Button { selected = item } label: { ContactMsgRow(item: item) }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }.listStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func msgDetail(_ m: [String: Any]) -> some View {
        let name    = oStr(m,"name","nombre")
        let email   = oStr(m,"email","correo")
        let phone   = oStr(m,"phone","telefono")
        let subject = oStr(m,"subject","asunto")
        let message = oStr(m,"message","mensaje","body")
        let date    = String(oStr(m,"createdAt","fecha").prefix(10))
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
    let item: [String: Any]
    var body: some View {
        let name    = oStr(item,"name","nombre")
        let subject = oStr(item,"subject","asunto","message").prefix(60).description
        let email   = oStr(item,"email","correo")
        let phone   = oStr(item,"phone","telefono")
        let date    = String(oStr(item,"createdAt","fecha").prefix(10))
        let read    = item["read"] as? Bool ?? item["leido"] as? Bool ?? false
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
    @Published var items: [[String: Any]] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            oStr($0,"title","titulo").lowercased().contains(q) ||
            oStr($0,"excerpt","summary","slug").lowercased().contains(q)
        }
    }
    var published: Int { items.filter { !(($0["draft"] as? Bool) ?? false) }.count }
    var drafts:    Int { items.filter {   ($0["draft"] as? Bool) ?? false  }.count }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.news(); isLoading = false }
    }
}

struct NewsView: View {
    @StateObject private var vm = NewsVM()
    var body: some View {
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
                List(vm.filtered.prefix(60), id: { opsIdKey($0,"nw") }) { item in NewsRow(item: item)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden) }.listStyle(.plain)
            }
        }
        .navigationTitle("Noticias")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } } }
        .refreshable { vm.load() }
        .task { vm.load() }
    }
}

private struct NewsRow: View {
    let item: [String: Any]
    var body: some View {
        let title   = oStr(item,"title","titulo")
        let excerpt = oStr(item,"excerpt","summary").prefix(80).description
        let date    = String(oStr(item,"publishedAt","createdAt").prefix(10))
        let isDraft = (item["draft"] as? Bool) ?? false
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
    @Published var items: [[String: Any]] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            oStr($0,"description","descripcion","concepto").lowercased().contains(q) ||
            oStr($0,"account","cuenta").lowercased().contains(q)
        }
    }
    var totalDebit:  Double { items.reduce(0) { $0 + (oDouble($1,"debit","debe","totalDebit") ?? 0) } }
    var totalCredit: Double { items.reduce(0) { $0 + (oDouble($1,"credit","haber","totalCredit") ?? 0) } }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.journalEntries(); isLoading = false }
    }
}

struct AccountingView: View {
    @StateObject private var vm = AccountingVM()
    var body: some View {
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
            else if vm.filtered.isEmpty { Spacer(); Text("Sin asientos").foregroundColor(.secondary); Spacer() }
            else {
                List(vm.filtered.prefix(60), id: { opsIdKey($0,"ac") }) { item in AccountingRow(item: item)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden) }.listStyle(.plain)
            }
        }
        .navigationTitle("Contabilidad")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } } }
        .refreshable { vm.load() }
        .task { vm.load() }
    }
}

private struct AccountingRow: View {
    let item: [String: Any]
    var body: some View {
        let desc   = oStr(item,"description","descripcion","concepto")
        let account = oStr(item,"account","cuenta")
        let debit  = oDouble(item,"debit","debe","totalDebit")
        let credit = oDouble(item,"credit","haber","totalCredit")
        let date   = String(oStr(item,"date","createdAt").prefix(10))
        HStack(spacing:10) {
            Image(systemName:"book.closed").foregroundColor(.secondary).font(.title3)
            VStack(alignment:.leading, spacing:2) {
                Text(desc.isEmpty ? "Asiento" : desc).font(.subheadline).lineLimit(1)
                if !account.isEmpty { Text(account).font(.caption).foregroundColor(.secondary) }
            }
            Spacer()
            VStack(alignment:.trailing, spacing:2) {
                if let d = debit, d > 0  { Text("D: \(fmtOps(d))").font(.caption2).foregroundColor(.red) }
                if let c = credit, c > 0 { Text("H: \(fmtOps(c))").font(.caption2).foregroundColor(.green) }
                if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
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
    @Published var items: [[String: Any]] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            oStr($0,"name","nombre","title").lowercased().contains(q) ||
            oStr($0,"clientName","cliente").lowercased().contains(q)
        }
    }
    var active: Int { items.filter { oStr($0,"status","estado").lowercased().contains("activo") || oStr($0,"status").lowercased() == "active" }.count }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.projects(); isLoading = false }
    }
}

struct WorkProjectsView: View {
    @StateObject private var vm = WorkProjectsVM()
    var body: some View {
        VStack(spacing: 0) {
            if !vm.items.isEmpty {
                HStack(spacing: 0) {
                    OpsKpi(label: "Proyectos", value: "\(vm.items.count)", color: .primary)
                    Divider().frame(height:32)
                    OpsKpi(label: "Activos",   value: "\(vm.active)",      color: .green)
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
                List(vm.filtered.prefix(60), id: { opsIdKey($0,"wp") }) { item in WorkProjectRow(item: item)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden) }.listStyle(.plain)
            }
        }
        .navigationTitle("Proyectos internos")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } } }
        .refreshable { vm.load() }
        .task { vm.load() }
    }
}

private struct WorkProjectRow: View {
    let item: [String: Any]
    var body: some View {
        let name    = oStr(item,"name","nombre","title")
        let client  = oStr(item,"clientName","cliente")
        let status  = oStr(item,"status","estado")
        let date    = String(oStr(item,"startDate","createdAt").prefix(10))
        let color: Color = status.lowercased().contains("activo") || status.lowercased() == "active" ? .green
                         : status.lowercased().contains("terminado") || status.lowercased() == "done" ? .secondary
                         : .orange
        HStack(spacing:0) {
            Rectangle().fill(color).frame(width:4).clipShape(RoundedRectangle(cornerRadius:2))
            VStack(alignment:.leading, spacing:4) {
                Text(name.isEmpty ? "Proyecto" : name).font(.subheadline).bold().lineLimit(1)
                if !client.isEmpty { Text(client).font(.caption).foregroundColor(.secondary) }
                HStack {
                    Text(status.capitalized).font(.caption2).bold().foregroundColor(color)
                        .padding(.horizontal,6).padding(.vertical,2)
                        .background(color.opacity(0.12)).clipShape(Capsule())
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
    @Published var items: [[String: Any]] = []
    @Published var query = ""; @Published var isLoading = false
    var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            oStr($0,"email","correo").lowercased().contains(q) ||
            oStr($0,"name","nombre").lowercased().contains(q)
        }
    }
    var active: Int { items.filter { !(($0["unsubscribed"] as? Bool) ?? false) && oStr($0,"status").lowercased() != "unsubscribed" }.count }
    func load() {
        isLoading = true
        Task { items = await ExtraRepository.shared.newsletter(); isLoading = false }
    }
}

struct NewsletterView: View {
    @StateObject private var vm = NewsletterVM()
    var body: some View {
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
                List(vm.filtered.prefix(60), id: { opsIdKey($0,"nl") }) { item in
                    NewsletterRow(item: item)
                        .listRowInsets(EdgeInsets(top:4,leading:12,bottom:4,trailing:12))
                        .listRowSeparator(.hidden)
                }.listStyle(.plain)
            }
        }
        .navigationTitle("Newsletter")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { vm.load() } label: { Image(systemName:"arrow.clockwise") } } }
        .refreshable { vm.load() }
        .task { vm.load() }
    }
}

private struct NewsletterRow: View {
    let item: [String: Any]
    var body: some View {
        let email  = oStr(item,"email","correo")
        let name   = oStr(item,"name","nombre")
        let status = oStr(item,"status","estado")
        let unsub  = (item["unsubscribed"] as? Bool) ?? false || status.lowercased() == "unsubscribed"
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
