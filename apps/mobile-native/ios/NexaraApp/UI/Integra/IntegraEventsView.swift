import SwiftUI

/// Bitácora ACS (push events) con cursor real. Paridad `IntegraEventsScreen`.
/// `eventState` viene del servidor — no se inventa con temporizadores.
private let integraEventPage = 60

private enum IntegraEventQuickView: String, CaseIterable, Identifiable {
    case hoy, denegados, sieteDias, ruido

    var id: String { rawValue }

    var label: String {
        switch self {
        case .hoy: return "Hoy"
        case .denegados: return "Denegados"
        case .sieteDias: return "7 días"
        case .ruido: return "Ruido"
        }
    }

    var scope: String { self == .ruido ? "noise" : "acs" }
    var outcome: String? { self == .denegados ? "denied" : nil }

    /// Horas hacia atrás; `0` = desde medianoche local.
    var hoursBack: Int {
        switch self {
        case .hoy, .denegados: return 0
        case .sieteDias: return 24 * 7
        case .ruido: return 6
        }
    }
}

struct IntegraEventsView: View {
    @StateObject private var vm = IntegraEventsVM()

    var body: some View {
        Group {
            if vm.loading && vm.items.isEmpty {
                ProgressView("Cargando eventos…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = vm.error, vm.items.isEmpty {
                NxEmptyState(title: "No se pudieron cargar", subtitle: error, actionLabel: "Reintentar") {
                    Task { await vm.refresh() }
                }
            } else {
                listBody
            }
        }
        .navigationTitle("Eventos")
        .task { await vm.refresh() }
        .refreshable { await vm.refresh(initial: false) }
    }

    private var listBody: some View {
        List {
            if !vm.stats.isEmpty {
                Section {
                    NxKpiGrid(items: [
                        NxKpi(label: "Entradas hoy", value: "\(vm.statInt("entradas", "granted"))", tone: .success),
                        NxKpi(label: "Denegados", value: "\(vm.statInt("denegados", "denied"))", tone: .danger),
                        NxKpi(label: "Personas únicas", value: "\(vm.statInt("unicos", "uniquePersons"))", tone: .info),
                        NxKpi(label: "En sitio", value: "\(vm.statInt("enSitio", "onSite"))", tone: .brand),
                    ])
                    .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                    .listRowBackground(Color.clear)
                }
            }

            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(IntegraEventQuickView.allCases) { view in
                            Button {
                                Task { await vm.setView(view) }
                            } label: {
                                NxStatusChip(
                                    text: view.label,
                                    tone: vm.view == view ? .brand : .neutral
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach([("active", "Activos"), ("inactive", "Cerrados")], id: \.0) { clave, etiqueta in
                            let selected = vm.eventState == clave
                            Button {
                                Task { await vm.setEventState(selected ? nil : clave) }
                            } label: {
                                NxStatusChip(text: etiqueta, tone: selected ? .info : .neutral)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Persona, equipo, IP o etiqueta…", text: $vm.query)
                        .autocorrectionDisabled()
                }
                Text("\(vm.filtered.count) eventos cargados")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if let error = vm.error, !vm.items.isEmpty {
                Section {
                    NxAlertBanner(alert: NxAlert(id: "page-err", title: error, tone: .danger))
                }
            }

            if vm.filtered.isEmpty {
                Section {
                    NxEmptyState(
                        title: vm.items.isEmpty ? "Sin eventos" : "Ninguno coincide",
                        subtitle: vm.items.isEmpty
                            ? "No hay eventos de «\(vm.view.label)» en este sitio."
                            : "Ninguno de los \(vm.items.count) eventos cargados coincide con la búsqueda."
                    )
                }
            } else {
                ForEach(vm.filtered) { ev in
                    eventRow(ev)
                }
                Section {
                    if vm.hasMore {
                        Button {
                            Task { await vm.loadMore() }
                        } label: {
                            if vm.loadingMore {
                                ProgressView()
                            } else {
                                Text("Ver más eventos")
                            }
                        }
                        .disabled(vm.loadingMore)
                    } else if !vm.items.isEmpty {
                        Text("Fin de la bitácora para este rango.")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
    }

    private func eventRow(_ ev: IntegraRow) -> some View {
        let outcome = IntegraDict.str(ev.raw, "outcome").nilIfEmpty
        let label = IntegraDict.str(ev.raw, "label").nilIfEmpty
        let eventType = IntegraDict.str(ev.raw, "eventType").nilIfEmpty
        let person = IntegraDict.str(ev.raw, "personName").nilIfEmpty ?? "Sin persona identificada"
        let door = [
            IntegraDict.str(ev.raw, "deviceName"),
            IntegraDict.str(ev.raw, "doorName"),
            IntegraDict.str(ev.raw, "deviceIp"),
        ].first { !$0.isEmpty } ?? ""
        let when = IntegraDict.str(ev.raw, "occurredAt", "time", "createdAt")
        let eventState = IntegraDict.str(ev.raw, "eventState").nilIfEmpty
        let outcomeText = label
            ?? (outcome == "granted" ? "Acceso concedido"
                : outcome == "denied" ? "Acceso denegado"
                : eventType ?? "Evento")
        let outcomeTone: NxTone = {
            if outcome == "granted" { return .success }
            if outcome == "denied" { return .danger }
            return .neutral
        }()
        let stateLabel: String? = {
            switch eventState?.lowercased() {
            case "active": return "Activo"
            case "inactive": return "Cerrado"
            default: return nil // null = sin duración; no se pinta como activo/cerrado
            }
        }()
        let stateTone: NxTone = eventState?.lowercased() == "active" ? .warning : .neutral

        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(person).font(.subheadline.weight(.semibold))
                Spacer()
                NxStatusChip(text: outcomeText, tone: outcomeTone)
            }
            if !door.isEmpty {
                Text(door).font(.caption).foregroundColor(.secondary)
            }
            HStack {
                if !when.isEmpty {
                    Text(when).font(.caption2).foregroundColor(.secondary)
                }
                Spacer()
                if let stateLabel {
                    NxStatusChip(text: stateLabel, tone: stateTone)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

@MainActor
final class IntegraEventsVM: ObservableObject {
    @Published var items: [IntegraRow] = []
    @Published var stats: [String: Any] = [:]
    @Published var view: IntegraEventQuickView = .hoy
    @Published var eventState: String?
    @Published var query = ""
    @Published var hasMore = false
    @Published var nextBeforeId: Int64?
    @Published var loading = true
    @Published var loadingMore = false
    @Published var error: String?

    private let repo = IntegraRepository.shared

    var filtered: [IntegraRow] {
        items.filter {
            IntegraDict.matchesQuery(
                $0.raw, query: query,
                "personName", "name", "label", "doorName", "deviceName", "deviceIp", "eventType"
            )
        }
    }

    func statInt(_ keys: String...) -> Int {
        for k in keys {
            let v = IntegraDict.int(stats, k)
            if v != 0 || stats[k] != nil { return v }
        }
        return 0
    }

    func setView(_ v: IntegraEventQuickView) async {
        guard view != v else { return }
        view = v
        items = []
        nextBeforeId = nil
        await refresh()
    }

    func setEventState(_ v: String?) async {
        eventState = v
        items = []
        nextBeforeId = nil
        await refresh()
    }

    func refresh(initial: Bool = true) async {
        if initial && items.isEmpty { loading = true }
        error = nil
        let (from, to) = range(for: view)
        do {
            let page = try await repo.pushEvents(
                limit: integraEventPage,
                scope: view.scope,
                outcome: view.outcome,
                eventState: eventState,
                from: from,
                to: to
            )
            items = page.items.enumerated().map { idx, raw in
                let id = IntegraDict.str(raw, "id").nilIfEmpty ?? "ev-\(idx)"
                return IntegraRow(id: id, raw: raw)
            }
            hasMore = page.hasMore
            nextBeforeId = page.nextBeforeId
            stats = (try? await repo.pushEventStats()) ?? [:]
            loading = false
        } catch {
            loading = false
            self.error = error.toUserMessage(fallback: "No se pudieron cargar los eventos")
        }
    }

    func loadMore() async {
        guard !loadingMore, hasMore, let cursor = nextBeforeId else { return }
        loadingMore = true
        let (from, to) = range(for: view)
        do {
            let page = try await repo.pushEvents(
                limit: integraEventPage,
                scope: view.scope,
                outcome: view.outcome,
                eventState: eventState,
                from: from,
                to: to,
                beforeId: cursor
            )
            let base = items.count
            let more = page.items.enumerated().map { idx, raw in
                let id = IntegraDict.str(raw, "id").nilIfEmpty ?? "ev-\(base + idx)"
                return IntegraRow(id: id, raw: raw)
            }
            items.append(contentsOf: more)
            hasMore = page.hasMore
            nextBeforeId = page.nextBeforeId
            loadingMore = false
        } catch {
            loadingMore = false
            self.error = error.toUserMessage(fallback: "No se pudo traer la página siguiente")
        }
    }

    private func range(for view: IntegraEventQuickView) -> (Date?, Date?) {
        let now = Date()
        if view.hoursBack == 0 {
            let start = Calendar.current.startOfDay(for: now)
            return (start, now)
        }
        return (now.addingTimeInterval(-Double(view.hoursBack) * 3600), now)
    }
}
