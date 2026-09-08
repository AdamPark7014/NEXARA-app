import SwiftUI

/// Identidad y acceso — `GET users/iam/insights`, más el catálogo de roles
/// (`GET roles`) y sus plantillas (`GET roles/org-templates`).
///
/// Es la capa analítica de `/erp/users` de la web, entera y de solo lectura.
/// Responde a las tres preguntas que se hacen desde el teléfono —«¿quién no ha
/// entrado nunca?», «¿quién está en riesgo?», «¿qué alcanza este rol?»— sin
/// dejar cambiar nada: crear roles y asignarlos requiere autorización del dueño.
struct UsersIamView: View {
    @StateObject private var vm = UsersIamVM()
    @State private var tab = 0

    private let tabs = ["Padrón", "Riesgo", "Roles"]

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                ForEach(0..<tabs.count, id: \.self) { index in Text(tabs[index]).tag(index) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.bottom, 6)

            switch tab {
            case 1: riskTab
            case 2: rolesTab
            default: overviewTab
            }
        }
        .navigationTitle("Identidad y acceso")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await vm.load() }
        .task { await vm.load() }
    }

    // MARK: Padrón

    private var overviewTab: some View {
        List {
            if vm.isLoading && vm.insights == nil { ProgressView() }
            if let error = vm.errorText {
                Text(error).font(.footnote).foregroundColor(.red)
            }

            if let data = vm.insights {
                if !data.alerts.isEmpty {
                    Section("Avisos") {
                        ForEach(data.alerts) { alert in
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: alert.isDanger
                                      ? "exclamationmark.triangle.fill"
                                      : "exclamationmark.circle")
                                    .foregroundColor(alert.isDanger ? .red : .orange)
                                Text(alert.message).font(.caption)
                            }
                        }
                    }
                }

                Section("Cuentas") {
                    iamRow("Total", "\(data.kpis.total)")
                    iamRow("Activas", "\(data.kpis.active)")
                    iamRow("Inactivas", "\(data.kpis.inactive)")
                    iamRow("Altas 30 d", "\(data.kpis.createdLast30d)")
                    iamRow("Nunca han entrado", "\(data.kpis.neverLoggedIn)")
                    iamRow("Sin entrar 30 d", "\(data.kpis.stale30d)")
                    iamRow("Bloqueadas", "\(data.kpis.locked)")
                }

                Section("Uso y seguridad") {
                    iamRow("Activas 7 d", "\(data.kpis.activeLast7d)")
                    iamRow("Activas 30 d", "\(data.kpis.activeLast30d)")
                    iamRow("Sesiones abiertas", "\(data.kpis.activeSessions)")
                    iamRow("Retención 30 d", String(format: "%.1f %%", data.kpis.retentionProxy30d))
                    iamRow("Con MFA", "\(data.kpis.mfaEnabled)")
                    iamRow("Cobertura MFA", String(format: "%.1f %%", data.kpis.mfaCoveragePct))
                    iamRow("En riesgo alto", "\(data.kpis.highRisk)")
                }

                if !data.byDepartment.isEmpty {
                    Section("Por departamento") {
                        ForEach(data.byDepartment.prefix(10)) { row in
                            iamRow(row.name, "\(row.count)")
                        }
                    }
                }

                if !data.byDevice.isEmpty {
                    Section("Por dispositivo") {
                        ForEach(data.byDevice.prefix(10)) { row in
                            iamRow(row.name, "\(row.count)")
                        }
                    }
                }

                if !data.loginsFailed14d.isEmpty {
                    Section("Accesos fallidos (14 d)") {
                        // El total del periodo es la cifra accionable; la serie
                        // día a día no se lee en una fila de lista.
                        iamRow("Total", "\(data.loginsFailed14d.reduce(0) { $0 + $1.count })")
                        iamRow("Correctos", "\(data.loginsSuccess14d.reduce(0) { $0 + $1.count })")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: Riesgo

    private var riskTab: some View {
        List {
            if let data = vm.insights, !data.riskTop.isEmpty {
                ForEach(data.riskTop) { item in
                    NavigationLink {
                        UsersDetailView(userId: item.id, fallbackName: item.displayName)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(item.displayName).font(.subheadline.bold())
                                Spacer()
                                UsersStateTag(text: item.levelLabel, color: riskColor(item.riskLevel))
                            }
                            Text("Puntuación \(String(format: "%.0f", item.riskScore))")
                                .font(.caption2).foregroundColor(.secondary)
                            if !item.riskFactors.isEmpty {
                                Text(item.riskFactors.joined(separator: " · "))
                                    .font(.caption2).foregroundColor(.secondary)
                            }
                        }
                    }
                }
            } else {
                Text(vm.isLoading ? "Cargando…" : "Sin usuarios en riesgo")
                    .foregroundColor(.secondary)
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: Roles

    private var rolesTab: some View {
        List {
            if !vm.roles.isEmpty {
                Section("Roles del tenant") {
                    ForEach(vm.roles) { role in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(role.displayName).font(.subheadline.bold())
                                Spacer()
                                if role.nivelAutoridad > 0 {
                                    Text("Nivel \(role.nivelAutoridad)")
                                        .font(.caption2).foregroundColor(.secondary)
                                }
                            }
                            if !role.orgRoleKey.isEmpty {
                                Text(role.orgRoleKey).font(.caption2).foregroundColor(.secondary)
                            }
                            if !role.grants.isEmpty {
                                Text(role.grants.joined(separator: " · "))
                                    .font(.caption2).foregroundColor(.secondary)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }

            if !vm.templates.isEmpty {
                Section("Plantillas organizativas") {
                    ForEach(vm.templates) { template in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(template.displayName).font(.subheadline.bold())
                            if !template.descripcion.isEmpty {
                                Text(template.descripcion).font(.caption).foregroundColor(.secondary)
                            }
                            if !template.departmentHint.isEmpty {
                                Text("Departamento sugerido: \(template.departmentHint)")
                                    .font(.caption2).foregroundColor(.secondary)
                            }
                            if !template.grants.isEmpty {
                                Text(template.grants.joined(separator: " · "))
                                    .font(.caption2).foregroundColor(.secondary)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }

            if vm.roles.isEmpty && vm.templates.isEmpty {
                Text(vm.isLoading ? "Cargando…" : "Sin catálogo de roles")
                    .foregroundColor(.secondary)
            }

            Section {
                Text("Crear roles y asignarlos a personas requiere autorización del dueño; se hace desde la consola web.")
                    .font(.caption).foregroundColor(.secondary)
            }
        }
        .listStyle(.insetGrouped)
    }

    private func riskColor(_ level: String) -> Color {
        switch level.lowercased() {
        case "high", "alto": return .red
        case "medium", "medio": return .orange
        default: return .secondary
        }
    }

    private func iamRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundColor(.secondary)
            Spacer()
            Text(value).bold()
        }
    }
}

// MARK: – ViewModel

@MainActor
final class UsersIamVM: ObservableObject {
    @Published var insights: IamInsights?
    @Published var roles: [RoleSummary] = []
    @Published var templates: [OrgRoleTemplate] = []
    @Published var isLoading = false
    @Published var errorText: String?

    func load() async {
        isLoading = true
        errorText = nil
        defer { isLoading = false }

        let repo = UsersAdminRepository.shared
        async let insightsTask = repo.iamInsights()
        async let rolesTask = repo.roleCatalog()
        async let templatesTask = repo.orgRoleTemplates()

        let loaded = try? await insightsTask
        insights = loaded
        // El catálogo de roles necesita `roles.manage` o equivalente; quien no
        // lo tenga ve el panel sin la pestaña llena, no un error.
        roles = (try? await rolesTask) ?? []
        templates = (try? await templatesTask) ?? []

        if loaded == nil {
            errorText = "No se pudo cargar el panel de identidad (requiere users.manage o console.admin)."
        }
    }
}
