import SwiftUI

struct IntegraSiteAdminRow: Identifiable, Hashable {
    let id: Int
    var name: String
    var label: String?
    var active: Bool
    var isDefault: Bool
    var provider: String?
    var host: String?
}

enum IntegraSettingsService {
    static let providers = ["ARTEMIS", "HCT", "ISAPI"]

    static func parseSite(_ m: [String: Any]) -> IntegraSiteAdminRow? {
        guard let id = m.integraInt("id") else { return nil }
        return IntegraSiteAdminRow(
            id: id,
            name: m.integraStr("name") ?? "Sitio \(id)",
            label: m.integraStr("label"),
            active: m.integraBool("isActive", "active") ?? true,
            isDefault: m.integraBool("isDefault", "default") ?? false,
            provider: m.integraStr("provider"),
            host: m.integraStr("host")
        )
    }

    static func sites() async throws -> [IntegraSiteAdminRow] {
        try await IntegraSettingsRepository.sites().compactMap(parseSite)
    }

    static func createSite(
        name: String,
        label: String,
        host: String,
        appKey: String,
        appSecret: String,
        provider: String,
        isFirstSite: Bool
    ) async throws {
        _ = try await IntegraSettingsRepository.createSite(
            name: name,
            host: host,
            appKey: appKey,
            appSecret: appSecret,
            label: label,
            provider: provider,
            isFirstSite: isFirstSite
        )
    }

    static func deleteSite(id: Int) async throws {
        try await IntegraSettingsRepository.deleteSite(id: id)
    }

    static func setDefault(id: Int) async throws {
        try await IntegraSettingsRepository.makeDefault(id: id)
    }

    static func setActive(id: Int, active: Bool) async throws {
        try await IntegraSettingsRepository.setActive(id: id, active: active)
    }

    static func syncSite(id: Int) async throws {
        _ = try await IntegraSettingsRepository.runSync(siteId: id)
    }

    static func draftProblems(name: String, host: String, appKey: String, appSecret: String, provider: String) -> [String] {
        var out = IntegraSettingsRepository.siteDraftProblems(
            name: name, host: host, appKey: appKey, appSecret: appSecret
        )
        if !providers.contains(provider.uppercased()) {
            out.append("Tipo de conexión no reconocido.")
        }
        return out
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
    @State private var capabilityCounts: IntegraCapabilityCounts?
    @State private var regionNames: [String] = []

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
                    if let c = capabilityCounts, !c.isEmpty {
                        Section("Lo que hay en el espejo") {
                            ForEach(Array(c.entries.enumerated()), id: \.offset) { _, entry in
                                LabeledContent(entry.key, value: "\(entry.value)")
                            }
                            if !c.modules.isEmpty {
                                Text(
                                    "Módulos encendidos: "
                                        + c.modules.filter(\.on).map(\.key).joined(separator: ", ")
                                        .ifEmpty("ninguno")
                                )
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }
                        }
                    }
                    if !regionNames.isEmpty {
                        Section("Regiones del espejo") {
                            Text(regionNames.joined(separator: " · "))
                                .font(.caption)
                                .foregroundStyle(.secondary)
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
        do {
            sites = try await IntegraSettingsService.sites()
            capabilityCounts = try? await IntegraSettingsRepository.capabilities()
            regionNames = (try? await IntegraSettingsRepository.regions()) ?? []
        } catch {
            errorText = error.localizedDescription
        }
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}
struct IntegraNewSiteView: View {
    var onCreated: () -> Void = {}

    @State private var name = ""
    @State private var label = ""
    @State private var host = ""
    @State private var appKey = ""
    @State private var appSecret = ""
    @State private var provider = "ARTEMIS"
    @State private var saving = false
    @State private var errorText: String?
    @State private var existingCount = 0

    var body: some View {
        Form {
            Section("Identidad") {
                TextField("Nombre del sitio", text: $name)
                TextField("Etiqueta (opcional)", text: $label)
            }
            Section("Conexión") {
                TextField("Host (https://…)", text: $host)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Picker("Proveedor", selection: $provider) {
                    ForEach(IntegraSettingsService.providers, id: \.self) { Text($0).tag($0) }
                }
                SecureField("App key", text: $appKey)
                    .textInputAutocapitalization(.never)
                SecureField("App secret", text: $appSecret)
                    .textInputAutocapitalization(.never)
            }
            if let errorText {
                Section { Text(errorText).foregroundStyle(NxTone.danger.fg) }
            }
            Button(saving ? "Creando…" : "Crear") {
                Task { await create() }
            }
            .disabled(saving)
        }
        .navigationTitle("Nuevo sitio")
        .task {
            existingCount = (try? await IntegraSettingsService.sites().count) ?? 0
        }
    }

    private func create() async {
        let problems = IntegraSettingsService.draftProblems(
            name: name, host: host, appKey: appKey, appSecret: appSecret, provider: provider
        )
        if let first = problems.first {
            errorText = first
            return
        }
        saving = true
        errorText = nil
        defer { saving = false }
        do {
            try await IntegraSettingsService.createSite(
                name: name,
                label: label,
                host: host,
                appKey: appKey,
                appSecret: appSecret,
                provider: provider,
                isFirstSite: existingCount == 0
            )
            onCreated()
        } catch {
            errorText = error.localizedDescription
        }
    }
}

struct IntegraSiteDetailView: View {
    let siteId: Int
    var onDeleted: () -> Void = {}

    @State private var site: IntegraSiteAdminRow?
    @State private var confirmName = ""
    @State private var showDelete = false
    @State private var message: String?
    @State private var errorText: String?
    @State private var isLoading = true
    @State private var busy = false
    @State private var lastSync: [String: Any]?
    @State private var fanout: [AcsFanoutEntry] = []
    @State private var siteCaps: IntegraCapabilityCounts?
    @State private var siteRegions: [String] = []

    var body: some View {
        Form {
            if isLoading {
                ProgressView()
            } else if let site {
                Section("Sitio") {
                    Text(site.name).font(.headline)
                    if let host = site.host {
                        Text(host).font(.caption.monospaced()).foregroundStyle(.secondary)
                    }
                    Text(IntegraRules.providerLabel(site.provider)).foregroundStyle(.secondary)
                    Button("Marcar como predeterminado") {
                        Task {
                            busy = true
                            defer { busy = false }
                            do {
                                try await IntegraSettingsService.setDefault(id: siteId)
                                message = "Predeterminado actualizado"
                                errorText = nil
                                await load()
                            } catch {
                                errorText = error.localizedDescription
                            }
                        }
                    }
                    .disabled(busy || site.isDefault)
                    Button(site.active ? "Desactivar sitio" : "Activar sitio") {
                        Task {
                            busy = true
                            defer { busy = false }
                            do {
                                try await IntegraSettingsService.setActive(id: siteId, active: !site.active)
                                message = site.active ? "Sitio desactivado" : "Sitio activado"
                                errorText = nil
                                await load()
                            } catch {
                                errorText = error.localizedDescription
                            }
                        }
                    }
                    .disabled(busy)
                    Button("Sincronizar espejo") {
                        Task {
                            busy = true
                            defer { busy = false }
                            do {
                                try await IntegraSettingsService.syncSite(id: siteId)
                                message = "Sincronización solicitada"
                                errorText = nil
                                await load()
                            } catch {
                                errorText = error.localizedDescription
                            }
                        }
                    }
                    .disabled(busy)
                }
                if let lastSync, !lastSync.isEmpty {
                    Section("Última corrida") {
                        if let status = lastSync.integraStr("status") {
                            LabeledContent("Estado", value: IntegraRules.syncStatusLabel(status))
                        }
                        if let finished = lastSync.integraStr("finishedAt") {
                            LabeledContent("Terminó", value: IntegraFormat.relative(finished))
                        }
                        if let cams = lastSync.integraInt("cameras") {
                            LabeledContent("Cámaras", value: "\(cams)")
                        }
                        if let doors = lastSync.integraInt("doors") {
                            LabeledContent("Puertas", value: "\(doors)")
                        }
                        if let err = lastSync.integraStr("error") {
                            Text(err).font(.caption).foregroundStyle(NxTone.danger.fg)
                        }
                    }
                }
                if let siteCaps, !siteCaps.isEmpty {
                    Section("Capacidades del sitio") {
                        ForEach(Array(siteCaps.entries.enumerated()), id: \.offset) { _, entry in
                            LabeledContent(entry.key, value: "\(entry.value)")
                        }
                        if !siteCaps.modules.isEmpty {
                            Text(
                                "Módulos: "
                                    + siteCaps.modules.map { "\($0.key)=\($0.on ? "sí" : "no")" }
                                    .joined(separator: " · ")
                            )
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                    }
                }
                if !siteRegions.isEmpty {
                    Section("Regiones") {
                        Text(siteRegions.joined(separator: " · "))
                            .font(.caption)
                    }
                }
                if !fanout.isEmpty {
                    Section("Últimos envíos a las terminales ACS") {
                        ForEach(fanout.prefix(10)) { entry in
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(entry.op) · \(entry.employeeNo)")
                                        .font(.subheadline)
                                    Text(
                                        "\(entry.at.map { IntegraFormat.relative($0) } ?? "—") · \(entry.okCount) ok / \(entry.failCount) fallos"
                                    )
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    if let note = entry.note, !note.isEmpty {
                                        Text(note).font(.caption2).foregroundStyle(.secondary)
                                    }
                                }
                                Spacer()
                                if entry.pendingRetry {
                                    NxStatusChip(text: "Reintento", tone: .warning)
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
                    Button("Eliminar sitio", role: .destructive) { showDelete = true }
                        .disabled(busy)
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
                    guard confirmName == site?.name else {
                        errorText = "El nombre no coincide."
                        return
                    }
                    do {
                        try await IntegraSettingsService.deleteSite(id: siteId)
                        onDeleted()
                    } catch {
                        errorText = error.localizedDescription
                    }
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
        site = try? await IntegraSettingsService.sites().first { $0.id == siteId }
        lastSync = try? await IntegraSettingsRepository.lastSync(siteId: siteId)
        fanout = (try? await IntegraSettingsRepository.acsFanout(siteId: siteId)) ?? []
        siteCaps = try? await IntegraSettingsRepository.capabilities(siteId: siteId)
        siteRegions = (try? await IntegraSettingsRepository.regions(siteId: siteId)) ?? []
    }
}