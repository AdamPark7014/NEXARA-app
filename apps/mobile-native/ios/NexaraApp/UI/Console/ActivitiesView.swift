import SwiftUI

// MARK: – Activity Detail

struct ActivityDetailView: View {
    let activity: ActivityItem
    let onBack: () -> Void
    var onCaptureEvidence: ((Int64) -> Void)? = nil
    var initialTabKey: String? = nil

    @State private var tab = 0
    @State private var detail: ActivityItem?
    @State private var evidence: EvidenceDetail?
    @State private var loading = true
    @State private var loadError: String?
    private let tabs = ["Info", "Operación", "Evidencias", "Viáticos", "Equipo", "Materiales", "Historial", "Aprobaciones"]

    @State private var team: [[String: Any]] = []
    @State private var materials: [[String: Any]] = []
    @State private var timeline: [[String: Any]] = []

    private var current: ActivityItem { detail ?? activity }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("← Volver", action: onBack)
                Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 6)

            Text(current.title.isEmpty ? "Actividad" : current.title)
                .font(.headline).lineLimit(2).padding(.horizontal).padding(.bottom, 4)

            if let onCaptureEvidence, current.id > 0 {
                Button {
                    onCaptureEvidence(current.id)
                } label: {
                    Label("Capturar / continuar evidencias", systemImage: "camera.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.teal)
                .padding(.horizontal)
                .padding(.bottom, 8)
            }

            Picker("", selection: $tab) {
                ForEach(0..<tabs.count, id: \.self) { Text(tabs[$0]).tag($0) }
            }
            .pickerStyle(.segmented).padding(.horizontal)

            if loading {
                Spacer(); ProgressView(); Spacer()
            } else if let loadError {
                NxEmptyState(
                    title: "No se pudo cargar",
                    subtitle: loadError,
                    actionLabel: "Reintentar",
                    onAction: { Task { await load() } }
                )
            } else {
                switch tab {
                case 0: infoTab
                case 1: operacionTab
                case 2: evidenciasTab
                case 3: viaticosTab
                case 4: teamTab
                case 5: materialsTab
                case 6: historialTab
                default: aprobacionesTab
                }
            }
        }
        .navigationBarHidden(true)
        .onAppear {
            if let initialTabKey {
                tab = activityDetailTabIndex(initialTabKey)
            }
        }
        .task { await load() }
    }

    private var infoTab: some View {
        let a = current
        return List {
            Section("Detalles") {
                aRow("Estado", a.status)
                aRow("Prioridad", a.priority)
                aRow("Cliente", a.clientName)
                aRow("Responsable", a.responsable)
                aRow("Creador", a.creator)
                aRow("Tipo", a.type)
                aRow("Descripción", a.description)
            }
            Section("Fechas") {
                aRow("Programada", String(a.scheduledDate.prefix(10)))
                aRow("Inicio", String(a.startDate.prefix(10)))
                aRow("Finalización", String(a.endDate.prefix(10)))
            }
            let anNum = StockParse.str(a.raw["anNumber"])
            if !anNum.isEmpty {
                Section("Referencia") { aRow("Número AN", anNum) }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var operacionTab: some View {
        let raw = current.raw
        let due = ActivityParse.str(raw["fechaEntregaEsperada"], raw["fechaMaxima"])
        let dueDate = ActivityParse.isoDate(due)
        let closed = current.status.contains("finaliz") || current.status.contains("complet") || current.status.contains("cancel")
        let overdue = dueDate.map { $0 < Date() } == true && !closed
        let maxMin = ActivityParse.int(raw["tiempoMaximoMin"]) ?? ActivityParse.int(raw["tiempoEstimadoMin"])
        let evMap = raw["activityEvidence"] as? [String: Any]
        let reviewStatus: String = {
            if let ev = evidence, !ev.reviewStatus.isEmpty { return ev.reviewStatus }
            let fromMap = ActivityParse.str(evMap?["reviewStatus"])
            return fromMap.isEmpty ? "Pendiente" : fromMap
        }()
        let branchLat = ActivityParse.double(raw["branchLatitude"])
        let branchLng = ActivityParse.double(raw["branchLongitude"])
        let entryLat = ActivityParse.double(evMap?["entryLatitude"])
        let entryLng = ActivityParse.double(evMap?["entryLongitude"])
        let exitLat = ActivityParse.double(evMap?["exitLatitude"])
        let exitLng = ActivityParse.double(evMap?["exitLongitude"])
        let addressParts = [
            ActivityParse.str(raw["branchName"]),
            ActivityParse.str(raw["branchAddress"]),
            ActivityParse.str(raw["branchCity"]),
            ActivityParse.str(raw["branchState"]),
        ].filter { !$0.isEmpty }
        let clientName = ActivityParse.nestedName(raw["client"])
        let slaAlerted = ActivityParse.str(raw["slaAlertedAt"])

        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 8)], spacing: 8) {
                    operacionKpi(label: "SLA", value: overdue ? "Vencida" : (dueDate.map { ActivityParse.fmtDate($0) } ?? (due.isEmpty ? "Sin fecha" : String(due.prefix(10)))), tone: overdue ? .red : (dueDate != nil ? .orange : .secondary))
                    operacionKpi(label: "Prioridad", value: current.priority.nilIfEmpty ?? "—", tone: .secondary)
                    operacionKpi(label: "Tiempo máx.", value: maxMin.map { "\($0) min" } ?? "—", tone: .secondary)
                    operacionKpi(label: "Evidencia", value: reviewStatus, tone: reviewStatus.uppercased() == "APPROVED" ? .green : .secondary)
                }

                Text("Ubicación y campo").font(.headline)
                if !addressParts.isEmpty {
                    Text("Sitio: \(addressParts.joined(separator: " · "))").font(.subheadline)
                }
                if !clientName.isEmpty {
                    Text("Cliente OPS: \(clientName)").font(.subheadline)
                }
                HStack {
                    if let url = ActivityParse.mapsUrl(lat: branchLat, lng: branchLng) {
                        Link("Mapa sucursal", destination: url)
                    }
                    if let url = ActivityParse.mapsUrl(lat: entryLat, lng: entryLng) {
                        Link("GPS llegada", destination: url)
                    }
                    if let url = ActivityParse.mapsUrl(lat: exitLat, lng: exitLng) {
                        Link("GPS salida", destination: url)
                    }
                    NavigationLink("Mapa operacional OPS") { GpsMapView() }
                }
                .font(.caption)

                if !slaAlerted.isEmpty {
                    Label("SLA alertado", systemImage: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                    Text(ActivityParse.fmtIso(slaAlerted)).font(.caption2).foregroundStyle(.secondary)
                }
            }
            .padding()
        }
    }

    @ViewBuilder
    private func operacionKpi(label: String, value: String, tone: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.subheadline.bold()).foregroundStyle(tone)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var evidenciasTab: some View {
        Group {
            if let onCaptureEvidence, current.id > 0 {
                Button("Ir al flujo de evidencias") { onCaptureEvidence(current.id) }
                    .buttonStyle(.bordered)
                    .padding()
            }
            if let ev = evidence {
                List {
                    Section("Estado") {
                        aRow("Estatus", ev.status)
                        aRow("Revisión", ev.reviewStatus)
                        aRow("Notas", ev.reviewNotes)
                    }
                    Section("Capturas") {
                        if let url = ev.entryPhotoUrl, !url.isEmpty {
                            Label("Entrada", systemImage: "camera.fill")
                            Text(url).font(.caption2).foregroundColor(.secondary).lineLimit(2)
                        }
                        ForEach(Array(ev.evidencePhotos.enumerated()), id: \.offset) { i, url in
                            Label("Foto \(i + 1)", systemImage: "photo")
                            Text(url).font(.caption2).foregroundColor(.secondary).lineLimit(2)
                        }
                        if let pdf = ev.serviceSheetPdfUrl, !pdf.isEmpty {
                            Label("Hoja de servicio (PDF)", systemImage: "doc.richtext")
                            Text(pdf).font(.caption2).foregroundColor(.secondary).lineLimit(2)
                        }
                        if let url = ev.exitPhotoUrl, !url.isEmpty {
                            Label("Salida", systemImage: "door.left.hand.open")
                            Text(url).font(.caption2).foregroundColor(.secondary).lineLimit(2)
                        }
                        if !ev.hasEntry && !ev.hasPhotos && !ev.hasPdf && !ev.hasExit {
                            Text("Sin evidencias registradas").foregroundColor(.secondary)
                        }
                    }
                }
                .listStyle(.insetGrouped)
            } else {
                NxEmptyState(
                    title: "Sin evidencias",
                    subtitle: "Aún no hay capturas para esta actividad.",
                    actionLabel: onCaptureEvidence != nil ? "Capturar" : nil,
                    onAction: onCaptureEvidence != nil ? { onCaptureEvidence?(current.id) } : nil
                )
            }
        }
    }

    private var viaticosTab: some View {
        let viats = nestedMaps(current.raw, "viatics", "viaticos").map { ViaticItem(raw: $0) }
        return Group {
            if viats.isEmpty {
                NxEmptyState(
                    title: "Sin viáticos",
                    subtitle: "No hay viáticos vinculados a esta actividad."
                )
            } else {
                List(viats) { v in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(v.displayConcept).font(.subheadline).bold()
                            Text(v.displayStatus).font(.caption).foregroundColor(.orange)
                        }
                        Spacer()
                        Text(fmtActMxn(v.montoSolicitado)).font(.subheadline.bold()).foregroundColor(.green)
                    }
                    .padding(.vertical, 2)
                }
                .listStyle(.plain)
            }
        }
    }

    private var teamTab: some View {
        List {
            Section("Equipo asignado") {
                if team.isEmpty { Text("Sin asignaciones de equipo.").foregroundColor(.secondary) }
                ForEach(team.indices, id: \.self) { idx in
                    let m = team[idx]
                    let user = m["user"] as? [String: Any] ?? [:]
                    Text(ConsoleHelpers.mapStr(m, "nombre", "userName").isEmpty
                         ? ConsoleHelpers.mapStr(user, "nombre") : ConsoleHelpers.mapStr(m, "nombre", "userName"))
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var materialsTab: some View {
        List {
            if materials.isEmpty {
                Text("Sin movimientos de material.").foregroundColor(.secondary)
            } else {
                ForEach(materials.indices, id: \.self) { idx in
                    let row = materials[idx]
                    let product = row["product"] as? [String: Any] ?? [:]
                    let name = ConsoleHelpers.mapStr(product, "name", "nombre")
                    Text("\(name.isEmpty ? "Material" : name) · \(ConsoleHelpers.mapStr(row, "quantity", "cantidad"))")
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var historialTab: some View {
        List {
            if timeline.isEmpty {
                Text("Sin eventos en el historial.").foregroundColor(.secondary)
            } else {
                ForEach(timeline.indices, id: \.self) { idx in
                    let ev = timeline[idx]
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(ConsoleHelpers.mapStr(ev, "icon")) \(ConsoleHelpers.mapStr(ev, "title"))")
                            .font(.subheadline.bold())
                        if !ConsoleHelpers.mapStr(ev, "subtitle").isEmpty {
                            Text(ConsoleHelpers.mapStr(ev, "subtitle")).font(.caption).foregroundColor(.secondary)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var aprobacionesTab: some View {
        let aprs = nestedMaps(current.raw, "approvals", "aprobaciones")
        return Group {
            if aprs.isEmpty {
                NxEmptyState(
                    title: "Sin aprobaciones",
                    subtitle: "No hay pasos de aprobación requeridos."
                )
            } else {
                List(Array(aprs.prefix(30).enumerated()), id: \.offset) { _, a in
                    let step = StockParse.str(a["stepName"], a["paso"], a["type"])
                    let status = StockParse.str(a["status"], a["estado"])
                    let by = StockParse.str(a["approvedBy"], a["userName"], a["aprobador"])
                    let color: Color = status.lowercased().contains("aprobad") ? .green
                                     : status.lowercased().contains("rechazad") ? .red : .orange
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(step.isEmpty ? "Aprobación" : step).font(.subheadline).bold()
                            if !by.isEmpty { Text("Por: \(by)").font(.caption).foregroundColor(.secondary) }
                        }
                        Spacer()
                        Text(status.isEmpty ? "Pendiente" : status)
                            .font(.caption2).bold().foregroundColor(color)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(color.opacity(0.12)).clipShape(Capsule())
                    }
                    .padding(.vertical, 2)
                }
                .listStyle(.plain)
            }
        }
    }

    @ViewBuilder private func aRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty && value != "0" {
            HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value).multilineTextAlignment(.trailing) }
        }
    }

    private func load() async {
        loading = true
        loadError = nil
        defer { loading = false }
        guard activity.id > 0 else {
            detail = activity
            return
        }
        do {
            async let detailRaw = ApiClient.shared.get("activities/\(activity.id)")
            async let evItem = ConsoleRepository.shared.evidenceDetailItem(activityId: activity.id)
            if let raw = try? await detailRaw {
                let map = ConsoleHelpers.decodeMap(raw)
                detail = map.isEmpty ? activity : ActivityItem(raw: map)
            } else {
                detail = activity
            }
            evidence = try? await evItem
            let id = activity.id
            team = (try? await ConsoleRepository.shared.activityTeam(activityId: id)) ?? []
            materials = (try? await ConsoleRepository.shared.activityMaterials(activityId: id)) ?? []
            timeline = (try? await ConsoleRepository.shared.activityTimelineEvents(activityId: id)) ?? []
        } catch {
            detail = activity
            if evidence == nil {
                loadError = error.localizedDescription
            }
        }
    }

    private func nestedMaps(_ m: [String: Any], _ keys: String...) -> [[String: Any]] {
        for k in keys {
            if let list = m[k] as? [[String: Any]] { return list }
        }
        return []
    }
}

private func fmtActMxn(_ v: Double) -> String {
    if v >= 1_000_000 { return String(format: "$%.1fM", v / 1_000_000) }
    if v >= 1_000     { return String(format: "$%.0fK", v / 1_000) }
    return String(format: "$%.0f", v)
}

// MARK: – ViewModel

@MainActor
final class ActivitiesVM: ObservableObject {
    @Published var items: [ActivityItem] = []
    @Published var query = ""
    @Published var statusFilter = "todos"
    @Published var isLoading = false
    @Published var loadError: String?

    let statuses = ["todos", "pendiente", "en proceso", "completada", "cancelada"]

    var filtered: [ActivityItem] {
        var result = items
        if statusFilter != "todos" {
            result = result.filter { $0.status == statusFilter }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            result = result.filter { row in
                row.title.lowercased().contains(q) ||
                row.clientName.lowercased().contains(q) ||
                row.responsable.lowercased().contains(q)
            }
        }
        return result
    }

    var statusCounts: [String: Int] {
        Dictionary(grouping: items, by: \.status).mapValues(\.count)
    }

    func load(personalOnly: Bool = false) {
        isLoading = true
        loadError = nil
        Task {
            do {
                if personalOnly {
                    var loaded = try await ConsoleRepository.shared.activityItems(scope: "mine")
                    if loaded.isEmpty, let uid = SessionStore.shared.currentUser?.id {
                        let all = await ExtraRepository.shared.activityItems()
                        let nombre = SessionStore.shared.currentUser?.nombre.lowercased() ?? ""
                        loaded = all.filter {
                            $0.responsableId == uid || $0.responsable.lowercased().contains(nombre)
                        }
                    }
                    items = loaded
                } else {
                    var loaded = try await ConsoleRepository.shared.activityItems()
                    if loaded.isEmpty {
                        loaded = await ExtraRepository.shared.activityItems()
                    }
                    items = loaded
                }
            } catch {
                items = await ExtraRepository.shared.activityItems()
                if items.isEmpty {
                    loadError = error.localizedDescription
                }
            }
            isLoading = false
        }
    }
}

// MARK: – View

struct ActivitiesView: View {
    @StateObject private var vm = ActivitiesVM()
    var filterForUserId: String? = nil
    @State private var selected: ActivityItem?
    @State private var evidenceFocusId: Int64?
    @State private var showNewOt = false

    var body: some View {
        Group {
            if let evidenceFocusId {
                EvidencesView(reviewMode: false, initialActivityId: evidenceFocusId)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("← Actividad") { self.evidenceFocusId = nil }
                        }
                    }
            } else if let sel = selected {
                ActivityDetailView(
                    activity: sel,
                    onBack: { selected = nil },
                    onCaptureEvidence: { id in evidenceFocusId = id }
                )
            } else {
                listBody
            }
        }
        .navigationTitle(selected == nil && evidenceFocusId == nil ? (filterForUserId == nil ? "Actividades" : "Mis actividades") : "")
        .toolbar {
            if selected == nil && evidenceFocusId == nil && filterForUserId == nil {
                ToolbarItem(placement: .primaryAction) {
                    Button("Nueva OT") { showNewOt = true }
                }
            }
        }
        .sheet(isPresented: $showNewOt) {
            OpsNewActivityView(onDone: { _ in
                showNewOt = false
                vm.load(personalOnly: filterForUserId != nil)
            })
        }
    }

    private var listBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if !vm.items.isEmpty {
                    kpiStrip
                }

                if let err = vm.loadError {
                    NxAlertBanner(alert: NxAlert(id: "act-err", title: "No se pudo cargar", subtitle: err, tone: .danger))
                        .padding(.horizontal)
                }

                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Buscar actividad…", text: $vm.query)
                        .autocorrectionDisabled()
                    if !vm.query.isEmpty {
                        Button { vm.query = "" } label: {
                            Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                        }
                    }
                }
                .padding(10)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(vm.statuses, id: \.self) { s in
                            let isSelected = vm.statusFilter == s
                            Button { vm.statusFilter = s } label: {
                                Text(s.capitalized)
                                    .font(.caption).bold()
                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                    .background(isSelected ? Color.teal : Color(.secondarySystemGroupedBackground))
                                    .foregroundColor(isSelected ? .white : .primary)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                    .padding(.horizontal)
                }

                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.filtered.isEmpty {
                    NxEmptyState(
                        title: "Sin actividades",
                        subtitle: "No hay actividades con este filtro.",
                        actionLabel: "Actualizar",
                        onAction: { vm.load(personalOnly: filterForUserId != nil) }
                    )
                } else {
                    VStack(spacing: 6) {
                        ForEach(vm.filtered.prefix(60)) { act in
                            Button { selected = act } label: {
                                ActivityCard(item: act).padding(.horizontal)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
        .navigationTitle(filterForUserId == nil ? "Actividades" : "Mis actividades")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { vm.load(personalOnly: filterForUserId != nil) } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
        .refreshable { vm.load(personalOnly: filterForUserId != nil) }
        .task { vm.load(personalOnly: filterForUserId != nil) }
    }

    private var kpiStrip: some View {
        let counts = vm.statusCounts
        return HStack(spacing: 0) {
            ActKpi(label: "Total", value: "\(vm.items.count)", color: .primary)
            Divider().frame(height: 36)
            ActKpi(label: "Pendiente", value: "\(counts["pendiente"] ?? 0)", color: .orange)
            Divider().frame(height: 36)
            ActKpi(label: "Proceso", value: "\(counts["enproceso"] ?? counts["en proceso"] ?? 0)", color: .blue)
            Divider().frame(height: 36)
            ActKpi(label: "Hechas", value: "\(counts["completada"] ?? counts["finalizada"] ?? 0)", color: .green)
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }
}

// MARK: – Subviews

private struct ActKpi: View {
    let label: String; let value: String; let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).bold().foregroundColor(color)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
    }
}

private struct ActivityCard: View {
    let item: ActivityItem
    var body: some View {
        let color = actStatusColor(item.status)
        HStack(spacing: 0) {
            Rectangle().fill(color).frame(width: 4)
                .clipShape(RoundedRectangle(cornerRadius: 2))
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title.isEmpty ? "Actividad" : item.title)
                    .font(.subheadline).bold().lineLimit(2)
                if !item.clientName.isEmpty {
                    Text(item.clientName).font(.caption).foregroundColor(.secondary)
                }
                HStack {
                    Text(item.status.isEmpty ? "—" : item.status.capitalized)
                        .font(.caption2).bold().foregroundColor(color)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(color.opacity(0.12)).clipShape(Capsule())
                    Spacer()
                    if !item.responsable.isEmpty {
                        Text(item.responsable).font(.caption2).foregroundColor(.secondary).lineLimit(1)
                    }
                }
            }
            .padding(.horizontal, 10).padding(.vertical, 8)
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

private func activityDetailTabIndex(_ key: String) -> Int {
    switch key.lowercased() {
    case "info": return 0
    case "operacion": return 1
    case "evidencias": return 2
    case "viaticos": return 3
    case "equipo": return 4
    case "materiales": return 5
    case "historial": return 6
    case "incidencias": return 7
    case "aprobaciones": return 8
    default: return 0
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

enum ActivityParse {
    static func str(_ values: Any?...) -> String {
        for v in values {
            if let s = v as? String, !s.isEmpty, s != "null" { return s }
            if let n = v as? NSNumber { return n.stringValue }
            if let m = v as? [String: Any] {
                let nested = str(m["nombre"], m["name"], m["code"])
                if !nested.isEmpty { return nested }
            }
        }
        return ""
    }

    static func nestedName(_ values: Any?...) -> String {
        for v in values {
            let s = str(v)
            if !s.isEmpty { return s }
        }
        return ""
    }

    static func int(_ value: Any?) -> Int? {
        if let n = value as? Int { return n }
        if let n = value as? NSNumber { return n.intValue }
        if let s = value as? String, let n = Int(s) { return n }
        return nil
    }

    static func double(_ value: Any?) -> Double? {
        if let n = value as? Double { return n }
        if let n = value as? NSNumber { return n.doubleValue }
        if let s = value as? String, let n = Double(s) { return n }
        return nil
    }

    static func isoDate(_ value: String) -> Date? {
        guard !value.isEmpty else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: value) { return d }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: value) { return d }
        let df = DateFormatter()
        df.locale = Locale(identifier: "es_MX")
        df.dateFormat = "yyyy-MM-dd"
        return df.date(from: String(value.prefix(10)))
    }

    static func fmtDate(_ date: Date) -> String {
        let df = DateFormatter()
        df.locale = Locale(identifier: "es_MX")
        df.dateStyle = .short
        return df.string(from: date)
    }

    static func fmtIso(_ value: String) -> String {
        isoDate(value).map(fmtDate) ?? value
    }

    static func mapsUrl(lat: Double?, lng: Double?) -> URL? {
        guard let lat, let lng, lat.isFinite, lng.isFinite else { return nil }
        return URL(string: "https://www.google.com/maps?q=\(lat),\(lng)")
    }
}

private func actStatusColor(_ status: String) -> Color {
    let s = status.lowercased()
    if s.contains("complet") || s.contains("final") { return .green }
    if s.contains("cancel") || s.contains("rechaz") { return .red }
    if s.contains("proceso") || s.contains("asign") { return .blue }
    if s.contains("pend") { return .orange }
    return .secondary
}

// MARK: – Activity detail by id (despacho / deep links)

struct ActivityDetailByIdView: View {
    let activityId: Int64
    var initialTabKey: String? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var activity: ActivityItem?
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        Group {
            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let activity {
                ActivityDetailView(
                    activity: activity,
                    onBack: { dismiss() },
                    initialTabKey: initialTabKey,
                )
            } else {
                VStack(spacing: 12) {
                    Button("← Volver") { dismiss() }
                    Text(error ?? "Actividad no encontrada").foregroundStyle(.red)
                }
                .padding()
            }
        }
        .task { await load() }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            let data = try await ApiClient.shared.get("activities/\(activityId)")
            let raw = ConsoleHelpers.decodeMap(data)
            if ConsoleHelpers.mapInt64(raw, "id") ?? 0 > 0 {
                activity = ActivityItem(raw: raw)
            } else {
                error = "Actividad no encontrada"
            }
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}
