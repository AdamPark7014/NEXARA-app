import SwiftUI

/// Detalle de cliente (`/erp/clientes/:id`): datos fiscales, sectores (con
/// «+ sector» de los que el usuario maneja) y, en PROYECTO, sus proyectos
/// operativos con alta rápida.
struct ClienteDetailView: View {
    let clientId: Int

    @EnvironmentObject var session: SessionStore
    @State private var client: CoreSalesClient?
    @State private var projects: [CoreOperationalProject] = []
    @State private var error: String?
    @State private var notice: String?
    @State private var busy = false
    @State private var projectTitle = ""
    @State private var projectStart = Date()

    private var mySectors: [ClientSector] { ClientSector.sectors(for: session.currentUser?.email) }

    private var addable: [ClientSector] {
        let current = Set(client?.clientSectors ?? [])
        return ClientSector.allCases.filter { mySectors.contains($0) && !current.contains($0) }
    }

    var body: some View {
        List {
            if let client {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(client.name).font(.title3.bold())
                        Text("Encargado: \(nonEmpty(client.owner?.nombre))")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.vertical, 4)
                }

                Section("Fiscal") {
                    field("Razón social", nonEmpty(client.legalName))
                    field("RFC", nonEmpty(client.taxId))
                    field("Dirección", nonEmpty(client.fiscalAddress))
                    field("CP / régimen", joined([client.fiscalZipCode, client.fiscalRegime]))
                    field("Contacto", joined([client.billingEmail, client.billingPhone]))
                }

                Section("Sectores") {
                    if client.clientSectors.isEmpty {
                        Text("Sin sector").foregroundColor(.secondary)
                    } else {
                        CoreFlowLayout(spacing: 6) {
                            ForEach(client.clientSectors) { s in
                                Text("\(s.emoji) \(s.shortTitle)")
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color(.tertiarySystemFill), in: Capsule())
                            }
                        }
                    }
                    ForEach(addable) { s in
                        Button("+ \(s.shortTitle)") { Task { await addSector(s) } }
                            .disabled(busy)
                    }
                }

                if client.clientSectors.contains(.proyecto) {
                    projectsSection(client)
                }
            } else if error == nil {
                Section { ProgressView("Cargando…") }
            }

            if let notice {
                Section { Text(notice).font(.footnote).foregroundColor(.green) }
            }
            if let error {
                Section {
                    Text(error).font(.footnote).foregroundColor(.red)
                    if client == nil {
                        Button("Reintentar") { Task { await load() } }
                    }
                }
            }
        }
        .navigationTitle(client?.name ?? "Cliente")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }

    @ViewBuilder
    private func projectsSection(_ client: CoreSalesClient) -> some View {
        Section("Proyectos (\(projects.count))") {
            if client.serviceClientId == nil {
                Text("Falta puente operativo.").foregroundColor(.secondary)
            } else {
                if projects.isEmpty {
                    Text("Sin proyectos aún.").foregroundColor(.secondary)
                } else {
                    ForEach(projects) { p in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.title).font(.subheadline.weight(.semibold))
                            Text(p.statusLabel).font(.caption).foregroundColor(.secondary)
                        }
                    }
                }
                if mySectors.contains(.proyecto) {
                    TextField("Nombre del proyecto", text: $projectTitle)
                    DatePicker("Inicio", selection: $projectStart, displayedComponents: .date)
                        .environment(\.locale, Locale(identifier: "es_MX"))
                    Button(busy ? "Creando…" : "Crear proyecto") {
                        Task { await createProject() }
                    }
                    .disabled(busy)
                }
            }
        }
    }

    private func field(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundColor(.secondary)
            Text(value).font(.subheadline).textSelection(.enabled)
        }
    }

    private func nonEmpty(_ value: String?) -> String {
        let v = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return v.isEmpty ? "—" : v
    }

    private func joined(_ values: [String?]) -> String {
        let parts = values.compactMap { $0?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        return parts.isEmpty ? "—" : parts.joined(separator: " · ")
    }

    private func load() async {
        error = nil
        do {
            let c = try await ClientesRepository.shared.detail(id: clientId)
            client = c
            if let serviceId = c.serviceClientId {
                projects = (try? await ClientesRepository.shared.projects(serviceClientId: serviceId)) ?? []
            } else {
                projects = []
            }
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar")
        }
    }

    private func addSector(_ sector: ClientSector) async {
        busy = true
        error = nil
        notice = nil
        defer { busy = false }
        do {
            if let updated = try await ClientesRepository.shared.addSector(clientId: clientId, sector: sector) {
                client = updated
                if updated.clientSectors.contains(.proyecto), let serviceId = updated.serviceClientId {
                    projects = (try? await ClientesRepository.shared.projects(serviceClientId: serviceId)) ?? []
                }
            } else {
                notice = "Sin conexión: el sector se agregará al recuperar la red."
            }
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo agregar sector")
        }
    }

    private func createProject() async {
        guard let serviceId = client?.serviceClientId,
              let vendorId = session.currentUser.flatMap({ Int($0.id) }) else { return }
        let title = projectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard title.count >= 3 else {
            error = "Título muy corto"
            return
        }
        let fmt = DateFormatter()
        fmt.calendar = Calendar(identifier: .gregorian)
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.timeZone = .current
        fmt.dateFormat = "yyyy-MM-dd"
        busy = true
        error = nil
        notice = nil
        defer { busy = false }
        do {
            try await ClientesRepository.shared.createProject(
                title: title,
                serviceClientId: serviceId,
                vendorId: vendorId,
                startDate: fmt.string(from: projectStart)
            )
            projectTitle = ""
            await load()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo crear el proyecto")
        }
    }
}
