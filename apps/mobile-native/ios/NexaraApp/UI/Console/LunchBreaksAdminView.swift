import SwiftUI

/// Comidas del equipo (admin) — paridad Android `LunchBreaksModuleScreen`.
struct LunchBreaksAdminView: View {
    @State private var items: [[String: Any]] = []
    @State private var query = ""
    @State private var isLoading = true

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            ConsoleHelpers.mapStr($0, "userName", "usuario").lowercased().contains(q) ||
            ConsoleHelpers.mapStr($0, "reason", "motivo").lowercased().contains(q)
        }
    }

    var body: some View {
        List {
            if isLoading { ProgressView() }
            ForEach(filtered, id: \.lbKey) { row in
                VStack(alignment: .leading, spacing: 4) {
                    Text(ConsoleHelpers.mapStr(row, "userName", "usuario")).font(.headline)
                    Text(ConsoleHelpers.mapStr(row, "reason", "motivo"))
                        .font(.caption).foregroundColor(.secondary)
                    HStack {
                        OpsStatusChip(text: ConsoleHelpers.mapStr(row, "status", "estatus"))
                        Spacer()
                        Text(String(ConsoleHelpers.mapStr(row, "startedAt", "checkinTime", "createdAt").prefix(16)))
                            .font(.caption2).foregroundColor(.secondary)
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .searchable(text: $query, prompt: "Buscar empleado…")
        .navigationTitle("Comidas (equipo)")
        .task { await reload() }
        .refreshable { await reload() }
        .refreshOnModels(["LunchBreak", "Attendance"], refresh: { await reload() })
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        items = await ExtraRepository.shared.teamLunchBreaks()
    }
}

private extension [String: Any] {
    var lbKey: String { "lb-\(self["id"] ?? UUID().uuidString)" }
}
