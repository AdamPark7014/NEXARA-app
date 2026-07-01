import PhotosUI
import SwiftUI
import UIKit

/// Clientes de servicio — CRUD + logo (paridad `ConsoleClientsScreen` Android).
struct ServiceClientsView: View {
    @State private var clients: [[String: Any]] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var selected: [String: Any]?
    @State private var showCreate = false
    @State private var editing: EditableClient?
    @State private var message: String?

    private var filtered: [[String: Any]] {
        guard !query.isEmpty else { return clients }
        let q = query.lowercased()
        return clients.filter {
            ConsoleHelpers.mapStr($0, "name", "nombre").lowercased().contains(q) ||
            ConsoleHelpers.mapStr($0, "contactEmail", "email", "accountCode").lowercased().contains(q)
        }
    }

    var body: some View {
        Group {
            if let c = selected { clientDetail(c) }
            else { listBody }
        }
        .navigationTitle("Clientes")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showCreate = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                ServiceClientFormView(mode: .create) { saved in
                    showCreate = false
                    if let saved { selected = saved }
                    Task { await reload() }
                }
            }
        }
        .sheet(item: $editing) { wrap in
            NavigationStack {
                ServiceClientFormView(mode: .edit(wrap.data)) { _ in
                    editing = nil
                    Task { await reload() }
                }
            }
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var listBody: some View {
        List {
            if let message {
                Text(message).font(.footnote).foregroundColor(.green)
            }
            if isLoading { ProgressView() }
            ForEach(filtered, id: \.serviceClientKey) { c in
                Button { selected = c } label: {
                    HStack(spacing: 12) {
                        clientLogo(c, size: 44)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(ConsoleHelpers.mapStr(c, "name", "nombre")).font(.headline)
                            Text(ConsoleHelpers.mapStr(c, "contactEmail", "email", "city"))
                                .font(.caption).foregroundColor(.secondary)
                        }
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "Buscar cliente")
    }

    private func clientDetail(_ c: [String: Any]) -> some View {
        List {
            Section {
                HStack {
                    Spacer()
                    clientLogo(c, size: 96)
                    Spacer()
                }
                .listRowBackground(Color.clear)
            }
            Section("Identidad") {
                detailRow("Nombre", ConsoleHelpers.mapStr(c, "name", "nombre"))
                detailRow("Código", ConsoleHelpers.mapStr(c, "accountCode"))
                detailRow("Activo", (c["isActive"] as? Bool == false) ? "No" : "Sí")
            }
            Section("Contacto") {
                detailRow("Persona", ConsoleHelpers.mapStr(c, "contactName"))
                detailRow("Email", ConsoleHelpers.mapStr(c, "contactEmail"))
                detailRow("Teléfono", ConsoleHelpers.mapStr(c, "contactPhone"))
            }
            Section("Ubicación") {
                detailRow("Dirección", ConsoleHelpers.mapStr(c, "address"))
                detailRow("Ciudad", ConsoleHelpers.mapStr(c, "city"))
                detailRow("Estado", ConsoleHelpers.mapStr(c, "state"))
                detailRow("País", ConsoleHelpers.mapStr(c, "country"))
            }
            Section("Portal") {
                detailRow("Email portal", ConsoleHelpers.mapStr(c, "portalEmail"))
            }
            Section {
                Button("Editar cliente") {
                    if let id = ConsoleHelpers.mapInt64(c, "id") {
                        editing = EditableClient(id: id, data: c)
                    }
                }
                if let id = ConsoleHelpers.mapInt64(c, "id") {
                    Button("Descargar reporte PDF") { Task { await downloadReport(id) } }
                }
                Button("Volver") { selected = nil }
            }
        }
        .navigationTitle(ConsoleHelpers.mapStr(c, "name", "nombre"))
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func detailRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label); Spacer(); Text(value).foregroundColor(.secondary).multilineTextAlignment(.trailing) }
        }
    }

    @ViewBuilder
    private func clientLogo(_ c: [String: Any], size: CGFloat) -> some View {
        let urlStr = ApiUrls.absoluteAsset(ConsoleHelpers.mapStr(c, "logoUrl"))
        if let url = URL(string: urlStr), !urlStr.isEmpty {
            AsyncImage(url: url) { img in
                img.resizable().scaledToFill()
            } placeholder: {
                Image(systemName: "building.2").foregroundColor(.secondary)
            }
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        } else {
            Image(systemName: "building.2")
                .font(.title2)
                .foregroundColor(.secondary)
                .frame(width: size, height: size)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        clients = (try? await ConsoleRepository.shared.serviceClients()) ?? []
    }

    private func downloadReport(_ id: Int64) async {
        do {
            let data = try await ConsoleRepository.shared.serviceClientReportPdf(clientId: id)
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("cliente-\(id).pdf")
            try data.write(to: url)
            message = "PDF guardado en \(url.lastPathComponent)"
        } catch {
            message = error.localizedDescription
        }
    }
}

// MARK: - Form

private enum ServiceClientFormMode: Identifiable {
    case create
    case edit([String: Any])

    var id: String {
        switch self {
        case .create: return "create"
        case .edit(let c): return "edit-\(ConsoleHelpers.mapInt64(c, "id") ?? 0)"
        }
    }
}

private struct ServiceClientFormView: View {
    let mode: ServiceClientFormMode
    let onDone: ([String: Any]?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var contactName = ""
    @State private var contactEmail = ""
    @State private var contactPhone = ""
    @State private var address = ""
    @State private var city = ""
    @State private var state = ""
    @State private var country = ""
    @State private var accountCode = ""
    @State private var portalEmail = ""
    @State private var portalPassword = ""
    @State private var isActive = true
    @State private var logoItem: PhotosPickerItem?
    @State private var logoData: Data?
    @State private var existingLogoUrl: String?
    @State private var saving = false
    @State private var error: String?
    @State private var credentialsMessage: String?

    private var isEdit: Bool {
        if case .edit = mode { return true }
        return false
    }

    var body: some View {
        Form {
            if let error { Text(error).foregroundColor(.red).font(.footnote) }
            if let credentialsMessage { Text(credentialsMessage).foregroundColor(.green).font(.footnote) }
            Section("Datos") {
                TextField("Nombre *", text: $name)
                TextField("Código de cuenta", text: $accountCode)
                Toggle("Cliente activo", isOn: $isActive)
            }
            Section("Contacto") {
                TextField("Persona de contacto", text: $contactName)
                TextField("Email", text: $contactEmail).keyboardType(.emailAddress)
                TextField("Teléfono", text: $contactPhone).keyboardType(.phonePad)
            }
            Section("Ubicación") {
                TextField("Dirección", text: $address)
                TextField("Ciudad", text: $city)
                TextField("Estado", text: $state)
                TextField("País", text: $country)
            }
            Section("Portal cliente") {
                TextField("Email portal", text: $portalEmail).keyboardType(.emailAddress)
                TextField(isEdit ? "Password (opcional)" : "Password portal", text: $portalPassword)
            }
            Section("Logo") {
                if let logoData, let ui = UIImage(data: logoData) {
                    Image(uiImage: ui).resizable().scaledToFit().frame(maxHeight: 120)
                } else if let existingLogoUrl {
                    AsyncImage(url: URL(string: ApiUrls.absoluteAsset(existingLogoUrl))) { $0.resizable().scaledToFit() } placeholder: { ProgressView() }
                        .frame(maxHeight: 120)
                }
                PhotosPicker(selection: $logoItem, matching: .images) {
                    Label("Elegir imagen", systemImage: "photo")
                }
                if logoData != nil {
                    Button("Quitar imagen", role: .destructive) { logoData = nil; logoItem = nil }
                }
            }
            Section {
                Button(saving ? "Guardando…" : "Guardar") { Task { await save() } }
                    .disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .navigationTitle(isEdit ? "Editar cliente" : "Nuevo cliente")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancelar") { onDone(nil); dismiss() }
            }
        }
        .onAppear { seedFromMode() }
        .onChange(of: logoItem) { _, item in
            Task {
                if let data = try? await item?.loadTransferable(type: Data.self) { logoData = data }
            }
        }
    }

    private func seedFromMode() {
        guard case .edit(let c) = mode else { return }
        name = ConsoleHelpers.mapStr(c, "name", "nombre")
        contactName = ConsoleHelpers.mapStr(c, "contactName")
        contactEmail = ConsoleHelpers.mapStr(c, "contactEmail")
        contactPhone = ConsoleHelpers.mapStr(c, "contactPhone")
        address = ConsoleHelpers.mapStr(c, "address")
        city = ConsoleHelpers.mapStr(c, "city")
        state = ConsoleHelpers.mapStr(c, "state")
        country = ConsoleHelpers.mapStr(c, "country")
        accountCode = ConsoleHelpers.mapStr(c, "accountCode")
        portalEmail = ConsoleHelpers.mapStr(c, "portalEmail")
        isActive = c["isActive"] as? Bool != false
        existingLogoUrl = ConsoleHelpers.mapStr(c, "logoUrl").nilIfEmpty
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        do {
            switch mode {
            case .create:
                let resp = try await ConsoleRepository.shared.createServiceClient(
                    name: trimmed,
                    contactName: contactName.nilIfEmpty, contactEmail: contactEmail.nilIfEmpty,
                    contactPhone: contactPhone.nilIfEmpty, address: address.nilIfEmpty,
                    city: city.nilIfEmpty, state: state.nilIfEmpty, country: country.nilIfEmpty,
                    accountCode: accountCode.nilIfEmpty, portalEmail: portalEmail.nilIfEmpty,
                    portalPassword: portalPassword.nilIfEmpty, isActive: isActive,
                    logoData: logoData, logoFileName: "logo.jpg"
                )
                if let creds = resp["credentials"] as? [String: Any] {
                    let email = ConsoleHelpers.mapStr(creds, "email")
                    let pass = ConsoleHelpers.mapStr(creds, "password")
                    if !email.isEmpty || !pass.isEmpty {
                        credentialsMessage = "Portal: \(email) / \(pass)"
                    }
                }
                let client = (resp["client"] as? [String: Any]) ?? resp
                onDone(client); dismiss()
            case .edit(let c):
                guard let id = ConsoleHelpers.mapInt64(c, "id") else { return }
                _ = try await ConsoleRepository.shared.updateServiceClient(
                    id: id, name: trimmed,
                    contactName: contactName.nilIfEmpty, contactEmail: contactEmail.nilIfEmpty,
                    contactPhone: contactPhone.nilIfEmpty, address: address.nilIfEmpty,
                    city: city.nilIfEmpty, state: state.nilIfEmpty, country: country.nilIfEmpty,
                    accountCode: accountCode.nilIfEmpty, portalEmail: portalEmail.nilIfEmpty,
                    portalPassword: portalPassword.nilIfEmpty, isActive: isActive,
                    logoData: logoData, logoFileName: "logo.jpg"
                )
                onDone(nil); dismiss()
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

extension [String: Any] {
    fileprivate var serviceClientKey: String { "sc-\(self["id"] ?? UUID().uuidString)" }
}

private struct EditableClient: Identifiable {
    let id: Int64
    let data: [String: Any]
}
