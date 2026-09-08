import SwiftUI

private let acsDefaultBegin = "2020-01-01T00:00:00"
private let acsIndefiniteEnd = "2037-12-31T23:59:59"

struct IntegraScheduleDoor: Identifiable, Hashable {
    let id: String
    var name: String
    var deviceIp: String
    var doorNo: Int
    var online: Bool?
}

struct IntegraScheduleTemplate: Identifiable, Hashable {
    let id: String
    var name: String
    var weekPlanNo: Int?
    var days: [ScheduleDayPlan]
}

struct IntegraSchedulePerson: Identifiable, Hashable {
    let id: String
    var name: String
    var code: String?
}

struct IntegraDoorPlanRow: Identifiable, Hashable {
    var id: String { doorId }
    let doorId: String
    var doorName: String
    var deviceIp: String
    var doorNo: Int
    var planTemplateNo: String
    var hasAccess: Bool
}

struct IntegraDoorAccessPerson: Identifiable, Hashable {
    let id: String
    var name: String
    var templateName: String?
    var validLabel: String?
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
    @State private var templates: [IntegraScheduleTemplate] = []
    @State private var people: [IntegraSchedulePerson] = []
    @State private var selectedDoorId: String?
    @State private var selectedPersonId: String?
    @State private var doorAccess: [IntegraDoorAccessPerson] = []
    @State private var doorPlans: [IntegraDoorPlanRow] = []
    @State private var personName = ""
    @State private var validMode = "indefinite" // disabled | indefinite | window
    @State private var validFrom = acsDefaultBegin
    @State private var validTo = acsIndefiniteEnd
    @State private var query = ""
    @State private var isLoading = true
    @State private var personLoading = false
    @State private var doorLoading = false
    @State private var saving = false
    @State private var errorText: String?
    @State private var message: String?

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
                        if selectedPersonId == nil {
                            peopleList
                        } else {
                            personEditor
                        }
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
                await loadDoor(door)
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
                : people.filter {
                    $0.name.lowercased().contains(q)
                        || ($0.code ?? "").lowercased().contains(q)
                }
            if rows.isEmpty {
                Text("Sin personas en el catálogo ACS.").foregroundStyle(.secondary)
            } else {
                ForEach(rows) { p in
                    Button {
                        Task { await selectPerson(p.id) }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(p.name).font(.headline)
                            if let code = p.code {
                                Text(code).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
    }

    private var personEditor: some View {
        Form {
            if personLoading {
                ProgressView("Leyendo horario…")
            } else {
                Section {
                    Text(personName).font(.headline)
                    Button("Cambiar de persona") {
                        selectedPersonId = nil
                        doorPlans = []
                        message = nil
                    }
                }
                Section("Vigencia (reloj de pared ACS)") {
                    Picker("Modo", selection: $validMode) {
                        Text("Indefinida").tag("indefinite")
                        Text("Ventana").tag("window")
                        Text("Deshabilitada").tag("disabled")
                    }
                    if validMode == "window" {
                        TextField("Desde (AAAA-MM-DDTHH:MM:SS)", text: $validFrom)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        TextField("Hasta (AAAA-MM-DDTHH:MM:SS)", text: $validTo)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                }
                Section("Puertas") {
                    ForEach($doorPlans) { $plan in
                        VStack(alignment: .leading, spacing: 6) {
                            Toggle(plan.doorName, isOn: $plan.hasAccess)
                            if plan.hasAccess {
                                Picker("Plantilla", selection: $plan.planTemplateNo) {
                                    ForEach(templates) { t in
                                        Text(t.name).tag(t.id)
                                    }
                                }
                                if let tpl = templates.first(where: { $0.id == plan.planTemplateNo }) {
                                    ScheduleWeekGrid(
                                        templateId: tpl.id,
                                        templateName: tpl.name,
                                        weekPlanNo: tpl.weekPlanNo,
                                        days: tpl.days
                                    )
                                    .padding(.top, 4)
                                }
                            }
                        }
                    }
                }
                if let message {
                    Section { Text(message).foregroundStyle(NxTone.success.fg) }
                }
                if let errorText {
                    Section { Text(errorText).foregroundStyle(NxTone.danger.fg) }
                }
                Section {
                    Button(saving ? "Guardando…" : "Guardar horario") {
                        Task { await savePerson() }
                    }
                    .disabled(saving)
                } footer: {
                    Text("Se empuja a los terminales. beginTime/endTime van literales al ACS.")
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
                        Task { await loadDoor(d.id) }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(d.name).font(.headline)
                                Text(d.id).font(.caption2.monospaced()).foregroundStyle(.secondary)
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
                Section("Quién abre «\(door.name)»") {
                    if doorLoading {
                        ProgressView()
                    } else if doorAccess.isEmpty {
                        Text("Nadie con acceso en el espejo, o la puerta no respondió.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(doorAccess) { p in
                            Button {
                                tab = .person
                                Task { await selectPerson(p.id) }
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.name).font(.subheadline.weight(.semibold))
                                    Text([p.templateName, p.validLabel].compactMap { $0 }.joined(separator: " · "))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do {
            async let catTask = IntegraSchedulesRepository.shared.catalog()
            async let peopleTask = IntegraSchedulesRepository.shared.peopleBrief()
            let cat = try await catTask
            let peopleRows = try await peopleTask

            doors = (IntegraJSON.asMapList(cat["doors"]) ?? []).compactMap { m in
                guard let id = m.integraStr("id", "doorIndexCode") else { return nil }
                return IntegraScheduleDoor(
                    id: id,
                    name: m.integraStr("name", "doorName") ?? id,
                    deviceIp: m.integraStr("deviceIp") ?? id.split(separator: "|").first.map(String.init) ?? id,
                    doorNo: m.integraInt("doorNo") ?? Int(id.split(separator: "|").last.map(String.init) ?? "") ?? 1,
                    online: m.integraBool("online")
                )
            }

            let daysByPlan = ScheduleWeekCatalog.daysByWeekPlan(from: cat)
            let weekPlanByTpl = ScheduleWeekCatalog.weekPlanNoByTemplate(from: cat)

            var tpls = (IntegraJSON.asMapList(cat["templates"]) ?? []).compactMap { m -> IntegraScheduleTemplate? in
                guard let id = m.integraStr("id", "planTemplateNo") else { return nil }
                let weekPlanNo = m.integraInt("weekPlanNo") ?? weekPlanByTpl[id]
                let days = weekPlanNo.flatMap { daysByPlan[$0] }
                    ?? Int(id).flatMap { daysByPlan[$0] }
                    ?? []
                return IntegraScheduleTemplate(
                    id: id,
                    name: m.integraStr("templateName", "name") ?? "Plantilla \(id)",
                    weekPlanNo: weekPlanNo,
                    days: days
                )
            }
            if !tpls.contains(where: { $0.id == "0" }) {
                tpls.insert(
                    IntegraScheduleTemplate(id: "0", name: "Sin acceso", weekPlanNo: nil, days: []),
                    at: 0
                )
            }
            templates = tpls

            people = peopleRows.compactMap { m in
                guard let id = m.integraStr("id", "personId") else { return nil }
                return IntegraSchedulePerson(
                    id: id,
                    name: m.integraStr("name", "personName") ?? id,
                    code: m.integraStr("code", "personCode")
                )
            }
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func selectPerson(_ personId: String) async {
        selectedPersonId = personId
        personLoading = true
        message = nil
        errorText = nil
        defer { personLoading = false }
        do {
            let raw = try await IntegraSchedulesRepository.shared.personSchedule(personId: personId)
            personName = raw.integraStr("name", "personName")
                ?? people.first { $0.id == personId }?.name
                ?? personId
            let valid = IntegraJSON.asMap(raw["valid"]) ?? raw
            let enabled = valid.integraBool("enable", "validEnable") ?? true
            let begin = valid.integraStr("beginTime", "validFrom") ?? acsDefaultBegin
            let end = valid.integraStr("endTime", "validTo") ?? acsIndefiniteEnd
            if !enabled {
                validMode = "disabled"
            } else if end.hasPrefix("2037") {
                validMode = "indefinite"
            } else {
                validMode = "window"
            }
            validFrom = begin
            validTo = end

            let plans = IntegraJSON.asMapList(raw["doorPlans"]) ?? []
            if plans.isEmpty {
                doorPlans = doors.map { d in
                    IntegraDoorPlanRow(
                        doorId: d.id,
                        doorName: d.name,
                        deviceIp: d.deviceIp,
                        doorNo: d.doorNo,
                        planTemplateNo: templates.first(where: { $0.id != "0" })?.id ?? "1",
                        hasAccess: false
                    )
                }
            } else {
                doorPlans = plans.compactMap { m in
                    let doorId = m.integraStr("doorId", "doorIndexCode")
                        ?? {
                            let ip = m.integraStr("deviceIp") ?? ""
                            let no = m.integraInt("doorNo") ?? 1
                            return ip.isEmpty ? nil : "\(ip)|\(no)"
                        }()
                    guard let doorId else { return nil }
                    let door = doors.first { $0.id == doorId }
                    let disable = m.integraBool("disable") ?? false
                    return IntegraDoorPlanRow(
                        doorId: doorId,
                        doorName: door?.name ?? m.integraStr("doorName") ?? doorId,
                        deviceIp: m.integraStr("deviceIp") ?? door?.deviceIp ?? doorId.split(separator: "|").first.map(String.init) ?? "",
                        doorNo: m.integraInt("doorNo") ?? door?.doorNo ?? 1,
                        planTemplateNo: m.integraStr("planTemplateNo") ?? "1",
                        hasAccess: !disable
                    )
                }
            }
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func savePerson() async {
        guard let personId = selectedPersonId else { return }
        saving = true
        message = nil
        errorText = nil
        defer { saving = false }
        let begin: String
        let end: String
        switch validMode {
        case "disabled":
            begin = validFrom.isEmpty ? acsDefaultBegin : validFrom
            end = validTo.isEmpty ? acsIndefiniteEnd : validTo
        case "window":
            begin = validFrom
            end = validTo
            if begin.isEmpty || end.isEmpty {
                errorText = "Revisa Desde/Hasta. Usa AAAA-MM-DDTHH:MM:SS."
                return
            }
        default:
            begin = acsDefaultBegin
            end = acsIndefiniteEnd
        }
        let plans: [[String: Any]] = doorPlans.map { plan in
            let disable = !plan.hasAccess || validMode == "disabled"
            var row: [String: Any] = [
                "deviceIp": plan.deviceIp,
                "doorNo": plan.doorNo,
                "disable": disable,
            ]
            if !disable {
                row["planTemplateNo"] = plan.planTemplateNo
            }
            return row
        }
        let body: [String: Any] = [
            "validMode": validMode,
            "beginTime": begin,
            "endTime": end,
            "doorPlans": plans,
            "ensurePresetsOnDevices": true,
        ]
        do {
            let result = try await IntegraSchedulesRepository.shared.savePersonSchedule(
                personId: personId,
                body: body
            )
            let ok = result.integraBool("success", "ok") ?? true
            message = result.integraStr("note")
                ?? (ok ? "Horario empujado a los terminales." : "Guardado incompleto.")
            await selectPerson(personId)
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func loadDoor(_ doorId: String) async {
        doorLoading = true
        defer { doorLoading = false }
        do {
            let raw = try await IntegraSchedulesRepository.shared.doorAccess(doorId: doorId)
            let list = IntegraJSON.itemsOf(raw)
                + (IntegraJSON.asMapList(raw["people"]) ?? [])
                + (IntegraJSON.asMapList(raw["persons"]) ?? [])
            doorAccess = list.compactMap { m in
                guard let id = m.integraStr("id", "personId") else { return nil }
                return IntegraDoorAccessPerson(
                    id: id,
                    name: m.integraStr("name", "personName") ?? id,
                    templateName: m.integraStr("templateName", "planTemplateNo"),
                    validLabel: m.integraStr("validityLabel", "validLabel", "validTo")
                )
            }
        } catch {
            doorAccess = []
            errorText = error.localizedDescription
        }
    }
}
