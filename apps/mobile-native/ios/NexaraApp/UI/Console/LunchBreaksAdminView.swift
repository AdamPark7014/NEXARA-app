import SwiftUI

/// Comidas del equipo (admin) — paridad Android `LunchBreaksModuleScreen`.
struct LunchBreaksAdminView: View {
    @State private var items: [[String: Any]] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var selected: [String: Any]?

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            ConsoleHelpers.mapStr($0, "userName", "usuario").lowercased().contains(q) ||
            ConsoleHelpers.mapStr($0, "reason", "motivo", "status", "estatus").lowercased().contains(q)
        }
    }

    private var lateCount: Int {
        items.filter {
            ($0["isCheckinLate"] as? Bool == true) || ($0["isCheckoutLate"] as? Bool == true)
        }.count
    }

    private var activeCount: Int {
        items.filter {
            let s = ConsoleHelpers.mapStr($0, "status", "estatus").lowercased()
            return s.contains("active") || s.contains("open") || s.contains("abiert")
        }.count
    }

    var body: some View {
        Group {
            if let s = selected { lunchDetail(s) } else { lunchList }
        }
        .navigationTitle(selected == nil ? "Comidas (equipo)" : "")
        .task { await reload() }
        .refreshable { if selected == nil { await reload() } }
        .refreshOnModels(["LunchBreak", "Attendance"], refresh: { await reload() })
    }

    private var lunchList: some View {
        List {
            Section {
                HStack(spacing: 10) {
                    LunchKpiPill(label: "Hoy", value: "\(items.count)", accent: .teal)
                    LunchKpiPill(label: "Activas", value: "\(activeCount)", accent: .blue)
                    LunchKpiPill(label: "Tarde", value: "\(lateCount)", accent: .red)
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            }

            if isLoading { ProgressView() }

            ForEach(filtered, id: \.lbKey) { row in
                Button { selected = row } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ConsoleHelpers.mapStr(row, "userName", "usuario")).font(.headline).foregroundColor(.primary)
                        let checkin = ConsoleHelpers.mapStr(row, "checkinTime", "startedAt")
                        let checkout = ConsoleHelpers.mapStr(row, "checkoutTime", "endedAt")
                        if !checkin.isEmpty || !checkout.isEmpty {
                            Text([checkin, checkout].filter { !$0.isEmpty }.joined(separator: " → "))
                                .font(.caption).foregroundColor(.secondary)
                        }
                        HStack(spacing: 8) {
                            OpsStatusChip(text: ConsoleHelpers.mapStr(row, "status", "estatus"))
                            if row["isCheckinLate"] as? Bool == true {
                                Text("Entrada tarde").font(.caption2).foregroundColor(.red)
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(Color.red.opacity(0.1)).clipShape(Capsule())
                            }
                            if row["isCheckoutLate"] as? Bool == true {
                                Text("Salida tarde").font(.caption2).foregroundColor(.red)
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(Color.red.opacity(0.1)).clipShape(Capsule())
                            }
                            Spacer()
                            Text(String(ConsoleHelpers.mapStr(row, "date", "startedAt", "createdAt").prefix(16)))
                                .font(.caption2).foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .buttonStyle(.plain)
            }
        }
        .searchable(text: $query, prompt: "Buscar empleado…")
    }

    @ViewBuilder
    private func lunchDetail(_ row: [String: Any]) -> some View {
        let userName = ConsoleHelpers.mapStr(row, "userName", "usuario")
        List {
            Section { Button("← Comidas") { selected = nil } }
            Section("Empleado") {
                lbRow("Nombre",     userName)
                lbRow("Estatus",    ConsoleHelpers.mapStr(row, "status", "estatus"))
                lbRow("Fecha",      String(ConsoleHelpers.mapStr(row, "date", "startedAt", "createdAt").prefix(16)))
            }
            Section("Horario") {
                lbRow("Entrada",    ConsoleHelpers.mapStr(row, "checkinTime", "startedAt"))
                lbRow("Salida",     ConsoleHelpers.mapStr(row, "checkoutTime", "endedAt"))
                lbRow("Duración",   ConsoleHelpers.mapStr(row, "duration", "duracion"))
                lbRow("Supervisor", ConsoleHelpers.mapStr(row, "supervisorName", "supervisor", "approvedBy"))
            }
            if row["isCheckinLate"] as? Bool == true || row["isCheckoutLate"] as? Bool == true {
                Section("Alertas") {
                    if row["isCheckinLate"] as? Bool == true {
                        Label("Entrada tarde", systemImage: "exclamationmark.triangle.fill").foregroundColor(.red)
                    }
                    if row["isCheckoutLate"] as? Bool == true {
                        Label("Salida tarde", systemImage: "exclamationmark.triangle.fill").foregroundColor(.red)
                    }
                }
            }
            let notes = ConsoleHelpers.mapStr(row, "notes", "reason", "motivo", "observaciones")
            if !notes.isEmpty {
                Section("Notas") { Text(notes).font(.footnote) }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(userName.isEmpty ? "Comida" : userName)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func lbRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value).multilineTextAlignment(.trailing) }
        }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        items = await ExtraRepository.shared.teamLunchBreaks()
    }
}

private struct LunchKpiPill: View {
    let label: String; let value: String; let accent: Color
    var body: some View {
        VStack(spacing: 4) {
            Text(label).font(.caption2).foregroundColor(accent)
            Text(value).font(.headline)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(accent.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

private extension [String: Any] {
    var lbKey: String { "lb-\(self["id"] ?? UUID().uuidString)" }
}
