import SwiftUI
import PhotosUI
import UIKit

// MARK: - Solicitudes (Android `TicketsRequestsScreen`)

@MainActor
final class PortalRequestsVM: ObservableObject {
    @Published var isLoading = true
    @Published var refreshingVisible = false
    @Published var saving = false
    @Published var error: String?
    @Published var message: String?
    @Published var requests: [ClientTicketRequest] = []

    private var started = false
    /// La respuesta de una recarga vieja no pisa a la de una más nueva.
    private var generation = 0

    func onAppear() {
        if !started {
            started = true
            Task { await refresh(.initial) }
        } else {
            // Al volver de «Nueva solicitud»: la lista ya trae la que se levantó.
            Task { await refresh(.silent) }
        }
    }

    func refresh(_ mode: PortalLoad) async {
        generation += 1
        let gen = generation
        switch mode {
        case .initial: isLoading = true
        case .visible: refreshingVisible = true
        case .pull, .silent: break
        }
        error = nil
        // Android borra el aviso en cada recarga, incluso en la que sigue a
        // «Cerrar solicitud»: «Solicitud cerrada» desaparecía al instante. Aquí
        // solo lo borran la primera carga y el dedo.
        if mode == .initial || mode == .pull { message = nil }
        do {
            let list = try await TicketsRepository.shared.portalRequests()
            guard gen == generation else { return }
            requests = list
        } catch {
            guard gen == generation else { return }
            self.error = error.toUserMessage(fallback: "No se pudieron cargar solicitudes")
        }
        isLoading = false
        refreshingVisible = false
    }

    func close(_ id: Int64) {
        guard !saving else { return }
        saving = true
        error = nil
        message = nil
        Task {
            do {
                try await TicketsRepository.shared.closeRequest(id: id)
                saving = false
                message = "Solicitud cerrada"
                await refresh(.visible)
            } catch {
                saving = false
                self.error = error.toUserMessage(fallback: "No se pudo cerrar la solicitud")
            }
        }
    }

    /// `APPROVED` | `REJECTED`, los dos valores que acepta el API.
    func decide(_ id: Int64, _ decision: String) {
        guard !saving else { return }
        saving = true
        error = nil
        message = nil
        Task {
            do {
                try await TicketsRepository.shared.decideRequest(id: id, decision: decision)
                saving = false
                message = decision == "APPROVED" ? "Solicitud autorizada" : "Solicitud rechazada"
                await refresh(.visible)
            } catch {
                saving = false
                self.error = error.toUserMessage(fallback: "No se pudo actualizar la solicitud")
            }
        }
    }
}

/// Acción que espera confirmación: cerrar o rechazar no se deshacen.
private struct PortalPendingRequestAction {
    let id: Int64
    let closing: Bool
}

/// Solicitudes del portal (Android `TicketsRequestsScreen`): título, tres
/// cifras, buscador, filtros, tarjetas con Autorizar / Rechazar / Cerrar y el
/// botón flotante «Nueva solicitud».
///
/// Cerrar y autorizar/rechazar solo existen en `client-portal`; a una sucursal
/// el API le responde 403 y la web de sucursal no los ofrece, así que aquí
/// tampoco (Android los pintaba y fallaban).
struct PortalRequestsView: View {
    let onCreate: () -> Void
    @StateObject private var vm = PortalRequestsVM()
    @State private var filter = "activas"
    @State private var query = ""
    @State private var pending: PortalPendingRequestAction?

    private static let filters: [PortalOption] = [
        PortalOption(key: "activas", label: "Activas"),
        PortalOption(key: "nuevas", label: "Nuevas"),
        PortalOption(key: "cerradas", label: "Cerradas"),
        PortalOption(key: "todas", label: "Todas"),
    ]

    init(onCreate: @escaping () -> Void) {
        self.onCreate = onCreate
    }

    private var isBranchUser: Bool { PortalSession.isBranchUser }

    private var pendingTitle: String {
        pending?.closing == false ? "¿Rechazar solicitud?" : "¿Cerrar solicitud?"
    }

    var body: some View {
        content
            .nxScreenBackground()
            .nxFab("Nueva solicitud", systemImage: "plus", visible: !vm.isLoading, action: onCreate)
            .onAppear { vm.onAppear() }
            .refreshOnModels(["ClientTicketRequest", "Activity"]) { await vm.refresh(.visible) }
            .alert(
                pendingTitle,
                isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }),
                presenting: pending
            ) { action in
                Button(action.closing ? "Cerrar solicitud" : "Rechazar", role: .destructive) {
                    if action.closing {
                        vm.close(action.id)
                    } else {
                        vm.decide(action.id, "REJECTED")
                    }
                }
                Button("Cancelar", role: .cancel) {}
            } message: { action in
                Text(
                    action.closing
                        ? "La solicitud dejará de estar activa. Esta acción no se puede deshacer."
                        : "La solicitud quedará rechazada y no se atenderá."
                )
            }
    }

    @ViewBuilder
    private var content: some View {
        if vm.isLoading {
            PortalSkeletonScreen(itemCount: 5, itemHeight: 120)
        } else if vm.requests.isEmpty, let error = vm.error {
            ScrollView {
                NxErrorState(message: error) { Task { await vm.refresh(.initial) } }
            }
            .refreshable { await vm.refresh(.pull) }
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: NxSpacing.listGap) {
                    list
                }
                .padding(.horizontal, NxSpacing.screenH)
                .padding(.top, NxSpacing.m)
                // Aire para que el botón flotante no tape la última tarjeta.
                .padding(.bottom, 96)
            }
            .refreshable { await vm.refresh(.pull) }
            .overlay(alignment: .top) { PortalRefreshIndicator(visible: vm.refreshingVisible) }
        }
    }

    @ViewBuilder
    private var list: some View {
        if let message = vm.message {
            PortalSuccessBanner(message: message) { vm.message = nil }
        }
        if let error = vm.error {
            NxRefreshErrorBanner(
                message: error,
                onRetry: { Task { await vm.refresh(.visible) } },
                onDismiss: { vm.error = nil }
            )
        }
        NxSectionHeader(
            title: "Solicitudes",
            subtitle: "Levanta tickets y revisa el estatus de cada solicitud."
        )
        NxKpiGrid(items: kpis, columns: 3)
        NxSearchField(text: $query, placeholder: "Buscar descripción o sucursal")
        NxFilterBar(horizontalPadding: 0) {
            ForEach(Self.filters) { option in
                NxFilterPill(label: option.label, selected: filter == option.key) {
                    filter = option.key
                }
            }
        }
        let rows = filtered
        if rows.isEmpty {
            NxEmptyState(
                title: vm.requests.isEmpty ? "Sin solicitudes" : "Sin resultados",
                subtitle: vm.requests.isEmpty
                    ? "Cuando levantes una solicitud aparecerá aquí."
                    : "Ninguna solicitud coincide con el filtro o la búsqueda.",
                systemImage: "tray"
            )
        } else {
            ForEach(rows) { request in
                requestCard(request)
            }
        }
    }

    private var kpis: [NxKpi] {
        let open = vm.requests.filter { $0.status.uppercased() != "CLOSED" }.count
        let newCount = vm.requests.filter { $0.status.uppercased() == "NEW" }.count
        return [
            NxKpi(label: "Activas", value: "\(open)", tone: open > 0 ? .warning : .success),
            NxKpi(label: "Nuevas", value: "\(newCount)", tone: newCount > 0 ? .info : .neutral),
            NxKpi(label: "Total", value: "\(vm.requests.count)", tone: .brand),
        ]
    }

    private var filtered: [ClientTicketRequest] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return vm.requests.filter { r in
            let status = r.status.uppercased()
            let matchFilter: Bool
            switch filter {
            case "activas": matchFilter = status != "CLOSED"
            case "cerradas": matchFilter = status == "CLOSED"
            case "nuevas": matchFilter = status == "NEW"
            default: matchFilter = true
            }
            guard matchFilter else { return false }
            if q.isEmpty { return true }
            return "\(r.description) \(r.branchName) \(r.urgency) \(r.status)".lowercased().contains(q)
        }
    }

    private func requestCard(_ r: ClientTicketRequest) -> some View {
        let status = r.status.uppercased()
        let showsActions = status != "CLOSED" && !isBranchUser && r.id > 0
        return NxPanelShell {
            HStack(alignment: .top, spacing: NxSpacing.s) {
                Text(r.branchName.isEmpty ? "Solicitud #\(r.id)" : r.branchName)
                    .font(NxType.titleSmall)
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                NxStatusChip(text: portalRequestStatusLabel(r.status), tone: portalRequestStatusTone(r.status))
            }
            Text(r.description)
                .nxTextStyle(.bodyMedium)
                .foregroundStyle(NxColors.fg)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
            Text(Self.meta(r))
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, NxSpacing.xs)
            if showsActions {
                VStack(spacing: NxSpacing.s) {
                    if status == "NEW" {
                        HStack(spacing: NxSpacing.s) {
                            NxPrimaryButton("Autorizar", enabled: !vm.saving, tint: NxColors.success) {
                                vm.decide(r.id, "APPROVED")
                            }
                            NxSecondaryButton("Rechazar", enabled: !vm.saving, fullWidth: true, tint: NxColors.danger) {
                                pending = PortalPendingRequestAction(id: r.id, closing: false)
                            }
                        }
                    }
                    NxSecondaryButton("Cerrar solicitud", enabled: !vm.saving, fullWidth: true, tint: NxColors.muted) {
                        pending = PortalPendingRequestAction(id: r.id, closing: true)
                    }
                }
                .padding(.top, NxSpacing.m)
            }
        }
    }

    /// «Ticket por problema · Urgencia Alta · Límite 5 oct 2026, 14:30 · Sucursal 014».
    private static func meta(_ r: ClientTicketRequest) -> String {
        var parts = [portalRequestTypeLabel(r.requestType)]
        if let urgency = PortalStatusLabels.priority(r.urgency) { parts.append("Urgencia \(urgency)") }
        if !r.dueAt.isEmpty { parts.append("Límite \(PortalFormat.dateTime(r.dueAt))") }
        if !r.branchNumber.isEmpty { parts.append("Sucursal \(r.branchNumber)") }
        return parts.joined(separator: " · ")
    }
}

/// Android `requestStatusTone`.
private func portalRequestStatusTone(_ status: String) -> NxTone {
    let s = status.uppercased()
    if s == "CLOSED" { return .neutral }
    if s == "NEW" { return .warning }
    if s.contains("APPROV") { return .success }
    if s.contains("REJECT") { return .danger }
    return .info
}

/// Android `requestStatusLabel`.
private func portalRequestStatusLabel(_ status: String) -> String {
    switch status.uppercased() {
    case "NEW": return "Nueva"
    case "APPROVED": return "Autorizada"
    case "REJECTED": return "Rechazada"
    case "CLOSED": return "Cerrada"
    default: return PortalStatusLabels.label(status)
    }
}

/// Android `requestTypeLabel` (y la web `getFlowLabel`).
private func portalRequestTypeLabel(_ type: String) -> String {
    switch type.uppercased() {
    case "PREVENTIVE_INVENTORY": return "Mantenimiento e inventario"
    case "ISSUE": return "Ticket por problema"
    default: return PortalStatusLabels.label(type)
    }
}

// MARK: - Nueva solicitud (Android `TicketsRequestNewScreen`)

@MainActor
final class PortalRequestNewVM: ObservableObject {
    @Published var isLoading = true
    @Published var saving = false
    @Published var error: String?
    @Published var message: String?
    @Published var branches: [PortalBranch] = []
    @Published var selectedBranchId: Int64?
    @Published var descripcion = ""
    @Published var requestType = "ISSUE"
    @Published var urgency = "MEDIUM"
    @Published var evidence: [PortalPickedImage] = []

    /// La sucursal no elige sucursal (es ella) y sí adjunta evidencias.
    let isBranchUser: Bool
    private var started = false

    init() {
        let branch = PortalSession.isBranchUser
        self.isBranchUser = branch
        self.isLoading = !branch
    }

    /// Android `requiredFieldError(description, "Descripción")`.
    var descriptionError: String? {
        descripcion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Descripción es requerido" : nil
    }

    var canSubmit: Bool { descriptionError == nil && !saving && !isLoading }

    func start() {
        guard !started else { return }
        started = true
        if !isBranchUser {
            Task { await refreshBranches(initial: true) }
        }
    }

    func refreshBranches(initial: Bool) async {
        guard !isBranchUser else { return }
        if initial { isLoading = true }
        error = nil
        do {
            branches = try await TicketsRepository.shared.portalBranches()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudieron cargar sucursales")
        }
        isLoading = false
    }

    func submit() {
        let desc = descripcion.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !desc.isEmpty, !saving else { return }
        saving = true
        error = nil
        message = nil
        var files: [(fileName: String, data: Data)] = []
        if isBranchUser {
            for (index, image) in evidence.enumerated() {
                files.append((fileName: "evidencia-\(index + 1).\(image.fileExtension)", data: image.data))
            }
        }
        let evidenceFiles = files
        let branchId = isBranchUser ? nil : selectedBranchId
        Task {
            do {
                _ = try await TicketsRepository.shared.createRequest(
                    description: desc,
                    urgency: urgency,
                    requestType: requestType,
                    branchId: branchId,
                    evidenceFiles: evidenceFiles
                )
                saving = false
                descripcion = ""
                evidence = []
                message = "Solicitud creada"
            } catch {
                saving = false
                self.error = error.toUserMessage(fallback: "No se pudo crear la solicitud")
            }
        }
    }
}

/// Alta de solicitud (Android `TicketsRequestNewScreen`): «Enviar solicitud»
/// arriba, «Descripción» (y evidencias si es sucursal) y «Clasificación» con
/// sucursal, urgencia y tipo. Al enviar se queda en la pantalla, limpia el
/// formulario y avisa abajo, como Android.
struct PortalRequestNewView: View {
    @StateObject private var vm = PortalRequestNewVM()
    @State private var evidenceItems: [PhotosPickerItem] = []

    /// Urgencias del API con su texto en español. Android enseñaba «LOW»,
    /// «MEDIUM» y «HIGH» tal cual; la web y el resto del portal dicen
    /// Baja / Media / Alta.
    private static let urgencies: [PortalOption] = [
        PortalOption(key: "LOW", label: "Baja"),
        PortalOption(key: "MEDIUM", label: "Media"),
        PortalOption(key: "HIGH", label: "Alta"),
    ]

    /// Tipos del API con el texto de la lista de solicitudes de Android
    /// (Android ponía «ISSUE» / «PREVENTIVE_INVENTORY» en el desplegable).
    private static let types: [PortalOption] = [
        PortalOption(key: "ISSUE", label: "Ticket por problema"),
        PortalOption(key: "PREVENTIVE_INVENTORY", label: "Mantenimiento e inventario"),
    ]

    init() {}

    var body: some View {
        VStack(spacing: 0) {
            PortalPillButton(
                title: vm.saving ? "Enviando…" : "Enviar solicitud",
                enabled: vm.canSubmit,
                minHeight: 48
            ) { vm.submit() }
            .padding(NxSpacing.l)

            if vm.isLoading {
                NxLoadingState(text: "Cargando sucursales…")
                Spacer(minLength: 0)
            } else {
                ScrollView {
                    form
                        .padding(.horizontal, NxSpacing.screenH)
                }
                .refreshable { await vm.refreshBranches(initial: false) }
            }
        }
        .nxScreenBackground()
        .portalSnackbar($vm.message)
        .onAppear { vm.start() }
        .onChange(of: evidenceItems) { _, items in
            guard !items.isEmpty else { return }
            Task {
                var picked: [PortalPickedImage] = []
                for item in items {
                    if let image = await PortalPickedImage.load(item) {
                        picked.append(image)
                    }
                }
                // Como Android (`setEvidenceUris`): la nueva selección reemplaza a la anterior.
                vm.evidence = picked
                evidenceItems = []
            }
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 0) {
            PortalScreenTitle(
                title: "Nueva solicitud",
                subtitle: "Describe el problema o solicita mantenimiento preventivo"
            )
            PortalGap(12)

            if let error = vm.error {
                NxErrorBlock(message: error, onRetry: { Task { await vm.refreshBranches(initial: true) } })
                PortalGap(10)
            }

            NxPanelShell(padding: 14) {
                NxSectionHeader(title: "Descripción")
                PortalOutlinedField(
                    label: "Descripción *",
                    text: $vm.descripcion,
                    error: vm.descriptionError,
                    minLines: 3
                )
                if vm.isBranchUser {
                    PortalGap(10)
                    NxSectionHeader(title: "Evidencias")
                    HStack(spacing: NxSpacing.s) {
                        PhotosPicker(selection: $evidenceItems, maxSelectionCount: 10, matching: .images) {
                            PortalOutlinedPillLabel(
                                text: vm.evidence.isEmpty ? "Agregar evidencias" : "Evidencias (\(vm.evidence.count))",
                                enabled: !vm.saving
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(vm.saving)
                        PortalPillButton(
                            title: "Quitar",
                            filled: false,
                            enabled: !vm.saving && !vm.evidence.isEmpty
                        ) { vm.evidence = [] }
                    }
                }
            }

            PortalGap(10)

            NxPanelShell(padding: 14) {
                NxSectionHeader(title: "Clasificación")
                if !vm.branches.isEmpty {
                    PortalDropdownField(
                        label: "Sucursal",
                        value: selectedBranchLabel,
                        options: branchOptions,
                        onSelect: { id in vm.selectedBranchId = Int64(id) }
                    )
                    PortalGap(10)
                }
                HStack(alignment: .top, spacing: NxSpacing.s) {
                    PortalDropdownField(
                        label: "Urgencia",
                        value: Self.label(Self.urgencies, vm.urgency),
                        options: Self.urgencies.map { PortalMenuOption(id: $0.key, title: $0.label) },
                        onSelect: { vm.urgency = $0 }
                    )
                    PortalDropdownField(
                        label: "Tipo",
                        value: Self.label(Self.types, vm.requestType),
                        options: Self.types.map { PortalMenuOption(id: $0.key, title: $0.label) },
                        onSelect: { vm.requestType = $0 }
                    )
                }
            }

            PortalGap(16)
        }
    }

    private var selectedBranchLabel: String {
        vm.branches.first(where: { $0.id == vm.selectedBranchId })?.name ?? "Sin sucursal"
    }

    /// «Sin sucursal» (id vacío → `nil`) y las sucursales del cliente.
    private var branchOptions: [PortalMenuOption] {
        [PortalMenuOption(id: "", title: "Sin sucursal")]
            + vm.branches.map { PortalMenuOption(id: String($0.id), title: $0.name) }
    }

    private static func label(_ options: [PortalOption], _ key: String) -> String {
        options.first(where: { $0.key == key })?.label ?? key
    }
}
