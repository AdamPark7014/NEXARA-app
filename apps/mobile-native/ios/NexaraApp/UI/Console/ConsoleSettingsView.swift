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
            message = error.localizedDescription
            messageIsError = true
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
        } catch { message = error.localizedDescription; messageIsError = true }
    }

    func delete(key: String) async {
        do {
            try await ConsoleRepository.shared.settingsDelete(key: key)
            message = "Eliminado"; messageIsError = false
            await load()
        } catch { message = error.localizedDescription; messageIsError = true }
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
        } catch { message = error.localizedDescription; messageIsError = true }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
