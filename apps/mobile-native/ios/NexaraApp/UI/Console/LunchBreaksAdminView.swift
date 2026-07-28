import SwiftUI

/// Comidas del equipo (admin) — paridad Android `LunchBreaksModuleScreen`.
struct LunchBreaksAdminView: View {
    @State private var items: [LunchBreak] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var selected: LunchBreak?

    private var filtered: [LunchBreak] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter {
            $0.userName.lowercased().contains(q) ||
            $0.status.lowercased().contains(q) ||
            $0.notes.lowercased().contains(q)
        }
    }

    private var lateCount: Int {
        items.filter { $0.isCheckinLate || $0.isCheckoutLate }.count
    }

    private var activeCount: Int { items.filter(\.isActive).count }

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

            ForEach(filtered) { row in
                Button { selected = row } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(row.userName).font(.headline).foregroundColor(.primary)
                        if !row.timeRange.isEmpty {
                            Text(row.timeRange).font(.caption).foregroundColor(.secondary)
                        }
                        HStack(spacing: 8) {
                            OpsStatusChip(text: row.status)
                            if row.isCheckinLate {
                                Text("Entrada tarde").font(.caption2).foregroundColor(.red)
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(Color.red.opacity(0.1)).clipShape(Capsule())
                            }
                            if row.isCheckoutLate {
                                Text("Salida tarde").font(.caption2).foregroundColor(.red)
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(Color.red.opacity(0.1)).clipShape(Capsule())
                            }
                            Spacer()
                            Text(String(row.date.prefix(16)))
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
    private func lunchDetail(_ row: LunchBreak) -> some View {
        List {
            Section { Button("← Comidas") { selected = nil } }
            Section("Empleado") {
                lbRow("Nombre",     row.userName)
                lbRow("Estatus",    row.status)
                lbRow("Fecha",      String(row.date.prefix(16)))
            }
            Section("Horario") {
                lbRow("Entrada",    row.checkinTime)
                lbRow("Salida",     row.checkoutTime)
            }
            if row.isCheckinLate || row.isCheckoutLate {
                Section("Alertas") {
                    if row.isCheckinLate {
                        Label("Entrada tarde", systemImage: "exclamationmark.triangle.fill").foregroundColor(.red)
                    }
                    if row.isCheckoutLate {
                        Label("Salida tarde", systemImage: "exclamationmark.triangle.fill").foregroundColor(.red)
                    }
                }
            }
            if !row.notes.isEmpty {
                Section("Notas") { Text(row.notes).font(.footnote) }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(row.userName.isEmpty ? "Comida" : row.userName)
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
        items = await ExtraRepository.shared.teamLunchBreakItems()
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
