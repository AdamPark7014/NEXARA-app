import SwiftUI

/// Mi perfil (`/erp/my-profile`): identidad, bloqueo de la app, cola sin
/// conexión y cierre de sesión.
struct MyProfileView: View {
    @EnvironmentObject var session: SessionStore
    @State private var appLockEnabled = AppLock.isEnabled
    @State private var confirmLogout = false

    var body: some View {
        List {
            if let u = session.currentUser {
                Section("Identidad") {
                    row("Nombre", u.nombre)
                    row("Email", u.email)
                    if let r = u.role { row("Rol", r) }
                    if let d = u.department { row("Departamento", d) }
                }
                Section("Seguridad") {
                    Toggle(isOn: $appLockEnabled) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Bloqueo de app")
                            Text(
                                AppLock.isAvailable
                                    ? "Biometría o código al volver"
                                    : "No disponible en este dispositivo"
                            )
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
            } else {
                Text("Sin sesión activa").foregroundColor(.secondary)
            }
        }
        .navigationTitle("Mi perfil")
        .confirmationDialog("¿Cerrar sesión?", isPresented: $confirmLogout, titleVisibility: .visible) {
            Button("Cerrar sesión", role: .destructive) { AuthRepository.shared.logout() }
            Button("Cancelar", role: .cancel) {}
        }
    }

    @ViewBuilder private func row(_ label: String, _ value: String) -> some View {
        HStack { Text(label).foregroundColor(.secondary); Spacer(); Text(value) }
    }
}
