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
        } catch { message = error.localizedDescription }
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
            if isLoading { ProgressView() }
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
        .toolbar { ToolbarItem(placement: .primaryAction) { Button { onNew() } label: { Image(systemName: "plus") } } } }
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        branches = (try? await TicketsRepository.shared.portalBranches()) ?? []
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
            if let message { Text(message).foregroundColor(.green).font(.footnote) }
            if let error { Text(error).foregroundColor(.red).font(.footnote) }
            Section("Datos") {
                TextField("Nombre *", text: $name)
                TextField("Número de sucursal *", text: $branchNumber)
                TextField("Usuario (email) *", text: $portalEmail).keyboardType(.emailAddress)
                TextField(branchId == nil ? "Password *" : "Password (opcional)", text: $portalPassword)
            }
            Section("Dirección") {
                TextField("Dirección", text: $address)
                TextField("Ciudad", text: $city)
                TextField("Estado", text: $state)
                TextField("País", text: $country)
            }
            Section("Coordenadas") {
                TextField("Latitud", text: $latitud).keyboardType(.decimalPad)
                TextField("Longitud", text: $longitud).keyboardType(.decimalPad)
            }
            Section("Logo") {
                if let logoData, let ui = UIImage(data: logoData) {
                    Image(uiImage: ui).resizable().scaledToFit().frame(maxHeight: 120)
                } else if let existingLogoUrl, let url = URL(string: existingLogoUrl) {
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
        let list = (try? await TicketsRepository.shared.portalBranches()) ?? []
        guard let b = list.first(where: { $0.id == branchId }) else { return }
        name = b.name
        branchNumber = b.branchNumber
        portalEmail = b.portalEmail
        address = b.address
        city = b.city
        state = b.state
        country = b.country
        if let lat = b.latitud { latitud = String(lat) }
        if let lng = b.longitud { longitud = String(lng) }
        isActive = b.isActive
        existingLogoUrl = b.logoUrl.nilIfEmpty
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
                    placeId: nil, latitud: lat, longitud: lng, isActive: isActive,
                    logoData: logoData, logoFileName: "logo.jpg"
                )
                message = "Sucursal actualizada"
            } else {
                _ = try await TicketsRepository.shared.createBranch(
                    name: name, branchNumber: branchNumber, portalEmail: portalEmail, portalPassword: portalPassword,
                    address: address.nilIfEmpty, city: city.nilIfEmpty, state: state.nilIfEmpty, country: country.nilIfEmpty,
                    placeId: nil, latitud: lat, longitud: lng, isActive: isActive,
                    logoData: logoData, logoFileName: "logo.jpg"
                )
                message = "Sucursal creada"
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { onDone() }
            }
        } catch { self.error = error.localizedDescription }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
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
                if selected == nil { Button { onNew() } label: { Image(systemName: "plus") } }
            }
        }
        .task { await reload() }
        .refreshable { if selected == nil { await reload() } }
    }

    private var listBody: some View {
        List {
            if isLoading { ProgressView() }
            ForEach(items) { r in
                Button { selected = r } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(String(r.displayTitle.prefix(80)))
                            .font(.subheadline).bold().foregroundColor(.primary)
                        HStack {
                            OpsStatusChip(text: r.status.isEmpty ? r.urgency : r.status)
                            Spacer()
                            Text(String(r.createdAt.prefix(10)))
                                .font(.caption2).foregroundColor(.secondary)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func reqDetail(_ r: ClientTicketRequest) -> some View {
        let status = r.status.uppercased()
        List {
            Section {
                Button("← Solicitudes") { selected = nil }
            }
            Section("Solicitud") {
                if !r.displayTitle.isEmpty { Text(r.displayTitle).font(.subheadline) }
                rRow("Estado", r.status)
                rRow("Urgencia", r.urgency)
                rRow("Tipo", r.requestType)
                rRow("Sucursal", r.branchName)
                rRow("Creada", String(r.createdAt.prefix(10)))
                rRow("Vence", String(r.dueAt.prefix(10)))
            }
            if status != "CLOSED", status != "CERRADA", r.id > 0 {
                Section {
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
        items = (try? await TicketsRepository.shared.portalRequests()) ?? []
    }

    private func close(_ id: Int64) async {
        try? await TicketsRepository.shared.closeRequest(id: id)
        await reload()
    }
}

struct PortalRequestNewView: View {
    let onDone: () -> Void
    @State private var description = ""
    @State private var urgency = "MEDIUM"
    @State private var requestType = "ISSUE"
    @State private var saving = false
    @State private var error: String?

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
            if let error { Text(error).foregroundColor(.red).font(.footnote) }
            Button(saving ? "Enviando…" : "Crear solicitud") { Task { await submit() } }.disabled(saving || description.isEmpty)
        }
        .navigationTitle("Nueva solicitud")
    }

    private func submit() async {
        saving = true; error = nil
        defer { saving = false }
        do {
            _ = try await TicketsRepository.shared.createRequest(
                description: description, urgency: urgency, requestType: requestType, branchId: nil
            )
            onDone()
        } catch { self.error = error.localizedDescription }
    }
}

// MARK: - Tickets

struct PortalTicketsView: View {
    let onOpen: (Int64) -> Void
    @State private var tickets: [PortalTicket] = []
    @State private var query = ""
    @State private var filter = "todos" // todos | abiertos | alta | aging
    @State private var isLoading = true

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
                    NxKpi(label: ">48h", value: "\(agingCount)", hint: "Sin cierre",
                          tone: agingCount > 0 ? .danger : .info),
                    NxKpi(label: "Total", value: "\(tickets.count)", tone: .brand),
                ])
                TextField("Buscar AN, título o sucursal", text: $query)
                    .textFieldStyle(.roundedBorder)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach([
                            ("todos", "Todos"),
                            ("abiertos", "Abiertos"),
                            ("alta", "Alta"),
                            ("aging", ">48h"),
                        ], id: \.0) { key, label in
                            Button(label) { filter = key }
                                .buttonStyle(.bordered)
                                .tint(filter == key ? .teal : .secondary)
                        }
                    }
                }
            }
            .padding()

            if isLoading {
                Spacer(); ProgressView(); Spacer()
            } else if filtered.isEmpty {
                Text("No hay tickets con este filtro.")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
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
                                    text: t.status.isEmpty ? "—" : t.status,
                                    tone: tone
                                )
                            }
                            let meta = [
                                t.anNumber,
                                t.priority.isEmpty ? "" : "Prioridad \(t.priority)",
                                t.branchName,
                                open ? "\(ageH)h abiertos" : "",
                            ].filter { !$0.isEmpty }.joined(separator: " · ")
                            if !meta.isEmpty {
                                Text(meta).font(.caption).foregroundColor(.secondary)
                            }
                            if open && ageH >= 48 {
                                Text("⚠ Fuera de ventana operativa (>48h)")
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
        tickets = (try? await TicketsRepository.shared.portalTickets()) ?? []
    }
}

struct PortalTicketDetailView: View {
    let ticketId: Int64
    @State private var ticket: PortalTicket?
    @State private var reportData: Data?

    var body: some View {
        ScrollView {
            if let t = ticket {
                let ageH = t.ageHours
                let open = t.isOpen
                VStack(alignment: .leading, spacing: 12) {
                    Text(t.displayTitle).font(.title3).bold()
                    detailRow("Estado", t.status)
                    detailRow("Prioridad", t.displayPriority)
                    detailRow("Sucursal", t.branchName)
                    detailRow("Asignación", String(t.assignedAt.prefix(16)))
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Operación / SLA").font(.subheadline.weight(.semibold))
                        if open {
                            detailRow("Antigüedad", "\(ageH) horas abiertos")
                            if ageH >= 48 {
                                Text("Fuera de ventana operativa (>48h)")
                                    .font(.caption.weight(.semibold))
                                    .foregroundColor(.red)
                            } else {
                                Text("Dentro de ventana operativa")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        } else {
                            detailRow("Cierre", String(t.completedAt.prefix(16)))
                        }
                        let sla = t.slaDueAt.isEmpty ? t.dueAt : t.slaDueAt
                        if !sla.isEmpty { detailRow("SLA / vencimiento", String(sla.prefix(16))) }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    Button("Descargar reporte PDF") { Task { await downloadPdf() } }
                        .buttonStyle(.borderedProminent).tint(.teal)
                }
                .padding()
            } else { ProgressView().padding(.top, 40) }
        }
        .navigationTitle("Detalle ticket")
        .task { ticket = try? await TicketsRepository.shared.portalTicket(id: ticketId) }
        .sheet(item: Binding(
            get: { reportData.map { PDFSheetItem(data: $0) } },
            set: { reportData = $0?.data }
        )) { item in
            NavigationStack { PDFViewerScreen(title: "Reporte", data: item.data) }
        }
    }

    @ViewBuilder private func detailRow(_ k: String, _ v: String) -> some View {
        if !v.isEmpty { HStack { Text(k).foregroundColor(.secondary); Spacer(); Text(v) } }
    }

    private func downloadPdf() async {
        reportData = try? await TicketsRepository.shared.ticketReportPdf(id: ticketId)
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
            if let message { Text(message).foregroundColor(.green).font(.footnote) }
            if let error { Text(error).foregroundColor(.red).font(.footnote) }
            if isLoading { ProgressView() }
            ForEach(items) { f in
                Section {
                    Text(f.displayTitle).font(.headline)
                    Text(String(f.completedAt.prefix(10)))
                        .font(.caption).foregroundColor(.secondary)
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
        .navigationTitle("Feedback pendiente")
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func binding(for id: Int64) -> FeedbackDraftBinding {
        FeedbackDraftBinding(
            rating: Binding(
                get: { drafts[id]?.rating ?? "5" },
                set: { updateDraft(id) { $0.rating = $1 } }
            ),
            wasOnTime: Binding(
                get: { drafts[id]?.wasOnTime ?? "YES" },
                set: { updateDraft(id) { $0.wasOnTime = $1 } }
            ),
            wasFriendly: Binding(
                get: { drafts[id]?.wasFriendly ?? "YES" },
                set: { updateDraft(id) { $0.wasFriendly = $1 } }
            ),
            wasSolved: Binding(
                get: { drafts[id]?.wasSolved ?? "YES" },
                set: { updateDraft(id) { $0.wasSolved = $1 } }
            ),
            comments: Binding(
                get: { drafts[id]?.comments ?? "" },
                set: { updateDraft(id) { $0.comments = $1 } }
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
            Text("N/A").tag("NA")
        }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        items = (try? await TicketsRepository.shared.pendingFeedbackItems()) ?? []
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
            message = "Feedback enviado"
            await reload()
        } catch { self.error = error.localizedDescription }
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
                .textFieldStyle(.roundedBorder).padding()
                .onSubmit { Task { await reload() } }
            if isLoading {
                Spacer(); ProgressView(); Spacer()
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
        items = (try? await TicketsRepository.shared.portalInventories(search: q)) ?? []
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

    var body: some View {
        ScrollView {
            if let d = detail {
                VStack(alignment: .leading, spacing: 10) {
                    if let message { Text(message).foregroundColor(.green).font(.footnote) }
                    if let error { Text(error).foregroundColor(.red).font(.footnote) }
                    Text(d.displayTitle).font(.title3).bold()
                    Text("Estado: \(d.status)").font(.caption)
                    if !d.items.isEmpty {
                        Text("Ítems (\(d.items.count))").font(.headline).padding(.top, 8)
                        ForEach(d.items) { it in
                            Text(it.displayName).font(.subheadline)
                        }
                    }
                    TextField("Notas", text: $notes, axis: .vertical).lineLimit(2...5)
                    Toggle("Marcar completado", isOn: $markCompleted)
                    Toggle("Confirmar diferencia", isOn: $confirmDifference)
                    HStack {
                        Button(saving ? "Guardando…" : "Sincronizar") { Task { await sync() } }
                            .buttonStyle(.borderedProminent).tint(.teal)
                        Button("Aprobar") { Task { await decide("APPROVE") } }.buttonStyle(.bordered)
                        Button("Rechazar", role: .destructive) { Task { await decide("REJECT") } }
                    }
                    Button("Reporte PDF") { Task { reportData = try? await TicketsRepository.shared.inventoryReportPdf(id: inventoryId) } }
                        .buttonStyle(.bordered)
                }
                .padding()
            } else { ProgressView() }
        }
        .navigationTitle("Inventario")
        .task { await load() }
        .sheet(item: Binding(
            get: { reportData.map { PDFSheetItem(data: $0) } },
            set: { reportData = $0?.data }
        )) { item in
            NavigationStack { PDFViewerScreen(title: "Inventario", data: item.data) }
        }
    }

    private func load() async {
        guard let d = try? await TicketsRepository.shared.portalInventoryDetail(id: inventoryId) else { return }
        detail = d
        notes = d.notes
        markCompleted = d.status.uppercased() == "COMPLETED"
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
        } catch { self.error = error.localizedDescription }
    }

    private func decide(_ decision: String) async {
        saving = true; error = nil; message = nil
        defer { saving = false }
        do {
            let updated = try await TicketsRepository.shared.decideInventory(id: inventoryId, decision: decision)
            detail = PortalInventorySnapshot(raw: updated)
            message = "Inventario actualizado"
        } catch { self.error = error.localizedDescription }
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
