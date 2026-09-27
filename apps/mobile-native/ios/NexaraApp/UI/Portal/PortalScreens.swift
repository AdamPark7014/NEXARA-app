import SwiftUI
import PhotosUI
import UIKit

// MARK: - Profile

struct PortalProfileView: View {
    @State private var contactName = ""
    @State private var contactEmail = ""
    @State private var contactPhone = ""
    @State private var address = ""
    @State private var city = ""
    @State private var saving = false
    @State private var message: String?

    var body: some View {
        Form {
            if let message { Text(message).font(.footnote).foregroundColor(.green) }
            Section("Contacto") {
                TextField("Nombre", text: $contactName)
                TextField("Email", text: $contactEmail).keyboardType(.emailAddress)
                TextField("Teléfono", text: $contactPhone).keyboardType(.phonePad)
            }
            Section("Ubicación") {
                TextField("Dirección", text: $address)
                TextField("Ciudad", text: $city)
            }
            Section {
                Button(saving ? "Guardando…" : "Guardar") { Task { await save() } }.disabled(saving)
            }
        }
        .navigationTitle("Mi perfil")
        .task { await load() }
    }

    private func load() async {
        guard let p = try? await TicketsRepository.shared.portalProfile() else { return }
        contactName = p.contactName
        contactEmail = p.contactEmail
        contactPhone = p.contactPhone
        address = p.address
        city = p.city
    }

    private func save() async {
        saving = true; defer { saving = false }
        do {
            _ = try await TicketsRepository.shared.updateProfile(
                contactName: contactName, contactEmail: contactEmail, contactPhone: contactPhone,
                address: address, city: city, state: nil, country: nil
            )
            message = "Perfil actualizado"
        } catch { message = error.toUserMessage(fallback: "No se pudo actualizar el perfil") }
    }
}

// MARK: - Branches

struct PortalBranchesView: View {
    let onNew: () -> Void
    let onEdit: (Int64) -> Void
    @State private var branches: [PortalBranch] = []
    @State private var isLoading = true

    var body: some View {
        List {
            if isLoading && branches.isEmpty {
                NxLoadingState(text: "Cargando sucursales…")
                    .listRowSeparator(.hidden)
            } else if branches.isEmpty {
                ContentUnavailableView(
                    "Sin sucursales",
                    systemImage: "building.2",
                    description: Text("Agrega tu primera sucursal con el botón +.")
                )
                .listRowSeparator(.hidden)
            }
            ForEach(branches) { b in
                Button {
                    onEdit(b.id)
                } label: {
                    HStack(spacing: 12) {
                        if let url = b.logoUrl.nilIfEmpty,
                           let imgUrl = URL(string: url) {
                            AsyncImage(url: imgUrl) { img in
                                img.resizable().scaledToFill()
                            } placeholder: {
                                Color.gray.opacity(0.2)
                            }
                            .frame(width: 44, height: 44)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(b.name).font(.headline)
                            Text(b.subtitle)
                                .font(.caption).foregroundColor(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Sucursales")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { onNew() } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Nueva sucursal")
            }
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        // Un refresco fallido no borra la lista que ya se veía.
        if let nuevas = try? await TicketsRepository.shared.portalBranches() {
            branches = nuevas
        }
    }
}

// MARK: - Branch edit

struct PortalBranchEditView: View {
    let branchId: Int64?
    let onDone: () -> Void

    @State private var name = ""
    @State private var branchNumber = ""
    @State private var portalEmail = ""
    @State private var portalPassword = ""
    @State private var address = ""
    @State private var city = ""
    @State private var state = ""
    @State private var country = ""
    @State private var placeId = ""
    @State private var latitud = ""
    @State private var longitud = ""
    @State private var isActive = true
    @State private var logoItem: PhotosPickerItem?
    @State private var logoData: Data?
    @State private var existingLogoUrl: String?
    @State private var isLoading = true
    @State private var saving = false
    @State private var error: String?
    @State private var message: String?

    var body: some View {
        Form {
            if isLoading && branchId != nil {
                NxLoadingState(text: "Cargando sucursal…")
            }
            if let message {
                NxIconText(systemName: "checkmark.circle.fill", text: message)
                    .font(.footnote)
                    .foregroundStyle(CorePalette.green)
            }
            if let error {
                NxIconText(systemName: "exclamationmark.triangle.fill", text: error)
                    .font(.footnote)
                    .foregroundStyle(CorePalette.red)
            }
            Section("Datos") {
                TextField("Nombre *", text: $name)
                    .submitLabel(.next)
                TextField("Número de sucursal *", text: $branchNumber)
                    .submitLabel(.next)
                TextField("Usuario (correo) *", text: $portalEmail)
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField(branchId == nil ? "Contraseña *" : "Contraseña (opcional)", text: $portalPassword)
                    .textContentType(.newPassword)
            }
            Section("Dirección") {
                TextField("Dirección", text: $address)
                TextField("Ciudad", text: $city)
                TextField("Estado", text: $state)
                TextField("País", text: $country)
                TextField("Place ID (Google)", text: $placeId)
            }
            Section("Coordenadas") {
                TextField("Latitud", text: $latitud).keyboardType(.decimalPad)
                TextField("Longitud", text: $longitud).keyboardType(.decimalPad)
            }
            Section("Logo") {
                if let logoData, let ui = UIImage(data: logoData) {
                    Image(uiImage: ui).resizable().scaledToFit().frame(maxHeight: 120)
                } else if let existingLogoUrl, let url = URL(string: ApiUrls.absoluteAsset(existingLogoUrl)) {
                    AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { ProgressView() }
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
                Toggle("Sucursal activa", isOn: $isActive)
                Button(saving ? "Guardando…" : "Guardar") { Task { await save() } }
                    .disabled(saving || name.isEmpty || branchNumber.isEmpty || portalEmail.isEmpty || (branchId == nil && portalPassword.isEmpty))
            }
        }
        .navigationTitle(branchId == nil ? "Nueva sucursal" : "Editar sucursal")
        .task { await load() }
        .onChange(of: logoItem) { _, item in
            Task {
                if let data = try? await item?.loadTransferable(type: Data.self) { logoData = data }
            }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        guard let branchId else { return }
        do {
            let list = try await TicketsRepository.shared.portalBranches()
            guard let b = list.first(where: { $0.id == branchId }) else {
                error = "Sucursal no encontrada"
                return
            }
            name = b.name
            branchNumber = b.branchNumber
            portalEmail = b.portalEmail
            address = b.address
            city = b.city
            state = b.state
            country = b.country
            placeId = b.placeId
            if let lat = b.latitud { latitud = String(lat) }
            if let lng = b.longitud { longitud = String(lng) }
            isActive = b.isActive
            existingLogoUrl = b.logoUrl.nilIfEmpty
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar la sucursal")
        }
    }

    private func save() async {
        saving = true; error = nil; message = nil
        defer { saving = false }
        let lat = Double(latitud.trimmingCharacters(in: .whitespaces))
        let lng = Double(longitud.trimmingCharacters(in: .whitespaces))
        do {
            if let branchId {
                _ = try await TicketsRepository.shared.updateBranch(
                    id: branchId, name: name, branchNumber: branchNumber,
                    portalEmail: portalEmail, portalPassword: portalPassword.nilIfEmpty,
                    address: address.nilIfEmpty, city: city.nilIfEmpty, state: state.nilIfEmpty, country: country.nilIfEmpty,
                    placeId: placeId.nilIfEmpty, latitud: lat, longitud: lng, isActive: isActive,
                    logoData: logoData, logoFileName: "logo.jpg"
                )
                message = "Sucursal actualizada"
            } else {
                _ = try await TicketsRepository.shared.createBranch(
                    name: name, branchNumber: branchNumber, portalEmail: portalEmail, portalPassword: portalPassword,
                    address: address.nilIfEmpty, city: city.nilIfEmpty, state: state.nilIfEmpty, country: country.nilIfEmpty,
                    placeId: placeId.nilIfEmpty, latitud: lat, longitud: lng, isActive: isActive,
                    logoData: logoData, logoFileName: "logo.jpg"
                )
                message = "Sucursal creada"
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { onDone() }
            }
        } catch { self.error = error.toUserMessage(fallback: "No se pudo guardar la sucursal") }
    }
}

private extension String {
    func ifBlank(_ fallback: () -> String) -> String { isEmpty ? fallback() : self }
}

// MARK: - Requests

struct PortalRequestsView: View {
    let onNew: () -> Void
    @State private var items: [ClientTicketRequest] = []
    @State private var isLoading = true
    @State private var selected: ClientTicketRequest?

    var body: some View {
        Group {
            if let s = selected { reqDetail(s) } else { listBody }
        }
        .navigationTitle(selected == nil ? "Solicitudes" : "")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if selected == nil {
                    Button { onNew() } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Nueva solicitud")
                }
            }
        }
        .task { await reload() }
        .refreshable { if selected == nil { await reload() } }
    }

    private var listBody: some View {
        List {
            if isLoading && items.isEmpty {
                NxLoadingState(text: "Cargando solicitudes…")
                    .listRowSeparator(.hidden)
            } else if items.isEmpty {
                ContentUnavailableView {
                    Label("Sin solicitudes", systemImage: "tray")
                } description: {
                    Text("Pide un servicio y aquí verás en qué va.")
                } actions: {
                    Button("Nueva solicitud") { onNew() }
                        .buttonStyle(.borderedProminent)
                        .tint(NxBrand.primary)
                }
                .listRowSeparator(.hidden)
            }
            ForEach(items) { r in
                Button { selected = r } label: {
                    VStack(alignment: .leading, spacing: NxSpacing.xs + 2) {
                        Text(String(r.displayTitle.prefix(80)))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                        HStack {
                            OpsStatusChip(text: r.status.isEmpty ? r.urgency : r.status)
                            Spacer()
                            Text(NxFormat.parseISO(r.createdAt).map { NxFormat.friendly($0) } ?? String(r.createdAt.prefix(10)))
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, NxSpacing.xxs)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func reqDetail(_ r: ClientTicketRequest) -> some View {
        List {
            Section {
                Button { selected = nil } label: {
                    Label("Volver a solicitudes", systemImage: "chevron.backward")
                }
            }
            Section("Solicitud") {
                if !r.displayTitle.isEmpty { Text(r.displayTitle).font(.subheadline) }
                rRow("Estado", r.status.isEmpty ? "" : NxStatusText.label(r.status))
                rRow("Urgencia", r.urgency.isEmpty ? "" : NxStatusText.label(r.urgency))
                rRow("Tipo", r.requestType.isEmpty ? "" : NxStatusText.label(r.requestType))
                rRow("Sucursal", r.branchName)
                rRow("Creada", r.createdAt.isEmpty ? "" : (NxFormat.parseISO(r.createdAt).map { NxFormat.day($0) } ?? String(r.createdAt.prefix(10))))
                rRow("Vence", r.dueAt.isEmpty ? "" : (NxFormat.parseISO(r.dueAt).map { NxFormat.day($0) } ?? String(r.dueAt.prefix(10))))
            }
            if !r.isClosed, r.id > 0 {
                Section("Acciones") {
                    if r.isNew {
                        Button("Autorizar") {
                            Task { await decide(r.id, "APPROVED"); selected = nil }
                        }
                        Button("Rechazar", role: .destructive) {
                            Task { await decide(r.id, "REJECTED"); selected = nil }
                        }
                    }
                    Button("Cerrar solicitud", role: .destructive) {
                        Task { await close(r.id); selected = nil }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func rRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        // Un refresco fallido no borra la lista que ya se veía.
        if let nuevas = try? await TicketsRepository.shared.portalRequests() {
            items = nuevas
        }
    }

    private func close(_ id: Int64) async {
        do {
            try await TicketsRepository.shared.closeRequest(id: id)
            await reload()
        } catch { /* list refresh shows state */ }
    }

    private func decide(_ id: Int64, _ decision: String) async {
        do {
            try await TicketsRepository.shared.decideRequest(id: id, decision: decision)
            await reload()
        } catch { /* list refresh shows state */ }
    }
}

struct PortalRequestNewView: View {
    let onDone: () -> Void
    @EnvironmentObject private var session: SessionStore
    @State private var description = ""
    @State private var urgency = "MEDIUM"
    @State private var requestType = "ISSUE"
    @State private var branches: [PortalBranch] = []
    @State private var selectedBranchId: Int64?
    @State private var evidenceItems: [PhotosPickerItem] = []
    @State private var evidenceFiles: [(fileName: String, data: Data)] = []
    @State private var saving = false
    @State private var loadingBranches = false
    @State private var error: String?

    private var isBranchUser: Bool { session.currentUser?.isBranchUser == true }

    var body: some View {
        Form {
            Section("Nueva solicitud") {
                TextEditor(text: $description).frame(minHeight: 100)
                Picker("Urgencia", selection: $urgency) {
                    Text("Baja").tag("LOW")
                    Text("Media").tag("MEDIUM")
                    Text("Alta").tag("HIGH")
                }
                Picker("Tipo", selection: $requestType) {
                    Text("Incidencia").tag("ISSUE")
                    Text("Inventario preventivo").tag("PREVENTIVE_INVENTORY")
                }
            }
            if !isBranchUser {
                Section("Sucursal") {
                    if loadingBranches {
                        ProgressView()
                    } else if branches.isEmpty {
                        Text("Sin sucursales disponibles").foregroundStyle(.secondary)
                    } else {
                        Picker("Sucursal", selection: $selectedBranchId) {
                            Text("Sin seleccionar").tag(Optional<Int64>.none)
                            ForEach(branches) { b in
                                Text(b.name).tag(Optional(b.id))
                            }
                        }
                    }
                }
            }
            if isBranchUser {
                Section("Evidencias") {
                    PhotosPicker(selection: $evidenceItems, maxSelectionCount: 8, matching: .images) {
                        Label("Agregar fotos", systemImage: "photo.on.rectangle")
                    }
                    if !evidenceFiles.isEmpty {
                        Text("\(evidenceFiles.count) archivo(s) listos")
                            .font(.caption).foregroundStyle(.secondary)
                        Button("Quitar evidencias", role: .destructive) {
                            evidenceItems = []; evidenceFiles = []
                        }
                    }
                }
            }
            if let error { Text(error).foregroundColor(.red).font(.footnote) }
            Button(saving ? "Enviando…" : "Crear solicitud") { Task { await submit() } }
                .disabled(saving || description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .navigationTitle("Nueva solicitud")
        .task { await loadBranches() }
        .onChange(of: evidenceItems) { _, items in
            Task { await loadEvidence(items) }
        }
    }

    private func loadBranches() async {
        guard !isBranchUser else { return }
        loadingBranches = true
        defer { loadingBranches = false }
        do {
            branches = try await TicketsRepository.shared.portalBranches()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudieron cargar sucursales")
        }
    }

    private func loadEvidence(_ items: [PhotosPickerItem]) async {
        var files: [(fileName: String, data: Data)] = []
        for (idx, item) in items.enumerated() {
            if let data = try? await item.loadTransferable(type: Data.self) {
                files.append((fileName: "evidencia-\(idx + 1).jpg", data: data))
            }
        }
        evidenceFiles = files
    }

    private func submit() async {
        saving = true; error = nil
        defer { saving = false }
        do {
            _ = try await TicketsRepository.shared.createRequest(
                description: description,
                urgency: urgency,
                requestType: requestType,
                branchId: isBranchUser ? nil : selectedBranchId,
                evidenceFiles: isBranchUser ? evidenceFiles : []
            )
            onDone()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo crear la solicitud")
        }
    }
}

// MARK: - Tickets

struct PortalTicketsView: View {
    let onOpen: (Int64) -> Void
    @State private var tickets: [PortalTicket] = []
    @State private var query = ""
    @State private var filter = "todos" // todos | abiertos | alta | aging
    @State private var isLoading = true
    @State private var loaded = false
    @State private var loadError: String?

    private var openCount: Int { tickets.filter(\.isOpen).count }
    private var highCount: Int { tickets.filter { $0.isOpen && $0.isHighPriority }.count }
    private var agingCount: Int { tickets.filter { $0.isOpen && $0.ageHours >= 48 }.count }

    private var filtered: [PortalTicket] {
        let q = query.lowercased()
        return tickets.filter { t in
            let matchFilter: Bool = {
                switch filter {
                case "abiertos": return t.isOpen
                case "alta": return t.isOpen && t.isHighPriority
                case "aging": return t.isOpen && t.ageHours >= 48
                default: return true
                }
            }()
            guard matchFilter else { return false }
            guard !q.isEmpty else { return true }
            let hay = [t.title, t.anNumber, t.branchName, t.status]
                .joined(separator: " ").lowercased()
            return hay.contains(q)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Prioridad · antigüedad · estado operativo")
                    .font(.caption).foregroundColor(.secondary)
                NxKpiGrid(items: [
                    NxKpi(label: "Abiertos", value: "\(openCount)",
                          tone: openCount > 0 ? .warning : .success),
                    NxKpi(label: "Alta prioridad", value: "\(highCount)",
                          tone: highCount > 0 ? .danger : .neutral),
                    NxKpi(label: "Más de 48 h", value: "\(agingCount)", hint: "Sin cierre",
                          tone: agingCount > 0 ? .danger : .info),
                    NxKpi(label: "Total", value: "\(tickets.count)", tone: .brand),
                ])
                HStack(spacing: NxSpacing.s) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                    TextField("Buscar AN, título o sucursal", text: $query)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.search)
                    if !query.isEmpty {
                        Button { query = "" } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        }
                        .accessibilityLabel("Borrar búsqueda")
                    }
                }
                .padding(.horizontal, NxSpacing.m)
                .frame(minHeight: NxMetrics.minTap)
                .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: NxSpacing.s) {
                        ForEach([
                            ("todos", "Todos"),
                            ("abiertos", "Abiertos"),
                            ("alta", "Urgentes"),
                            ("aging", "Más de 48 h"),
                        ], id: \.0) { key, label in
                            let activo = filter == key
                            Button { filter = key } label: {
                                Text(label)
                                    .font(.subheadline.weight(activo ? .semibold : .regular))
                                    .padding(.horizontal, NxSpacing.m + 2)
                                    .frame(minHeight: 36)
                                    .foregroundStyle(activo ? Color.white : Color.primary)
                                    .background(
                                        activo ? NxBrand.primary : Color(.tertiarySystemFill),
                                        in: Capsule()
                                    )
                                    .contentShape(Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(activo ? .isSelected : [])
                        }
                    }
                }
            }
            .padding()

            if isLoading && !loaded {
                NxSkeletonRows(count: 5)
                    .padding(.horizontal)
                Spacer(minLength: 0)
            } else if let loadError, !loaded {
                NxErrorState(message: loadError) { Task { await reload() } }
            } else if filtered.isEmpty {
                ContentUnavailableView(
                    tickets.isEmpty ? "Sin tickets" : "Nada con este filtro",
                    systemImage: "ticket",
                    description: Text(tickets.isEmpty
                        ? "Cuando levantes una solicitud la verás aquí."
                        : "Prueba otro filtro o borra la búsqueda.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                if let loadError {
                    NxStaleBanner(message: loadError) { Task { await reload() } }
                        .padding(.horizontal)
                }
                List(filtered) { t in
                    Button {
                        onOpen(t.id)
                    } label: {
                        let ageH = t.ageHours
                        let open = t.isOpen
                        let tone: NxTone = {
                            if !open { return .success }
                            if t.isHighPriority || ageH >= 72 { return .danger }
                            if ageH >= 48 { return .warning }
                            return .info
                        }()
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(t.displayTitle)
                                .font(.headline)
                                .lineLimit(2)
                                Spacer()
                                NxStatusChip(
                                    text: NxStatusText.label(t.status),
                                    tone: tone
                                )
                            }
                            let meta = [
                                t.anNumber,
                                t.priority.isEmpty ? "" : "Prioridad \(NxStatusText.label(t.priority).lowercased())",
                                t.branchName,
                                open ? "\(ageH) h abierto" : "",
                            ].filter { !$0.isEmpty }.joined(separator: " · ")
                            if !meta.isEmpty {
                                Text(meta).font(.caption).foregroundColor(.secondary)
                            }
                            if open && ageH >= 48 {
                                NxIconText(systemName: "exclamationmark.triangle.fill", text: "Lleva más de 48 h sin cerrarse")
                                    .font(.caption2.weight(.semibold))
                                    .foregroundColor(.red)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Tickets")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            tickets = try await TicketsRepository.shared.portalTickets()
            loaded = true
            loadError = nil
        } catch {
            loadError = error.toUserMessage()
        }
    }
}

struct PortalTicketDetailView: View {
    let ticketId: Int64
    @State private var ticket: PortalTicket?
    @State private var reportData: Data?
    @State private var loadError: String?
    @State private var downloading = false
    @State private var downloadError: String?

    var body: some View {
        ScrollView {
            if let t = ticket {
                let ageH = t.ageHours
                let open = t.isOpen
                VStack(alignment: .leading, spacing: NxSpacing.m) {
                    VStack(alignment: .leading, spacing: NxSpacing.s) {
                        Text(t.displayTitle)
                            .font(.title3.weight(.bold))
                            .fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: NxSpacing.s) {
                            NxStatusChip(status: t.status)
                            if !t.anNumber.isEmpty {
                                Text(t.anNumber)
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: NxSpacing.s) {
                        detailRow("Prioridad", NxStatusText.label(t.displayPriority))
                        detailRow("Sucursal", t.branchName)
                        detailRow("Asignado", friendlyDate(t.assignedAt))
                    }
                    .nxCard()
                    VStack(alignment: .leading, spacing: NxSpacing.s) {
                        Text("Tiempo de atención")
                            .font(.subheadline.weight(.semibold))
                            .accessibilityAddTraits(.isHeader)
                        if open {
                            detailRow("Abierto desde hace", "\(ageH) h")
                            if ageH >= 48 {
                                NxIconText(systemName: "exclamationmark.triangle.fill", text: "Lleva más de 48 h sin cerrarse", tint: NxTone.danger.fg)
                                    .font(.caption.weight(.semibold))
                            } else {
                                NxIconText(systemName: "checkmark.circle", text: "Dentro del tiempo esperado", tint: NxTone.success.fg)
                                    .font(.caption)
                            }
                        } else {
                            detailRow("Cerrado", friendlyDate(t.completedAt))
                        }
                        let sla = t.slaDueAt.isEmpty ? t.dueAt : t.slaDueAt
                        if !sla.isEmpty { detailRow("Vence", friendlyDate(sla)) }
                    }
                    .nxCard()
                    Button {
                        Task { await downloadPdf() }
                    } label: {
                        if downloading {
                            ProgressView().tint(.white)
                        } else {
                            Label("Ver reporte PDF", systemImage: "doc.richtext")
                        }
                    }
                    .buttonStyle(NxPrimaryButtonStyle())
                    .disabled(downloading)
                    if let downloadError {
                        Text(downloadError)
                            .font(.footnote)
                            .foregroundStyle(NxTone.danger.fg)
                    }
                }
                .padding()
            } else if let loadError {
                NxErrorState(message: loadError) { Task { await load() } }
                    .padding(.top, NxSpacing.xxl)
            } else {
                NxLoadingState(text: "Cargando ticket…").padding(.top, NxSpacing.xxl)
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Ticket")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: Binding(
            get: { reportData.map { PDFSheetItem(data: $0) } },
            set: { reportData = $0?.data }
        )) { item in
            NavigationStack { PDFViewerScreen(title: "Reporte", data: item.data) }
        }
    }

    @ViewBuilder private func detailRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty && v != "—" {
            LabeledContent(k) {
                Text(v).multilineTextAlignment(.trailing)
            }
        }
    }

    private func friendlyDate(_ iso: String) -> String {
        guard !iso.isEmpty else { return "" }
        guard let date = NxFormat.parseISO(iso) else { return String(iso.prefix(16)) }
        return NxFormat.friendly(date)
    }

    private func load() async {
        do {
            ticket = try await TicketsRepository.shared.portalTicket(id: ticketId)
            loadError = nil
        } catch {
            loadError = error.toUserMessage()
        }
    }

    private func downloadPdf() async {
        downloading = true
        downloadError = nil
        defer { downloading = false }
        do {
            reportData = try await TicketsRepository.shared.ticketReportPdf(id: ticketId)
        } catch {
            downloadError = error.toUserMessage()
        }
    }
}

// MARK: - Feedback

struct PortalFeedbackView: View {
    @State private var items: [PendingFeedbackItem] = []
    @State private var isLoading = true
    @State private var drafts: [Int64: FeedbackDraft] = [:]
    @State private var savingId: Int64?
    @State private var message: String?
    @State private var error: String?

    var body: some View {
        List {
            if let message {
                NxIconText(systemName: "checkmark.circle.fill", text: message, tint: NxTone.success.fg)
                    .font(.footnote)
            }
            if let error {
                NxIconText(systemName: "exclamationmark.triangle.fill", text: error, tint: NxTone.danger.fg)
                    .font(.footnote)
            }
            if isLoading && items.isEmpty {
                NxLoadingState(text: "Cargando servicios por calificar…")
                    .listRowSeparator(.hidden)
            } else if items.isEmpty {
                ContentUnavailableView(
                    "Todo calificado",
                    systemImage: "star.bubble",
                    description: Text("Cuando terminemos un servicio te pediremos tu opinión aquí.")
                )
                .listRowSeparator(.hidden)
            }
            ForEach(items) { f in
                Section {
                    Text(f.displayTitle).font(.headline)
                    Text(NxFormat.parseISO(f.completedAt).map { "Terminado el \(NxFormat.day($0))" } ?? String(f.completedAt.prefix(10)))
                        .font(.caption).foregroundStyle(.secondary)
                    if f.id > 0 {
                        let id = f.id
                        Picker("Calificación", selection: binding(for: id).rating) {
                            ForEach(1...5, id: \.self) { Text("\($0)").tag(String($0)) }
                        }
                        triPicker("¿A tiempo?", binding: binding(for: id).wasOnTime)
                        triPicker("¿Amable?", binding: binding(for: id).wasFriendly)
                        triPicker("¿Resuelto?", binding: binding(for: id).wasSolved)
                        TextField("Comentarios", text: binding(for: id).comments, axis: .vertical)
                            .lineLimit(2...4)
                        Button(savingId == id ? "Enviando…" : "Enviar feedback") {
                            Task { await submit(activityId: id) }
                        }
                        .disabled(savingId != nil)
                    }
                }
            }
        }
        .navigationTitle("Calificar servicios")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func binding(for id: Int64) -> FeedbackDraftBinding {
        FeedbackDraftBinding(
            rating: Binding(
                get: { drafts[id]?.rating ?? "5" },
                set: { newValue in updateDraft(id) { $0.rating = newValue } }
            ),
            wasOnTime: Binding(
                get: { drafts[id]?.wasOnTime ?? "YES" },
                set: { newValue in updateDraft(id) { $0.wasOnTime = newValue } }
            ),
            wasFriendly: Binding(
                get: { drafts[id]?.wasFriendly ?? "YES" },
                set: { newValue in updateDraft(id) { $0.wasFriendly = newValue } }
            ),
            wasSolved: Binding(
                get: { drafts[id]?.wasSolved ?? "YES" },
                set: { newValue in updateDraft(id) { $0.wasSolved = newValue } }
            ),
            comments: Binding(
                get: { drafts[id]?.comments ?? "" },
                set: { newValue in updateDraft(id) { $0.comments = newValue } }
            )
        )
    }

    private func updateDraft(_ id: Int64, _ block: (inout FeedbackDraft) -> Void) {
        var d = drafts[id] ?? FeedbackDraft()
        block(&d)
        drafts[id] = d
    }

    @ViewBuilder private func triPicker(_ label: String, binding: Binding<String>) -> some View {
        Picker(label, selection: binding) {
            Text("Sí").tag("YES")
            Text("No").tag("NO")
            Text("No aplica").tag("NA")
        }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        if let nuevos = try? await TicketsRepository.shared.pendingFeedbackItems() {
            items = nuevos
        }
        for f in items where drafts[f.id] == nil {
            drafts[f.id] = FeedbackDraft()
        }
    }

    private func submit(activityId: Int64) async {
        savingId = activityId; error = nil; message = nil
        defer { savingId = nil }
        let d = drafts[activityId] ?? FeedbackDraft()
        do {
            try await TicketsRepository.shared.submitFeedback(
                activityId: activityId,
                rating: Int(d.rating),
                wasOnTime: d.wasOnTime, wasFriendly: d.wasFriendly, wasSolved: d.wasSolved,
                comments: d.comments.nilIfEmpty
            )
            message = "¡Gracias! Tu calificación se envió."
            await reload()
        } catch { self.error = error.toUserMessage() }
    }
}

private struct FeedbackDraft {
    var rating = "5"
    var wasOnTime = "YES"
    var wasFriendly = "YES"
    var wasSolved = "YES"
    var comments = ""
}

private struct FeedbackDraftBinding {
    var rating: Binding<String>
    var wasOnTime: Binding<String>
    var wasFriendly: Binding<String>
    var wasSolved: Binding<String>
    var comments: Binding<String>
}

// MARK: - Inventories

struct PortalInventoriesView: View {
    let onOpen: (Int64) -> Void
    @State private var items: [PortalInventorySnapshot] = []
    @State private var search = ""
    @State private var isLoading = true

    var body: some View {
        VStack(spacing: 0) {
            TextField("Buscar inventario…", text: $search)
                .textFieldStyle(.roundedBorder)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .padding()
                .onSubmit { Task { await reload() } }
            if isLoading && items.isEmpty {
                NxSkeletonRows(count: 4).padding(.horizontal)
                Spacer(minLength: 0)
            } else if items.isEmpty {
                ContentUnavailableView(
                    search.isEmpty ? "Sin inventarios" : "Sin resultados",
                    systemImage: "shippingbox",
                    description: Text(search.isEmpty
                        ? "Los conteos de inventario de tus sucursales aparecerán aquí."
                        : "Prueba con otra palabra.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(items) { inv in
                    Button {
                        onOpen(inv.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(inv.displayTitle).font(.headline)
                            HStack {
                                OpsStatusChip(text: inv.status.isEmpty ? "—" : inv.status)
                                if !inv.branchName.isEmpty {
                                    Text(inv.branchName).font(.caption).foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Inventarios")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        let q = search.isEmpty ? nil : search
        if let nuevos = try? await TicketsRepository.shared.portalInventories(search: q) {
            items = nuevos
        }
    }
}

struct PortalInventoryDetailView: View {
    let inventoryId: Int64
    @State private var detail: PortalInventorySnapshot?
    @State private var reportData: Data?
    @State private var notes = ""
    @State private var markCompleted = false
    @State private var confirmDifference = false
    @State private var saving = false
    @State private var message: String?
    @State private var error: String?
    @State private var loadError: String?
    @State private var loadingPdf = false

    var body: some View {
        ScrollView {
            if let d = detail {
                VStack(alignment: .leading, spacing: NxSpacing.m) {
                    if let message {
                        NxIconText(systemName: "checkmark.circle.fill", text: message)
                            .font(.footnote)
                            .foregroundStyle(CorePalette.green)
                    }
                    if let error {
                        NxIconText(systemName: "exclamationmark.triangle.fill", text: error)
                            .font(.footnote)
                            .foregroundStyle(CorePalette.red)
                    }
                    VStack(alignment: .leading, spacing: NxSpacing.s) {
                        Text(d.displayTitle).font(.title3.weight(.bold))
                        NxStatusChip(status: d.status)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .nxCard()

                    if !d.items.isEmpty {
                        VStack(alignment: .leading, spacing: NxSpacing.s) {
                            Text("Artículos (\(d.items.count))")
                                .font(.headline)
                                .accessibilityAddTraits(.isHeader)
                            ForEach(d.items) { it in
                                Text(it.displayName)
                                    .font(.subheadline)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                if it.id != d.items.last?.id { Divider() }
                            }
                        }
                        .nxCard()
                    }

                    VStack(alignment: .leading, spacing: NxSpacing.m) {
                        TextField("Notas", text: $notes, axis: .vertical)
                            .lineLimit(2...5)
                            .textFieldStyle(.roundedBorder)
                        Toggle("Marcar como completado", isOn: $markCompleted)
                        Toggle("Confirmar la diferencia", isOn: $confirmDifference)
                        Button(saving ? "Guardando…" : "Sincronizar") { Task { await sync() } }
                            .buttonStyle(NxPrimaryButtonStyle())
                            .disabled(saving)
                        HStack(spacing: NxSpacing.s) {
                            Button("Aprobar") { Task { await decide("APPROVE") } }
                                .buttonStyle(.bordered)
                                .tint(CorePalette.green)
                                .frame(maxWidth: .infinity)
                            Button("Rechazar", role: .destructive) { Task { await decide("REJECT") } }
                                .buttonStyle(.bordered)
                                .frame(maxWidth: .infinity)
                        }
                        .controlSize(.large)
                        .disabled(saving)
                    }
                    .nxCard()

                    Button {
                        Task { await openReport() }
                    } label: {
                        Label(loadingPdf ? "Preparando reporte…" : "Ver reporte PDF", systemImage: "doc.richtext")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(NxSecondaryButtonStyle())
                    .disabled(loadingPdf)
                }
                .padding()
            } else if let loadError {
                NxErrorState(message: loadError) { Task { await load() } }
                    .padding(.top, 40)
            } else {
                NxLoadingState(text: "Cargando inventario…")
                    .padding(.top, 40)
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Inventario")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: Binding(
            get: { reportData.map { PDFSheetItem(data: $0) } },
            set: { reportData = $0?.data }
        )) { item in
            NavigationStack { PDFViewerScreen(title: "Inventario", data: item.data) }
        }
    }

    private func load() async {
        do {
            let d = try await TicketsRepository.shared.portalInventoryDetail(id: inventoryId)
            let firstLoad = detail == nil
            detail = d
            loadError = nil
            if firstLoad {
                notes = d.notes
                markCompleted = d.status.uppercased() == "COMPLETED"
            }
        } catch {
            if detail == nil {
                loadError = error.toUserMessage(fallback: "No se pudo cargar el inventario")
            } else {
                self.error = error.toUserMessage(fallback: "No se pudo actualizar el inventario")
            }
        }
    }

    private func openReport() async {
        loadingPdf = true
        defer { loadingPdf = false }
        do {
            reportData = try await TicketsRepository.shared.inventoryReportPdf(id: inventoryId)
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo abrir el reporte")
        }
    }

    private func sync() async {
        guard let d = detail else { return }
        guard let branchId = d.branchId else { error = "Sucursal no disponible"; return }
        saving = true; error = nil; message = nil
        defer { saving = false }
        do {
            let updated = try await TicketsRepository.shared.syncInventory(
                branchId: branchId, snapshotId: inventoryId,
                title: d.title.nilIfEmpty,
                notes: notes.nilIfEmpty, completed: markCompleted, confirmDifference: confirmDifference
            )
            detail = PortalInventorySnapshot(raw: updated)
            message = "Inventario sincronizado"
        } catch { self.error = error.toUserMessage() }
    }

    private func decide(_ decision: String) async {
        saving = true; error = nil; message = nil
        defer { saving = false }
        do {
            let updated = try await TicketsRepository.shared.decideInventory(id: inventoryId, decision: decision)
            detail = PortalInventorySnapshot(raw: updated)
            message = "Inventario actualizado"
        } catch { self.error = error.toUserMessage() }
    }
}

private struct PDFSheetItem: Identifiable {
    let id = UUID()
    let data: Data
}

/// Wrapper con navegación interna para deep links del catálogo.
struct PortalBranchesModuleView: View {
    @State private var path: [PortalRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            PortalBranchesView(
                onNew: { path.append(.branchNew) },
                onEdit: { path.append(.branchEdit($0)) }
            )
            .navigationDestination(for: PortalRoute.self) { route in
                switch route {
                case .branchNew: PortalBranchEditView(branchId: nil, onDone: { path.removeLast() })
                case .branchEdit(let id): PortalBranchEditView(branchId: id, onDone: { path.removeLast() })
                default: EmptyView()
                }
            }
        }
    }
}
