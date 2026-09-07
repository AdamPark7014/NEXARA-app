import SwiftUI

struct IntegraSiteAdminRow: Identifiable, Hashable {
    let id: Int
    var name: String
    var label: String?
    var active: Bool
    var isDefault: Bool
    var provider: String?
}

enum IntegraSettingsDataStub {
    static func sites() async throws -> [IntegraSiteAdminRow] {
        let rows = try await IntegraRepository.shared.sites()
        return rows.compactMap { m in
            guard let id = m.integraInt("id") else { return nil }
            return IntegraSiteAdminRow(
                id: id,
                name: m.integraStr("name") ?? "Sitio \(id)",
                label: m.integraStr("label"),
                active: m.integraBool("active") ?? true,
                isDefault: m.integraBool("isDefault", "default") ?? false,
                provider: m.integraStr("provider")
            )
        }
    }

    static func createSite(name: String) async throws {
        // TODO: settings POST when Data/Integra settings write API is exposed
        _ = name
        throw NSError(
            domain: "integra.settings",
            code: 501,
            userInfo: [NSLocalizedDescriptionKey: "Alta de sitio: cablear endpoint de settings en Data/Integra."]
        )
    }

    static func deleteSite(id: Int, typedName: String) async throws {
        _ = (id, typedName)
        throw NSError(
            domain: "integra.settings",
            code: 501,
            userInfo: [NSLocalizedDescriptionKey: "Baja de sitio: cablear endpoint destructivo en Data/Integra."]
        )
    }

    static func setDefault(id: Int) async throws {
        IntegraSiteScope.select(id)
    }

    static func syncSite(id: Int) async throws {
        IntegraSiteScope.select(id)
        _ = try await IntegraRepository.shared.lastSync()
    }
}

/// Ajustes INTEGRA — administración de sitios.
struct IntegraSettingsView: View {
    var onOpenSite: (Int) -> Void = { _ in }
    var onOpenNewSite: () -> Void = {}

    @State private var sites: [IntegraSiteAdminRow] = []
    @State private var isLoading = true
    @State private var errorText: String?
    @State private var message: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Cargando sitios…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorText, sites.isEmpty {
                VStack(spacing: 12) {
                    Text(errorText).foregroundStyle(.secondary)
                    Button("Reintentar") { Task { await reload() } }
                }
            } else {
                List {
                    Section {
                        Text("Alta, etiqueta, activación, predeterminado, sync y baja. Lo destructivo pide confirmación.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button("Nuevo sitio", action: onOpenNewSite)
                    }
                    if let message {
                        Section { Text(message).foregroundStyle(NxTone.success.fg) }
                    }
                    if sites.isEmpty {
                        NxEmptyState(title: "Sin sitios", subtitle: "Crea el primero desde «Nuevo sitio».")
                    } else {
                        ForEach(sites) { site in
                            Button { onOpenSite(site.id) } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(site.name).font(.headline)
                                        Text([site.label, site.provider].compactMap { $0 }.joined(separator: " · "))
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if site.isDefault {
                                        NxStatusChip(text: "Default", tone: .brand)
                                    }
                                    NxStatusChip(
                                        text: site.active ? "Activo" : "Inactivo",
                                        tone: site.active ? .success : .neutral
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Ajustes INTEGRA")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }
        do { sites = try await IntegraSettingsDataStub.sites() }
        catch { errorText = error.localizedDescription }
    }
}

struct IntegraNewSiteView: View {
    var onCreated: () -> Void = {}

    @State private var name = ""
    @State private var saving = false
    @State private var errorText: String?

    var body: some View {
        Form {
            TextField("Nombre del sitio", text: $name)
            if let errorText {
                Text(errorText).foregroundStyle(NxTone.danger.fg)
            }
            Button(saving ? "Creando…" : "Crear") {
                Task {
                    saving = true
                    defer { saving = false }
                    do {
                        try await IntegraSettingsDataStub.createSite(name: name)
                        onCreated()
                    } catch {
                        errorText = error.localizedDescription
                    }
                }
            }
            .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || saving)
        }
        .navigationTitle("Nuevo sitio")
    }
}

struct IntegraSiteDetailView: View {
    let siteId: Int
    var onDeleted: () -> Void = {}

    @State private var site: IntegraSiteAdminRow?
    @State private var confirmName = ""
    @State private var showDelete = false
    @State private var message: String?
    @State private var isLoading = true

    var body: some View {
        Form {
            if isLoading {
                ProgressView()
            } else if let site {
                Section("Sitio") {
                    Text(site.name).font(.headline)
                    Text(site.provider ?? "Proveedor desconocido").foregroundStyle(.secondary)
                    Button("Marcar como predeterminado") {
                        Task {
                            try? await IntegraSettingsDataStub.setDefault(id: siteId)
                            message = "Predeterminado actualizado"
                            await load()
                        }
                    }
                    Button("Sincronizar espejo") {
                        Task {
                            try? await IntegraSettingsDataStub.syncSite(id: siteId)
                            message = "Sincronización solicitada"
                        }
                    }
                }
                if let message {
                    Section { Text(message).foregroundStyle(NxTone.success.fg) }
                }
                Section {
                    Button("Eliminar sitio", role: .destructive) { showDelete = true }
                } footer: {
                    Text("La baja exige teclear el nombre del sitio. Se pierde el espejo local de ese sitio.")
                }
            } else {
                Text("Sitio no encontrado").foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Sitio")
        .task { await load() }
        .alert("Eliminar sitio", isPresented: $showDelete) {
            TextField("Escribe el nombre exacto", text: $confirmName)
            Button("Eliminar", role: .destructive) {
                Task {
                    guard confirmName == site?.name else { return }
                    try? await IntegraSettingsDataStub.deleteSite(id: siteId, typedName: confirmName)
                    onDeleted()
                }
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Teclea «\(site?.name ?? "")» para confirmar. No se puede deshacer desde la app.")
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        site = try? await IntegraSettingsDataStub.sites().first { $0.id == siteId }
    }
}
