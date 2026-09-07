import SwiftUI

/// Puertas ACS — live/espejo, página, filtros y control con motivo. Paridad `IntegraAccessScreen`.
private let integraDoorPage = 24

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
        let matching = vm.filtered
        let shown = Array(matching.prefix(vm.limit))

        return List {
            if let message = vm.message, vm.messageIsError {
                Section {
                    NxAlertBanner(alert: NxAlert(id: "err", title: message, tone: .danger))
                }
            }

            Section {
                Text(vm.headerLine)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                if !vm.canControl {
                    NxAlertBanner(alert: NxAlert(
                        id: "ro",
                        title: "Modo consulta",
                        subtitle: "Esta cuenta puede ver el estado, pero no abrir ni cerrar puertas.",
                        tone: .warning
                    ))
                }
                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Nombre, región o ID…", text: $vm.query)
                        .autocorrectionDisabled()
                        .onChange(of: vm.query) { _, _ in vm.limit = integraDoorPage }
                }
            }

            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        Button {
                            Task { await vm.setLive(!vm.live) }
                        } label: {
                            NxStatusChip(
                                text: vm.live ? "Estado live" : "Espejo",
                                tone: vm.live ? .info : .neutral
                            )
                        }
                        .buttonStyle(.plain)

                        ForEach(IntegraDoorRules.stateFilters, id: \.self) { state in
                            let selected = vm.stateFilter == state
                            Button {
                                vm.stateFilter = selected ? "" : state
                                vm.limit = integraDoorPage
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
                if !vm.regiones.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(vm.regiones, id: \.self) { region in
                                let selected = vm.regionFilter == region
                                Button {
                                    vm.regionFilter = selected ? "" : region
                                    vm.limit = integraDoorPage
                                } label: {
                                    NxStatusChip(text: region, tone: selected ? .brand : .neutral)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                Text("Mostrando \(shown.count) de \(matching.count) (total \(vm.items.count))")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if shown.isEmpty {
                Section {
                    NxEmptyState(
                        title: vm.items.isEmpty ? "Sin puertas" : "Ninguna coincide",
                        subtitle: vm.items.isEmpty
                            ? "No hay puertas en el espejo de este sitio. Sincroniza desde la consola web."
                            : "Ninguna de las \(vm.items.count) puertas cargadas coincide con el filtro.",
                        actionLabel: matching.isEmpty && !vm.items.isEmpty ? "Quitar filtros" : nil
                    ) {
                        vm.clearFilters()
                    }
                }
            } else {
                ForEach(shown) { door in
                    VStack(alignment: .leading, spacing: 8) {
                        doorRow(door)
                        if vm.canControl {
                            Button("Accionar…") { vm.target = door }
                                .buttonStyle(.bordered)
                        }
                    }
                    .padding(.vertical, 2)
                }
                if matching.count > vm.limit {
                    Section {
                        Button("Ver más puertas") {
                            vm.limit += integraDoorPage
                        }
                    }
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
    }
}

@MainActor
final class IntegraAccessVM: ObservableObject {
    @Published var items: [IntegraRow] = []
    @Published var source = ""
    @Published var live = false
    @Published var canControl = true
    @Published var devices = 0
    @Published var query = ""
    @Published var stateFilter = ""
    @Published var regionFilter = ""
    @Published var limit = integraDoorPage
    @Published var loading = true
    @Published var error: String?
    @Published var message: String?
    @Published var messageIsError = false
    @Published var target: IntegraRow?
    @Published var sending = false
    @Published var dialogError: String?

    private let repo = IntegraRepository.shared

    var regiones: [String] {
        Array(Set(items.map { IntegraDict.str($0.raw, "location", "regionName") }.filter { !$0.isEmpty })).sorted()
    }

    var onlineCount: Int {
        items.filter { IntegraDict.bool($0.raw, "online") != false }.count
    }

    var headerLine: String {
        var parts = ["\(onlineCount)/\(items.count) puertas en línea", "\(devices) equipos"]
        switch source {
        case "live": parts.append("estado consultado al ACS")
        case "mirror": parts.append("espejo sincronizado")
        default:
            if !source.isEmpty { parts.append(source) }
        }
        return parts.joined(separator: " · ")
    }

    var filtered: [IntegraRow] {
        items.filter { door in
            let online = IntegraDict.bool(door.raw, "online")
            let state = IntegraDoorRules.doorState(
                online: online,
                status: IntegraDict.str(door.raw, "status", "doorState").nilIfEmpty
            )
            let stateOk = stateFilter.isEmpty || state == stateFilter
            let regionOk = regionFilter.isEmpty
                || IntegraDict.str(door.raw, "location", "regionName") == regionFilter
            let queryOk = IntegraDict.matchesQuery(
                door.raw, query: query,
                "name", "doorName", "location", "regionName", "id", "doorIndexCode"
            )
            return stateOk && regionOk && queryOk
        }
    }

    func clearFilters() {
        query = ""
        stateFilter = ""
        regionFilter = ""
        limit = integraDoorPage
    }

    func setLive(_ value: Bool) async {
        live = value
        await refresh(initial: false)
    }

    func refresh(initial: Bool = true) async {
        if initial && items.isEmpty { loading = true }
        error = nil
        do {
            let result = try await repo.doors(live: live)
            items = result.items.compactMap { raw in
                let id = IntegraDict.str(raw, "id", "doorIndexCode", "doorId")
                guard !id.isEmpty else { return nil }
                return IntegraRow(id: id, raw: raw)
            }
            source = result.source.isEmpty ? (live ? "live" : "mirror") : result.source
            let dash = try? await repo.dashboard()
            if let caps = dash?["capabilities"] as? [String: Any] {
                canControl = IntegraDict.bool(caps, "canControlDoors") ?? true
            } else {
                canControl = true
            }
            devices = ((try? await repo.devices()) ?? []).count
            loading = false
        } catch {
            loading = false
            self.error = error.toUserMessage(fallback: "No se pudieron cargar las puertas")
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
            dialogError = error.toUserMessage(fallback: "No se pudo enviar la orden a «\(nombre)»")
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

    private var ubicacion: String {
        IntegraDict.str(door.raw, "location", "regionName")
    }

    private var estadoLabel: String {
        let state = IntegraDoorRules.doorState(
            online: IntegraDict.bool(door.raw, "online"),
            status: IntegraDict.str(door.raw, "status", "doorState").nilIfEmpty
        )
        return IntegraDoorRules.stateLabel(state)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(nombre).font(.headline)
                    Text(door.id).font(.caption).foregroundColor(.secondary)
                    if !ubicacion.isEmpty {
                        LabeledContent("Ubicación", value: ubicacion)
                    }
                    LabeledContent("Estado", value: estadoLabel)
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
