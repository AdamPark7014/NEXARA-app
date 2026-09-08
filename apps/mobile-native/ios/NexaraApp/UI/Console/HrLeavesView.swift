import SwiftUI

// MARK: – ViewModel

@MainActor
final class HrLeavesVM: ObservableObject {
    @Published var items: [HrLeave] = []
    @Published var query        = ""
    @Published var typeFilter   = "todos"
    @Published var statusFilter = "todos"
    @Published var isLoading    = false
    @Published var errorText: String?
    @Published var message: String?
    @Published var messageIsError = false

    /// Solicitud sobre la que se está actuando: bloquea sus botones y evita el
    /// doble toque que mandaba dos aprobaciones.
    @Published var actingId: Int64?
    @Published var balance = HrLeaveBalance()
    @Published var hasBalance = false

    /// Quién soy y qué puedo hacer. Se resuelve una vez, no en cada dibujado.
    @Published private(set) var myUserId: Int64 = 0
    @Published private(set) var canApprove = false

    var types: [String] {
        let present = Set(items.map(\.type).filter { !$0.isEmpty })
        // Se ordenan por el catálogo, no alfabéticamente: «Vacaciones» primero
        // es lo que espera quien usa la pantalla todos los días.
        let known = HrLeaveCatalog.types.map(\.key).filter { present.contains($0) }
        let unknown = present.filter { key in !HrLeaveCatalog.types.contains { $0.key == key } }.sorted()
        return ["todos"] + known + unknown
    }

    func typeLabel(_ key: String) -> String {
        key == "todos" ? "Todos" : HrLeaveCatalog.typeLabel(key)
    }

    let statuses = ["todos", "PENDING", "APPROVED", "REJECTED", "CANCELLED"]

    func statusLabel(_ key: String) -> String {
        key == "todos" ? "Todos" : HrLeaveCatalog.statusLabel(key)
    }

    var filtered: [HrLeave] {
        var list = items
        if typeFilter != "todos" {
            list = list.filter { $0.type.caseInsensitiveCompare(typeFilter) == .orderedSame }
        }
        if statusFilter != "todos" {
            list = list.filter { $0.status.caseInsensitiveCompare(statusFilter) == .orderedSame }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            list = list.filter { row in
                row.displayReason.lowercased().contains(q) ||
                row.userName.lowercased().contains(q) ||
                row.typeLabel.lowercased().contains(q)
            }
        }
        return list
    }

    var pendingCount: Int { items.filter(\.isPending).count }
    var approvedCount: Int { items.filter { $0.status.uppercased() == "APPROVED" }.count }

    /// Sólo el solicitante puede cancelar, y sólo mientras siga pendiente.
    /// El API lo rechaza igualmente; esconder el botón evita el error inútil.
    func canCancel(_ leave: HrLeave) -> Bool {
        leave.isPending && leave.userId > 0 && leave.userId == myUserId
    }

    func loadSessionFacts() {
        guard let user = SessionStore.shared.currentUser else { return }
        myUserId = Int64(user.id) ?? 0
        canApprove = user.isSuperAdmin || user.permissions.contains { permission in
            permission.contains("hr.approve_leave")
                || permission.contains("hr.manage")
                || permission.contains("console.admin")
        }
    }

    func load() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do {
            items = try await HrRepository.shared.leaves()
        } catch {
            // A diferencia de antes, un 403 ya no se lee como «no hay permisos».
            errorText = error.toUserMessage(fallback: "No se pudieron cargar las solicitudes")
        }
        await loadBalance()
    }

    /// El saldo es informativo: si falla, la pantalla sigue sirviendo.
    func loadBalance() async {
        guard myUserId > 0 else { return }
        if let value = try? await HrRepository.shared.leaveBalance(userId: myUserId) {
            balance = value
            hasBalance = !value.isEmpty
        }
    }

    func create(type: String, startDate: String, endDate: String, reason: String) async -> Bool {
        switch HrLeaveDraft.validate(type: type, startDate: startDate, endDate: endDate, reason: reason) {
        case .invalid(let why):
            show(why, isError: true)
            return false
        case .valid(let type, let start, let end, let reason, let days):
            do {
                try await HrRepository.shared.createLeave(
                    type: type, startDate: start, endDate: end, reason: reason
                )
                show("Solicitud enviada (\(days) día\(days == 1 ? "" : "s"))", isError: false)
                await load()
                return true
            } catch {
                show(error.toUserMessage(fallback: "No se pudo enviar la solicitud"), isError: true)
                return false
            }
        }
    }

    func approve(_ leave: HrLeave) async {
        actingId = leave.id
        defer { actingId = nil }
        do {
            try await HrRepository.shared.approveLeave(id: leave.id)
            show("Permiso aprobado", isError: false)
            await load()
        } catch {
            show(error.toUserMessage(fallback: "No se pudo aprobar"), isError: true)
        }
    }

    func reject(_ leave: HrLeave, reason: String) async {
        let clean = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else {
            show("Escribe el motivo del rechazo", isError: true)
            return
        }
        actingId = leave.id
        defer { actingId = nil }
        do {
            try await HrRepository.shared.rejectLeave(id: leave.id, reason: clean)
            show("Permiso rechazado", isError: false)
            await load()
        } catch {
            show(error.toUserMessage(fallback: "No se pudo rechazar"), isError: true)
        }
    }

    func cancel(_ leave: HrLeave) async {
        actingId = leave.id
        defer { actingId = nil }
        do {
            try await HrRepository.shared.cancelLeave(id: leave.id)
            show("Solicitud cancelada", isError: false)
            await load()
        } catch {
            show(error.toUserMessage(fallback: "No se pudo cancelar"), isError: true)
        }
    }

    private func show(_ text: String, isError: Bool) {
        message = text
        messageIsError = isError
    }
}

// MARK: – View

struct HrLeavesView: View {
    @StateObject private var vm = HrLeavesVM()
    @State private var selectedId: Int64?
    @State private var showCreate = false

    /// La fila seleccionada se busca por id en cada dibujado en vez de
    /// guardarse: así el detalle refleja el estado nuevo tras aprobar sin que
    /// haya que cerrarlo y volver a abrirlo.
    private var selected: HrLeave? {
        guard let selectedId else { return nil }
        return vm.items.first { $0.id == selectedId }
    }

    var body: some View {
        Group {
            if let leave = selected {
                HrLeaveDetailPane(leave: leave, vm: vm, onBack: { selectedId = nil })
            } else {
                leaveList
            }
        }
        .navigationTitle(selected == nil ? "RR. HH. · Permisos" : "")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                HStack(spacing: 14) {
                    Button { showCreate = true } label: { Image(systemName: "plus") }
                    Button { Task { await vm.load() } } label: { Image(systemName: "arrow.clockwise") }
                }
            }
        }
        .refreshable { if selected == nil { await vm.load() } }
        .sheet(isPresented: $showCreate) {
            HrLeaveCreateSheet(vm: vm, isPresented: $showCreate)
        }
        .task {
            vm.loadSessionFacts()
            await vm.load()
        }
    }

    private var leaveList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let message = vm.message {
                    Text(message)
                        .font(.footnote)
                        .foregroundColor(vm.messageIsError ? .red : .green)
                        .padding(.horizontal)
                }
                if let errorText = vm.errorText {
                    Text(errorText).font(.footnote).foregroundColor(.red).padding(.horizontal)
                }

                if !vm.items.isEmpty {
                    HStack(spacing: 0) {
                        HrKpi(label: "Solicitudes", value: "\(vm.items.count)",   color: .primary)
                        Divider().frame(height: 36)
                        HrKpi(label: "Pendientes",  value: "\(vm.pendingCount)",  color: .orange)
                        Divider().frame(height: 36)
                        HrKpi(label: "Aprobados",   value: "\(vm.approvedCount)", color: .green)
                    }
                    .padding(.horizontal).padding(.vertical, 6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                }

                // RR. HH. es un módulo con tres pantallas y el catálogo sólo
                // tiene una clave (`hr`, igual que en Android). Se enlazan desde
                // aquí para que existan sin inventar claves nuevas que romperían
                // el espejo del catálogo con Android.
                HStack(spacing: 10) {
                    NavigationLink { HrDashboardView() } label: {
                        hubTile(title: "Panel de personas", icon: "chart.bar")
                    }
                    NavigationLink { HrReviewsView() } label: {
                        hubTile(title: "Evaluaciones", icon: "star.circle")
                    }
                }
                .padding(.horizontal)

                if vm.hasBalance { balanceCard }

                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Buscar permiso…", text: $vm.query).autocorrectionDisabled()
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

                if vm.types.count > 1 {
                    chipRow(vm.types, selection: $vm.typeFilter, label: vm.typeLabel, tint: .purple)
                }
                chipRow(vm.statuses, selection: $vm.statusFilter, label: vm.statusLabel, tint: .blue)

                if vm.isLoading && vm.items.isEmpty {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.filtered.isEmpty {
                    Text("Sin solicitudes").foregroundColor(.secondary)
                        .frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    VStack(spacing: 6) {
                        ForEach(vm.filtered.prefix(80)) { leave in
                            Button { selectedId = leave.id } label: { HrLeaveCard(item: leave) }
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

    private func hubTile(title: String, icon: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon).font(.title3)
            Text(title).font(.caption2).multilineTextAlignment(.center)
        }
        .foregroundColor(.primary)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var balanceCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Mi saldo \(String(vm.balance.year))").font(.subheadline.bold())
                Spacer()
                Text("\(vm.balance.totalUsedText) días usados")
                    .font(.caption).foregroundColor(.secondary)
            }
            // Se dice «usados», nunca «restantes»: el API no guarda cuota anual
            // y un número de días restantes sería inventado.
            ForEach(vm.balance.usedByType) { row in
                HStack {
                    Text(row.label).font(.caption).foregroundColor(.secondary)
                    Spacer()
                    Text(row.daysText).font(.caption.bold())
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }

    private func chipRow(
        _ keys: [String],
        selection: Binding<String>,
        label: @escaping (String) -> String,
        tint: Color
    ) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(keys, id: \.self) { key in
                    let isOn = selection.wrappedValue == key
                    Button { selection.wrappedValue = key } label: {
                        Text(label(key)).font(.caption).bold()
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(isOn ? tint : Color(.secondarySystemGroupedBackground))
                            .foregroundColor(isOn ? .white : .primary)
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal)
        }
    }
}

// MARK: – Detalle con acciones

private struct HrLeaveDetailPane: View {
    let leave: HrLeave
    @ObservedObject var vm: HrLeavesVM
    let onBack: () -> Void

    @State private var rejectReason = ""
    @State private var showRejectField = false

    var body: some View {
        let color = hrStatusColor(leave.status)
        List {
            Section { Button("← Permisos", action: onBack) }

            Section {
                HStack {
                    Text(leave.displayReason).font(.headline)
                    Spacer()
                    Text(leave.statusLabel).font(.caption).bold().foregroundColor(color)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(color.opacity(0.12)).clipShape(Capsule())
                }
            }

            if let message = vm.message {
                Section {
                    Text(message).font(.footnote)
                        .foregroundColor(vm.messageIsError ? .red : .green)
                }
            }

            Section("Detalles") {
                hrRow("Empleado",     leave.userName)
                hrRow("Tipo",         leave.typeLabel)
                hrRow("Inicio",       String(leave.startDate.prefix(10)))
                hrRow("Fin",          String(leave.endDate.prefix(10)))
                hrRow("Días",         leave.days)
                hrRow("Aprobado por", leave.approverName)
            }

            if !leave.notes.isEmpty {
                Section("Notas") { Text(leave.notes).font(.footnote) }
            }

            if leave.isPending && vm.canApprove {
                Section("Decisión") {
                    Button {
                        Task { await vm.approve(leave) }
                    } label: {
                        Label("Aprobar", systemImage: "checkmark.circle")
                    }
                    .disabled(vm.actingId == leave.id)

                    if showRejectField {
                        TextField("Motivo del rechazo", text: $rejectReason, axis: .vertical)
                            .lineLimit(2...4)
                        Button(role: .destructive) {
                            Task {
                                await vm.reject(leave, reason: rejectReason)
                                rejectReason = ""
                                showRejectField = false
                            }
                        } label: {
                            Label("Confirmar rechazo", systemImage: "xmark.circle")
                        }
                        .disabled(vm.actingId == leave.id
                                  || rejectReason.trimmingCharacters(in: .whitespaces).isEmpty)
                    } else {
                        Button(role: .destructive) {
                            showRejectField = true
                        } label: {
                            Label("Rechazar", systemImage: "xmark.circle")
                        }
                        .disabled(vm.actingId == leave.id)
                    }
                }
            }

            if vm.canCancel(leave) {
                Section {
                    Button(role: .destructive) {
                        Task { await vm.cancel(leave) }
                    } label: {
                        Label("Cancelar mi solicitud", systemImage: "trash")
                    }
                    .disabled(vm.actingId == leave.id)
                } footer: {
                    Text("Sólo el solicitante puede cancelar, y sólo mientras siga pendiente.")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(leave.userName.isEmpty ? "Permiso" : leave.userName)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func hrRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack {
                Text(label).foregroundColor(.secondary)
                Spacer()
                Text(value).multilineTextAlignment(.trailing)
            }
        }
    }
}

// MARK: – Alta de solicitud

private struct HrLeaveCreateSheet: View {
    @ObservedObject var vm: HrLeavesVM
    @Binding var isPresented: Bool

    @State private var type = HrLeaveCatalog.types.first?.key ?? "VACATION"
    @State private var startDate = HrLeaveDraft.today()
    @State private var endDate = HrLeaveDraft.today()
    @State private var reason = ""
    @State private var saving = false

    /// Los días se cuentan aquí y en el servidor con la misma regla (naturales,
    /// inclusive), para que el número que ve el empleado sea el que se guarda.
    private var dayCount: Int? { HrLeaveDraft.dayCount(from: startDate, to: endDate) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Tipo") {
                    Picker("Tipo de permiso", selection: $type) {
                        ForEach(HrLeaveCatalog.types, id: \.key) { entry in
                            Text(entry.label).tag(entry.key)
                        }
                    }
                }
                Section("Fechas") {
                    TextField("Inicio (AAAA-MM-DD)", text: $startDate)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    TextField("Fin (AAAA-MM-DD)", text: $endDate)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    if let dayCount {
                        HStack {
                            Text("Días").foregroundColor(.secondary)
                            Spacer()
                            Text("\(dayCount)")
                        }
                    } else {
                        Text("Revisa el rango: el fin no puede ser anterior al inicio.")
                            .font(.caption).foregroundColor(.orange)
                    }
                }
                Section("Motivo") {
                    TextField("Opcional", text: $reason, axis: .vertical).lineLimit(2...5)
                }
                if let message = vm.message, vm.messageIsError {
                    Text(message).font(.footnote).foregroundColor(.red)
                }
            }
            .navigationTitle("Nueva solicitud")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { isPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Enviando…" : "Enviar") {
                        Task {
                            saving = true
                            let ok = await vm.create(
                                type: type, startDate: startDate, endDate: endDate, reason: reason
                            )
                            saving = false
                            if ok { isPresented = false }
                        }
                    }
                    .disabled(saving || dayCount == nil)
                }
            }
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
                Text(item.statusLabel).font(.caption2).bold().foregroundColor(color)
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(color.opacity(0.12)).clipShape(Capsule())
            }
            if !item.userName.isEmpty {
                Label(item.userName, systemImage: "person").font(.caption).foregroundColor(.secondary)
            }
            HStack {
                if !item.type.isEmpty {
                    Label(item.typeLabel, systemImage: "tag").font(.caption2).foregroundColor(.secondary)
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

/// Color por estatus. Acepta la clave del API y la palabra en español porque
/// hay filas antiguas guardadas ya traducidas.
private func hrStatusColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "aprobado", "approved": return .green
    case "pendiente", "pending": return .orange
    case "rechazado", "rejected", "denied": return .red
    case "cancelado", "cancelled", "canceled": return .secondary
    default: return .secondary
    }
}
