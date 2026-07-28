import SwiftUI

// MARK: – Activity Detail

struct ActivityDetailView: View {
    let activity: ActivityItem
    let onBack: () -> Void
    var onCaptureEvidence: ((Int64) -> Void)? = nil

    @State private var tab = 0
    @State private var detail: ActivityItem?
    @State private var evidence: EvidenceDetail?
    @State private var loading = true
    @State private var loadError: String?
    private let tabs = ["Info", "Evidencias", "Viáticos", "Aprobaciones"]

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
                case 1: evidenciasTab
                case 2: viaticosTab
                default: aprobacionesTab
                }
            }
        }
        .navigationBarHidden(true)
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

private func actStatusColor(_ status: String) -> Color {
    let s = status.lowercased()
    if s.contains("complet") || s.contains("final") { return .green }
    if s.contains("cancel") || s.contains("rechaz") { return .red }
    if s.contains("proceso") || s.contains("asign") { return .blue }
    if s.contains("pend") { return .orange }
    return .secondary
}
