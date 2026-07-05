import SwiftUI

// MARK: – ViewModel

@MainActor
final class AttendanceVM: ObservableObject {
    @Published var records: [[String: Any]] = []
    @Published var rangeUsers: [[String: Any]] = []
    @Published var current: [String: Any]?
    @Published var weekFrom = ConsoleHelpers.weekRange().from
    @Published var weekTo = ConsoleHelpers.weekRange().to
    @Published var query   = ""
    @Published var isLoading = false
    @Published var checkInLoading = false
    @Published var checkInMessage: String?

    var isCheckedIn: Bool { current?["isOpen"] as? Bool == true }

    var filtered: [[String: Any]] {
        guard !query.isEmpty else { return records }
        let q = query.lowercased()
        return records.filter { row in
            attStr(row, "userName", "usuario", "nombre").lowercased().contains(q) ||
            attStr(row, "type", "tipo").lowercased().contains(q)
        }
    }

    var summary: (total: Int, entries: Int, exits: Int, lates: Int) {
        let total   = records.count
        let entries = records.filter { attStr($0, "type", "tipo").lowercased().contains("entrada") || attStr($0, "type").lowercased() == "in" }.count
        let exits   = records.filter { attStr($0, "type", "tipo").lowercased().contains("salida") || attStr($0, "type").lowercased() == "out" }.count
        let lates   = records.filter { $0["isLate"] as? Bool == true }.count
        return (total, entries, exits, lates)
    }

    func load() {
        isLoading = true
        Task {
            current = try? await ConsoleRepository.shared.attendanceCurrent()
            if let range = try? await ConsoleRepository.shared.attendanceRange(from: weekFrom, to: weekTo) {
                rangeUsers = range["users"] as? [[String: Any]] ?? []
                records = flattenRange(range)
            } else {
                records = await ExtraRepository.shared.attendance()
            }
            isLoading = false
        }
    }

    func checkIn(_ type: String) {
        checkInLoading = true; checkInMessage = nil
        Task {
            do {
                let res = try await ConsoleRepository.shared.attendanceCheckIn(type: type)
                checkInMessage = (res["message"] as? String) ?? (type == "entrada" ? "✅ Entrada registrada" : "✅ Salida registrada")
                load()
            } catch {
                checkInMessage = "❌ \(error.localizedDescription)"
            }
            checkInLoading = false
        }
    }

    private func flattenRange(_ range: [String: Any]) -> [[String: Any]] {
        guard let users = range["users"] as? [[String: Any]] else { return [] }
        var out: [[String: Any]] = []
        for u in users {
            let name = ConsoleHelpers.mapStr(u, "userName")
            if let events = u["attendances"] as? [[String: Any]] {
                for e in events {
                    var row = e
                    row["userName"] = name
                    out.append(row)
                }
            }
        }
        return out
    }
}

// MARK: – View

struct AttendanceView: View {
    @StateObject private var vm = AttendanceVM()
    @State private var selected: [String: Any]?

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
    private func attDetail(_ rec: [String: Any]) -> some View {
        let name  = attStr(rec, "userName", "usuario", "nombre")
        let type_ = attStr(rec, "type", "tipo")
        List {
            Section { Button("← Asistencia") { selected = nil } }
            Section("Registro") {
                attRow("Empleado",  name)
                attRow("Tipo",      type_.capitalized)
                attRow("Fecha",     String(attStr(rec, "createdAt", "date", "timestamp").prefix(19)))
                attRow("Ubicación", attStr(rec, "location", "ubicacion", "address"))
                attRow("Dispositivo", attStr(rec, "device", "dispositivo"))
                if rec["isLate"] as? Bool == true {
                    Label("Registro tarde", systemImage: "exclamationmark.triangle.fill").foregroundColor(.red)
                }
                attRow("Observaciones", attStr(rec, "notes", "notas", "observaciones"))
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(name.isEmpty ? "Registro" : name)
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
                // Check-in card
                checkInCard

                Text("Semana: \(vm.weekFrom) → \(vm.weekTo)")
                    .font(.caption).foregroundColor(.secondary).padding(.horizontal)

                // KPI strip
                if !vm.records.isEmpty {
                    let s = vm.summary
                    HStack(spacing: 0) {
                        AttKpi(label: "Total",    value: "\(s.total)",   color: .primary)
                        Divider().frame(height: 36)
                        AttKpi(label: "Entradas", value: "\(s.entries)", color: .teal)
                        Divider().frame(height: 36)
                        AttKpi(label: "Salidas",  value: "\(s.exits)",   color: .blue)
                        Divider().frame(height: 36)
                        AttKpi(label: "Tardanzas",value: "\(s.lates)",   color: .red)
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }

                // Search
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

                // List
                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.filtered.isEmpty {
                    Text("Sin registros").foregroundColor(.secondary)
                        .frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    VStack(spacing: 6) {
                        ForEach(vm.filtered.prefix(50), id: \.attId) { rec in
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
            HStack {
                Text(vm.isCheckedIn ? "🟢 Jornada abierta" : "⚪ Sin entrada hoy")
                    .font(.subheadline).bold()
                Spacer()
                if let mins = vm.current?["totalMinutes"] as? Int, mins > 0 {
                    Text("\(mins) min").font(.caption).foregroundColor(.secondary)
                }
            }
            if let msg = vm.checkInMessage {
                Text(msg).font(.footnote).foregroundColor(msg.hasPrefix("❌") ? .red : .green)
            }
            HStack(spacing: 12) {
                Button {
                    vm.checkIn("entrada")
                } label: {
                    Label("Entrada", systemImage: "arrow.right.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.teal)
                .disabled(vm.checkInLoading || vm.isCheckedIn)

                Button {
                    vm.checkIn("salida")
                } label: {
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
    let item: [String: Any]
    var body: some View {
        let name   = attStr(item, "userName", "usuario", "nombre")
        let type_  = attStr(item, "type", "tipo")
        let date   = String(attStr(item, "createdAt", "date", "timestamp").prefix(16))
        let isLate = item["isLate"] as? Bool == true
        let (icon, color) = typeStyle(type_)

        HStack(spacing: 12) {
            ZStack {
                Circle().fill(color.opacity(0.15)).frame(width: 40, height: 40)
                Image(systemName: icon).foregroundColor(color).font(.system(size: 18))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(name.isEmpty ? "Desconocido" : name).font(.subheadline).bold()
                Text(type_.capitalized).font(.caption).foregroundColor(color)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
                if isLate {
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

// MARK: – Helpers

private func attStr(_ m: [String: Any], _ keys: String...) -> String {
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
    fileprivate var attId: String {
        if let n = self["id"] as? Int { return "att-\(n)" }
        if let s = self["id"] as? String { return "att-\(s)" }
        return UUID().uuidString
    }
}
