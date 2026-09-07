import SwiftUI

/// Ajustes del sistema (`console.admin`) — paridad Android `ConsoleSettingsScreen`.
struct ConsoleSettingsView: View {
    @EnvironmentObject var session: SessionStore
    @StateObject private var vm = ConsoleSettingsVM()

    private var canAdmin: Bool {
        guard let u = session.currentUser else { return false }
        return u.isSuperAdmin || u.permissions.contains("console.admin")
    }

    var body: some View {
        Group {
            if !canAdmin {
                VStack(spacing: 12) {
                    Image(systemName: "lock").font(.largeTitle).foregroundColor(.secondary)
                    Text("Sin permiso").font(.headline)
                    Text("Requiere console.admin").font(.footnote).foregroundColor(.secondary)
                }
                .padding()
            } else {
                settingsForm
            }
        }
        .navigationTitle("Ajustes")
        .task { await vm.load() }
        .refreshOnModels(["SystemSetting"], refresh: { await vm.load() })
    }

    private var settingsForm: some View {
        List {
            if let msg = vm.message {
                Text(msg).font(.footnote).foregroundColor(vm.messageIsError ? .red : .green)
            }
            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(vm.categories, id: \.self) { cat in
                            let sel = vm.activeCategory == cat
                            Button(vm.categoryLabel(cat)) {
                                vm.activeCategory = cat
                            }
                            .font(.caption.bold())
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(sel ? Color.accentColor : Color(.secondarySystemGroupedBackground))
                            .foregroundColor(sel ? .white : .primary)
                            .clipShape(Capsule())
                        }
                    }
                }
            }
            if vm.isLoading {
                ProgressView()
            } else {
                ForEach(vm.filtered, id: \.key) { s in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(s.label.isEmpty ? s.key : s.label).font(.subheadline.bold())
                        TextField("Valor", text: binding(for: s.key))
                            .textFieldStyle(.roundedBorder)
                        HStack {
                            Button("Guardar") { Task { await vm.save(key: s.key) } }
                                .font(.caption)
                            Spacer()
                            Button("Eliminar", role: .destructive) { Task { await vm.delete(key: s.key) } }
                                .font(.caption)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            Section("Nuevo ajuste") {
                TextField("Clave", text: $vm.newKey)
                TextField("Etiqueta", text: $vm.newLabel)
                TextField("Valor", text: $vm.newValue)
                Button("Crear") { Task { await vm.create() } }
                    .disabled(vm.newKey.isEmpty || vm.newValue.isEmpty)
            }
            Section("Dispositivo") {
                NavigationLink("Cola offline") {
                    OfflineQueueView()
                }
            }
            Section("API keys de la empresa") {
                if let err = vm.apiKeysError {
                    Text(err).font(.footnote).foregroundColor(.red)
                }
                if let token = vm.createdApiKeyToken {
                    Text("Token (solo se muestra ahora): \(token)")
                        .font(.caption)
                        .foregroundColor(.teal)
                    Button("Ocultar token") { vm.createdApiKeyToken = nil }
                }
                if vm.apiKeys.isEmpty && vm.apiKeysError == nil {
                    Text("Sin API keys activas").font(.footnote).foregroundColor(.secondary)
                }
                ForEach(vm.apiKeys) { key in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(key.name).font(.subheadline.bold())
                            if !key.meta.isEmpty {
                                Text(key.meta).font(.caption2).foregroundColor(.secondary)
                            }
                        }
                        Spacer()
                        Button("Revocar", role: .destructive) {
                            Task { await vm.revokeApiKey(id: key.id) }
                        }
                        .font(.caption)
                        .disabled(vm.integrationsBusy)
                    }
                }
                TextField("Nombre de la nueva API key", text: $vm.newApiKeyName)
                Button("+ Crear API key") { Task { await vm.createApiKey() } }
                    .disabled(vm.integrationsBusy || vm.newApiKeyName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            Section("Webhooks outbound") {
                if let err = vm.webhooksError {
                    Text(err).font(.footnote).foregroundColor(.red)
                }
                if vm.webhooks.isEmpty && vm.webhooksError == nil {
                    Text("Sin webhooks configurados").font(.footnote).foregroundColor(.secondary)
                }
                ForEach(vm.webhooks) { hook in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(hook.name).font(.subheadline.bold())
                        if !hook.url.isEmpty {
                            Text(hook.url).font(.caption2).foregroundColor(.secondary).lineLimit(1)
                        }
                    }
                }
                if !vm.webhookDlq.isEmpty {
                    Text("Entregas fallidas (\(vm.webhookDlq.count))")
                        .font(.subheadline.bold())
                        .foregroundColor(.red)
                    ForEach(vm.webhookDlq.prefix(20)) { row in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.eventType).font(.caption)
                                if !row.lastError.isEmpty {
                                    Text(row.lastError).font(.caption2).foregroundColor(.secondary).lineLimit(1)
                                }
                            }
                            Spacer()
                            Button("Reenviar") { Task { await vm.replayDelivery(id: row.id) } }
                                .font(.caption)
                                .disabled(vm.integrationsBusy)
                        }
                    }
                }
            }
        }
    }

    private func binding(for key: String) -> Binding<String> {
        Binding(
            get: { vm.editValues[key] ?? "" },
            set: { vm.editValues[key] = $0 }
        )
    }
}

private struct SettingRow: Identifiable {
    let key: String
    let label: String
    let category: String
    var id: String { key }
}

private struct ApiKeyRow: Identifiable {
    let id: Int64
    let name: String
    let meta: String
}

private struct WebhookRow: Identifiable {
    let id: String
    let name: String
    let url: String
}

private struct WebhookDlqRow: Identifiable {
    let id: Int64
    let eventType: String
    let lastError: String
}

@MainActor
final class ConsoleSettingsVM: ObservableObject {
    @Published var isLoading = true
    @Published var settings: [SettingRow] = []
    @Published var activeCategory = "general"
    @Published var editValues: [String: String] = [:]
    @Published var newKey = ""
    @Published var newLabel = ""
    @Published var newValue = ""
    @Published var message: String?
    @Published var messageIsError = false

    @Published var apiKeys: [ApiKeyRow] = []
    @Published var apiKeysError: String?
    @Published var newApiKeyName = ""
    @Published var createdApiKeyToken: String?
    @Published var webhooks: [WebhookRow] = []
    @Published var webhooksError: String?
    @Published var webhookDlq: [WebhookDlqRow] = []
    @Published var integrationsBusy = false

    var categories: [String] {
        let order = ["general", "empresa", "fiscal", "notificaciones", "seguridad"]
        let fromData = Array(Set(settings.map(\.category)))
        return order.filter { fromData.contains($0) } + fromData.filter { !order.contains($0) }.sorted()
    }

    var filtered: [SettingRow] {
        settings.filter { $0.category == activeCategory }
    }

    func categoryLabel(_ key: String) -> String {
        switch key {
        case "general": return "General"
        case "empresa": return "Empresa"
        case "fiscal": return "Fiscal"
        case "notificaciones": return "Notificaciones"
        case "seguridad": return "Seguridad"
        default: return key.capitalized
        }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let list = try await ConsoleRepository.shared.settingsList()
            settings = list.compactMap { m in
                let key = ConsoleHelpers.mapStr(m, "key")
                guard !key.isEmpty else { return nil }
                return SettingRow(
                    key: key,
                    label: ConsoleHelpers.mapStr(m, "label"),
                    category: { let c = ConsoleHelpers.mapStr(m, "category"); return c.isEmpty ? "general" : c }()
                )
            }
            editValues = Dictionary(uniqueKeysWithValues: list.compactMap { m in
                let k = ConsoleHelpers.mapStr(m, "key")
                guard !k.isEmpty else { return nil }
                return (k, ConsoleHelpers.mapStr(m, "value"))
            })
        } catch {
            message = error.toUserMessage()
            messageIsError = true
        }
        await loadIntegrations()
    }

    func loadIntegrations() async {
        do {
            let list = try await ConsoleRepository.shared.companyApiKeys()
            apiKeys = list.compactMap { m in
                guard let id = StockParse.int64(m["id"]) else { return nil }
                let name = ConsoleHelpers.mapStr(m, "name")
                let prefix = ConsoleHelpers.mapStr(m, "prefix")
                let scopes: String = {
                    if let arr = m["scopes"] as? [Any] {
                        return arr.compactMap { $0 as? String }.filter { !$0.isEmpty }.joined(separator: ", ")
                    }
                    return ConsoleHelpers.mapStr(m, "scopes")
                }()
                let meta = [prefix, scopes].filter { !$0.isEmpty }.joined(separator: " · ")
                return ApiKeyRow(id: id, name: name.isEmpty ? "API key #\(id)" : name, meta: meta)
            }
            apiKeysError = nil
        } catch {
            apiKeys = []
            apiKeysError = error.toUserMessage("No se pudieron cargar API keys")
        }

        do {
            let list = try await ConsoleRepository.shared.webhooks()
            webhooks = list.enumerated().map { idx, m in
                let name = ConsoleHelpers.mapStr(m, "name")
                let url = ConsoleHelpers.mapStr(m, "url")
                let id = ConsoleHelpers.mapStr(m, "id")
                return WebhookRow(
                    id: id.isEmpty ? "hook-\(idx)" : id,
                    name: name.isEmpty ? "Webhook" : name,
                    url: url
                )
            }
            webhooksError = nil
        } catch {
            webhooks = []
            webhooksError = error.toUserMessage("No se pudieron cargar webhooks")
        }

        do {
            let list = try await ConsoleRepository.shared.webhooksDlq()
            webhookDlq = list.compactMap { m in
                guard let id = StockParse.int64(m["id"]) else { return nil }
                let e = ConsoleHelpers.mapStr(m, "eventType", "event")
                return WebhookDlqRow(
                    id: id,
                    eventType: e.isEmpty ? "Entrega #\(id)" : e,
                    lastError: ConsoleHelpers.mapStr(m, "lastError", "error")
                )
            }
        } catch {
            webhookDlq = []
        }
    }

    func save(key: String) async {
        guard let row = settings.first(where: { $0.key == key }) else { return }
        let value = editValues[key] ?? ""
        do {
            _ = try await ConsoleRepository.shared.settingsUpsert(
                key: key, value: value, category: row.category, label: row.label.nilIfEmpty
            )
            message = "Guardado"; messageIsError = false
            await load()
        } catch { message = error.toUserMessage(); messageIsError = true }
    }

    func delete(key: String) async {
        do {
            try await ConsoleRepository.shared.settingsDelete(key: key)
            message = "Eliminado"; messageIsError = false
            await load()
        } catch { message = error.toUserMessage(); messageIsError = true }
    }

    func create() async {
        do {
            _ = try await ConsoleRepository.shared.settingsUpsert(
                key: newKey.trimmingCharacters(in: .whitespaces),
                value: newValue,
                category: activeCategory,
                label: newLabel.nilIfEmpty
            )
            newKey = ""; newLabel = ""; newValue = ""
            message = "Ajuste creado"; messageIsError = false
            await load()
        } catch { message = error.toUserMessage(); messageIsError = true }
    }

    func createApiKey() async {
        let name = newApiKeyName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        integrationsBusy = true
        defer { integrationsBusy = false }
        do {
            let created = try await ConsoleRepository.shared.createCompanyApiKey(name: name)
            createdApiKeyToken = ConsoleHelpers.mapStr(created, "token", "apiKey", "key")
            newApiKeyName = ""
            message = "API key creada"; messageIsError = false
            await loadIntegrations()
        } catch {
            message = error.toUserMessage("No se pudo crear la API key")
            messageIsError = true
        }
    }

    func revokeApiKey(id: Int64) async {
        integrationsBusy = true
        defer { integrationsBusy = false }
        do {
            try await ConsoleRepository.shared.revokeCompanyApiKey(id: id)
            message = "API key revocada"; messageIsError = false
            await loadIntegrations()
        } catch {
            message = error.toUserMessage("No se pudo revocar")
            messageIsError = true
        }
    }

    func replayDelivery(id: Int64) async {
        integrationsBusy = true
        defer { integrationsBusy = false }
        do {
            try await ConsoleRepository.shared.replayWebhookDelivery(deliveryId: id)
            message = "Entrega reenviada"; messageIsError = false
            await loadIntegrations()
        } catch {
            message = error.toUserMessage("No se pudo reenviar")
            messageIsError = true
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
