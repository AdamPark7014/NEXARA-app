import Foundation

/// Perfil portal cliente/sucursal — GET client-portal|branch-portal/profile
struct PortalClientProfile: Hashable {
    let id: Int64
    let name: String
    let logoUrl: String
    let contactName: String
    let contactEmail: String
    let contactPhone: String
    let address: String
    let city: String
    let state: String
    let country: String
    let branchNumber: String
    let raw: [String: Any]

    static func == (lhs: PortalClientProfile, rhs: PortalClientProfile) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"], raw["nombre"])
        logoUrl = StockParse.str(raw["logoUrl"])
        contactName = StockParse.str(raw["contactName"])
        contactEmail = StockParse.str(raw["contactEmail"])
        contactPhone = StockParse.str(raw["contactPhone"])
        address = StockParse.str(raw["address"], raw["direccion"])
        city = StockParse.str(raw["city"], raw["ciudad"])
        state = StockParse.str(raw["state"], raw["estado"])
        country = StockParse.str(raw["country"], raw["pais"])
        branchNumber = StockParse.str(raw["branchNumber"])
    }
}

/// Sucursal portal — GET /client-portal/branches
struct PortalBranch: Hashable, Identifiable {
    let id: Int64
    let name: String
    let branchNumber: String
    let address: String
    let city: String
    let state: String
    let country: String
    let placeId: String
    let latitud: Double?
    let longitud: Double?
    let portalEmail: String
    let logoUrl: String
    let isActive: Bool
    let raw: [String: Any]

    var rowKey: String { "br-\(id)" }
    var subtitle: String {
        let a = branchNumber.isEmpty ? "" : branchNumber
        let b = city.isEmpty ? "" : city
        if !a.isEmpty && !b.isEmpty { return "\(a) · \(b)" }
        return a.isEmpty ? b : a
    }

    static func == (lhs: PortalBranch, rhs: PortalBranch) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"], raw["nombre"])
        branchNumber = StockParse.str(raw["branchNumber"], raw["numero"])
        address = StockParse.str(raw["address"], raw["direccion"])
        city = StockParse.str(raw["city"], raw["ciudad"])
        state = StockParse.str(raw["state"], raw["estado"])
        country = StockParse.str(raw["country"], raw["pais"])
        placeId = StockParse.str(raw["placeId"])
        latitud = StockParse.dbl(raw["latitud"], raw["lat"])
        longitud = StockParse.dbl(raw["longitud"], raw["lng"], raw["lon"])
        portalEmail = StockParse.str(raw["portalEmail"], raw["email"])
        logoUrl = StockParse.str(raw["logoUrl"])
        if let b = raw["isActive"] as? Bool {
            isActive = b
        } else {
            let s = StockParse.str(raw["isActive"], raw["activo"]).lowercased()
            isActive = s.isEmpty || s == "true" || s == "1" || s == "yes"
        }
    }
}
