import SwiftUI

// MARK: – ViewModel

@MainActor
final class ExpensesVM: ObservableObject {
    @Published var items: [[String: Any]] = []
    @Published var query        = ""
    @Published var categoryFilter = "todos"
    @Published var isLoading    = false

    var categories: [String] {
        var cats = Array(Set(items.compactMap { expStr($0, "category", "categoria") }.filter { !$0.isEmpty })).sorted()
        return ["todos"] + cats
    }

    var filtered: [[String: Any]] {
        var list = items
        if categoryFilter != "todos" {
            list = list.filter { expStr($0, "category", "categoria").lowercased() == categoryFilter.lowercased() }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter { row in
                expStr(row, "concept", "concepto", "descripcion").lowercased().contains(q) ||
                expStr(row, "category", "categoria").lowercased().contains(q)
            }
        }
        return list
    }

    var totalAmount: Double {
        items.reduce(0.0) { $0 + (expDouble($1, "amount", "total", "monto") ?? 0) }
    }

    var categoryTotals: [(category: String, total: Double)] {
        let grouped = Dictionary(grouping: items) { expStr($0, "category", "categoria").ifBlankExp("Sin categoría") }
        return grouped.map { (cat, rows) in
            (category: cat, total: rows.reduce(0) { $0 + (expDouble($1, "amount", "total", "monto") ?? 0) })
        }.sorted { $0.total > $1.total }
    }

    func load() {
        isLoading = true
        Task {
            items     = await ExtraRepository.shared.expenses()
            isLoading = false
        }
    }
}

// MARK: – View

struct ExpensesView: View {
    @StateObject private var vm = ExpensesVM()
    @State private var selected: [String: Any]?

    var body: some View {
        Group {
            if let s = selected { expDetail(s) } else { listBody }
        }
        .navigationTitle(selected == nil ? "Gastos" : "")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if selected == nil { Button { vm.load() } label: { Image(systemName: "arrow.clockwise") } }
            }
        }
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    private var listBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if !vm.items.isEmpty {
                    HStack(spacing: 0) {
                        ExpKpi(label: "Gastos",  value: "\(vm.items.count)",      color: .primary)
                        Divider().frame(height: 36)
                        ExpKpi(label: "Total",   value: fmtExp(vm.totalAmount),   color: .red)
                        Divider().frame(height: 36)
                        ExpKpi(label: "Categorías", value: "\(vm.categoryTotals.count)", color: .blue)
                    }
                    .padding(.horizontal).padding(.vertical, 6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }
                if vm.categoryTotals.count > 1 {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Por categoría").font(.headline).padding(.horizontal)
                        ForEach(vm.categoryTotals.prefix(4), id: \.category) { item in
                            HStack {
                                Text(item.category).font(.caption).foregroundColor(.secondary)
                                Spacer()
                                Text(fmtExp(item.total)).font(.caption).bold()
                            }
                            .padding(.horizontal)
                        }
                    }
                    .padding(.vertical, 8)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }
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
                        ForEach(vm.categories, id: \.self) { cat in
                            let sel = vm.categoryFilter == cat
                            Button { vm.categoryFilter = cat } label: {
                                Text(cat.capitalized).font(.caption).bold()
                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                    .background(sel ? Color.red : Color(.secondarySystemGroupedBackground))
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
                            Button { selected = exp } label: {
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

    @ViewBuilder
    private func expDetail(_ exp: [String: Any]) -> some View {
        let concept  = expStr(exp, "concept", "concepto", "descripcion")
        let amount   = expDouble(exp, "amount", "total", "monto")
        let status   = expStr(exp, "status", "estatus")
        let category = expStr(exp, "category", "categoria")
        List {
            Section {
                Button("← Gastos") { selected = nil }
            }
            Section("Gasto") {
                eRow("Concepto",     concept)
                if let a = amount { HStack { Text("Monto"); Spacer(); Text(fmtExp(a)).foregroundColor(.red) } }
                eRow("Categoría",   category)
                eRow("Estatus",     status)
                eRow("Responsable", expStr(exp, "userName", "usuario", "nombre"))
                eRow("Fecha",       String(expStr(exp, "createdAt", "fecha").prefix(10)))
                eRow("Referencia",  expStr(exp, "reference", "referencia"))
            }
            let notes = expStr(exp, "notes", "notas", "description")
            if !notes.isEmpty { Section("Notas") { Text(notes).font(.subheadline) } }
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
        let concept  = expStr(item, "concept", "concepto", "descripcion")
        let category = expStr(item, "category", "categoria")
        let amount   = expDouble(item, "amount", "total", "monto")
        let date     = String(expStr(item, "createdAt", "fecha").prefix(10))

        HStack(spacing: 12) {
            ZStack {
                Circle().fill(Color.red.opacity(0.12)).frame(width: 40, height: 40)
                Image(systemName: "arrow.down.circle.fill").foregroundColor(.red).font(.system(size: 18))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(concept.isEmpty ? "Sin concepto" : concept).font(.subheadline).bold()
                if !category.isEmpty { Text(category.capitalized).font(.caption).foregroundColor(.secondary) }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                if let a = amount { Text(fmtExp(a)).font(.subheadline).bold().foregroundColor(.red) }
                if !date.isEmpty  { Text(date).font(.caption2).foregroundColor(.secondary) }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: – Helpers

private struct ExpKpi: View {
    let label: String; let value: String; let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 4)
    }
}

private func expStr(_ m: [String: Any], _ keys: String...) -> String {
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
    if v >= 1_000     { return String(format: "$%.0fK", v / 1_000) }
    let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = "MXN"; f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: v)) ?? "$\(Int(v))"
}

extension String {
    fileprivate func ifBlankExp(_ fallback: String) -> String { isEmpty ? fallback : self }
}

extension [String: Any] {
    fileprivate var expId: String {
        if let n = self["id"] as? Int { return "exp-\(n)" }
        if let s = self["id"] as? String { return "exp-\(s)" }
        return UUID().uuidString
    }
}
