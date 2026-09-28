import SwiftUI

struct LoginView: View {
    let onLoggedIn: () -> Void

    @State private var email = RememberMe.isEnabled ? RememberMe.lastEmail : ""
    @State private var rememberMe = RememberMe.isEnabled
    @State private var password = ""
    @State private var kind: AuthRepository.Kind = .user
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showPassword = false
    @State private var quickProfiles = QuickProfileStore.load()

    private let accent = NxBrand.primary

    /// Correo y contraseña con algo escrito (sin contar espacios ni saltos de línea).
    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !password.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !isLoading
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    VStack(spacing: 8) {
                        // Mismo logo que Android; azul oscuro porque lleva «NEXARA» en blanco.
                        Image("LogoNexara")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 80, height: 80)
                            .padding(5)
                            .background(NxBrand.dark)
                            .clipShape(RoundedRectangle(cornerRadius: 22))
                        Text("NEXARA")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .tracking(3)
                            .foregroundColor(accent)
                        Text("Iniciar sesión")
                            .font(.title2.bold())
                        Text("Ingresa a tu cuenta de Nexara")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 32)
                    .padding(.bottom, 24)

                    VStack(alignment: .leading, spacing: 16) {
                        Picker("Tipo de acceso", selection: $kind) {
                            Text("Usuario").tag(AuthRepository.Kind.user)
                            Text("Cliente").tag(AuthRepository.Kind.client)
                            Text("Sucursal").tag(AuthRepository.Kind.branch)
                        }
                        .pickerStyle(.segmented)

                        if !quickProfiles.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Acceso rápido")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 8) {
                                        ForEach(quickProfiles) { profile in
                                            Button {
                                                email = profile.email
                                                errorMessage = nil
                                            } label: {
                                                VStack(alignment: .leading, spacing: 2) {
                                                    Text(profile.displayName)
                                                        .font(.subheadline.bold())
                                                        .foregroundColor(.primary)
                                                    Text(profile.email)
                                                        .font(.caption2)
                                                        .foregroundColor(.secondary)
                                                }
                                                .padding(.horizontal, 12)
                                                .padding(.vertical, 10)
                                                .background(accent.opacity(0.08))
                                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Correo electrónico").font(.caption.bold())
                            TextField("correo@empresa.com", text: $email)
                                .textInputAutocapitalization(.never)
                                .keyboardType(.emailAddress)
                                .textContentType(.username)
                                .autocorrectionDisabled()
                                .submitLabel(.next)
                                .padding(12)
                                .background(Color(.secondarySystemGroupedBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Contraseña").font(.caption.bold())
                            HStack {
                                Group {
                                    if showPassword {
                                        TextField("Contraseña", text: $password)
                                    } else {
                                        SecureField("Contraseña", text: $password)
                                    }
                                }
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .textContentType(.password)
                                .submitLabel(.go)
                                .onSubmit {
                                    guard canSubmit else { return }
                                    Task { await doLogin() }
                                }
                                Button { showPassword.toggle() } label: {
                                    Image(systemName: showPassword ? "eye.slash" : "eye")
                                        .foregroundColor(.secondary)
                                        .frame(width: NxMetrics.minTap, height: 28)
                                        .contentShape(Rectangle())
                                }
                                .accessibilityLabel(showPassword ? "Ocultar contraseña" : "Mostrar contraseña")
                            }
                            .padding(12)
                            .background(Color(.secondarySystemGroupedBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }

                        // «Recordarme»: la sesión queda abierta en este teléfono y la app entra directo.
                        Toggle(isOn: $rememberMe) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Recordarme").font(.subheadline.weight(.semibold))
                                Text(rememberMe
                                     ? "Entrarás directo sin volver a escribir tu contraseña"
                                     : "Se cerrará la sesión al cerrar la app")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .tint(accent)

                        if let err = errorMessage {
                            NxIconText(systemName: "exclamationmark.triangle.fill", text: err)
                                .font(.footnote)
                                .foregroundStyle(CorePalette.red)
                        }

                        Button {
                            Task { await doLogin() }
                        } label: {
                            HStack {
                                Spacer()
                                if isLoading { ProgressView().tint(.white) }
                                else { Text("Entrar").fontWeight(.bold) }
                                Spacer()
                            }
                            .padding(.vertical, 14)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(accent)
                        .disabled(!canSubmit)
                    }
                    .padding(24)
                    .background(Color(.systemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .shadow(color: .black.opacity(0.06), radius: 12, y: 4)
                    .padding(.horizontal, 20)

                    // Modo demostración: recorre la app sin cuenta ni conexión, con datos
                    // ficticios que viven solo en el teléfono.
                    VStack(spacing: 6) {
                        Button {
                            DemoMode.activate()
                            onLoggedIn()
                        } label: {
                            HStack {
                                Spacer()
                                Label("Explorar NEXARA con datos de muestra", systemImage: "play.rectangle")
                                    .fontWeight(.semibold)
                                Spacer()
                            }
                            .padding(.vertical, 12)
                        }
                        .buttonStyle(.bordered)
                        .tint(accent)
                        .disabled(isLoading)
                        .accessibilityIdentifier("demo-mode-button")

                        Text("Sin cuenta ni conexión. Los datos son ficticios.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)

                    Text("Tecnología que impulsa tu negocio")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .padding(.top, 20)

                    // Versión y aviso de privacidad, como en el login de Android.
                    // Aquí importa más que en ninguna otra pantalla: es la única a
                    // la que llega quien todavía no ha entrado, y las tiendas piden
                    // que el aviso sea alcanzable desde dentro de la app.
                    NxAppMetaFooter()
                        .padding(.top, 12)
                        .padding(.bottom, 32)
                }
            }
            .background(
                LinearGradient(
                    colors: [NxBrand.soft, NxBrand.surface],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
            )
            .navigationBarHidden(true)
        }
    }

    private func doLogin() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        // Se recortan aquí también, no solo en `AuthRepository`: lo que se guarda como
        // «último correo» y lo que viaja al servidor tiene que ser lo mismo.
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            _ = try await AuthRepository.shared.login(email: cleanEmail, password: cleanPassword, kind: kind)
            RememberMe.isEnabled = rememberMe
            RememberMe.lastEmail = rememberMe ? cleanEmail : ""
            quickProfiles = QuickProfileStore.load()
            await MainActor.run { onLoggedIn() }
        } catch {
            // Mensaje propio del acceso: un 401 aquí NO es «sesión expirada».
            errorMessage = AuthErrorMapper.loginMessage(error)
        }
    }
}
