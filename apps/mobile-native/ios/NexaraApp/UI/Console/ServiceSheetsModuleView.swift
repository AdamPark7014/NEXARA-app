import SwiftUI

/// Hojas de servicio — listado con detalle (paridad web `/operacion/service-sheets`).
struct ServiceSheetsModuleView: View {
    @State private var items: [[String: Any]] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var selected: [String: Any]?

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            ssStr($0, "folio", "number").lowercased().contains(q) ||
            ssStr($0, "clientName", "anNumber").lowercased().contains(q)
        }
    }

    var body: some View {
        Group {
            if let s = selected { detail(s) } else { listBody }
        }
        .navigationTitle("Hojas de servicio")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var listBody: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField("Buscar folio o cliente…", text: $query).autocorrectionDisabled()
            }
            .padding(10)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding()

            if isLoading { Spacer(); ProgressView(); Spacer() }
            else if filtered.isEmpty {
                Spacer()
                Text("Sin hojas de servicio").foregroundColor(.secondary)
                Spacer()
            } else {
                List(filtered.prefix(80), id: \.ssId) { row in
                    Button { selected = row } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(ssStr(row, "folio", "number", "title")).font(.headline)
                            Text(ssStr(row, "clientName", "cliente", "anNumber")).font(.caption).foregroundColor(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private func detail(_ r: [String: Any]) -> some View {
        List {
            Section("Hoja de servicio") {
                ssRow("Folio", ssStr(r, "folio", "number"))
                ssRow("Cliente", ssStr(r, "clientName", "cliente"))
                ssRow("AN", ssStr(r, "anNumber", "activityAn"))
                ssRow("Estado", ssStr(r, "status", "estado"))
                ssRow("Técnico", ssStr(r, "technicianName", "userName"))
                ssRow("Fecha", ssStr(r, "createdAt", "date"))
            }
            Button("Volver") { selected = nil }
        }
    }

    @ViewBuilder private func ssRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        items = await ExtraRepository.shared.serviceSheets()
    }
}

private func ssStr(_ m: [String: Any], _ keys: String...) -> String {
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

extension [String: Any] {
    fileprivate var ssId: String { "ss-\(self["id"] ?? UUID().uuidString)" }
}
