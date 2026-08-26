import Foundation

struct ExecutiveHeadline: Hashable {
    let revenueMtd: Double
    let pipelineValue: Double
    let cashOnHand: Double
    let arOutstanding: Double

    init(raw: [String: Any]) {
        revenueMtd = StockParse.dbl(raw["revenueMtd"], raw["revenue"]) ?? 0
        pipelineValue = StockParse.dbl(raw["pipelineValue"], raw["pipeline"]) ?? 0
        cashOnHand = StockParse.dbl(raw["cashOnHand"], raw["cash"]) ?? 0
        arOutstanding = StockParse.dbl(raw["arOutstanding"], raw["accountsReceivable"]) ?? 0
    }
}

struct ExecutiveOps: Hashable {
    let otOpen: Int
    let otOverdue: Int
    let ticketsOpen: Int

    init(raw: [String: Any]) {
        otOpen = Int(StockParse.dbl(raw["otOpen"]) ?? 0)
        otOverdue = Int(StockParse.dbl(raw["otOverdue"]) ?? 0)
        ticketsOpen = Int(StockParse.dbl(raw["ticketsOpen"]) ?? 0)
    }
}

struct ExecutiveFinance: Hashable {
    let invoicedMtd: Double
    init(raw: [String: Any]) {
        invoicedMtd = StockParse.dbl(raw["invoicedMtd"], raw["invoiced"]) ?? 0
    }
}

struct ExecutiveAlert: Hashable, Identifiable {
    let title: String
    let detail: String
    var id: String { "ea-\(title)-\(detail)" }

    init(raw: [String: Any]) {
        title = StockParse.str(raw["title"])
        detail = StockParse.str(raw["message"], raw["detail"], raw["description"])
    }
}

struct ExecutiveTopAccount: Hashable, Identifiable {
    let clientId: Int
    let clientName: String
    let projects: Int
    let revenue: Double
    let margin: Double
    let marginPercent: Double
    var id: Int { clientId }

    init(raw: [String: Any]) {
        clientId = Int(StockParse.dbl(raw["clientId"]) ?? 0)
        clientName = StockParse.str(raw["clientName"])
        projects = Int(StockParse.dbl(raw["projects"]) ?? 0)
        revenue = StockParse.dbl(raw["revenue"]) ?? 0
        margin = StockParse.dbl(raw["margin"]) ?? 0
        marginPercent = StockParse.dbl(raw["marginPercent"]) ?? 0
    }
}

struct ExecutiveCLevel: Hashable {
    let headline: ExecutiveHeadline
    let operations: ExecutiveOps
    let finance: ExecutiveFinance
    let alerts: [ExecutiveAlert]
    let topAccounts: [ExecutiveTopAccount]
    let raw: [String: Any]

    init(raw: [String: Any]) {
        self.raw = raw
        headline = ExecutiveHeadline(raw: raw["headlineKpis"] as? [String: Any] ?? [:])
        operations = ExecutiveOps(raw: raw["operations"] as? [String: Any] ?? [:])
        finance = ExecutiveFinance(raw: raw["finance"] as? [String: Any] ?? [:])
        alerts = (raw["alerts"] as? [[String: Any]] ?? []).map { ExecutiveAlert(raw: $0) }
        topAccounts = (raw["topAccounts"] as? [[String: Any]] ?? []).map { ExecutiveTopAccount(raw: $0) }
    }
}

struct Company: Hashable, Identifiable {
    let id: Int64
    let legalName: String
    let tradeName: String
    let rfc: String
    let fiscalRegime: String
    let email: String
    let phone: String
    let address: String
    let city: String
    let state: String
    let isPrimary: Bool
    let isActive: Bool
    let raw: [String: Any]

    var displayName: String { legalName.isEmpty ? (tradeName.isEmpty ? "Empresa" : tradeName) : legalName }

    static func == (lhs: Company, rhs: Company) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        legalName = StockParse.str(raw["legalName"], raw["razonSocial"])
        tradeName = StockParse.str(raw["tradeName"], raw["name"], raw["nombre"])
        rfc = StockParse.str(raw["rfc"])
        fiscalRegime = StockParse.str(raw["fiscalRegime"], raw["regimenFiscal"])
        email = StockParse.str(raw["email"])
        phone = StockParse.str(raw["phone"], raw["telefono"])
        address = StockParse.str(raw["address"], raw["direccion"])
        city = StockParse.str(raw["city"], raw["ciudad"])
        state = StockParse.str(raw["state"], raw["estado"])
        if let b = raw["isPrimary"] as? Bool { isPrimary = b }
        else { isPrimary = ["true", "1", "yes"].contains(StockParse.str(raw["isPrimary"]).lowercased()) }
        if let b = raw["isActive"] as? Bool { isActive = b }
        else {
            let s = StockParse.str(raw["isActive"]).lowercased()
            isActive = s.isEmpty || !["false", "0", "no"].contains(s)
        }
    }
}

struct KbArticle: Hashable, Identifiable {
    let articleId: String
    let slug: String
    let title: String
    let excerpt: String
    let content: String
    let category: String
    let status: String
    let tags: String
    let raw: [String: Any]

    var id: String { articleId.isEmpty ? (slug.isEmpty ? title : slug) : articleId }
    var openKey: String { slug.isEmpty ? articleId : slug }

    static func == (lhs: KbArticle, rhs: KbArticle) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        articleId = StockParse.str(raw["id"])
        slug = StockParse.str(raw["slug"])
        title = StockParse.str(raw["title"], raw["titulo"])
        excerpt = StockParse.str(raw["excerpt"], raw["resumen"])
        content = StockParse.str(raw["content"], raw["body"], raw["contenido"])
        category = StockParse.str(raw["category"], raw["name"], raw["categoria"])
        status = StockParse.str(raw["status"], raw["visibility"], raw["estado"])
        if let arr = raw["tags"] as? [Any] {
            tags = arr.map { "\($0)" }.joined(separator: ", ")
        } else {
            tags = StockParse.str(raw["tags"])
        }
    }
}

struct OrgNode: Hashable, Identifiable {
    let nodeId: String
    let name: String
    let roleName: String
    let departmentName: String
    let children: [OrgNode]
    let raw: [String: Any]

    var id: String { nodeId.isEmpty ? name : nodeId }

    static func == (lhs: OrgNode, rhs: OrgNode) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        nodeId = StockParse.str(raw["id"])
        name = StockParse.str(raw["nombre"], raw["name"])
        let role = raw["role"] as? [String: Any]
        let dept = raw["department"] as? [String: Any]
        roleName = StockParse.str(role?["nombre"], role?["name"], raw["roleName"])
        departmentName = StockParse.str(dept?["nombre"], dept?["name"], raw["departmentName"])
        children = (raw["children"] as? [[String: Any]] ?? []).map { OrgNode(raw: $0) }
    }
}

struct Tender: Hashable, Identifiable {
    let tenderId: String
    let title: String
    let status: String
    let clientName: String
    let amount: Double
    let deadline: String
    let description: String
    let result: String
    let ownerName: String
    let raw: [String: Any]

    var id: String { tenderId.isEmpty ? title : tenderId }
    var displayTitle: String { title.isEmpty ? "Licitación" : title }
    var statusLower: String { status.lowercased() }
    var isActive: Bool { ["activo", "abierto", "open"].contains(statusLower) }
    var isClosed: Bool { ["cerrado", "closed", "ganado", "perdido"].contains(statusLower) }

    static func == (lhs: Tender, rhs: Tender) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        tenderId = StockParse.str(raw["id"])
        title = StockParse.str(raw["title"], raw["name"], raw["titulo"])
        status = StockParse.str(raw["status"], raw["estado"])
        clientName = StockParse.str(raw["clientName"], raw["cliente"])
        amount = StockParse.dbl(raw["amount"], raw["value"], raw["monto"]) ?? 0
        deadline = StockParse.str(raw["deadline"], raw["dueDate"], raw["fechaLimite"])
        description = StockParse.str(raw["description"], raw["notes"])
        result = StockParse.str(raw["result"], raw["resultado"])
        ownerName = StockParse.str(raw["ownerName"], raw["responsable"])
    }
}

struct SalesTarget: Hashable, Identifiable {
    let targetId: String
    let ownerName: String
    let year: String
    let month: String
    let targetAmount: Double
    let actualAmount: Double
    let raw: [String: Any]

    var id: String { targetId.isEmpty ? ownerName : targetId }
    var progress: Double { targetAmount > 0 ? min(1, max(0, actualAmount / targetAmount)) : 0 }

    static func == (lhs: SalesTarget, rhs: SalesTarget) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        targetId = StockParse.str(raw["id"])
        ownerName = StockParse.str(raw["ownerName"], raw["userName"], raw["nombre"])
        year = StockParse.str(raw["year"], raw["anio"])
        month = StockParse.str(raw["month"], raw["mes"])
        targetAmount = StockParse.dbl(raw["targetAmount"], raw["amount"]) ?? 0
        actualAmount = StockParse.dbl(raw["actualAmount"], raw["actual"], raw["currentAmount"]) ?? 0
    }
}

struct SalesTeamMember: Hashable, Identifiable {
    let memberId: String
    let name: String
    let role: String
    let totalSales: Double
    let totalLeads: String
    let totalOpps: String
    let raw: [String: Any]

    var id: String { memberId.isEmpty ? name : memberId }

    static func == (lhs: SalesTeamMember, rhs: SalesTeamMember) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        memberId = StockParse.str(raw["id"], raw["userId"])
        name = StockParse.str(raw["nombre"], raw["name"], raw["userName"])
        role = StockParse.str(raw["role"], raw["puesto"], raw["cargo"], raw["rol"])
        totalSales = StockParse.dbl(raw["totalVentas"], raw["salesTotal"], raw["amount"], raw["revenue"]) ?? 0
        totalLeads = StockParse.str(raw["totalLeads"], raw["leads"])
        totalOpps = StockParse.str(raw["totalOportunidades"], raw["oportunidades"], raw["opportunities"])
    }
}

/// KPIs ventas — GET /ventas/reportes/metricas
struct SalesMetrics: Hashable {
    let totalRevenue: Double
    let pipelineValue: Double
    let conversionRate: Double
    let averageMargin: Double
    let opportunityCount: Int
    let projectCount: Int
    let closedProjects: Int
    let activeClients: Int
    let raw: [String: Any]

    static func == (lhs: SalesMetrics, rhs: SalesMetrics) -> Bool {
        lhs.totalRevenue == rhs.totalRevenue && lhs.pipelineValue == rhs.pipelineValue
            && lhs.opportunityCount == rhs.opportunityCount
    }
    func hash(into hasher: inout Hasher) {
        hasher.combine(totalRevenue); hasher.combine(pipelineValue); hasher.combine(opportunityCount)
    }

    init(raw: [String: Any] = [:]) {
        self.raw = raw
        totalRevenue = StockParse.dbl(raw["totalRevenue"], raw["revenue"], raw["ingresos"]) ?? 0
        pipelineValue = StockParse.dbl(raw["pipelineValue"], raw["pipeline"]) ?? 0
        conversionRate = StockParse.dbl(raw["conversionRate"]) ?? 0
        averageMargin = StockParse.dbl(raw["averageMargin"], raw["margin"]) ?? 0
        opportunityCount = StockParse.int(raw["opportunityCount"], raw["opportunities"]) ?? 0
        projectCount = StockParse.int(raw["projectCount"], raw["projects"]) ?? 0
        closedProjects = StockParse.int(raw["closedProjects"]) ?? 0
        activeClients = StockParse.int(raw["activeClients"], raw["clients"]) ?? 0
    }
}

/// Vendedor en reportes — GET /ventas/reportes/vendedores
struct VendorReportItem: Hashable, Identifiable {
    let userId: Int64
    let userName: String
    let email: String
    let role: String
    let status: String
    let revenue: Double
    let targetRevenue: Double
    let attainmentRevenue: Double
    let opportunities: Int
    let projects: Int
    let leads: Int
    let activities: Int
    let performance: Double
    let raw: [String: Any]

    var id: Int64 { userId > 0 ? userId : Int64(userName.hashValue) }
    var displayName: String { userName.isEmpty ? "Vendedor" : userName }

    static func == (lhs: VendorReportItem, rhs: VendorReportItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        userId = StockParse.int64(raw["userId"], raw["id"]) ?? 0
        userName = StockParse.str(raw["userName"], raw["nombre"], raw["name"])
        email = StockParse.str(raw["email"])
        role = StockParse.str(raw["role"], raw["rol"])
        status = StockParse.str(raw["status"])
        revenue = StockParse.dbl(raw["revenue"], raw["totalRevenue"]) ?? 0
        targetRevenue = StockParse.dbl(raw["targetRevenue"], raw["target"]) ?? 0
        attainmentRevenue = StockParse.dbl(raw["attainmentRevenue"], raw["attainment"]) ?? 0
        opportunities = StockParse.int(raw["opportunities"]) ?? 0
        projects = StockParse.int(raw["projects"]) ?? 0
        leads = StockParse.int(raw["leads"]) ?? 0
        activities = StockParse.int(raw["activities"]) ?? 0
        performance = StockParse.dbl(raw["performance"], raw["performanceScore"]) ?? 0
    }
}
