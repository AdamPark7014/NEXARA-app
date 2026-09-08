import SwiftUI

/// Ficha de identidad de un usuario — el equivalente móvil del cajón lateral de
/// `/erp/users` en la web.
///
/// **Sólo lectura, y a propósito.** La web añade aquí seis escrituras —
/// activar/desactivar, editar campos de RR. HH., desbloquear, revocar sesiones,
/// cambiar el jefe y borrar datos personales— que están pendientes de
/// autorización del dueño. En vez de esconderlas sin más, la pantalla dice al
/// pie qué se hace desde la consola web: no encontrar el botón y no saber por
/// qué es peor que saber que no está.
struct UsersDetailView: View {
    let userId: Int64
    /// Nombre ya conocido por la lista, para pintar el título antes de que
    /// llegue el detalle.
    var fallbackName: String = ""

    @StateObject private var vm = UsersDetailVM()
    @State private var tab = 0

    private let tabs = ["Ficha", "Sesiones", "Actividad", "Bitácora"]

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                ForEach(0..<tabs.count, id: \.self) { index in Text(tabs[index]).tag(index) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.bottom, 6)

            switch tab {
            case 1: sessionsTab
            case 2: activityTab
            case 3: auditTab
            default: profileTab
            }
        }
        .navigationTitle(vm.detail?.displayName ?? (fallbackName.isEmpty ? "Usuario" : fallbackName))
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await vm.load(userId: userId) }
        .task { await vm.load(userId: userId) }
    }

    // MARK: Ficha

    private var profileTab: some View {
        List {
            if vm.isLoading && vm.detail == nil { ProgressView() }
            if let error = vm.errorText {
                Text(error).font(.footnote).foregroundColor(.red)
            }

            if let user = vm.detail {
                Section {
                    HStack {
                        Text(user.displayName).font(.headline)
                        Spacer()
                        UsersStateTag(text: user.isActive ? "Activo" : "Inactivo",
                                      color: user.isActive ? .green : .secondary)
                    }
                    if user.isLocked {
                        UsersStateTag(text: "Cuenta bloqueada", color: .red)
                    }
                    if user.isAnonymized {
                        UsersStateTag(text: "Datos personales borrados", color: .secondary)
                    }
                }

                Section("Identidad") {
                    usersRow("Correo", user.email)
                    usersRow("Teléfono", user.telefono)
                    usersRow("Rol", user.roleName)
                    usersRow("Plantilla de rol", user.orgRoleKey)
                    usersRow("Departamento", user.departmentName)
                    usersRow("Jefe directo", user.managerName)
                }

                Section("RR. HH.") {
                    usersRow("Número de empleado", user.employeeNumber)
                    usersRow("Puesto", user.puesto)
                    usersRow("Tipo de contrato", user.tipoContrato)
                    usersRow("Estado RR. HH.", user.estadoRRHH)
                    usersRow("Fecha de ingreso", String(user.fechaIngreso.prefix(10)))
                }

                Section("Seguridad") {
                    usersRow("Segundo factor", user.mfaEnabled ? "Activo" : "Sin MFA")
                    usersRow("Último acceso", usersStamp(user.lastLoginAt))
                    if user.failedLoginCount > 0 {
                        usersRow("Intentos fallidos", "\(user.failedLoginCount)")
                    }
                    if user.isLocked {
                        usersRow("Bloqueado hasta", usersStamp(user.lockedUntil))
                    }
                }

                accessScheduleSection

                Section {
                    Text("""
                    Desde el teléfono esta ficha sólo se consulta. Activar o \
                    desactivar la cuenta, cambiar el rol o los campos de RR. HH., \
                    desbloquear, revocar sesiones y borrar datos personales se \
                    hacen desde la consola web.
                    """)
                    .font(.caption)
                    .foregroundColor(.secondary)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder
    private var accessScheduleSection: some View {
        if let schedule = vm.schedule, !schedule.isEmpty {
            Section("Horario de acceso INTEGRA") {
                usersRow("Plantilla", schedule.label)
                usersRow("Horario", schedule.timeRange)
                usersRow("Puertas", schedule.doorScope)
                usersRow("Número de empleado", schedule.employeeNumber)
                if !schedule.targetIps.isEmpty {
                    usersRow("Terminales", schedule.targetIps.joined(separator: ", "))
                }
                if !schedule.hint.isEmpty {
                    Text(schedule.hint).font(.caption).foregroundColor(.secondary)
                }
                // El API lo calcula a partir del rol; el editor semanal vive en
                // INTEGRA y esto es sólo la vista previa.
                Text("Vista previa calculada por el servidor. Se edita en INTEGRA.")
                    .font(.caption2).foregroundColor(.secondary)
            }
        }
    }

    // MARK: Sesiones

    private var sessionsTab: some View {
        List {
            if vm.isLoadingSessions { ProgressView() }
            if vm.sessions.isEmpty && !vm.isLoadingSessions {
                Text("Sin sesiones registradas").foregroundColor(.secondary)
            }
            ForEach(vm.sessions) { session in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(session.displayDevice).font(.subheadline.bold())
                        Spacer()
                        UsersStateTag(text: session.statusLabel,
                                      color: session.isLive ? .green : .secondary)
                    }
                    if !session.ipAddress.isEmpty {
                        Text("IP \(session.ipAddress)").font(.caption2).foregroundColor(.secondary)
                    }
                    if !session.lastSeenAt.isEmpty {
                        Text("Visto \(usersStamp(session.lastSeenAt))")
                            .font(.caption2).foregroundColor(.secondary)
                    }
                    if !session.expiresAt.isEmpty {
                        Text("Caduca \(usersStamp(session.expiresAt))")
                            .font(.caption2).foregroundColor(.secondary)
                    }
                    if !session.revokeReason.isEmpty {
                        Text("Motivo: \(session.revokeReason)")
                            .font(.caption2).foregroundColor(.secondary)
                    }
                }
                .padding(.vertical, 2)
            }
            Section {
                Text("Revocar la sesión de otra persona requiere autorización del dueño; se hace desde la consola web.")
                    .font(.caption).foregroundColor(.secondary)
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: Actividad de acceso

    private var activityTab: some View {
        List {
            if vm.isLoadingActivity { ProgressView() }
            if vm.activity.isEmpty && !vm.isLoadingActivity {
                Text("Sin actividad de acceso").foregroundColor(.secondary)
            }
            ForEach(vm.activity) { entry in
                HStack(alignment: .top) {
                    Circle()
                        .fill(entry.isFailure ? Color.red : Color.green)
                        .frame(width: 7, height: 7)
                        .padding(.top, 6)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.actionLabel).font(.subheadline)
                        Text([usersStamp(entry.createdAt), entry.ipAddress]
                            .filter { !$0.isEmpty }
                            .joined(separator: " · "))
                            .font(.caption2).foregroundColor(.secondary)
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: Bitácora

    private var auditTab: some View {
        List {
            if vm.isLoadingAudit { ProgressView() }
            if vm.audit.isEmpty && !vm.isLoadingAudit {
                Text("Sin movimientos en la bitácora").foregroundColor(.secondary)
            }
            ForEach(vm.audit) { entry in
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.action.isEmpty ? "Movimiento" : entry.action)
                        .font(.subheadline.bold())
                    let target = [entry.entityType, entry.entityId]
                        .filter { !$0.isEmpty }
                        .joined(separator: " #")
                    if !target.isEmpty {
                        Text(target).font(.caption2).foregroundColor(.secondary)
                    }
                    if !entry.createdAt.isEmpty {
                        Text(usersStamp(entry.createdAt)).font(.caption2).foregroundColor(.secondary)
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func usersRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack {
                Text(label).foregroundColor(.secondary)
                Spacer()
                Text(value).multilineTextAlignment(.trailing)
            }
        }
    }
}

/// Etiqueta de estado reutilizada por las pestañas de esta pantalla.
struct UsersStateTag: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption2).bold()
            .foregroundColor(color)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
    }
}

/// `2026-09-08T11:04:22.145Z` → `2026-09-08 11:04`. Sin esto la lista de
/// sesiones es una columna de marcas ISO ilegibles.
func usersStamp(_ iso: String) -> String {
    guard !iso.isEmpty else { return "" }
    let head = String(iso.prefix(16))
    return head.replacingOccurrences(of: "T", with: " ")
}

// MARK: – ViewModel

@MainActor
final class UsersDetailVM: ObservableObject {
    @Published var detail: UserAdminDetail?
    @Published var schedule: UserAccessSchedule?
    @Published var sessions: [UserSessionInfo] = []
    @Published var activity: [UserAuthActivity] = []
    @Published var audit: [AuditEntry] = []

    @Published var isLoading = false
    @Published var isLoadingSessions = false
    @Published var isLoadingActivity = false
    @Published var isLoadingAudit = false
    @Published var errorText: String?

    /// Todo se pide a la vez. Son cinco llamadas independientes y encadenarlas
    /// haría esperar cuatro viajes de red antes de pintar la primera pestaña.
    func load(userId: Int64) async {
        guard userId > 0 else {
            errorText = "Identificador de usuario inválido"
            return
        }
        isLoading = true
        isLoadingSessions = true
        isLoadingActivity = true
        isLoadingAudit = true
        errorText = nil

        let repo = UsersAdminRepository.shared

        async let detailTask = repo.user(id: userId)
        async let scheduleTask = repo.integraAccessSchedule(userId: userId)
        async let sessionsTask = repo.sessions(userId: userId)
        async let activityTask = repo.authActivity(userId: userId)
        async let auditTask = repo.auditTrail(userId: userId)

        // Cada bloque se degrada solo: sin permiso para la bitácora la pestaña
        // sale vacía, pero la ficha se sigue viendo.
        let loadedDetail = try? await detailTask
        detail = loadedDetail
        schedule = try? await scheduleTask
        sessions = (try? await sessionsTask) ?? []
        activity = (try? await activityTask) ?? []
        audit = (try? await auditTask) ?? []

        if loadedDetail == nil {
            // Sin la ficha no hay pantalla; el resto es complemento.
            errorText = "No se pudo cargar la ficha del usuario (requiere users.manage)."
        }

        isLoading = false
        isLoadingSessions = false
        isLoadingActivity = false
        isLoadingAudit = false
    }
}
