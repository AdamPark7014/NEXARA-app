import SwiftUI

/// Mi perfil (`/erp/my-profile`): KPIs y completitud, cuenta e identidad ACS,
/// asistencia híbrida de hoy, datos personales editables (`PATCH
/// users/profile/me`), más bloqueo de la app, cola offline y cierre de sesión.
struct MyProfileView: View {
    @EnvironmentObject var session: SessionStore
    @State private var appLockEnabled = AppLock.isEnabled
    @State private var confirmLogout = false

    @State private var profile: MyProfileSnapshot?
    @State private var form = MyProfileFields()
    @State private var identity: MyAcsIdentity?
    @State private var hybrid: MyHybridToday?
    @State private var loading = true
    @State private var error: String?
    @State private var saving = false
    @State private var saveError: String?
    @State private var saved: String?

    var body: some View {
        List {
            if loading && profile == nil {
                Section { ProgressView("Cargando perfil…") }
            } else if let error, profile == nil {
                Section {
                    Text("No se pudo cargar").font(.headline)
                    Text(error).font(.footnote).foregroundColor(.secondary)
                    Button("Reintentar") { Task { await load() } }
                }
            }

            if let profile {
                summarySection(profile)
                completenessSection
                accountSection(profile)
                attendanceSection
                personalSection
                emergencySection
                saveSection
            }

            permisosSection

            deviceSections

            // Versión y aviso de privacidad al final, como en Android.
            Section {
                NxAppMetaFooter()
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
        }
        .navigationTitle("Mi perfil")
        .refreshable { await load() }
        .task { await load() }
        .confirmationDialog("¿Cerrar sesión?", isPresented: $confirmLogout, titleVisibility: .visible) {
            Button("Cerrar sesión", role: .destructive) { AuthRepository.shared.logout() }
            Button("Cancelar", role: .cancel) {}
        }
    }

    // MARK: Resumen

    private func summarySection(_ p: MyProfileSnapshot) -> some View {
        let pct = form.completeness
        let tone: Color = pct >= 80 ? .green : (pct >= 50 ? .orange : .red)
        return Section {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                kpi("Departamento", p.departmentName.isEmpty ? "—" : p.departmentName, "building.2", .primary)
                kpi("Rol", p.roleName.isEmpty ? "—" : p.roleName, "theatermasks", .accentColor)
                kpi("Perfil completo", "\(pct)%", "list.clipboard", tone)
                kpi("Email", p.email, "envelope", .primary)
            }
            .padding(.vertical, 4)
        }
    }

    private func kpi(_ label: String, _ value: String, _ icon: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(label, systemImage: icon)
                .font(.caption2)
                .foregroundColor(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(tint)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
    }

    private var completenessSection: some View {
        Section("Completitud del perfil") {
            ForEach(form.sections) { sec in
                let pct = Double(sec.filled) / Double(max(sec.total, 1))
                HStack(spacing: 10) {
                    Text(sec.label).font(.caption).frame(width: 118, alignment: .leading)
                    ProgressView(value: pct)
                        .tint(pct >= 1 ? .green : (pct >= 0.5 ? .orange : .red))
                    Text("\(sec.filled)/\(sec.total)")
                        .font(.caption.monospacedDigit())
                        .foregroundColor(.secondary)
                }
            }
        }
    }

    // MARK: Cuenta e identidad ACS

    private func accountSection(_ p: MyProfileSnapshot) -> some View {
        let employee = [identity?.employeeNumber, identity?.companyEmployeeNumber, p.employeeNumber]
            .compactMap { $0 }
            .first { !$0.isEmpty } ?? "—"
        return Section("Datos de cuenta") {
            row("Nombre", p.nombre)
            row("Email", p.email)
            row("Nº de empleado", employee)
            row("Control de acceso", integraStatus)
        }
    }

    private var integraStatus: String {
        switch identity?.status {
        case "linked":
            let name = identity?.personName ?? ""
            return "Vinculado · \(name.isEmpty ? (identity?.personId ?? "") : name)"
        case "erp_only": return "Tu número aún no está en control de acceso"
        case "unlinked": return "Sin número de empleado"
        default: return "—"
        }
    }

    private var attendanceSection: some View {
        let linked = identity?.status == "linked"
        return Section {
            row("Checador de la app", erpLine)
            row("Pases en puertas", acsLine(linked: linked))
            if !linked {
                // El texto de la API es para administradores (Integra, employeeNo); aquí va el del empleado.
                Text("Pide a RH que vincule tu número de empleado con el control de acceso.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        } header: {
            Text("Acceso y asistencia (hoy)")
        } footer: {
            Text("El checador de la app es el que cuenta para tu nómina.")
        }
    }

    private var erpLine: String {
        guard let hybrid, !hybrid.erpCheckIn.isEmpty else { return "Sin entrada" }
        var line = "Entrada \(clock(hybrid.erpCheckIn))"
        if !hybrid.erpCheckOut.isEmpty { line += " · Salida \(clock(hybrid.erpCheckOut))" }
        return line
    }

    private func acsLine(linked: Bool) -> String {
        guard let hybrid, !hybrid.acsFirstAt.isEmpty else {
            return linked ? "Sin pases hoy" : "Sin vincular"
        }
        let door = hybrid.acsFirstDoor.isEmpty ? "puerta" : hybrid.acsFirstDoor
        return "\(hybrid.acsPasses) pases · \(door) · desde \(clock(hybrid.acsFirstAt))"
    }

    // MARK: Datos editables

    private var personalSection: some View {
        Section {
            TextField("Teléfono", text: $form.telefono).keyboardType(.phonePad)
            birthDateRow
            TextField("Dirección", text: $form.direccion)
            TextField("Colonia", text: $form.colonia)
            TextField("Ciudad", text: $form.ciudad)
            TextField("Estado", text: $form.estado)
            TextField("Código postal", text: $form.codigoPostal).keyboardType(.numberPad)
            TextField("País", text: $form.pais)
            TextField("CURP", text: $form.curp)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .onChange(of: form.curp) { _, v in if v.uppercased() != v { form.curp = v.uppercased() } }
            TextField("RFC", text: $form.rfc)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .onChange(of: form.rfc) { _, v in if v.uppercased() != v { form.rfc = v.uppercased() } }
            TextField("Número de INE", text: $form.ineNumero)
                .autocorrectionDisabled()
            TextField("NSS (IMSS)", text: $form.nss).keyboardType(.numberPad)
        } header: {
            Text("Datos personales")
        } footer: {
            Text("Solo tú y RH/Dirección pueden ver esta información.")
        }
    }

    @ViewBuilder
    private var birthDateRow: some View {
        if form.fechaNacimiento.isEmpty {
            Button("Agregar fecha de nacimiento") {
                let base = Calendar.current.date(byAdding: .year, value: -30, to: Date()) ?? Date()
                form.fechaNacimiento = Self.dayFormatter.string(from: base)
            }
        } else {
            HStack {
                DatePicker(
                    "Fecha de nacimiento",
                    selection: birthDateBinding,
                    in: ...Date(),
                    displayedComponents: .date
                )
                .environment(\.locale, Locale(identifier: "es_MX"))
                Button {
                    form.fechaNacimiento = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Quitar fecha de nacimiento")
            }
        }
    }

    private var birthDateBinding: Binding<Date> {
        Binding(
            get: { Self.dayFormatter.date(from: form.fechaNacimiento) ?? Date() },
            set: { form.fechaNacimiento = Self.dayFormatter.string(from: $0) }
        )
    }

    private var emergencySection: some View {
        Section("Contacto de emergencia") {
            TextField("Nombre", text: $form.contactoEmergenciaNombre)
            TextField("Teléfono", text: $form.contactoEmergenciaTelefono).keyboardType(.phonePad)
        }
    }

    private var saveSection: some View {
        Section {
            Button(saving ? "Guardando…" : "Guardar cambios") { Task { await save() } }
                .disabled(saving)
            if let saved {
                NxIconText(systemName: "checkmark.circle.fill", text: saved).font(.footnote).foregroundColor(.green)
            }
            if let saveError {
                Text(saveError).font(.footnote).foregroundColor(.red)
            }
        }
    }

    // MARK: Lo que puedes hacer

    /// Permisos del rol traducidos (paridad con Android). No depende de la carga del
    /// perfil: viene de la sesión, así que sale aunque el API esté caído.
    @ViewBuilder
    private var permisosSection: some View {
        if let user = session.currentUser, !PermissionLabels.agrupar(user.permissions).isEmpty {
            MyProfilePermisosSection(
                permisos: user.permissions,
                accesoTotal: user.isSuperAdmin || CoreOrg.isCeo(user.email)
            )
        }
    }

    // MARK: Dispositivo

    @ViewBuilder
    private var deviceSections: some View {
        Section("Seguridad") {
            Toggle(isOn: $appLockEnabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Bloqueo de app")
                    Text(AppLock.isAvailable ? "Biometría o código al volver" : "No disponible en este dispositivo")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .disabled(!AppLock.isAvailable)
            .onChange(of: appLockEnabled) { _, newValue in
                AppLock.isEnabled = newValue
            }
        }
        Section("Dispositivo") {
            NavigationLink {
                OfflineQueueView()
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Cola offline")
                    Text("Ver y sincronizar cambios pendientes")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        Section {
            Button(role: .destructive) { confirmLogout = true } label: {
                Label("Cerrar sesión", systemImage: "rectangle.portrait.and.arrow.right")
            }
        }
    }

    // MARK: Datos

    private func load() async {
        loading = true
        error = nil
        async let identityTask = MyProfileRepository.shared.identity()
        async let hybridTask = MyProfileRepository.shared.hybridToday()
        do {
            let snapshot = try await MyProfileRepository.shared.load()
            profile = snapshot
            form = snapshot.fields
        } catch {
            self.error = error.toUserMessage(fallback: "Error al cargar tu perfil")
        }
        identity = await identityTask
        hybrid = await hybridTask
        loading = false
    }

    private func save() async {
        saving = true
        saved = nil
        saveError = nil
        defer { saving = false }
        do {
            let sent = try await MyProfileRepository.shared.save(form)
            saved = sent
                ? "Guardado — pendiente de revisión por RH"
                : "Guardado sin conexión; se enviará al recuperar la red."
            if sent { await load() }
        } catch {
            saveError = error.toUserMessage(fallback: "No se pudo guardar el perfil")
        }
    }

    // MARK: Formato

    @ViewBuilder private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).foregroundColor(.secondary)
            Spacer()
            Text(value).multilineTextAlignment(.trailing)
        }
    }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Hora local `es-MX` de un ISO-8601 del API.
    private func clock(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = parser.date(from: iso)
        if date == nil {
            parser.formatOptions = [.withInternetDateTime]
            date = parser.date(from: iso)
        }
        guard let date else { return String(iso.prefix(16)) }
        let out = DateFormatter()
        out.locale = Locale(identifier: "es_MX")
        out.timeStyle = .short
        out.dateStyle = .none
        return out.string(from: date)
    }
}
