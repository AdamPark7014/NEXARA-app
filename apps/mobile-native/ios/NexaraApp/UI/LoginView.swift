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
                                .autocorrectionDisabled()
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
                                Button { showPassword.toggle() } label: {
                                    Image(systemName: showPassword ? "eye.slash" : "eye")
                                        .foregroundColor(.secondary)
                                }
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
                            Text(err).foregroundColor(.red).font(.footnote)
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
                        .disabled(email.isEmpty || password.isEmpty || isLoading)
                    }
                    .padding(24)
                    .background(Color(.systemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .shadow(color: .black.opacity(0.06), radius: 12, y: 4)
                    .padding(.horizontal, 20)

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
        do {
            _ = try await AuthRepository.shared.login(email: email, password: password, kind: kind)
            RememberMe.isEnabled = rememberMe
            RememberMe.lastEmail = rememberMe ? email.trimmingCharacters(in: .whitespacesAndNewlines) : ""
            quickProfiles = QuickProfileStore.load()
            await MainActor.run { onLoggedIn() }
        } catch {
            errorMessage = error.toUserMessage()
        }
    }
}
