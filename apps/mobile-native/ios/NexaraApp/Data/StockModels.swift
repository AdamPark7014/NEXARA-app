import Foundation

/// Bodega tipada — GET /warehouse
struct WarehouseItem: Hashable {
    let id: Int64?
    let code: String
    let name: String
    let address: String?
    let city: String?
    let state: String?
    let isActive: Bool
    let managerName: String?
    let locationsCount: Int
    let stockLevelsCount: Int

    var rowKey: String { "\(id ?? 0)-\(code)" }

    var label: String {
        if !name.isEmpty && !code.isEmpty { return "\(name) (\(code))" }
        if !name.isEmpty { return name }
        if !code.isEmpty { return code }
        return "Bodega"
    }

    func toFlatMap() -> [String: Any] {
        var out: [String: Any] = [
            "code": code,
            "name": name,
            "nombre": name,
            "isActive": isActive,
            "locationsCount": locationsCount,
            "stockLevelsCount": stockLevelsCount,
        ]
        if let id { out["id"] = id }
        if let address { out["address"] = address }
        if let city { out["city"] = city }
        if let state { out["state"] = state }
        if let managerName { out["managerName"] = managerName }
        return out
    }

    init(raw: [String: Any]) {
        let manager = raw["manager"] as? [String: Any]
        let count = raw["_count"] as? [String: Any]
        id = StockParse.int64(raw["id"])
        code = StockParse.str(raw["code"], raw["codigo"])
        name = StockParse.str(raw["name"], raw["nombre"])
        address = StockParse.str(raw["address"], raw["direccion"]).nilIfEmpty
        city = StockParse.str(raw["city"], raw["ciudad"]).nilIfEmpty
        state = StockParse.str(raw["state"], raw["estado"]).nilIfEmpty
        isActive = (raw["isActive"] as? Bool) ?? (raw["activo"] as? Bool) ?? true
        managerName = StockParse.str(manager?["nombre"], manager?["name"], raw["managerName"]).nilIfEmpty
        locationsCount = Int(StockParse.dbl(count?["locations"], raw["locationsCount"]) ?? 0)
        stockLevelsCount = Int(StockParse.dbl(count?["stockLevels"], raw["stockLevelsCount"]) ?? 0)
    }
}

/// Producto de catálogo — GET /catalog/products
struct CatalogProduct: Hashable {
    let id: Int64?
    let name: String
    let sku: String
    let category: String?
    let price: Double?
    let unit: String?
    let isActive: Bool

    var rowKey: String { "\(id ?? 0)-\(sku)" }

    var label: String {
        if !sku.isEmpty { return "\(name) (\(sku))" }
        return name.isEmpty ? "Producto" : name
    }

    func toFlatMap() -> [String: Any] {
        var out: [String: Any] = [
            "name": name,
            "productName": name,
            "nombre": name,
            "sku": sku,
            "code": sku,
            "isActive": isActive,
        ]
        if let id {
            out["id"] = id
            out["productId"] = id
        }
        if let category { out["category"] = category }
        if let price { out["price"] = price }
        if let unit { out["unit"] = unit }
        return out
    }

    init(raw: [String: Any]) {
        id = StockParse.int64(raw["id"] ?? raw["productId"])
        name = StockParse.str(raw["name"], raw["nombre"], raw["productName"])
        sku = StockParse.str(raw["sku"], raw["code"], raw["codigo"])
        category = StockParse.str(raw["category"], raw["categoria"]).nilIfEmpty
        price = StockParse.dbl(raw["price"], raw["precio"], raw["unitPrice"])
        unit = StockParse.str(raw["unit"], raw["unidad"]).nilIfEmpty
        isActive = (raw["isActive"] as? Bool) ?? (raw["activo"] as? Bool) ?? true
    }
}

/// Nivel de stock aplanado para UI WMS (product/warehouse anidados → campos planos).
struct StockLevel: Hashable {
    let id: Int64?
    let productId: Int64?
    let warehouseId: Int64?
    let name: String
    let sku: String
    let quantity: Double
    let reorderPoint: Double?
    let minStock: Double?
    let warehouseName: String?
    let location: String?
    let category: String?
    let price: Double?

    var isLow: Bool {
        let threshold = reorderPoint ?? minStock ?? 0
        return threshold > 0 && quantity <= threshold
    }

    /// Clave estable para ForEach cuando id es nil.
    var rowKey: String {
        "\(id ?? 0)-\(productId ?? 0)-\(sku)-\(warehouseId ?? 0)"
    }

    func toFlatMap() -> [String: Any] {
        var out: [String: Any] = [
            "name": name,
            "productName": name,
            "sku": sku,
            "code": sku,
            "quantity": quantity,
            "cantidad": quantity,
        ]
        if let id { out["id"] = id }
        if let productId { out["productId"] = productId }
        if let warehouseId { out["warehouseId"] = warehouseId }
        if let reorderPoint {
            out["reorderPoint"] = reorderPoint
            out["minStock"] = minStock ?? reorderPoint
        }
        if let warehouseName {
            out["warehouseName"] = warehouseName
            out["bodega"] = warehouseName
        }
        if let location {
            out["location"] = location
            out["ubicacion"] = location
        } else if let warehouseName {
            out["ubicacion"] = warehouseName
        }
        if let category { out["category"] = category }
        if let price { out["price"] = price }
        return out
    }

    init(raw: [String: Any]) {
        let product = raw["product"] as? [String: Any]
        let warehouse = raw["warehouse"] as? [String: Any]
        let locationObj = raw["location"] as? [String: Any]

        id = StockParse.int64(raw["id"])
        productId = StockParse.int64(product?["id"] ?? raw["productId"])
        warehouseId = StockParse.int64(warehouse?["id"] ?? raw["warehouseId"])
        name = StockParse.str(product?["name"], product?["nombre"], raw["name"], raw["productName"], raw["nombre"])
        sku = StockParse.str(product?["sku"], product?["code"], raw["sku"], raw["code"])
        quantity = StockParse.dbl(raw["quantity"], raw["cantidad"]) ?? 0
        let reorder = StockParse.dbl(raw["reorderPoint"], raw["minStock"])
        reorderPoint = reorder
        minStock = StockParse.dbl(raw["minStock"]) ?? reorder
        warehouseName = StockParse.str(warehouse?["name"], warehouse?["nombre"], raw["warehouseName"], raw["bodega"]).nilIfEmpty
        location = StockParse.str(
            locationObj?["code"], locationObj?["name"],
            (raw["location"] as? String)
        ).nilIfEmpty
        category = StockParse.str(product?["category"], product?["categoria"], raw["category"]).nilIfEmpty
        price = StockParse.dbl(product?["price"], raw["price"])
    }
}

struct StockMovement: Hashable {
    let id: Int64?
    let type: String
    let productId: Int64?
    let productName: String
    let sku: String
    let quantity: Double
    let fromWarehouseId: Int64?
    let toWarehouseId: Int64?
    let fromWarehouseName: String?
    let toWarehouseName: String?
    let reference: String?
    let notes: String?
    let createdAt: String?

    var rowKey: String { "\(id ?? 0)-\(type)-\(createdAt ?? "")" }

    func toFlatMap() -> [String: Any] {
        var out: [String: Any] = [
            "type": type,
            "name": productName,
            "productName": productName,
            "sku": sku,
            "quantity": quantity,
        ]
        if let id { out["id"] = id }
        if let productId { out["productId"] = productId }
        if let fromWarehouseId { out["fromWarehouseId"] = fromWarehouseId }
        if let toWarehouseId { out["toWarehouseId"] = toWarehouseId }
        if let fromWarehouseName { out["fromWarehouseName"] = fromWarehouseName }
        if let toWarehouseName { out["toWarehouseName"] = toWarehouseName }
        if let reference { out["reference"] = reference }
        if let notes { out["notes"] = notes }
        if let createdAt { out["createdAt"] = createdAt }
        return out
    }

    init(raw: [String: Any]) {
        let product = raw["product"] as? [String: Any]
        let fromWh = raw["fromWarehouse"] as? [String: Any]
        let toWh = raw["toWarehouse"] as? [String: Any]
        id = StockParse.int64(raw["id"])
        type = StockParse.str(raw["type"], raw["movementType"])
        productId = StockParse.int64(product?["id"] ?? raw["productId"])
        productName = StockParse.str(product?["name"], raw["productName"], raw["name"])
        sku = StockParse.str(product?["sku"], raw["sku"])
        quantity = StockParse.dbl(raw["quantity"], raw["cantidad"]) ?? 0
        fromWarehouseId = StockParse.int64(fromWh?["id"] ?? raw["fromWarehouseId"])
        toWarehouseId = StockParse.int64(toWh?["id"] ?? raw["toWarehouseId"])
        fromWarehouseName = StockParse.str(fromWh?["name"], raw["fromWarehouseName"]).nilIfEmpty
        toWarehouseName = StockParse.str(toWh?["name"], raw["toWarehouseName"]).nilIfEmpty
        reference = StockParse.str(raw["reference"], raw["ref"]).nilIfEmpty
        notes = StockParse.str(raw["notes"]).nilIfEmpty
        createdAt = StockParse.str(raw["createdAt"], raw["date"]).nilIfEmpty
    }
}

enum StockParse {
    static func str(_ values: Any?...) -> String {
        for v in values {
            if let s = v as? String, !s.isEmpty, s != "null" { return s }
            if let n = v as? NSNumber { return n.stringValue }
        }
        return ""
    }

    static func dbl(_ values: Any?...) -> Double? {
        for v in values {
            if let n = v as? Double { return n }
            if let n = v as? NSNumber { return n.doubleValue }
            if let s = v as? String, let d = Double(s) { return d }
        }
        return nil
    }

    static func int64(_ values: Any?...) -> Int64? {
        for value in values {
            if let n = value as? Int64 { return n }
            if let n = value as? Int { return Int64(n) }
            if let n = value as? NSNumber { return n.int64Value }
            if let s = value as? String, let n = Int64(s) { return n }
        }
        return nil
    }

    static func int(_ values: Any?...) -> Int? {
        for v in values {
            if let n = int64(v) { return Int(n) }
        }
        return nil
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
