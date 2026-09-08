import Foundation

/// Consumo de un mes por métrica — `usage30d` de `GET company/billing`.
struct CompanyUsageMetric: Hashable, Identifiable {
    let metric: String
    let quantity: Double
    var id: String { metric }

    var quantityText: String {
        quantity == quantity.rounded()
            ? String(Int(quantity))
            : String(format: "%.2f", quantity)
    }

    /// `active_users` → «Active users». Las claves vienen en snake_case.
    var displayMetric: String {
        let words = metric.replacingOccurrences(of: "_", with: " ")
        guard let first = words.first else { return metric }
        return String(first).uppercased() + String(words.dropFirst())
    }

    init(raw: [String: Any]) {
        metric = StockParse.str(raw["metric"], raw["nombre"], raw["name"])
        quantity = StockParse.dbl(raw["quantity"], raw["cantidad"], raw["count"]) ?? 0
    }
}

/// Plan y asientos del tenant — `GET company/billing`.
///
/// Solo lectura en el teléfono. El alta de suscripción y el portal de pago
/// (`company/billing/checkout` y `company/billing/portal`) mueven dinero y
/// quedan fuera a propósito: se hacen desde la web.
struct CompanyBillingState: Hashable {
    let planCode: String
    let billingStatus: String
    let seatLimit: Int
    let seatsUsed: Int
    let stripeConfigured: Bool
    let stripeHasSubscription: Bool
    let usage30d: [CompanyUsageMetric]

    var isEmpty: Bool { planCode.isEmpty && seatLimit == 0 && usage30d.isEmpty }

    var planLabel: String { planCode.isEmpty ? "Sin plan" : planCode.uppercased() }

    var statusLabel: String {
        switch billingStatus.lowercased() {
        case "active": return "Activa"
        case "trialing", "trial": return "En prueba"
        case "past_due": return "Pago vencido"
        case "canceled", "cancelled": return "Cancelada"
        case "": return "—"
        default: return billingStatus
        }
    }

    /// Asientos usados sobre el límite. Sin límite configurado no se inventa
    /// un porcentaje: se dice cuántos hay y ya.
    var seatsText: String {
        seatLimit > 0 ? "\(seatsUsed) / \(seatLimit)" : "\(seatsUsed)"
    }

    /// Ocupación 0…1 para la barra; `nil` cuando no hay límite que comparar.
    var seatUsageRatio: Double? {
        guard seatLimit > 0 else { return nil }
        return min(Double(seatsUsed) / Double(seatLimit), 1)
    }

    var seatsExhausted: Bool { seatLimit > 0 && seatsUsed >= seatLimit }

    init(raw: [String: Any]) {
        let company = raw["company"] as? [String: Any] ?? [:]
        let seats = raw["seats"] as? [String: Any] ?? [:]
        let stripe = raw["stripe"] as? [String: Any] ?? [:]
        planCode = StockParse.str(company["planCode"], raw["planCode"])
        billingStatus = StockParse.str(company["billingStatus"], raw["billingStatus"])
        seatLimit = StockParse.int(seats["limit"], company["seatLimit"], raw["seatLimit"]) ?? 0
        seatsUsed = StockParse.int(seats["used"], raw["seatsUsed"]) ?? 0
        stripeConfigured = UsersAdminParse.bool(stripe["configured"])
        stripeHasSubscription = UsersAdminParse.bool(stripe["hasSubscription"])
        usage30d = (raw["usage30d"] as? [[String: Any]] ?? []).map { CompanyUsageMetric(raw: $0) }
    }
}

/// Ámbitos que puede llevar una llave de API — `GET company/api-keys/catalog`.
///
/// Hasta ahora el formulario de «nueva llave» de iOS creaba la llave sin
/// ámbitos porque no tenía de dónde sacar la lista, y una llave sin ámbitos no
/// abre nada. Esto es esa lista.
struct CompanyApiScopeCatalog: Hashable {
    let scopes: [String]

    var isEmpty: Bool { scopes.isEmpty }

    init(raw: [String: Any]) {
        if let list = raw["scopes"] as? [Any] {
            scopes = list.compactMap { $0 as? String }.filter { !$0.isEmpty }
        } else {
            scopes = []
        }
    }

    /// Catálogo vacío cuando el API no responde: el formulario sigue sirviendo
    /// sin selector de ámbitos, como antes.
    init() { scopes = [] }
}
