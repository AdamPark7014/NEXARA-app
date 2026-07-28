import SwiftUI

// MARK: – ViewModel

@MainActor
final class HrLeavesVM: ObservableObject {
    @Published var items: [HrLeave] = []
    @Published var query        = ""
    @Published var typeFilter   = "todos"
    @Published var isLoading    = false

    var types: [String] {
        var t = Array(Set(items.map(\.type).filter { !$0.isEmpty })).sorted()
        return ["todos"] + t
    }

    var filtered: [HrLeave] {
        var list = items
        if typeFilter != "todos" {
            list = list.filter { $0.type.lowercased() == typeFilter.lowercased() }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter { row in
                row.displayReason.lowercased().contains(q) ||
                row.userName.lowercased().contains(q) ||
                row.type.lowercased().contains(q)
            }
        }
        return list
    }

    var pendingCount: Int { items.filter { $0.status.lowercased() == "pendiente" }.count }
    var approvedCount: Int { items.filter { $0.status.lowercased() == "aprobado" }.count }

    func load() {
        isLoading = true
        Task {
            items     = await ExtraRepository.shared.hrLeaveItems()
            isLoading = false
        }
    }
}

// MARK: – View

struct HrLeavesView: View {
    @StateObject private var vm = HrLeavesVM()
    @State private var selected: HrLeave?

    var body: some View {
        Group {
            if let s = selected { leaveDetail(s) } else { leaveList }
        }
        .navigationTitle(selected == nil ? "RR. HH. · Permisos" : "")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { vm.load() } label: { Image(systemName: "arrow.clockwise") } } }
        .refreshable { if selected == nil { vm.load() } }
        .task { vm.load() }
    }

    @ViewBuilder
    private func leaveDetail(_ leave: HrLeave) -> some View {
        let color = hrStatusColor(leave.status)
        List {
            Section { Button("← Permisos") { selected = nil } }
            Section {
                HStack {
                    Text(leave.displayReason)
                        .font(.headline)
                    Spacer()
                    Text(leave.status.capitalized).font(.caption).bold().foregroundColor(color)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(color.opacity(0.12)).clipShape(Capsule())
                }
            }
            Section("Detalles") {
                hrRow("Empleado",    leave.userName)
                hrRow("Tipo",        leave.type.capitalized)
                hrRow("Inicio",      String(leave.startDate.prefix(10)))
                hrRow("Fin",         String(leave.endDate.prefix(10)))
                hrRow("Días",        leave.days)
                hrRow("Aprobado por", leave.approverName)
            }
            if !leave.notes.isEmpty {
                Section("Notas") { Text(leave.notes).font(.footnote) }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(leave.userName.isEmpty ? "Permiso" : leave.userName)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func hrRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value).multilineTextAlignment(.trailing) }
        }
    }

    private var leaveList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if !vm.items.isEmpty {
                    HStack(spacing: 0) {
                        HrKpi(label: "Solicitudes",value: "\(vm.items.count)",     color: .primary)
                        Divider().frame(height: 36)
                        HrKpi(label: "Pendientes", value: "\(vm.pendingCount)",   color: .orange)
                        Divider().frame(height: 36)
                        HrKpi(label: "Aprobados",  value: "\(vm.approvedCount)",  color: .green)
                    }
                    .padding(.horizontal).padding(.vertical, 6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }

                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Buscar permiso…", text: $vm.query).autocorrectionDisabled()
                    if !vm.query.isEmpty {
                        Button { vm.query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) }
                    }
                }
                .padding(10)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)

                if vm.types.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(vm.types, id: \.self) { t in
                                let sel = vm.typeFilter == t
                                Button { vm.typeFilter = t } label: {
                                    Text(t.capitalized).font(.caption).bold()
                                        .padding(.horizontal, 12).padding(.vertical, 6)
                                        .background(sel ? Color.purple : Color(.secondarySystemGroupedBackground))
                                        .foregroundColor(sel ? .white : .primary)
                                        .clipShape(Capsule())
                                }
                            }
                        }
                        .padding(.horizontal)
                    }
                }

                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.filtered.isEmpty {
                    Text("Sin solicitudes").foregroundColor(.secondary).frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    VStack(spacing: 6) {
                        ForEach(vm.filtered.prefix(50)) { leave in
                            Button { selected = leave } label: {
                                HrLeaveCard(item: leave)
                            }
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
}

// MARK: – Card

private struct HrLeaveCard: View {
    let item: HrLeave
    var body: some View {
        let color = hrStatusColor(item.status)

        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(item.displayReason).font(.subheadline).bold().lineLimit(2)
                Spacer()
                Text(item.status.capitalized).font(.caption2).bold().foregroundColor(color)
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(color.opacity(0.12)).clipShape(Capsule())
            }
            if !item.userName.isEmpty { Label(item.userName, systemImage: "person").font(.caption).foregroundColor(.secondary) }
            HStack {
                if !item.type.isEmpty {
                    Label(item.type.capitalized, systemImage: "tag").font(.caption2).foregroundColor(.secondary)
                }
                Spacer()
                if !item.dateRange.isEmpty {
                    Text(item.dateRange).font(.caption2).foregroundColor(.secondary)
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: – Helpers

private struct HrKpi: View {
    let label: String; let value: String; let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 4)
    }
}

private func hrStatusColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "aprobado", "approved": return .green
    case "pendiente", "pending": return .orange
    case "rechazado", "rejected", "denied": return .red
    default: return .secondary
    }
}
