import SwiftUI

struct IntegraScheduleDoor: Identifiable, Hashable {
    let id: String
    var name: String
    var templateName: String?
}

struct IntegraSchedulePerson: Identifiable, Hashable {
    let id: String
    var name: String
    var validFrom: String?
    var validTo: String?
}

enum IntegraSchedulesDataStub {
    static func doors() async throws -> [IntegraScheduleDoor] {
        let cat = try await IntegraSchedulesRepository.shared.catalog()
        let list = IntegraJSON.itemsOf(cat)
            + (IntegraJSON.asMapList(cat["doors"]) ?? [])
        return list.compactMap { m in
            guard let id = m.integraStr("id", "doorId", "doorIndexCode") else { return nil }
            return IntegraScheduleDoor(
                id: id,
                name: m.integraStr("name", "doorName") ?? id,
                templateName: m.integraStr("templateName", "templateKey")
            )
        }
    }

    static func people() async throws -> [IntegraSchedulePerson] {
        let rows = try await IntegraSchedulesRepository.shared.peopleBrief()
        return rows.compactMap { m in
            guard let id = m.integraStr("id", "personId") else { return nil }
            return IntegraSchedulePerson(
                id: id,
                name: m.integraStr("name", "personName") ?? id,
                validFrom: m.integraStr("validFrom", "beginTime"),
                validTo: m.integraStr("validTo", "endTime")
            )
        }
    }
}

enum SchedulesTab: String, CaseIterable {
    case person = "Por persona"
    case door = "Por puerta"
}

/// Horarios ACS. Horas = reloj de pared del terminal (no TZ convert).
struct IntegraSchedulesView: View {
    var initialDoorId: String? = nil

    @State private var tab: SchedulesTab = .person
    @State private var doors: [IntegraScheduleDoor] = []
    @State private var people: [IntegraSchedulePerson] = []
    @State private var selectedDoorId: String?
    @State private var query = ""
    @State private var isLoading = true
    @State private var errorText: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Cargando horarios ACS…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText, doors.isEmpty && people.isEmpty {
                VStack(spacing: 12) {
                    Text(errorText).foregroundStyle(.secondary)
                    Button("Reintentar") { Task { await reload() } }
                }
            } else {
                VStack(spacing: 0) {
                    Picker("Vista", selection: $tab) {
                        ForEach(SchedulesTab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .padding(12)

                    Text(
                        "Todas las horas son reloj de pared del terminal ACS: no se convierten de zona."
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)

                    if tab == .person {
                        peopleList
                    } else {
                        doorsList
                    }
                }
            }
        }
        .navigationTitle(SchedulesRoutes.titleSchedules)
        .task {
            await reload()
            if let door = SchedulesRoutes.decodeDoorId(initialDoorId) {
                tab = .door
                selectedDoorId = door
            }
        }
        .refreshable { await reload() }
    }

    private var peopleList: some View {
        List {
            TextField("Buscar persona…", text: $query)
            let q = query.lowercased()
            let rows = q.isEmpty
                ? people
                : people.filter { $0.name.lowercased().contains(q) }
            if rows.isEmpty {
                Text("Sin personas en el catálogo ACS.").foregroundStyle(.secondary)
            } else {
                ForEach(rows) { p in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(p.name).font(.headline)
                        Text(vigencia(p)).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var doorsList: some View {
        List {
            if doors.isEmpty {
                Text("Sin puertas en el catálogo.").foregroundStyle(.secondary)
            } else {
                ForEach(doors) { d in
                    Button {
                        selectedDoorId = d.id
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(d.name).font(.headline)
                                Text(d.templateName ?? "Sin plantilla")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if selectedDoorId == d.id {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(.teal)
                            }
                        }
                    }
                }
            }
            if let selectedDoorId, let door = doors.first(where: { $0.id == selectedDoorId }) {
                Section("Puerta seleccionada") {
                    Text(door.name)
                    Text("Edición de plantilla/presets: cablear IntegraSchedulesRepository (Data/Integra/Schedules).")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func vigencia(_ p: IntegraSchedulePerson) -> String {
        let from = p.validFrom ?? "—"
        let to = p.validTo ?? "—"
        return "Vigencia \(from) → \(to)"
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do {
            async let d = IntegraSchedulesDataStub.doors()
            async let p = IntegraSchedulesDataStub.people()
            doors = try await d
            people = try await p
        } catch {
            errorText = error.localizedDescription
        }
    }
}
