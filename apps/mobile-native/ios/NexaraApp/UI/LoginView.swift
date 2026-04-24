import SwiftUI

struct LoginView: View {
    let onLoggedIn: () -> Void

    @State private var email = ""
    @State private var password = ""
    @State private var kind: AuthRepository.Kind = .user
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Tipo de acceso", selection: $kind) {
                        Text("Usuario").tag(AuthRepository.Kind.user)
                        Text("Cliente").tag(AuthRepository.Kind.client)
                        Text("Sucursal").tag(AuthRepository.Kind.branch)
                    }
                    .pickerStyle(.segmented)
                }
                Section("Credenciales") {
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                    SecureField("Contraseña", text: $password)
                }
                if let err = errorMessage {
                    Section { Text(err).foregroundColor(.red).font(.footnote) }
                }
                Section {
                    Button {
                        Task { await doLogin() }
                    } label: {
                        HStack {
                            Spacer()
                            if isLoading { ProgressView() } else { Text("Entrar").bold() }
                            Spacer()
                        }
                    }
                    .disabled(email.isEmpty || password.isEmpty || isLoading)
                }
            }
            .navigationTitle("NEXARA")
        }
    }

    private func doLogin() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            _ = try await AuthRepository.shared.login(email: email, password: password, kind: kind)
            await MainActor.run { onLoggedIn() }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
