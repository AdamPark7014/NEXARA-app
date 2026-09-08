import SwiftUI

/// Segundo factor de la **propia** cuenta — `users/mfa/status|setup|confirm|disable`.
///
/// Es autoservicio puro: el API resuelve el usuario desde el token y no acepta
/// un identificador, así que desde aquí no se puede tocar la cuenta de nadie
/// más. Era el hueco que quedaba abierto en el relevo («MFA / refresh de sesión
/// en iOS»): la app pedía MFA al iniciar sesión pero no dejaba darse de alta.
struct UsersMfaView: View {
    @StateObject private var vm = UsersMfaVM()

    var body: some View {
        List {
            if let message = vm.message {
                Text(message).font(.footnote)
                    .foregroundColor(vm.messageIsError ? .red : .green)
            }

            Section("Estado") {
                if vm.isLoading && vm.status == nil {
                    ProgressView()
                } else {
                    HStack {
                        Text("Segundo factor")
                        Spacer()
                        UsersStateTag(text: vm.isEnabled ? "Activo" : "Sin MFA",
                                      color: vm.isEnabled ? .green : .orange)
                    }
                    if let enabledAt = vm.status?.mfaEnabledAt, !enabledAt.isEmpty {
                        HStack {
                            Text("Activado").foregroundColor(.secondary)
                            Spacer()
                            Text(usersStamp(enabledAt))
                        }
                    }
                }
            }

            if let setup = vm.setup, setup.isUsable {
                Section("1 · Guarda el secreto") {
                    // Se enseña una sola vez: el API no lo vuelve a devolver.
                    Text(setup.secret)
                        .font(.system(.footnote, design: .monospaced))
                        .textSelection(.enabled)
                    Text("Cópialo en tu aplicación de autenticación (Google Authenticator, 1Password, Authy…). No se volverá a mostrar.")
                        .font(.caption).foregroundColor(.secondary)
                    if !setup.otpauthUrl.isEmpty {
                        Text(setup.otpauthUrl)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(.secondary)
                            .textSelection(.enabled)
                    }
                }
                Section("2 · Confirma con el código") {
                    TextField("Código de 6 dígitos", text: $vm.token)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                    Button {
                        Task { await vm.confirm() }
                    } label: {
                        Label("Activar segundo factor", systemImage: "lock.shield")
                    }
                    .disabled(vm.busy || vm.token.count < 6)
                }
            } else if vm.isEnabled {
                Section("Dar de baja") {
                    TextField("Código actual (si tu cuenta lo exige)", text: $vm.token)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                    Button(role: .destructive) {
                        Task { await vm.disable() }
                    } label: {
                        Label("Desactivar segundo factor", systemImage: "lock.open")
                    }
                    .disabled(vm.busy)
                } footer: {
                    Text("Sin segundo factor tu cuenta queda protegida sólo por la contraseña.")
                }
            } else {
                Section {
                    Button {
                        Task { await vm.beginSetup() }
                    } label: {
                        Label("Configurar segundo factor", systemImage: "lock.shield")
                    }
                    .disabled(vm.busy)
                } footer: {
                    Text("Genera un secreto TOTP para tu cuenta. Sólo afecta a tu propio acceso.")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Mi seguridad")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await vm.load() }
        .task { await vm.load() }
    }
}

// MARK: – ViewModel

@MainActor
final class UsersMfaVM: ObservableObject {
    @Published var status: UserMfaStatus?
    @Published var setup: UserMfaSetup?
    @Published var token = ""
    @Published var isLoading = false
    @Published var busy = false
    @Published var message: String?
    @Published var messageIsError = false

    var isEnabled: Bool { status?.mfaEnabled ?? false }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            status = try await UsersAdminRepository.shared.myMfaStatus()
        } catch {
            show(error.toUserMessage(fallback: "No se pudo leer el estado del segundo factor"),
                 isError: true)
        }
    }

    func beginSetup() async {
        busy = true
        defer { busy = false }
        do {
            let value = try await UsersAdminRepository.shared.beginMyMfaSetup()
            guard value.isUsable else {
                show("El servidor no devolvió el secreto", isError: true)
                return
            }
            setup = value
            message = nil
        } catch {
            show(error.toUserMessage(fallback: "No se pudo iniciar el alta"), isError: true)
        }
    }

    func confirm() async {
        busy = true
        defer { busy = false }
        do {
            try await UsersAdminRepository.shared.confirmMyMfa(token: token.trimmingCharacters(in: .whitespaces))
            // El estado se relee del servidor en vez de darlo por hecho: si el
            // código era válido pero el alta falló, aquí se ve.
            setup = nil
            token = ""
            await load()
            show(isEnabled ? "Segundo factor activo" : "El servidor no confirmó el alta",
                 isError: !isEnabled)
        } catch {
            show(error.toUserMessage(fallback: "Código incorrecto o caducado"), isError: true)
        }
    }

    func disable() async {
        busy = true
        defer { busy = false }
        do {
            let clean = token.trimmingCharacters(in: .whitespaces)
            try await UsersAdminRepository.shared.disableMyMfa(token: clean.isEmpty ? nil : clean)
            token = ""
            await load()
            show(isEnabled ? "El servidor no dio de baja el segundo factor" : "Segundo factor desactivado",
                 isError: isEnabled)
        } catch {
            show(error.toUserMessage(fallback: "No se pudo desactivar"), isError: true)
        }
    }

    private func show(_ text: String, isError: Bool) {
        message = text
        messageIsError = isError
    }
}
