import SwiftUI

/// Cola SOC de alarmas. Agrupa duplicados (ventana 5 min) y confirma ack/clear.
/// Paridad `IntegraAlarmsScreen`.
private let integraAlarmGroupWindowMs: TimeInterval = 5 * 60

struct IntegraAlarmGroup: Identifiable, Hashable {
    let id: String
    let representante: IntegraRow
    let miembros: [IntegraRow]
    let totalOcurrencias: Int

    static func == (lhs: IntegraAlarmGroup, rhs: IntegraAlarmGroup) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct IntegraAlarmsView: View {
    @StateObject private var vm = IntegraAlarmsVM()

    var body: some View {
        Group {
            if vm.loading && vm.items.isEmpty {
                ProgressView("Cargando alarmas…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = vm.error, vm.items.isEmpty {
                NxEmptyState(title: "No se pudieron cargar", subtitle: error, actionLabel: "Reintentar") {
                    Task { await vm.refresh() }
                }
            } else {
                listBody
            }
        }
        .navigationTitle("Alarmas")
        .task { await vm.refresh() }
        .refreshable { await vm.refresh(initial: false) }
        .sheet(item: $vm.selected) { group in
            IntegraAlarmDetailSheet(
                group: group,
                note: $vm.note,
                sending: vm.sending,
                onAck: { vm.requestConfirm(.atender) },
                onClear: { vm.requestConfirm(.cerrar) },
                onDismiss: { if !vm.sending { vm.selected = nil } }
            )
        }
        .confirmationDialog(
            vm.pendingConfirm?.title ?? "Confirmar",
            isPresented: Binding(
                get: { vm.pendingConfirm != nil },
                set: { if !$0 && !vm.sending { vm.pendingConfirm = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(vm.pendingConfirm?.confirmLabel ?? "Confirmar", role: .destructive) {
                Task { await vm.executePending() }
            }
            Button("Cancelar", role: .cancel) {
                if !vm.sending { vm.pendingConfirm = nil }
            }
        } message: {
            Text(vm.pendingConfirm?.message(for: vm.selected) ?? "")
        }
    }

    private var listBody: some View {
        List {
            Section {
                HStack(spacing: 0) {
                    kpi("Abiertas", "\(vm.openCount)", .danger)
                    Divider().frame(height: 36)
                    kpi("En cola", "\(vm.displayGroups.count)", .brand)
                    Divider().frame(height: 36)
                    kpi("Ventana", "\(vm.hours)h", .info)
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                .listRowBackground(Color.clear)

                if !vm.source.isEmpty {
                    Text("Fuente: \(vm.source)")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }

                Toggle("Agrupar duplicados (5 min)", isOn: $vm.agrupar)

                HStack {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Título, puerta o dispositivo", text: $vm.query)
                        .autocorrectionDisabled()
                }

                Picker("Ventana", selection: $vm.hours) {
                    Text("8 h").tag(8)
                    Text("24 h").tag(24)
                    Text("72 h").tag(72)
                }
                .pickerStyle(.segmented)
                .onChange(of: vm.hours) { _, _ in Task { await vm.refresh() } }

                Picker("Estado", selection: $vm.statusFilter) {
                    Text("Pendientes").tag(IntegraAlarmStatusFilter.pendientes)
                    Text("Nuevas").tag(IntegraAlarmStatusFilter.nuevas)
                    Text("Atendidas").tag(IntegraAlarmStatusFilter.atendidas)
                    Text("Cerradas").tag(IntegraAlarmStatusFilter.cerradas)
                    Text("Todas").tag(IntegraAlarmStatusFilter.todas)
                }
            }

            if let message = vm.message {
                Section {
                    NxAlertBanner(alert: NxAlert(
                        id: "msg",
                        title: message,
                        tone: vm.messageIsError ? .danger : .success
                    ))
                }
            }

            if vm.displayGroups.isEmpty {
                Section {
                    NxEmptyState(
                        title: "Sin alarmas",
                        subtitle: "No hay alarmas en la ventana seleccionada."
                    )
                }
            } else {
                ForEach(vm.displayGroups) { group in
                    Button { vm.selected = group } label: {
                        alarmRow(group)
                    }
                }
            }
        }
    }

    private func kpi(_ label: String, _ value: String, _ tone: NxTone) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.title3.bold()).foregroundColor(tone.fg)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func alarmRow(_ group: IntegraAlarmGroup) -> some View {
        let alarm = group.representante
        let title = IntegraDict.str(alarm.raw, "title", "label", "type").nilIfEmpty
            ?? IntegraAlarmRules.kindLabel(
                IntegraDict.str(alarm.raw, "kind").nilIfEmpty,
                eventType: IntegraDict.str(alarm.raw, "eventType").nilIfEmpty
            )
            .nilIfEmpty
            ?? "Alarma"
        let severity = IntegraDict.str(alarm.raw, "severity", "level")
        let where_ = IntegraDict.str(alarm.raw, "doorName", "deviceName", "location")
        let when = IntegraDict.str(alarm.raw, "occurredAt", "time", "createdAt", "timestamp")
        let status = IntegraDict.str(alarm.raw, "status", "state")
        let tone = IntegraAlarmRules.severityTone(severity)

        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title).font(.subheadline.weight(.semibold)).foregroundColor(.primary)
                Spacer()
                if group.totalOcurrencias > 1 {
                    NxStatusChip(text: "×\(group.totalOcurrencias)", tone: .warning)
                }
                if !severity.isEmpty {
                    NxStatusChip(text: IntegraAlarmRules.severityLabel(severity), tone: tone)
                }
            }
            if !where_.isEmpty {
                Text(where_).font(.caption).foregroundColor(.secondary)
            }
            HStack {
                if !status.isEmpty {
                    Text(IntegraAlarmRules.statusLabel(status)).font(.caption2).foregroundColor(.secondary)
                }
                Spacer()
                if !when.isEmpty {
                    Text(when).font(.caption2).foregroundColor(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

enum IntegraAlarmStatusFilter: String, Hashable {
    case pendientes, nuevas, atendidas, cerradas, todas
}

enum IntegraAlarmOp {
    case atender, cerrar

    var title: String {
        switch self {
        case .atender: return "Marcar como atendida"
        case .cerrar: return "Cerrar alarma"
        }
    }

    var confirmLabel: String {
        switch self {
        case .atender: return "Atender"
        case .cerrar: return "Cerrar"
        }
    }

    func message(for group: IntegraAlarmGroup?) -> String {
        let n = group?.miembros.count ?? 1
        let plural = n > 1 ? " (\(n) repeticiones)" : ""
        switch self {
        case .atender:
            return "Confirma que revisaste esta alarma\(plural). Un toque accidental con el pulgar no debe atenderla."
        case .cerrar:
            return "La alarma saldrá de la cola abierta\(plural). Esta acción no se puede deshacer desde el teléfono."
        }
    }
}

enum IntegraAlarmRules {
    static func statusLabel(_ status: String?) -> String {
        switch status?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
        case "OPEN": return "Nueva"
        case "ACK": return "Atendida"
        case "CLEARED": return "Cerrada"
        case "TICKETED": return "Escalada a ticket"
        case nil, "": return "Sin estado"
        default: return status?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        }
    }

    static func isPending(_ status: String?) -> Bool {
        let s = status?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return s == "OPEN" || s == "TICKETED"
    }

    static func passes(_ status: String?, filter: IntegraAlarmStatusFilter) -> Bool {
        let s = status?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        switch filter {
        case .todas: return true
        case .pendientes: return isPending(status)
        case .nuevas: return s == "OPEN"
        case .atendidas: return s == "ACK"
        case .cerradas: return s == "CLEARED"
        }
    }

    static func severityLabel(_ raw: String) -> String {
        switch raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "alta", "high", "critical", "critica", "crítica": return "Alta"
        case "media", "medium", "warning": return "Media"
        case "baja", "low": return "Baja"
        default: return raw.isEmpty ? "Sin clasificar" : raw
        }
    }

    static func severityTone(_ raw: String) -> NxTone {
        switch raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "alta", "high", "critical", "critica", "crítica": return .danger
        case "media", "medium", "warning": return .warning
        case "baja", "low": return .info
        default: return .neutral
        }
    }

    static func kindLabel(_ kind: String?, eventType: String?) -> String {
        let map: [String: String] = [
            "DENIED": "Acceso denegado",
            "AFTER_HOURS": "Entrada fuera de horario",
            "DOOR_FORCED": "Puerta forzada",
            "DOOR_HELD_OPEN": "Puerta mantenida abierta",
            "ANTIPASSBACK": "Antipassback",
            "CREDENTIAL_EXPIRED": "Credencial caducada",
            "BLOCKLIST": "Persona en lista negra",
            "AUTH_FAILURE_BURST": "Ráfaga de fallos de reconocimiento",
            "CAMERA_TAMPER": "Sabotaje de cámara",
        ]
        let k = kind?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        if let hit = map[k] { return hit }
        let cola = eventType?.split(separator: ".").last.map(String.init)?.uppercased() ?? ""
        if let hit = map[cola] { return hit }
        return k.isEmpty ? cola : k
    }

    static func fingerprint(_ alarm: [String: Any]) -> String {
        [
            IntegraDict.str(alarm, "status").uppercased(),
            IntegraDict.str(alarm, "kind").nilIfEmpty
                ?? IntegraDict.str(alarm, "eventType").nilIfEmpty
                ?? IntegraDict.str(alarm, "title"),
            IntegraDict.str(alarm, "personId").nilIfEmpty
                ?? IntegraDict.str(alarm, "personName").nilIfEmpty
                ?? "anon",
            IntegraDict.str(alarm, "doorNo").nilIfEmpty
                ?? IntegraDict.str(alarm, "doorIndexCode").nilIfEmpty
                ?? IntegraDict.str(alarm, "deviceName", "deviceIp", "source"),
        ].joined(separator: "|").lowercased()
    }

    /// Agrupa repeticiones en ventanas de 5 minutos (paridad Android `agruparAlarmas`).
    static func agrupar(_ items: [IntegraRow]) -> [IntegraAlarmGroup] {
        var abiertos: [String: [IntegraRow]] = [:]
        var ordenHuellas: [String] = []
        var cerrados: [[IntegraRow]] = []
        var sueltas: [IntegraRow] = []

        for a in items {
            guard let t = IntegraCoreFormat.parseMs(
                IntegraDict.str(a.raw, "occurredAt", "time", "createdAt", "timestamp").nilIfEmpty
            ) else {
                sueltas.append(a)
                continue
            }
            let huella = fingerprint(a.raw)
            if var abierto = abiertos[huella],
               let ultimo = abierto.last.flatMap({
                   IntegraCoreFormat.parseMs(
                       IntegraDict.str($0.raw, "occurredAt", "time", "createdAt", "timestamp").nilIfEmpty
                   )
               }),
               abs(ultimo - t) <= integraAlarmGroupWindowMs {
                abierto.append(a)
                abiertos[huella] = abierto
            } else {
                if let prev = abiertos[huella] {
                    cerrados.append(prev)
                } else {
                    ordenHuellas.append(huella)
                }
                abiertos[huella] = [a]
            }
        }

        func grupo(_ miembros: [IntegraRow]) -> IntegraAlarmGroup {
            let repre = miembros.max(by: { a, b in
                (IntegraCoreFormat.parseMs(IntegraDict.str(a.raw, "occurredAt", "time", "createdAt", "timestamp").nilIfEmpty) ?? 0)
                    < (IntegraCoreFormat.parseMs(IntegraDict.str(b.raw, "occurredAt", "time", "createdAt", "timestamp").nilIfEmpty) ?? 0)
            }) ?? miembros[0]
            let total = miembros.reduce(0) { acc, m in
                acc + max(1, IntegraDict.int(m.raw, "occurrenceCount"))
            }
            return IntegraAlarmGroup(
                id: repre.id + "·\(miembros.count)·\(total)",
                representante: repre,
                miembros: miembros,
                totalOcurrencias: total
            )
        }

        let grupos = cerrados.map(grupo) + abiertos.values.map(grupo) + sueltas.map { grupo([$0]) }
        return grupos.sorted { a, b in
            let ta = IntegraCoreFormat.parseMs(
                IntegraDict.str(a.representante.raw, "occurredAt", "time", "createdAt", "timestamp").nilIfEmpty
            ) ?? 0
            let tb = IntegraCoreFormat.parseMs(
                IntegraDict.str(b.representante.raw, "occurredAt", "time", "createdAt", "timestamp").nilIfEmpty
            ) ?? 0
            return ta > tb
        }
    }
}

@MainActor
final class IntegraAlarmsVM: ObservableObject {
    @Published var items: [IntegraRow] = []
    @Published var openCount = 0
    @Published var source = ""
    @Published var hours = 24
    @Published var query = ""
    @Published var note = ""
    @Published var agrupar = true
    @Published var statusFilter: IntegraAlarmStatusFilter = .pendientes
    @Published var loading = true
    @Published var sending = false
    @Published var error: String?
    @Published var message: String?
    @Published var messageIsError = false
    @Published var selected: IntegraAlarmGroup?
    @Published var pendingConfirm: IntegraAlarmPending?

    private let repo = IntegraRepository.shared

    var displayGroups: [IntegraAlarmGroup] {
        let base: [IntegraAlarmGroup]
        if agrupar {
            base = IntegraAlarmRules.agrupar(items)
        } else {
            base = items.map {
                IntegraAlarmGroup(id: $0.id, representante: $0, miembros: [$0], totalOcurrencias: 1)
            }
        }
        return base.filter { group in
            let status = IntegraDict.str(group.representante.raw, "status", "state")
            guard IntegraAlarmRules.passes(status, filter: statusFilter) else { return false }
            return IntegraDict.matchesQuery(
                group.representante.raw, query: query,
                "title", "label", "type", "doorName", "deviceName", "location", "kind"
            )
        }
    }

    func refresh(initial: Bool = true) async {
        if initial && items.isEmpty { loading = true }
        error = nil
        do {
            let result = try await repo.alarmQueue(hours: hours)
            openCount = result.openCount
            source = result.source
            items = result.items.enumerated().map { idx, raw in
                let id = IntegraDict.str(raw, "id").nilIfEmpty ?? "alarm-\(idx)"
                return IntegraRow(id: id, raw: raw)
            }
            loading = false
        } catch {
            loading = false
            self.error = error.toUserMessage(fallback: "No se pudo cargar la cola de alarmas")
        }
    }

    func requestConfirm(_ op: IntegraAlarmOp) {
        guard selected != nil else { return }
        pendingConfirm = IntegraAlarmPending(op: op)
    }

    func executePending() async {
        guard !sending, let pending = pendingConfirm, let group = selected else { return }
        sending = true
        defer { sending = false }
        let ids = group.miembros.map(\.id).filter { !$0.isEmpty }
        guard !ids.isEmpty else {
            message = "Esta alarma no trae identificador."
            messageIsError = true
            pendingConfirm = nil
            return
        }
        do {
            switch pending.op {
            case .atender:
                for id in ids {
                    _ = try await repo.ackAlarm(alarmId: id, note: note.nilIfEmpty)
                }
                message = "Alarma marcada como atendida (\(ids.count))"
            case .cerrar:
                for id in ids {
                    _ = try await repo.clearAlarm(alarmId: id, note: note.nilIfEmpty)
                }
                message = "Alarma cerrada (\(ids.count))"
            }
            messageIsError = false
            pendingConfirm = nil
            selected = nil
            note = ""
            await refresh(initial: false)
        } catch {
            message = error.toUserMessage(fallback: "No se pudo completar la operación")
            messageIsError = true
            pendingConfirm = nil
        }
    }
}

struct IntegraAlarmPending: Identifiable {
    let id = UUID()
    let op: IntegraAlarmOp
    var title: String { op.title }
    var confirmLabel: String { op.confirmLabel }
    func message(for group: IntegraAlarmGroup?) -> String { op.message(for: group) }
}

private struct IntegraAlarmDetailSheet: View {
    let group: IntegraAlarmGroup
    @Binding var note: String
    let sending: Bool
    let onAck: () -> Void
    let onClear: () -> Void
    let onDismiss: () -> Void

    private var alarm: IntegraRow { group.representante }

    private var title: String {
        IntegraDict.str(alarm.raw, "title", "label", "type").nilIfEmpty
            ?? IntegraAlarmRules.kindLabel(
                IntegraDict.str(alarm.raw, "kind").nilIfEmpty,
                eventType: IntegraDict.str(alarm.raw, "eventType").nilIfEmpty
            )
            .nilIfEmpty
            ?? "Alarma"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(title).font(.headline)
                    LabeledContent("ID", value: alarm.id)
                    if group.totalOcurrencias > 1 {
                        LabeledContent("Repeticiones", value: "\(group.totalOcurrencias)")
                    }
                    let severity = IntegraDict.str(alarm.raw, "severity", "level")
                    if !severity.isEmpty {
                        LabeledContent("Severidad", value: IntegraAlarmRules.severityLabel(severity))
                    }
                    let where_ = IntegraDict.str(alarm.raw, "doorName", "deviceName", "location")
                    if !where_.isEmpty {
                        LabeledContent("Ubicación", value: where_)
                    }
                    let when = IntegraDict.str(alarm.raw, "occurredAt", "time", "createdAt", "timestamp")
                    if !when.isEmpty {
                        LabeledContent("Cuándo", value: when)
                    }
                }
                Section("Nota (opcional)") {
                    TextField("Observación al atender o cerrar", text: $note, axis: .vertical)
                        .lineLimit(2...4)
                        .disabled(sending)
                }
                Section {
                    Button("Atender", action: onAck).disabled(sending)
                    Button("Cerrar alarma", role: .destructive, action: onClear).disabled(sending)
                    if sending { ProgressView() }
                } footer: {
                    Text(group.miembros.count > 1
                        ? "Atender/cerrar actúa sobre las \(group.miembros.count) repeticiones del grupo."
                        : "Atender y cerrar piden confirmación: evita un toque accidental con el pulgar.")
                }
            }
            .navigationTitle("Detalle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar", action: onDismiss).disabled(sending)
                }
            }
        }
        .interactiveDismissDisabled(sending)
    }
}
