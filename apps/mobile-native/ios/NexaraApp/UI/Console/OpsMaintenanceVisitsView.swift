import SwiftUI

/// Visitas de contrato de mantenimiento — el lado operativo de
/// `maintenance-contracts`: qué visitas tocan, cuáles ya tienen OT y cuáles
/// siguen abiertas después de su fecha.
///
/// Paridad: `ExtraApi.kt` de Android (getMaintenanceContractVisitsRaw,
/// generateMaintenanceVisitOt, completeMaintenanceVisit, getMaintenanceContract,
/// setMaintenanceContractStatus).
///
/// Por qué una pantalla nueva y no ampliar `MaintenanceContractsView`: ese
/// fichero (`ErpPlatformViews.swift`) es de otro agente y editarlo en paralelo
/// se pierde en el siguiente merge.
struct OpsMaintenanceVisitsView: View {
    /// Si viene un contrato, la pantalla se abre filtrada por él y enseña además
    /// su ficha y el control de estado.
    var contractId: Int64? = nil

    @StateObject private var vm = OpsMaintenanceVisitsVM()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let msg = vm.message {
                    Text(msg)
                        .font(.caption)
                        .foregroundColor(vm.messageIsError ? .red : .green)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background((vm.messageIsError ? Color.red : Color.green).opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                if vm.contract != nil { contractCard }

                statusFilter

                if vm.loading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.visits.isEmpty {
                    NxEmptyState(
                        title: "Sin visitas",
                        subtitle: vm.statusFilterValue.isEmpty
                            ? "Este contrato no tiene visitas programadas."
                            : "No hay visitas en ese estado.",
                        actionLabel: "Actualizar",
                        onAction: { Task { await vm.load(contractId: contractId) } }
                    )
                } else {
                    summaryStrip
                    ForEach(vm.visits) { visit in
                        OpsVisitCard(
                            visit: visit,
                            busy: vm.busyVisitId == visit.id,
                            canManage: vm.canManage,
                            onGenerate: { Task { await vm.generateOt(visit) } },
                            onComplete: { Task { await vm.complete(visit) } }
                        )
                    }
                }
                Spacer(minLength: 24)
            }
            .padding(14)
        }
        .navigationTitle("Visitas de contrato")
        .refreshable { await vm.load(contractId: contractId) }
        .task { await vm.load(contractId: contractId) }
        .confirmationDialog(
            "Cambiar estado del contrato",
            isPresented: $vm.showStatusDialog,
            titleVisibility: .visible
        ) {
            ForEach(OpsMaintenanceContractRepository.contractStatuses, id: \.self) { st in
                Button(OpsMaintenanceContractRepository.contractStatusLabel(st)) {
                    Task { await vm.setStatus(st) }
                }
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Pausar o cancelar detiene la generación automática de visitas.")
        }
    }

    // MARK: – Ficha del contrato

    @ViewBuilder
    private var contractCard: some View {
        if let c = vm.contract {
            VStack(alignment: .leading, spacing: 6) {
                Text(c.displayTitle).font(.headline)
                if !c.clientName.isEmpty {
                    Text(c.clientName).font(.subheadline).foregroundColor(.secondary)
                }
                HStack(spacing: 8) {
                    Text(OpsMaintenanceContractRepository.contractStatusLabel(c.status))
                        .font(.caption2.bold())
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(c.status.uppercased() == "ACTIVE"
                                    ? Color.green.opacity(0.15) : Color.orange.opacity(0.15))
                        .foregroundColor(c.status.uppercased() == "ACTIVE" ? .green : .orange)
                        .clipShape(Capsule())
                    if !c.frequency.isEmpty {
                        Text(c.frequency).font(.caption2).foregroundColor(.secondary)
                    }
                    if let sla = c.slaResponseHours {
                        Text("SLA \(sla) h").font(.caption2).foregroundColor(.secondary)
                    }
                }
                if !c.startDate.isEmpty || !c.endDate.isEmpty {
                    Text("Vigencia: \(String(c.startDate.prefix(10))) → \(String(c.endDate.prefix(10)))")
                        .font(.caption2).foregroundColor(.secondary)
                }
                if vm.canManage {
                    Button("Cambiar estado") { vm.showStatusDialog = true }
                        .font(.caption)
                        .buttonStyle(.bordered)
                        .disabled(vm.savingStatus)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    // MARK: – Filtro

    private var statusFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(OpsMaintenanceVisitsVM.filters, id: \.value) { f in
                    let active = vm.statusFilterValue == f.value
                    Text(f.label)
                        .font(.caption)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(active ? Color.teal.opacity(0.18) : Color(.tertiarySystemFill))
                        .foregroundColor(active ? .teal : .primary)
                        .clipShape(Capsule())
                        .onTapGesture {
                            Task { await vm.setFilter(f.value, contractId: contractId) }
                        }
                }
            }
        }
    }

    private var summaryStrip: some View {
        let pendientes = vm.visits.filter { !$0.isCompleted }.count
        let sinOt = vm.visits.filter { !$0.hasWorkOrder && !$0.isCompleted }.count
        let vencidas = vm.visits.filter(\.isOverdue).count
        return HStack(spacing: 0) {
            OpsVisitChip(label: "Pendientes", value: "\(pendientes)", tone: .primary)
            Divider().frame(height: 34)
            OpsVisitChip(label: "Sin OT", value: "\(sinOt)", tone: sinOt > 0 ? .orange : .secondary)
            Divider().frame(height: 34)
            OpsVisitChip(label: "Vencidas", value: "\(vencidas)", tone: vencidas > 0 ? .red : .secondary)
        }
        .padding(.vertical, 8)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: – ViewModel

@MainActor
final class OpsMaintenanceVisitsVM: ObservableObject {
    struct Filter { let label: String; let value: String }

    static let filters = [
        Filter(label: "Todas", value: ""),
        Filter(label: "Programadas", value: "SCHEDULED"),
        Filter(label: "Con OT", value: "GENERATED"),
        Filter(label: "Completadas", value: "COMPLETED"),
    ]

    @Published var visits: [MaintenanceVisit] = []
    @Published var contract: MaintenanceContract?
    @Published var statusFilterValue = ""
    @Published var loading = true
    @Published var savingStatus = false
    @Published var showStatusDialog = false
    @Published var busyVisitId: Int64?
    @Published var message: String?
    @Published var messageIsError = false

    private let repo = OpsMaintenanceContractRepository.shared

    /// Generar OT, cerrar visita y cambiar estado del contrato exigen permiso de
    /// gestión de mantenimiento en el API. Sin él la pantalla es un tablero de
    /// lectura, que sigue siendo útil para saber qué toca esta semana.
    var canManage: Bool {
        guard let u = SessionStore.shared.currentUser else { return false }
        return u.isSuperAdmin
            || u.permissions.contains("maintenance.manage")
            || u.permissions.contains("console.admin")
    }

    func load(contractId: Int64?) async {
        loading = true
        defer { loading = false }
        visits = (try? await repo.visits(
            contractId: contractId,
            status: statusFilterValue.isEmpty ? nil : statusFilterValue
        )) ?? []
        if let contractId, contractId > 0 {
            contract = try? await repo.contract(id: contractId)
        }
    }

    func setFilter(_ value: String, contractId: Int64?) async {
        statusFilterValue = value
        await load(contractId: contractId)
    }

    func generateOt(_ visit: MaintenanceVisit) async {
        busyVisitId = visit.id
        message = nil
        defer { busyVisitId = nil }
        do {
            _ = try await repo.generateWorkOrder(visitId: visit.id)
            messageIsError = false
            message = "OT generada para la visita del \(visit.dateLabel)."
            await load(contractId: visit.contractId > 0 ? visit.contractId : nil)
        } catch {
            messageIsError = true
            message = error.toUserMessage(fallback: "No se pudo generar la OT")
        }
    }

    func complete(_ visit: MaintenanceVisit) async {
        busyVisitId = visit.id
        message = nil
        defer { busyVisitId = nil }
        do {
            _ = try await repo.completeVisit(visitId: visit.id)
            messageIsError = false
            // Se avisa del efecto secundario: el backend programa la siguiente
            // visita, así que la lista cambia por más de una fila.
            message = "Visita cerrada. El contrato ya programó la siguiente."
            await load(contractId: visit.contractId > 0 ? visit.contractId : nil)
        } catch {
            messageIsError = true
            message = error.toUserMessage(fallback: "No se pudo cerrar la visita")
        }
    }

    func setStatus(_ status: String) async {
        guard let id = contract?.id, id > 0 else { return }
        savingStatus = true
        message = nil
        defer { savingStatus = false }
        do {
            contract = try await repo.setContractStatus(id: id, status: status)
            messageIsError = false
            message = "Contrato en estado \(OpsMaintenanceContractRepository.contractStatusLabel(status))."
        } catch {
            messageIsError = true
            message = error.toUserMessage(fallback: "No se pudo cambiar el estado del contrato")
        }
    }
}

// MARK: – Subvistas

private struct OpsVisitCard: View {
    let visit: MaintenanceVisit
    let busy: Bool
    let canManage: Bool
    let onGenerate: () -> Void
    let onComplete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(visit.dateLabel)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(visit.isOverdue ? .red : .primary)
                    let head = [visit.contractNumber, visit.contractTitle]
                        .filter { !$0.isEmpty }.joined(separator: " · ")
                    if !head.isEmpty {
                        Text(head).font(.caption).foregroundColor(.secondary).lineLimit(2)
                    }
                }
                Spacer()
                Text(visit.statusLabel)
                    .font(.caption2.bold())
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(tone.opacity(0.15))
                    .foregroundColor(tone)
                    .clipShape(Capsule())
            }

            let place = [visit.clientName, visit.branchName].filter { !$0.isEmpty }.joined(separator: " · ")
            if !place.isEmpty {
                Text(place).font(.caption).foregroundColor(.secondary)
            }
            if !visit.assignedTo.isEmpty {
                Text("Asignada a \(visit.assignedTo)").font(.caption2).foregroundColor(.secondary)
            }
            if !visit.notes.isEmpty {
                Text(visit.notes).font(.caption2).foregroundColor(.secondary).lineLimit(2)
            }
            if visit.isOverdue {
                Label("Fecha vencida sin cerrar", systemImage: "exclamationmark.triangle.fill")
                    .font(.caption2).foregroundColor(.red)
            }

            if canManage && !visit.isCompleted {
                HStack(spacing: 8) {
                    if !visit.hasWorkOrder {
                        Button(action: onGenerate) {
                            Label("Generar OT", systemImage: "wrench.and.screwdriver")
                                .font(.caption)
                        }
                        .buttonStyle(.bordered)
                        .disabled(busy)
                    }
                    Button(action: onComplete) {
                        Label("Cerrar visita", systemImage: "checkmark.circle")
                            .font(.caption)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .disabled(busy)
                }
                if !visit.hasWorkOrder {
                    // Se dice antes de pulsar: cerrar sin OT no es un atajo, el
                    // backend la crea igualmente.
                    Text("Cerrar sin OT genera una automáticamente.")
                        .font(.caption2).foregroundColor(.secondary)
                }
            } else if visit.isCompleted && !visit.completedAt.isEmpty {
                Text("Cerrada el \(ActivityParse.fmtIso(visit.completedAt))")
                    .font(.caption2).foregroundColor(.secondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var tone: Color {
        if visit.isCompleted { return .green }
        if visit.isOverdue { return .red }
        return visit.hasWorkOrder ? .blue : .orange
    }
}

private struct OpsVisitChip: View {
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
