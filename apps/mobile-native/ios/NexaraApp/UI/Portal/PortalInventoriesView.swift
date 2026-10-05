import SwiftUI
import PhotosUI

// MARK: - Inventarios (Android `TicketsInventoriesScreen`)

@MainActor
final class PortalInventoriesVM: ObservableObject {
    @Published var isLoading = true
    @Published var loaded = false
    @Published var refreshingVisible = false
    @Published var downloading = false
    @Published var error: String?
    @Published var message: String?
    @Published var inventories: [PortalInventorySnapshot] = []
    @Published var pdf: PortalPDFItem?

    private var started = false

    func onAppear() {
        if !started {
            started = true
            Task { await refresh(.initial) }
        } else {
            // Al volver del detalle: aprobar o sincronizar cambia el estatus.
            Task { await refresh(.silent) }
        }
    }

    func refresh(_ mode: PortalLoad) async {
        if !loaded {
            isLoading = true
        } else if mode == .visible {
            refreshingVisible = true
        }
        error = nil
        if mode == .initial || mode == .pull { message = nil }
        do {
            inventories = try await TicketsRepository.shared.portalInventories()
            loaded = true
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudieron cargar inventarios")
        }
        isLoading = false
        refreshingVisible = false
    }

    /// Reporte del portal en PDF (el mismo de «Reporte del portal» en el inicio).
    func downloadReport() {
        guard !downloading else { return }
        downloading = true
        error = nil
        message = nil
        Task {
            do {
                let data = try await TicketsRepository.shared.portalReportPdf()
                pdf = PortalPDFItem(title: "Reporte de tickets", data: data)
                message = "Reporte descargado"
            } catch {
                self.error = error.toUserMessage(fallback: "No se pudo descargar el reporte")
            }
            downloading = false
        }
    }
}

/// Inventarios del portal (Android `TicketsInventoriesScreen`): título,
/// «Descargar reporte PDF» y un renglón por inventario con estatus, sucursal y
/// número de equipos. El buscador no está en Android pero sí en la web
/// («Buscar en historial»), así que se queda.
struct PortalInventoriesView: View {
    let onOpenInventory: (Int64) -> Void
    @StateObject private var vm = PortalInventoriesVM()
    @State private var query = ""

    init(onOpenInventory: @escaping (Int64) -> Void) {
        self.onOpenInventory = onOpenInventory
    }

    var body: some View {
        content
            .nxScreenBackground()
            .onAppear { vm.onAppear() }
            .refreshOnModels(["InventorySnapshot", "InventoryItem"]) { await vm.refresh(.visible) }
            .sheet(item: $vm.pdf) { PortalPDFSheet(item: $0) }
    }

    @ViewBuilder
    private var content: some View {
        if vm.isLoading && !vm.loaded {
            PortalSkeletonScreen(itemCount: 5)
        } else if !vm.loaded, let error = vm.error {
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
                .padding(.vertical, NxSpacing.m)
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
        NxSectionHeader(title: "Inventarios", subtitle: "Equipos registrados en tus sucursales.")
        NxSecondaryButton(
            vm.downloading ? "Descargando reporte…" : "Descargar reporte PDF",
            systemImage: "doc.richtext",
            loading: vm.downloading,
            fullWidth: true
        ) { vm.downloadReport() }
        if !vm.inventories.isEmpty {
            NxSearchField(text: $query, placeholder: "Buscar en historial")
        }
        let rows = filtered
        if vm.inventories.isEmpty {
            NxEmptyState(
                title: "Sin inventarios",
                subtitle: "Todavía no hay inventarios disponibles para tu empresa.",
                systemImage: "shippingbox"
            )
        } else if rows.isEmpty {
            NxEmptyState(
                title: "Sin resultados",
                subtitle: "Ningún inventario coincide con la búsqueda.",
                systemImage: "shippingbox"
            )
        } else {
            ForEach(rows) { inventory in
                row(inventory)
            }
        }
    }

    /// Como «Buscar en historial» de la web: título, sucursal, estatus o folio.
    private var filtered: [PortalInventorySnapshot] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return vm.inventories }
        return vm.inventories.filter { inv in
            "\(inv.title) \(inv.branchName) \(inv.status) \(PortalStatusLabels.label(inv.status)) INV-\(inv.id)"
                .lowercased()
                .contains(q)
        }
    }

    private func row(_ inv: PortalInventorySnapshot) -> some View {
        let meta = Self.meta(inv)
        return PortalChevronCard(onClick: { onOpenInventory(inv.id) }) {
            VStack(alignment: .leading, spacing: NxSpacing.xs) {
                HStack(alignment: .top, spacing: NxSpacing.s) {
                    Text(inv.title.isEmpty ? "Inventario #\(inv.id)" : inv.title)
                        .font(NxType.titleSmall)
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if !inv.status.isEmpty {
                        NxStatusChip(text: PortalStatusLabels.label(inv.status), tone: PortalStatusLabels.tone(inv.status))
                    }
                }
                if !meta.isEmpty {
                    Text(meta)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .multilineTextAlignment(.leading)
                }
            }
        }
    }

    /// «Sucursal Centro · 12 equipos» (Android: `currentCount ?: items.size`).
    private static func meta(_ inv: PortalInventorySnapshot) -> String {
        var parts: [String] = []
        if !inv.branchName.isEmpty { parts.append(inv.branchName) }
        if let count = inv.equipmentCount {
            parts.append(count == 1 ? "1 equipo" : "\(count) equipos")
        }
        return parts.joined(separator: " · ")
    }
}

/// Android `inventoryStatusTone` del detalle.
private func portalInventoryStatusTone(_ status: String) -> NxTone {
    switch status.uppercased() {
    case "COMPLETED", "APPROVED": return .success
    case "REJECTED": return .danger
    case "PENDING", "DRAFT": return .warning
    default: return .info
    }
}

/// Comparación del equipo contra el inventario anterior (`compareState` del API:
/// `UNCHANGED` / `UPDATED`); Android lo pintaba en inglés y en mayúsculas.
private func portalCompareStateLabel(_ raw: String) -> String {
    switch raw.uppercased() {
    case "UNCHANGED": return "Sin cambios"
    case "UPDATED": return "Actualizado"
    default: return PortalStatusLabels.label(raw)
    }
}

// MARK: - Detalle de inventario (Android `TicketsInventoryDetailScreen`)

@MainActor
final class PortalInventoryDetailVM: ObservableObject {
    @Published var isLoading = true
    @Published var refreshingVisible = false
    @Published var saving = false
    @Published var downloading = false
    @Published var error: String?
    @Published var message: String?
    @Published var snapshot: PortalInventorySnapshot?
    @Published var notes = ""
    @Published var markCompleted = false
    @Published var confirmDifference = false
    @Published var pdf: PortalPDFItem?

    let inventoryId: Int64
    /// Aprobar y rechazar son de la cuenta cliente: `branch-portal` no los
    /// tiene y la web de sucursal no los enseña.
    let isBranchUser: Bool
    private var started = false

    init(inventoryId: Int64) {
        self.inventoryId = inventoryId
        self.isBranchUser = PortalSession.isBranchUser
    }

    func start() {
        guard !started else { return }
        started = true
        Task { await load(.initial) }
    }

    /// `keepDraft`: tras una acción no se pisan las notas ni los interruptores
    /// que el usuario tenía, ni el aviso de lo que acaba de pasar.
    func load(_ mode: PortalLoad, keepDraft: Bool = false) async {
        switch mode {
        case .initial: isLoading = true
        case .visible: refreshingVisible = true
        case .pull, .silent: break
        }
        error = nil
        if !keepDraft { message = nil }
        do {
            let detail = try await TicketsRepository.shared.portalInventoryDetail(id: inventoryId)
            snapshot = detail
            if !keepDraft {
                notes = detail.notes
                markCompleted = detail.status.uppercased() == "COMPLETED"
                confirmDifference = false
            }
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar inventario")
        }
        isLoading = false
        refreshingVisible = false
    }

    func downloadPdf() {
        guard !downloading else { return }
        downloading = true
        error = nil
        message = nil
        Task {
            do {
                let data = try await TicketsRepository.shared.inventoryReportPdf(id: inventoryId)
                pdf = PortalPDFItem(title: "Inventario", data: data)
                message = "PDF descargado"
            } catch {
                self.error = error.toUserMessage(fallback: "No se pudo descargar PDF")
            }
            downloading = false
        }
    }

    /// `APPROVED` | `REJECTED`. La pantalla anterior mandaba `APPROVE` / `REJECT`
    /// y el API respondía 400 «Decision invalida»: aprobar nunca funcionó.
    func decide(_ decision: String) {
        guard !saving else { return }
        saving = true
        error = nil
        message = nil
        Task {
            do {
                _ = try await TicketsRepository.shared.decideInventory(id: inventoryId, decision: decision)
                saving = false
                message = "Inventario actualizado"
                // El API responde el inventario SIN sucursal ni equipos; Android
                // lo ponía tal cual y la pantalla se quedaba en «Items (0)».
                await load(.visible, keepDraft: true)
            } catch {
                saving = false
                self.error = error.toUserMessage(fallback: "No se pudo actualizar")
            }
        }
    }

    /// Sube las fotos elegidas (Android `uploadMedia`). La sucursal sube por
    /// `branch-portal` (lo resuelve el repositorio).
    func uploadMedia(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty, !saving else { return }
        saving = true
        error = nil
        message = nil
        Task {
            var files: [(fileName: String, data: Data)] = []
            for (index, item) in items.enumerated() {
                if let image = await PortalPickedImage.load(item) {
                    files.append((fileName: "foto-\(index + 1).\(image.fileExtension)", data: image.data))
                }
            }
            do {
                _ = try await TicketsRepository.shared.uploadInventoryMedia(files: files)
                saving = false
                message = "Archivos subidos"
            } catch {
                saving = false
                self.error = error.toUserMessage(fallback: "No se pudo subir media")
            }
        }
    }

    /// Android `syncSnapshot`: sin sucursal no hace nada. Los equipos no se
    /// mandan (el API conserva los que ya tiene, con sus fotos).
    func sync() {
        guard !saving, let snap = snapshot, let branchId = snap.branchId else { return }
        saving = true
        error = nil
        message = nil
        let notas = notes
        let completed = markCompleted
        let confirm = confirmDifference
        Task {
            do {
                let raw = try await TicketsRepository.shared.syncInventory(
                    branchId: branchId,
                    snapshotId: snap.id,
                    title: snap.title,
                    notes: notas,
                    completed: completed,
                    confirmDifference: confirm
                )
                snapshot = PortalInventorySnapshot(raw: raw)
                saving = false
                message = "Inventario sincronizado"
            } catch {
                saving = false
                self.error = error.toUserMessage(fallback: "No se pudo sincronizar")
            }
        }
    }
}

/// Detalle de inventario (Android `TicketsInventoryDetailScreen`): encabezado,
/// tarjeta «Acciones» (PDF, fotos, completado, diferencia, sincronizar y, para
/// el cliente, aprobar o rechazar), notas y los equipos.
struct PortalInventoryDetailView: View {
    @StateObject private var vm: PortalInventoryDetailVM
    @State private var photoItems: [PhotosPickerItem] = []

    init(inventoryId: Int64) {
        _vm = StateObject(wrappedValue: PortalInventoryDetailVM(inventoryId: inventoryId))
    }

    var body: some View {
        content
            .nxScreenBackground()
            .onAppear { vm.start() }
            .refreshOnModels(["InventorySnapshot", "InventoryItem"]) { await vm.load(.visible) }
            .sheet(item: $vm.pdf) { PortalPDFSheet(item: $0) }
            .onChange(of: photoItems) { _, items in
                guard !items.isEmpty else { return }
                photoItems = []
                vm.uploadMedia(items)
            }
    }

    @ViewBuilder
    private var content: some View {
        if vm.isLoading {
            PortalSkeletonScreen(itemCount: 5, vertical: NxSpacing.l)
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    list
                }
                .padding(.horizontal, NxSpacing.screenH)
            }
            .refreshable { await vm.load(.pull) }
            .overlay(alignment: .top) { PortalRefreshIndicator(visible: vm.refreshingVisible) }
        }
    }

    @ViewBuilder
    private var list: some View {
        PortalScreenTitle(
            title: "Detalle inventario",
            subtitle: "Revisa items, sincroniza cambios y aprueba el conteo"
        )
        if let message = vm.message {
            PortalNoticePanel(message: message, closeLabel: "Cerrar aviso") { vm.message = nil }
        }
        if let error = vm.error {
            NxErrorBlock(message: error, onRetry: { Task { await vm.load(.initial) } })
        }
        if let snap = vm.snapshot {
            headerPanel(snap)
            actionsPanel
            NxPanelShell(padding: 12) {
                PortalOutlinedField(label: "Notas", text: $vm.notes, multiline: true)
            }
            Text("Items (\(snap.items.count))")
                .font(NxType.titleMedium)
                .foregroundStyle(NxColors.brand)
            if snap.items.isEmpty {
                NxEmptyState(title: "Sin items", subtitle: "Este inventario no tiene equipos registrados.")
            } else {
                ForEach(Array(snap.items.enumerated()), id: \.offset) { _, item in
                    itemCard(item)
                }
            }
            PortalGap(8)
        } else {
            NxEmptyState(title: "Inventario no encontrado", subtitle: "No hay datos para este inventario.")
        }
    }

    private func headerPanel(_ snap: PortalInventorySnapshot) -> some View {
        NxPanelShell(padding: 14) {
            HStack(alignment: .center, spacing: NxSpacing.s) {
                Text(snap.title.isEmpty ? "Inventario #\(snap.id)" : snap.title)
                    .font(NxType.titleMedium)
                    .foregroundStyle(NxColors.fg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if !snap.status.isEmpty {
                    NxStatusChip(text: PortalStatusLabels.label(snap.status), tone: portalInventoryStatusTone(snap.status))
                }
            }
            if !snap.branchName.isEmpty {
                Text(snap.branchName)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
            }
        }
    }

    private var actionsPanel: some View {
        NxPanelShell(padding: 12) {
            Text("Acciones")
                .font(NxType.titleSmall)
                .foregroundStyle(NxColors.fg)
            PortalGap(8)
            HStack(spacing: NxSpacing.s) {
                PortalPillButton(title: vm.downloading ? "Descargando…" : "PDF", enabled: !vm.downloading) {
                    vm.downloadPdf()
                }
                PhotosPicker(selection: $photoItems, maxSelectionCount: 30, matching: .images) {
                    PortalOutlinedPillLabel(text: vm.saving ? "Subiendo…" : "Subir fotos", enabled: !vm.saving)
                }
                .buttonStyle(.plain)
                .disabled(vm.saving)
            }
            PortalGap(8)
            HStack(spacing: NxSpacing.s) {
                PortalPillButton(
                    title: vm.markCompleted ? "Marcado: COMPLETADO" : "Marcar: COMPLETADO",
                    filled: false,
                    enabled: !vm.saving
                ) { vm.markCompleted.toggle() }
                PortalPillButton(
                    title: vm.confirmDifference ? "ConfirmDiff: Sí" : "ConfirmDiff: No",
                    filled: false,
                    enabled: !vm.saving
                ) { vm.confirmDifference.toggle() }
            }
            PortalGap(8)
            PortalPillButton(
                title: vm.saving ? "Sincronizando…" : "Sincronizar inventario",
                enabled: !vm.saving
            ) { vm.sync() }
            if !vm.isBranchUser {
                PortalGap(8)
                HStack(spacing: NxSpacing.s) {
                    PortalPillButton(title: "Aprobar", filled: false, enabled: !vm.saving) {
                        vm.decide("APPROVED")
                    }
                    PortalPillButton(title: "Rechazar", filled: false, enabled: !vm.saving) {
                        vm.decide("REJECTED")
                    }
                }
            }
        }
    }

    private func itemCard(_ item: PortalInventoryItem) -> some View {
        let meta = Self.itemMeta(item)
        return NxPanelShell(padding: 12) {
            Text(item.itemName.isEmpty ? "Equipo" : item.itemName)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(NxColors.fg)
            if !meta.isEmpty {
                Text(meta)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// «SN: ABC123 · Sin cambios · Activo».
    private static func itemMeta(_ item: PortalInventoryItem) -> String {
        var parts: [String] = []
        if !item.serialNumber.isEmpty { parts.append("SN: \(item.serialNumber)") }
        if !item.compareState.isEmpty { parts.append(portalCompareStateLabel(item.compareState)) }
        if !item.itemStatus.isEmpty { parts.append(PortalStatusLabels.label(item.itemStatus)) }
        return parts.joined(separator: " · ")
    }
}
