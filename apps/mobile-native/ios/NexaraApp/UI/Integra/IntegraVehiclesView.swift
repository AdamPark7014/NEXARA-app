import SwiftUI

// Stub models until Data/Integra/Vehicles/ lands.
struct IntegraVehiculoRow: Identifiable, Hashable {
    let id: String
    var placa: String
    var ownerLabel: String?
    var personId: String?
}

enum IntegraVehiclesDataStub {
    static func list() async throws -> [IntegraVehiculoRow] {
        let inv = try await IntegraVehiclesRepository.shared.vehiculos()
        return inv.items.map {
            IntegraVehiculoRow(
                id: $0.id,
                placa: $0.plate,
                ownerLabel: $0.personName,
                personId: $0.personId
            )
        }
    }

    static func upsert(placa: String, personId: String?) async throws {
        let v = PlacaLogic.validarPlaca(placa)
        guard v.valida else { throw NSError(domain: "placa", code: 1, userInfo: [NSLocalizedDescriptionKey: v.error ?? "Placa inválida"]) }
        _ = try await IntegraVehiclesRepository.shared.altaVehiculo(
            placaNormalizada: v.normalizada,
            personId: personId
        )
    }

    static func delete(id: String) async throws {
        _ = try await IntegraVehiclesRepository.shared.borrarVehiculo(vehicleId: id)
    }
}

/// Inventario de placas. Protege el upsert silencioso del servidor detectando duplicados en UI.
struct IntegraVehiclesView: View {
    @State private var items: [IntegraVehiculoRow] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var errorText: String?
    @State private var showForm = false
    @State private var placa = ""
    @State private var message: String?
    @State private var filterOwner: OwnerFilter = .todos

    enum OwnerFilter: String, CaseIterable {
        case todos = "Todos"
        case conDueno = "Con dueño"
        case sinDueno = "Sin dueño"
    }

    private var filtered: [IntegraVehiculoRow] {
        var list = items
        switch filterOwner {
        case .todos: break
        case .conDueno: list = list.filter { ($0.personId ?? "").isEmpty == false }
        case .sinDueno: list = list.filter { ($0.personId ?? "").isEmpty }
        }
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return list }
        return list.filter {
            $0.placa.lowercased().contains(q)
                || ($0.ownerLabel ?? "").lowercased().contains(q)
        }
    }

    private var placaNorm: String {
        placa.uppercased().filter { $0.isLetter || $0.isNumber }
    }

    private var duplicate: IntegraVehiculoRow? {
        guard placaNorm.count >= 3 else { return nil }
        return items.first { $0.placa.uppercased().filter { $0.isLetter || $0.isNumber } == placaNorm }
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Cargando vehículos…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText, items.isEmpty {
                VStack(spacing: 12) {
                    Text(errorText).foregroundStyle(.secondary)
                    Button("Reintentar") { Task { await reload() } }
                }
            } else {
                listBody
            }
        }
        .navigationTitle(IntegraVehiclesRoutes.titleVehicles)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showForm = true; placa = ""; message = nil } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showForm) { formSheet }
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var listBody: some View {
        List {
            Section {
                Text(
                    "El alta del servidor es un upsert sobre la placa normalizada. "
                        + "Si «ABC-123» ya existe como «ABC 123», guardar pisa la ficha "
                        + "anterior en silencio. Aquí se detecta antes y se bloquea."
                )
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Section {
                TextField("Buscar placa o dueño…", text: $query)
                Picker("Dueño", selection: $filterOwner) {
                    ForEach(OwnerFilter.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            if let message {
                Section { Text(message).foregroundStyle(NxTone.success.fg) }
            }
            if filtered.isEmpty {
                Section {
                    NxEmptyState(
                        title: "Sin vehículos",
                        subtitle: items.isEmpty
                            ? "Todavía no hay placas en el inventario."
                            : "Ninguna placa coincide con el filtro."
                    )
                }
            } else {
                Section("\(filtered.count) placas") {
                    ForEach(filtered) { v in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(v.placa).font(.headline.monospaced())
                            Text(v.ownerLabel ?? "Sin dueño")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .onDelete { idx in
                        let doomed = idx.map { filtered[$0] }
                        Task {
                            for v in doomed {
                                try? await IntegraVehiclesDataStub.delete(id: v.id)
                            }
                            await reload()
                        }
                    }
                }
            }
        }
    }

    private var formSheet: some View {
        NavigationStack {
            Form {
                TextField("Placa", text: $placa)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                if let duplicate {
                    Text("Ya existe «\(duplicate.placa)». Guardar la pisaría (upsert silencioso).")
                        .font(.caption)
                        .foregroundStyle(NxTone.danger.fg)
                } else if placaNorm.count < 3 && !placa.isEmpty {
                    Text("La placa normalizada debe tener al menos 3 caracteres.")
                        .font(.caption)
                        .foregroundStyle(NxTone.warning.fg)
                }
            }
            .navigationTitle("Alta de placa")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { showForm = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        Task {
                            do {
                                try await IntegraVehiclesDataStub.upsert(placa: placa, personId: nil)
                                showForm = false
                                message = "Placa guardada"
                                await reload()
                            } catch {
                                message = error.localizedDescription
                            }
                        }
                    }
                    .disabled(duplicate != nil || placaNorm.count < 3)
                }
            }
        }
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do {
            items = try await IntegraVehiclesDataStub.list()
        } catch {
            errorText = error.localizedDescription
        }
    }
}
