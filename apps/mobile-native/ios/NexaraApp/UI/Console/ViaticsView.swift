import SwiftUI

// MARK: – ViewModel

@MainActor
final class ViaticsVM: ObservableObject {
    @Published var items: [[String: Any]] = []
    @Published var query        = ""
    @Published var statusFilter = "todos"
    @Published var isLoading    = false

    let statuses = ["todos", "pendiente", "aprobado", "rechazado", "pagado"]

    var filtered: [[String: Any]] {
        var list = items
        if statusFilter != "todos" {
            list = list.filter { vStr($0, "estatusPago", "status", "estatus", "estado").lowercased() == statusFilter }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter { row in
                vStr(row, "razonGasto", "concepto", "descripcion", "motivo").lowercased().contains(q) ||
                (row["usuario"] as? [String: Any]).map { vStr($0, "nombre", "name") }?.lowercased().contains(q) == true ||
                vStr(row, "usuarioNombre", "userName", "nombre").lowercased().contains(q)
            }
        }
        return list
    }

    var totalAmount: Double {
        items.reduce(0.0) { $0 + (vDouble($1, "montoSolicitado", "amount", "monto", "total") ?? 0) }
    }

    var pendingCount: Int {
        items.filter { vStr($0, "estatusPago", "status", "estatus").lowercased() == "pendiente" }.count
    }

    func load(personalOnly: Bool = false) {
        isLoading = true
        Task {
            let all = (try? await ConsoleRepository.shared.viatics()) ?? await ExtraRepository.shared.viatics()
            if personalOnly, let uid = SessionStore.shared.currentUser?.id {
                items = all.filter { row in
                    if let usuario = row["usuario"] as? [String: Any], let id = usuario["id"] {
                        return String(describing: id) == uid
                    }
                    return vStr(row, "usuarioId", "userId", "usuario") == uid
                }
            } else {
                items = all
            }
            isLoading = false
        }
    }
}

// MARK: – View

struct ViaticsView: View {
    var personalOnly: Bool = false
    @StateObject private var vm = ViaticsVM()
    @EnvironmentObject var session: SessionStore
    @State private var selected: [String: Any]?
    @State private var showCreate = false
    @State private var amountText = ""
    @State private var motivo = ""
    @State private var categoria = "COMBUSTIBLE"
    @State private var ticketDataUrl: String?
    @State private var creating = false
    @State private var rejectNote = ""
    @State private var acting = false
    @State private var actionMessage: String?

    private let categories = ["COMBUSTIBLE", "CASETA", "HOSPEDAJE", "ALIMENTACION", "TRANSPORTE", "OTROS"]

    private var canApprove: Bool {
        let u = session.currentUser
        if u?.isSuperAdmin == true { return true }
        let perms = u?.permissions ?? []
        return perms.contains { $0.contains("viatics.manage") || $0.contains("console.admin") || $0.contains("finance") }
    }

    var body: some View {
        Group {
            if showCreate {
                createForm
            } else if let s = selected {
                viatDetail(s)
            } else {
                listBody
            }
        }
        .navigationTitle(selected == nil && !showCreate ? (personalOnly ? "Mis viáticos" : "Viáticos") : "")
        .toolbar {
            if selected == nil && !showCreate {
                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack {
                        Button { showCreate = true; actionMessage = nil } label: {
                            Image(systemName: "plus.circle.fill")
                        }
                        Button { vm.load(personalOnly: personalOnly) } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                }
            }
        }
        .refreshable { if selected == nil && !showCreate { vm.load(personalOnly: personalOnly) } }
        .task { vm.load(personalOnly: personalOnly) }
    }

    private var createForm: some View {
        Form {
            Section("Nueva solicitud") {
                TextField("Monto (MXN)", text: $amountText)
                    .keyboardType(.decimalPad)
                TextField("Motivo / concepto", text: $motivo, axis: .vertical)
                    .lineLimit(2...4)
                Picker("Categoría", selection: $categoria) {
                    ForEach(categories, id: \.self) { Text($0).tag($0) }
                }
            }
            Section("Comprobante") {
                MediaPickerBar { media in
                    ticketDataUrl = media.first?.dataUrl
                }
                if ticketDataUrl != nil {
                    Text("✓ Comprobante listo").foregroundColor(.green).font(.caption)
                }
            }
            if let actionMessage {
                Section {
                    Text(actionMessage)
                        .foregroundColor(actionMessage.hasPrefix("✅") ? .green : .red)
                }
            }
            Section {
                Button(creating ? "Enviando…" : "Enviar a aprobación") {
                    Task { await submitCreate() }
                }
                .disabled(creating || ticketDataUrl == nil || motivo.isEmpty || (Double(amountText) ?? 0) <= 0)
                Button("Cancelar", role: .cancel) { showCreate = false }
            }
        }
    }

    private func submitCreate() async {
        guard let amount = Double(amountText), amount > 0, let ticket = ticketDataUrl else { return }
        creating = true; actionMessage = nil
        defer { creating = false }
        do {
            _ = try await ConsoleRepository.shared.createViatic(
                amount: amount,
                motivo: motivo.trimmingCharacters(in: .whitespacesAndNewlines),
                categoria: categoria,
                ticketEvidenciaUrl: ticket
            )
            actionMessage = "✅ Solicitud enviada a aprobación"
            showCreate = false
            amountText = ""; motivo = ""; ticketDataUrl = nil
            vm.load(personalOnly: personalOnly)
        } catch {
            actionMessage = "❌ \(error.localizedDescription)"
        }
    }

    private var listBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if !vm.items.isEmpty {
                    HStack(spacing: 0) {
                        ViatKpi(label: "Total",     value: "\(vm.items.count)",  color: .primary)
                        Divider().frame(height: 36)
                        ViatKpi(label: "Pendientes",value: "\(vm.pendingCount)", color: .orange)
                        Divider().frame(height: 36)
                        ViatKpi(label: "Monto",     value: fmtMxnV(vm.totalAmount), color: .teal)
                    }
                    .padding(.horizontal).padding(.vertical, 6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }

                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Buscar viático…", text: $vm.query).autocorrectionDisabled()
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
                        ForEach(vm.statuses, id: \.self) { s in
                            let sel = vm.statusFilter == s
                            Button { vm.statusFilter = s } label: {
                                Text(s.capitalized).font(.caption).bold()
                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                    .background(sel ? Color.teal : Color(.secondarySystemGroupedBackground))
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
                    Text("Sin viáticos").foregroundColor(.secondary)
                        .frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    VStack(spacing: 6) {
                        ForEach(vm.filtered.prefix(50), id: \.viatId) { viat in
                            Button { selected = viat } label: {
                                ViaticCard(item: viat)
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

    @ViewBuilder
    private func viatDetail(_ v: [String: Any]) -> some View {
        let status = vStr(v, "estatusPago", "status", "estatus", "estado")
        let color  = viatStatusColor(status)
        let ticketUrl = vStr(v, "ticketEvidenciaUrl", "ticketUrl", "evidenciaUrl", "comprobante")
        let pending = status.lowercased() == "pendiente"
        let id = ConsoleHelpers.mapInt64(v, "id")

        List {
            Section {
                HStack {
                    Button("← Volver") { selected = nil; rejectNote = ""; actionMessage = nil }
                    Spacer()
                    Text(status.isEmpty ? "—" : status.capitalized)
                        .font(.caption).bold().foregroundColor(color)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(color.opacity(0.12)).clipShape(Capsule())
                }
            }

            Section("Viático") {
                viatRow("ID", vStr(v, "id"))
                if let activ = v["actividad"] as? [String: Any] {
                    viatRow("Actividad (AN)", vStr(activ, "anNumber", "titulo"))
                }
                if let usuario = v["usuario"] as? [String: Any] {
                    viatRow("Empleado", vStr(usuario, "nombre", "name"))
                } else {
                    viatRow("Empleado", vStr(v, "usuarioNombre", "userName", "nombre"))
                }
                viatRow("Razón de gasto", vStr(v, "razonGasto", "concepto", "descripcion", "motivo"))
                viatRow("Categoría", vStr(v, "categoria"))
                viatRow("Monto", fmtMxnV(vDouble(v, "montoSolicitado", "amount", "monto", "total") ?? 0))
                viatRow("Estado de pago", status)
                viatRow("Fecha", String(vStr(v, "createdAt", "fecha").prefix(10)))
            }

            if !ticketUrl.isEmpty {
                Section("Comprobante") {
                    Link(destination: URL(string: ticketUrl) ?? URL(string: "https://nexara.com.mx")!) {
                        Label("Ver ticket / comprobante", systemImage: "link")
                    }
                }
            }

            if canApprove && pending, let id {
                Section("Decisión") {
                    TextField("Nota / motivo de rechazo", text: $rejectNote, axis: .vertical)
                        .lineLimit(2...4)
                    NxDecisionActions(
                        acting: acting,
                        onApprove: { Task { await decide(id: id, approve: true) } },
                        onReject: { Task { await decide(id: id, approve: false) } }
                    )
                }
            }

            if let actionMessage {
                Section {
                    Text(actionMessage)
                        .foregroundColor(actionMessage.hasPrefix("✅") ? .green : .red)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func decide(id: Int64, approve: Bool) async {
        if !approve && rejectNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            actionMessage = "❌ Indica motivo de rechazo"
            return
        }
        acting = true; actionMessage = nil
        defer { acting = false }
        do {
            try await ConsoleRepository.shared.approveViatic(
                id: id,
                approve: approve,
                note: rejectNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : rejectNote
            )
            actionMessage = approve ? "✅ Viático aprobado" : "✅ Viático rechazado"
            selected = nil
            rejectNote = ""
            vm.load(personalOnly: personalOnly)
        } catch {
            actionMessage = "❌ \(error.localizedDescription)"
        }
    }

    @ViewBuilder private func viatRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty && value != "0" {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value) }
        }
    }
}

// MARK: – Card

private struct ViaticCard: View {
    let item: [String: Any]
    var body: some View {
        let concept = vStr(item, "razonGasto", "concepto", "descripcion", "motivo")
        let user: String = {
            if let u = item["usuario"] as? [String: Any] { return vStr(u, "nombre", "name") }
            return vStr(item, "usuarioNombre", "userName", "nombre")
        }()
        let status  = vStr(item, "estatusPago", "status", "estatus", "estado")
        let amount  = vDouble(item, "montoSolicitado", "amount", "monto", "total")
        let date    = String(vStr(item, "createdAt", "fecha").prefix(10))
        let color   = viatStatusColor(status)

        HStack(spacing: 0) {
            Rectangle().fill(color).frame(width: 4)
                .clipShape(RoundedRectangle(cornerRadius: 2))
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(concept.isEmpty ? "Sin concepto" : concept)
                        .font(.subheadline).bold().lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
                    if let a = amount {
                        Text(fmtMxnV(a)).font(.subheadline).bold().foregroundColor(color)
                    }
                }
                if !user.isEmpty {
                    Label(user, systemImage: "person").font(.caption).foregroundColor(.secondary)
                }
                HStack {
                    Text(status.capitalized).font(.caption2).bold().foregroundColor(color)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(color.opacity(0.13)).clipShape(Capsule())
                    Spacer()
                    if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
                }
            }
            .padding(.horizontal, 10).padding(.vertical, 8)
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: – Helpers

private struct ViatKpi: View {
    let label: String; let value: String; let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 4)
    }
}

private func vStr(_ m: [String: Any], _ keys: String...) -> String {
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

private func vDouble(_ m: [String: Any], _ keys: String...) -> Double? {
    for k in keys {
        if let v = m[k] {
            if let d = v as? Double { return d }
            if let n = v as? NSNumber { return n.doubleValue }
            if let s = v as? String, let d = Double(s) { return d }
        }
    }
    return nil
}

private func fmtMxnV(_ v: Double) -> String {
    if v >= 1_000_000 { return String(format: "$%.1fM", v / 1_000_000) }
    if v >= 1_000     { return String(format: "$%.1fK", v / 1_000) }
    let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = "MXN"; f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: v)) ?? "$\(Int(v))"
}

private func viatStatusColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "aprobado", "pagado", "completado": return .green
    case "pendiente": return .orange
    case "rechazado", "cancelado": return .red
    default: return .secondary
    }
}

extension [String: Any] {
    fileprivate var viatId: String {
        if let n = self["id"] as? Int { return "viat-\(n)" }
        if let s = self["id"] as? String { return "viat-\(s)" }
        return UUID().uuidString
    }
}
