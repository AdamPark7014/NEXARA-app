import SwiftUI

/// Directorio ACS — vigencia, credenciales, live/espejo. Paridad `IntegraPeopleScreen`.
private let integraPersonPage = 40

struct IntegraPeopleView: View {
    var onOpenPerson: (String) -> Void

    @StateObject private var vm = IntegraPeopleVM()
    @State private var showCreate = false

    var body: some View {
        Group {
            if vm.loading && vm.items.isEmpty {
                ProgressView("Cargando personas…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = vm.error, vm.items.isEmpty {
                NxEmptyState(title: "No se pudieron cargar", subtitle: error, actionLabel: "Reintentar") {
                    Task { await vm.refresh() }
                }
            } else {
                listBody
            }
        }
        .navigationTitle("Personas")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showCreate = true } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .task { await vm.refresh() }
        .refreshable { await vm.refresh(initial: false) }
        .sheet(isPresented: $showCreate) {
            IntegraCreatePersonSheet(
                sending: vm.creating,
                error: vm.createError,
                onCreate: { name, code, auto, validFrom, validTo in
                    Task {
                        if let id = await vm.create(
                            name: name, code: code, autoCode: auto,
                            validFrom: validFrom, validTo: validTo
                        ) {
                            showCreate = false
                            onOpenPerson(id)
                        }
                    }
                },
                onDismiss: { if !vm.creating { showCreate = false } }
            )
        }
    }

    private var listBody: some View {
        let matching = vm.filtered
        let shown = Array(matching.prefix(vm.limit))

        return List {
            Section {
                Text(vm.live ? "Fuente: consulta live al ACS" : "Fuente: espejo sincronizado")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Nombre, código o id", text: $vm.query)
                        .autocorrectionDisabled()
                        .onChange(of: vm.query) { _, _ in vm.limit = integraPersonPage }
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        Button {
                            Task { await vm.setLive(!vm.live) }
                        } label: {
                            NxStatusChip(
                                text: vm.live ? "Live ACS" : "Espejo",
                                tone: vm.live ? .info : .neutral
                            )
                        }
                        .buttonStyle(.plain)
                        ForEach(IntegraValidityFilter.allCases) { f in
                            let selected = vm.validityFilter == f
                            Button {
                                vm.validityFilter = selected ? nil : f
                                vm.limit = integraPersonPage
                            } label: {
                                NxStatusChip(text: f.label, tone: selected ? f.tone : .neutral)
                            }
                            .buttonStyle(.plain)
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
                        title: "Sin personas",
                        subtitle: vm.items.isEmpty
                            ? "El directorio ACS está vacío en este sitio."
                            : "Ninguna persona coincide con la búsqueda."
                    )
                }
            } else {
                ForEach(shown) { person in
                    Button { onOpenPerson(person.id) } label: {
                        personRow(person)
                    }
                }
                if matching.count > vm.limit {
                    Section {
                        Button("Ver más personas") { vm.limit += integraPersonPage }
                    }
                }
            }
        }
    }

    private func personRow(_ person: IntegraRow) -> some View {
        let name = IntegraDict.str(person.raw, "name", "personName").nilIfEmpty ?? person.id
        let code = IntegraDict.str(person.raw, "code", "personCode", "employeeNo")
        let type = IntegraDict.str(person.raw, "userType")
        let faces = IntegraDict.int(person.raw, "numOfFace")
        let cards = IntegraDict.int(person.raw, "numOfCard")
        let fps = IntegraDict.int(person.raw, "numOfFP")
        let hasFace = IntegraDict.bool(person.raw, "hasFace", "hasLocalFace") == true || faces > 0
        let validity = IntegraValidity.describe(person.raw)
        let creds = [
            faces > 0 || hasFace ? "rostro" : nil,
            cards > 0 ? "\(cards) tarj." : nil,
            fps > 0 ? "\(fps) huella" : nil,
        ].compactMap { $0 }.joined(separator: " · ")

        return HStack(spacing: 12) {
            Image(systemName: hasFace ? "person.crop.circle.fill" : "person.crop.circle")
                .font(.title2)
                .foregroundColor(hasFace ? Color.teal : .secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.body.weight(.semibold)).foregroundColor(.primary)
                HStack(spacing: 8) {
                    if !code.isEmpty {
                        Text(code).font(.caption).foregroundColor(.secondary)
                    }
                    if !type.isEmpty {
                        NxStatusChip(text: type, tone: .neutral)
                    }
                }
                HStack(spacing: 6) {
                    NxStatusChip(text: validity.label, tone: validity.tone)
                    if !creds.isEmpty {
                        Text(creds).font(.caption2).foregroundColor(.secondary)
                    } else {
                        Text("Sin credenciales").font(.caption2).foregroundColor(.orange)
                    }
                }
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundColor(.secondary)
        }
        .padding(.vertical, 2)
    }
}

enum IntegraValidityFilter: String, CaseIterable, Identifiable {
    case suspendida, caducada, vencePronto, vigente, desconocida
    var id: String { rawValue }
    var label: String {
        switch self {
        case .suspendida: return "Suspendida"
        case .caducada: return "Caducada"
        case .vencePronto: return "Vence pronto"
        case .vigente: return "Vigente"
        case .desconocida: return "Sin vigencia"
        }
    }
    var tone: NxTone {
        switch self {
        case .suspendida, .caducada: return .danger
        case .vencePronto: return .warning
        case .vigente: return .success
        case .desconocida: return .neutral
        }
    }
}

enum IntegraValidity {
    struct Info {
        let filter: IntegraValidityFilter
        let label: String
        let tone: NxTone
    }

    static func describe(_ person: [String: Any], now: Date = Date()) -> Info {
        if IntegraDict.bool(person, "validEnable") == false {
            return Info(filter: .suspendida, label: "Suspendida", tone: .danger)
        }
        let validTo = IntegraDict.str(person, "validTo")
        if validTo.isEmpty {
            return Info(filter: .desconocida, label: "Sin vigencia", tone: .neutral)
        }
        guard let ms = IntegraCoreFormat.parseMs(validTo) ?? parseDateOnly(validTo) else {
            return Info(filter: .desconocida, label: "Vigencia ilegible", tone: .neutral)
        }
        let daysLeft = Calendar.current.dateComponents(
            [.day],
            from: Calendar.current.startOfDay(for: now),
            to: Calendar.current.startOfDay(for: Date(timeIntervalSince1970: ms))
        ).day ?? 0
        if daysLeft < 0 {
            return Info(filter: .caducada, label: "Caducada", tone: .danger)
        }
        if validTo.range(of: #"^20(3[6-9]|[4-9]\d)-"#, options: .regularExpression) != nil {
            return Info(filter: .vigente, label: "Indefinida", tone: .success)
        }
        if daysLeft < 30 {
            let texto = daysLeft == 0 ? "Vence hoy" : "Vence en \(daysLeft) día(s)"
            return Info(filter: .vencePronto, label: texto, tone: .warning)
        }
        return Info(filter: .vigente, label: "Vigente", tone: .success)
    }

    private static func parseDateOnly(_ raw: String) -> TimeInterval? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: String(raw.prefix(10)))?.timeIntervalSince1970
    }
}

@MainActor
final class IntegraPeopleVM: ObservableObject {
    @Published var items: [IntegraRow] = []
    @Published var live = false
    @Published var query = ""
    @Published var validityFilter: IntegraValidityFilter?
    @Published var limit = integraPersonPage
    @Published var loading = true
    @Published var error: String?
    @Published var creating = false
    @Published var createError: String?

    private let repo = IntegraRepository.shared

    var filtered: [IntegraRow] {
        items.filter { row in
            let qOk = IntegraDict.matchesQuery(
                row.raw, query: query,
                "name", "personName", "code", "personCode", "employeeNo", "id"
            )
            let vOk = validityFilter == nil || IntegraValidity.describe(row.raw).filter == validityFilter
            return qOk && vOk
        }
    }

    func setLive(_ value: Bool) async {
        live = value
        await refresh(initial: false)
    }

    func refresh(initial: Bool = true) async {
        if initial && items.isEmpty { loading = true }
        error = nil
        do {
            let rows = try await repo.people(live: live)
            items = rows.compactMap { raw in
                let id = IntegraDict.str(raw, "id", "personId", "employeeNo")
                guard !id.isEmpty else { return nil }
                return IntegraRow(id: id, raw: raw)
            }
            loading = false
        } catch {
            loading = false
            self.error = error.toUserMessage(fallback: "No se pudieron cargar las personas")
        }
    }

    func create(
        name: String,
        code: String,
        autoCode: Bool,
        validFrom: String,
        validTo: String
    ) async -> String? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else {
            createError = "El nombre necesita al menos 2 caracteres."
            return nil
        }
        creating = true
        createError = nil
        defer { creating = false }
        do {
            let result = try await repo.addPerson(
                personName: trimmed,
                personCode: autoCode ? nil : code.nilIfEmpty,
                autoCode: autoCode,
                validFrom: validFrom.nilIfEmpty,
                validTo: validTo.nilIfEmpty
            )
            let id = IntegraDict.str(result, "id", "personId")
            await refresh(initial: false)
            return id.nilIfEmpty
        } catch {
            createError = error.toUserMessage(fallback: "No se pudo crear la persona")
            return nil
        }
    }
}

private struct IntegraCreatePersonSheet: View {
    let sending: Bool
    let error: String?
    let onCreate: (String, String, Bool, String, String) -> Void
    let onDismiss: () -> Void

    @State private var name = ""
    @State private var code = ""
    @State private var autoCode = true
    @State private var validFrom = IntegraCoreFormat.dateOnly(Date())
    @State private var validTo = IntegraCoreFormat.dateOnly(
        Calendar.current.date(byAdding: .year, value: 1, to: Date()) ?? Date()
    )

    var body: some View {
        NavigationStack {
            Form {
                Section("Identidad") {
                    TextField("Nombre completo", text: $name)
                        .disabled(sending)
                    Toggle("Código automático", isOn: $autoCode)
                        .disabled(sending)
                    if !autoCode {
                        TextField("Código / nº empleado", text: $code)
                            .disabled(sending)
                            .textInputAutocapitalization(.never)
                    }
                }
                Section("Vigencia") {
                    TextField("Desde (YYYY-MM-DD)", text: $validFrom)
                        .disabled(sending)
                        .textInputAutocapitalization(.never)
                    TextField("Hasta (YYYY-MM-DD)", text: $validTo)
                        .disabled(sending)
                        .textInputAutocapitalization(.never)
                    if let error {
                        Text(error).font(.caption).foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Nueva persona")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar", action: onDismiss).disabled(sending)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if sending {
                        ProgressView()
                    } else {
                        Button("Crear") { onCreate(name, code, autoCode, validFrom, validTo) }
                            .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).count < 2)
                    }
                }
            }
        }
        .interactiveDismissDisabled(sending)
    }
}
