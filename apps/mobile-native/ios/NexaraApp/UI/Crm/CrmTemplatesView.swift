import SwiftUI

struct CrmTemplatesView: View {
    @State private var items: [OrderTemplate] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var actionError: String?
    @State private var showForm = false
    @State private var saving = false
    @State private var confirmDeleteId: Int?

    @State private var name = ""
    @State private var description = ""
    @State private var companyName = ""
    @State private var companyEmail = ""
    @State private var companyPhone = ""
    @State private var companyRfc = ""
    @State private var primaryColor = "#0f6ad6"
    @State private var footerText = ""

    var body: some View {
        Group {
            if isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error, items.isEmpty {
                NxEmptyState(
                    title: "No se pudieron cargar",
                    subtitle: error,
                    actionLabel: "Reintentar",
                    onAction: { Task { await reload() } }
                )
            } else {
                List {
                    Section {
                        Text("Diseño corporativo reutilizable para cotizaciones PDF.")
                            .font(.footnote)
                            .foregroundColor(.secondary)
                    }
                    if let actionError {
                        Section { Text(actionError).foregroundColor(.red).font(.footnote) }
                    }
                    if items.isEmpty {
                        Section {
                            NxEmptyState(
                                title: "Sin plantillas",
                                subtitle: "Crea la primera plantilla corporativa con +."
                            )
                        }
                    } else {
                        ForEach(items) { tpl in
                            templateRow(tpl)
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Plantillas")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { openForm() } label: { Image(systemName: "plus") }
            }
        }
        .task { await reload() }
        .refreshable { await reload() }
        .sheet(isPresented: $showForm) { formSheet }
        .alert("Eliminar plantilla", isPresented: Binding(
            get: { confirmDeleteId != nil },
            set: { if !$0 { confirmDeleteId = nil } }
        )) {
            Button("Eliminar", role: .destructive) {
                if let id = confirmDeleteId { Task { await deleteTemplate(id) } }
                confirmDeleteId = nil
            }
            Button("Cancelar", role: .cancel) { confirmDeleteId = nil }
        } message: {
            Text("¿Eliminar esta plantilla de cotización?")
        }
    }

    @ViewBuilder
    private func templateRow(_ tpl: OrderTemplate) -> some View {
        let swatch = Color(hex: tpl.colorHex) ?? Color(red: 0.06, green: 0.42, blue: 0.84)

        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Circle().fill(swatch).frame(width: 12, height: 12)
                Text(tpl.displayName).font(.headline)
                if tpl.isDefault {
                    Label("Predeterminada", systemImage: "star.fill")
                        .font(.caption2)
                        .foregroundColor(.green)
                }
            }
            if !tpl.description.isEmpty {
                Text(tpl.description).font(.caption).foregroundColor(.secondary)
            }
            if !tpl.companyName.isEmpty {
                Text(tpl.companyName).font(.subheadline)
            }
            HStack(spacing: 12) {
                if !tpl.isDefault, tpl.id > 0 {
                    Button("Predeterminar") { Task { await setDefault(Int(tpl.id)) } }
                        .font(.caption)
                }
                if tpl.id > 0 {
                    Button(role: .destructive) { confirmDeleteId = Int(tpl.id) } label: {
                        Label("Eliminar", systemImage: "trash")
                    }
                    .font(.caption)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var formSheet: some View {
        NavigationStack {
            Form {
                Section("Identidad") {
                    TextField("Nombre *", text: $name)
                    TextField("Descripción", text: $description)
                }
                Section("Empresa") {
                    TextField("Razón social", text: $companyName)
                    TextField("Email", text: $companyEmail).textInputAutocapitalization(.never)
                    TextField("Teléfono", text: $companyPhone)
                    TextField("RFC", text: $companyRfc)
                }
                Section("Diseño") {
                    TextField("Color primario (#hex)", text: $primaryColor)
                    TextField("Pie de página", text: $footerText)
                }
                if let actionError {
                    Section { Text(actionError).foregroundColor(.red).font(.footnote) }
                }
            }
            .navigationTitle("Nueva plantilla")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { showForm = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { Task { await create() } }
                        .disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func openForm() {
        name = ""; description = ""; companyName = ""; companyEmail = ""
        companyPhone = ""; companyRfc = ""; primaryColor = "#0f6ad6"; footerText = ""
        actionError = nil
        showForm = true
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            items = try await CrmRepository.shared.orderTemplateItems()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func create() async {
        saving = true
        defer { saving = false }
        var payload: [String: String] = ["name": name.trimmingCharacters(in: .whitespaces)]
        if !description.isEmpty { payload["description"] = description }
        if !companyName.isEmpty { payload["companyName"] = companyName }
        if !companyEmail.isEmpty { payload["companyEmail"] = companyEmail }
        if !companyPhone.isEmpty { payload["companyPhone"] = companyPhone }
        if !companyRfc.isEmpty { payload["companyRfc"] = companyRfc }
        if !primaryColor.isEmpty { payload["primaryColor"] = primaryColor }
        if !footerText.isEmpty { payload["footerText"] = footerText }
        do {
            try await CrmRepository.shared.createOrderTemplate(payload)
            showForm = false
            await reload()
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func setDefault(_ id: Int) async {
        do {
            try await CrmRepository.shared.setOrderTemplateDefault(id: id)
            await reload()
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func deleteTemplate(_ id: Int) async {
        do {
            try await CrmRepository.shared.deleteOrderTemplate(id: id)
            await reload()
        } catch {
            actionError = error.localizedDescription
        }
    }
}

private extension Color {
    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt64(s, radix: 16) else { return nil }
        self.init(
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255
        )
    }
}
