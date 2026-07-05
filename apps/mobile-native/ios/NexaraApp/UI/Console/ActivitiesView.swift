import SwiftUI

// MARK: – Activity Detail

struct ActivityDetailView: View {
    let activity: [String: Any]
    let onBack: () -> Void

    @State private var tab       = 0
    @State private var detail:  [String: Any] = [:]
    @State private var loading  = true
    private let tabs = ["Info", "Evidencias", "Viáticos", "Aprobaciones"]

    private var actId: Int? {
        if let n = activity["id"] as? Int { return n }
        if let s = activity["id"] as? String { return Int(s) }
        return nil
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("← Volver", action: onBack)
                Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 6)

            let title = actStr(detail.isEmpty ? activity : detail, "titulo", "title", "descripcion")
            Text(title.isEmpty ? "Actividad" : title)
                .font(.headline).lineLimit(2).padding(.horizontal).padding(.bottom, 4)

            Picker("", selection: $tab) {
                ForEach(0..<tabs.count, id: \.self) { Text(tabs[$0]).tag($0) }
            }
            .pickerStyle(.segmented).padding(.horizontal)

            if loading {
                Spacer(); ProgressView(); Spacer()
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
        let src = detail.isEmpty ? activity : detail
        return List {
            Section("Detalles") {
                aRow("Estado",       actStr(src, "estatus", "status", "estado"))
                aRow("Prioridad",    actStr(src, "prioridad", "priority"))
                aRow("Cliente",      actStr(src, "clienteNombre", "clientName", "cliente"))
                aRow("Responsable",  actStr(src, "responsable", "asignadoNombre", "assignedTo"))
                aRow("Creador",      actStr(src, "creador", "createdBy"))
                aRow("Tipo",         actStr(src, "tipo", "type", "tipoActividad"))
                aRow("Descripción",  actStr(src, "descripcion", "description"))
            }
            Section("Fechas") {
                aRow("Programada",  String(actStr(src, "scheduledDate", "fechaProgramada").prefix(10)))
                aRow("Inicio",      String(actStr(src, "startDate", "fechaInicio", "startedAt").prefix(10)))
                aRow("Finalización",String(actStr(src, "fechaFinalizacion", "completedAt", "endDate").prefix(10)))
            }
            if let anNum = src["anNumber"] as? String, !anNum.isEmpty {
                Section("Referencia") { aRow("Número AN", anNum) }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var evidenciasTab: some View {
        let evList: [[String: Any]] = nestedList(detail, "evidences")
            + nestedList(detail, "evidencias")
            + nestedList(detail, "activityEvidence").flatMap { nestedList($0, "photos") + [$0] }
        return Group {
            if evList.isEmpty {
                VStack { Spacer(); Text("Sin evidencias registradas").foregroundColor(.secondary); Spacer() }
            } else {
                List(Array(evList.prefix(30).enumerated()), id: \.offset) { _, ev in
                    let url  = actStr(ev, "url", "fileUrl", "photoUrl")
                    let type = actStr(ev, "type", "tipo", "photoType")
                    let date = String(actStr(ev, "createdAt", "fecha").prefix(16))
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Image(systemName: url.lowercased().contains("pdf") ? "doc.richtext" : "photo")
                                .foregroundColor(.blue)
                            Text(type.isEmpty ? "Evidencia" : type.capitalized).font(.subheadline).bold()
                        }
                        if !url.isEmpty { Text(url).font(.caption2).foregroundColor(.secondary).lineLimit(2) }
                        if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private var viaticosTab: some View {
        let viats: [[String: Any]] = nestedList(detail, "viatics")
            + nestedList(detail, "viaticos")
        return Group {
            if viats.isEmpty {
                VStack { Spacer(); Text("Sin viáticos vinculados").foregroundColor(.secondary); Spacer() }
            } else {
                List(Array(viats.prefix(30).enumerated()), id: \.offset) { _, v in
                    let amount = (v["montoSolicitado"] as? Double ?? v["monto"] as? Double) ?? 0.0
                    let reason = actStr(v, "razonGasto", "concepto", "descripcion")
                    let status = actStr(v, "estatusPago", "status")
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(reason.isEmpty ? "Viático" : reason).font(.subheadline).bold()
                            Text(status).font(.caption).foregroundColor(.orange)
                        }
                        Spacer()
                        Text(fmtActMxn(amount)).font(.subheadline.bold()).foregroundColor(.green)
                    }
                    .padding(.vertical, 2)
                }
                .listStyle(.plain)
            }
        }
    }

    private var aprobacionesTab: some View {
        let aprs: [[String: Any]] = nestedList(detail, "approvals")
            + nestedList(detail, "aprobaciones")
        return Group {
            if aprs.isEmpty {
                VStack { Spacer(); Text("Sin aprobaciones requeridas").foregroundColor(.secondary); Spacer() }
            } else {
                List(Array(aprs.prefix(30).enumerated()), id: \.offset) { _, a in
                    let step    = actStr(a, "stepName", "paso", "type")
                    let status  = actStr(a, "status", "estado")
                    let by      = actStr(a, "approvedBy", "userName", "aprobador")
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
        defer { loading = false }
        guard let id = actId else { return }
        if let raw = try? await ApiClient.shared.get("activities/\(id)") {
            detail = ConsoleHelpers.decodeMap(raw)
        }
    }

    private func nestedList(_ m: [String: Any], _ key: String) -> [[String: Any]] {
        (m[key] as? [[String: Any]]) ?? []
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
    @Published var items: [[String: Any]] = []
    @Published var query        = ""
    @Published var statusFilter = "todos"
    @Published var isLoading    = false

    let statuses = ["todos", "pendiente", "en proceso", "completada", "cancelada"]

    var filtered: [[String: Any]] {
        var result = items
        if statusFilter != "todos" {
            result = result.filter { actStr($0, "status", "estatus", "estado").lowercased() == statusFilter }
        }
        if !query.isEmpty {
            let q = query.lowercased()
            result = result.filter { row in
                actStr(row, "titulo", "title", "descripcion").lowercased().contains(q) ||
                actStr(row, "clientName", "cliente").lowercased().contains(q) ||
                actStr(row, "responsable", "assignedTo").lowercased().contains(q)
            }
        }
        return result
    }

    var statusCounts: [String: Int] {
        Dictionary(grouping: items) { actStr($0, "status", "estatus", "estado").lowercased() }
            .mapValues(\.count)
    }

    func load(personalOnly: Bool = false) {
        isLoading = true
        Task {
            if personalOnly {
                items = (try? await ConsoleRepository.shared.activities(scope: "mine")) ?? []
                if items.isEmpty, let uid = SessionStore.shared.currentUser?.id {
                    let all = await ExtraRepository.shared.activities()
                    items = all.filter { actStr($0, "assignedToId", "userId", "responsableId") == uid
                        || actStr($0, "assignedTo", "responsable").lowercased().contains(SessionStore.shared.currentUser?.nombre.lowercased() ?? "") }
                }
            } else {
                items = await ExtraRepository.shared.activities()
            }
            isLoading = false
        }
    }
}

// MARK: – View

struct ActivitiesView: View {
    @StateObject private var vm = ActivitiesVM()
    var filterForUserId: String? = nil
    @State private var selected: [String: Any]?

    var body: some View {
        Group {
            if let sel = selected {
                ActivityDetailView(activity: sel, onBack: { selected = nil })
            } else {
                listBody
            }
        }
        .navigationTitle(selected == nil ? (filterForUserId == nil ? "Actividades" : "Mis actividades") : "")
    }

    private var listBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                // KPI strip
                if !vm.items.isEmpty {
                    kpiStrip
                }

                // Search
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

                // Status chips
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

                // List
                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.filtered.isEmpty {
                    Text("Sin actividades").foregroundColor(.secondary)
                        .frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    VStack(spacing: 6) {
                        ForEach(vm.filtered.prefix(60), id: \.actId) { act in
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
                Button { vm.load(personalOnly: filterForUserId != nil) } label: { Image(systemName: "arrow.clockwise") }
            }
        }
        .refreshable { vm.load(personalOnly: filterForUserId != nil) }
        .task {
            vm.load(personalOnly: filterForUserId != nil)
        }
    }

    // ── KPI strip
    private var kpiStrip: some View {
        let counts = vm.statusCounts
        let pending   = counts["pendiente"] ?? 0
        let inProcess = counts["en proceso"] ?? 0
        let done      = counts["completada"] ?? 0

        return HStack(spacing: 0) {
            ActKpi(label: "Total",      value: "\(vm.items.count)",  color: .primary)
            Divider().frame(height: 36)
            ActKpi(label: "Pendientes", value: "\(pending)",         color: .orange)
            Divider().frame(height: 36)
            ActKpi(label: "En proceso", value: "\(inProcess)",       color: .blue)
            Divider().frame(height: 36)
            ActKpi(label: "Completadas",value: "\(done)",            color: .green)
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }
}

// MARK: – Card

private struct ActivityCard: View {
    let item: [String: Any]
    var body: some View {
        let title      = actStr(item, "titulo", "title", "descripcion")
        let client     = actStr(item, "clientName", "cliente", "clienteNombre")
        let responsible= actStr(item, "responsable", "assignedTo", "asignadoNombre")
        let status     = actStr(item, "status", "estatus", "estado")
        let date       = String(actStr(item, "scheduledDate", "fechaProgramada", "createdAt").prefix(10))
        let priority   = actStr(item, "priority", "prioridad")
        let color      = actStatusColor(status)

        VStack(alignment: .leading, spacing: 0) {
            // Top bar
            HStack {
                Circle().fill(color).frame(width: 8, height: 8)
                Text(title.isEmpty ? "Sin título" : title)
                    .font(.subheadline).bold()
                    .lineLimit(2)
                Spacer()
                Text(status.capitalized)
                    .font(.caption2).bold()
                    .foregroundColor(color)
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(color.opacity(0.13))
                    .clipShape(Capsule())
            }
            .padding(.bottom, 6)

            if !client.isEmpty || !responsible.isEmpty {
                HStack(spacing: 12) {
                    if !client.isEmpty {
                        Label(client, systemImage: "building.2")
                            .font(.caption).foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                    if !responsible.isEmpty {
                        Label(responsible, systemImage: "person")
                            .font(.caption).foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }
                .padding(.bottom, 4)
            }

            HStack {
                if !date.isEmpty {
                    Label(date, systemImage: "calendar")
                        .font(.caption2).foregroundColor(.secondary)
                }
                if !priority.isEmpty {
                    Spacer()
                    Text("Prioridad: \(priority.capitalized)")
                        .font(.caption2)
                        .foregroundColor(priority.lowercased() == "alta" ? .red : .secondary)
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: – Helpers

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

private func actStr(_ m: [String: Any], _ keys: String...) -> String {
    for k in keys {
        if let v = m[k] {
            let s: String
            if let ss = v as? String { s = ss }
            else if let dict = v as? [String: Any], let name = dict["nombre"] as? String { s = name }
            else if let n = v as? NSNumber { s = n.stringValue }
            else { s = String(describing: v) }
            if !s.isEmpty && s != "null" { return s }
        }
    }
    return ""
}

private func actStatusColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "completada", "completado", "done", "closed": return .green
    case "pendiente", "pending": return .orange
    case "en proceso", "in_progress", "en progreso": return .blue
    case "cancelada", "cancelado", "cancelled": return .red
    default: return .secondary
    }
}

extension [String: Any] {
    fileprivate var actId: String {
        if let n = self["id"] as? Int { return "act-\(n)" }
        if let s = self["id"] as? String { return "act-\(s)" }
        return UUID().uuidString
    }
}
