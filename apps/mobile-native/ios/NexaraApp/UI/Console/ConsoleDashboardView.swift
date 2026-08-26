import SwiftUI

// MARK: – ViewModel

@MainActor
final class ConsoleDashboardVM: ObservableObject {
    @Published var activities:  [ActivityItem] = []
    @Published var viatics:     [ViaticItem] = []
    @Published var attendance:  [AttendanceEvent] = []
    @Published var executive:   [String: Any]   = [:]
    @Published var approvals:   [WorkflowApproval] = []
    @Published var nocAlerts:   [NocAlert] = []
    @Published var isLoading   = false
    @Published var error: String?

    func load(isOps: Bool = false) {
        isLoading = true; error = nil
        Task {
            async let acts  = ExtraRepository.shared.activityItems()
            async let viats = ExtraRepository.shared.viaticItems()
            async let atts  = ExtraRepository.shared.attendanceEventItems()
            async let exec  = ExtraRepository.shared.executiveCLevel()
            async let appr  = ExtraRepository.shared.workflowApprovals()
            activities = await acts
            viatics    = await viats
            attendance = await atts
            executive  = await exec
            approvals  = await appr
            if isOps {
                nocAlerts = await ExtraRepository.shared.nocAlertItems()
            }
            isLoading  = false
        }
    }
}

// MARK: – Main view

struct ConsoleDashboardView: View {
    var isOps: Bool = false
    var panel: PanelId = .erp

    @StateObject private var vm = ConsoleDashboardVM()
    @EnvironmentObject var session: SessionStore

    private var user: SessionUser? { session.currentUser }
    private var isAdmin: Bool { user?.isSuperAdmin == true || user?.permissions.contains("erp.admin") == true }
    private var canFinance: Bool { user?.permissions.contains("finance.view") == true || isAdmin }
    private var isAdministrativo: Bool { ConsoleAccessRules.isAdministrativoRole(user) }

    var body: some View {
        Group {
            if vm.isLoading && vm.activities.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            } else if let err = vm.error {
                VStack(spacing: 12) {
                    Text("No se pudo cargar").font(.headline)
                    Text(err).font(.footnote).foregroundColor(.secondary)
                    Button("Reintentar") { vm.load(isOps: isOps) }.buttonStyle(.bordered)
                }.padding()
            } else {
                dashContent
            }
        }
        .navigationTitle(isOps ? "OPS · Dashboard" : "Dashboard")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { vm.load(isOps: isOps) } label: { Image(systemName: "arrow.clockwise") }
            }
        }
        .refreshable { vm.load(isOps: isOps) }
        .task { vm.load(isOps: isOps) }
        .navigationDestination(for: String.self) { key in
            ModuleRouter.view(for: panel, key: key)
        }
    }

    private var dashContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                headerSection
                if !vm.executive.isEmpty {
                    CommandCenterRail(
                        user: user,
                        panel: isOps ? .ops : .all,
                        extraWidgets: CommandCenterAccess.buildExecutiveDynamicWidgets(
                            ExecutiveCLevel(raw: vm.executive)
                        ),
                        useNavigationLinks: true,
                        title: "Centro de comando"
                    )
                    .padding(.horizontal)
                }
                actionableAlertsSection
                if isAdministrativo { administrativoShortcuts }
                if isOps && !vm.nocAlerts.isEmpty { nocAlertsSection }
                if !vm.executive.isEmpty && (isAdmin || isAdministrativo) { executiveKpiSection }
                if !vm.approvals.isEmpty { approvalsSection }
                if !isAdministrativo {
                    operationsKpiSection
                    if !vm.activities.isEmpty { statusBreakdownSection }
                    recentActivitiesSection
                    if !vm.viatics.isEmpty { recentViaticsSection }
                }
                Spacer(minLength: 24)
            }
            .padding(.vertical)
        }
    }

    private var administrativoShortcuts: some View {
        VStack(alignment: .leading, spacing: 10) {
            DashSectionHeader(title: "Atajos", detail: "Acceso rápido").padding(.horizontal)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                adminShortcut("approvals", "🛡️", "Aprobaciones", "Firma y autorización")
                adminShortcut("documents", "📂", "Documentos", "Archivos corporativos")
                adminShortcut("viatics", "✈️", "Viáticos", "Solicitudes y reembolsos")
                adminShortcut("expenses", "💳", "Gastos", "Gastos corporativos")
                adminShortcut("calendar", "📅", "Calendario", "Agenda corporativa")
                adminShortcut("companies", "🏛️", "Empresas", "Grupo empresarial")
            }
            .padding(.horizontal)
        }
    }

    @ViewBuilder
    private func adminShortcut(_ key: String, _ icon: String, _ title: String, _ subtitle: String) -> some View {
        NavigationLink(value: key) {
            VStack(alignment: .leading, spacing: 6) {
                Text(icon).font(.title2)
                Text(title).font(.subheadline).bold()
                Text(subtitle).font(.caption2).foregroundColor(.secondary).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    // ── NOC Alerts (OPS panel only)
    private var nocAlertsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            DashSectionHeader(title: "📡 Alertas NOC", detail: "\(vm.nocAlerts.count) activas").padding(.horizontal)
            ForEach(vm.nocAlerts.prefix(6)) { alert in
                let severity = alert.severity
                let device = alert.deviceName
                let msg = alert.message.isEmpty ? alert.displayTitle : alert.message
                let color: Color = alert.isCritical ? .red
                                 : alert.isWarningBand ? .orange
                                 : .blue
                let icon = color == .red ? "🔴" : color == .orange ? "🟡" : "🔵"
                HStack(spacing: 12) {
                    Text(icon).font(.title3)
                    VStack(alignment: .leading, spacing: 2) {
                        if !device.isEmpty { Text(device).font(.caption).foregroundColor(.secondary) }
                        Text(msg.isEmpty ? "Alerta" : msg).font(.subheadline).bold().lineLimit(2)
                    }
                    Spacer()
                    Text(severity.isEmpty ? "info" : severity)
                        .font(.caption2).bold().foregroundColor(color)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(color.opacity(0.12)).clipShape(Capsule())
                }
                .padding(12)
                .background(color.opacity(0.07))
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .padding(.horizontal)
            }
        }
    }

    // ── Header
    private var headerSection: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                if let name = user?.nombre {
                    Text("Hola, \(name.components(separatedBy: " ").first ?? name)")
                        .font(.title2).bold()
                }
                Text("Semana: \(dashWeekRange())").font(.caption).foregroundColor(.secondary)
                if let role = user?.role {
                    Text(role.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.caption2).foregroundColor(.secondary)
                }
            }
            Spacer()
            if !vm.approvals.isEmpty {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: "bell.fill").font(.title2).foregroundColor(.orange)
                    Text("\(vm.approvals.count)")
                        .font(.caption2).bold().foregroundColor(.white)
                        .padding(4).background(Color.red).clipShape(Circle())
                        .offset(x: 6, y: -6)
                }
            }
        }
        .padding(.horizontal)
    }

    // ── Executive KPIs (solo para admin/finance)
    @ViewBuilder
    private var executiveKpiSection: some View {
        let revenue  = dblExec("revenue", "totalRevenue", "ingresos")
        let projects = intExec("activeProjects", "proyectosActivos")
        let engineers = intExec("activeEngineers", "ingenieros", "activeUsers")
        let clients  = intExec("activeClients", "clientesActivos", "clients")
        VStack(alignment: .leading, spacing: 10) {
            DashSectionHeader(title: "Resumen ejecutivo", detail: "Este período").padding(.horizontal)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                DashKpiCard(icon: "💰", label: "Ingresos", value: fmtMxn(revenue ?? 0), detail: "Acumulado", accent: .green)
                DashKpiCard(icon: "🧩", label: "Proyectos", value: "\(projects ?? vm.activities.count)", detail: "Activos", accent: .blue)
                DashKpiCard(icon: "👷", label: "Ingenieros", value: "\(engineers ?? Set(vm.attendance.map(\.userName)).count)", detail: "En campo", accent: .orange)
                DashKpiCard(icon: "🤝", label: "Clientes", value: "\(clients ?? 0)", detail: "Activos", accent: .teal)
            }
            .padding(.horizontal)
        }
    }

    // ── Pending approvals
    private var approvalsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            DashSectionHeader(title: "Aprobaciones pendientes", detail: "\(vm.approvals.count) esperando").padding(.horizontal)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(vm.approvals.prefix(8)) { a in
                        ApprovalCard(item: a) { approved in
                            Task {
                                try? await ExtraRepository.shared.workflowDecide(
                                    id: a.id,
                                    decision: approved ? "APPROVED" : "REJECTED"
                                )
                                vm.load(isOps: isOps)
                            }
                        }
                    }
                }
                .padding(.horizontal)
            }
        }
    }

    // ── Operations KPIs
    private var actionableAlertsSection: some View {
        let actPending = vm.activities.filter { dashIsPending($0.status) }.count
        let viaticPend = vm.viatics.filter { $0.displayStatus.localizedLowercase.contains("pendiente") }.count
        var alerts: [NxAlert] = []
        if !vm.approvals.isEmpty {
            alerts.append(NxAlert(
                id: "approvals",
                title: "\(vm.approvals.count) aprobaciones esperando decisión",
                subtitle: "Retrasan pagos, viáticos y liberaciones",
                tone: .danger
            ))
        }
        if viaticPend > 0 {
            alerts.append(NxAlert(
                id: "viatics",
                title: "\(viaticPend) viáticos sin liquidar",
                subtitle: "Impacta flujo de caja y campo",
                tone: .warning
            ))
        }
        if actPending > 0 && !isAdministrativo {
            alerts.append(NxAlert(
                id: "activities",
                title: "\(actPending) actividades en curso / pendientes",
                subtitle: "Prioriza backlog de campo",
                tone: .info
            ))
        }
        if isOps && !vm.nocAlerts.isEmpty {
            alerts.append(NxAlert(
                id: "noc",
                title: "\(vm.nocAlerts.count) alertas NOC activas",
                subtitle: "Monitoreo de servicio",
                tone: .danger
            ))
        }
        return Group {
            if !alerts.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    NxSectionHeader(title: "Alertas", subtitle: "\(alerts.count) requieren atención")
                        .padding(.horizontal)
                    ForEach(alerts) { alert in
                        NxAlertBanner(alert: alert).padding(.horizontal)
                    }
                }
            }
        }
    }

    private var operationsKpiSection: some View {
        let actTotal   = vm.activities.count
        let actPending = vm.activities.filter { dashIsPending($0.status) }.count
        let actDone    = vm.activities.filter { dashIsDone($0.status) }.count
        let viaticAmt  = vm.viatics.reduce(0) { $0 + $1.montoSolicitado }
        let viaticPend = vm.viatics.filter { $0.displayStatus.localizedLowercase.contains("pendiente") }.count
        let attCount   = vm.attendance.count
        let completion = actTotal > 0 ? (actDone * 100 / actTotal) : 0
        let spark = sparklineFromCounts([
            Int(Double(actTotal) * 0.4),
            Int(Double(actTotal) * 0.55),
            Int(Double(actTotal) * 0.7),
            Int(Double(actTotal) * 0.85),
            actPending,
            actDone,
            actTotal,
        ])

        return VStack(alignment: .leading, spacing: 10) {
            NxSectionHeader(title: "Operación de la semana", subtitle: "KPIs + tendencia")
                .padding(.horizontal)
            NxKpiGrid(items: [
                NxKpi(label: "Actividades", value: "\(actTotal)",
                      hint: "\(actPending) pendientes · \(actDone) hechas",
                      delta: "\(completion)% cierre", tone: .brand, sparkline: spark),
                NxKpi(label: "Viáticos", value: fmtMxn(viaticAmt),
                      hint: "\(viaticPend) por aprobar",
                      delta: "\(vm.viatics.count) solicitudes",
                      tone: viaticPend > 0 ? .warning : .info),
                NxKpi(label: "Asistencia", value: "\(attCount) reg.",
                      hint: "\(Set(vm.attendance.map(\.userName)).count) personas",
                      tone: .success),
                NxKpi(label: "Aprobaciones", value: "\(vm.approvals.count)",
                      hint: "Cola de workflow",
                      delta: vm.approvals.isEmpty ? "Al día" : "Requieren acción",
                      tone: vm.approvals.isEmpty ? .success : .danger),
            ])
            .padding(.horizontal)
        }
    }

    // ── Status breakdown
    private var statusBreakdownSection: some View {
        let groups = Dictionary(grouping: vm.activities) {
            $0.status.isEmpty ? "Sin estatus" : $0.status
        }.sorted { $0.value.count > $1.value.count }
        let total = vm.activities.count

        return VStack(alignment: .leading, spacing: 10) {
            DashSectionHeader(title: "Estado de actividades", detail: "\(total) total").padding(.horizontal)
            VStack(spacing: 10) {
                ForEach(groups.prefix(5), id: \.key) { key, list in
                    let pct = Double(list.count) / Double(max(total, 1))
                    DashStatusRow(status: key, count: list.count, percent: pct)
                }
            }
            .padding()
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal)
        }
    }

    // ── Recent activities
    private var recentActivitiesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            DashSectionHeader(title: "Actividades recientes", detail: "Últimas 8").padding(.horizontal)
            ForEach(vm.activities.prefix(8)) { a in
                DashActivityCard(item: a).padding(.horizontal)
            }
        }
    }

    // ── Recent viatics
    private var recentViaticsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            DashSectionHeader(title: "Viáticos recientes", detail: "\(vm.viatics.count) registros").padding(.horizontal)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(vm.viatics.prefix(10)) { v in
                        DashViaticCard(item: v)
                    }
                }
                .padding(.horizontal)
            }
        }
    }

    // ── Helpers for executive map
    private func dblExec(_ keys: String...) -> Double? {
        for k in keys { if let v = vm.executive[k], let d = asDouble(v) { return d } }
        return nil
    }
    private func intExec(_ keys: String...) -> Int? {
        for k in keys {
            if let v = vm.executive[k] {
                if let i = v as? Int { return i }
                if let n = v as? NSNumber { return n.intValue }
                if let d = asDouble(v) { return Int(d) }
            }
        }
        return nil
    }
}

// MARK: – Subviews

private struct DashKpiCard: View {
    let icon: String; let label: String; let value: String; let detail: String; let accent: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(icon).font(.title3)
                Text(label).font(.caption).foregroundColor(accent).lineLimit(1)
            }
            Text(value).font(.title2).bold()
            Text(detail).font(.caption2).foregroundColor(.secondary).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(accent.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct DashSectionHeader: View {
    let title: String; let detail: String
    var body: some View {
        HStack {
            Text(title).font(.headline)
            Spacer()
            Text(detail).font(.caption).foregroundColor(.secondary)
        }
    }
}

private struct DashStatusRow: View {
    let status: String; let count: Int; let percent: Double
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(status).font(.subheadline)
                Spacer()
                Text("\(count)  (\(Int(percent * 100))%)").font(.caption).foregroundColor(.secondary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3).fill(Color(.systemFill)).frame(height: 6)
                    RoundedRectangle(cornerRadius: 3)
                        .fill(dashStatusColor(status))
                        .frame(width: geo.size.width * CGFloat(max(0, min(percent, 1))), height: 6)
                }
            }
            .frame(height: 6)
        }
    }
}

private struct ApprovalCard: View {
    let item: WorkflowApproval
    var onDecide: ((Bool) -> Void)? = nil
    var body: some View {
        let urgency = item.urgencyLabel
        let color: Color = urgency.lowercased() == "alta" || urgency.lowercased() == "high" ? .red
                         : urgency.lowercased() == "media" ? .orange : .blue
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "shield.checkered").foregroundColor(color)
                Spacer()
                Text(urgency).font(.caption2).bold().foregroundColor(color)
                    .padding(.horizontal, 6).padding(.vertical, 2).background(color.opacity(0.12)).clipShape(Capsule())
            }
            Text(item.displayTitle).font(.subheadline).bold().lineLimit(2)
            if !item.requestedByName.isEmpty {
                Text("Por: \(item.requestedByName)").font(.caption).foregroundColor(.secondary)
            }
            if let onDecide {
                HStack {
                    Button("✓") { onDecide(true) }.buttonStyle(.borderedProminent).tint(.green)
                    Button("✕") { onDecide(false) }.buttonStyle(.bordered).tint(.red)
                }
            }
        }
        .frame(width: 200)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct DashActivityCard: View {
    let item: ActivityItem
    var body: some View {
        let status = item.status
        let color = dashStatusColor(status)
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 10).fill(color.opacity(0.15))
                .frame(width: 42, height: 42)
                .overlay(Image(systemName: "folder.fill").foregroundColor(color))
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title.isEmpty ? "Actividad" : item.title).font(.subheadline).bold().lineLimit(1)
                HStack(spacing: 6) {
                    Text(status.isEmpty ? "–" : status)
                        .font(.caption2).bold().foregroundColor(color)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(color.opacity(0.15)).clipShape(Capsule())
                    if !item.responsable.isEmpty {
                        Text("· \(item.responsable)").font(.caption).foregroundColor(.secondary).lineLimit(1)
                    }
                }
            }
            Spacer()
            let date = String(item.scheduledDate.prefix(10))
            if !date.isEmpty { Text(date).font(.caption2).foregroundColor(.secondary) }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct DashViaticCard: View {
    let item: ViaticItem
    var body: some View {
        let color = dashViaticColor(item.displayStatus)
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "banknote").font(.title2).foregroundColor(color)
            Text(fmtMxn(item.montoSolicitado)).font(.headline).bold()
            Text(item.displayConcept).font(.caption).foregroundColor(.secondary).lineLimit(2)
            Text(item.displayStatus.isEmpty ? "–" : item.displayStatus)
                .font(.caption2).bold().foregroundColor(color)
                .padding(.horizontal, 7).padding(.vertical, 2)
                .background(color.opacity(0.15)).clipShape(Capsule())
        }
        .frame(width: 160)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

// MARK: – Helpers (private to this file, prefixed to avoid conflicts)

private func dVal(_ m: [String: Any], _ keys: String...) -> String {
    for k in keys {
        if let v = m[k] {
            let str: String
            if let ss = v as? String { str = ss }
            else if let n = v as? NSNumber { str = n.stringValue }
            else { str = String(describing: v) }
            if !str.isEmpty && str != "null" { return str }
        }
    }
    return ""
}

private func dValOpt(_ m: [String: Any], _ keys: String...) -> String? {
    for k in keys {
        if let v = m[k] {
            let str: String
            if let ss = v as? String { str = ss }
            else if let n = v as? NSNumber { str = n.stringValue }
            else { str = String(describing: v) }
            if !str.isEmpty && str != "null" { return str }
        }
    }
    return nil
}

private func asDouble(_ v: Any?) -> Double? {
    if let d = v as? Double { return d }
    if let n = v as? NSNumber { return n.doubleValue }
    if let s = v as? String { return Double(s) }
    return nil
}

private func fmtMxn(_ v: Double) -> String {
    let n = NumberFormatter()
    n.numberStyle = .currency; n.currencySymbol = "$"; n.maximumFractionDigits = 0
    return n.string(from: NSNumber(value: v)) ?? "$\(Int(v))"
}

private func dashWeekRange() -> String {
    let cal = Calendar.current
    let today = Date()
    guard let monday = cal.dateInterval(of: .weekOfYear, for: today)?.start else { return "" }
    let sunday = cal.date(byAdding: .day, value: 6, to: monday)!
    let fmt = DateFormatter(); fmt.dateFormat = "d MMM"; fmt.locale = Locale(identifier: "es_MX")
    return "\(fmt.string(from: monday)) – \(fmt.string(from: sunday))"
}

private func dashIsPending(_ s: String) -> Bool {
    let l = s.localizedLowercase
    return l.contains("pendiente") || l.contains("proceso") || l.contains("asignad")
}
private func dashIsDone(_ s: String) -> Bool {
    let l = s.localizedLowercase
    return l.contains("finaliz") || l.contains("complet") || l.contains("aprobad")
}

private func dashStatusColor(_ s: String) -> Color {
    let l = s.localizedLowercase
    if l.contains("finaliz") || l.contains("complet") { return .green }
    if l.contains("proceso") || l.contains("progreso") { return .blue }
    if l.contains("pendiente") || l.contains("asignad") { return .orange }
    if l.contains("cancelad") || l.contains("rechazad") { return .red }
    return .purple
}

private func dashViaticColor(_ s: String) -> Color {
    let l = s.localizedLowercase
    if l.contains("aprobad") { return .green }
    if l.contains("pendiente") { return .orange }
    return Color.secondary
}

extension String {
    fileprivate func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}

extension [String: Any] {
    fileprivate var dashId: String {
        if let n = self["id"] as? Int { return String(n) }
        if let s = self["id"] as? String { return s }
        return UUID().uuidString
    }
}
