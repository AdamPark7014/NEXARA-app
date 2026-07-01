import SwiftUI

// MARK: – ViewModel

@MainActor
final class TicketsDashboardVM: ObservableObject {
    @Published var tickets: [[String: Any]] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var query = ""
    @Published var statusFilter = "Todos"

    let statusOptions = ["Todos", "Abierto", "En proceso", "Cerrado", "Cancelado"]

    var filtered: [[String: Any]] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return tickets.filter { t in
            let matchQ: Bool = q.isEmpty || {
                let haystack = [tkStr(t, "title", "subject", "asunto"),
                                tkStr(t, "clientName", "cliente"),
                                tkStr(t, "folio")].joined(separator: " ").lowercased()
                return haystack.contains(q)
            }()
            let matchS: Bool = statusFilter == "Todos" || tkStr(t, "status", "estatus").localizedLowercase.contains(statusFilter.localizedLowercase)
            return matchQ && matchS
        }
    }

    func load() {
        isLoading = true; error = nil
        Task {
            let data = await ExtraRepository.shared.clientTicketRequests()
            tickets  = data
            isLoading = false
        }
    }
}

// MARK: – View

struct TicketsDashboardView: View {
    @StateObject private var vm = TicketsDashboardVM()

    var body: some View {
        VStack(spacing: 0) {
            // Search bar
            HStack {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("Buscar folio, cliente…", text: $vm.query)
                    .textFieldStyle(.plain)
                if !vm.query.isEmpty {
                    Button { vm.query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) }
                }
            }
            .padding(10)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal).padding(.top, 8)

            // Status chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(vm.statusOptions, id: \.self) { opt in
                        let sel = vm.statusFilter == opt
                        Button { vm.statusFilter = opt } label: {
                            Text(opt)
                                .font(.caption).bold()
                                .foregroundColor(sel ? .white : .primary)
                                .padding(.horizontal, 14).padding(.vertical, 7)
                                .background(sel ? Color.teal : Color(.secondarySystemGroupedBackground))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal).padding(.vertical, 8)
            }

            // KPI strip
            if !vm.tickets.isEmpty && !vm.isLoading {
                let open   = vm.tickets.filter { tkStr($0, "status","estatus").localizedLowercase.contains("abierto") || tkStr($0, "status","estatus").localizedLowercase.contains("open") }.count
                let inProc = vm.tickets.filter { tkStr($0, "status","estatus").localizedLowercase.contains("proceso") || tkStr($0, "status","estatus").localizedLowercase.contains("progress") }.count
                let closed = vm.tickets.filter { tkStr($0, "status","estatus").localizedLowercase.contains("cerrad") || tkStr($0, "status","estatus").localizedLowercase.contains("closed") }.count

                HStack(spacing: 0) {
                    TkKpiChip(label: "Total", value: "\(vm.tickets.count)", color: .secondary)
                    Divider().frame(height: 32)
                    TkKpiChip(label: "Abiertos", value: "\(open)", color: .orange)
                    Divider().frame(height: 32)
                    TkKpiChip(label: "En proceso", value: "\(inProc)", color: .blue)
                    Divider().frame(height: 32)
                    TkKpiChip(label: "Cerrados", value: "\(closed)", color: .green)
                }
                .padding(.horizontal)
                .padding(.vertical, 6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)
            }

            Divider().padding(.top, 4)

            // List
            if vm.isLoading {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                Spacer()
            } else if let err = vm.error {
                VStack(spacing: 12) {
                    Text("Error").font(.headline)
                    Text(err).font(.footnote).foregroundColor(.secondary)
                    Button("Reintentar") { vm.load() }.buttonStyle(.bordered)
                }.padding().frame(maxWidth: .infinity)
                Spacer()
            } else if vm.filtered.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "ticket").font(.largeTitle).foregroundColor(.secondary)
                    Text(vm.tickets.isEmpty ? "Sin tickets" : "Sin resultados").foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity).padding(.top, 60)
                Spacer()
            } else {
                List {
                    ForEach(vm.filtered.prefix(200), id: \.tkId) { t in
                        TicketRow(item: t)
                            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                    }
                }
                .listStyle(.plain)
                .refreshable { vm.load() }
            }
        }
        .navigationTitle("Tickets")
        .task { vm.load() }
    }
}

// MARK: – Subviews

private struct TkKpiChip: View {
    let label: String; let value: String; let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
    }
}

private struct TicketRow: View {
    let item: [String: Any]
    var body: some View {
        let title  = tkStr(item, "title", "subject", "asunto").ifBlankTk("Ticket")
        let folio  = tkStr(item, "folio")
        let client = tkStr(item, "clientName", "cliente", "branchName")
        let status = tkStr(item, "status", "estatus").ifBlankTk("–")
        let date   = tkStr(item, "createdAt", "requestedAt")
        let color  = tkStatusColor(status)

        VStack(alignment: .leading, spacing: 6) {
            HStack {
                if !folio.isEmpty {
                    Text(folio).font(.caption2).bold().foregroundColor(.teal)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.teal.opacity(0.1)).clipShape(Capsule())
                }
                Spacer()
                Text(status).font(.caption2).bold().foregroundColor(color)
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(color.opacity(0.12)).clipShape(Capsule())
            }
            Text(title).font(.subheadline).bold().lineLimit(2)
            HStack {
                if !client.isEmpty { Text(client).font(.caption).foregroundColor(.secondary).lineLimit(1) }
                Spacer()
                if !date.isEmpty { Text(date.prefix(10)).font(.caption2).foregroundColor(.secondary) }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: – Helpers

private func tkStr(_ m: [String: Any], _ keys: String...) -> String {
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

private func tkStatusColor(_ s: String) -> Color {
    let l = s.localizedLowercase
    if l.contains("cerrad") || l.contains("closed") || l.contains("resuelto") { return .green }
    if l.contains("proceso") || l.contains("progress") { return .blue }
    if l.contains("abierto") || l.contains("open") { return .orange }
    if l.contains("cancelad") { return .red }
    return .secondary
}

extension String {
    fileprivate func ifBlankTk(_ fallback: String) -> String { isEmpty ? fallback : self }
}

extension [String: Any] {
    fileprivate var tkId: String {
        if let n = self["id"] as? Int { return String(n) }
        if let s = self["id"] as? String { return s }
        return UUID().uuidString
    }
}
