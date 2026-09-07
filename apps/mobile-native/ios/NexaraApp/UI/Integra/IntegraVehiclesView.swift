import SwiftUI

/// Inventario de placas. Protege el upsert silencioso del servidor detectando duplicados en UI.
struct IntegraVehiclesView: View {
    @State private var items: [IntegraVehiculo] = []
    @State private var personas: [IntegraPersonaResumen] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var errorText: String?
    @State private var showForm = false
    @State private var editingId: String?
    @State private var placa = ""
    @State private var personId = ""
    @State private var message: String?
    @State private var formError: String?
    @State private var filterOwner: FiltroDueno = .todas

    private var filtered: [IntegraVehiculo] {
        PlacaLogic.filtrarVehiculos(items, filtros: FiltrosVehiculos(q: query, dueno: filterOwner))
    }

    private var validacion: ValidacionPlaca {
        PlacaLogic.validarPlaca(placa)
    }

    private var duplicate: IntegraVehiculo? {
        PlacaLogic.placaDuplicada(placa, vehiculos: items, exceptoId: editingId)
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
                Button {
                    editingId = nil
                    placa = ""
                    personId = ""
                    formError = nil
                    message = nil
                    showForm = true
                } label: {
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
                    Text("Todos").tag(FiltroDueno.todas)
                    Text("Con dueño").tag(FiltroDueno.con)
                    Text("Sin dueño").tag(FiltroDueno.sin)
                }
                .pickerStyle(.segmented)
                let sin = PlacaLogic.contarSinDueno(items)
                if sin > 0 {
                    Text("\(sin) sin dueño")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
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
                    ForEach(filtered, id: \.id) { v in
                        Button {
                            editingId = v.id
                            placa = v.plate
                            personId = v.personId ?? ""
                            formError = nil
                            showForm = true
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(v.plate).font(.headline.monospaced())
                                Text(ownerLabel(v))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .onDelete { idx in
                        let doomed = idx.map { filtered[$0] }
                        Task {
                            for v in doomed {
                                _ = try? await IntegraVehiclesRepository.shared.borrarVehiculo(vehicleId: v.id)
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
                Picker("Dueño", selection: $personId) {
                    Text("Sin dueño").tag("")
                    ForEach(personas, id: \.id) { p in
                        Text(PlacaLogic.etiquetaPersona(p)).tag(p.id)
                    }
                }
                if let duplicate {
                    Text(PlacaLogic.avisoDuplicado(duplicate))
                        .font(.caption)
                        .foregroundStyle(NxTone.danger.fg)
                } else if !validacion.valida, !placa.isEmpty {
                    Text(validacion.error ?? "Placa inválida")
                        .font(.caption)
                        .foregroundStyle(NxTone.warning.fg)
                } else if let aviso = validacion.aviso {
                    Text(aviso).font(.caption).foregroundStyle(NxTone.warning.fg)
                }
                if let formError {
                    Text(formError).font(.caption).foregroundStyle(NxTone.danger.fg)
                }
            }
            .navigationTitle(editingId == nil ? "Alta de placa" : "Editar placa")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { showForm = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { Task { await save() } }
                        .disabled(duplicate != nil || !validacion.valida)
                }
            }
        }
    }

    private func ownerLabel(_ v: IntegraVehiculo) -> String {
        switch PlacaLogic.resolverDueno(v, personas: personas) {
        case .conocido(_, let nombre, _): return nombre
        case .ausente(_, let nombre): return nombre ?? "Dueño ausente del padrón"
        case .sinDueno: return "Sin dueño"
        }
    }

    private func save() async {
        formError = nil
        let v = PlacaLogic.validarPlaca(placa)
        guard v.valida else {
            formError = v.error
            return
        }
        if let duplicate {
            formError = PlacaLogic.avisoDuplicado(duplicate)
            return
        }
        let pid = personId.isEmpty ? nil : personId
        do {
            if let editingId {
                _ = try await IntegraVehiclesRepository.shared.editarVehiculo(
                    vehicleId: editingId,
                    placaNormalizada: v.normalizada,
                    personId: pid
                )
                message = "Placa actualizada"
            } else {
                _ = try await IntegraVehiclesRepository.shared.altaVehiculo(
                    placaNormalizada: v.normalizada,
                    personId: pid
                )
                message = "Placa guardada"
            }
            showForm = false
            await reload()
        } catch {
            let d = IntegraVehiclesRepository.diagnosticar(error, fallback: "No se pudo guardar")
            formError = d.mensaje
        }
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do {
            async let inv = IntegraVehiclesRepository.shared.vehiculos()
            async let people = IntegraVehiclesRepository.shared.personas()
            items = try await inv.items
            personas = (try? await people) ?? []
        } catch {
            let d = IntegraVehiclesRepository.diagnosticar(error, fallback: "No se pudieron cargar vehículos")
            errorText = d.mensaje
        }
    }
}
