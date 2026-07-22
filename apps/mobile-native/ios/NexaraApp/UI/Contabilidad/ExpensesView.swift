import SwiftUI

// MARK: – ViewModel

@MainActor
final class ExpensesVM: ObservableObject {
    @Published var items: [[String: Any]] = []
    @Published var query = ""
    @Published var categoryFilter = "todos"
    @Published var statusFilter = "todos" // todos | pendiente | aprobado
    @Published var isLoading = false
    @Published var acting = false
    @Published var message: String?

    var canManage: Bool {
        let u = SessionStore.shared.currentUser
        if u?.isSuperAdmin == true { return true }
        let perms = u?.permissions ?? []
        return perms.contains { $0.contains("contabilidad.manage") || $0.contains("console.admin") }
    }

    var categories: [String] {
        var cats = Array(Set(items.compactMap { expStr($0, "category", "categoria") }.filter { !$0.isEmpty })).sorted()
        return ["todos"] + cats
    }

    var filtered: [[String: Any]] {
        var list = items
        if categoryFilter != "todos" {
            list = list.filter { expStr($0, "category", "categoria").lowercased() == categoryFilter.lowercased() }
        }
        if statusFilter != "todos" {
            list = list.filter { expStatus($0).lowercased().contains(statusFilter) }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter { row in
                expStr(row, "concept", "concepto", "descripcion").lowercased().contains(q) ||
                expStr(row, "category", "categoria").lowercased().contains(q) ||
                expStatus(row).lowercased().contains(q)
            }
        }
        return list
    }

    var totalAmount: Double {
        items.reduce(0.0) { $0 + (expDouble($1, "amount", "total", "monto", "montoSolicitado") ?? 0) }
    }

    var pendingTotal: Double {
        items.filter { expStatus($0).lowercased().contains("pendiente") }
            .reduce(0.0) { $0 + (expDouble($1, "amount", "total", "monto", "montoSolicitado") ?? 0) }
    }

    var categoryTotals: [(category: String, total: Double)] {
        let grouped = Dictionary(grouping: items) { expStr($0, "category", "categoria").ifBlankExp("Sin categoría") }
        return grouped.map { (cat, rows) in
            (category: cat, total: rows.reduce(0) { $0 + (expDouble($1, "amount", "total", "monto", "montoSolicitado") ?? 0) })
        }.sorted { $0.total > $1.total }
    }

    func load() {
        isLoading = true
        Task {
            items = await ExtraRepository.shared.expenses()
            isLoading = false
        }
    }

    func create(concepto: String, monto: Double, categoria: String?, ticketUrl: String?) async -> Bool {
        acting = true; message = nil
        defer { acting = false }
        do {
            try await ExtraRepository.shared.createExpense(
                concepto: concepto, monto: monto, categoria: categoria, ticketEvidenciaUrl: ticketUrl
            )
            message = "✅ Gasto registrado"
            load()
            return true
        } catch {
            message = "❌ \(error.localizedDescription)"
            return false
        }
    }

    func decide(id: Int64, approve: Bool, note: String?) async -> Bool {
        if !approve && (note ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            message = "❌ Indica motivo de rechazo"
            return false
        }
        acting = true; message = nil
        defer { acting = false }
        do {
            try await ExtraRepository.shared.approveExpense(id: id, approve: approve, note: note)
            message = approve ? "✅ Gasto aprobado" : "✅ Gasto rechazado"
            load()
            return true
        } catch {
            message = "❌ \(error.localizedDescription)"
            return false
        }
    }
}

// MARK: – View

struct ExpensesView: View {
    @StateObject private var vm = ExpensesVM()
    @State private var selected: [String: Any]?
    @State private var showCreate = false
    @State private var concepto = ""
    @State private var montoText = ""
    @State private var categoria = "OTROS"
    @State private var ticketDataUrl: String?
    @State private var rejectNote = ""

    private let categories = ["OTROS", "VIAJE", "MATERIALES", "SERVICIOS", "COMBUSTIBLE", "ALIMENTACION"]

    var body: some View {
        Group {
            if showCreate { createForm }
            else if let s = selected { expDetail(s) }
            else { listBody }
        }
        .navigationTitle(selected == nil && !showCreate ? "Gastos" : "")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if selected == nil && !showCreate {
                    Button { vm.load() } label: { Image(systemName: "arrow.clockwise") }
                }
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                if selected == nil && !showCreate {
                    Button { showCreate = true; vm.message = nil } label: { Image(systemName: "plus") }
                }
            }
        }
        .refreshable { if selected == nil && !showCreate { vm.load() } }
        .task { vm.load() }
    }

    private var listBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                NxKpiGrid(items: [
                    NxKpi(label: "Gastos", value: "\(vm.items.count)", tone: .brand),
                    NxKpi(label: "Total", value: fmtExp(vm.totalAmount), tone: .danger),
                    NxKpi(label: "Pendiente", value: fmtExp(vm.pendingTotal),
                          tone: vm.pendingTotal > 0 ? .warning : .success),
                    NxKpi(label: "Categorías", value: "\(vm.categoryTotals.count)", tone: .info),
                ]).padding(.horizontal)

                if let msg = vm.message {
                    Text(msg).font(.footnote.weight(.semibold))
                        .foregroundColor(msg.hasPrefix("✅") ? .green : .red)
                        .padding(.horizontal)
                }

                Button {
                    showCreate = true
                    vm.message = nil
                } label: {
                    Label("Registrar gasto", systemImage: "plus.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.teal)
                .padding(.horizontal)

                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Buscar gasto…", text: $vm.query).autocorrectionDisabled()
                    if !vm.query.isEmpty {
                        Button { vm.query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) }
                    }
                }
                .padding(10)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach([("todos", "Todos"), ("pendiente", "Pendientes"), ("aprobado", "Aprobados")], id: \.0) { key, label in
                            let sel = vm.statusFilter == key
                            Button { vm.statusFilter = key } label: {
                                Text(label).font(.caption).bold()
                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                    .background(sel ? Color.teal : Color(.secondarySystemGroupedBackground))
                                    .foregroundColor(sel ? .white : .primary)
                                    .clipShape(Capsule())
                            }
                        }
                        ForEach(vm.categories.filter { $0 != "todos" }.prefix(6), id: \.self) { cat in
                            let sel = vm.categoryFilter == cat
                            Button { vm.categoryFilter = sel ? "todos" : cat } label: {
                                Text(cat.capitalized).font(.caption)
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                                    .background(sel ? Color.red.opacity(0.85) : Color(.secondarySystemGroupedBackground))
                                    .foregroundColor(sel ? .white : .primary)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                    .padding(.horizontal)
                }

                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.filtered.isEmpty {
                    Text("Sin gastos").foregroundColor(.secondary).frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    VStack(spacing: 6) {
                        ForEach(vm.filtered.prefix(50), id: \.expId) { exp in
                            Button { selected = exp; rejectNote = ""; vm.message = nil } label: {
                                ExpenseCard(item: exp).padding(.horizontal)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
    }

    private var createForm: some View {
        Form {
            Section("Nuevo gasto") {
                TextField("Concepto", text: $concepto)
                TextField("Monto", text: $montoText).keyboardType(.decimalPad)
                Picker("Categoría", selection: $categoria) {
                    ForEach(categories, id: \.self) { Text($0).tag($0) }
                }
                MediaPickerBar { media in
                    ticketDataUrl = media.first?.dataUrl
                }
                if ticketDataUrl != nil {
                    Text("Comprobante adjunto").font(.caption).foregroundColor(.green)
                }
            }
            if let msg = vm.message {
                Section { Text(msg).foregroundColor(msg.hasPrefix("✅") ? .green : .red) }
            }
            Section {
                Button(vm.acting ? "Guardando…" : "Registrar gasto") {
                    Task {
                        guard let monto = Double(montoText), monto > 0, !concepto.trimmingCharacters(in: .whitespaces).isEmpty else {
                            vm.message = "❌ Concepto y monto válidos requeridos"
                            return
                        }
                        let ok = await vm.create(
                            concepto: concepto.trimmingCharacters(in: .whitespacesAndNewlines),
                            monto: monto,
                            categoria: categoria,
                            ticketUrl: ticketDataUrl
                        )
                        if ok {
                            showCreate = false
                            concepto = ""; montoText = ""; ticketDataUrl = nil
                        }
                    }
                }
                .disabled(vm.acting)
                Button("Cancelar", role: .cancel) {
                    showCreate = false
                    concepto = ""; montoText = ""; ticketDataUrl = nil
                }
            }
        }
    }

    @ViewBuilder
    private func expDetail(_ exp: [String: Any]) -> some View {
        let concept = expStr(exp, "concept", "concepto", "descripcion")
        let amount = expDouble(exp, "amount", "total", "monto", "montoSolicitado")
        let status = expStatus(exp)
        let category = expStr(exp, "category", "categoria")
        let pending = status.lowercased().contains("pendiente")
        let id = ConsoleHelpers.mapInt64(exp, "id")
        List {
            Section { Button("← Gastos") { selected = nil } }
            Section("Gasto") {
                eRow("Concepto", concept)
                if let a = amount { HStack { Text("Monto"); Spacer(); Text(fmtExp(a)).foregroundColor(.red) } }
                eRow("Categoría", category)
                eRow("Estatus", status)
                eRow("Responsable", expStr(exp, "userName", "usuario", "nombre"))
                eRow("Fecha", String(expStr(exp, "createdAt", "fecha").prefix(10)))
                eRow("Referencia", expStr(exp, "reference", "referencia"))
            }
            let notes = expStr(exp, "notes", "notas", "description")
            if !notes.isEmpty { Section("Notas") { Text(notes).font(.subheadline) } }
            if vm.canManage && pending, let id {
                Section("Decisión") {
                    TextField("Nota / motivo rechazo", text: $rejectNote, axis: .vertical).lineLimit(2...4)
                    if let msg = vm.message {
                        Text(msg).foregroundColor(msg.hasPrefix("✅") ? .green : .red)
                    }
                    Button(vm.acting ? "…" : "Aprobar") {
                        Task {
                            if await vm.decide(id: id, approve: true, note: rejectNote.nilIfEmptyExp) {
                                selected = nil
                            }
                        }
                    }
                    .disabled(vm.acting)
                    Button(vm.acting ? "…" : "Rechazar", role: .destructive) {
                        Task {
                            if await vm.decide(id: id, approve: false, note: rejectNote) {
                                selected = nil
                            }
                        }
                    }
                    .disabled(vm.acting)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func eRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }
}

// MARK: – Card

private struct ExpenseCard: View {
    let item: [String: Any]
    var body: some View {
        let concept = expStr(item, "concept", "concepto", "descripcion")
        let category = expStr(item, "category", "categoria")
        let amount = expDouble(item, "amount", "total", "monto", "montoSolicitado")
        let date = String(expStr(item, "createdAt", "fecha").prefix(10))
        let status = expStatus(item)

        HStack(spacing: 12) {
            ZStack {
                Circle().fill(Color.red.opacity(0.12)).frame(width: 40, height: 40)
                Image(systemName: "arrow.down.circle.fill").foregroundColor(.red).font(.system(size: 18))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(concept.isEmpty ? "Sin concepto" : concept).font(.subheadline).bold()
                HStack(spacing: 6) {
                    if !category.isEmpty { Text(category.capitalized).font(.caption).foregroundColor(.secondary) }
                    if !status.isEmpty {
                        Text(status).font(.caption2)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(status.lowercased().contains("pendiente") ? Color.orange.opacity(0.15) : Color.green.opacity(0.15))
                            .clipShape(Capsule())
                    }
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                if let a = amount { Text(fmtExp(a)).font(.subheadline).bold().foregroundColor(.red) }
                if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: – Helpers

private func expStatus(_ m: [String: Any]) -> String {
    expStr(m, "estatusPago", "estatus", "status")
}

private func expStr(_ m: [String: Any], _ keys: String...) -> String {
    for k in keys {
        if let v = m[k] {
            let s: String
            if let ss = v as? String { s = ss }
            else if let n = v as? NSNumber { s = n.stringValue }
            else if let nested = v as? [String: Any] {
                s = expStr(nested, "nombre", "name", "email")
            } else { s = String(describing: v) }
            if !s.isEmpty && s != "null" { return s }
        }
    }
    return ""
}

private func expDouble(_ m: [String: Any], _ keys: String...) -> Double? {
    for k in keys {
        if let v = m[k] {
            if let d = v as? Double { return d }
            if let n = v as? NSNumber { return n.doubleValue }
            if let s = v as? String, let d = Double(s) { return d }
        }
    }
    return nil
}

private func fmtExp(_ v: Double) -> String {
    if v >= 1_000_000 { return String(format: "$%.1fM", v / 1_000_000) }
    if v >= 1_000 { return String(format: "$%.0fK", v / 1_000) }
    let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = "MXN"; f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: v)) ?? "$\(Int(v))"
}

extension String {
    fileprivate func ifBlankExp(_ fallback: String) -> String { isEmpty ? fallback : self }
    fileprivate var nilIfEmptyExp: String? { isEmpty ? nil : self }
}

extension [String: Any] {
    fileprivate var expId: String {
        if let n = self["id"] as? Int { return "exp-\(n)" }
        if let s = self["id"] as? String { return "exp-\(s)" }
        return UUID().uuidString
    }
}
