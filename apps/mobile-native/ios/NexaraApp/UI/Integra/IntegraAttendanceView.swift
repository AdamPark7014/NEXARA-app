import SwiftUI

/// Asistencia ACS por rango de fechas. Paridad `IntegraAttendanceScreen`.
struct IntegraAttendanceView: View {
    @StateObject private var vm = IntegraAttendanceVM()

    var body: some View {
        Group {
            if vm.loading && vm.items.isEmpty {
                ProgressView("Cargando asistencia…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = vm.error, vm.items.isEmpty {
                NxEmptyState(title: "No se pudieron cargar", subtitle: error, actionLabel: "Reintentar") {
                    Task { await vm.refresh() }
                }
            } else {
                listBody
            }
        }
        .navigationTitle("Asistencia ACS")
        .task { await vm.refresh() }
        .refreshable { await vm.refresh(initial: false) }
        .onChange(of: vm.from) { _, _ in Task { await vm.refresh() } }
        .onChange(of: vm.to) { _, _ in Task { await vm.refresh() } }
    }

    private var listBody: some View {
        List {
            Section("Rango") {
                DatePicker("Desde", selection: $vm.from, displayedComponents: .date)
                DatePicker("Hasta", selection: $vm.to, displayedComponents: .date)
                NxAlertBanner(alert: NxAlert(
                    id: "no-exit",
                    title: "Deducido de accesos concedidos.",
                    subtitle: "Este control de acceso no emite señal de salida, así que la jornada no se cierra sola.",
                    tone: .info
                ))
            }

            Section {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Persona", text: $vm.query)
                        .autocorrectionDisabled()
                }
                Text("\(vm.filtered.count) registros")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if !vm.items.isEmpty {
                Section {
                    NxKpiGrid(items: [
                        NxKpi(label: "Registros", value: "\(vm.items.count)", tone: .brand),
                        NxKpi(label: "Personas", value: "\(vm.uniquePeople)", tone: .info),
                    ])
                    .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                    .listRowBackground(Color.clear)
                }
            }

            if vm.filtered.isEmpty {
                Section {
                    NxEmptyState(
                        title: "Sin asistencia",
                        subtitle: "No hay pasos ACS en este rango. Este hardware no emite salidas; un solo paso del día se muestra como entrada."
                    )
                }
            } else {
                ForEach(vm.filtered) { row in
                    attendanceRow(row)
                }
            }
        }
    }

    private func attendanceRow(_ row: IntegraRow) -> some View {
        let name = IntegraDict.str(row.raw, "personName", "name").nilIfEmpty ?? row.id
        let first = IntegraDict.str(row.raw, "firstIn", "checkIn", "entrada")
        let last = IntegraDict.str(row.raw, "lastOut", "checkOut", "salida")
        let minutes = IntegraDict.int(row.raw, "minutes", "durationMinutes")
        let note: String
        if last.isEmpty && !first.isEmpty {
            note = "Entrada sin salida registrada"
        } else if minutes > 0 {
            note = "\(minutes) min"
        } else {
            note = IntegraDict.str(row.raw, "note", "status")
        }

        return VStack(alignment: .leading, spacing: 4) {
            Text(name).font(.subheadline.weight(.semibold))
            if !first.isEmpty || !last.isEmpty {
                Text([first.nilIfEmpty, last.nilIfEmpty].compactMap { $0 }.joined(separator: " → "))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            if !note.isEmpty {
                Text(note).font(.caption2).foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

@MainActor
final class IntegraAttendanceVM: ObservableObject {
    @Published var items: [IntegraRow] = []
    @Published var from: Date
    @Published var to: Date
    @Published var query = ""
    @Published var loading = true
    @Published var error: String?

    private let repo = IntegraRepository.shared

    init() {
        let cal = Calendar.current
        let today = Date()
        to = today
        from = cal.date(byAdding: .day, value: -7, to: today) ?? today
    }

    var uniquePeople: Int {
        Set(items.map { IntegraDict.str($0.raw, "personId", "personName", "name", "id") }).count
    }

    var filtered: [IntegraRow] {
        items.filter {
            IntegraDict.matchesQuery($0.raw, query: query, "personName", "name", "personId", "employeeNo")
        }
    }

    func refresh(initial: Bool = true) async {
        if initial && items.isEmpty { loading = true }
        error = nil
        do {
            let rows = try await repo.attendance(from: from, to: to)
            items = rows.enumerated().map { idx, raw in
                let id = IntegraDict.str(raw, "id", "personId", "personName").nilIfEmpty ?? "att-\(idx)"
                return IntegraRow(id: "\(id)-\(idx)", raw: raw)
            }
            loading = false
        } catch {
            loading = false
            self.error = error.toUserMessage(fallback: "No se pudo cargar la asistencia")
        }
    }
}
