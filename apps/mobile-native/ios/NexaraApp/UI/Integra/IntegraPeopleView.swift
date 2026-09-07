import SwiftUI

/// Directorio ACS — listado + alta. Paridad `IntegraPeopleScreen`.
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
                onCreate: { name, code, auto in
                    Task {
                        if let id = await vm.create(name: name, code: code, autoCode: auto) {
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
        List {
            Section {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Nombre, código o id", text: $vm.query)
                        .autocorrectionDisabled()
                }
                Text("\(vm.filtered.count) de \(vm.items.count)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if vm.filtered.isEmpty {
                Section {
                    NxEmptyState(
                        title: "Sin personas",
                        subtitle: vm.items.isEmpty
                            ? "El directorio ACS está vacío en este sitio."
                            : "Ninguna persona coincide con la búsqueda."
                    )
                }
            } else {
                ForEach(vm.filtered) { person in
                    Button { onOpenPerson(person.id) } label: {
                        personRow(person)
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
        let hasFace = IntegraDict.bool(person.raw, "hasFace", "hasLocalFace") == true || faces > 0

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
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundColor(.secondary)
        }
        .padding(.vertical, 2)
    }
}

@MainActor
final class IntegraPeopleVM: ObservableObject {
    @Published var items: [IntegraRow] = []
    @Published var query = ""
    @Published var loading = true
    @Published var error: String?
    @Published var creating = false
    @Published var createError: String?

    private let repo = IntegraRepository.shared

    var filtered: [IntegraRow] {
        items.filter {
            IntegraDict.matchesQuery(
                $0.raw, query: query,
                "name", "personName", "code", "personCode", "employeeNo", "id"
            )
        }
    }

    func refresh(initial: Bool = true) async {
        if initial && items.isEmpty { loading = true }
        error = nil
        do {
            let rows = try await repo.people()
            items = rows.compactMap { raw in
                let id = IntegraDict.str(raw, "id", "personId", "employeeNo")
                guard !id.isEmpty else { return nil }
                return IntegraRow(id: id, raw: raw)
            }
            loading = false
        } catch {
            loading = false
            self.error = error.localizedDescription
        }
    }

    func create(name: String, code: String, autoCode: Bool) async -> String? {
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
                autoCode: autoCode
            )
            let id = IntegraDict.str(result, "id", "personId")
            await refresh(initial: false)
            return id.nilIfEmpty
        } catch {
            createError = error.localizedDescription
            return nil
        }
    }
}

private struct IntegraCreatePersonSheet: View {
    let sending: Bool
    let error: String?
    let onCreate: (String, String, Bool) -> Void
    let onDismiss: () -> Void

    @State private var name = ""
    @State private var code = ""
    @State private var autoCode = true

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
                        Button("Crear") { onCreate(name, code, autoCode) }
                            .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).count < 2)
                    }
                }
            }
        }
        .interactiveDismissDisabled(sending)
    }
}
