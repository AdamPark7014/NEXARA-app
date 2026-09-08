import Foundation

// Modelos de la zona contable que la web ya tenía y el teléfono no: catálogo de
// cuentas, centros de costo, periodos fiscales, presupuestos y movimientos
// bancarios.
//
// Por qué se parsean desde `[String: Any]` y no con `Codable`: la API devuelve
// los `Decimal` de Prisma como cadena ("1234.50") y los enteros como número, y
// mezcla nombres en inglés y castellano según el módulo. `StockParse` ya
// resuelve esa ambigüedad en el resto de la app; repetir el mismo patrón evita
// que una factura con el total en cadena tumbe el decodificador entero.

/// Lee un booleano que puede llegar como Bool, número (0/1) o cadena.
private func acBool(_ values: Any?...) -> Bool? {
    for v in values {
        if let b = v as? Bool { return b }
        if let n = v as? NSNumber { return n.boolValue }
        if let s = v as? String {
            let l = s.lowercased()
            if l == "true" || l == "1" { return true }
            if l == "false" || l == "0" { return false }
        }
    }
    return nil
}

/// Cuenta del catálogo contable — GET /accounting/accounts
struct LedgerAccount: Hashable, Identifiable {
    let id: Int64
    let code: String
    let name: String
    let type: String
    let currency: String
    let balance: Double
    let satAgrupador: String
    let description: String
    let isActive: Bool
    let parentName: String
    let parentCode: String
    let childrenCount: Int
    let raw: [String: Any]

    var rowKey: String { "acc-\(id)-\(code)" }
    var displayName: String { name.isEmpty ? (code.isEmpty ? "Cuenta" : code) : name }
    /// Etiqueta corta para la fila: "1101 · Bancos".
    var displayLabel: String {
        code.isEmpty ? displayName : "\(code) · \(displayName)"
    }
    /// El agrupador SAT es nullable a propósito en la API; sin él la cuenta no
    /// puede salir en el XML de contabilidad electrónica. Merece señalarse.
    var missingSatAgrupador: Bool { satAgrupador.isEmpty }

    static func == (lhs: LedgerAccount, rhs: LedgerAccount) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let parent = raw["parent"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        code = StockParse.str(raw["code"], raw["codigo"])
        name = StockParse.str(raw["name"], raw["nombre"])
        type = StockParse.str(raw["type"], raw["tipo"])
        currency = StockParse.str(raw["currency"], raw["moneda"])
        balance = StockParse.dbl(raw["balance"], raw["saldo"]) ?? 0
        satAgrupador = StockParse.str(raw["satAgrupador"])
        description = StockParse.str(raw["description"], raw["descripcion"])
        isActive = acBool(raw["isActive"], raw["activo"]) ?? true
        parentName = StockParse.str(parent?["name"], parent?["nombre"])
        parentCode = StockParse.str(parent?["code"])
        childrenCount = (raw["children"] as? [[String: Any]])?.count ?? 0
    }
}

/// Centro de costo — GET /accounting/accounts/cost-centers
struct CostCenter: Hashable, Identifiable {
    let id: Int64
    let code: String
    let name: String
    let departmentName: String
    let defaultAccountName: String
    let raw: [String: Any]

    var rowKey: String { "cc-\(id)-\(code)" }
    var displayName: String { name.isEmpty ? (code.isEmpty ? "Centro de costo" : code) : name }
    var displayLabel: String { code.isEmpty ? displayName : "\(code) · \(displayName)" }

    static func == (lhs: CostCenter, rhs: CostCenter) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let department = raw["department"] as? [String: Any]
        let account = raw["defaultAccount"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        code = StockParse.str(raw["code"], raw["codigo"])
        name = StockParse.str(raw["name"], raw["nombre"])
        departmentName = StockParse.str(department?["name"], department?["nombre"], raw["departmentName"])
        defaultAccountName = StockParse.str(account?["name"], account?["nombre"])
    }
}

/// Periodo fiscal — GET /accounting/accounts/fiscal-periods
struct FiscalPeriod: Hashable, Identifiable {
    let id: Int64
    let name: String
    let startDate: String
    let endDate: String
    let isClosed: Bool
    let closedAt: String
    let closedByName: String
    let raw: [String: Any]

    var rowKey: String { "fp-\(id)" }
    var displayName: String { name.isEmpty ? "Periodo \(id)" : name }
    var rangeLabel: String {
        let from = String(startDate.prefix(10))
        let to = String(endDate.prefix(10))
        if from.isEmpty && to.isEmpty { return "" }
        return "\(from) → \(to)"
    }
    var statusLabel: String { isClosed ? "Cerrado" : "Abierto" }

    static func == (lhs: FiscalPeriod, rhs: FiscalPeriod) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let closedBy = raw["closedBy"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"], raw["nombre"])
        startDate = StockParse.str(raw["startDate"], raw["fechaInicio"])
        endDate = StockParse.str(raw["endDate"], raw["fechaFin"])
        isClosed = acBool(raw["isClosed"], raw["cerrado"]) ?? false
        closedAt = StockParse.str(raw["closedAt"])
        closedByName = StockParse.str(closedBy?["nombre"], closedBy?["name"])
    }
}

/// Presupuesto — GET /accounting/budgets
struct BudgetItem: Hashable, Identifiable {
    let id: Int64
    let name: String
    let costCenterId: Int64?
    let costCenterName: String
    let costCenterCode: String
    let year: Int
    let month: Int?
    let plannedAmount: Double
    let actualAmount: Double
    let notes: String
    let raw: [String: Any]

    var rowKey: String { "bud-\(id)" }
    var displayName: String { name.isEmpty ? "Presupuesto \(id)" : name }
    var variance: Double { plannedAmount - actualAmount }
    /// Porcentaje ejecutado. Con planeado 0 no hay porcentaje que calcular:
    /// devolver 0 sería mentir, así que es opcional.
    var executedPercent: Double? {
        guard plannedAmount > 0 else { return nil }
        return (actualAmount / plannedAmount) * 100
    }
    var isOverBudget: Bool { actualAmount > plannedAmount && plannedAmount > 0 }
    var periodLabel: String {
        guard let month, month >= 1, month <= 12 else { return String(year) }
        let meses = ["ene", "feb", "mar", "abr", "may", "jun",
                     "jul", "ago", "sep", "oct", "nov", "dic"]
        return "\(meses[month - 1]) \(year)"
    }

    static func == (lhs: BudgetItem, rhs: BudgetItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let cc = raw["costCenter"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"], raw["nombre"])
        costCenterId = StockParse.int64(cc?["id"] ?? raw["costCenterId"])
        costCenterName = StockParse.str(cc?["name"], cc?["nombre"], raw["costCenterName"])
        costCenterCode = StockParse.str(cc?["code"], raw["costCenterCode"])
        year = StockParse.int(raw["year"], raw["ejercicio"]) ?? 0
        month = StockParse.int(raw["month"], raw["mes"])
        plannedAmount = StockParse.dbl(raw["plannedAmount"], raw["presupuestado"]) ?? 0
        actualAmount = StockParse.dbl(raw["actualAmount"], raw["real"]) ?? 0
        notes = StockParse.str(raw["notes"], raw["notas"])
    }
}

/// Fila de presupuesto contra real — GET /accounting/budgets/vs-actual
/// La API ya calcula `variance` y `variancePercent`; se leen de ahí en lugar de
/// recalcularlos para que el teléfono y la web nunca muestren números distintos.
struct BudgetVsActualRow: Hashable, Identifiable {
    let id: Int64
    let name: String
    let year: Int
    let month: Int?
    let plannedAmount: Double
    let actualAmount: Double
    let variance: Double
    let variancePercent: Double
    let raw: [String: Any]

    var rowKey: String { "bva-\(id)" }
    var periodLabel: String {
        guard let month, month >= 1, month <= 12 else { return String(year) }
        let meses = ["ene", "feb", "mar", "abr", "may", "jun",
                     "jul", "ago", "sep", "oct", "nov", "dic"]
        return "\(meses[month - 1]) \(year)"
    }
    /// La API define `variance = planeado - real`: negativo significa sobregiro.
    var isOverBudget: Bool { variance < 0 }

    static func == (lhs: BudgetVsActualRow, rhs: BudgetVsActualRow) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"], raw["nombre"])
        year = StockParse.int(raw["year"]) ?? 0
        month = StockParse.int(raw["month"])
        plannedAmount = StockParse.dbl(raw["plannedAmount"]) ?? 0
        actualAmount = StockParse.dbl(raw["actualAmount"]) ?? 0
        variance = StockParse.dbl(raw["variance"]) ?? 0
        variancePercent = StockParse.dbl(raw["variancePercent"]) ?? 0
    }
}

/// Movimiento bancario — GET /accounting/banking/accounts/:id/transactions
struct BankTransaction: Hashable, Identifiable {
    let id: Int64
    let date: String
    let description: String
    let amount: Double
    let isDebit: Bool
    let externalRef: String
    let concept: String
    let counterpartyName: String
    let counterpartyRfc: String
    let speiTrackingKey: String
    let isReconciled: Bool
    let raw: [String: Any]

    var rowKey: String { "btx-\(id)" }
    var dateLabel: String { String(date.prefix(10)) }
    var displayDescription: String {
        if !description.isEmpty { return description }
        if !concept.isEmpty { return concept }
        return "Movimiento"
    }
    /// Cargo (sale dinero) frente a abono (entra). El signo se decide aquí y no
    /// en la vista para que la lista y el resumen no puedan discrepar.
    var signedAmount: Double { isDebit ? -amount : amount }

    static func == (lhs: BankTransaction, rhs: BankTransaction) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        date = StockParse.str(raw["transactionDate"], raw["date"], raw["fecha"])
        description = StockParse.str(raw["description"], raw["descripcion"])
        amount = StockParse.dbl(raw["amount"], raw["monto"]) ?? 0
        isDebit = acBool(raw["isDebit"], raw["cargo"]) ?? false
        externalRef = StockParse.str(raw["externalRef"], raw["referencia"])
        concept = StockParse.str(raw["concept"], raw["concepto"])
        counterpartyName = StockParse.str(raw["counterpartyName"])
        counterpartyRfc = StockParse.str(raw["counterpartyRfc"])
        speiTrackingKey = StockParse.str(raw["speiTrackingKey"])
        isReconciled = (raw["reconciliation"] as? [String: Any]) != nil
    }
}

/// Resumen mensual de una cuenta bancaria — GET /accounting/banking/accounts/:id/summary
struct BankAccountSummary: Hashable {
    let monthDebits: Double
    let monthCredits: Double
    let monthNet: Double
    let unreconciledCount: Int
    let lastTransactions: [BankTransaction]
    let hasData: Bool

    init(raw: [String: Any]) {
        monthDebits = StockParse.dbl(raw["monthDebits"]) ?? 0
        monthCredits = StockParse.dbl(raw["monthCredits"]) ?? 0
        monthNet = StockParse.dbl(raw["monthNet"]) ?? 0
        unreconciledCount = StockParse.int(raw["unreconciledCount"]) ?? 0
        lastTransactions = (raw["lastTransactions"] as? [[String: Any]] ?? [])
            .map { BankTransaction(raw: $0) }
        hasData = !raw.isEmpty
    }

    static func == (lhs: BankAccountSummary, rhs: BankAccountSummary) -> Bool {
        lhs.monthDebits == rhs.monthDebits
            && lhs.monthCredits == rhs.monthCredits
            && lhs.unreconciledCount == rhs.unreconciledCount
            && lhs.lastTransactions.count == rhs.lastTransactions.count
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(monthDebits)
        hasher.combine(monthCredits)
        hasher.combine(unreconciledCount)
    }
}

/// Línea de un asiento contable (partida doble).
struct JournalEntryLine: Hashable, Identifiable {
    let id: Int64
    let description: String
    let debit: Double
    let credit: Double
    let debitAccountLabel: String
    let creditAccountLabel: String
    let costCenterName: String

    var rowKey: String { "jel-\(id)" }

    static func == (lhs: JournalEntryLine, rhs: JournalEntryLine) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        let debitAccount = raw["debitAccount"] as? [String: Any]
        let creditAccount = raw["creditAccount"] as? [String: Any]
        let costCenter = raw["costCenter"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        description = StockParse.str(raw["description"], raw["descripcion"])
        debit = StockParse.dbl(raw["debit"], raw["debe"]) ?? 0
        credit = StockParse.dbl(raw["credit"], raw["haber"]) ?? 0
        debitAccountLabel = JournalEntryLine.accountLabel(debitAccount)
        creditAccountLabel = JournalEntryLine.accountLabel(creditAccount)
        costCenterName = StockParse.str(costCenter?["name"], costCenter?["nombre"])
    }

    private static func accountLabel(_ obj: [String: Any]?) -> String {
        guard let obj else { return "" }
        let code = StockParse.str(obj["code"])
        let name = StockParse.str(obj["name"], obj["nombre"])
        if code.isEmpty { return name }
        if name.isEmpty { return code }
        return "\(code) · \(name)"
    }
}

/// Asiento contable con sus líneas — GET /accounting/journal-entries/:id
struct JournalEntryDetail: Hashable {
    let id: Int64
    let description: String
    let reference: String
    let status: String
    let date: String
    let totalDebit: Double
    let totalCredit: Double
    let createdByName: String
    let lines: [JournalEntryLine]
    let hasData: Bool

    var dateLabel: String { String(date.prefix(10)) }
    /// Un asiento sale cuadrado o no sale. Si no cuadra hay que verlo en la
    /// pantalla, no descubrirlo al intentar contabilizarlo.
    var isBalanced: Bool { abs(totalDebit - totalCredit) < 0.01 }

    static func == (lhs: JournalEntryDetail, rhs: JournalEntryDetail) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        let createdBy = raw["createdBy"] as? [String: Any]
        hasData = !raw.isEmpty
        id = StockParse.int64(raw["id"]) ?? 0
        description = StockParse.str(raw["description"], raw["descripcion"], raw["concepto"])
        reference = StockParse.str(raw["reference"], raw["referencia"], raw["folio"])
        status = StockParse.str(raw["status"], raw["estado"], raw["estatus"])
        date = StockParse.str(raw["date"], raw["entryDate"], raw["createdAt"], raw["fecha"])
        createdByName = StockParse.str(createdBy?["nombre"], createdBy?["name"])
        let parsed = (raw["lines"] as? [[String: Any]] ?? []).map { JournalEntryLine(raw: $0) }
        lines = parsed
        // El listado sí trae totales; el detalle los reparte por línea. Se suman
        // aquí para no depender de que la API los mande en ambos sitios.
        totalDebit = StockParse.dbl(raw["totalDebit"]) ?? parsed.reduce(0) { $0 + $1.debit }
        totalCredit = StockParse.dbl(raw["totalCredit"]) ?? parsed.reduce(0) { $0 + $1.credit }
    }
}

/// Estatus de un CFDI en el SAT — GET /accounting/invoices/:id/sat-status
/// Es una consulta pura contra el servicio público del SAT: no timbra, no
/// cancela y no toca la factura local.
struct SatCfdiStatus: Hashable {
    let estado: String
    let esCancelable: String
    let estatusCancelacion: String
    let codigoEstatus: String
    let validacionEfos: String
    let hasData: Bool
    let rawText: String

    var isVigente: Bool { estado.lowercased().contains("vigente") }
    var isCancelado: Bool { estado.lowercased().contains("cancelad") }

    init(raw: [String: Any]) {
        hasData = !raw.isEmpty
        estado = StockParse.str(raw["estado"], raw["Estado"], raw["status"])
        esCancelable = StockParse.str(raw["esCancelable"], raw["EsCancelable"])
        estatusCancelacion = StockParse.str(raw["estatusCancelacion"], raw["EstatusCancelacion"])
        codigoEstatus = StockParse.str(raw["codigoEstatus"], raw["CodigoEstatus"])
        validacionEfos = StockParse.str(raw["validacionEFOS"], raw["ValidacionEFOS"], raw["validacionEfos"])
        // Si el SAT devuelve una forma que no reconocemos, se enseña el crudo en
        // vez de una pantalla vacía que parezca "todo bien".
        rawText = raw.isEmpty ? "" : String(describing: raw)
    }
}
