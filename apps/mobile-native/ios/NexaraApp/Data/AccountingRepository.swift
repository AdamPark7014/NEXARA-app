import Foundation

/// Repositorio de la zona contable de consulta.
///
/// Por qué existe uno nuevo y no se amplía `ConsoleRepository`: ese fichero lo
/// mantiene otro agente en paralelo sobre la misma rama, y ampliarlo garantiza
/// un conflicto. Aquí sólo vive lo contable.
///
/// Por qué cada ruta se escribe entera dentro del `get(...)` y no se pasa a un
/// ayudante `cargar(ruta)`: con el ayudante, buscar "accounting/budgets" en el
/// árbol de iOS no encuentra la llamada, y el informe de paridad —que lee
/// literales— da por ausente algo que sí está implementado. Ya pasó con el
/// `load(...)` privado de `ExtraRepository`.
///
/// **Alcance deliberado: sólo lectura.** El dueño no ha autorizado todavía las
/// escrituras fiscales ni de nómina, así que aquí no hay timbrado, ni
/// contabilización de asientos (`PATCH journal-entries/:id/post`), ni cierre de
/// periodo, ni conciliación bancaria. Si algún día se autorizan, se añaden aquí
/// con su método propio; mientras tanto, que no exista el método es la garantía
/// de que ninguna pantalla los llame por accidente.
final class AccountingRepository {
    static let shared = AccountingRepository()
    private let api = ApiClient.shared
    private init() {}

    // MARK: Helpers

    /// Las listas de contabilidad llegan unas como array plano y otras
    /// paginadas (`{data: [...]}`); `decodeMapList` cubre ambas.
    private func rows(_ data: Data?) -> [[String: Any]] {
        guard let data else { return [] }
        return ApiClient.decodeMapList(data)
    }

    private func single(_ data: Data?) -> [String: Any] {
        guard let data,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return obj
    }

    // MARK: Catálogo de cuentas

    /// GET /accounting/accounts
    /// `isActive` por defecto a `true` igual que hace Android: el catálogo
    /// completo con cuentas dadas de baja no es lo que se quiere ver en un móvil.
    func chartOfAccounts(type: String? = nil, isActive: Bool? = true) async -> [LedgerAccount] {
        var q: [String: String] = [:]
        if let type, !type.isEmpty { q["type"] = type }
        if let isActive { q["isActive"] = isActive ? "true" : "false" }
        return rows(try? await api.get("accounting/accounts", query: q))
            .map { LedgerAccount(raw: $0) }
    }

    /// GET /accounting/accounts/:id — incluye padre e hijas.
    func account(id: Int64) async -> LedgerAccount? {
        let obj = single(try? await api.get("accounting/accounts/\(id)"))
        return obj.isEmpty ? nil : LedgerAccount(raw: obj)
    }

    /// GET /accounting/accounts/cost-centers
    func costCenters() async -> [CostCenter] {
        rows(try? await api.get("accounting/accounts/cost-centers"))
            .map { CostCenter(raw: $0) }
    }

    /// GET /accounting/accounts/fiscal-periods
    func fiscalPeriods() async -> [FiscalPeriod] {
        rows(try? await api.get("accounting/accounts/fiscal-periods"))
            .map { FiscalPeriod(raw: $0) }
    }

    // MARK: Presupuestos

    /// GET /accounting/budgets
    func budgets(costCenterId: Int64? = nil, year: Int? = nil) async -> [BudgetItem] {
        var q: [String: String] = [:]
        if let costCenterId { q["costCenterId"] = String(costCenterId) }
        if let year { q["year"] = String(year) }
        return rows(try? await api.get("accounting/budgets", query: q))
            .map { BudgetItem(raw: $0) }
    }

    /// GET /accounting/budgets/vs-actual
    /// La API responde 400 sin `costCenterId` y `year`, por eso ambos son
    /// obligatorios aquí en vez de opcionales con valor por defecto.
    func budgetVsActual(costCenterId: Int64, year: Int) async -> [BudgetVsActualRow] {
        let q = ["costCenterId": String(costCenterId), "year": String(year)]
        return rows(try? await api.get("accounting/budgets/vs-actual", query: q))
            .map { BudgetVsActualRow(raw: $0) }
    }

    // MARK: Asientos

    /// GET /accounting/journal-entries/:id — el asiento con sus líneas.
    func journalEntry(id: Int64) async -> JournalEntryDetail {
        JournalEntryDetail(raw: single(try? await api.get("accounting/journal-entries/\(id)")))
    }

    // MARK: Banca

    /// GET /accounting/banking/accounts/:id/summary
    func bankAccountSummary(id: Int64) async -> BankAccountSummary {
        BankAccountSummary(raw: single(try? await api.get("accounting/banking/accounts/\(id)/summary")))
    }

    /// GET /accounting/banking/accounts/:id/transactions
    func bankTransactions(
        accountId: Int64,
        from: String? = nil,
        to: String? = nil,
        limit: Int = 50
    ) async -> [BankTransaction] {
        var q: [String: String] = ["limit": String(limit)]
        if let from, !from.isEmpty { q["from"] = from }
        if let to, !to.isEmpty { q["to"] = to }
        return rows(try? await api.get("accounting/banking/accounts/\(accountId)/transactions", query: q))
            .map { BankTransaction(raw: $0) }
    }

    // MARK: Consultas al SAT (lectura)

    /// GET /accounting/invoices/:id/sat-status
    /// Consulta el servicio público del SAT con el UUID de la factura. No
    /// timbra ni cancela nada: el servicio de la API sólo lee.
    /// Devuelve el error en vez de tragárselo porque distingue casos que
    /// importan: "no tiene UUID CFDI" (no está timbrada) no es lo mismo que
    /// "el SAT no contestó".
    func invoiceSatStatus(id: Int64) async -> Result<SatCfdiStatus, Error> {
        do {
            let data = try await api.get("accounting/invoices/\(id)/sat-status")
            let obj = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
            return .success(SatCfdiStatus(raw: obj))
        } catch {
            return .failure(error)
        }
    }
}
