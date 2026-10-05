import SwiftUI

// MARK: - Tickets (Android `TicketsTicketsScreen`)

@MainActor
final class PortalTicketsVM: ObservableObject {
    @Published var isLoading = true
    @Published var refreshingVisible = false
    @Published var error: String?
    @Published var tickets: [PortalTicket] = []
    @Published var projects: [PortalProject] = []
    /// `today` | `7d` | `30d` | `all` (Android `DATE_RANGES`), 7 días por omisión.
    @Published var dateRange = "7d"
    @Published var projectId: Int64?

    private var started = false
    /// Cambiar de rango dos veces seguidas: gana la respuesta del último.
    private var generation = 0

    func onAppear() {
        if !started {
            started = true
            Task { await refresh(.initial) }
        } else {
            // Al volver del detalle: el estatus pudo cambiar (confirmar, reabrir).
            Task { await refresh(.silent) }
        }
    }

    func setDateRange(_ value: String) {
        guard value != dateRange else { return }
        dateRange = value
        Task { await refresh(.visible) }
    }

    func setProjectId(_ value: Int64?) {
        projectId = value
        Task { await refresh(.visible) }
    }

    func refresh(_ mode: PortalLoad) async {
        generation += 1
        let gen = generation
        switch mode {
        case .initial: isLoading = true
        case .visible: refreshingVisible = true
        case .pull, .silent: break
        }
        error = nil
        let range = Self.range(dateRange)
        let project = projectId
        do {
            let repo = TicketsRepository.shared
            // Como Android (`runCatching { repo.projects() }`): sin proyectos no
            // se cae la lista, solo se esconde el selector.
            let loadedProjects = (try? await repo.portalProjects()) ?? []
            let list = try await repo.portalTickets(start: range.start, end: range.end, projectId: project)
            guard gen == generation else { return }
            projects = loadedProjects
            tickets = list
        } catch {
            guard gen == generation else { return }
            self.error = error.toUserMessage(fallback: "No se pudieron cargar tickets")
        }
        isLoading = false
        refreshingVisible = false
    }

    /// Rango de `fechaAsignacion` para el API. «Hoy» empieza a la medianoche de
    /// la Ciudad de México: Android la tomaba en UTC (`ZoneOffset.UTC`), así que
    /// de 18:00 a 23:59 «Hoy» ya era el día siguiente y no traía nada.
    static func range(_ range: String, now: Date = Date()) -> (start: String?, end: String?) {
        if range == "all" { return (nil, nil) }
        let start: Date
        switch range {
        case "today": start = PortalFormat.inicioDeHoy(now)
        case "30d": start = now.addingTimeInterval(-30 * 86_400)
        default: start = now.addingTimeInterval(-7 * 86_400)
        }
        return (PortalFormat.iso(start), PortalFormat.iso(now))
    }
}

/// Tickets del portal (Android `TicketsTicketsScreen`): título, cuatro cifras,
/// rango de fechas, proyecto (solo cliente), buscador, filtros y renglones con
/// estatus, prioridad, sucursal y antigüedad.
struct PortalTicketsView: View {
    let onOpenTicket: (Int64) -> Void
    @StateObject private var vm = PortalTicketsVM()
    @State private var query = ""
    @State private var filter = "todos"

    private static let ranges: [PortalOption] = [
        PortalOption(key: "today", label: "Hoy"),
        PortalOption(key: "7d", label: "7 días"),
        PortalOption(key: "30d", label: "30 días"),
        PortalOption(key: "all", label: "Todos"),
    ]

    private static let filters: [PortalOption] = [
        PortalOption(key: "todos", label: "Todos"),
        PortalOption(key: "abiertos", label: "Abiertos"),
        PortalOption(key: "cerrados", label: "Cerrados"),
        PortalOption(key: "alta", label: "Alta prioridad"),
        PortalOption(key: "aging", label: "Más de 48 h"),
    ]

    init(onOpenTicket: @escaping (Int64) -> Void) {
        self.onOpenTicket = onOpenTicket
    }

    var body: some View {
        content
            .nxScreenBackground()
            .onAppear { vm.onAppear() }
            .refreshOnModels(["Activity", "ActivityEvidence", "ServiceSheet"]) { await vm.refresh(.visible) }
    }

    @ViewBuilder
    private var content: some View {
        if vm.isLoading {
            PortalSkeletonScreen(itemCount: 6, itemHeight: 92)
        } else if vm.tickets.isEmpty, let error = vm.error {
            ScrollView {
                NxErrorState(message: error) { Task { await vm.refresh(.initial) } }
            }
            .refreshable { await vm.refresh(.pull) }
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: NxSpacing.listGap) {
                    list
                }
                .padding(.horizontal, NxSpacing.screenH)
                .padding(.vertical, NxSpacing.m)
            }
            .refreshable { await vm.refresh(.pull) }
            .overlay(alignment: .top) { PortalRefreshIndicator(visible: vm.refreshingVisible) }
        }
    }

    @ViewBuilder
    private var list: some View {
        if let error = vm.error {
            NxRefreshErrorBanner(
                message: error,
                onRetry: { Task { await vm.refresh(.visible) } },
                onDismiss: { vm.error = nil }
            )
        }
        NxSectionHeader(title: "Tickets", subtitle: "Prioridad, antigüedad y estado de cada servicio.")
        NxKpiGrid(items: kpis)
        NxSegmented(
            options: Self.ranges.map(\.label),
            selectedIndex: Self.ranges.firstIndex(where: { $0.key == vm.dateRange }) ?? 0,
            onSelect: { index in vm.setDateRange(Self.ranges[index].key) }
        )
        if !vm.projects.isEmpty {
            PortalDropdownField(
                label: "Proyecto",
                value: selectedProjectTitle,
                options: projectOptions,
                onSelect: { id in vm.setProjectId(Int64(id)) },
                radius: NxRadius.l,
                labelBackground: NxColors.surface
            )
        }
        NxSearchField(text: $query, placeholder: "Buscar folio, título o sucursal")
        NxFilterBar(horizontalPadding: 0) {
            ForEach(Self.filters) { option in
                NxFilterPill(label: option.label, selected: filter == option.key) {
                    // Tocar el filtro activo lo quita (vuelve a «Todos»), como Android.
                    filter = (filter == option.key && option.key != "todos") ? "todos" : option.key
                }
            }
        }
        let rows = filtered
        if rows.isEmpty {
            NxEmptyState(
                title: vm.tickets.isEmpty ? "Sin tickets" : "Sin resultados",
                subtitle: vm.tickets.isEmpty
                    ? "No hay tickets en este periodo."
                    : "Ningún ticket coincide con el filtro o la búsqueda.",
                systemImage: "ticket"
            )
        } else {
            ForEach(rows) { ticket in
                ticketRow(ticket)
            }
        }
    }

    private var kpis: [NxKpi] {
        let open = vm.tickets.filter(\.isOpen)
        let high = open.filter(\.isHighPriority).count
        let aging = open.filter { $0.ageHours >= 48 }.count
        return [
            NxKpi(label: "Abiertos", value: "\(open.count)", tone: open.isEmpty ? .success : .warning),
            NxKpi(label: "Alta prioridad", value: "\(high)", tone: high > 0 ? .danger : .neutral),
            NxKpi(label: "Más de 48 h", value: "\(aging)", hint: "Sin cierre", tone: aging > 0 ? .danger : .info),
            NxKpi(label: "Total", value: "\(vm.tickets.count)", tone: .brand),
        ]
    }

    private var filtered: [PortalTicket] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return vm.tickets.filter { t in
            let matchFilter: Bool
            switch filter {
            case "abiertos": matchFilter = t.isOpen
            case "cerrados": matchFilter = !t.isOpen
            case "alta": matchFilter = t.isOpen && t.isHighPriority
            case "aging": matchFilter = t.isOpen && t.ageHours >= 48
            default: matchFilter = true
            }
            guard matchFilter else { return false }
            if q.isEmpty { return true }
            return "\(t.title) \(t.anNumber) \(t.branchName) \(t.status)".lowercased().contains(q)
        }
    }

    private var selectedProjectTitle: String {
        guard let project = vm.projects.first(where: { $0.id == vm.projectId }) else { return "Todos los proyectos" }
        return Self.projectTitle(project)
    }

    /// «Todos los proyectos» (id vacío → `nil`) y los proyectos activos del cliente.
    private var projectOptions: [PortalMenuOption] {
        [PortalMenuOption(id: "", title: "Todos los proyectos")]
            + vm.projects.map { PortalMenuOption(id: String($0.id), title: Self.projectTitle($0)) }
    }

    private static func projectTitle(_ p: PortalProject) -> String {
        p.title.isEmpty ? "Proyecto #\(p.id)" : p.title
    }

    private func ticketRow(_ t: PortalTicket) -> some View {
        let ageH = t.ageHours
        let open = t.isOpen
        let tone: NxTone
        if !open {
            tone = .success
        } else if t.isHighPriority || ageH >= 72 {
            tone = .danger
        } else if ageH >= 48 {
            tone = .warning
        } else {
            tone = .info
        }
        let meta = Self.meta(t, open: open, ageH: ageH)
        return PortalChevronCard(onClick: { onOpenTicket(t.id) }) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top, spacing: NxSpacing.s) {
                    Text(t.title.isEmpty ? "Ticket #\(t.id)" : t.title)
                        .font(NxType.titleSmall)
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    NxStatusChip(text: PortalStatusLabels.label(t.status), tone: tone)
                }
                if !meta.isEmpty {
                    Text(meta)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if open && ageH >= 48 {
                    NxIconText(
                        systemName: "exclamationmark.triangle",
                        text: "Fuera de ventana operativa (más de 48 h)",
                        tint: NxColors.danger
                    )
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.danger)
                }
            }
        }
    }

    /// «AN-0123 · Prioridad Alta · Sucursal Centro · Abierto hace 5 h».
    private static func meta(_ t: PortalTicket, open: Bool, ageH: Int) -> String {
        var parts: [String] = []
        if !t.anNumber.isEmpty { parts.append(t.anNumber) }
        if let priority = PortalStatusLabels.priority(t.displayPriority) { parts.append("Prioridad \(priority)") }
        if !t.branchName.isEmpty { parts.append(t.branchName) }
        if open { parts.append(portalTicketAgeText(ageH)) }
        return parts.joined(separator: " · ")
    }
}

/// Android `ticketAgeText`.
private func portalTicketAgeText(_ hours: Int) -> String {
    if hours < 1 { return "Abierto hace menos de 1 h" }
    if hours < 48 { return "Abierto hace \(hours) h" }
    return "Abierto hace \(hours / 24) días"
}

/// Android `ticketStatusTone` del detalle.
private func portalTicketStatusTone(_ status: String) -> NxTone {
    let s = status.uppercased()
    if s.contains("CERR") || s.contains("CLOS") || s.contains("FIN") { return .success }
    if s.contains("ALTA") || s.contains("HIGH") || s.contains("URG") { return .danger }
    if s.contains("PROC") || s.contains("OPEN") || s.contains("ASIG") { return .warning }
    return .info
}

/// Fecha y hora de México o `nil` sin dato (el renglón no se dibuja).
private func portalOptionalDateTime(_ raw: String) -> String? {
    raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : PortalFormat.dateTime(raw)
}

// MARK: - Detalle de ticket (Android `TicketsTicketDetailScreen`)

@MainActor
final class PortalTicketDetailVM: ObservableObject {
    @Published var isLoading = true
    @Published var refreshingVisible = false
    @Published var error: String?
    @Published var ticket: PortalTicket?
    @Published var downloading = false
    @Published var saving = false
    @Published var commentDraft = ""
    @Published var pdf: PortalPDFItem?

    let ticketId: Int64
    private var started = false

    init(ticketId: Int64) {
        self.ticketId = ticketId
    }

    func start() {
        guard !started else { return }
        started = true
        Task { await load(.initial) }
    }

    func load(_ mode: PortalLoad) async {
        switch mode {
        case .initial: isLoading = true
        case .visible: refreshingVisible = true
        case .pull, .silent: break
        }
        error = nil
        do {
            ticket = try await TicketsRepository.shared.portalTicket(id: ticketId)
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar el ticket")
        }
        isLoading = false
        refreshingVisible = false
    }

    func downloadReport() {
        guard !downloading else { return }
        downloading = true
        Task {
            do {
                let data = try await TicketsRepository.shared.ticketReportPdf(id: ticketId)
                pdf = PortalPDFItem(title: "Reporte del ticket", data: data)
            } catch {
                self.error = error.toUserMessage(fallback: "No se pudo descargar el PDF")
            }
            downloading = false
        }
    }

    func postComment() {
        let body = commentDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !saving else { return }
        saving = true
        error = nil
        Task {
            do {
                try await TicketsRepository.shared.postTicketComment(id: ticketId, body: body)
                saving = false
                commentDraft = ""
                await load(.visible)
            } catch {
                saving = false
                self.error = error.toUserMessage(fallback: "No se pudo enviar el comentario")
            }
        }
    }

    /// `ACK` | `CONFIRM_RESOLVED` | `REQUEST_REOPEN` (las tres que acepta el API).
    func patchStatus(_ action: String) {
        guard !saving else { return }
        saving = true
        error = nil
        Task {
            do {
                try await TicketsRepository.shared.patchTicketStatus(id: ticketId, action: action)
                saving = false
                await load(.visible)
            } catch {
                saving = false
                self.error = error.toUserMessage(fallback: "No se pudo actualizar el ticket")
            }
        }
    }
}

/// Detalle de ticket del portal (Android `TicketsTicketDetailScreen`): título y
/// estatus, «Operación / SLA», hoja de servicio, evidencias (foto o PDF dentro
/// de la app), comentarios, acciones según el estatus y el reporte en PDF.
struct PortalTicketDetailView: View {
    @StateObject private var vm: PortalTicketDetailVM
    @State private var assetPdf: PortalAssetPDFItem?

    init(ticketId: Int64) {
        _vm = StateObject(wrappedValue: PortalTicketDetailVM(ticketId: ticketId))
    }

    var body: some View {
        content
            .sheet(item: $assetPdf) { PortalAssetPDFSheet(item: $0) }
            .nxScreenBackground()
            .onAppear { vm.start() }
            .refreshOnModels(["Activity", "ActivityEvidence", "ServiceSheet"]) { await vm.load(.visible) }
            .sheet(item: $vm.pdf) { PortalPDFSheet(item: $0) }
    }

    @ViewBuilder
    private var content: some View {
        if vm.isLoading {
            PortalSkeletonScreen(itemCount: 4, itemHeight: 110, vertical: NxSpacing.l)
        } else if let ticket = vm.ticket {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    detail(ticket)
                }
                .padding(.horizontal, NxSpacing.screenH)
            }
            .refreshable { await vm.load(.pull) }
            .overlay(alignment: .top) { PortalRefreshIndicator(visible: vm.refreshingVisible) }
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let error = vm.error {
                        NxErrorBlock(message: error, onRetry: { Task { await vm.load(.initial) } })
                    } else {
                        NxEmptyState(title: "Ticket no encontrado", subtitle: "No hay datos para este ticket.")
                    }
                }
                .padding(NxSpacing.l)
            }
            .refreshable { await vm.load(.pull) }
        }
    }

    @ViewBuilder
    private func detail(_ t: PortalTicket) -> some View {
        if let error = vm.error {
            NxErrorBlock(message: error, onRetry: { Task { await vm.load(.initial) } })
        }
        header(t)
        slaPanel(t)
        if let sheet = t.serviceSheet {
            sheetPanel(sheet)
        }
        let evidencias = t.evidenceFiles
        if !evidencias.isEmpty {
            Text("Evidencias (\(evidencias.count))")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(NxColors.fg)
            ForEach(Array(evidencias.prefix(20))) { evidence in
                evidenceCard(evidence)
            }
            if evidencias.count > 20 {
                Text("Se muestran 20 de \(evidencias.count) evidencias.")
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }
        }
        commentsPanel(t)
        actions(t)
        PortalPillButton(
            title: vm.downloading ? "Descargando…" : "Descargar reporte (PDF)",
            enabled: !vm.downloading && !vm.saving
        ) { vm.downloadReport() }
        PortalGap(8)
    }

    private func header(_ t: PortalTicket) -> some View {
        HStack(alignment: .top, spacing: NxSpacing.s) {
            VStack(alignment: .leading, spacing: 0) {
                Text(t.title.isEmpty ? "Ticket #\(t.id)" : t.title)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
                if !t.anNumber.isEmpty {
                    Text(t.anNumber)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if !t.status.isEmpty {
                NxStatusChip(text: PortalStatusLabels.label(t.status), tone: portalTicketStatusTone(t.status))
            }
        }
    }

    private func slaPanel(_ t: PortalTicket) -> some View {
        let ageH = t.ageHours
        let location = [t.branchName, t.branchCity, t.branchState]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        let tipo = t.ticketType.isEmpty ? t.urgency : t.ticketType
        return NxPanelShell(padding: 14) {
            Text("Operación / SLA")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(NxColors.fg)
            // Android pintaba la prioridad cruda («HIGH», «—»); aquí con su
            // etiqueta, como el renglón de la lista.
            PortalDetailRow(label: "Prioridad", value: PortalStatusLabels.priority(t.displayPriority) ?? "—")
            PortalDetailRow(label: "Tipo", value: tipo.isEmpty ? nil : PortalStatusLabels.label(tipo))
            PortalDetailRow(label: "Responsable", value: t.responsableName)
            PortalDetailRow(label: "Ubicación", value: location)
            PortalDetailRow(label: "Compromiso", value: portalOptionalDateTime(t.dueAt))
            PortalDetailRow(label: "SLA", value: portalOptionalDateTime(t.slaDueAt))
            PortalDetailRow(label: "Asignación", value: portalOptionalDateTime(t.assignedAt))
            PortalDetailRow(label: "Inicio", value: portalOptionalDateTime(t.startedAt))
            PortalDetailRow(label: "Cierre", value: portalOptionalDateTime(t.completedAt))
            if t.isOpen {
                Text("Antigüedad: \(ageH)h\(ageH >= 48 ? " · fuera de ventana" : "")")
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(ageH >= 48 ? NxColors.danger : NxColors.muted)
            }
        }
    }

    private func sheetPanel(_ sheet: [String: Any]) -> some View {
        NxPanelShell(padding: 14) {
            Text("Hoja de servicio")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(NxColors.fg)
            PortalDetailRow(label: "Estado", value: ConsoleHelpers.mapStr(sheet, "status", "estatus", "estado"))
            PortalDetailRow(label: "Técnico", value: ConsoleHelpers.mapStr(sheet, "technicianName", "userName", "responsable"))
            PortalDetailRow(label: "Resumen", value: ConsoleHelpers.mapStr(sheet, "workSummary", "summary"))
            PortalDetailRow(label: "Observaciones", value: ConsoleHelpers.mapStr(sheet, "observations", "observaciones", "notes"))
            PortalDetailRow(label: "Firmado por", value: ConsoleHelpers.mapStr(sheet, "signedName", "clientSignature"))
        }
    }

    private func evidenceCard(_ ev: PortalTicketEvidence) -> some View {
        let title = ev.title.isEmpty ? "Evidencia" : ev.title
        return NxPanelShell(padding: 12) {
            Text(title)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(NxColors.fg)
            if !ev.comments.isEmpty {
                Text(ev.comments)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !ev.uploadedAt.isEmpty {
                Text(PortalFormat.dateTime(ev.uploadedAt))
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }
            if ev.isImage {
                PortalGap(8)
                AuthenticatedImage(url: ev.url, contentMode: .fill, background: NxColors.sunken)
                    .frame(maxWidth: .infinity)
                    .frame(height: 180)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .accessibilityLabel("Evidencia del servicio")
            } else if ev.isPdf {
                PortalGap(8)
                // Android lo mandaba al navegador; aquí se abre dentro de la app
                // con la sesión (el archivo está protegido).
                PortalPillButton(title: "Abrir PDF", filled: false) {
                    assetPdf = PortalAssetPDFItem(title: title, url: ev.url)
                }
            }
        }
    }

    private func commentsPanel(_ t: PortalTicket) -> some View {
        let lines = t.commentsFeedback
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        let canSend = !vm.saving && !vm.commentDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return NxPanelShell(padding: 14) {
            Text("Comentarios")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(NxColors.fg)
            if lines.isEmpty {
                Text("Sin comentarios")
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
            } else {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    Text(line)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.fg)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            PortalGap(8)
            PortalOutlinedField(
                label: "Nuevo comentario",
                text: $vm.commentDraft,
                enabled: !vm.saving,
                minLines: 2
            )
            PortalPillButton(
                title: vm.saving ? "Enviando…" : "Enviar comentario",
                enabled: canSend
            ) { vm.postComment() }
        }
    }

    /// Finalizada: confirmar o pedir reapertura (el API solo las acepta sobre una
    /// OT FINALIZADA). Cancelada o cerrada: se dice por qué no hay botón. Abierta:
    /// acusar recibo.
    @ViewBuilder
    private func actions(_ t: PortalTicket) -> some View {
        VStack(alignment: .leading, spacing: NxSpacing.s) {
            if t.isFinished {
                PortalPillButton(title: "Confirmar resolución", enabled: !vm.saving) {
                    vm.patchStatus("CONFIRM_RESOLVED")
                }
                PortalPillButton(title: "Solicitar reapertura", filled: false, enabled: !vm.saving) {
                    vm.patchStatus("REQUEST_REOPEN")
                }
            } else if !t.isOpen {
                Text(closedText(t))
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                PortalPillButton(title: "Acusar recibo", filled: false, enabled: !vm.saving) {
                    vm.patchStatus("ACK")
                }
            }
        }
    }

    private func closedText(_ t: PortalTicket) -> String {
        let estado = t.status.isEmpty
            ? "cerrado"
            : PortalStatusLabels.label(t.status).lowercased(with: Locale(identifier: "es_MX"))
        return "Este ticket está \(estado). Si necesitas retomarlo, levanta una nueva solicitud."
    }
}
