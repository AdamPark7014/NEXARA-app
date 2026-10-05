import SwiftUI

struct DespachoTarget: Identifiable {
    /// Id de la actividad.
    let id: Int
    let title: String
    let indicaciones: String?
}

struct ReprogramarTarget: Identifiable {
    /// Id de la actividad.
    let id: Int
    let title: String
    let fechaActual: String?
}

/// Reglas del despacho (Android `CoreActivityRules`: `parseDispatchHeadcount`,
/// `despachosPendientes`, `despachoCandidates`).
enum CoreDispatch {
    /// «Cupo: 3 personas» → 3.
    static func headcount(_ text: String?) -> Int? {
        guard let text,
              let range = text.range(of: #"Cupo:\s*\d+\s*persona"#, options: [.regularExpression, .caseInsensitive])
        else { return nil }
        let digits = text[range].filter(\.isNumber)
        guard let value = Int(digits), value > 0 else { return nil }
        return value
    }

    /// Despachos que aún no tienen a nadie del grupo de este encargado.
    static func pendientes(managerEmail: String?, pending: [TeamBoardOpenActivity]) -> [TeamBoardOpenActivity] {
        let pool = Set(CoreOrg.dispatchPool(for: managerEmail).map { CoreOrg.normalized($0) })
        let me = CoreOrg.normalized(managerEmail)
        return pending.filter { activity in
            guard (activity.assignmentCharge ?? "").lowercased() == "despacho" else { return false }
            guard let team = activity.teamEmails?.map({ CoreOrg.normalized($0) }) else { return true }
            if !pool.isEmpty { return !team.contains(where: { pool.contains($0) }) }
            return !team.contains(where: { $0 != me })
        }
    }

    /// A quién puede pasarlo: su grupo (`DISPATCH_POOLS`) o, sin grupo, todo el tablero menos él.
    static func candidatos(managerEmail: String?, managerUserId: Int, roster: [TeamBoardUser]) -> [TeamBoardUser] {
        let others = roster.filter { $0.id != managerUserId }
        let pool = Set(CoreOrg.dispatchPool(for: managerEmail).map { CoreOrg.normalized($0) })
        guard !pool.isEmpty else { return others }
        return others.filter { pool.contains(CoreOrg.normalized($0.email)) }
    }

    /// «Despacho» · «Despacho · se ocupan 3 personas».
    static func resumen(_ indicaciones: String?) -> String {
        guard let cupo = headcount(indicaciones) else { return "Despacho" }
        return "Despacho · se ocupan \(cupo) persona\(cupo == 1 ? "" : "s")"
    }
}

/// «Tiempo estimado» de quien asigna → `horasPlan` (Android `ActivityPlanTime`).
/// La gente escribe «1.5», «1,5» o «2» horas; el API quiere horas decimales.
enum ActividadesHorasPlan {
    /// Máximo razonable de una jornada; más que eso casi siempre es un dedazo.
    static let maxHoras = 24.0

    /// Solo dígitos y un separador decimal: lo que se deja teclear en el campo.
    static func filtrarEntrada(_ texto: String) -> String {
        let limpio = texto.replacingOccurrences(of: ",", with: ".").filter { $0.isNumber || $0 == "." }
        guard let punto = limpio.firstIndex(of: ".") else { return String(limpio.prefix(5)) }
        let entero = limpio[..<punto]
        let decimales = limpio[limpio.index(after: punto)...].filter(\.isNumber)
        return String((entero + "." + decimales).prefix(5))
    }

    /// nil cuando está vacío o no es un número útil (0, negativo, absurdo).
    static func horas(_ texto: String?) -> Double? {
        let limpio = (texto ?? "").trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard !limpio.isEmpty, let valor = Double(limpio), valor.isFinite, valor > 0, valor <= maxHoras else { return nil }
        return (valor * 100).rounded() / 100
    }

    /// El alta ya pregunta minutos: se convierten a horas para `horasPlan`.
    static func horasDesdeMinutos(_ minutos: Int?) -> Double? {
        guard let minutos, minutos > 0 else { return nil }
        return (Double(minutos) / 60 * 100).rounded() / 100
    }
}

// MARK: - Pendiente de despacho (en el día de quien reparte)

/// Despachos que el encargado aún no reparte, con su gente para elegir (Android
/// `DespachoPendingPanel`, espejo de `DespachoPendingPanel.tsx`). El API valida el
/// grupo y decide el rol (Luis → Antonio como LEAD; Antonio/David → técnicos).
struct DespachoPendingPanel: View {
    let managerEmail: String?
    let managerUserId: Int
    let pending: [TeamBoardOpenActivity]
    let onDone: () -> Void

    @State private var roster: [TeamBoardUser] = []
    @State private var loadError: String?
    @State private var activeId: Int?
    @State private var selected: Set<Int> = []
    @State private var saving = false
    @State private var mensaje: (texto: String, exito: Bool)?
    /// «Tiempo estimado» del contrato B: viaja como `horasPlan`.
    @State private var horasPlan = ""

    private static let rojoTexto = NxColors.rgb(0xB91C1C)
    private static let verdeTexto = NxColors.rgb(0x15803D)

    private var despachos: [TeamBoardOpenActivity] {
        CoreDispatch.pendientes(managerEmail: managerEmail, pending: pending)
    }

    private var candidatos: [TeamBoardUser] {
        CoreDispatch.candidatos(managerEmail: managerEmail, managerUserId: managerUserId, roster: roster)
    }

    private var esLuis: Bool { CoreOrg.normalized(managerEmail) == CoreOrg.luisEmail }

    var body: some View {
        if !despachos.isEmpty {
            panel
                .task(id: despachos.count) { await cargarEquipo() }
        }
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Text("PENDIENTE DE DESPACHO")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(NxColors.muted)
                Text(esLuis ? "Mándala a Antonio; él elige a quién del soporte." : "Elige a quién de tu equipo ejecuta.")
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.muted)
            }
            if let loadError {
                Text(loadError)
                    .font(.system(size: 13))
                    .foregroundStyle(Self.rojoTexto)
            }
            ForEach(despachos) { actividad in
                tarjeta(actividad)
            }
            if let mensaje {
                Text(mensaje.texto)
                    .font(.system(size: 13))
                    .foregroundStyle(mensaje.exito ? Self.verdeTexto : Self.rojoTexto)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.naranja.opacity(0.08), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(NxColors.naranja.opacity(0.35), lineWidth: 1)
        )
    }

    private func tarjeta(_ a: TeamBoardOpenActivity) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text([a.anNumber, a.titulo].compactMap { ActividadesTexto.limpio($0) }.joined(separator: " · "))
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(NxColors.fg)
                .fixedSize(horizontal: false, vertical: true)
            Text(CoreDispatch.resumen(a.indicaciones))
                .font(.system(size: 12))
                .foregroundStyle(NxColors.muted)
            ReprogramarDespachoInline(activityId: a.id, fechaActual: a.fechaInicio, onDone: onDone)
            if let indicaciones = ActividadesTexto.limpio(a.indicaciones) {
                Text(indicaciones)
                    .font(.system(size: 12))
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if activeId == a.id {
                eleccion(a)
            } else {
                NxPrimaryButton("Despachar al equipo", fullWidth: false) {
                    activeId = a.id
                    selected = []
                    mensaje = nil
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
        )
    }

    @ViewBuilder
    private func eleccion(_ a: TeamBoardOpenActivity) -> some View {
        if candidatos.isEmpty {
            Text("No hay gente de tu equipo en el tablero. Actualiza o revisa la jerarquía.")
                .font(.system(size: 13))
                .foregroundStyle(NxColors.muted)
        } else {
            Text(esLuis ? "Elige a Antonio" : "Elige a quién asignas")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(NxColors.muted)
            ForEach(candidatos) { persona in
                let marcado = selected.contains(persona.id)
                Button {
                    if marcado { selected.remove(persona.id) } else { selected.insert(persona.id) }
                } label: {
                    HStack(alignment: .center, spacing: 10) {
                        Image(systemName: marcado ? "checkmark.square.fill" : "square")
                            .font(.system(size: 20, weight: .regular))
                            .foregroundStyle(marcado ? NxColors.brand : NxColors.muted)
                            .frame(width: 24, height: 24)
                        Text(persona.nombre.isEmpty ? "—" : persona.nombre)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(NxColors.fg)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, 12)
                    .frame(minHeight: 48)
                    .background(
                        marcado ? NxColors.brandSoft.opacity(0.5) : NxColors.card,
                        in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .strokeBorder(marcado ? NxColors.brand : NxColors.border, lineWidth: 1)
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(saving)
                .accessibilityAddTraits(marcado ? AccessibilityTraits.isSelected : [])
            }
        }
        VStack(alignment: .leading, spacing: 4) {
            ActividadesCampoTexto(
                etiqueta: "Tiempo estimado en horas (opcional)",
                placeholder: "Ej. 1.5",
                texto: Binding(
                    get: { horasPlan },
                    set: { horasPlan = ActividadesHorasPlan.filtrarEntrada($0) }
                ),
                teclado: .decimalPad
            )
            .disabled(saving)
            Text("Con esto la actividad avisa cuando se pasa del tiempo.")
                .font(.system(size: 11.5))
                .foregroundStyle(NxColors.muted)
                .padding(.horizontal, 4)
        }
        HStack(spacing: 8) {
            NxPrimaryButton(
                saving ? "Asignando…" : "Asignar al equipo",
                loading: saving,
                enabled: !candidatos.isEmpty,
                fullWidth: false
            ) {
                Task { await asignar(a) }
            }
            NxSecondaryButton("Cancelar", enabled: !saving) {
                activeId = nil
                selected = []
                mensaje = nil
            }
        }
    }

    @MainActor
    private func cargarEquipo() async {
        do {
            roster = try await CoreRepository.shared.teamBoard().users
            loadError = nil
        } catch {
            loadError = error.toUserMessage(fallback: "No se pudo cargar el equipo")
        }
    }

    @MainActor
    private func asignar(_ a: TeamBoardOpenActivity) async {
        guard !selected.isEmpty else {
            mensaje = ("Elige al menos a una persona de tu equipo", false)
            return
        }
        saving = true
        mensaje = nil
        defer { saving = false }
        let ids = selected.sorted()
        do {
            _ = try await CoreRepository.shared.dispatchActivity(
                activityId: a.id,
                userIds: ids,
                indicaciones: a.indicaciones,
                horasPlan: ActividadesHorasPlan.horas(horasPlan)
            )
            mensaje = ("Asignado a \(ids.count) persona(s)", true)
            activeId = nil
            selected = []
            horasPlan = ""
            onDone()
        } catch {
            mensaje = (error.toUserMessage(fallback: "No se pudo asignar"), false)
        }
    }
}

// MARK: - Cambiar fecha y hora, en línea

/// Quien reparte un despacho cambia su día y hora; queda en el Historial de la
/// actividad («Reprogramada por …»). Android `ReprogramarDespachoInline`.
struct ReprogramarDespachoInline: View {
    let activityId: Int
    let fechaActual: String?
    let onDone: () -> Void

    @State private var abierto = false
    @State private var fecha = Date()
    @State private var motivo = ""
    @State private var saving = false
    @State private var error: String?
    @State private var ok: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 8) {
                HStack(alignment: .center, spacing: 4) {
                    Image(systemName: "calendar")
                        .font(.system(size: 14))
                        .foregroundStyle(NxColors.muted)
                        .frame(width: 16, height: 16)
                        .accessibilityHidden(true)
                    (Text("Programada: ").foregroundColor(NxColors.muted)
                        + Text(ActividadesTexto.cuando(fechaActual) ?? "Sin fecha").bold().foregroundColor(NxColors.fg))
                        .font(.system(size: 13))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if !abierto {
                    Button {
                        fecha = ReprogramarSheet.fechaInicial(fechaActual)
                        motivo = ""
                        error = nil
                        ok = nil
                        abierto = true
                    } label: {
                        Text("Cambiar fecha y hora").font(.system(size: 13, weight: .medium))
                    }
                    .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: NxColors.brand, border: NxColors.borderStrong))
                }
            }
            if !abierto, let ok {
                NxIconText(systemName: "checkmark", text: ok, tint: NxColors.verde)
                    .font(.system(size: 12.5))
                    .foregroundStyle(NxColors.verde)
            }
            if abierto {
                VStack(alignment: .leading, spacing: 10) {
                    DatePicker("Día y hora", selection: $fecha, displayedComponents: [.date, .hourAndMinute])
                        .font(.system(size: 14))
                        .tint(NxColors.brand)
                        .environment(\.timeZone, CoreSchedule.mexico)
                        .environment(\.locale, Locale(identifier: "es_MX"))
                    ActividadesCampoTexto(
                        etiqueta: "Motivo (opcional)",
                        placeholder: "Ej. El cliente pidió cambiar la visita",
                        texto: Binding(get: { motivo }, set: { motivo = String($0.prefix(500)) }),
                        lineas: 2
                    )
                    .disabled(saving)
                    if let error {
                        Text(error)
                            .font(.system(size: 12.5))
                            .foregroundStyle(NxColors.rgb(0xB91C1C))
                    }
                    HStack(spacing: 8) {
                        NxPrimaryButton(saving ? "Guardando…" : "Guardar nueva fecha", loading: saving, fullWidth: false) {
                            Task { await guardar() }
                        }
                        NxSecondaryButton("Cancelar", enabled: !saving) { abierto = false }
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                        .strokeBorder(NxColors.border, lineWidth: 1)
                )
            }
        }
    }

    @MainActor
    private func guardar() async {
        saving = true
        error = nil
        defer { saving = false }
        let texto = motivo.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await CoreRepository.shared.reprogramar(
                activityId: activityId,
                fecha: fecha,
                motivo: texto.isEmpty ? nil : texto
            )
            ok = "Reprogramada para \(ActividadesTexto.cuando(fecha))"
            abierto = false
            onDone()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo reprogramar")
        }
    }
}

/// Campo de texto con contorno y etiqueta (Android `OutlinedTextField`): radio 12,
/// filo #CBD5E1 (2 de marca con foco), etiqueta 12 gris arriba.
struct ActividadesCampoTexto: View {
    let etiqueta: String
    var placeholder: String = ""
    @Binding var texto: String
    var lineas: Int = 1
    var teclado: UIKeyboardType = .default
    var error: Bool = false

    @FocusState private var foco: Bool

    init(
        etiqueta: String,
        placeholder: String = "",
        texto: Binding<String>,
        lineas: Int = 1,
        teclado: UIKeyboardType = .default,
        error: Bool = false
    ) {
        self.etiqueta = etiqueta
        self.placeholder = placeholder
        self._texto = texto
        self.lineas = lineas
        self.teclado = teclado
        self.error = error
    }

    private var filo: Color {
        if error { return NxColors.danger }
        return foco ? NxColors.brand : NxColors.borderStrong
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(etiqueta)
                .font(.system(size: 12))
                .foregroundStyle(error ? NxColors.danger : (foco ? NxColors.brand : NxColors.muted))
            Group {
                if lineas > 1 {
                    TextField("", text: $texto, prompt: Text(placeholder).foregroundColor(NxColors.fg4), axis: .vertical)
                        .lineLimit(lineas...max(lineas, 6))
                } else {
                    TextField("", text: $texto, prompt: Text(placeholder).foregroundColor(NxColors.fg4))
                }
            }
            .font(.system(size: 16))
            .foregroundStyle(NxColors.fg)
            .tint(NxColors.brand)
            .keyboardType(teclado)
            .focused($foco)
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .frame(minHeight: 52, alignment: .topLeading)
            .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                    .strokeBorder(filo, lineWidth: foco || error ? 2 : 1)
            )
            .accessibilityLabel(etiqueta)
        }
    }
}

// MARK: - Hojas (detalle de la actividad)

/// Quien reparte un despacho lo pasa a gente de su equipo
/// (POST me/activities/:id/despacho). El API valida el grupo y decide el rol.
struct DespachoSheet: View {
    let target: DespachoTarget
    let onDone: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var session = SessionStore.shared
    @State private var roster: [TeamBoardUser] = []
    @State private var selected: Set<Int> = []
    @State private var loading = true
    @State private var saving = false
    @State private var message: String?
    @State private var horasPlan = ""

    private var myEmail: String? { session.currentUser?.email }
    private var myId: Int? { session.currentUser.flatMap { Int($0.id) } }
    private var isCoordinator: Bool { CoreOrg.normalized(myEmail) == CoreOrg.serviceCoordinatorEmail }

    private var candidates: [TeamBoardUser] {
        CoreDispatch.candidatos(managerEmail: myEmail, managerUserId: myId ?? -1, roster: roster)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(target.title).font(.headline)
                    if CoreDispatch.headcount(target.indicaciones) != nil {
                        Text(CoreDispatch.resumen(target.indicaciones))
                            .font(.subheadline)
                            .foregroundStyle(NxColors.muted)
                    }
                    if let indicaciones = target.indicaciones, !indicaciones.isEmpty {
                        Text(indicaciones).font(.caption).foregroundStyle(NxColors.muted)
                    }
                } footer: {
                    Text(isCoordinator ? "Mándala a Antonio; él elige a quién del soporte." : "Elige a quién de tu equipo ejecuta.")
                }

                Section {
                    if loading {
                        ProgressView()
                    } else if candidates.isEmpty {
                        Text("No hay gente de tu equipo en el tablero. Actualiza o revisa la jerarquía.")
                            .foregroundStyle(NxColors.muted)
                    } else {
                        ForEach(candidates) { user in
                            Button {
                                if selected.contains(user.id) {
                                    selected.remove(user.id)
                                } else {
                                    selected.insert(user.id)
                                }
                            } label: {
                                HStack {
                                    Image(systemName: selected.contains(user.id) ? "checkmark.square.fill" : "square")
                                        .foregroundStyle(selected.contains(user.id) ? NxColors.brand : NxColors.muted)
                                    Text(user.nombre).foregroundStyle(NxColors.fg)
                                    Spacer()
                                    if let puesto = user.puesto, !puesto.isEmpty {
                                        Text(puesto).font(.caption).foregroundStyle(NxColors.muted)
                                    }
                                }
                            }
                            .disabled(saving)
                        }
                    }
                } header: {
                    Text(isCoordinator ? "Elige a Antonio" : "Elige a quién asignas")
                }

                Section {
                    TextField(
                        "Ej. 1.5",
                        text: Binding(get: { horasPlan }, set: { horasPlan = ActividadesHorasPlan.filtrarEntrada($0) })
                    )
                    .keyboardType(.decimalPad)
                } header: {
                    Text("Tiempo estimado en horas (opcional)")
                } footer: {
                    Text("Con esto la actividad avisa cuando se pasa del tiempo.")
                }

                if let message {
                    Section {
                        Text(message).foregroundStyle(NxColors.rojo)
                    }
                }
            }
            .nxListBackground()
            .navigationTitle("Despachar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Asignando…" : "Asignar") { Task { await submit() } }
                        .disabled(saving || selected.isEmpty)
                }
            }
            .tint(NxColors.brand)
            .task { await loadRoster() }
        }
    }

    @MainActor
    private func loadRoster() async {
        loading = true
        defer { loading = false }
        do {
            roster = try await CoreRepository.shared.teamBoard().users
        } catch {
            message = error.toUserMessage(fallback: "No se pudo cargar el equipo")
        }
    }

    @MainActor
    private func submit() async {
        guard !selected.isEmpty else {
            message = "Elige al menos a una persona de tu equipo"
            return
        }
        saving = true
        message = nil
        defer { saving = false }
        let notes = (target.indicaciones ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let assigned = try await CoreRepository.shared.dispatchActivity(
                activityId: target.id,
                userIds: selected.sorted(),
                indicaciones: notes.isEmpty ? nil : notes,
                horasPlan: ActividadesHorasPlan.horas(horasPlan)
            )
            let count = assigned > 0 ? assigned : selected.count
            onDone("Asignado a \(count) persona(s)")
            dismiss()
        } catch {
            message = error.toUserMessage(fallback: "No se pudo asignar")
        }
    }
}

/// Quien reparte un despacho cambia su día y hora
/// (PATCH me/activities/:id/reprogramar); queda en el Historial.
struct ReprogramarSheet: View {
    let target: ReprogramarTarget
    let onDone: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var fecha = Date()
    @State private var motivo = ""
    @State private var saving = false
    @State private var error: String?
    @State private var didSetInitial = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(target.title).font(.headline)
                    NxIconText(systemName: "calendar", text: "Programada: \(ActividadesTexto.cuando(target.fechaActual) ?? "Sin fecha")")
                        .font(.subheadline)
                        .foregroundStyle(NxColors.muted)
                }
                Section("Nueva fecha") {
                    // Como la web y Android: se puede registrar una fecha pasada (se corrige lo que ya ocurrió).
                    DatePicker("Día y hora", selection: $fecha, displayedComponents: [.date, .hourAndMinute])
                        .environment(\.timeZone, CoreSchedule.mexico)
                }
                Section("Motivo (opcional)") {
                    TextField("Ej. El cliente pidió cambiar la visita", text: $motivo, axis: .vertical)
                        .lineLimit(2...5)
                }
                if let error {
                    Section {
                        Text(error).foregroundStyle(NxColors.rojo)
                    }
                }
            }
            .nxListBackground()
            .navigationTitle("Cambiar fecha y hora")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Guardando…" : "Guardar nueva fecha") { Task { await save() } }
                        .disabled(saving)
                }
            }
            .tint(NxColors.brand)
            .onAppear {
                guard !didSetInitial else { return }
                didSetInitial = true
                fecha = Self.fechaInicial(target.fechaActual)
            }
        }
    }

    /// La fecha que ya tiene (Android `isoToLocalInput`); sin fecha, hoy o mañana
    /// a las 9:00 de México (`CoreSchedule.defaultStart`, igual que Android).
    static func fechaInicial(_ fechaActual: String?) -> Date {
        CoreFormat.date(fechaActual) ?? CoreSchedule.defaultStart()
    }

    @MainActor
    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        let reason = motivo.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await CoreRepository.shared.reprogramar(
                activityId: target.id,
                fecha: fecha,
                motivo: reason.isEmpty ? nil : String(reason.prefix(500))
            )
            onDone("Reprogramada para \(ActividadesTexto.cuando(fecha))")
            dismiss()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo reprogramar")
        }
    }
}
