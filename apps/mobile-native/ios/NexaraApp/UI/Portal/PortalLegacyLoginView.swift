import SwiftUI

/// POST `client-auth/login` y POST `branch-auth/login`.
///
/// La ruta viva es la unificada `portal/login`, que `AuthRepository` ya usa.
/// Estas dos son las heredadas, y existen porque no todos los despliegues de la
/// API están al día: Android las intenta en cadena dentro de su `AuthRepository`
/// cuando la unificada falla, e iOS no las tenía en absoluto — un cliente contra
/// una API antigua simplemente no podía entrar desde el iPhone.
///
/// Aquí son un acceso explícito en vez de un respaldo automático por un motivo
/// de propiedad de ficheros, no de diseño: `Data/AuthRepository.swift` lo lleva
/// otro turno. `PortalExtraRepository.portalLoginLegacyFallback` está escrito
/// para que ese fichero lo llame desde su `catch` con una sola línea; cuando eso
/// ocurra, esta pantalla sobra y se puede borrar.
struct PortalLegacyLoginView: View {
    /// Se avisa al contenedor cuando hay sesión, para que reencamine.
    var onSignedIn: (() -> Void)?

    @State private var email = ""
    @State private var password = ""
    @State private var kind = Kind.client
    @State private var busy = false
    @State private var error: String?
    @State private var okMessage: String?

    private enum Kind: String, CaseIterable, Identifiable {
        case client, branch
        var id: String { rawValue }
        var label: String { self == .client ? "Cliente" : "Sucursal" }
    }

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !password.isEmpty
            && !busy
    }

    var body: some View {
        Form {
            Section {
                Text("Acceso heredado del portal. Úsalo sólo si el acceso normal "
                     + "no reconoce la cuenta de cliente o de sucursal.")
                    .font(.footnote).foregroundColor(.secondary)
            }

            if let error {
                Section { Text(error).foregroundColor(.red).font(.footnote) }
            }
            if let okMessage {
                Section { Text(okMessage).foregroundColor(.green).font(.footnote) }
            }

            Section("Tipo de cuenta") {
                Picker("Tipo", selection: $kind) {
                    ForEach(Kind.allCases) { k in Text(k.label).tag(k) }
                }
                .pickerStyle(.segmented)
            }

            Section("Credenciales") {
                TextField("Correo", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Contraseña", text: $password)
                    .textContentType(.password)
            }

            Section {
                Button(busy ? "Entrando…" : "Entrar") { Task { await submit() } }
                    .disabled(!canSubmit)
                Button("Probar ambos (como Android)") { Task { await submitFallbackChain() } }
                    .disabled(!canSubmit)
            } footer: {
                Text("«Probar ambos» intenta cliente y, si falla, sucursal — "
                     + "la misma cadena que hace la app de Android.")
                    .font(.caption)
            }
        }
        .navigationTitle("Acceso heredado")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func submit() async {
        busy = true; error = nil; okMessage = nil
        defer { busy = false }
        do {
            // `if/else` y no ternario: Swift rechaza `try` a la derecha de un
            // operador que no sea de asignación.
            let user: SessionUser
            if kind == .client {
                user = try await PortalExtraRepository.shared
                    .clientLoginLegacy(email: email, password: password)
            } else {
                user = try await PortalExtraRepository.shared
                    .branchLoginLegacy(email: email, password: password)
            }
            okMessage = "Sesión iniciada como \(user.nombre)"
            onSignedIn?()
        } catch {
            self.error = error.toUserMessage()
        }
    }

    private func submitFallbackChain() async {
        busy = true; error = nil; okMessage = nil
        defer { busy = false }
        do {
            let user = try await PortalExtraRepository.shared
                .portalLoginLegacyFallback(email: email, password: password)
            okMessage = "Sesión iniciada como \(user.nombre)"
            onSignedIn?()
        } catch {
            self.error = error.toUserMessage()
        }
    }
}
