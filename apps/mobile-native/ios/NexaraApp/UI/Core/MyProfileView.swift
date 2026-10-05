import SwiftUI

/// Mi perfil — igual que `MyProfileScreen` de Android (que a su vez sigue a
/// `/erp/my-profile`): cabecera con avatar, nombre, correo y rol; «Perfil
/// completo» con la identidad del control de acceso y la asistencia de hoy;
/// datos personales editables (`PATCH users/profile/me`); departamento y
/// correo; bloqueo de la app; cola offline; «Lo que puedes hacer»; cerrar
/// sesión con confirmación y, al pie, la versión y el aviso de privacidad.
///
/// La barra teal con «Mi perfil» la pone quien abre la pantalla (hub «Más» o
/// la cubierta del shell).
struct MyProfileView: View {
    @EnvironmentObject var session: SessionStore
    @Environment(\.openURL) private var openURL

    @State private var appLockEnabled = AppLock.isEnabled
    @State private var confirmLogout = false
    @State private var confirmDeleteAccount = false

    @State private var profile: MyProfileSnapshot?
    @State private var form = MyProfileFields()
    @State private var identity: MyAcsIdentity?
    @State private var hybrid: MyHybridToday?
    @State private var loading = true
    @State private var error: String?
    @State private var saving = false
    @State private var saveMessage: String?
    @State private var saveSuccess = false

    /// Gris de los subtítulos del perfil en Android (`Sub` = #64748B).
    private static let sub = NxColors.rgb(0x64748B)
    /// Verde del «Perfil guardado» y del 80 % (#059669).
    private static let verde = NxColors.rgb(0x059669)

    private let lockAvailable = AppLock.isAvailable

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let user = session.currentUser {
                    banner(user)
                    if !loading && error == nil && !Self.cuentaDireccion(user) {
                        resumen
                    }
                    datosCard(user)
                    cuentaCard(user)
                    bloqueoCard
                    colaCard
                    if !user.permissions.isEmpty {
                        MyProfilePermisosSection(
                            permisos: user.permissions,
                            accesoTotal: user.isSuperAdmin || Self.esDireccion(user.email)
                        )
                    }
                    cerrarSesion
                    eliminarCuenta
                    NxAppMetaFooter(mostrarSoporte: false)
                    Spacer().frame(height: 24)
                } else {
                    Text("No hay sesión activa.")
                        .font(NxType.bodyLarge)
                        .foregroundStyle(Self.sub)
                }
            }
            .padding(20)
        }
        .nxScreenBackground()
        .task { await load() }
        .alert("¿Cerrar sesión?", isPresented: $confirmLogout) {
            Button("Cancelar", role: .cancel) {}
            Button("Cerrar sesión", role: .destructive) { AuthRepository.shared.logout() }
        } message: {
            Text("Tendrás que volver a entrar con tu correo y contraseña.")
        }
        .alert("¿Eliminar tu cuenta?", isPresented: $confirmDeleteAccount) {
            Button("Cancelar", role: .cancel) {}
            Button("Continuar en la web", role: .destructive) { openURL(NxAppMeta.eliminarCuentaURL) }
        } message: {
            Text("La solicitud de eliminación de tu cuenta y tus datos se gestiona desde la web de NEXARA. Se abrirá en tu navegador para que la completes ahí.")
        }
    }

    // MARK: Reglas

    /// Christian y su equivalente (Claudia), por correo como Android
    /// (`PlatformAccounts.isCeoEquivalentEmail`). No usa `CoreOrg.isCeo`, que en
    /// el modo demostración siempre dice que sí y escondería los datos personales.
    private static func esDireccion(_ email: String?) -> Bool {
        CoreOrg.ceoEquivalentEmails.contains(CoreOrg.normalized(email))
    }

    /// Dirección y cuentas de sistema no llevan expediente de RH ni checador:
    /// «Contacto» en vez de «Datos personales» y sin «Perfil completo».
    private static func cuentaDireccion(_ user: SessionUser) -> Bool {
        esDireccion(user.email) || CoreOrg.isNonEmployee(user.email)
    }

    // MARK: Cabecera

    private func banner(_ user: SessionUser) -> some View {
        let superAdmin = user.isSuperAdmin
        let rol: String = {
            if superAdmin { return "Super Administrador" }
            if user.isClient { return "Portal Cliente" }
            if user.isBranchUser { return "Portal Sucursal" }
            let r = (user.role ?? "").trimmingCharacters(in: .whitespaces)
            return r.isEmpty ? "Usuario" : r
        }()
        let nombre = user.nombre.trimmingCharacters(in: .whitespaces)
        return VStack(spacing: 10) {
            avatar(user, superAdmin: superAdmin)
            Text(nombre.isEmpty ? "Usuario" : nombre)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(superAdmin ? Color.white : NxColors.fg)
                .multilineTextAlignment(.center)
            Text(user.email)
                .font(NxType.bodyMedium)
                .foregroundStyle(superAdmin ? NxColors.fg4 : Self.sub)
                .multilineTextAlignment(.center)
            Text(rol)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(superAdmin ? Color.white : NxColors.brand)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(
                    superAdmin ? NxColors.brand : NxColors.brandSoft,
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .nxCardSurface(radius: NxRadius.xl, elevation: 2, fill: superAdmin ? NxColors.fg : NxColors.surface)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func avatar(_ user: SessionUser, superAdmin: Bool) -> some View {
        if superAdmin {
            Image("LogoNexara")
                .resizable()
                .scaledToFit()
                .frame(width: 60, height: 60)
                .frame(width: 80, height: 80)
                .background(NxColors.brand, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .accessibilityLabel("NEXARA")
        } else if let url = user.avatarUrl, !url.trimmingCharacters(in: .whitespaces).isEmpty {
            AuthenticatedImage(url: url, contentMode: .fill, background: NxColors.brandSoft)
                .frame(width: 80, height: 80)
                .clipShape(Circle())
                .overlay(Circle().strokeBorder(NxColors.brand, lineWidth: 3))
                .accessibilityHidden(true)
        } else {
            Text(NxAvatar.iniciales(user.nombre))
                .font(.system(size: 26, weight: .bold))
                .foregroundStyle(Color.white)
                .frame(width: 80, height: 80)
                .background(NxColors.brand, in: Circle())
                .accessibilityHidden(true)
        }
    }

    // MARK: Perfil completo, identidad y asistencia de hoy

    private var resumen: some View {
        let pct = form.completeness
        let color: Color = pct >= 80 ? Self.verde : (pct >= 50 ? NxColors.naranja : NxColors.rojo)
        return tarjeta(spacing: 12) {
            titulo("Perfil completo")
            HStack(alignment: .center, spacing: 12) {
                Text("\(pct)%")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(color)
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(color.opacity(0.22))
                        Capsule()
                            .fill(color)
                            .frame(width: geo.size.width * CGFloat(min(max(pct, 0), 100)) / 100)
                    }
                }
                .frame(height: 4)
                .accessibilityHidden(true)
            }
            nota("Cuenta teléfono, CURP, RFC, NSS, fecha de nacimiento, ciudad y estado.")
            divisor
            fila("Departamento", profile?.departmentName.nonEmptyOr("—") ?? "—")
            fila("Rol", profile?.roleName.nonEmptyOr("—") ?? "—")
            fila("Nº de empleado", numeroDeEmpleado)
            fila("Control de acceso", estadoIntegra)
            divisor
            titulo("Acceso y asistencia (hoy)")
            fila("Checador de la app", lineaChecador)
            fila("Pases en puertas", lineaPuertas)
            nota("El checador de la app es el que cuenta para tu nómina.")
            if identity?.status != "linked" {
                // El texto de la API es para administradores (Integra, employeeNo); aquí va el del empleado.
                nota("Pide a RH que vincule tu número de empleado con el control de acceso.")
            }
        }
    }

    /// Misma cadena de respaldo que la web y Android.
    private var numeroDeEmpleado: String {
        [identity?.employeeNumber, identity?.companyEmployeeNumber, profile?.employeeNumber]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .first { !$0.isEmpty } ?? "—"
    }

    private var estadoIntegra: String {
        switch identity?.status {
        case "linked":
            let name = identity?.personName ?? ""
            return "Vinculado · \(name.isEmpty ? (identity?.personId ?? "") : name)"
        case "erp_only": return "Tu número aún no está en control de acceso"
        case "unlinked": return "Sin número de empleado"
        default: return "—"
        }
    }

    private var lineaChecador: String {
        guard let hybrid, !hybrid.erpCheckIn.isEmpty else { return "Sin entrada" }
        var line = "Entrada \(NxHoraMexico.hhmm(hybrid.erpCheckIn) ?? "—")"
        if let salida = NxHoraMexico.hhmm(hybrid.erpCheckOut) { line += " · Salida \(salida)" }
        return line
    }

    private var lineaPuertas: String {
        if let hybrid, !hybrid.acsFirstAt.isEmpty {
            let door = hybrid.acsFirstDoor.isEmpty ? "puerta" : hybrid.acsFirstDoor
            return "\(hybrid.acsPasses) pases · \(door) · desde \(NxHoraMexico.hhmm(hybrid.acsFirstAt) ?? "—")"
        }
        return identity?.status == "linked" ? "Sin pases hoy" : "Sin vincular"
    }

    // MARK: Datos personales

    private func datosCard(_ user: SessionUser) -> some View {
        let direccion = Self.cuentaDireccion(user)
        return tarjeta(spacing: 10) {
            titulo(direccion ? "Contacto" : "Datos personales")
            if loading {
                ProgressView()
                    .tint(NxColors.brand)
                    .frame(maxWidth: .infinity)
            } else {
                if let error {
                    Text(error)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.danger)
                    Button("Reintentar") { Task { await load() } }
                        .font(NxType.labelLarge)
                        .foregroundStyle(NxColors.brand)
                        .buttonStyle(.plain)
                        .nxTapTarget()
                }
                NxOutlinedCampo(label: "Teléfono", text: $form.telefono, keyboard: .phonePad, contentType: .telephoneNumber)
                if !direccion {
                    NxFechaCampo(label: "Fecha de nacimiento", value: $form.fechaNacimiento, hasta: Date())
                    NxOutlinedCampo(label: "Dirección", text: $form.direccion, contentType: .streetAddressLine1, multiline: true)
                    NxOutlinedCampo(label: "Colonia", text: $form.colonia)
                    NxOutlinedCampo(label: "Ciudad", text: $form.ciudad, contentType: .addressCity)
                    NxOutlinedCampo(label: "Estado", text: $form.estado, contentType: .addressState)
                    NxOutlinedCampo(label: "C.P.", text: $form.codigoPostal, keyboard: .numberPad, contentType: .postalCode)
                    NxOutlinedCampo(label: "País", text: $form.pais, contentType: .countryName)
                    NxOutlinedCampo(label: "CURP", text: $form.curp, capitalization: .characters, autocorrect: false)
                    NxOutlinedCampo(label: "RFC", text: $form.rfc, capitalization: .characters, autocorrect: false)
                    NxOutlinedCampo(label: "Número de INE", text: $form.ineNumero, autocorrect: false)
                    NxOutlinedCampo(label: "NSS", text: $form.nss, keyboard: .numberPad, autocorrect: false)
                }
                NxOutlinedCampo(label: "Contacto emergencia", text: $form.contactoEmergenciaNombre, contentType: .name)
                NxOutlinedCampo(label: "Tel. emergencia", text: $form.contactoEmergenciaTelefono, keyboard: .phonePad, contentType: .telephoneNumber)
                if let estatus = profile?.estatus, !estatus.trimmingCharacters(in: .whitespaces).isEmpty {
                    fila("Estatus perfil", estatus)
                }
                if let saveMessage, !saveMessage.isEmpty {
                    Text(saveMessage)
                        .font(NxType.bodySmall)
                        .foregroundStyle(saveSuccess ? Self.verde : NxColors.danger)
                }
                NxBotonPildora(title: "Guardar perfil", loading: saving, enabled: !loading) {
                    Task { await save() }
                }
            }
        }
    }

    // MARK: Departamento y correo

    @ViewBuilder
    private func cuentaCard(_ user: SessionUser) -> some View {
        let depto = (user.department ?? "").trimmingCharacters(in: .whitespaces)
        let correo = user.email.trimmingCharacters(in: .whitespaces)
        if !depto.isEmpty || !correo.isEmpty {
            tarjeta(spacing: 12) {
                if !depto.isEmpty { fila("Departamento", depto) }
                if !correo.isEmpty { fila("Correo", correo) }
            }
        }
    }

    // MARK: Bloqueo de app

    private var bloqueoCard: some View {
        tarjeta(spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    titulo("Bloqueo de app")
                    Text(lockAvailable ? "Biometría o PIN al volver a la app" : "No disponible en este dispositivo")
                        .font(NxType.bodySmall)
                        .foregroundStyle(Self.sub)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Toggle("Bloqueo de app", isOn: $appLockEnabled)
                    .labelsHidden()
                    .tint(NxColors.brand)
                    .disabled(!lockAvailable)
                    .onChange(of: appLockEnabled) { _, newValue in
                        AppLock.isEnabled = newValue
                    }
            }
        }
    }

    // MARK: Cola offline

    private var colaCard: some View {
        NavigationLink {
            OfflineQueueView()
                .nxBrandNavBar(title: "Cola offline")
        } label: {
            HStack(alignment: .center, spacing: 8) {
                VStack(alignment: .leading, spacing: 0) {
                    titulo("Cola offline")
                    Text("Ver y sincronizar cambios pendientes")
                        .font(NxType.bodySmall)
                        .foregroundStyle(Self.sub)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text("›")
                    .font(.system(size: 20))
                    .foregroundStyle(Self.sub)
                    .accessibilityHidden(true)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NxColors.rgb(0xEFF6FF), in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
    }

    // MARK: Cerrar sesión y eliminar cuenta

    private var cerrarSesion: some View {
        Button { confirmLogout = true } label: {
            Text("Cerrar sesión")
                .font(NxType.labelLarge)
                .foregroundStyle(NxColors.danger)
                .frame(maxWidth: .infinity, minHeight: 48)
                .overlay(
                    RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                        .strokeBorder(NxColors.danger.opacity(0.5), lineWidth: 1)
                )
                .contentShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
    }

    /// Exigencia de Apple (guideline 5.1.1(v)): la baja se pide desde la app y se
    /// gestiona en la web, porque las cuentas las crea la organización.
    private var eliminarCuenta: some View {
        Button { confirmDeleteAccount = true } label: {
            Text("Eliminar mi cuenta")
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.danger)
                .frame(maxWidth: .infinity)
                .nxTapTarget()
        }
        .buttonStyle(.plain)
    }

    // MARK: Piezas

    /// Tarjeta blanca del perfil de Android: radio 16, elevación 1, relleno 16.
    private func tarjeta<Content: View>(spacing: CGFloat, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: spacing) { content() }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .nxCardSurface(radius: NxRadius.l, elevation: 1)
    }

    /// Título de tarjeta: 16 SemiBold (#0F172A).
    private func titulo(_ texto: String) -> some View {
        Text(texto)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(NxColors.fg)
            .accessibilityAddTraits(.isHeader)
    }

    /// `HorizontalDivider` de Material (1, #E2E8F0).
    private var divisor: some View {
        Rectangle()
            .fill(NxColors.border)
            .frame(height: 1)
            .accessibilityHidden(true)
    }

    private func nota(_ texto: String) -> some View {
        Text(texto)
            .font(NxType.bodySmall)
            .foregroundStyle(Self.sub)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// `ProfileInfoRow`: etiqueta 12,5 gris a la izquierda, valor 14 SemiBold a la derecha.
    private func fila(_ etiqueta: String, _ valor: String) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Text(etiqueta)
                .font(NxType.bodySmall)
                .foregroundStyle(Self.sub)
            Spacer(minLength: 8)
            Text(valor)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(NxColors.fg)
                .multilineTextAlignment(.trailing)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: Datos

    private func load() async {
        loading = true
        error = nil
        saveMessage = nil
        async let identityTask = MyProfileRepository.shared.identity()
        async let hybridTask = MyProfileRepository.shared.hybridToday()
        do {
            let snapshot = try await MyProfileRepository.shared.load()
            profile = snapshot
            form = snapshot.fields
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cargar el perfil")
        }
        // Integra y el contraste híbrido son opcionales: si no contestan, el perfil sale igual.
        identity = await identityTask
        hybrid = await hybridTask
        loading = false
    }

    private func save() async {
        saving = true
        saveMessage = nil
        error = nil
        defer { saving = false }
        // Como Android: lo que se manda va recortado (vacío = null en el API).
        var limpio = form
        limpio.telefono = limpio.telefono.trimmingCharacters(in: .whitespacesAndNewlines)
        limpio.fechaNacimiento = limpio.fechaNacimiento.trimmingCharacters(in: .whitespacesAndNewlines)
        limpio.direccion = limpio.direccion.trimmingCharacters(in: .whitespacesAndNewlines)
        limpio.colonia = limpio.colonia.trimmingCharacters(in: .whitespacesAndNewlines)
        limpio.ciudad = limpio.ciudad.trimmingCharacters(in: .whitespacesAndNewlines)
        limpio.estado = limpio.estado.trimmingCharacters(in: .whitespacesAndNewlines)
        limpio.codigoPostal = limpio.codigoPostal.trimmingCharacters(in: .whitespacesAndNewlines)
        limpio.pais = limpio.pais.trimmingCharacters(in: .whitespacesAndNewlines)
        limpio.curp = limpio.curp.trimmingCharacters(in: .whitespacesAndNewlines)
        limpio.rfc = limpio.rfc.trimmingCharacters(in: .whitespacesAndNewlines)
        limpio.ineNumero = limpio.ineNumero.trimmingCharacters(in: .whitespacesAndNewlines)
        limpio.nss = limpio.nss.trimmingCharacters(in: .whitespacesAndNewlines)
        limpio.contactoEmergenciaNombre = limpio.contactoEmergenciaNombre.trimmingCharacters(in: .whitespacesAndNewlines)
        limpio.contactoEmergenciaTelefono = limpio.contactoEmergenciaTelefono.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let sent = try await MyProfileRepository.shared.save(limpio)
            saveSuccess = true
            saveMessage = sent
                ? "Perfil guardado"
                : "Guardado sin conexión; se enviará al recuperar la red."
        } catch {
            saveSuccess = false
            saveMessage = error.toUserMessage(fallback: "No se pudo guardar")
        }
    }
}

private extension String {
    /// El texto, o `fallback` si está vacío.
    func nonEmptyOr(_ fallback: String) -> String {
        let t = trimmingCharacters(in: .whitespaces)
        return t.isEmpty ? fallback : t
    }
}
