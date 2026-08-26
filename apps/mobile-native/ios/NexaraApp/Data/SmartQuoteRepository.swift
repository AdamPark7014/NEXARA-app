import Foundation

/// Cotizador inteligente — paridad Android `SmartQuoteRepository`.
final class SmartQuoteRepository {
    static let shared = SmartQuoteRepository()
    private let api = ApiClient.shared
    private init() {}

    func ctProductCount() async -> Int {
        do {
            let map = ConsoleHelpers.decodeMap(try await api.get("smart-quote/ct/status"))
            return ConsoleHelpers.mapInt(map, "total")
        } catch {
            return 0
        }
    }

    func facets() async throws -> (brands: [String], categories: [String]) {
        let map = ConsoleHelpers.decodeMap(try await api.get("smart-quote/facets"))
        let brands = (map["brands"] as? [[String: Any]] ?? []).compactMap { row -> String? in
            let n = ConsoleHelpers.mapStr(row, "name")
            return n.isEmpty ? nil : n
        }
        let categories = (map["categories"] as? [[String: Any]] ?? []).compactMap { row -> String? in
            let n = ConsoleHelpers.mapStr(row, "name")
            return n.isEmpty ? nil : n
        }
        return (brands, categories)
    }

    func search(
        query: String,
        margin: Int = 30,
        optimize: String = "BALANCE",
        brand: String? = nil,
        category: String? = nil,
        limit: Int = 40
    ) async throws -> [[String: Any]] {
        var q: [String: String] = [
            "optimize": optimize,
            "targetMargin": String(margin),
            "take": String(limit),
        ]
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { q["q"] = trimmed }
        if let brand, !brand.isEmpty { q["brand"] = brand }
        if let category, !category.isEmpty { q["category"] = category }

        let data = try await api.get("smart-quote/search", query: q)
        let map = ConsoleHelpers.decodeMap(data)
        if let rows = map["data"] as? [[String: Any]] { return rows }
        return ApiClient.decodeMapList(data)
    }

    func configureTemplate(template: String, margin: Int = 30) async throws -> [[String: Any]] {
        struct Body: Encodable {
            let template: String
            let targetMarginPercent: Int
            let optimize: String
            let includeLabor: Bool
        }
        let data = try await api.postJSON(
            "smart-quote/configure",
            body: Body(template: template, targetMarginPercent: margin, optimize: "BALANCE", includeLabor: true)
        )
        let map = ConsoleHelpers.decodeMap(data)
        if let lines = map["lines"] as? [[String: Any]] { return lines }
        if let cart = map["cart"] as? [[String: Any]] { return cart }
        return []
    }

    func checkMargin(unitCost: Double, unitPrice: Double, category: String?, brand: String?) async throws -> [String: Any] {
        struct Body: Encodable {
            let unitCost: Double
            let unitPrice: Double
            let category: String?
            let brand: String?
        }
        let data = try await api.postJSON(
            "smart-quote/rules/check-margin",
            body: Body(unitCost: unitCost, unitPrice: unitPrice, category: category, brand: brand)
        )
        return ConsoleHelpers.decodeMap(data)
    }

    func substitutes(clave: String, margin: Int = 30, optimize: String = "BALANCE") async throws -> [[String: Any]] {
        let data = try await api.get(
            "smart-quote/substitutes/\(clave)",
            query: ["optimize": optimize, "targetMargin": String(margin)]
        )
        let map = ConsoleHelpers.decodeMap(data)
        if let rows = map["data"] as? [[String: Any]] { return rows }
        return ApiClient.decodeMapList(data)
    }

    func laborSuggest(cart: [[String: Any]]) async throws -> [[String: Any]] {
        struct Line: Encodable {
            let name: String
            let qty: Int
            let category: String?
        }
        struct Body: Encodable { let lines: [Line] }
        let lines: [Line] = cart.map { row in
            Line(
                name: ConsoleHelpers.mapStr(row, "nombre", "name"),
                qty: max(1, ConsoleHelpers.mapInt(row, "qty", "quantity")),
                category: ConsoleHelpers.mapStr(row, "categoria", "category", "brand").nilIfEmpty
            )
        }
        let data = try await api.postJSON("smart-quote/labor/suggest", body: Body(lines: lines))
        if let rows = ConsoleHelpers.decodeMap(data)["items"] as? [[String: Any]] { return rows }
        return ApiClient.decodeMapList(data)
    }

    func copilotDraft(prompt: String) async throws -> [String: Any] {
        struct Body: Encodable { let prompt: String }
        let data = try await api.postJSON("smart-quote/copilot/draft", body: Body(prompt: prompt))
        return ConsoleHelpers.decodeMap(data)
    }

    func logisticsZones() async throws -> [[String: Any]] {
        let data = try await api.get("smart-quote/logistics")
        return ApiClient.decodeMapList(data)
    }

    func supplierStats(from: String? = nil, to: String? = nil) async throws -> [String: Any] {
        var q: [String: String] = [:]
        if let from { q["from"] = from }
        if let to { q["to"] = to }
        let data = try await api.get("smart-quote/supplier-stats", query: q)
        return ConsoleHelpers.decodeMap(data)
    }

    func ctOrderPreview(cotizacionId: Int) async throws -> [String: Any] {
        let data = try await api.get("smart-quote/ct/orders/preview/\(cotizacionId)")
        return ConsoleHelpers.decodeMap(data)
    }

    func submitCtOrder(cotizacionId: Int, almacen: String, confirmNow: Bool = false) async throws {
        struct Body: Encodable {
            let almacen: String
            let confirmNow: Bool
        }
        _ = try await api.postJSON(
            "smart-quote/ct/orders/\(cotizacionId)",
            body: Body(almacen: almacen, confirmNow: confirmNow)
        )
    }

    func confirmCtOrder(orderId: Int) async throws {
        struct Empty: Encodable {}
        _ = try await api.postJSON("smart-quote/ct/orders/confirm/\(orderId)", body: Empty())
    }

    func createQuote(
        quoteNumber: String,
        clientName: String,
        projectName: String?,
        items: [[String: Any]]
    ) async throws -> [String: Any] {
        struct Item: Encodable {
            let name: String
            let qty: Int
            let unitPrice: Double
            let discount: Double
            let tax: Double
            let description: String?
            let category: String?
            let brand: String?
            let sku: String?
            let partNumber: String?
            let unitCost: Double?
            let marginPercent: Double?
        }
        struct Body: Encodable {
            let quoteNumber: String
            let issueDate: String
            let validUntil: String
            let clientName: String
            let projectName: String?
            let currency: String
            let status: String
            let items: [Item]
        }

        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        let today = fmt.string(from: Date())
        let valid = fmt.string(from: Calendar.current.date(byAdding: .day, value: 15, to: Date()) ?? Date())
        let year = Calendar.current.component(.year, from: Date())
        let suffix = String(Int(Date().timeIntervalSince1970) % 1_000_000)
        let generatedQuoteNumber = "NXR-\(year)-\(suffix)"
        let finalQuoteNumber = quoteNumber.isEmpty ? generatedQuoteNumber : quoteNumber

        let encItems: [Item] = items.map { row in
            let cost = ConsoleHelpers.mapDouble(row, "costMxn", "unitCost")
            let price = ConsoleHelpers.mapDouble(row, "sellPriceSuggested", "unitPrice", "precio")
            let margin = ConsoleHelpers.mapDouble(row, "marginPercent")
            return Item(
                name: ConsoleHelpers.mapStr(row, "nombre", "name"),
                qty: max(1, ConsoleHelpers.mapInt(row, "qty", "quantity")),
                unitPrice: price,
                discount: 0,
                tax: 16,
                description: ConsoleHelpers.mapStr(row, "modelo", "description").nilIfEmpty,
                category: ConsoleHelpers.mapStr(row, "categoria", "category").nilIfEmpty,
                brand: ConsoleHelpers.mapStr(row, "marca", "brand").nilIfEmpty,
                sku: ConsoleHelpers.mapStr(row, "clave", "sku").nilIfEmpty,
                partNumber: ConsoleHelpers.mapStr(row, "numParte", "partNumber").nilIfEmpty,
                unitCost: cost > 0 ? cost : nil,
                marginPercent: margin > 0 ? margin : nil
            )
        }

        let data = try await api.postJSON(
            "cotizaciones",
            body: Body(
                quoteNumber: finalQuoteNumber,
                issueDate: today,
                validUntil: valid,
                clientName: clientName,
                projectName: projectName?.nilIfEmpty,
                currency: "MXN",
                status: "DRAFT",
                items: encItems
            )
        )
        return ConsoleHelpers.decodeMap(data)
    }
}
