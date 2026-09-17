import SwiftUI

/// Persona y día a justificar.
private struct AttendanceJustifyTarget: Identifiable {
    let userId: Int
    let nombre: String
    /// `AAAA-MM-DD`.
    let fecha: String

    var id: String { "\(userId)-\(fecha)" }
}

/// «Equipo del día»: KPIs, filtros y una tarjeta por persona con sus horas,
/// sus fotos de entrada/salida y sus mapas. Espejo de la pestaña `equipo` de
/// `apps/web/app/(panels)/erp/asistencias/page.tsx`. Las faltas justificadas se
/// ven como «Falta justificada · motivo» y solo Christian ve «Justificar falta».
struct AsistenciasEquipoSection: View {
    @ObservedObject var vm: AttendanceVM
    let onPhoto: (CorePhotoItem) -> Void

    @State private var justificar: AttendanceJustifyTarget?
    @State private var justifyNotice: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            kpis
            productividad
            chips
            if let justifyNotice {
                NxIconText(systemName: "checkmark.seal.fill", text: justifyNotice, tint: CorePalette.purple)
                    .font(.footnote.weight(.semibold))
            }
            if let error = vm.teamError {
                NxAlertBanner(
                    alert: NxAlert(id: "att-team", title: "No se pudo cargar el equipo", subtitle: error, tone: .danger),
                    actionLabel: "Reintentar",
                    onAction: { Task { await vm.loadTeam(quiet: false) } }
                )
            }
            header
            if vm.teamLoading && vm.rows.isEmpty {
                ProgressView("Consultando la asistencia de tu gente…")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
            } else if vm.filteredRows.isEmpty {
                NxEmptyState(
                    title: vm.rows.isEmpty ? "Sin registros" : "Nadie en este filtro",
                    subtitle: vm.rows.isEmpty
                        ? "Nadie en tu alcance para esta fecha."
                        : "Prueba otro filtro o toca un KPI de arriba.",
                    actionLabel: "Actualizar",
                    onAction: { Task { await vm.loadTeam(quiet: false) } }
                )
            } else {
                ForEach(vm.filteredRows) { row in
                    AttendancePersonCard(
                        row: row,
                        canJustify: vm.canJustifyAbsence,
                        onPhoto: onPhoto,
                        onJustify: {
                            justifyNotice = nil
                            justificar = AttendanceJustifyTarget(
                                userId: row.member.userId,
                                nombre: row.member.displayName,
                                fecha: vm.dateString
                            )
                        }
                    )
                }
            }
        }
        .sheet(item: $justificar) { target in
            AttendanceJustifySheet(target: target) { motivo in
                let error = await vm.justifyAbsence(userId: target.userId, fecha: target.fecha, motivo: motivo)
                if error == nil {
                    justifyNotice = "Falta de \(CoreFormat.shortName(target.nombre)) justificada."
                }
                return error
            }
        }
    }

    // MARK: KPIs y filtros

    private var kpis: some View {
        let counts = vm.counts
        return HStack(spacing: 8) {
            AttendanceKpiTile(label: "Total equipo", value: counts.total, color: nil,
                              active: vm.filter == nil) { vm.filter = nil }
            AttendanceKpiTile(label: "En jornada", value: counts.presentes, color: CorePalette.green,
                              active: vm.filter == .presente) { vm.filter = .presente }
            AttendanceKpiTile(label: "Completaron", value: counts.completos, color: CorePalette.blue,
                              active: vm.filter == .completo) { vm.filter = .completo }
            AttendanceKpiTile(label: "Sin checada", value: counts.ausentes, color: CorePalette.slate,
                              active: vm.filter == .ausente) { vm.filter = .ausente }
        }
    }

    /// Suma de jornadas abiertas y cerradas, al segundo (como la web).
    private var productividad: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("PRODUCTIVIDAD DEL DÍA")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                    Text("Jornadas abiertas y cerradas · se actualiza cada segundo")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(AttendanceClock.hms(vm.productividad(now: context.date)))
                    .font(.system(.title2, design: .monospaced).weight(.heavy))
                    .foregroundStyle(CorePalette.green)
            }
            .padding(12)
            .frame(maxWidth: .infinity)
            .background(CorePalette.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
        }
    }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterChip(nil, label: "Todos", count: vm.counts.total)
                filterChip(.presente, label: AttendanceEstado.presente.label, count: vm.counts.presentes)
                filterChip(.completo, label: AttendanceEstado.completo.label, count: vm.counts.completos)
                if vm.justificadas > 0 || vm.canJustifyAbsence {
                    filterChip(.justificada, label: AttendanceEstado.justificada.label, count: vm.justificadas)
                }
                filterChip(.ausente, label: AttendanceEstado.ausente.label, count: vm.counts.ausentes)
            }
            .padding(.vertical, 2)
        }
    }

    private func filterChip(_ estado: AttendanceEstado?, label: String, count: Int) -> some View {
        let active = vm.filter == estado
        let color = estado?.color ?? Color.accentColor
        return Button {
            vm.filter = estado
        } label: {
            Text("\(label) \(count)")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .foregroundStyle(active ? Color.white : Color.primary)
                .background(active ? color : Color(.secondarySystemGroupedBackground), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(vm.filter?.label ?? "Equipo del día") (\(vm.filteredRows.count))")
                .font(.headline)
            Text("Toca una tarjeta para abrir la pizarra de la persona.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

private struct AttendanceKpiTile: View {
    let label: String
    let value: Int
    let color: Color?
    let active: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 2) {
                Text("\(value)")
                    .font(.title3.weight(.heavy))
                    .foregroundStyle(color ?? Color.primary)
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(active ? (color ?? Color.accentColor) : Color.clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }
}

/// Tarjeta de una persona: horas, fotos con su etiqueta y mapas.
private struct AttendancePersonCard: View {
    let row: AttendanceDayRow
    let canJustify: Bool
    let onPhoto: (CorePhotoItem) -> Void
    let onJustify: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // El nombre lleva a su día en Actividades (la pizarra de la persona),
            // igual que el enlace `/erp/pizarra/:userId` de la web.
            NavigationLink {
                TeamMemberDetailView(userId: row.member.userId, nombre: row.member.displayName)
            } label: {
                header
            }
            .buttonStyle(.plain)
            horas
            if let falta = row.justification {
                faltaJustificada(falta)
            }
            if row.estado == .ausente && canJustify {
                HStack {
                    Spacer()
                    Button(action: onJustify) {
                        Label("Justificar falta", systemImage: "checkmark.seal")
                    }
                    .buttonStyle(.bordered)
                    .tint(CorePalette.purple)
                    .font(.caption.weight(.semibold))
                }
            }
            fotos
            mapas
        }
        .coreCard(highlight: row.estado == .presente ? CorePalette.green : nil)
    }

    /// «Falta justificada · motivo», quién y cuándo (no es checada ni suma horas).
    private func faltaJustificada(_ falta: AttendanceJustification) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "checkmark.seal.fill")
                .foregroundStyle(CorePalette.purple)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(falta.texto)
                    .font(.footnote.weight(.semibold))
                Text(falta.detalle)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CorePalette.purple.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }

    private var header: some View {
        HStack(spacing: 10) {
            CoreAvatar(name: row.member.displayName, url: nil, size: 44)
                .overlay(alignment: .bottomTrailing) {
                    Circle()
                        .fill(row.estado.color)
                        .frame(width: 12, height: 12)
                        .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 2))
                }
            VStack(alignment: .leading, spacing: 2) {
                Text(row.isMe ? "\(row.member.displayName) (tú)" : row.member.displayName)
                    .font(.subheadline.weight(.bold))
                    .lineLimit(1)
                Text(row.member.roleLine.isEmpty ? "—" : row.member.roleLine)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            CoreChip(text: row.estado.label, color: row.estado.color)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
        }
    }

    private var horas: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            HStack(alignment: .top) {
                hora("ENTRADA", AttendanceClock.time(row.checkIn))
                hora("SALIDA", AttendanceClock.time(row.checkOut))
                VStack(alignment: .trailing, spacing: 2) {
                    Text(row.estado == .presente ? "EN VIVO" : row.estado == .completo ? "JORNADA" : "TIEMPO")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(row.estado == .ausente || row.estado == .justificada
                         ? "—"
                         : AttendanceClock.hms(row.elapsed(now: context.date)))
                        .font(.system(.body, design: .monospaced).weight(.heavy))
                        .foregroundStyle(row.estado.color)
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .padding(10)
            .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private func hora(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            Text(value).font(.system(.body, design: .monospaced).weight(.semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Las fotos van etiquetadas: una cara sin decir si entra o sale no sirve
    /// para revisar nada.
    @ViewBuilder
    private var fotos: some View {
        if row.entryPunch != nil || row.exitPunch != nil {
            HStack(spacing: 10) {
                foto("Entrada", symbol: "arrow.right.circle", row.entryPunch)
                foto("Salida", symbol: "rectangle.portrait.and.arrow.right", row.exitPunch)
                Spacer(minLength: 0)
            }
        }
    }

    @ViewBuilder
    private func foto(_ label: String, symbol: String, _ punch: AttendancePunch?) -> some View {
        if let punch {
            VStack(spacing: 4) {
                if punch.photoUrl.isEmpty {
                    // El API a veces no guardó el archivo: se dice, no se finge.
                    Text("Foto no disponible")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(width: 64, height: 64)
                        .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                } else {
                    Button {
                        onPhoto(CorePhotoItem(
                            title: "\(CoreFormat.shortName(row.member.displayName)) · \(label)",
                            url: punch.photoUrl,
                            latitude: punch.coords?.lat,
                            longitude: punch.coords?.lng,
                            time: punch.timestamp
                        ))
                    } label: {
                        AuthenticatedImage(url: punch.photoUrl)
                            .frame(width: 64, height: 64)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
                NxIconText(systemName: symbol, text: label).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var mapas: some View {
        let entrada = AttendanceClock.mapUrl(lat: row.entryPunch?.coords?.lat, lng: row.entryPunch?.coords?.lng)
        let salida = AttendanceClock.mapUrl(lat: row.exitPunch?.coords?.lat, lng: row.exitPunch?.coords?.lng)
        if entrada != nil || salida != nil {
            HStack(spacing: 14) {
                if let entrada { Link("Mapa entrada", destination: entrada).font(.caption.weight(.semibold)) }
                if let salida { Link("Mapa salida", destination: salida).font(.caption.weight(.semibold)) }
            }
        }
    }
}

/// «Justificar falta» (solo Christian): motivo de al menos 10 caracteres. No crea checadas.
private struct AttendanceJustifySheet: View {
    let target: AttendanceJustifyTarget
    /// Devuelve el error legible, o `nil` si quedó justificada.
    let onSubmit: (String) async -> String?

    @Environment(\.dismiss) private var dismiss
    @State private var motivo = ""
    @State private var saving = false
    @State private var error: String?

    private var limpio: String { motivo.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var minimo: Int { AttendanceJustification.motivoMinimo }
    private var motivoOk: Bool { limpio.count >= minimo }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(target.nombre).font(.headline)
                    NxIconText(systemName: "calendar", text: AttendanceJustification.diaCorto(target.fecha))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("El día quedará como «Falta justificada» con tu motivo; no se crea ninguna checada. Se avisa a la persona y a sus jefes.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section {
                    TextField("Ej. Cita médica con comprobante del IMSS.", text: $motivo, axis: .vertical)
                        .lineLimit(3...6)
                        .disabled(saving)
                } header: {
                    Text("Motivo")
                } footer: {
                    CoreMotivoCounter(count: limpio.count, minimo: minimo)
                }

                if let error {
                    Section {
                        Text(error).foregroundStyle(CorePalette.red)
                    }
                }

                Section {
                    Button {
                        Task { await save() }
                    } label: {
                        Label(saving ? "Guardando…" : "Justificar falta", systemImage: "checkmark.seal")
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(saving || !motivoOk)
                }
            }
            .navigationTitle("Justificar falta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .disabled(saving)
                }
            }
            .interactiveDismissDisabled(saving)
            .onChange(of: motivo) { _, value in
                if value.count > AttendanceJustification.motivoMaximo {
                    motivo = String(value.prefix(AttendanceJustification.motivoMaximo))
                }
            }
        }
    }

    @MainActor
    private func save() async {
        guard motivoOk else {
            error = "Escribe el motivo de la falta justificada (mínimo \(minimo) caracteres)"
            return
        }
        saving = true
        error = nil
        defer { saving = false }
        if let failure = await onSubmit(limpio) {
            error = failure
        } else {
            dismiss()
        }
    }
}
