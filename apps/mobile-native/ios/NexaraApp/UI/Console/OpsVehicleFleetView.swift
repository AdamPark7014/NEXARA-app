import SwiftUI

/// Flota y aprobaciones de vehículo — `vehicles/inventory`,
/// `vehicles/inventory/:id` y `vehicles/:id/approve`.
///
/// Dos pestañas porque son dos trabajos distintos: quien administra la flota da
/// de alta unidades; quien revisa aprueba o rechaza que alguien se lleve una.
/// Mezclarlas en una lista fue lo que hizo la web y nadie encontraba nada.
struct OpsVehicleFleetView: View {
    var initialTab: Int = 0

    @StateObject private var vm = OpsVehicleFleetVM()
    @State private var tab = 0
    @State private var showNewAsset = false

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                Text("Unidades").tag(0)
                Text("Solicitudes").tag(1)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.bottom, 8)

            if let msg = vm.message {
                Text(msg)
                    .font(.caption)
                    .foregroundColor(vm.messageIsError ? .red : .green)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal)
                    .padding(.bottom, 6)
            }

            if vm.loading {
                Spacer(); ProgressView(); Spacer()
            } else if tab == 0 {
                inventoryList
            } else {
                requestsList
            }
        }
        .navigationTitle("Flota")
        .onAppear { tab = initialTab }
        .task { await vm.load() }
        .refreshable { await vm.load() }
        .toolbar {
            if tab == 0 && vm.canManageInventory {
                ToolbarItem(placement: .primaryAction) {
                    Button { showNewAsset = true } label: { Image(systemName: "plus") }
                }
            }
        }
        .sheet(isPresented: $showNewAsset) {
            OpsNewVehicleAssetSheet { nombre, placas, estatus, notas in
                await vm.createAsset(nombre: nombre, placas: placas, estatus: estatus, notas: notas)
            }
        }
    }

    // MARK: – Unidades

    private var inventoryList: some View {
        ScrollView {
            VStack(spacing: 10) {
                if vm.assets.isEmpty {
                    NxEmptyState(
                        title: "Sin unidades",
                        subtitle: vm.canManageInventory
                            ? "Da de alta el primer vehículo con el botón +."
                            : "El inventario de flota está vacío.",
                        actionLabel: "Actualizar",
                        onAction: { Task { await vm.load() } }
                    )
                } else {
                    HStack(spacing: 0) {
                        OpsFleetChip(label: "Unidades", value: "\(vm.assets.count)", tone: .primary)
                        Divider().frame(height: 34)
                        OpsFleetChip(label: "Disponibles",
                                     value: "\(vm.assets.filter { !$0.isAssigned && $0.activo }.count)",
                                     tone: .green)
                        Divider().frame(height: 34)
                        OpsFleetChip(label: "Asignadas",
                                     value: "\(vm.assets.filter(\.isAssigned).count)",
                                     tone: .blue)
                    }
                    .padding(.vertical, 8)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    ForEach(vm.assets) { asset in
                        OpsVehicleAssetCard(
                            asset: asset,
                            canManage: vm.canManageInventory,
                            busy: vm.busyId == asset.id,
                            onStatus: { st in Task { await vm.setAssetStatus(asset, status: st) } },
                            onToggleActive: { Task { await vm.toggleActive(asset) } }
                        )
                    }
                }
            }
            .padding(14)
        }
    }

    // MARK: – Solicitudes

    private var requestsList: some View {
        ScrollView {
            VStack(spacing: 10) {
                if !vm.canReview {
                    Text("Solo lectura: necesitas permiso `vehicles.review` para aprobar o rechazar.")
                        .font(.caption).foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                if vm.requests.isEmpty {
                    NxEmptyState(
                        title: "Sin solicitudes",
                        subtitle: "Nadie ha pedido un vehículo.",
                        actionLabel: "Actualizar",
                        onAction: { Task { await vm.load() } }
                    )
                } else {
                    ForEach(vm.requests) { req in
                        OpsVehicleRequestCard(
                            request: req,
                            canReview: vm.canReview,
                            busy: vm.busyId == req.id,
                            onDecide: { approve in Task { await vm.decide(req, approve: approve) } }
                        )
                    }
                }
            }
            .padding(14)
        }
    }
}

// MARK: – ViewModel

@MainActor
final class OpsVehicleFleetVM: ObservableObject {
    @Published var assets: [OpsVehicleAsset] = []
    @Published var requests: [OpsVehicleRequest] = []
    @Published var loading = true
    @Published var busyId: Int64?
    @Published var message: String?
    @Published var messageIsError = false

    private let repo = OpsVehicleFleetRepository.shared

    var canManageInventory: Bool {
        guard let u = SessionStore.shared.currentUser else { return false }
        return u.isSuperAdmin
            || u.permissions.contains("vehicles.inventory")
            || u.permissions.contains("console.admin")
    }

    var canReview: Bool {
        guard let u = SessionStore.shared.currentUser else { return false }
        return u.isSuperAdmin
            || u.permissions.contains("vehicles.review")
            || u.permissions.contains("console.admin")
    }

    func load() async {
        loading = true
        defer { loading = false }
        // Cada lista aguanta sola: el inventario lo puede ver quien no puede ver
        // solicitudes y al revés, así que un 403 en una no vacía la otra.
        async let assetsTask = repo.inventory()
        async let requestsTask = repo.requests()
        assets = (try? await assetsTask) ?? []
        requests = (try? await requestsTask) ?? []
    }

    func createAsset(nombre: String, placas: String, estatus: String, notas: String) async {
        message = nil
        do {
            _ = try await repo.createAsset(
                nombre: nombre,
                placas: placas,
                estatus: estatus,
                notas: notas
            )
            messageIsError = false
            message = "Unidad dada de alta."
            await load()
        } catch {
            messageIsError = true
            message = error.toUserMessage(fallback: "No se pudo dar de alta la unidad")
        }
    }

    func setAssetStatus(_ asset: OpsVehicleAsset, status: String) async {
        guard status != asset.estatus else { return }
        busyId = asset.id
        message = nil
        defer { busyId = nil }
        do {
            _ = try await repo.updateAsset(id: asset.id, estatus: status)
            messageIsError = false
            message = "\(asset.displayName): \(status)."
            await load()
        } catch {
            messageIsError = true
            message = error.toUserMessage(fallback: "No se pudo actualizar la unidad")
        }
    }

    /// Dar de baja no borra: el histórico de uso de un vehículo tiene que seguir
    /// existiendo aunque la unidad ya no esté en la flota.
    func toggleActive(_ asset: OpsVehicleAsset) async {
        busyId = asset.id
        message = nil
        defer { busyId = nil }
        do {
            _ = try await repo.updateAsset(id: asset.id, activo: !asset.activo)
            messageIsError = false
            message = asset.activo ? "Unidad dada de baja." : "Unidad reactivada."
            await load()
        } catch {
            messageIsError = true
            message = error.toUserMessage(fallback: "No se pudo cambiar el alta de la unidad")
        }
    }

    func decide(_ request: OpsVehicleRequest, approve: Bool) async {
        busyId = request.id
        message = nil
        defer { busyId = nil }
        do {
            try await repo.decideRequest(id: request.id, approve: approve, note: nil)
            messageIsError = false
            message = approve ? "Solicitud aprobada." : "Solicitud rechazada."
            await load()
        } catch {
            messageIsError = true
            message = error.toUserMessage(fallback: "No se pudo resolver la solicitud")
        }
    }
}

// MARK: – Subvistas

private struct OpsVehicleAssetCard: View {
    let asset: OpsVehicleAsset
    let canManage: Bool
    let busy: Bool
    let onStatus: (String) -> Void
    let onToggleActive: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(asset.nombre.isEmpty ? "Vehículo \(asset.id)" : asset.nombre)
                        .font(.subheadline.weight(.semibold))
                    if !asset.placas.isEmpty {
                        Text(asset.placas).font(.caption).foregroundColor(.secondary)
                    }
                }
                Spacer()
                Text(asset.estatus.isEmpty ? "—" : asset.estatus)
                    .font(.caption2.bold())
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background((asset.isAssigned ? Color.blue : Color.green).opacity(0.15))
                    .foregroundColor(asset.isAssigned ? .blue : .green)
                    .clipShape(Capsule())
            }

            if !asset.activo {
                Label("Dada de baja", systemImage: "xmark.circle")
                    .font(.caption2).foregroundColor(.red)
            }
            if !asset.notas.isEmpty {
                Text(asset.notas).font(.caption2).foregroundColor(.secondary).lineLimit(2)
            }

            if canManage {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(OpsVehicleFleetRepository.assetStatuses, id: \.self) { st in
                            let active = asset.estatus == st
                            Text(st)
                                .font(.caption2)
                                .padding(.horizontal, 9).padding(.vertical, 5)
                                .background(active ? Color.teal.opacity(0.18) : Color(.tertiarySystemFill))
                                .foregroundColor(active ? .teal : .primary)
                                .clipShape(Capsule())
                                .onTapGesture { if !busy { onStatus(st) } }
                        }
                        Button(asset.activo ? "Dar de baja" : "Reactivar", action: onToggleActive)
                            .font(.caption2)
                            .buttonStyle(.bordered)
                            .disabled(busy)
                    }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct OpsVehicleRequestCard: View {
    let request: OpsVehicleRequest
    let canReview: Bool
    let busy: Bool
    let onDecide: (Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(request.solicitante.isEmpty ? "Solicitud \(request.id)" : request.solicitante)
                        .font(.subheadline.weight(.semibold))
                    if !request.vehiculo.isEmpty {
                        Text(request.vehiculo).font(.caption).foregroundColor(.secondary)
                    }
                }
                Spacer()
                Text(request.estatus.isEmpty ? "Pendiente" : request.estatus)
                    .font(.caption2.bold())
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Color.secondary.opacity(0.15))
                    .clipShape(Capsule())
            }
            if !request.motivo.isEmpty {
                Text(request.motivo).font(.caption).foregroundColor(.secondary).lineLimit(3)
            }
            if !request.fechaInicio.isEmpty || !request.fechaFin.isEmpty {
                Text("\(ActivityParse.fmtIso(request.fechaInicio)) → \(ActivityParse.fmtIso(request.fechaFin))")
                    .font(.caption2).foregroundColor(.secondary)
            }

            if canReview && request.isPending {
                NxDecisionActions(
                    acting: busy,
                    onApprove: { onDecide(true) },
                    onReject: { onDecide(false) }
                )
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

/// Alta de unidad. `nombre` es lo único obligatorio porque es lo único que el
/// API exige; pedir más campos aquí solo conseguiría que nadie diera de alta
/// nada desde el teléfono.
private struct OpsNewVehicleAssetSheet: View {
    let onSave: (String, String, String, String) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var nombre = ""
    @State private var placas = ""
    @State private var estatus = OpsVehicleFleetRepository.assetStatuses[0]
    @State private var notas = ""
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Unidad") {
                    TextField("Nombre (obligatorio)", text: $nombre)
                    TextField("Placas", text: $placas).autocorrectionDisabled()
                    Picker("Estatus", selection: $estatus) {
                        ForEach(OpsVehicleFleetRepository.assetStatuses, id: \.self) { Text($0).tag($0) }
                    }
                }
                Section("Notas") {
                    TextField("Observaciones", text: $notas, axis: .vertical).lineLimit(1...4)
                }
            }
            .navigationTitle("Nueva unidad")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Guardando…" : "Guardar") {
                        Task {
                            saving = true
                            await onSave(nombre.trimmingCharacters(in: .whitespacesAndNewlines),
                                         placas.trimmingCharacters(in: .whitespacesAndNewlines),
                                         estatus,
                                         notas.trimmingCharacters(in: .whitespacesAndNewlines))
                            saving = false
                            dismiss()
                        }
                    }
                    .disabled(saving || nombre.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

private struct OpsFleetChip: View {
    let label: String
    let value: String
    let tone: Color

    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline.bold()).foregroundColor(tone)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
