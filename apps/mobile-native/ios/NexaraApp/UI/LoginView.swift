import LocalAuthentication
import SwiftUI

/// Inicio de sesión — igual que `LoginScreen` de Android: fondo degradado azul
/// claro, tarjeta blanca de radio 20 con el logo, «NEXARA», «Iniciar sesión»,
/// acceso rápido, correo y contraseña, «Recordarme», «Entrar», la huella para
/// elegir el perfil guardado y el aviso de privacidad; abajo, la versión.
///
/// Como Android, no se pregunta «Usuario / Cliente / Sucursal»: se prueba
/// primero la cuenta de personal y, si el servidor dice que ahí no existe
/// (401 o 404), el portal de clientes y sucursales.
///
/// Lo único que Android no tiene: «Explorar NEXARA con datos de muestra»
/// (`demo-mode-button`). La revisión de Apple entra por ahí.
struct LoginView: View {
    let onLoggedIn: () -> Void

    @State private var email = RememberMe.isEnabled ? RememberMe.lastEmail : ""
    @State private var rememberMe = RememberMe.isEnabled
    @State private var password = ""
    @State private var isLoading = false
    @State private var isBiometricLoading = false
    @State private var errorMessage: String?
    @State private var infoMessage: String?
    @State private var showPassword = false
    @State private var quickProfiles = QuickProfileStore.load()
    @FocusState private var focus: Campo?
    @Environment(\.openURL) private var openURL

    /// El iPhone usa Face ID (el tipo solo se sabe después de preguntar si se puede).
    private let usaFaceID: Bool = {
        let ctx = LAContext()
        var err: NSError?
        _ = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)
        return ctx.biometryType == .faceID
    }()

    private enum Campo { case correo, contrasena }

    // Paleta del acceso en Android (`LoginScreen.kt`).
    private static let azul = NxColors.rgb(0x2563EB)
    private static let azulOscuro = NxColors.rgb(0x1E40AF)
    private static let campoGris = NxColors.rgb(0xF1F5F9)
    private static let sub = NxColors.rgb(0x64748B)
    private static let etiqueta = NxColors.rgb(0x374151)
    private static let placeholder = NxColors.rgb(0xADB5BD)

    private var trabajando: Bool { isLoading || isBiometricLoading }

    /// Correo y contraseña con algo escrito (sin contar espacios ni saltos de línea).
    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !password.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !trabajando
    }

    private var showBiometricOption: Bool { AppLock.isAvailable && !quickProfiles.isEmpty }

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 0) {
                    Spacer().frame(height: 32)
                    tarjeta
                    demo
                        .padding(.top, 16)
                    NxAppMetaFooter(mostrarSoporte: false)
                        .padding(.top, 16)
                    Spacer().frame(height: 24)
                }
                .padding(.horizontal, 24)
                .frame(maxWidth: .infinity, minHeight: geo.size.height)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(
            LinearGradient(
                colors: [NxColors.rgb(0xDBEAFE), NxColors.surface],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        )
        .onChange(of: email) { _, _ in
            errorMessage = nil
            infoMessage = nil
        }
        .onChange(of: password) { _, _ in
            errorMessage = nil
            infoMessage = nil
        }
    }

    // MARK: Tarjeta

    private var tarjeta: some View {
        VStack(spacing: 0) {
            // Azul oscuro: el logo lleva «NEXARA» en blanco y sobre un fondo claro no se lee.
            Image("LogoNexara")
                .resizable()
                .scaledToFit()
                .frame(width: 80, height: 80)
                .frame(width: 90, height: 90)
                .background(Self.azulOscuro, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .accessibilityLabel("Nexara")

            Text("NEXARA")
                .font(.system(size: 14, weight: .semibold))
                .tracking(3)
                .foregroundStyle(Self.azul)
                .padding(.top, 12)

            Text("Iniciar sesión")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(NxColors.fg)
                .padding(.top, 6)
            Text("Ingresa a tu cuenta de Nexara")
                .font(NxType.bodyMedium)
                .foregroundStyle(Self.sub)
                .padding(.top, 4)

            if !quickProfiles.isEmpty {
                accesoRapido
                    .padding(.top, 20)
            }

            etiquetaCampo("Correo electrónico")
                .padding(.top, 24)
            campoCorreo
                .padding(.top, 6)

            etiquetaCampo("Contraseña")
                .padding(.top, 16)
            campoContrasena
                .padding(.top, 6)

            recordarme
                .padding(.top, 12)

            botonEntrar
                .padding(.top, 16)

            if showBiometricOption {
                botonHuella
                    .padding(.top, 12)
            }

            if let infoMessage {
                Text(infoMessage)
                    .font(NxType.bodyMedium)
                    .foregroundStyle(Self.azulOscuro)
                    .multilineTextAlignment(.center)
                    .padding(.top, 14)
            }

            if let errorMessage, !errorMessage.isEmpty {
                Text(errorMessage)
                    .font(NxType.bodyMedium)
                    .foregroundStyle(NxColors.danger)
                    .multilineTextAlignment(.center)
                    .padding(.top, 14)
            }

            avisoPrivacidad
                .multilineTextAlignment(.center)
                .padding(.top, 20)
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 36)
        .frame(maxWidth: .infinity)
        .nxCardSurface(radius: NxRadius.xl, elevation: 6, fill: NxColors.card)
    }

    private func etiquetaCampo(_ texto: String) -> some View {
        Text(texto)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Self.etiqueta)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var accesoRapido: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Acceso rápido")
                .font(NxType.labelMedium)
                .foregroundStyle(Self.sub)
                .frame(maxWidth: .infinity, alignment: .leading)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(quickProfiles) { profile in
                        Button {
                            email = profile.email
                            errorMessage = nil
                            infoMessage = nil
                        } label: {
                            VStack(alignment: .leading, spacing: 0) {
                                Text(profile.displayName)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Self.azulOscuro)
                                Text(profile.email)
                                    .font(NxType.bodySmall)
                                    .foregroundStyle(Self.sub)
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(NxColors.rgb(0xEFF6FF), in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                        }
                        .buttonStyle(NxPressableStyle())
                    }
                }
            }
        }
    }

    /// Campo de Android: radio 12, gris #F1F5F9 sin foco y blanco con foco,
    /// contorno #CBD5E1 (azul y 2 con foco), 56 de alto y texto 16.
    private func caja<Content: View>(enfocado: Bool, @ViewBuilder _ content: () -> Content) -> some View {
        content()
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .background(
                enfocado ? NxColors.card : Self.campoGris,
                in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                    .strokeBorder(enfocado ? Self.azul : NxColors.borderStrong, lineWidth: enfocado ? 2 : 1)
            )
    }

    private var campoCorreo: some View {
        caja(enfocado: focus == .correo) {
            TextField("", text: $email, prompt: Text("correo@empresa.com").foregroundColor(Self.placeholder))
                .font(NxType.bodyLarge)
                .foregroundStyle(NxColors.fg)
                .tint(Self.azul)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .textContentType(.username)
                .autocorrectionDisabled()
                .submitLabel(.next)
                .focused($focus, equals: .correo)
                .onSubmit { focus = .contrasena }
                .disabled(trabajando)
                .padding(.horizontal, 16)
                .accessibilityLabel("Correo electrónico")
                .accessibilityIdentifier("login_email")
        }
    }

    private var campoContrasena: some View {
        caja(enfocado: focus == .contrasena) {
            HStack(spacing: 0) {
                Group {
                    if showPassword {
                        TextField("", text: $password, prompt: Text("••••••••••••").foregroundColor(Self.placeholder))
                    } else {
                        SecureField("", text: $password, prompt: Text("••••••••••••").foregroundColor(Self.placeholder))
                    }
                }
                .font(NxType.bodyLarge)
                .foregroundStyle(NxColors.fg)
                .tint(Self.azul)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textContentType(.password)
                .submitLabel(.go)
                .focused($focus, equals: .contrasena)
                .onSubmit {
                    guard canSubmit else { return }
                    Task { await doLogin() }
                }
                .disabled(trabajando)
                .padding(.leading, 16)
                .accessibilityLabel("Contraseña")
                .accessibilityIdentifier("login_password")
                Button { showPassword.toggle() } label: {
                    Image(systemName: showPassword ? "eye.slash" : "eye")
                        .font(.system(size: 18))
                        .foregroundStyle(Self.sub)
                        .frame(width: 48, height: 48)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(showPassword ? "Ocultar contraseña" : "Mostrar contraseña")
            }
        }
    }

    /// «Recordarme»: la sesión se queda abierta en este teléfono y la app entra directo.
    private var recordarme: some View {
        Button { rememberMe.toggle() } label: {
            HStack(alignment: .center, spacing: 0) {
                ZStack {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(rememberMe ? Self.azul : Color.clear)
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .strokeBorder(rememberMe ? Self.azul : NxColors.muted, lineWidth: 2)
                    if rememberMe {
                        Image(systemName: "checkmark")
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundStyle(Color.white)
                    }
                }
                .frame(width: 18, height: 18)
                .frame(width: 48, height: 48)
                VStack(alignment: .leading, spacing: 0) {
                    Text("Recordarme")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                    Text(rememberMe
                         ? "Entrarás directo sin volver a escribir tu contraseña"
                         : "Se cerrará la sesión al cerrar la app")
                        .font(NxType.bodySmall)
                        .foregroundStyle(Self.sub)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(rememberMe ? AccessibilityTraits.isSelected : [])
        .accessibilityIdentifier("login_remember")
    }

    private var botonEntrar: some View {
        Button {
            Task { await doLogin() }
        } label: {
            HStack(spacing: 10) {
                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                        .frame(width: 20, height: 20)
                }
                Text(isLoading ? "Entrando..." : "Entrar")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Color.white)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(
                canSubmit || isLoading ? Self.azul : NxColors.rgb(0x93C5FD),
                in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
            )
            .contentShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
        .disabled(!canSubmit)
        .accessibilityIdentifier("login_submit")
    }

    /// Android: «Usar huella o PIN». En un iPhone con Face ID se dice Face ID.
    private var botonHuella: some View {
        let faceId = usaFaceID
        return Button {
            Task { await unlockWithBiometric() }
        } label: {
            HStack(spacing: 8) {
                if isBiometricLoading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(Self.azul)
                        .frame(width: 18, height: 18)
                } else {
                    Image(systemName: faceId ? "faceid" : "touchid")
                        .font(.system(size: 18))
                        .foregroundStyle(Self.azul)
                }
                Text(isBiometricLoading ? "Verificando..." : (faceId ? "Usar Face ID o PIN" : "Usar huella o PIN"))
                    .font(NxType.labelLarge)
                    .foregroundStyle(Self.azul)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                    .strokeBorder(NxColors.borderStrong, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
        .disabled(trabajando)
    }

    /// «Al entrar, aceptas la Política de privacidad» (el enlace subrayado y en
    /// azul). Toda la línea abre el aviso: en un iPhone chico se parte en dos.
    private var avisoPrivacidad: some View {
        (Text("Al entrar, aceptas la ")
            .font(NxType.bodySmall)
            .foregroundColor(NxColors.fg4)
            + Text("Política de privacidad")
            .font(.system(size: 12.5, weight: .semibold))
            .foregroundColor(Self.azul)
            .underline())
            .onTapGesture { openURL(NxAppMeta.privacidadURL) }
            .accessibilityAddTraits(.isLink)
    }

    // MARK: Modo demostración

    /// Recorre la app sin cuenta ni conexión, con datos ficticios que viven solo en
    /// el teléfono. La revisión de Apple depende de este botón.
    private var demo: some View {
        VStack(spacing: 6) {
            Button {
                DemoMode.activate()
                onLoggedIn()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "play.rectangle")
                        .font(.system(size: 16, weight: .semibold))
                    Text("Explorar NEXARA con datos de muestra")
                        .font(NxType.labelLarge)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }
                .foregroundStyle(Self.azul)
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(NxColors.card.opacity(0.7), in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                        .strokeBorder(NxColors.borderStrong, lineWidth: 1)
                )
                .contentShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
            }
            .buttonStyle(NxPressableStyle())
            .disabled(trabajando)
            .accessibilityIdentifier("demo-mode-button")

            Text("Sin cuenta ni conexión. Los datos son ficticios.")
                .font(NxType.bodySmall)
                .foregroundStyle(Self.sub)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: Acciones

    private func doLogin() async {
        guard canSubmit else { return }
        isLoading = true
        errorMessage = nil
        infoMessage = nil
        defer { isLoading = false }
        // Se recortan aquí también, no solo en `AuthRepository`: lo que se guarda como
        // «último correo» y lo que viaja al servidor tiene que ser lo mismo.
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await loginEnCadena(email: cleanEmail, password: cleanPassword)
            RememberMe.isEnabled = rememberMe
            RememberMe.lastEmail = rememberMe ? cleanEmail : ""
            quickProfiles = QuickProfileStore.load()
            await MainActor.run { onLoggedIn() }
        } catch {
            // Mensaje propio del acceso: un 401 aquí NO es «sesión expirada».
            errorMessage = AuthErrorMapper.loginMessage(error)
        }
    }

    /// Como `AuthRepository.login` de Android: personal primero y, si el servidor
    /// dice que la cuenta no vive ahí (401 o 404), el portal de clientes y
    /// sucursales. Un 429, un 5xx o un corte de red se reportan tal cual (seguir
    /// probando solo gasta intentos del límite de `/auth`). Si los dos fallan, se
    /// reporta el PRIMER error: al empleado no se le enseña el del portal.
    private func loginEnCadena(email: String, password: String) async throws {
        do {
            _ = try await AuthRepository.shared.login(email: email, password: password, kind: .user)
        } catch let primero {
            guard Self.esOtroTipoDeCuenta(primero) else { throw primero }
            do {
                _ = try await AuthRepository.shared.login(email: email, password: password, kind: .client)
            } catch let segundo {
                guard Self.esOtroTipoDeCuenta(segundo) else { throw segundo }
                throw primero
            }
        }
    }

    private static func esOtroTipoDeCuenta(_ error: Error) -> Bool {
        if case ApiError.http(let code, _) = error { return code == 401 || code == 404 }
        return false
    }

    /// La huella no inicia sesión: confirma que eres tú y deja escrito el correo
    /// del perfil guardado (como Android).
    private func unlockWithBiometric() async {
        guard showBiometricOption, !trabajando, let profile = quickProfiles.first else { return }
        isBiometricLoading = true
        errorMessage = nil
        infoMessage = nil
        let ok = await AppLock.authenticate(reason: "Confirma tu identidad para continuar")
        isBiometricLoading = false
        if ok {
            email = profile.email
            // `onChange(of: email)` borra los avisos: este va después.
            DispatchQueue.main.async {
                infoMessage = "Perfil seleccionado. Ingresa tu contraseña para continuar."
                errorMessage = nil
            }
        } else {
            errorMessage = "No se pudo verificar tu identidad. Intenta de nuevo."
        }
    }
}
