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
