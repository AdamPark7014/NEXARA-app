import SwiftUI

// MARK: – ViewModel

@MainActor
final class AttendanceVM: ObservableObject {
    @Published var records: [AttendanceEvent] = []
    @Published var current: AttendanceCurrent?
    @Published var weekFrom = ConsoleHelpers.weekRange().from
    @Published var weekTo = ConsoleHelpers.weekRange().to
    @Published var query = ""
    @Published var isLoading = false
    @Published var loadError: String?
    @Published var checkInLoading = false
    @Published var checkInMessage: String?

    var isCheckedIn: Bool { current?.isOpen == true }

    var filtered: [AttendanceEvent] {
        guard !query.isEmpty else { return records }
        let q = query.lowercased()
        return records.filter {
            $0.userName.lowercased().contains(q) || $0.type.lowercased().contains(q)
        }
    }

    var summary: (total: Int, entries: Int, exits: Int, lates: Int) {
        let total = records.count
        let entries = records.filter {
            let t = $0.type.lowercased()
            return t.contains("entrada") || t == "in"
        }.count
        let exits = records.filter {
            let t = $0.type.lowercased()
            return t.contains("salida") || t == "out"
        }.count
        let lates = records.filter(\.isLate).count
        return (total, entries, exits, lates)
    }

    func load() {
        isLoading = true
        loadError = nil
        Task {
            do {
                current = try await ConsoleRepository.shared.attendanceCurrentItem()
                let range = try await ConsoleRepository.shared.attendanceRangeItem(from: weekFrom, to: weekTo)
                if range.events.isEmpty {
                    records = await ExtraRepository.shared.attendanceEventItems()
                } else {
                    records = range.events
                }
            } catch {
                records = await ExtraRepository.shared.attendanceEventItems()
                if records.isEmpty {
                    loadError = error.localizedDescription
                }
            }
            isLoading = false
        }
    }

    func checkIn(_ type: String) {
        checkInLoading = true
        checkInMessage = nil
        Task {
            do {
                let coord = await DeviceLocation.shared.current()
                let res = try await ConsoleRepository.shared.attendanceCheckInResult(
                    type: type,
                    lat: coord?.latitude,
                    lng: coord?.longitude
                )
                let base = res.message.isEmpty
                    ? (type == "entrada" ? "Entrada registrada" : "Salida registrada")
                    : res.message
                let geo: String
                if let c = coord {
                    if let acc = c.accuracyM, acc > 100 {
                        geo = String(format: " · GPS %.5f, %.5f (±%.0fm — baja precisión)", c.latitude, c.longitude, acc)
                    } else if let acc = c.accuracyM {
                        geo = String(format: " · GPS %.5f, %.5f (±%.0fm)", c.latitude, c.longitude, acc)
                    } else {
                        geo = String(format: " · GPS %.5f, %.5f", c.latitude, c.longitude)
                    }
                } else {
                    geo = " (sin GPS — activa ubicación)"
                }
                checkInMessage = base + geo
                load()
            } catch {
                checkInMessage = "Error: \(error.localizedDescription)"
            }
            checkInLoading = false
        }
    }
}

// MARK: – View

struct AttendanceView: View {
    @StateObject private var vm = AttendanceVM()
    @State private var selected: AttendanceEvent?

    var body: some View {
        Group {
            if let s = selected { attDetail(s) } else { attList }
        }
        .navigationTitle(selected == nil ? "Asistencia" : "")
        .task { vm.load() }
        .onChange(of: vm.checkInMessage) { msg in
            if msg != nil {
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { vm.checkInMessage = nil }
            }
        }
    }

    @ViewBuilder
    private func attDetail(_ rec: AttendanceEvent) -> some View {
        List {
            Section { Button("← Asistencia") { selected = nil } }
            Section("Registro") {
                attRow("Empleado", rec.displayName)
                attRow("Tipo", rec.type.capitalized)
                attRow("Fecha", String(rec.timestamp.prefix(19)))
                attRow("Ubicación", rec.location)
                attRow("Dispositivo", rec.device)
                if rec.isLate {
                    Label("Registro tarde", systemImage: "exclamationmark.triangle.fill").foregroundColor(.red)
                }
                attRow("Observaciones", rec.notes)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(rec.displayName)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func attRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value).multilineTextAlignment(.trailing) }
        }
    }

    private var attList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                checkInCard

                Text("Semana: \(vm.weekFrom) → \(vm.weekTo)")
                    .font(.caption).foregroundColor(.secondary).padding(.horizontal)

                if let err = vm.loadError {
                    NxAlertBanner(alert: NxAlert(id: "att-err", title: "No se pudo cargar", subtitle: err, tone: .danger))
                        .padding(.horizontal)
                    Button("Reintentar") { vm.load() }
                        .buttonStyle(.bordered)
                        .padding(.horizontal)
                }

                if !vm.records.isEmpty {
                    let s = vm.summary
                    HStack(spacing: 0) {
                        AttKpi(label: "Total", value: "\(s.total)", color: .primary)
                        Divider().frame(height: 36)
                        AttKpi(label: "Entradas", value: "\(s.entries)", color: .teal)
                        Divider().frame(height: 36)
                        AttKpi(label: "Salidas", value: "\(s.exits)", color: .blue)
                        Divider().frame(height: 36)
                        AttKpi(label: "Tardanzas", value: "\(s.lates)", color: .red)
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }

                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Buscar empleado o tipo…", text: $vm.query)
                        .autocorrectionDisabled()
                    if !vm.query.isEmpty {
                        Button { vm.query = "" } label: {
                            Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                        }
                    }
                }
                .padding(10)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)

                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.filtered.isEmpty {
                    NxEmptyState(
                        title: "Sin registros",
                        subtitle: "No hay asistencias en esta semana. Marca entrada para comenzar.",
                        actionLabel: "Actualizar",
                        onAction: { vm.load() }
                    )
                } else {
                    VStack(spacing: 6) {
                        ForEach(vm.filtered.prefix(50)) { rec in
                            Button { selected = rec } label: {
                                AttendanceRow(item: rec)
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
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { vm.load() } label: { Image(systemName: "arrow.clockwise") }
            }
        }
        .refreshable { vm.load() }
    }

    private var checkInCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            LocationPermissionBanner(
                message: "La asistencia registra tu GPS al marcar entrada o salida.",
                requestOnAppear: true
            )
            HStack {
                Text(vm.isCheckedIn ? "Jornada abierta" : "Sin entrada hoy")
                    .font(.subheadline).bold()
                Spacer()
                if let mins = vm.current?.totalMinutes, mins > 0 {
                    Text("\(mins) min").font(.caption).foregroundColor(.secondary)
                }
            }
            if let msg = vm.checkInMessage {
                Text(msg).font(.footnote)
                    .foregroundColor(msg.hasPrefix("Error") ? .red : .green)
            }
            HStack(spacing: 12) {
                Button { vm.checkIn("entrada") } label: {
                    Label("Entrada", systemImage: "arrow.right.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.teal)
                .disabled(vm.checkInLoading || vm.isCheckedIn)

                Button { vm.checkIn("salida") } label: {
                    Label("Salida", systemImage: "arrow.left.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.blue)
                .disabled(vm.checkInLoading || !vm.isCheckedIn)
            }
            if vm.checkInLoading { ProgressView().frame(maxWidth: .infinity) }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal)
    }
}

// MARK: – Subviews

private struct AttKpi: View {
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

private struct AttendanceRow: View {
    let item: AttendanceEvent
    var body: some View {
        let (icon, color) = typeStyle(item.type)

        HStack(spacing: 12) {
            ZStack {
                Circle().fill(color.opacity(0.15)).frame(width: 40, height: 40)
                Image(systemName: icon).foregroundColor(color).font(.system(size: 18))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(item.displayName).font(.subheadline).bold()
                Text(item.type.capitalized).font(.caption).foregroundColor(color)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                if !item.dateLabel.isEmpty {
                    Text(item.dateLabel).font(.caption2).foregroundColor(.secondary)
                }
                if item.isLate {
                    Text("Tarde").font(.caption2).bold().foregroundColor(.white)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.red).clipShape(Capsule())
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func typeStyle(_ t: String) -> (String, Color) {
        let lower = t.lowercased()
        if lower.contains("entrada") || lower == "in" || lower == "checkin" {
            return ("arrow.right.circle.fill", .teal)
        } else if lower.contains("salida") || lower == "out" || lower == "checkout" {
            return ("arrow.left.circle.fill", .blue)
        } else {
            return ("clock.fill", .orange)
        }
    }
}
