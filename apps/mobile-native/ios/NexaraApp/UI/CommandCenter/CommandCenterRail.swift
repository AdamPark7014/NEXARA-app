import SwiftUI

struct CommandWidget: Identifiable, Hashable {
    let id: String
    let label: String
    let moduleKey: String
    let icon: String
    let hint: String

    init(_ id: String, _ label: String, _ moduleKey: String, _ icon: String, _ hint: String = "") {
        self.id = id
        self.label = label
        self.moduleKey = moduleKey
        self.icon = icon
        self.hint = hint
    }
}

enum CommandPanelFilter {
    case ops, crm, erp, all
}

enum CommandCenterAccess {
    private static let roleWidgets: [String: [CommandWidget]] = [
        "ceo": [
            CommandWidget("executive", "Vista ejecutiva", "executive", "📊", "KPIs globales"),
            CommandWidget("approvals", "Aprobaciones", "approvals", "✅", "Pendientes"),
            CommandWidget("dispatch", "Despacho", "dispatch", "🗺️", "OT en campo"),
            CommandWidget("crm-dash", "Pipeline", "pipeline", "💼", "Comercial"),
            CommandWidget("notifications", "Notificaciones", "notifications-center", "🔔"),
            CommandWidget("feed", "Actividad reciente", "notifications-center", "📡", "Feed global"),
        ],
        "ops_manager": [
            CommandWidget("dispatch", "Centro de despacho", "dispatch", "🗺️"),
            CommandWidget("ops-dash", "Hoy en OPS", "dashboard", "🚀"),
            CommandWidget("activities", "Todas las OT", "activities", "📋"),
            CommandWidget("gps", "GPS en vivo", "gps", "📍"),
            CommandWidget("noc", "NOC", "noc", "📡"),
            CommandWidget("support", "Soporte", "support", "🎫"),
        ],
        "field": [
            CommandWidget("my-activities", "Mis OT", "my-activities", "🧰"),
            CommandWidget("my-evidences", "Mis evidencias", "my-evidences", "📷"),
            CommandWidget("my-viatics", "Mis viáticos", "my-viatics", "💸"),
            CommandWidget("tools", "Herramientas", "tools", "🛠️"),
            CommandWidget("chat", "Chat equipo", "chat", "💬"),
        ],
        "sales": [
            CommandWidget("crm-dash", "Mi pipeline", "pipeline", "💼"),
            CommandWidget("quotes", "Cotizaciones", "cotizaciones", "📄"),
            CommandWidget("smart-quote", "Cotizador inteligente", "cotizaciones", "✨"),
            CommandWidget("clients", "Clientes 360", "clients", "👥"),
            CommandWidget("agenda", "Agenda", "calendar", "📅"),
            CommandWidget("crm-chat", "Chat comercial", "chat", "💬"),
        ],
        "default": [
            CommandWidget("erp-dash", "Resumen ERP", "dashboard", "🏠"),
            CommandWidget("chat", "Chat", "chat", "💬"),
            CommandWidget("notifications", "Notificaciones", "notifications-center", "🔔"),
        ],
    ]

    static func widgets(for user: SessionUser?) -> [CommandWidget] {
        roleWidgets[bucket(for: user)] ?? roleWidgets["default"]!
    }

    static func filter(_ widgets: [CommandWidget], panel: CommandPanelFilter) -> [CommandWidget] {
        guard panel != .all else { return widgets }
        let keys: Set<String>
        switch panel {
        case .ops:
            keys = ["dispatch", "dashboard", "activities", "my-activities", "my-evidences",
                    "my-viatics", "tools", "gps", "noc", "support"]
        case .crm:
            keys = ["pipeline", "cotizaciones", "clients", "calendar", "leads", "chat"]
        case .erp:
            keys = ["executive", "approvals", "invoicing", "procurement", "warehouse",
                    "notifications-center", "bi", "dashboard", "chat"]
        case .all:
            keys = []
        }
        return widgets.filter { keys.contains($0.moduleKey) }
    }

    static func merge(extra: [CommandWidget], base: [CommandWidget]) -> [CommandWidget] {
        var seen = Set<String>()
        return (extra + base).filter { seen.insert($0.id).inserted }
    }

    static func buildExecutiveDynamicWidgets(_ data: ExecutiveCLevel) -> [CommandWidget] {
        var widgets: [CommandWidget] = []
        let ops = data.operations
        let proc = data.raw["procurement"] as? [String: Any]
        let sales = data.raw["sales"] as? [String: Any]
        let pendingReq = Int(StockParse.dbl(proc?["pendingRequisitions"]) ?? 0)
        let lowStock = Int(StockParse.dbl(proc?["lowStockItems"]) ?? 0)
        let hotLeads = Int(StockParse.dbl(sales?["hotLeads"]) ?? 0)
        let finance = data.raw["finance"] as? [String: Any]
        let overdueInvoices = Int(StockParse.dbl(finance?["overdueInvoices"]) ?? 0)

        if ops.otOverdue > 0 {
            widgets.append(CommandWidget("dyn-ot-overdue", "\(ops.otOverdue) OT vencidas", "dispatch", "⚠️", "Centro de despacho"))
        }
        if ops.ticketsOpen > 5 {
            widgets.append(CommandWidget("dyn-tickets", "\(ops.ticketsOpen) tickets abiertos", "support", "🎫", "Bandeja de soporte"))
        }
        if overdueInvoices > 0 {
            widgets.append(CommandWidget("dyn-ar-overdue", "\(overdueInvoices) facturas vencidas", "invoicing", "💳", "Cobranza"))
        }
        if pendingReq > 0 {
            widgets.append(CommandWidget("dyn-req", "\(pendingReq) requisiciones", "procurement", "📦", "Compras"))
        }
        if lowStock > 0 {
            widgets.append(CommandWidget("dyn-stock", "\(lowStock) SKUs críticos", "warehouse", "📉", "Almacén"))
        }
        if hotLeads >= 3 {
            widgets.append(CommandWidget("dyn-leads", "\(hotLeads) leads calientes", "leads", "🔥", "Pipeline comercial"))
        }
        let critical = data.alerts.filter { $0.title.localizedCaseInsensitiveContains("crít") }.count
        if critical > 0 {
            widgets.append(CommandWidget("dyn-alerts", "\(critical) alertas críticas", "notifications-center", "🚨", "Centro de notificaciones"))
        }
        return widgets
    }

    static func buildExecutiveDrillLinks() -> [CommandWidget] {
        [
            CommandWidget("drill-dispatch", "Despacho OT", "dispatch", "🗺️", "Tablero de campo"),
            CommandWidget("drill-bi", "Business Intelligence", "bi", "🧠", "Análisis BI"),
            CommandWidget("drill-pipeline", "Pipeline comercial", "pipeline", "🎯", "Ventas"),
            CommandWidget("drill-invoicing", "Facturación", "invoicing", "💳", "Cobranza"),
        ]
    }

    private static func bucket(for user: SessionUser?) -> String {
        guard let user else { return "default" }
        if user.isSuperAdmin { return "ceo" }
        let r = (user.role ?? "").lowercased()
        if r.contains("ceo") || r.contains("arquitecto") || r == "super_admin" { return "ceo" }
        if r.contains("dir_operaciones")
            || (r.contains("director") && r.contains("operacion"))
            || r.contains("coord_operaciones")
            || (r.contains("coord") && r.contains("operacion"))
            || r.contains("ing_soporte")
            || (r.contains("soporte") && r.contains("ing")) {
            return "ops_manager"
        }
        if r.contains("ing_campo") || (r.contains("ingenier") && r.contains("campo")) { return "field" }
        if r.contains("vendedor")
            || r.contains("coord_ventas")
            || (r.contains("coord") && r.contains("ventas"))
            || r.contains("dir_admin")
            || (r.contains("director") && r.contains("admin")) {
            return "sales"
        }
        return "default"
    }
}

struct CommandCenterRail: View {
    let widgets: [CommandWidget]
    var onOpenModule: ((String) -> Void)? = nil
    var useNavigationLinks: Bool = false
    var title: String = "Accesos rápidos"

    var body: some View {
        if widgets.isEmpty { EmptyView() }
        else {
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(.subheadline.weight(.semibold))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(widgets) { w in
                            chip(for: w)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func chip(for w: CommandWidget) -> some View {
        let label = Text("\(w.icon) \(w.label)")
            .font(.caption.weight(.medium))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(Capsule())

        if useNavigationLinks {
            NavigationLink(value: w.moduleKey) { label }
                .buttonStyle(.plain)
                .accessibilityLabel(w.hint.isEmpty ? w.label : "\(w.label). \(w.hint)")
        } else if let onOpenModule {
            Button { onOpenModule(w.moduleKey) } label: { label }
                .buttonStyle(.plain)
                .accessibilityLabel(w.hint.isEmpty ? w.label : "\(w.label). \(w.hint)")
        }
    }
}

extension CommandCenterRail {
    init(
        user: SessionUser?,
        panel: CommandPanelFilter = .all,
        extraWidgets: [CommandWidget] = [],
        onOpenModule: ((String) -> Void)? = nil,
        useNavigationLinks: Bool = false,
        title: String = "Accesos rápidos"
    ) {
        let base = CommandCenterAccess.filter(CommandCenterAccess.widgets(for: user), panel: panel)
        self.init(
            widgets: CommandCenterAccess.merge(extra: extraWidgets, base: base),
            onOpenModule: onOpenModule,
            useNavigationLinks: useNavigationLinks,
            title: title
        )
    }
}
