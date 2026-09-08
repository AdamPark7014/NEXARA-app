import Foundation

struct RequisitionItem: Hashable {
    let id: Int64?
    let reqNumber: String
    let title: String
    let description: String
    let status: String
    let requestedByName: String
    let requestedById: Int64?
    let departmentName: String
    let createdAt: String
    let priority: String

    var rowKey: String { "req-\(id ?? 0)-\(reqNumber)" }
    var displayTitle: String {
        if !title.isEmpty { return title }
        if !reqNumber.isEmpty { return reqNumber }
        return "Requisición"
    }
    var canDecide: Bool {
        let s = status.uppercased()
        return s == "PENDING" || s == "SUBMITTED"
    }

    func toFlatMap() -> [String: Any] {
        var out: [String: Any] = [
            "reqNumber": reqNumber, "number": reqNumber, "folio": reqNumber,
            "title": title, "description": description,
            "status": status, "estado": status,
            "requestedBy": requestedByName, "solicitante": requestedByName,
            "departmentName": departmentName, "createdAt": createdAt, "priority": priority,
        ]
        if let id { out["id"] = id }
        if let requestedById { out["requestedById"] = requestedById }
        return out
    }

    init(raw: [String: Any]) {
        let requestedBy = raw["requestedBy"] as? [String: Any]
        let department = raw["department"] as? [String: Any]
        id = StockParse.int64(raw["id"])
        reqNumber = StockParse.str(raw["reqNumber"], raw["number"], raw["folio"])
        title = StockParse.str(raw["title"], raw["titulo"])
        description = StockParse.str(raw["description"], raw["descripcion"])
        status = StockParse.str(raw["status"], raw["estado"])
        requestedByName = StockParse.str(
            requestedBy?["nombre"], requestedBy?["name"],
            raw["requestedByName"], raw["solicitante"], raw["requestedBy"]
        )
        requestedById = StockParse.int64(requestedBy?["id"] ?? raw["requestedById"])
        departmentName = StockParse.str(department?["name"], department?["nombre"], raw["departmentName"])
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
        priority = StockParse.str(raw["priority"], raw["prioridad"])
    }
}

struct PurchaseOrderItem: Hashable {
    let id: Int64?
    let poNumber: String
    let status: String
    let supplierName: String
    let supplierId: Int64?
    let totalAmount: Double?
    let createdAt: String
    let createdByName: String

    var rowKey: String { "po-\(id ?? 0)-\(poNumber)" }
    var displayTitle: String { poNumber.isEmpty ? "OC" : poNumber }

    func toFlatMap() -> [String: Any] {
        var out: [String: Any] = [
            "poNumber": poNumber, "number": poNumber, "folio": poNumber, "title": poNumber,
            "status": status, "estado": status,
            "supplierName": supplierName, "vendorName": supplierName,
            "createdAt": createdAt, "createdBy": createdByName,
        ]
        if let id { out["id"] = id }
        if let supplierId { out["supplierId"] = supplierId }
        if let totalAmount { out["totalAmount"] = totalAmount }
        return out
    }

    init(raw: [String: Any]) {
        let supplier = raw["supplier"] as? [String: Any]
        let createdBy = raw["createdBy"] as? [String: Any]
        id = StockParse.int64(raw["id"])
        poNumber = StockParse.str(raw["poNumber"], raw["number"], raw["folio"])
        status = StockParse.str(raw["status"], raw["estado"])
        supplierName = StockParse.str(
            supplier?["name"], supplier?["nombre"],
            raw["supplierName"], raw["vendorName"]
        )
        supplierId = StockParse.int64(supplier?["id"] ?? raw["supplierId"])
        totalAmount = StockParse.dbl(raw["totalAmount"], raw["amount"], raw["total"])
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
        createdByName = StockParse.str(createdBy?["nombre"], createdBy?["name"], raw["createdBy"])
    }
}

struct GoodsReceiptItem: Hashable {
    let id: Int64?
    let receiptNumber: String
    let status: String
    let warehouseName: String
    let poNumber: String
    let quantity: Double?
    let createdAt: String

    var rowKey: String { "gr-\(id ?? 0)-\(receiptNumber)" }
    var displayTitle: String {
        if !receiptNumber.isEmpty { return receiptNumber }
        if !poNumber.isEmpty { return poNumber }
        return "Recepción"
    }

    func toFlatMap() -> [String: Any] {
        var out: [String: Any] = [
            "receiptNumber": receiptNumber, "number": receiptNumber, "folio": receiptNumber,
            "title": displayTitle, "status": status, "estado": status,
            "warehouseName": warehouseName, "poNumber": poNumber, "createdAt": createdAt,
        ]
        if let id { out["id"] = id }
        if let quantity {
            out["quantity"] = quantity
            out["receivedQty"] = quantity
        }
        return out
    }

    init(raw: [String: Any]) {
        let warehouse = raw["warehouse"] as? [String: Any]
        let po = raw["purchaseOrder"] as? [String: Any]
        id = StockParse.int64(raw["id"])
        receiptNumber = StockParse.str(raw["receiptNumber"], raw["grNumber"], raw["number"], raw["folio"])
        status = StockParse.str(raw["status"], raw["estado"])
        warehouseName = StockParse.str(warehouse?["name"], warehouse?["nombre"], raw["warehouseName"])
        poNumber = StockParse.str(po?["poNumber"], raw["poNumber"], raw["purchaseOrderNumber"])
        quantity = StockParse.dbl(raw["quantity"], raw["receivedQty"], raw["totalItems"])
        createdAt = StockParse.str(raw["createdAt"], raw["receiptDate"], raw["fecha"])
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detalle de compras. El listado ya existía; lo que faltaba en el teléfono era
// poder abrir una orden y ver de qué se compone, quién la pidió y qué se ha
// recibido. Sin las partidas, "OC-0042 · $184,300" no es información suficiente
// para aprobar nada.
// ─────────────────────────────────────────────────────────────────────────────

/// Proveedor — GET /procurement/purchase-orders/suppliers
/// La API devuelve sólo `{id, name, description, apiUrl, rfc}` en esta ruta; no
/// trae las condiciones de mayorista, así que aquí tampoco se inventan.
struct SupplierItem: Hashable, Identifiable {
    let id: Int64
    let name: String
    let description: String
    let rfc: String
    let apiUrl: String
    let raw: [String: Any]

    var rowKey: String { "sup-\(id)" }
    var displayName: String { name.isEmpty ? "Proveedor \(id)" : name }
    /// Sin RFC el proveedor no puede salir en la DIOT; conviene que se vea.
    var missingRfc: Bool { rfc.isEmpty }

    static func == (lhs: SupplierItem, rhs: SupplierItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"], raw["nombre"])
        description = StockParse.str(raw["description"], raw["descripcion"])
        rfc = StockParse.str(raw["rfc"])
        apiUrl = StockParse.str(raw["apiUrl"])
    }
}

/// Evaluación de proveedor — GET /procurement/supplier-evaluations
struct SupplierEvaluation: Hashable, Identifiable {
    let id: Int64
    let supplierId: Int64?
    let supplierName: String
    let evaluationDate: String
    let qualityScore: Int
    let deliveryScore: Int
    let priceScore: Int
    let serviceScore: Int
    let overallScore: Double
    let notes: String
    let evaluatedByName: String

    var rowKey: String { "seval-\(id)" }
    var dateLabel: String { String(evaluationDate.prefix(10)) }
    var displaySupplier: String { supplierName.isEmpty ? "Proveedor" : supplierName }

    static func == (lhs: SupplierEvaluation, rhs: SupplierEvaluation) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        let supplier = raw["supplier"] as? [String: Any]
        let evaluatedBy = raw["evaluatedBy"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        supplierId = StockParse.int64(supplier?["id"] ?? raw["supplierId"])
        supplierName = StockParse.str(supplier?["name"], supplier?["nombre"], raw["supplierName"])
        evaluationDate = StockParse.str(raw["evaluationDate"], raw["fecha"], raw["createdAt"])
        qualityScore = StockParse.int(raw["qualityScore"]) ?? 0
        deliveryScore = StockParse.int(raw["deliveryScore"]) ?? 0
        priceScore = StockParse.int(raw["priceScore"]) ?? 0
        serviceScore = StockParse.int(raw["serviceScore"]) ?? 0
        overallScore = StockParse.dbl(raw["overallScore"]) ?? 0
        notes = StockParse.str(raw["notes"], raw["notas"])
        evaluatedByName = StockParse.str(evaluatedBy?["nombre"], evaluatedBy?["name"])
    }
}

/// Partida de una requisición, orden de compra o recepción.
/// Es un solo tipo para las tres porque la API usa los mismos nombres de campo
/// (`description`, `quantity`, `unitPrice`) y duplicar el modelo tres veces sólo
/// añadiría tres sitios donde equivocarse.
struct ProcurementLine: Hashable, Identifiable {
    let id: Int64
    let description: String
    let productName: String
    let sku: String
    let quantity: Double
    let receivedQty: Double
    let unitPrice: Double
    let total: Double
    let notes: String

    var rowKey: String { "pline-\(id)" }
    var displayDescription: String {
        if !description.isEmpty { return description }
        if !productName.isEmpty { return productName }
        return "Partida"
    }
    /// Sólo tiene sentido en órdenes de compra; en requisiciones vale 0.
    var isFullyReceived: Bool { quantity > 0 && receivedQty >= quantity }

    static func == (lhs: ProcurementLine, rhs: ProcurementLine) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        // Las líneas de recepción anidan la partida de la OC, y ahí es donde
        // vive la descripción de verdad.
        let poItem = raw["purchaseOrderItem"] as? [String: Any]
        let product = (raw["product"] as? [String: Any])
            ?? (poItem?["product"] as? [String: Any])
        id = StockParse.int64(raw["id"]) ?? 0
        description = StockParse.str(raw["description"], raw["descripcion"], poItem?["description"])
        productName = StockParse.str(product?["name"], product?["nombre"])
        sku = StockParse.str(product?["sku"], raw["sku"])
        quantity = StockParse.dbl(raw["quantity"], raw["quantityReceived"], raw["cantidad"]) ?? 0
        receivedQty = StockParse.dbl(raw["receivedQty"], raw["quantityReceived"]) ?? 0
        unitPrice = StockParse.dbl(raw["unitPrice"], raw["estimatedCost"], poItem?["unitPrice"]) ?? 0
        total = StockParse.dbl(raw["total"]) ?? 0
        notes = StockParse.str(raw["notes"], raw["notas"], raw["lotNumber"])
    }
}

/// Orden de compra con partidas — GET /procurement/purchase-orders/:id
struct PurchaseOrderDetail: Hashable {
    let id: Int64
    let poNumber: String
    let status: String
    let supplierName: String
    let supplierRfc: String
    let orderDate: String
    let expectedDate: String
    let subtotal: Double
    let taxAmount: Double
    let totalAmount: Double
    let currency: String
    let paymentTerms: String
    let notes: String
    let createdByName: String
    let approvedByName: String
    let approvedAt: String
    let requisitionNumber: String
    let items: [ProcurementLine]
    let receiptsCount: Int
    let hasData: Bool

    var displayTitle: String { poNumber.isEmpty ? "OC \(id)" : poNumber }
    /// La API exige el permiso `PROCUREMENT_APPROVE` y sólo tiene sentido sobre
    /// órdenes que aún no lo están.
    var canApprove: Bool {
        let s = status.uppercased()
        return s == "DRAFT" || s == "PENDING" || s == "PENDING_APPROVAL" || s == "SUBMITTED"
    }

    static func == (lhs: PurchaseOrderDetail, rhs: PurchaseOrderDetail) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        let supplier = raw["supplier"] as? [String: Any]
        let createdBy = raw["createdBy"] as? [String: Any]
        let approvedBy = raw["approvedBy"] as? [String: Any]
        let requisition = raw["requisition"] as? [String: Any]
        hasData = !raw.isEmpty
        id = StockParse.int64(raw["id"]) ?? 0
        poNumber = StockParse.str(raw["poNumber"], raw["number"], raw["folio"])
        status = StockParse.str(raw["status"], raw["estado"])
        supplierName = StockParse.str(supplier?["name"], supplier?["nombre"], raw["supplierName"])
        supplierRfc = StockParse.str(supplier?["rfc"])
        orderDate = StockParse.str(raw["orderDate"], raw["createdAt"], raw["fecha"])
        expectedDate = StockParse.str(raw["expectedDate"])
        subtotal = StockParse.dbl(raw["subtotal"]) ?? 0
        taxAmount = StockParse.dbl(raw["taxAmount"]) ?? 0
        totalAmount = StockParse.dbl(raw["totalAmount"], raw["total"]) ?? 0
        currency = StockParse.str(raw["currency"], raw["moneda"])
        paymentTerms = StockParse.str(raw["paymentTerms"])
        notes = StockParse.str(raw["notes"], raw["notas"])
        createdByName = StockParse.str(createdBy?["nombre"], createdBy?["name"])
        approvedByName = StockParse.str(approvedBy?["nombre"], approvedBy?["name"])
        approvedAt = StockParse.str(raw["approvedAt"])
        requisitionNumber = StockParse.str(requisition?["reqNumber"])
        items = (raw["items"] as? [[String: Any]] ?? []).map { ProcurementLine(raw: $0) }
        receiptsCount = (raw["receipts"] as? [[String: Any]])?.count ?? 0
    }
}

/// Requisición con partidas — GET /procurement/requisitions/:id
struct RequisitionDetail: Hashable {
    let id: Int64
    let reqNumber: String
    let title: String
    let description: String
    let status: String
    let priority: String
    let requiredDate: String
    let requestedByName: String
    let approvedByName: String
    let approvedAt: String
    let rejectionReason: String
    let departmentName: String
    let createdAt: String
    let items: [ProcurementLine]
    let hasData: Bool

    var displayTitle: String {
        if !title.isEmpty { return title }
        if !reqNumber.isEmpty { return reqNumber }
        return "Requisición \(id)"
    }
    /// Suma estimada: la requisición no lleva total, lo llevan sus partidas.
    var estimatedTotal: Double {
        items.reduce(0) { $0 + ($1.unitPrice * ($1.quantity > 0 ? $1.quantity : 1)) }
    }
    var canDecide: Bool {
        let s = status.uppercased()
        return s == "PENDING" || s == "SUBMITTED"
    }

    static func == (lhs: RequisitionDetail, rhs: RequisitionDetail) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        let requestedBy = raw["requestedBy"] as? [String: Any]
        let approvedBy = raw["approvedBy"] as? [String: Any]
        let department = raw["department"] as? [String: Any]
        hasData = !raw.isEmpty
        id = StockParse.int64(raw["id"]) ?? 0
        reqNumber = StockParse.str(raw["reqNumber"], raw["number"], raw["folio"])
        title = StockParse.str(raw["title"], raw["titulo"])
        description = StockParse.str(raw["description"], raw["descripcion"])
        status = StockParse.str(raw["status"], raw["estado"])
        priority = StockParse.str(raw["priority"], raw["prioridad"])
        requiredDate = StockParse.str(raw["requiredDate"])
        requestedByName = StockParse.str(requestedBy?["nombre"], requestedBy?["name"])
        approvedByName = StockParse.str(approvedBy?["nombre"], approvedBy?["name"])
        approvedAt = StockParse.str(raw["approvedAt"])
        rejectionReason = StockParse.str(raw["rejectionReason"])
        departmentName = StockParse.str(department?["name"], department?["nombre"])
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
        items = (raw["items"] as? [[String: Any]] ?? []).map { ProcurementLine(raw: $0) }
    }
}

/// Recepción de mercancía con partidas — GET /procurement/goods-receipts/:id
struct GoodsReceiptDetail: Hashable {
    let id: Int64
    let receiptNumber: String
    let receiptDate: String
    let warehouseName: String
    let poNumber: String
    let supplierName: String
    let receivedByName: String
    let notes: String
    let freightCost: Double
    let insuranceCost: Double
    let customsCost: Double
    let otherLandedCost: Double
    let items: [ProcurementLine]
    let hasData: Bool

    var displayTitle: String { receiptNumber.isEmpty ? "Recepción \(id)" : receiptNumber }
    var dateLabel: String { String(receiptDate.prefix(10)) }
    /// Landed cost total: flete + seguro + aduana + otros. Se prorratea sobre el
    /// costo unitario, así que cambia el valor del inventario recibido.
    var landedCostTotal: Double { freightCost + insuranceCost + customsCost + otherLandedCost }
    var totalReceived: Double { items.reduce(0) { $0 + $1.quantity } }

    static func == (lhs: GoodsReceiptDetail, rhs: GoodsReceiptDetail) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        let warehouse = raw["warehouse"] as? [String: Any]
        let po = raw["purchaseOrder"] as? [String: Any]
        let supplier = po?["supplier"] as? [String: Any]
        let receivedBy = raw["receivedBy"] as? [String: Any]
        hasData = !raw.isEmpty
        id = StockParse.int64(raw["id"]) ?? 0
        receiptNumber = StockParse.str(raw["receiptNumber"], raw["number"], raw["folio"])
        receiptDate = StockParse.str(raw["receiptDate"], raw["createdAt"], raw["fecha"])
        warehouseName = StockParse.str(warehouse?["name"], warehouse?["nombre"])
        poNumber = StockParse.str(po?["poNumber"], raw["poNumber"])
        supplierName = StockParse.str(supplier?["name"], supplier?["nombre"])
        receivedByName = StockParse.str(receivedBy?["nombre"], receivedBy?["name"])
        notes = StockParse.str(raw["notes"], raw["notas"])
        freightCost = StockParse.dbl(raw["freightCost"]) ?? 0
        insuranceCost = StockParse.dbl(raw["insuranceCost"]) ?? 0
        customsCost = StockParse.dbl(raw["customsCost"]) ?? 0
        otherLandedCost = StockParse.dbl(raw["otherLandedCost"]) ?? 0
        items = (raw["items"] as? [[String: Any]] ?? []).map { ProcurementLine(raw: $0) }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RFQ — petición de cotización a varios proveedores.
// Lo interesante en un móvil no es capturar precios (eso es teclear una tabla),
// sino la comparativa: la API ya calcula quién sale más barato y quién entrega
// antes, y esa es una decisión que sí se toma de pie delante de un almacén.
// ─────────────────────────────────────────────────────────────────────────────

/// Cabecera de RFQ — GET /procurement/rfq
struct RfqItem: Hashable, Identifiable {
    let id: Int64
    let rfqNumber: String
    let status: String
    let dueDate: String
    let notes: String
    let requisitionNumber: String
    let requisitionTitle: String
    let linesCount: Int
    let createdAt: String

    var rowKey: String { "rfq-\(id)" }
    var displayTitle: String { rfqNumber.isEmpty ? "RFQ \(id)" : rfqNumber }
    var dueLabel: String { String(dueDate.prefix(10)) }
    var isAwarded: Bool { status.uppercased() == "AWARDED" }
    var isCancelled: Bool { status.uppercased() == "CANCELLED" }

    static func == (lhs: RfqItem, rhs: RfqItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        let req = raw["requisition"] as? [String: Any]
        let count = raw["_count"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        rfqNumber = StockParse.str(raw["rfqNumber"], raw["number"], raw["folio"])
        status = StockParse.str(raw["status"], raw["estado"])
        dueDate = StockParse.str(raw["dueDate"])
        notes = StockParse.str(raw["notes"], raw["notas"])
        requisitionNumber = StockParse.str(req?["reqNumber"])
        requisitionTitle = StockParse.str(req?["title"])
        linesCount = StockParse.int(count?["lines"], raw["linesCount"]) ?? 0
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
    }
}

/// Línea cotizada por un proveedor dentro de una RFQ.
struct RfqQuoteLine: Hashable, Identifiable {
    let id: Int64
    let supplierId: Int64?
    let supplierName: String
    let description: String
    let productName: String
    let sku: String
    let quantity: Double
    let unitPrice: Double?
    let leadTimeDays: Int?
    let quotedAt: String
    let notes: String

    var rowKey: String { "rfql-\(id)" }
    /// `unitPrice` nulo significa "el proveedor todavía no cotizó", que no es lo
    /// mismo que "cotizó cero". Por eso es opcional y no un 0.
    var isQuoted: Bool { unitPrice != nil }
    var lineTotal: Double? {
        guard let unitPrice else { return nil }
        return unitPrice * quantity
    }
    var displayDescription: String {
        if !description.isEmpty { return description }
        if !productName.isEmpty { return productName }
        return "Partida"
    }

    static func == (lhs: RfqQuoteLine, rhs: RfqQuoteLine) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        let supplier = raw["supplier"] as? [String: Any]
        let product = raw["product"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        supplierId = StockParse.int64(supplier?["id"] ?? raw["supplierId"])
        supplierName = StockParse.str(supplier?["name"], supplier?["nombre"])
        description = StockParse.str(raw["description"], raw["descripcion"])
        productName = StockParse.str(product?["name"], product?["nombre"])
        sku = StockParse.str(product?["sku"])
        quantity = StockParse.dbl(raw["quantity"], raw["cantidad"]) ?? 0
        unitPrice = StockParse.dbl(raw["unitPrice"])
        leadTimeDays = StockParse.int(raw["leadTimeDays"])
        quotedAt = StockParse.str(raw["quotedAt"])
        notes = StockParse.str(raw["notes"], raw["notas"])
    }
}

/// Un proveedor dentro de la comparativa de una RFQ.
struct RfqSupplierQuote: Hashable, Identifiable {
    let supplierId: Int64
    let supplierName: String
    let totalPrice: Double
    let maxLeadTimeDays: Int
    let quotedLines: Int
    let totalLines: Int
    let lines: [RfqQuoteLine]

    var id: Int64 { supplierId }
    var rowKey: String { "rfqs-\(supplierId)" }
    /// La API ordena primero a los que cotizaron todo; una cotización parcial no
    /// se puede adjudicar, y decirlo evita comparar peras con manzanas.
    var isComplete: Bool { totalLines > 0 && quotedLines == totalLines }
    var coverageLabel: String { "\(quotedLines)/\(totalLines) partidas" }

    static func == (lhs: RfqSupplierQuote, rhs: RfqSupplierQuote) -> Bool { lhs.supplierId == rhs.supplierId }
    func hash(into hasher: inout Hasher) { hasher.combine(supplierId) }

    init(raw: [String: Any]) {
        supplierId = StockParse.int64(raw["supplierId"]) ?? 0
        supplierName = StockParse.str(raw["supplierName"], raw["name"])
        totalPrice = StockParse.dbl(raw["totalPrice"]) ?? 0
        maxLeadTimeDays = StockParse.int(raw["maxLeadTimeDays"]) ?? 0
        quotedLines = StockParse.int(raw["quotedLines"]) ?? 0
        totalLines = StockParse.int(raw["totalLines"]) ?? 0
        lines = (raw["lines"] as? [[String: Any]] ?? []).map { RfqQuoteLine(raw: $0) }
    }
}

/// Comparativa completa — GET /procurement/rfq/:id/compare
/// El "mejor precio" y el "mejor plazo" los decide la API; no se recalculan
/// aquí para que el teléfono y la web no puedan recomendar proveedores
/// distintos sobre los mismos datos.
struct RfqComparison: Hashable {
    let rfqNumber: String
    let status: String
    let requisitionNumber: String
    let suppliers: [RfqSupplierQuote]
    let bestPriceSupplierId: Int64?
    let bestLeadTimeSupplierId: Int64?
    let awardedPoNumber: String
    let hasData: Bool

    var isAwarded: Bool { status.uppercased() == "AWARDED" }

    static func == (lhs: RfqComparison, rhs: RfqComparison) -> Bool {
        lhs.rfqNumber == rhs.rfqNumber && lhs.suppliers.count == rhs.suppliers.count
    }

    func hash(into hasher: inout Hasher) { hasher.combine(rfqNumber) }

    init(raw: [String: Any]) {
        let rfq = raw["rfq"] as? [String: Any]
        let req = rfq?["requisition"] as? [String: Any]
        let awarded = rfq?["awardedPurchaseOrder"] as? [String: Any]
        hasData = !raw.isEmpty
        rfqNumber = StockParse.str(rfq?["rfqNumber"])
        status = StockParse.str(rfq?["status"])
        requisitionNumber = StockParse.str(req?["reqNumber"])
        suppliers = (raw["suppliers"] as? [[String: Any]] ?? []).map { RfqSupplierQuote(raw: $0) }
        bestPriceSupplierId = StockParse.int64(raw["bestPriceSupplierId"])
        bestLeadTimeSupplierId = StockParse.int64(raw["bestLeadTimeSupplierId"])
        awardedPoNumber = StockParse.str(awarded?["poNumber"])
    }
}
