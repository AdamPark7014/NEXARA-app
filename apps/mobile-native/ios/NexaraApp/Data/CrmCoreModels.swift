import Foundation

struct CrmOpportunity: Hashable, Identifiable {
    let id: Int64
    let title: String
    let stage: String
    let value: Double
    let probability: Double
    let clientName: String
    let raw: [String: Any]

    var displayTitle: String { title.isEmpty ? "Oportunidad" : title }
    var stageKey: String { stage.isEmpty ? "Sin etapa" : stage }
    var weightedValue: Double { value * ((probability > 0 ? probability : 20) / 100) }
    var isWon: Bool {
        let s = stage.lowercased()
        return s == "won" || s.contains("ganad")
    }

    static func == (lhs: CrmOpportunity, rhs: CrmOpportunity) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let client = raw["client"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        title = StockParse.str(raw["title"], raw["name"], raw["titulo"])
        stage = StockParse.str(raw["stage"], raw["etapa"], raw["status"])
        value = StockParse.dbl(raw["value"], raw["amount"], raw["monto"]) ?? 0
        probability = StockParse.dbl(raw["probability"], raw["probabilidad"]) ?? 0
        clientName = StockParse.str(
            raw["clientName"], raw["cliente"], raw["accountName"],
            client?["name"], client?["nombre"]
        )
    }
}

/// Nota de seguimiento en detalle de oportunidad.
struct CrmOppNote: Hashable, Identifiable {
    let id: String
    let message: String
    let createdAt: String

    init(raw: [String: Any]) {
        id = StockParse.str(raw["id"]).isEmpty
            ? StockParse.str(raw["createdAt"], raw["fecha"], raw["message"])
            : StockParse.str(raw["id"])
        message = StockParse.str(raw["message"], raw["mensaje"], raw["content"])
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
    }
}

/// Adjunto / evidencia de oportunidad.
struct CrmOppAttachment: Hashable, Identifiable {
    let id: String
    let name: String
    let url: String

    var displayName: String { name.isEmpty ? "Archivo" : name }

    init(raw: [String: Any]) {
        id = StockParse.str(raw["id"]).isEmpty
            ? StockParse.str(raw["url"], raw["fileUrl"], raw["name"])
            : StockParse.str(raw["id"])
        name = StockParse.str(raw["name"], raw["nombre"], raw["fileName"])
        url = StockParse.str(raw["url"], raw["fileUrl"])
    }
}

/// Cotización vinculada a oportunidad.
struct CrmOppQuote: Hashable, Identifiable {
    let id: String
    let label: String
    let pdfUrl: String
    let createdAt: String

    var displayLabel: String { label.isEmpty ? "Cotización" : label }

    init(raw: [String: Any]) {
        id = StockParse.str(raw["id"]).isEmpty
            ? StockParse.str(raw["folio"], raw["versionLabel"], raw["pdfUrl"])
            : StockParse.str(raw["id"])
        label = StockParse.str(raw["versionLabel"], raw["folio"], raw["name"])
        pdfUrl = StockParse.str(raw["pdfUrl"], raw["url"])
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
    }
}

/// Evento de historial / changelog de oportunidad.
struct CrmOppHistoryEvent: Hashable, Identifiable {
    let id: String
    let action: String
    let userName: String
    let createdAt: String
    let detail: String

    var displayAction: String { action.isEmpty ? "Cambio" : action }

    init(raw: [String: Any], index: Int = 0) {
        id = StockParse.str(raw["id"]).isEmpty
            ? "\(index)-\(StockParse.str(raw["createdAt"], raw["timestamp"], raw["action"]))"
            : StockParse.str(raw["id"])
        action = StockParse.str(raw["action"], raw["accion"], raw["event"], raw["type"])
        userName = StockParse.str(raw["userName"], raw["createdByName"], raw["usuario"])
        createdAt = StockParse.str(raw["createdAt"], raw["timestamp"], raw["fecha"])
        detail = StockParse.str(raw["detail"], raw["description"], raw["changes"], raw["mensaje"])
    }
}

/// Detalle completo — GET /ventas/oportunidades/:id
struct CrmOpportunityDetail: Hashable {
    let id: Int64
    let title: String
    let stage: String
    let value: Double
    let probability: Double
    let clientName: String
    let description: String
    let expectedCloseDate: String
    let notes: [CrmOppNote]
    let attachments: [CrmOppAttachment]
    let quotes: [CrmOppQuote]
    let history: [CrmOppHistoryEvent]
    let raw: [String: Any]

    var displayTitle: String { title.isEmpty ? "Oportunidad" : title }
    var stageKey: String { stage.isEmpty ? "Sin etapa" : stage }
    var isEmpty: Bool { id == 0 && title.isEmpty && raw.isEmpty }

    static func == (lhs: CrmOpportunityDetail, rhs: CrmOpportunityDetail) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any] = [:]) {
        self.raw = raw
        let client = raw["client"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        title = StockParse.str(raw["title"], raw["name"], raw["titulo"])
        stage = StockParse.str(raw["stage"], raw["etapa"], raw["status"])
        value = StockParse.dbl(raw["value"], raw["amount"], raw["monto"]) ?? 0
        probability = StockParse.dbl(raw["probability"], raw["probabilidad"]) ?? 0
        let nestedClient = StockParse.str(client?["name"], client?["nombre"])
        let flatClient = StockParse.str(raw["clientName"], raw["cliente"], raw["accountName"])
        clientName = flatClient.isEmpty ? nestedClient : flatClient
        description = StockParse.str(raw["description"], raw["descripcion"])
        expectedCloseDate = StockParse.str(raw["expectedCloseDate"], raw["closeDate"])
        notes = Self.mapArray(raw, "notes", "notas").map(CrmOppNote.init)
        attachments = Self.mapArray(raw, "evidences", "evidencias").map(CrmOppAttachment.init)
        quotes = Self.mapArray(raw, "quotes", "cotizaciones").map(CrmOppQuote.init)
        let histRaw = Self.mapArray(raw, "history", "historial", "activityLog", "changelog")
        history = histRaw.enumerated().map { CrmOppHistoryEvent(raw: $0.element, index: $0.offset) }
    }

    private static func mapArray(_ raw: [String: Any], _ keys: String...) -> [[String: Any]] {
        for k in keys {
            if let arr = raw[k] as? [[String: Any]] { return arr }
        }
        return []
    }
}

struct CrmClient: Hashable, Identifiable {
    let id: Int64
    let name: String
    let email: String
    let rfc: String
    let phone: String
    let raw: [String: Any]

    var displayName: String { name.isEmpty ? "Cliente" : name }
    var subtitle: String { email.isEmpty ? rfc : email }

    static func == (lhs: CrmClient, rhs: CrmClient) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"], raw["nombre"], raw["razonSocial"])
        email = StockParse.str(raw["email"])
        rfc = StockParse.str(raw["rfc"])
        phone = StockParse.str(raw["phone"], raw["telefono"])
    }
}

struct CrmLead: Hashable, Identifiable {
    let leadId: String
    let title: String
    let description: String
    let status: String
    let clientName: String
    let branchName: String
    let raw: [String: Any]

    var id: String { leadId.isEmpty ? title : leadId }
    var displayTitle: String {
        if !title.isEmpty { return title }
        if !description.isEmpty { return description }
        return "Lead"
    }

    static func == (lhs: CrmLead, rhs: CrmLead) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        leadId = StockParse.str(raw["id"])
        title = StockParse.str(raw["title"], raw["titulo"], raw["name"], raw["subject"], raw["asunto"])
        description = StockParse.str(raw["description"], raw["descripcion"], raw["notes"], raw["notas"])
        status = StockParse.str(raw["status"], raw["estatus"], raw["estado"], raw["urgency"])
        clientName = StockParse.str(raw["clientName"], raw["cliente"])
        branchName = StockParse.str(raw["branchName"], raw["sucursal"])
    }
}

struct CrmProduct: Hashable, Identifiable {
    let id: Int64
    let name: String
    let sku: String
    let price: Double
    let raw: [String: Any]

    var displayName: String { name.isEmpty ? "Producto" : name }

    static func == (lhs: CrmProduct, rhs: CrmProduct) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"], raw["nombre"])
        sku = StockParse.str(raw["sku"], raw["code"], raw["codigo"])
        price = StockParse.dbl(raw["price"], raw["precio"]) ?? 0
    }
}

/// Plantilla PDF de cotización — GET /ventas/order-templates
struct OrderTemplate: Hashable, Identifiable {
    let id: Int64
    let name: String
    let description: String
    let companyName: String
    let companyEmail: String
    let companyPhone: String
    let companyRfc: String
    let primaryColor: String
    let footerText: String
    let isDefault: Bool
    let raw: [String: Any]

    var displayName: String { name.isEmpty ? "Plantilla" : name }
    var colorHex: String { primaryColor.isEmpty ? "#0f6ad6" : primaryColor }

    static func == (lhs: OrderTemplate, rhs: OrderTemplate) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"], raw["nombre"])
        description = StockParse.str(raw["description"], raw["descripcion"])
        companyName = StockParse.str(raw["companyName"], raw["company_name"])
        companyEmail = StockParse.str(raw["companyEmail"], raw["company_email"])
        companyPhone = StockParse.str(raw["companyPhone"], raw["company_phone"])
        companyRfc = StockParse.str(raw["companyRfc"], raw["company_rfc"])
        primaryColor = StockParse.str(raw["primaryColor"], raw["primary_color"])
        footerText = StockParse.str(raw["footerText"], raw["footer_text"])
        if let b = raw["isDefault"] as? Bool {
            isDefault = b
        } else if let b = raw["is_default"] as? Bool {
            isDefault = b
        } else if let n = raw["isDefault"] as? Int {
            isDefault = n != 0
        } else if let n = raw["is_default"] as? Int {
            isDefault = n != 0
        } else {
            let s = StockParse.str(raw["isDefault"], raw["is_default"]).lowercased()
            isDefault = s == "true" || s == "1"
        }
    }
}

/// Cotización CRM — GET /ventas/cotizaciones | /cotizaciones
struct Cotizacion: Hashable, Identifiable {
    let id: Int64
    let folio: String
    let cliente: String
    let total: Double
    let estatus: String
    let fecha: String
    let ownerName: String
    let vigencia: String
    let moneda: String
    let descuento: String
    let notes: String
    let lineItems: [[String: Any]]
    let raw: [String: Any]

    var displayFolio: String { folio.isEmpty ? (id > 0 ? "Cot. #\(id)" : "Sin folio") : folio }
    var dateLabel: String { String(fecha.prefix(10)) }

    static func == (lhs: Cotizacion, rhs: Cotizacion) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let client = raw["client"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        folio = StockParse.str(raw["folio"], raw["number"])
        cliente = StockParse.str(
            raw["cliente"], raw["clientName"], raw["razonSocial"],
            client?["name"], client?["nombre"], client?["razonSocial"]
        )
        total = StockParse.dbl(raw["total"], raw["amount"]) ?? 0
        estatus = StockParse.str(raw["estatus"], raw["status"], raw["estado"])
        fecha = StockParse.str(raw["fecha"], raw["createdAt"], raw["date"])
        ownerName = StockParse.str(raw["ownerName"], raw["responsable"], raw["vendedor"])
        vigencia = StockParse.str(raw["vigencia"], raw["validUntil"], raw["fechaVigencia"])
        moneda = StockParse.str(raw["moneda"], raw["currency"])
        descuento = StockParse.str(raw["descuento"], raw["discount"])
        notes = StockParse.str(raw["notas"], raw["notes"], raw["description"], raw["observaciones"])
        lineItems = (raw["items"] as? [[String: Any]])
            ?? (raw["conceptos"] as? [[String: Any]])
            ?? []
    }
}

/// Proyecto comercial CRM — GET /ventas/proyectos
struct CrmSalesProject: Hashable, Identifiable {
    let id: Int64
    let name: String
    let status: String
    let projectType: String
    let clientName: String
    let ownerName: String
    let scopeSummary: String
    let budget: Double
    let costProducts: Double
    let costViaticos: Double
    let costOperativo: Double
    let margin: Double
    let startDate: String
    let endDate: String
    let raw: [String: Any]

    var displayName: String { name.isEmpty ? "Proyecto" : name }
    var costRows: [(String, Double)] {
        [("Productos", costProducts), ("Viáticos", costViaticos), ("Operativo", costOperativo)]
            .filter { $0.1 != 0 }
    }

    static func == (lhs: CrmSalesProject, rhs: CrmSalesProject) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let opportunity = raw["opportunity"] as? [String: Any]
        let client = raw["client"] as? [String: Any]
            ?? opportunity?["client"] as? [String: Any]
        let owner = opportunity?["owner"] as? [String: Any]
            ?? raw["owner"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"], raw["title"], raw["nombre"])
        status = StockParse.str(raw["status"], raw["estado"])
        projectType = StockParse.str(raw["projectType"], raw["type"], raw["tipo"])
        clientName = StockParse.str(
            raw["clientName"], raw["cliente"],
            client?["name"], client?["nombre"]
        )
        ownerName = StockParse.str(
            raw["ownerName"], raw["assignedName"], raw["vendorName"],
            owner?["nombre"], owner?["name"]
        )
        scopeSummary = StockParse.str(raw["scopeSummary"], raw["description"], raw["descripcion"], raw["notes"])
        budget = StockParse.dbl(raw["budget"], raw["presupuesto"]) ?? 0
        costProducts = StockParse.dbl(raw["costProducts"]) ?? 0
        costViaticos = StockParse.dbl(raw["costViaticos"]) ?? 0
        costOperativo = StockParse.dbl(raw["costOperativo"]) ?? 0
        margin = StockParse.dbl(raw["margin"]) ?? 0
        startDate = StockParse.str(raw["startDate"], raw["startAt"], raw["createdAt"])
        endDate = StockParse.str(raw["endDate"], raw["closedAt"])
    }
}

struct HrStaffMember: Hashable, Identifiable {
    let id: Int64
    let name: String
    let estadoRrhh: String
    let isActive: Bool
    let raw: [String: Any]

    var isBaja: Bool { estadoRrhh.caseInsensitiveCompare("Baja") == .orderedSame || !isActive }

    static func == (lhs: HrStaffMember, rhs: HrStaffMember) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["nombre"], raw["name"], raw["fullName"])
        estadoRrhh = StockParse.str(raw["estadoRRHH"], raw["estado"], raw["status"])
        if let b = raw["isActive"] as? Bool { isActive = b }
        else {
            let s = StockParse.str(raw["isActive"]).lowercased()
            isActive = s.isEmpty || !["false", "0", "no"].contains(s)
        }
    }
}

/// Comida / lunch break — GET /lunch-breaks
struct LunchBreak: Hashable, Identifiable {
    let id: Int64
    let userName: String
    let date: String
    let checkinTime: String
    let checkoutTime: String
    let status: String
    let isCheckinLate: Bool
    let isCheckoutLate: Bool
    let notes: String
    let raw: [String: Any]

    var timeRange: String {
        let parts = [checkinTime, checkoutTime].filter { !$0.isEmpty }
        return parts.joined(separator: " → ")
    }
    var isActive: Bool {
        let s = status.lowercased()
        return s.contains("active") || s.contains("open") || s.contains("abiert")
    }

    static func == (lhs: LunchBreak, rhs: LunchBreak) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let user = raw["user"] as? [String: Any]
        let usuario = raw["usuario"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        userName = StockParse.str(
            raw["userName"], raw["usuario"],
            user?["nombre"], user?["name"],
            usuario?["nombre"], usuario?["name"]
        )
        date = StockParse.str(raw["date"], raw["startedAt"], raw["createdAt"])
        checkinTime = StockParse.str(raw["checkinTime"], raw["startedAt"])
        checkoutTime = StockParse.str(raw["checkoutTime"], raw["endedAt"])
        status = StockParse.str(raw["status"], raw["estatus"])
        isCheckinLate = (raw["isCheckinLate"] as? Bool) ?? false
        isCheckoutLate = (raw["isCheckoutLate"] as? Bool) ?? false
        notes = StockParse.str(raw["notes"], raw["notas"])
    }
}
