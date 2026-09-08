import Foundation

/// Gobierno de empresa: ficha del tenant, alta/baja de empresas del grupo,
/// empresa principal, catálogo de ámbitos de API y estado de facturación.
///
/// Lo que NO está aquí, a propósito: `POST company/billing/checkout` y
/// `POST company/billing/portal`. Los dos abren un flujo de pago de Stripe;
/// contratar o cambiar una suscripción desde el teléfono necesita autorización
/// del dueño, así que la pantalla enseña el plan y remite a la web.
final class CompanyAdminRepository {
    static let shared = CompanyAdminRepository()
    private let api = ApiClient.shared
    private init() {}

    // MARK: Ficha del tenant

    /// `GET company` — devuelve **una** empresa (la activa, o la del `id`), no
    /// una lista: el controlador resuelve con `service.resolve(id?)`.
    /// La lista completa del grupo es `company/list`, en `ExtraRepository`.
    func currentCompany(id: Int64? = nil) async throws -> Company {
        var query: [String: String] = [:]
        if let id, id > 0 { query["id"] = String(id) }
        let data = try await api.get("company", query: query)
        return Company(raw: ConsoleHelpers.decodeMap(data))
    }

    /// `PATCH company/:id` — datos fiscales y de contacto. Los campos vacíos no
    /// se mandan: el API hace merge y un `""` borraría el valor guardado.
    func updateCompany(
        id: Int64,
        legalName: String?,
        tradeName: String?,
        rfc: String?,
        fiscalRegime: String?,
        email: String?,
        phone: String?,
        address: String?,
        city: String?,
        state: String?
    ) async throws -> Company {
        var body: [String: String] = [:]
        if let v = legalName?.nilIfEmpty { body["legalName"] = v }
        if let v = tradeName?.nilIfEmpty { body["tradeName"] = v }
        if let v = rfc?.nilIfEmpty { body["rfc"] = v }
        if let v = fiscalRegime?.nilIfEmpty { body["fiscalRegime"] = v }
        if let v = email?.nilIfEmpty { body["email"] = v }
        if let v = phone?.nilIfEmpty { body["phone"] = v }
        if let v = address?.nilIfEmpty { body["address"] = v }
        if let v = city?.nilIfEmpty { body["city"] = v }
        if let v = state?.nilIfEmpty { body["state"] = v }
        let data = try await api.patchJSON("company/\(id)", body: body)
        return Company(raw: ConsoleHelpers.decodeMap(data))
    }

    /// `PATCH company/:id/active` — paridad con `setCompanyActive` de Android.
    func setCompanyActive(id: Int64, isActive: Bool) async throws {
        struct Body: Encodable { let isActive: Bool }
        _ = try await api.patchJSON("company/\(id)/active", body: Body(isActive: isActive))
    }

    /// `PATCH company/:id/primary` — cambia cuál es la empresa principal del
    /// grupo. Afecta a todo el mundo, así que la vista lo pide por confirmación.
    func setCompanyPrimary(id: Int64) async throws {
        _ = try await api.patchJSON("company/\(id)/primary", body: EmptyBody())
    }

    // MARK: Integraciones y facturación

    /// `GET company/api-keys/catalog` — ámbitos disponibles para una llave.
    /// Si falla se devuelve el catálogo vacío: el alta de llave debe seguir
    /// funcionando aunque no haya selector, como funcionaba antes.
    func apiKeyScopeCatalog() async throws -> CompanyApiScopeCatalog {
        let data = try await api.get("company/api-keys/catalog")
        return CompanyApiScopeCatalog(raw: ConsoleHelpers.decodeMap(data))
    }

    /// `GET company/billing` — plan, asientos y consumo de 30 días.
    func billing() async throws -> CompanyBillingState {
        let data = try await api.get("company/billing")
        return CompanyBillingState(raw: ConsoleHelpers.decodeMap(data))
    }
}

/// Cuerpo vacío para el PATCH sin datos. Privado: cada repositorio tiene el suyo.
private struct EmptyBody: Encodable {}
