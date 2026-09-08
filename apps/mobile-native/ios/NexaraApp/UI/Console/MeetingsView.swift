import SwiftUI

// MARK: - ViewModel

enum MeetingsTab: String, CaseIterable, Identifiable {
    case mios = "Mis acuerdos"
    case reuniones = "Reuniones"
    case vencidos = "Vencidos"
    case lecciones = "Lecciones"
    var id: String { rawValue }
}

@MainActor
final class MeetingsVM: ObservableObject {
    @Published var loading = true
    @Published var refreshing = false
    @Published var error: String?
    @Published var tab: MeetingsTab = .mios
    @Published var canLead = false
    @Published var myUserId: Int64?

    @Published var mios: [MeetingAgreementDto] = []
    @Published var miosVencidos = 0
    @Published var meetings: [MeetingDto] = []
    @Published var vencidos: [MeetingAgreementDto] = []
    @Published var lecciones: [MeetingAgreementDto] = []
    @Published var leccionesQuery = ""

    @Published var detail: MeetingDetailDto?
    @Published var detailLoading = false

    @Published var showConvocar = false
    @Published var staff: [MeetingStaffPerson] = []

    @Published var busy = false
    @Published var actionMessage: String?

    private let repo = MeetingsRepository.shared

    var proximas: Int { meetings.filter { !$0.isClosed }.count }

    func loadSessionFacts(user: SessionUser?) {
        myUserId = user.flatMap { Int64($0.id) }
        let canonical = RolePanelMatrix.canonicalRoleKey(
            roleKey: user?.roleKey,
            orgRoleKey: user?.orgRoleKey,
            roleDisplayName: user?.role
        )
        canLead = MeetingForms.canLeadMeetings(role: canonical, isSuperAdmin: user?.isSuperAdmin == true)
    }

    func setTab(_ next: MeetingsTab) {
        tab = next
        actionMessage = nil
        if next == .vencidos && vencidos.isEmpty { loadOverdue() }
        if next == .lecciones && lecciones.isEmpty { loadLessons() }
    }

    func refresh(initial: Bool = true) {
        loading = initial && mios.isEmpty && meetings.isEmpty
        refreshing = !initial
        error = nil
        Task {
            var firstError: String?
            do {
                let mine = try await repo.myAgreements()
                mios = mine.acuerdos
                miosVencidos = mine.vencidos
            } catch {
                firstError = firstError ?? error.toUserMessage()
            }
            do {
                meetings = try await repo.meetings()
            } catch {
                firstError = firstError ?? error.toUserMessage()
            }
            self.error = firstError
            loading = false
            refreshing = false
        }
    }

    func loadOverdue() {
        Task {
            do { vencidos = try await repo.overdueAgreements() }
            catch { error = error.toUserMessage() }
        }
    }

    func loadLessons() {
        let q = leccionesQuery
        Task {
            do { lecciones = try await repo.lessons(query: q) }
            catch { error = error.toUserMessage() }
        }
    }

    func openMeeting(_ id: Int64) {
        detailLoading = true
        actionMessage = nil
        Task {
            do {
                detail = try await repo.meeting(id: id)
            } catch {
                actionMessage = "❌ \(error.toUserMessage())"
            }
            detailLoading = false
        }
    }

    func closeDetail() {
        detail = nil
        actionMessage = nil
    }

    private func mutateDetail(ok: String, fallback: String, _ block: @escaping () async throws -> MeetingDetailDto) {
        busy = true
        actionMessage = nil
        Task {
            do {
                detail = try await block()
                actionMessage = "✅ \(ok)"
                refresh(initial: false)
            } catch {
                actionMessage = "❌ \(error.toUserMessage().isEmpty ? fallback : error.toUserMessage())"
            }
            busy = false
        }
    }

    func addAgreement(tipo: String, descripcion: String, responsableId: Int64?, fechaCompromiso: String) {
        guard let meetingId = detail?.meeting.id else { return }
        switch MeetingForms.validateAgreement(
            tipo: tipo,
            descripcion: descripcion,
            responsableId: responsableId,
            fechaCompromiso: fechaCompromiso
        ) {
        case .failure(let msg):
            actionMessage = "❌ \(msg)"
        case .success(let d):
            mutateDetail(ok: "Registrado", fallback: "No se pudo registrar") {
                try await self.repo.addAgreement(
                    meetingId: meetingId,
                    tipo: d.tipo,
                    descripcion: d.descripcion,
                    responsableId: d.responsableId,
                    fechaCompromiso: d.fechaCompromiso
                )
            }
        }
    }

    func setAgreementStatus(agreementId: Int64, estado: String) {
        guard let meetingId = detail?.meeting.id else { return }
        mutateDetail(ok: "Acuerdo actualizado", fallback: "No se pudo actualizar el acuerdo") {
            try await self.repo.updateAgreement(meetingId: meetingId, agreementId: agreementId, estado: estado)
        }
    }

    func closeMeeting(notas: String) {
        guard let meetingId = detail?.meeting.id else { return }
        mutateDetail(ok: "Reunión cerrada con minuta", fallback: "No se pudo cerrar la reunión") {
            try await self.repo.closeMeeting(id: meetingId, notas: notas.nilIfEmpty)
        }
    }

    /// Pasa lista con la lista **completa** de convocados. El servidor reemplaza;
    /// enviar sólo presentes borra a los ausentes del acta.
    func setAttendance(marks: [Int64: Bool]) {
        guard let detail else { return }
        let payload = detail.asistentes.map {
            MeetingAttendeeMark(userId: $0.userId, asistio: marks[$0.userId] ?? $0.asistio)
        }
        mutateDetail(ok: "Lista pasada", fallback: "No se pudo pasar lista") {
            try await self.repo.setAttendance(id: detail.meeting.id, marks: payload)
        }
    }

    func setShowConvocar(_ show: Bool) {
        showConvocar = show
        actionMessage = nil
        if show && staff.isEmpty { loadStaff() }
        if show && canLead && staff.isEmpty { loadStaff() }
    }

    func ensureStaff() {
        if staff.isEmpty { loadStaff() }
    }

    private func loadStaff() {
        Task {
            let rows = (try? await ConsoleRepository.shared.users(preferAssignable: true)) ?? []
            staff = rows.map { MeetingStaffPerson(raw: $0) }.filter { $0.id > 0 }
        }
    }

    func convocar(
        tipo: String,
        fecha: String,
        titulo: String,
        hora: String,
        agenda: String,
        asistentes: Set<Int64>
    ) {
        switch MeetingForms.validateMeeting(
            tipo: tipo,
            fecha: fecha,
            titulo: titulo,
            horaInicio: hora,
            agenda: agenda,
            asistentes: Array(asistentes)
        ) {
        case .failure(let msg):
            actionMessage = "❌ \(msg)"
        case .success(let d):
            busy = true
            actionMessage = nil
            Task {
                do {
                    let created = try await repo.createMeeting(
                        tipo: d.tipo,
                        fecha: d.fecha,
                        titulo: d.titulo,
                        horaInicio: d.horaInicio,
                        agenda: d.agenda,
                        asistentes: d.asistentes
                    )
                    showConvocar = false
                    detail = created
                    tab = .reuniones
                    actionMessage = "✅ Reunión convocada"
                    refresh(initial: false)
                } catch {
                    actionMessage = "❌ \(error.toUserMessage())"
                }
                busy = false
            }
        }
    }

    func advanceMine(agreementId: Int64, estado: String) {
        busy = true
        actionMessage = nil
        Task {
            do {
                try await repo.updateMyAgreement(agreementId: agreementId, estado: estado)
                actionMessage = "✅ \(MeetingCatalog.agreementStatusLabel(estado))"
                refresh(initial: false)
            } catch {
                actionMessage = "❌ \(error.toUserMessage())"
            }
            busy = false
        }
    }
}

// MARK: - View

struct MeetingsView: View {
    @EnvironmentObject var session: SessionStore
    @StateObject private var vm = MeetingsVM()

    var body: some View {
        Group {
            if vm.showConvocar {
                ConvocarMeetingForm(vm: vm)
            } else if vm.detailLoading {
                ProgressView("Abriendo reunión…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let detail = vm.detail {
                MeetingDetailView(vm: vm, detail: detail)
            } else {
                meetingsHome
            }
        }
        .navigationTitle(navTitle)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            vm.loadSessionFacts(user: session.currentUser)
            vm.refresh()
        }
    }

    private var navTitle: String {
        if vm.showConvocar { return "Convocar" }
        if vm.detail != nil { return "Acta" }
        return "Reuniones"
    }

    private var meetingsHome: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let err = vm.error {
                    NxAlertBanner(alert: NxAlert(id: "mtg-err", title: "No se pudo cargar", subtitle: err, tone: .danger))
                        .padding(.horizontal)
                    Button("Reintentar") { vm.refresh() }
                        .buttonStyle(.bordered)
                        .padding(.horizontal)
                }

                if let msg = vm.actionMessage {
                    Text(msg)
                        .font(.footnote)
                        .foregroundColor(msg.hasPrefix("✅") ? NxTone.success.fg : NxTone.danger.fg)
                        .padding(.horizontal)
                }

                HStack(spacing: 0) {
                    kpi("Míos", "\(vm.mios.count)", .brand)
                    Divider().frame(height: 36)
                    kpi("Vencidos", "\(vm.miosVencidos)", .danger)
                    Divider().frame(height: 36)
                    kpi("Próximas", "\(vm.proximas)", .info)
                }
                .padding(.horizontal)
                .padding(.vertical, 6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(MeetingsTab.allCases) { t in
                            Button {
                                vm.setTab(t)
                            } label: {
                                Text(t.rawValue)
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(vm.tab == t ? Color.teal.opacity(0.2) : Color(.secondarySystemGroupedBackground))
                                    .foregroundColor(vm.tab == t ? .teal : .primary)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                    .padding(.horizontal)
                }

                if vm.canLead && vm.tab == .reuniones {
                    Button {
                        vm.setShowConvocar(true)
                    } label: {
                        Label("Convocar reunión", systemImage: "plus.circle.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.teal)
                    .padding(.horizontal)
                }

                if vm.loading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    tabContent
                }
            }
            .padding(.vertical)
        }
        .refreshable { vm.refresh(initial: false) }
    }

    @ViewBuilder
    private var tabContent: some View {
        switch vm.tab {
        case .mios:
            if vm.mios.isEmpty {
                NxEmptyState(
                    title: "Sin acuerdos asignados",
                    subtitle: "Cuando te asignen algo en una junta, aparece aquí."
                )
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(vm.mios) { row in
                        VStack(alignment: .leading, spacing: 8) {
                            agreementRow(row)
                            if row.isOpen && MeetingCatalog.requiresOwner(row.tipo) {
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack {
                                        ForEach(
                                            MeetingCatalog.agreementStatuses.filter {
                                                $0.0.caseInsensitiveCompare(row.estado) != .orderedSame
                                            },
                                            id: \.0
                                        ) { st in
                                            Button(st.1) { vm.advanceMine(agreementId: row.id, estado: st.0) }
                                                .buttonStyle(.bordered)
                                                .disabled(vm.busy)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal)
            }
        case .reuniones:
            if vm.meetings.isEmpty {
                NxEmptyState(title: "Sin reuniones registradas", subtitle: "Convoca la diaria o abre el archivo desde la web.")
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(vm.meetings) { m in
                        Button { vm.openMeeting(m.id) } label: {
                            meetingRow(m)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
            }
        case .vencidos:
            if vm.vencidos.isEmpty {
                NxEmptyState(
                    title: "Nada vencido",
                    subtitle: "Los acuerdos fuera de fecha aparecen aquí para la junta de cierre."
                )
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(vm.vencidos) { row in agreementRow(row) }
                }
                .padding(.horizontal)
            }
        case .lecciones:
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    TextField("Buscar lecciones…", text: $vm.leccionesQuery)
                        .textFieldStyle(.roundedBorder)
                    Button("Buscar") { vm.loadLessons() }
                        .buttonStyle(.bordered)
                }
                .padding(.horizontal)
                if vm.lecciones.isEmpty {
                    NxEmptyState(
                        title: "Sin lecciones",
                        subtitle: "Las lecciones aprendidas de las juntas quedan aquí."
                    )
                } else {
                    LazyVStack(spacing: 10) {
                        ForEach(vm.lecciones) { row in agreementRow(row) }
                    }
                    .padding(.horizontal)
                }
            }
        }
    }

    private func meetingRow(_ m: MeetingDto) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(m.titulo.isEmpty ? m.tipoLabel : m.titulo)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.primary)
                Spacer()
                NxStatusChip(text: m.estadoLabel, tone: meetingTone(m))
            }
            Text(m.whenLabel).font(.caption).foregroundColor(.secondary)
            Text("\(m.tipoLabel) · \(m.asistentes) asist. · \(m.acuerdos) apuntes")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func agreementRow(_ row: MeetingAgreementDto) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                Text(row.descripcion)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.primary)
                Spacer()
                NxStatusChip(text: row.estadoLabel, tone: agreementTone(row))
            }
            let meta = [row.tipoLabel, row.responsableNombre, row.activityLabel]
                .filter { !$0.isEmpty }
                .joined(separator: " · ")
            if !meta.isEmpty {
                Text(meta).font(.caption).foregroundColor(.secondary)
            }
            if MeetingCatalog.requiresOwner(row.tipo) {
                Text(row.dueLabel)
                    .font(.caption2)
                    .foregroundColor(row.vencido ? NxTone.danger.fg : .secondary)
            }
            if !row.meetingTitulo.isEmpty {
                Text(row.meetingTitulo).font(.caption2).foregroundColor(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func kpi(_ label: String, _ value: String, _ tone: NxTone) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).foregroundColor(tone.fg)
            Text(label).font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Detail

private struct MeetingDetailView: View {
    @ObservedObject var vm: MeetingsVM
    let detail: MeetingDetailDto

    @State private var showLista = false
    @State private var showRegistrar = false
    @State private var showCerrar = false
    @State private var marks: [Int64: Bool] = [:]
    @State private var kind = MeetingCatalog.agreementKinds[0].0
    @State private var descripcion = ""
    @State private var ownerId: Int64?
    @State private var fechaCompromiso = ""
    @State private var minuta = ""

    private var meeting: MeetingDto { detail.meeting }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Button("← Volver a reuniones") { vm.closeDetail() }
                    .buttonStyle(.bordered)
                    .padding(.horizontal)

                headerCard

                if let msg = vm.actionMessage {
                    Text(msg)
                        .font(.footnote)
                        .foregroundColor(msg.hasPrefix("✅") ? NxTone.success.fg : NxTone.danger.fg)
                        .padding(.horizontal)
                }

                attendeesCard
                agreementsSection
                closeSection
            }
            .padding(.vertical)
        }
        .onAppear {
            marks = Dictionary(uniqueKeysWithValues: detail.asistentes.map { ($0.userId, $0.asistio) })
            minuta = meeting.notas
            if vm.canLead { vm.ensureStaff() }
        }
        .onChange(of: detail.meeting.id) { _ in
            marks = Dictionary(uniqueKeysWithValues: detail.asistentes.map { ($0.userId, $0.asistio) })
            minuta = meeting.notas
            showLista = false
            showRegistrar = false
            showCerrar = false
        }
        .onChange(of: detail.attendanceLabel) { _ in
            marks = Dictionary(uniqueKeysWithValues: detail.asistentes.map { ($0.userId, $0.asistio) })
        }
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(meeting.titulo.isEmpty ? meeting.tipoLabel : meeting.titulo)
                        .font(.headline)
                    Text(meeting.whenLabel).font(.caption).foregroundColor(.secondary)
                }
                Spacer()
                NxStatusChip(text: meeting.estadoLabel, tone: meetingTone(meeting))
            }
            detailRow("Tipo", meeting.tipoLabel)
            detailRow("Facilitador", meeting.facilitadorNombre.isEmpty ? "—" : meeting.facilitadorNombre)
            detailRow("Asistencia", detail.attendanceLabel)
            if !meeting.agenda.isEmpty {
                Text("Agenda").font(.subheadline.weight(.semibold))
                Text(meeting.agenda).font(.caption).foregroundColor(.secondary)
            }
            if !meeting.notas.isEmpty {
                Text("Minuta").font(.subheadline.weight(.semibold))
                Text(meeting.notas).font(.caption).foregroundColor(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }

    private var attendeesCard: some View {
        Group {
            if !detail.asistentes.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Convocados (\(detail.asistentes.count))")
                            .font(.subheadline.weight(.semibold))
                        Spacer()
                        if vm.canLead {
                            Button(showLista ? "Ocultar" : "Pasar lista") {
                                showLista.toggle()
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    if vm.canLead && showLista {
                        ForEach(detail.asistentes) { person in
                            Toggle(isOn: Binding(
                                get: { marks[person.userId] ?? person.asistio },
                                set: { marks[person.userId] = $0 }
                            )) {
                                Text(person.displayName)
                            }
                            .disabled(vm.busy)
                        }
                        Button {
                            // CRITICAL: full attendee list — server replaces, not merges.
                            vm.setAttendance(marks: marks)
                            showLista = false
                        } label: {
                            Text(vm.busy ? "Guardando…" : "Guardar lista")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.teal)
                        .disabled(vm.busy)
                    } else {
                        Text(
                            detail.asistentes.map {
                                $0.asistio ? "\($0.displayName) ✓" : $0.displayName
                            }.joined(separator: ", ")
                        )
                        .font(.caption)
                        .foregroundColor(.secondary)
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)
            }
        }
    }

    private var agreementsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                NxSectionHeader(
                    title: "Acuerdos, lecciones y riesgos (\(detail.acuerdos.count))",
                    subtitle: vm.canLead ? "Un acuerdo necesita responsable; una lección o un riesgo, no." : nil
                )
                Spacer()
                if vm.canLead {
                    Button(showRegistrar ? "Cerrar" : "Registrar") {
                        showRegistrar.toggle()
                        if showRegistrar { vm.ensureStaff() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.teal)
                }
            }
            .padding(.horizontal)

            if showRegistrar && vm.canLead {
                registerForm
            }

            if detail.acuerdos.isEmpty {
                NxEmptyState(
                    title: "Sin apuntes",
                    subtitle: "De esta reunión todavía no salió ningún acuerdo, lección ni riesgo."
                )
            } else {
                ForEach(detail.acuerdos) { row in
                    VStack(alignment: .leading, spacing: 8) {
                        agreementCard(row)
                        if vm.canLead && row.isOpen && MeetingCatalog.requiresOwner(row.tipo) {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack {
                                    ForEach(
                                        MeetingCatalog.agreementStatuses.filter {
                                            $0.0.caseInsensitiveCompare(row.estado) != .orderedSame
                                        },
                                        id: \.0
                                    ) { st in
                                        Button(st.1) {
                                            vm.setAgreementStatus(agreementId: row.id, estado: st.0)
                                        }
                                        .buttonStyle(.bordered)
                                        .disabled(vm.busy)
                                    }
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                }
            }
        }
    }

    private var registerForm: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Tipo de apunte").font(.subheadline.weight(.semibold))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(MeetingCatalog.agreementKinds, id: \.0) { k in
                        Button(k.1) { kind = k.0 }
                            .buttonStyle(.bordered)
                            .tint(kind == k.0 ? .teal : .secondary)
                    }
                }
            }
            TextField("De qué se trata", text: $descripcion, axis: .vertical)
                .lineLimit(2...4)
                .textFieldStyle(.roundedBorder)
            if MeetingCatalog.requiresOwner(kind) {
                Text("Responsable").font(.subheadline.weight(.semibold))
                if vm.staff.isEmpty {
                    Text("No se pudo cargar la lista de personas. Vuelve a abrir el módulo para reintentarlo.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(vm.staff.prefix(40)) { person in
                            Button(person.nombre) {
                                ownerId = ownerId == person.id ? nil : person.id
                            }
                            .buttonStyle(.bordered)
                            .tint(ownerId == person.id ? .teal : .secondary)
                        }
                    }
                }
                TextField("Fecha compromiso (AAAA-MM-DD, opcional)", text: $fechaCompromiso)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
            }
            Button {
                vm.addAgreement(
                    tipo: kind,
                    descripcion: descripcion,
                    responsableId: ownerId,
                    fechaCompromiso: fechaCompromiso
                )
                descripcion = ""
                fechaCompromiso = ""
                ownerId = nil
            } label: {
                Text(vm.busy ? "Guardando…" : "Guardar apunte")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.teal)
            .disabled(vm.busy)
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }

    @ViewBuilder
    private var closeSection: some View {
        if vm.canLead && !meeting.isClosed {
            VStack(alignment: .leading, spacing: 8) {
                Text("Cerrar la reunión").font(.subheadline.weight(.semibold))
                Text("Queda como REALIZADA y la minuta se guarda en el acta. El servidor no la reabre.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                if showCerrar {
                    TextField("Minuta (opcional)", text: $minuta, axis: .vertical)
                        .lineLimit(3...6)
                        .textFieldStyle(.roundedBorder)
                    HStack {
                        Button(vm.busy ? "Cerrando…" : "Cerrar reunión") {
                            vm.closeMeeting(notas: minuta)
                            showCerrar = false
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.teal)
                        .disabled(vm.busy)
                        Button("Cancelar") { showCerrar = false }
                            .buttonStyle(.bordered)
                    }
                } else {
                    Button("Cerrar con minuta") { showCerrar = true }
                        .buttonStyle(.bordered)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)
        }
    }

    private func agreementCard(_ row: MeetingAgreementDto) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                Text(row.descripcion).font(.subheadline.weight(.semibold))
                Spacer()
                NxStatusChip(text: row.estadoLabel, tone: agreementTone(row))
            }
            let meta = [row.tipoLabel, row.responsableNombre, row.activityLabel]
                .filter { !$0.isEmpty }
                .joined(separator: " · ")
            if !meta.isEmpty {
                Text(meta).font(.caption).foregroundColor(.secondary)
            }
            if MeetingCatalog.requiresOwner(row.tipo) {
                Text(row.dueLabel).font(.caption2).foregroundColor(row.vencido ? NxTone.danger.fg : .secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.caption).foregroundColor(.secondary)
            Spacer()
            Text(value).font(.caption.weight(.semibold))
        }
    }
}

// MARK: - Convocar

private struct ConvocarMeetingForm: View {
    @ObservedObject var vm: MeetingsVM

    @State private var tipo = MeetingCatalog.types[0].0
    @State private var fecha = Self.todayISO()
    @State private var titulo = MeetingCatalog.defaultTitle(MeetingCatalog.types[0].0)
    @State private var hora = MeetingCatalog.defaultTime[MeetingCatalog.types[0].0] ?? ""
    @State private var agenda = MeetingCatalog.suggestedAgenda(MeetingCatalog.types[0].0)
    @State private var convocados: Set<Int64> = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Button("← Cancelar") { vm.setShowConvocar(false) }
                    .buttonStyle(.bordered)
                    .padding(.horizontal)

                NxSectionHeader(
                    title: "Convocar reunión",
                    subtitle: "El tipo decide el título, la hora y la agenda por defecto."
                )
                .padding(.horizontal)

                VStack(alignment: .leading, spacing: 10) {
                    Text("Tipo").font(.subheadline.weight(.semibold))
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(MeetingCatalog.types, id: \.0) { t in
                                Button(t.1) {
                                    tipo = t.0
                                    titulo = MeetingCatalog.defaultTitle(t.0)
                                    hora = MeetingCatalog.defaultTime[t.0] ?? ""
                                    agenda = MeetingCatalog.suggestedAgenda(t.0)
                                }
                                .buttonStyle(.bordered)
                                .tint(tipo == t.0 ? .teal : .secondary)
                            }
                        }
                    }
                    TextField("Fecha (AAAA-MM-DD)", text: $fecha)
                        .textFieldStyle(.roundedBorder)
                        .autocorrectionDisabled()
                    TextField("Hora (HH:MM, opcional)", text: $hora)
                        .textFieldStyle(.roundedBorder)
                        .autocorrectionDisabled()
                    TextField("Título (opcional)", text: $titulo)
                        .textFieldStyle(.roundedBorder)
                    TextField("Agenda", text: $agenda, axis: .vertical)
                        .lineLimit(4...8)
                        .textFieldStyle(.roundedBorder)
                }
                .padding(14)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Convocados (\(convocados.count))").font(.subheadline.weight(.semibold))
                    if vm.staff.isEmpty {
                        Text("No se pudo cargar la lista de personas. Puedes convocar igualmente y pasar lista después.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    ForEach(vm.staff.prefix(60)) { person in
                        Toggle(isOn: Binding(
                            get: { convocados.contains(person.id) },
                            set: { on in
                                if on { convocados.insert(person.id) }
                                else { convocados.remove(person.id) }
                            }
                        )) {
                            Text(person.nombre)
                        }
                    }
                }
                .padding(14)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)

                if let msg = vm.actionMessage {
                    Text(msg)
                        .font(.footnote)
                        .foregroundColor(msg.hasPrefix("✅") ? NxTone.success.fg : NxTone.danger.fg)
                        .padding(.horizontal)
                }

                Button {
                    vm.convocar(
                        tipo: tipo,
                        fecha: fecha,
                        titulo: titulo,
                        hora: hora,
                        agenda: agenda,
                        asistentes: convocados
                    )
                } label: {
                    Text(vm.busy ? "Convocando…" : "Convocar")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.teal)
                .disabled(vm.busy)
                .padding(.horizontal)
            }
            .padding(.vertical)
        }
        .onAppear { vm.ensureStaff() }
    }

    private static func todayISO() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }
}

// MARK: - Tones

private func agreementTone(_ row: MeetingAgreementDto) -> NxTone {
    if row.vencido { return .danger }
    if row.estado.caseInsensitiveCompare("CUMPLIDO") == .orderedSame { return .success }
    if row.estado.caseInsensitiveCompare("EN_PROCESO") == .orderedSame { return .info }
    if row.estado.caseInsensitiveCompare("CANCELADO") == .orderedSame { return .neutral }
    return .warning
}

private func meetingTone(_ row: MeetingDto) -> NxTone {
    if row.estado.caseInsensitiveCompare("CANCELADA") == .orderedSame { return .danger }
    if row.isClosed { return .success }
    return .info
}
