import SwiftUI

/// Reasignación de una OT y su historial.
/// Paridad con `ConsoleDispatchScreen.kt` (Android) más el historial que allí
/// vive dentro del detalle.
///
/// Va en hoja modal y no en una pestaña porque reasignar es una acción puntual
/// con consecuencias: cambia de quién es el trabajo. Que exija abrir algo y
/// confirmar es deliberado.
struct OpsActivityReassignView: View {
    let activityId: Int64
    let currentResponsable: String
    /// El API exige `activities.manage` para reasignar. Sin ese permiso la hoja
    /// enseña solo el historial, que sí es visible con `activities.view`.
    let canManage: Bool
    var onReassigned: () -> Void = {}

    @Environment(\.dismiss) private var dismiss
    @StateObject private var vm = OpsReassignVM()

    var body: some View {
        NavigationStack {
            Form {
                Section("Responsable actual") {
                    Text(currentResponsable.isEmpty ? "Sin asignar" : currentResponsable)
                        .foregroundColor(currentResponsable.isEmpty ? .secondary : .primary)
                }

                if canManage {
                    Section("Reasignar a") {
                        if vm.loadingUsers {
                            HStack { ProgressView(); Text("Cargando usuarios…").foregroundColor(.secondary) }
                        } else if vm.users.isEmpty {
                            Text("No hay usuarios asignables disponibles.")
                                .font(.caption).foregroundColor(.secondary)
                        } else {
                            Picker("Técnico", selection: $vm.selectedUserId) {
                                Text("Elige a quién").tag(Int64(0))
                                ForEach(vm.users) { u in
                                    Text(u.name).tag(u.id)
                                }
                            }
                            TextField("Motivo (queda en el historial)", text: $vm.motivo, axis: .vertical)
                                .lineLimit(1...3)
                            Toggle("Retirar al anterior del equipo", isOn: $vm.retirarAnterior)
                        }
                    }

                    if let err = vm.error {
                        Section {
                            Text(err).font(.caption).foregroundColor(.red)
                        }
                    }

                    Section {
                        Button {
                            Task {
                                await vm.reassign(activityId: activityId)
                                if vm.didSucceed {
                                    onReassigned()
                                    dismiss()
                                }
                            }
                        } label: {
                            Text(vm.saving ? "Reasignando…" : "Reasignar OT")
                                .frame(maxWidth: .infinity)
                        }
                        .disabled(vm.saving || vm.selectedUserId <= 0)
                    }
                } else {
                    Section {
                        Text("Solo lectura: no tienes permiso para reasignar esta OT.")
                            .font(.caption).foregroundColor(.secondary)
                    }
                }

                Section("Historial de reasignaciones") {
                    if vm.loadingHistory {
                        HStack { ProgressView(); Text("Cargando…").foregroundColor(.secondary) }
                    } else if vm.history.isEmpty {
                        Text("Esta OT no se ha reasignado nunca.")
                            .font(.caption).foregroundColor(.secondary)
                    } else {
                        ForEach(vm.history) { row in
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(row.deUsuario.isEmpty ? "Sin asignar" : row.deUsuario) → \(row.aUsuario.isEmpty ? "—" : row.aUsuario)")
                                    .font(.subheadline.weight(.medium))
                                if !row.motivo.isEmpty {
                                    Text(row.motivo).font(.caption).foregroundColor(.secondary)
                                }
                                let meta = [
                                    row.porUsuario.isEmpty ? nil : "por \(row.porUsuario)",
                                    row.createdAt.isEmpty ? nil : ActivityParse.fmtIso(row.createdAt),
                                ].compactMap { $0 }.joined(separator: " · ")
                                if !meta.isEmpty {
                                    Text(meta).font(.caption2).foregroundColor(.secondary)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
            }
            .navigationTitle("Reasignar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                }
            }
            .task { await vm.load(activityId: activityId, canManage: canManage) }
        }
    }
}

/// Usuario asignable, aplanado del mapa que devuelve `users/assignable`.
struct OpsAssignableUser: Identifiable, Hashable {
    let id: Int64
    let name: String
}

@MainActor
final class OpsReassignVM: ObservableObject {
    @Published var users: [OpsAssignableUser] = []
    @Published var history: [ActivityReassignment] = []
    @Published var selectedUserId: Int64 = 0
    @Published var motivo = ""
    /// Por defecto el anterior sale del equipo: es lo que espera despacho cuando
    /// dice "pásasela a otro". Dejarlo dentro se pide a mano.
    @Published var retirarAnterior = true
    @Published var loadingUsers = false
    @Published var loadingHistory = true
    @Published var saving = false
    @Published var error: String?
    @Published var didSucceed = false

    private let repo = FieldOpsActivityRepository.shared

    func load(activityId: Int64, canManage: Bool) async {
        loadingHistory = true
        history = (try? await repo.reassignments(activityId: activityId)) ?? []
        loadingHistory = false

        // La lista de usuarios solo se pide si se va a poder usar: para quien
        // solo mira el historial es una llamada de más que además puede dar 403.
        guard canManage else { return }
        loadingUsers = true
        let raw = (try? await ConsoleRepository.shared.users(preferAssignable: true)) ?? []
        users = raw.compactMap { m in
            guard let id = ConsoleHelpers.mapInt64(m, "id"), id > 0 else { return nil }
            let name = ConsoleHelpers.mapStr(m, "nombre", "name", "email")
            return OpsAssignableUser(id: id, name: name.isEmpty ? "Usuario \(id)" : name)
        }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        loadingUsers = false
    }

    func reassign(activityId: Int64) async {
        guard selectedUserId > 0 else { return }
        saving = true
        error = nil
        didSucceed = false
        defer { saving = false }
        do {
            try await repo.reassign(
                activityId: activityId,
                toUserId: selectedUserId,
                motivo: motivo.trimmingCharacters(in: .whitespacesAndNewlines),
                retirarAnterior: retirarAnterior
            )
            didSucceed = true
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo reasignar la OT")
        }
    }
}
