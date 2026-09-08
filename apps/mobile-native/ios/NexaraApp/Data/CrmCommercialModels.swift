import Foundation

// Modelos del área comercial que la web ya consumía y el teléfono no.
//
// Por qué viven aquí y no en `GovernanceCrmModels.swift`: ese fichero pertenece a
// otro agente en este relevo. Los tipos nuevos van en un fichero propio con
// prefijo `Crm` para no pisar trabajo ajeno ni provocar redeclaraciones.
//
// Todos parsean desde `[String: Any]` con `StockParse`, igual que el resto del
// CRM: la API devuelve `Decimal` de Prisma serializado a veces como número y a
// veces como cadena, y `Codable` estricto se rompe con eso.

// MARK: - Licitaciones (GET tenders/:id)

/// Documento adjunto de una licitación (`TenderDocument`).
struct CrmTenderDocument: Identifiable, Hashable {
    let id: Int64
    let documentType: String
    let name: String
    let url: String
    let notes: String
    let createdAt: String

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        documentType = StockParse.str(raw["documentType"])
        name = StockParse.str(raw["name"])
        url = StockParse.str(raw["url"])
        notes = StockParse.str(raw["notes"])
        createdAt = StockParse.str(raw["createdAt"])
    }

    var displayName: String { name.isEmpty ? "Documento #\(id)" : name }
}

/// Hito del calendario de la licitación (`TenderEvent`).
struct CrmTenderEvent: Identifiable, Hashable {
    let id: Int64
    let title: String
    let eventType: String
    let occursAt: String
    let notes: String

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        title = StockParse.str(raw["title"], raw["name"])
        eventType = StockParse.str(raw["eventType"], raw["type"])
        occursAt = StockParse.str(raw["occursAt"], raw["date"])
        notes = StockParse.str(raw["notes"], raw["description"])
    }

    var displayTitle: String {
        if !title.isEmpty { return title }
        if !eventType.isEmpty { return eventType }
        return "Hito"
    }
}

/// Detalle completo de licitación — GET `tenders/:id`.
///
/// El `Tender` de la lista sólo lee cuatro campos y ninguno coincide con el
/// esquema real (`deadline`/`amount` no existen en la tabla). Aquí se leen los
/// nombres que devuelve Prisma, con alias por si el backend cambia.
struct CrmTenderDetail: Identifiable, Hashable {
    let id: Int64
    let tenderNumber: String
    let title: String
    let description: String
    let tenderType: String
    let status: String
    let conveningEntity: String
    let conveningContact: String
    let conveningEmail: String
    let conveningPhone: String
    let publicationUrl: String
    let externalReference: String
    let budgetCeiling: Double
    let ourBidAmount: Double
    let estimatedCost: Double
    let expectedMargin: Double
    let guaranteeAmount: Double
    let currency: String
    let publishDate: String
    let questionsDeadline: String
    let submissionDeadline: String
    let openingDate: String
    let awardDate: String
    let scope: String
    let technicalRequirements: String
    let legalRequirements: String
    let awardedToCompetitor: String
    let awardNotes: String
    let ownerName: String
    let opportunityId: Int64?
    let opportunityTitle: String
    let documents: [CrmTenderDocument]
    let events: [CrmTenderEvent]
    let raw: [String: Any]

    static func == (lhs: CrmTenderDetail, rhs: CrmTenderDetail) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    var displayTitle: String { title.isEmpty ? "Licitación #\(id)" : title }
    var isAwarded: Bool { status.uppercased() == "AWARDED" }
    /// Sólo una adjudicada se puede promover: el backend lanza 400 en cualquier otro caso.
    var canPromote: Bool { isAwarded && opportunityId == nil }
    /// Margen sobre la oferta, para no repetir la cuenta en cada pantalla.
    var marginPercent: Double {
        ourBidAmount > 0 ? ((ourBidAmount - estimatedCost) / ourBidAmount) * 100 : 0
    }

    init(raw: [String: Any]) {
        self.raw = raw
        let owner = raw["owner"] as? [String: Any]
        let opp = raw["opportunity"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        tenderNumber = StockParse.str(raw["tenderNumber"], raw["folio"])
        title = StockParse.str(raw["title"], raw["name"])
        description = StockParse.str(raw["description"])
        tenderType = StockParse.str(raw["tenderType"], raw["type"])
        status = StockParse.str(raw["status"])
        conveningEntity = StockParse.str(raw["conveningEntity"], raw["clientName"])
        conveningContact = StockParse.str(raw["conveningContact"])
        conveningEmail = StockParse.str(raw["conveningEmail"])
        conveningPhone = StockParse.str(raw["conveningPhone"])
        publicationUrl = StockParse.str(raw["publicationUrl"])
        externalReference = StockParse.str(raw["externalReference"])
        budgetCeiling = StockParse.dbl(raw["budgetCeiling"]) ?? 0
        ourBidAmount = StockParse.dbl(raw["ourBidAmount"]) ?? 0
        estimatedCost = StockParse.dbl(raw["estimatedCost"]) ?? 0
        expectedMargin = StockParse.dbl(raw["expectedMargin"]) ?? 0
        guaranteeAmount = StockParse.dbl(raw["guaranteeAmount"]) ?? 0
        currency = StockParse.str(raw["currency"])
        publishDate = StockParse.str(raw["publishDate"])
        questionsDeadline = StockParse.str(raw["questionsDeadline"])
        submissionDeadline = StockParse.str(raw["submissionDeadline"])
        openingDate = StockParse.str(raw["openingDate"])
        awardDate = StockParse.str(raw["awardDate"])
        scope = StockParse.str(raw["scope"])
        technicalRequirements = StockParse.str(raw["technicalRequirements"])
        legalRequirements = StockParse.str(raw["legalRequirements"])
        awardedToCompetitor = StockParse.str(raw["awardedToCompetitor"])
        awardNotes = StockParse.str(raw["awardNotes"])
        ownerName = StockParse.str(owner?["nombre"], owner?["name"], raw["ownerName"])
        opportunityId = StockParse.int64(opp?["id"], raw["salesOpportunityId"])
        opportunityTitle = StockParse.str(opp?["title"])
        documents = ((raw["documents"] as? [[String: Any]]) ?? []).map(CrmTenderDocument.init)
        events = ((raw["events"] as? [[String: Any]]) ?? []).map(CrmTenderEvent.init)
    }
}

/// Estados válidos de `TenderStatus` en Prisma, con etiqueta en castellano.
///
/// Se codifica aquí en vez de dejar un campo libre porque el backend rechaza
/// cualquier valor fuera del enum, y desde el móvil no hay forma de leer el
/// esquema en caliente.
enum CrmTenderStatusCatalog {
    static let all: [(key: String, label: String)] = [
        ("PROSPECT", "Prospecto"),
        ("IN_REVIEW", "En revisión"),
        ("PREPARING_BID", "Preparando oferta"),
        ("SUBMITTED", "Presentada"),
        ("AWARDED", "Adjudicada"),
        ("LOST", "Perdida"),
        ("CANCELLED", "Cancelada"),
        ("DISQUALIFIED", "Descalificada"),
    ]

    static func label(_ key: String) -> String {
        let up = key.uppercased()
        return all.first { $0.key == up }?.label ?? (key.isEmpty ? "—" : key)
    }

    /// Sólo estos dos piden justificación de por qué se perdió / a quién.
    static func requiresAwardNotes(_ key: String) -> Bool {
        ["LOST", "DISQUALIFIED"].contains(key.uppercased())
    }
}

// MARK: - Metas comerciales (GET sales-targets/performance)

/// Fila de cumplimiento de cuota por vendedor.
struct CrmTargetPerformanceRow: Identifiable, Hashable {
    let targetId: Int64
    let ownerId: Int64
    let ownerName: String
    let hasQuota: Bool
    let period: String
    let year: Int
    let month: Int
    let revenueTarget: Double
    let revenueAchieved: Double
    let attainmentPct: Double
    let opportunitiesTarget: Int
    let opportunitiesCreated: Int
    let newClientsTarget: Int
    let newClientsAchieved: Int
    let baseCommissionPct: Double
    let bonusCommissionPct: Double
    let bonusThresholdPct: Double
    let commission: Double
    let reachedBonus: Bool

    var id: Int64 { targetId }
    /// 0…1 acotado, para pintar la barra sin que se salga con >100 %.
    var progress: Double { min(1, max(0, attainmentPct / 100)) }

    init(raw: [String: Any]) {
        targetId = StockParse.int64(raw["targetId"], raw["id"]) ?? 0
        ownerId = StockParse.int64(raw["ownerId"]) ?? 0
        ownerName = StockParse.str(raw["ownerName"], raw["nombre"], raw["name"])
        hasQuota = (raw["hasQuota"] as? Bool) ?? ((raw["hasQuota"] as? NSNumber)?.boolValue ?? false)
        period = StockParse.str(raw["period"])
        year = StockParse.int(raw["year"]) ?? 0
        month = StockParse.int(raw["month"]) ?? 0
        revenueTarget = StockParse.dbl(raw["revenueTarget"]) ?? 0
        revenueAchieved = StockParse.dbl(raw["revenueAchieved"]) ?? 0
        attainmentPct = StockParse.dbl(raw["attainmentPct"]) ?? 0
        opportunitiesTarget = StockParse.int(raw["opportunitiesTarget"]) ?? 0
        opportunitiesCreated = StockParse.int(raw["opportunitiesCreated"]) ?? 0
        newClientsTarget = StockParse.int(raw["newClientsTarget"]) ?? 0
        newClientsAchieved = StockParse.int(raw["newClientsAchieved"]) ?? 0
        baseCommissionPct = StockParse.dbl(raw["baseCommissionPct"]) ?? 0
        bonusCommissionPct = StockParse.dbl(raw["bonusCommissionPct"]) ?? 0
        bonusThresholdPct = StockParse.dbl(raw["bonusThresholdPct"]) ?? 0
        commission = StockParse.dbl(raw["commission"]) ?? 0
        reachedBonus = (raw["reachedBonus"] as? Bool)
            ?? ((raw["reachedBonus"] as? NSNumber)?.boolValue ?? false)
    }
}

/// Respuesta completa de `sales-targets/performance`.
struct CrmTargetPerformance {
    let year: Int
    let month: Int
    let rows: [CrmTargetPerformanceRow]
    let revenueTarget: Double
    let revenueAchieved: Double
    let totalCommissions: Double
    let avgAttainmentPct: Double

    init(raw: [String: Any] = [:]) {
        year = StockParse.int(raw["year"]) ?? 0
        month = StockParse.int(raw["month"]) ?? 0
        rows = ((raw["performance"] as? [[String: Any]]) ?? []).map(CrmTargetPerformanceRow.init)
        let totals = (raw["totals"] as? [String: Any]) ?? [:]
        revenueTarget = StockParse.dbl(totals["revenueTarget"]) ?? 0
        revenueAchieved = StockParse.dbl(totals["revenueAchieved"]) ?? 0
        totalCommissions = StockParse.dbl(totals["totalCommissions"]) ?? 0
        avgAttainmentPct = StockParse.dbl(totals["avgAttainmentPct"]) ?? 0
    }
}

// MARK: - Costos de proyecto comercial

/// Respuesta de `ventas/proyectos/:id/costos`, `sync-viaticos` y
/// `sync-actual-costs`: los tres devuelven el mismo objeto.
struct CrmProjectCosts {
    let costProducts: Double
    let costViaticos: Double
    let costOperativo: Double
    let totalCost: Double
    let budget: Double
    let margin: Double
    let marginPercent: Double
    let isOverBudget: Bool
    /// Costo real de campo (viáticos aprobados + gastos de OT), no el planeado.
    let actualViaticos: Double
    let actualOperativo: Double
    let actualTotalWithProducts: Double
    let marginActual: Double
    let marginActualPercent: Double
    let isOverBudgetActual: Bool
    let hasActual: Bool

    init(raw: [String: Any] = [:]) {
        costProducts = StockParse.dbl(raw["costProducts"]) ?? 0
        costViaticos = StockParse.dbl(raw["costViaticos"]) ?? 0
        costOperativo = StockParse.dbl(raw["costOperativo"]) ?? 0
        totalCost = StockParse.dbl(raw["totalCost"]) ?? 0
        budget = StockParse.dbl(raw["budget"]) ?? 0
        margin = StockParse.dbl(raw["margin"]) ?? 0
        marginPercent = StockParse.dbl(raw["marginPercent"]) ?? 0
        isOverBudget = (raw["isOverBudget"] as? Bool)
            ?? ((raw["isOverBudget"] as? NSNumber)?.boolValue ?? false)
        hasActual = raw["actual"] is [String: Any]
        let actual = (raw["actual"] as? [String: Any]) ?? [:]
        actualViaticos = StockParse.dbl(actual["actualViaticos"]) ?? 0
        actualOperativo = StockParse.dbl(actual["actualOperativo"]) ?? 0
        actualTotalWithProducts = StockParse.dbl(actual["actualTotalWithProducts"]) ?? 0
        marginActual = StockParse.dbl(actual["marginActual"]) ?? 0
        marginActualPercent = StockParse.dbl(actual["marginActualPercent"]) ?? 0
        isOverBudgetActual = (actual["isOverBudgetActual"] as? Bool)
            ?? ((actual["isOverBudgetActual"] as? NSNumber)?.boolValue ?? false)
    }
}

/// Respuesta de `ventas/proyectos/:id/validar-presupuesto`: `{ valid, message }`.
struct CrmBudgetCheck {
    let valid: Bool
    let message: String

    init(raw: [String: Any] = [:]) {
        valid = (raw["valid"] as? Bool) ?? ((raw["valid"] as? NSNumber)?.boolValue ?? false)
        message = StockParse.str(raw["message"])
    }
}

// MARK: - Insights de reportes (GET ventas/reportes/insights)

/// Alerta / acción que devuelve `insights`, aplanada para la lista.
struct CrmSalesInsightAlert: Identifiable, Hashable {
    let id = UUID()
    let level: String
    let message: String

    /// `high` / `medium` / `low`. El color lo decide la vista: la capa de datos
    /// no debe conocer la paleta.
    var isHigh: Bool { level.lowercased() == "high" }
    var isMedium: Bool { level.lowercased() == "medium" }
}

/// Sólo la parte de `insights` que cabe con sentido en un teléfono: forecast,
/// higiene de pipeline, cumplimiento de próxima acción y alertas. Las cohortes
/// y el top de LTV son tablas anchas y se dejan para el escritorio.
struct CrmSalesInsights {
    let weightedForecast: Double
    let forecastCoverage: Double
    let commitForecast: Double
    let bestCaseForecast: Double
    let worstCaseForecast: Double
    let avgCycleDays: Double
    let conversionRate: Double
    let averageMargin: Double
    let hygieneScore: Double
    let staleOpportunities14d: Int
    let staleOpportunities30d: Int
    let withoutRecentActivity: Int
    let highValueLowProbability: Int
    let activeOpportunities: Int
    let actionPlanCoverage: Double
    let overdueNextActions: Int
    let avgLtv: Double
    let churnRiskCount: Int
    let churnRiskPct: Double
    let alerts: [CrmSalesInsightAlert]
    let isEmpty: Bool

    init(raw: [String: Any] = [:]) {
        isEmpty = raw.isEmpty
        let forecast = (raw["forecast"] as? [String: Any]) ?? [:]
        let efficiency = (raw["efficiency"] as? [String: Any]) ?? [:]
        let hygiene = (raw["pipelineHygiene"] as? [String: Any]) ?? [:]
        let nextAction = (raw["nextActionCompliance"] as? [String: Any]) ?? [:]
        let customers = (raw["customers"] as? [String: Any]) ?? [:]

        weightedForecast = StockParse.dbl(forecast["weightedForecast"]) ?? 0
        forecastCoverage = StockParse.dbl(forecast["forecastCoverage"]) ?? 0
        commitForecast = StockParse.dbl(forecast["commitForecast"]) ?? 0
        bestCaseForecast = StockParse.dbl(forecast["bestCaseForecast"]) ?? 0
        worstCaseForecast = StockParse.dbl(forecast["worstCaseForecast"]) ?? 0
        avgCycleDays = StockParse.dbl(efficiency["avgCycleDays"]) ?? 0
        conversionRate = StockParse.dbl(efficiency["conversionRate"]) ?? 0
        averageMargin = StockParse.dbl(efficiency["averageMargin"]) ?? 0
        hygieneScore = StockParse.dbl(hygiene["score"]) ?? 0
        staleOpportunities14d = StockParse.int(hygiene["staleOpportunities14d"]) ?? 0
        staleOpportunities30d = StockParse.int(hygiene["staleOpportunities30d"]) ?? 0
        withoutRecentActivity = StockParse.int(hygiene["opportunitiesWithoutRecentActivity"]) ?? 0
        highValueLowProbability = StockParse.int(hygiene["highValueLowProbability"]) ?? 0
        activeOpportunities = StockParse.int(nextAction["activeOpportunities"]) ?? 0
        actionPlanCoverage = StockParse.dbl(nextAction["actionPlanCoverage"]) ?? 0
        overdueNextActions = StockParse.int(nextAction["overdueNextActions"]) ?? 0
        avgLtv = StockParse.dbl(customers["avgLtv"]) ?? 0
        churnRiskCount = StockParse.int(customers["churnRiskCount"]) ?? 0
        churnRiskPct = StockParse.dbl(customers["churnRiskPct"]) ?? 0
        alerts = ((raw["riskAlerts"] as? [[String: Any]]) ?? []).map {
            CrmSalesInsightAlert(
                level: StockParse.str($0["level"]),
                message: StockParse.str($0["message"])
            )
        }
    }
}

// MARK: - Notificaciones del panel comercial

/// Notificación de `ventas/reportes/notificaciones`. Es la tabla `Notification`
/// filtrada al equipo de ventas, no la bandeja general de `notifications`.
struct CrmSalesNotification: Identifiable, Hashable {
    let id: Int64
    let title: String
    let body: String
    let category: String
    let createdAt: String
    let isRead: Bool
    let triggerUserName: String

    var displayTitle: String { title.isEmpty ? "Notificación" : title }

    init(raw: [String: Any]) {
        let trigger = raw["triggerUser"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        title = StockParse.str(raw["title"], raw["titulo"])
        body = StockParse.str(raw["body"], raw["message"], raw["mensaje"])
        category = StockParse.str(raw["category"], raw["tipo"])
        createdAt = StockParse.str(raw["createdAt"])
        isRead = (raw["isRead"] as? Bool)
            ?? ((raw["isRead"] as? NSNumber)?.boolValue)
            ?? (StockParse.str(raw["readAt"]).isEmpty == false)
        triggerUserName = StockParse.str(trigger?["nombre"], trigger?["name"])
    }
}

// MARK: - Reglas comerciales (GET smart-quote/rules)

/// Regla de margen / descuento que aplica el cotizador.
struct CrmCommercialRule: Identifiable, Hashable {
    let id: Int64
    let name: String
    let scope: String
    let scopeValue: String
    let minMarginPercent: Double?
    let maxDiscountPercent: Double?
    let requiresApproval: Bool
    let active: Bool

    /// «Global», «Categoría: Cámaras»… lo que el vendedor necesita distinguir.
    var scopeLabel: String {
        let base: String
        switch scope.uppercased() {
        case "GLOBAL": base = "Global"
        case "CATEGORY": base = "Categoría"
        case "BRAND": base = "Marca"
        default: base = scope.isEmpty ? "Regla" : scope
        }
        return scopeValue.isEmpty ? base : "\(base): \(scopeValue)"
    }

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"])
        scope = StockParse.str(raw["scope"])
        scopeValue = StockParse.str(raw["scopeValue"])
        minMarginPercent = StockParse.dbl(raw["minMarginPercent"])
        maxDiscountPercent = StockParse.dbl(raw["maxDiscountPercent"])
        requiresApproval = (raw["requiresApproval"] as? Bool)
            ?? ((raw["requiresApproval"] as? NSNumber)?.boolValue ?? false)
        active = (raw["active"] as? Bool)
            ?? ((raw["active"] as? NSNumber)?.boolValue ?? true)
    }
}
