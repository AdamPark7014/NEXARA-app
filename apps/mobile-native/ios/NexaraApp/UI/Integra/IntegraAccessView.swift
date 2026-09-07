import SwiftUI

/// Puertas ACS — búsqueda, filtros y control con motivo. Paridad `IntegraAccessScreen`.
struct IntegraAccessView: View {
    @StateObject private var vm = IntegraAccessVM()

    var body: some View {
        Group {
            if vm.loading && vm.items.isEmpty {
                ProgressView("Cargando puertas…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = vm.error, vm.items.isEmpty {
                NxEmptyState(title: "No se pudieron cargar", subtitle: error, actionLabel: "Reintentar") {
                    Task { await vm.refresh() }
                }
            } else {
                listBody
            }
        }
        .navigationTitle("Acceso")
        .task { await vm.refresh() }
        .refreshable { await vm.refresh(initial: false) }
        .sheet(item: $vm.target) { door in
            IntegraDoorControlSheet(
                door: door,
                sending: vm.sending,
                dialogError: vm.dialogError,
                onConfirm: { control, reason in
                    Task { await vm.confirm(control: control, reason: reason) }
                },
                onDismiss: { if !vm.sending { vm.target = nil } }
            )
        }
        .alert("Orden enviada", isPresented: Binding(
            get: { vm.message != nil && !vm.messageIsError },
            set: { if !$0 { vm.message = nil } }
        )) {
            Button("OK", role: .cancel) { vm.message = nil }
        } message: {
            Text(vm.message ?? "")
        }
    }

    private var listBody: some View {
        List {
            if let message = vm.message, vm.messageIsError {
                Section {
                    NxAlertBanner(alert: NxAlert(id: "err", title: message, tone: .danger))
                }
            }

            Section {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Buscar puerta, zona o id", text: $vm.query)
                        .autocorrectionDisabled()
                }
                if !vm.source.isEmpty {
                    Text(vm.source == "mirror" ? "Fuente: espejo sincronizado" : "Fuente: \(vm.source)")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                Text("Mostrando \(vm.filtered.count) de \(vm.items.count)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(IntegraDoorRules.stateFilters, id: \.self) { state in
                            let selected = vm.stateFilter == state
                            Button {
                                vm.stateFilter = selected ? "" : state
                            } label: {
                                NxStatusChip(
                                    text: IntegraDoorRules.stateLabel(state),
                                    tone: selected ? IntegraDoorRules.stateTone(state) : .neutral
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            if vm.filtered.isEmpty {
                Section {
                    NxEmptyState(
                        title: "Sin puertas",
                        subtitle: vm.items.isEmpty
                            ? "No hay puertas en el sitio seleccionado."
                            : "Ninguna puerta coincide con el filtro."
                    )
                }
            } else {
                ForEach(vm.filtered) { door in
                    Button {
                        if vm.canControl { vm.target = door }
                    } label: {
                        doorRow(door)
                    }
                    .disabled(!vm.canControl)
                }
            }
        }
    }

    private func doorRow(_ door: IntegraRow) -> some View {
        let name = IntegraDict.str(door.raw, "name", "doorName").nilIfEmpty ?? door.id
        let loc = IntegraDict.str(door.raw, "location", "regionName")
        let online = IntegraDict.bool(door.raw, "online")
        let state = IntegraDoorRules.doorState(
            online: online,
            status: IntegraDict.str(door.raw, "status", "doorState").nilIfEmpty
        )
        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(name).font(.body.weight(.semibold)).foregroundColor(.primary)
                if !loc.isEmpty {
                    Text(loc).font(.caption).foregroundColor(.secondary)
                }
                Text(door.id).font(.caption2).foregroundColor(.secondary)
            }
            Spacer()
            NxStatusChip(text: IntegraDoorRules.stateLabel(state), tone: IntegraDoorRules.stateTone(state))
        }
        .padding(.vertical, 4)
    }
}

@MainActor
final class IntegraAccessVM: ObservableObject {
    @Published var items: [IntegraRow] = []
    @Published var source = ""
    @Published var canControl = true
    @Published var query = ""
    @Published var stateFilter = ""
    @Published var loading = true
    @Published var error: String?
    @Published var message: String?
    @Published var messageIsError = false
    @Published var target: IntegraRow?
    @Published var sending = false
    @Published var dialogError: String?

    private let repo = IntegraRepository.shared

    var filtered: [IntegraRow] {
        items.filter { door in
            let online = IntegraDict.bool(door.raw, "online")
            let state = IntegraDoorRules.doorState(
                online: online,
                status: IntegraDict.str(door.raw, "status", "doorState").nilIfEmpty
            )
            let stateOk = stateFilter.isEmpty || state == stateFilter
            let queryOk = IntegraDict.matchesQuery(
                door.raw, query: query,
                "name", "doorName", "location", "regionName", "id", "doorIndexCode"
            )
            return stateOk && queryOk
        }
    }

    func refresh(initial: Bool = true) async {
        if initial && items.isEmpty { loading = true }
        error = nil
        do {
            let result = try await repo.doors()
            items = result.items.compactMap { raw in
                let id = IntegraDict.str(raw, "id", "doorIndexCode", "doorId")
                guard !id.isEmpty else { return nil }
                return IntegraRow(id: id, raw: raw)
            }
            source = result.source
            loading = false
        } catch {
            loading = false
            self.error = error.localizedDescription
        }
    }

    func confirm(control: IntegraDoorControl, reason: String) async {
        guard !sending, let door = target else { return }
        if !IntegraDoorRules.motivoValido(reason) {
            dialogError = "Indica un motivo de al menos 3 caracteres."
            return
        }
        sending = true
        dialogError = nil
        let nombre = IntegraDict.str(door.raw, "name", "doorName").nilIfEmpty ?? door.id
        do {
            _ = try await repo.controlDoor(doorId: door.id, controlType: control.controlType, reason: reason)
            sending = false
            target = nil
            message = "\(control.label) enviada · \(nombre)"
            messageIsError = false
            await refresh(initial: false)
        } catch {
            sending = false
            dialogError = error.localizedDescription
        }
    }
}

private struct IntegraDoorControlSheet: View {
    let door: IntegraRow
    let sending: Bool
    let dialogError: String?
    let onConfirm: (IntegraDoorControl, String) -> Void
    let onDismiss: () -> Void

    @State private var control: IntegraDoorControl = .abrir
    @State private var reason = ""

    private var nombre: String {
        IntegraDict.str(door.raw, "name", "doorName").nilIfEmpty ?? door.id
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(nombre).font(.headline)
                    Text(door.id).font(.caption).foregroundColor(.secondary)
                }
                Section("Orden") {
                    Picker("Tipo", selection: $control) {
                        ForEach(IntegraDoorControl.allCases) { c in
                            Text(c.label).tag(c)
                        }
                    }
                    .disabled(sending)
                    TextField("Motivo (mín. 3 caracteres)", text: $reason, axis: .vertical)
                        .lineLimit(2...4)
                        .disabled(sending)
                    if control.franqueaPaso {
                        Text("Esta orden franquea el paso: exige motivo claro.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    if let dialogError {
                        Text(dialogError).font(.caption).foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Control de puerta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar", action: onDismiss).disabled(sending)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if sending {
                        ProgressView()
                    } else {
                        Button("Enviar") { onConfirm(control, reason) }
                            .disabled(!IntegraDoorRules.motivoValido(reason))
                    }
                }
            }
        }
        .interactiveDismissDisabled(sending)
    }
}

