import SwiftUI

/// Cola SOC de alarmas. Ack / cierre con confirmación (seguridad de pulgar).
/// Paridad `IntegraAlarmsScreen`.
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
        .sheet(item: $vm.selected) { alarm in
            IntegraAlarmDetailSheet(
                alarm: alarm,
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
            Text(vm.pendingConfirm?.message ?? "")
        }
    }

    private var listBody: some View {
        List {
            Section {
                HStack(spacing: 0) {
                    kpi("Abiertas", "\(vm.openCount)", .danger)
                    Divider().frame(height: 36)
                    kpi("En cola", "\(vm.items.count)", .brand)
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

            if vm.filtered.isEmpty {
                Section {
                    NxEmptyState(
                        title: "Sin alarmas",
                        subtitle: "No hay alarmas en la ventana seleccionada."
                    )
                }
            } else {
                ForEach(vm.filtered) { alarm in
                    Button { vm.selected = alarm } label: {
                        alarmRow(alarm)
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

    private func alarmRow(_ alarm: IntegraRow) -> some View {
        let title = IntegraDict.str(alarm.raw, "title", "label", "type").nilIfEmpty ?? "Alarma"
        let severity = IntegraDict.str(alarm.raw, "severity", "level")
        let where_ = IntegraDict.str(alarm.raw, "doorName", "deviceName", "location")
        let when = IntegraDict.str(alarm.raw, "occurredAt", "time", "createdAt")
        let status = IntegraDict.str(alarm.raw, "status", "state").lowercased()
        let tone: NxTone
        switch severity.lowercased() {
        case "critical", "high", "alta", "critica", "crítica": tone = .danger
        case "medium", "media", "warning": tone = .warning
        default: tone = .neutral
        }

        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title).font(.subheadline.weight(.semibold)).foregroundColor(.primary)
                Spacer()
                if !severity.isEmpty {
                    NxStatusChip(text: severity, tone: tone)
                }
            }
            if !where_.isEmpty {
                Text(where_).font(.caption).foregroundColor(.secondary)
            }
            HStack {
                if !status.isEmpty {
                    Text(status).font(.caption2).foregroundColor(.secondary)
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

    var message: String {
        switch self {
        case .atender:
            return "Confirma que revisaste esta alarma. Un toque accidental con el pulgar no debe atenderla."
        case .cerrar:
            return "La alarma saldrá de la cola abierta. Esta acción no se puede deshacer desde el teléfono."
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
    @Published var loading = true
    @Published var sending = false
    @Published var error: String?
    @Published var message: String?
    @Published var messageIsError = false
    @Published var selected: IntegraRow?
    @Published var pendingConfirm: IntegraAlarmPending?

    private let repo = IntegraRepository.shared

    var filtered: [IntegraRow] {
        items.filter {
            IntegraDict.matchesQuery(
                $0.raw, query: query,
                "title", "label", "type", "doorName", "deviceName", "location"
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
            self.error = error.localizedDescription
        }
    }

    func requestConfirm(_ op: IntegraAlarmOp) {
        guard selected != nil else { return }
        pendingConfirm = IntegraAlarmPending(op: op)
    }

    func executePending() async {
        guard !sending, let pending = pendingConfirm, let alarm = selected else { return }
        sending = true
        defer { sending = false }
        do {
            switch pending.op {
            case .atender:
                _ = try await repo.ackAlarm(alarmId: alarm.id, note: note.nilIfEmpty)
                message = "Alarma marcada como atendida"
            case .cerrar:
                _ = try await repo.clearAlarm(alarmId: alarm.id, note: note.nilIfEmpty)
                message = "Alarma cerrada"
            }
            messageIsError = false
            pendingConfirm = nil
            selected = nil
            note = ""
            await refresh(initial: false)
        } catch {
            message = error.localizedDescription
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
    var message: String { op.message }
}

private struct IntegraAlarmDetailSheet: View {
    let alarm: IntegraRow
    @Binding var note: String
    let sending: Bool
    let onAck: () -> Void
    let onClear: () -> Void
    let onDismiss: () -> Void

    private var title: String {
        IntegraDict.str(alarm.raw, "title", "label", "type").nilIfEmpty ?? "Alarma"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(title).font(.headline)
                    LabeledContent("ID", value: alarm.id)
                    let severity = IntegraDict.str(alarm.raw, "severity", "level")
                    if !severity.isEmpty {
                        LabeledContent("Severidad", value: severity)
                    }
                    let where_ = IntegraDict.str(alarm.raw, "doorName", "deviceName", "location")
                    if !where_.isEmpty {
                        LabeledContent("Ubicación", value: where_)
                    }
                    let when = IntegraDict.str(alarm.raw, "occurredAt", "time", "createdAt")
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
                    Text("Atender y cerrar piden confirmación: evita un toque accidental con el pulgar.")
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
