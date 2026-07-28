import Foundation

/// Factura — GET /accounting/invoices
struct InvoiceItem: Hashable, Identifiable {
    let id: Int64
    let folio: String
    let clientName: String
    let total: Double?
    let balance: Double?
    let status: String
    let issueDate: String
    let dueDate: String
    let pdfUrl: String
    let matchStatus: String
    let rfc: String
    let notes: String
    let raw: [String: Any]

    var rowKey: String { "inv-\(id)" }
    var displayFolio: String { folio.isEmpty ? "Sin folio" : folio }
    var isPendingPayment: Bool {
        let s = status.lowercased()
        return s.contains("pendiente") || s.contains("parcial") || s.contains("open") || s.contains("posted")
    }

    func toFlatMap() -> [String: Any] {
        var out = raw
        out["id"] = id
        out["folio"] = folio
        out["invoiceNumber"] = folio
        out["number"] = folio
        out["clientName"] = clientName
        out["cliente"] = clientName
        out["status"] = status
        out["estatus"] = status
        if let total { out["total"] = total; out["amount"] = total }
        if let balance { out["balance"] = balance }
        out["issueDate"] = issueDate
        out["dueDate"] = dueDate
        out["pdfUrl"] = pdfUrl
        out["matchStatus"] = matchStatus
        out["rfc"] = rfc
        out["notes"] = notes
        return out
    }

    static func == (lhs: InvoiceItem, rhs: InvoiceItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        folio = StockParse.str(raw["folio"], raw["invoiceNumber"], raw["number"])
        clientName = StockParse.str(raw["clientName"], raw["cliente"])
        total = StockParse.dbl(raw["total"], raw["amount"])
        balance = StockParse.dbl(raw["balance"], raw["amountDue"])
        status = StockParse.str(raw["status"], raw["estatus"])
        issueDate = StockParse.str(raw["issueDate"], raw["issuedAt"], raw["createdAt"], raw["fecha"])
        dueDate = StockParse.str(raw["dueDate"], raw["fechaVencimiento"])
        pdfUrl = StockParse.str(raw["pdfUrl"])
        matchStatus = StockParse.str(raw["matchStatus"], raw["threeWayMatchStatus"])
        rfc = StockParse.str(raw["rfc"], raw["taxId"])
        notes = StockParse.str(raw["notes"], raw["notas"], raw["description"])
    }
}

/// Gasto / viático operativo — GET /expenses
struct ExpenseItem: Hashable, Identifiable {
    let id: Int64
    let concept: String
    let amount: Double
    let category: String
    let status: String
    let userName: String
    let createdAt: String
    let reference: String
    let notes: String
    let ticketUrl: String
    let raw: [String: Any]

    var rowKey: String { "exp-\(id)" }
    var displayConcept: String { concept.isEmpty ? "Sin concepto" : concept }
    var isPending: Bool { status.lowercased().contains("pendiente") }

    func toFlatMap() -> [String: Any] {
        var out = raw
        out["id"] = id
        out["concept"] = concept
        out["concepto"] = concept
        out["amount"] = amount
        out["monto"] = amount
        out["montoSolicitado"] = amount
        out["category"] = category
        out["categoria"] = category
        out["estatus"] = status
        out["estatusPago"] = status
        out["status"] = status
        out["userName"] = userName
        out["createdAt"] = createdAt
        out["reference"] = reference
        out["notes"] = notes
        out["ticketEvidenciaUrl"] = ticketUrl
        return out
    }

    static func == (lhs: ExpenseItem, rhs: ExpenseItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let usuario = raw["usuario"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        concept = StockParse.str(raw["concept"], raw["concepto"], raw["descripcion"])
        amount = StockParse.dbl(raw["amount"], raw["total"], raw["monto"], raw["montoSolicitado"]) ?? 0
        category = StockParse.str(raw["category"], raw["categoria"])
        status = StockParse.str(raw["estatusPago"], raw["estatus"], raw["status"])
        userName = StockParse.str(
            usuario?["nombre"], usuario?["name"],
            raw["userName"], raw["usuario"], raw["nombre"]
        )
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
        reference = StockParse.str(raw["reference"], raw["referencia"])
        notes = StockParse.str(raw["notes"], raw["notas"], raw["description"])
        ticketUrl = StockParse.str(raw["ticketEvidenciaUrl"], raw["ticketUrl"])
    }
}

/// Multa — GET /fines (paridad Android FineDto)
struct FineItem: Hashable, Identifiable {
    let id: Int64
    let motivo: String
    let monto: Double
    let estatus: String
    let createdAt: String
    let userName: String
    let notes: String
    let raw: [String: Any]

    var displayMotivo: String { motivo.isEmpty ? "Multa" : motivo }
    var dateLabel: String { String(createdAt.prefix(10)) }

    static func == (lhs: FineItem, rhs: FineItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let usuario = raw["usuario"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        motivo = StockParse.str(raw["motivo"], raw["reason"], raw["concepto"])
        monto = StockParse.dbl(raw["monto"], raw["amount"], raw["total"]) ?? 0
        estatus = StockParse.str(raw["estatus"], raw["status"], raw["estado"])
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
        userName = StockParse.str(
            usuario?["nombre"], usuario?["name"],
            raw["userName"], raw["empleado"], raw["nombre"]
        )
        notes = StockParse.str(raw["notes"], raw["notas"], raw["descripcion"])
    }
}

/// Asiento contable — GET /accounting/journal-entries
struct JournalEntryItem: Hashable, Identifiable {
    let id: Int64
    let description: String
    let account: String
    let totalDebit: Double
    let totalCredit: Double
    let entryDate: String
    let reference: String
    let status: String
    let raw: [String: Any]

    var displayDescription: String { description.isEmpty ? "Asiento" : description }
    var dateLabel: String { String(entryDate.prefix(10)) }

    static func == (lhs: JournalEntryItem, rhs: JournalEntryItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        description = StockParse.str(raw["description"], raw["descripcion"], raw["concepto"])
        account = StockParse.str(raw["account"], raw["cuenta"])
        totalDebit = StockParse.dbl(raw["totalDebit"], raw["debit"], raw["debe"]) ?? 0
        totalCredit = StockParse.dbl(raw["totalCredit"], raw["credit"], raw["haber"]) ?? 0
        entryDate = StockParse.str(raw["entryDate"], raw["date"], raw["createdAt"], raw["fecha"])
        reference = StockParse.str(raw["reference"], raw["referencia"], raw["folio"])
        status = StockParse.str(raw["status"], raw["estado"], raw["estatus"])
    }
}

/// Cuenta bancaria — GET /accounting/banking/accounts
struct BankAccountItem: Hashable, Identifiable {
    let id: Int64
    let name: String
    let bank: String
    let accountNumber: String
    let clabe: String
    let balance: Double
    let currency: String
    let type: String
    let ownerName: String
    let raw: [String: Any]

    var displayName: String { name.isEmpty ? "Cuenta" : name }
    var maskedNumber: String {
        let src = accountNumber.isEmpty ? clabe : accountNumber
        guard src.count > 4 else { return src }
        return String(src.suffix(8))
    }

    static func == (lhs: BankAccountItem, rhs: BankAccountItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        id = StockParse.int64(raw["id"]) ?? 0
        name = StockParse.str(raw["name"], raw["nombre"], raw["alias"])
        bank = StockParse.str(raw["bank"], raw["banco"], raw["bankName"])
        accountNumber = StockParse.str(raw["accountNumber"], raw["numeroCuenta"])
        clabe = StockParse.str(raw["clabe"])
        balance = StockParse.dbl(raw["balance"], raw["saldo"]) ?? 0
        currency = StockParse.str(raw["currency"], raw["moneda"])
        type = StockParse.str(raw["type"], raw["tipo"])
        ownerName = StockParse.str(raw["ownerName"], raw["responsable"])
    }
}

/// Pago a empleado — GET /employee-payments
struct EmployeePaymentItem: Hashable, Identifiable {
    let id: Int64
    let concepto: String
    let monto: Double
    let estatus: String
    let periodoInicio: String
    let periodoFin: String
    let createdAt: String
    let userName: String
    let raw: [String: Any]

    var displayConcepto: String { concepto.isEmpty ? "Pago" : concepto }
    var dateLabel: String { String(createdAt.prefix(10)) }

    static func == (lhs: EmployeePaymentItem, rhs: EmployeePaymentItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    init(raw: [String: Any]) {
        self.raw = raw
        let usuario = raw["usuario"] as? [String: Any]
        id = StockParse.int64(raw["id"]) ?? 0
        concepto = StockParse.str(raw["concepto"], raw["concept"], raw["descripcion"])
        monto = StockParse.dbl(raw["monto"], raw["amount"], raw["total"]) ?? 0
        estatus = StockParse.str(raw["estatus"], raw["status"], raw["estado"])
        periodoInicio = StockParse.str(raw["periodoInicio"], raw["periodStart"])
        periodoFin = StockParse.str(raw["periodoFin"], raw["periodEnd"])
        createdAt = StockParse.str(raw["createdAt"], raw["fecha"])
        userName = StockParse.str(
            usuario?["nombre"], usuario?["name"],
            raw["userName"], raw["empleado"], raw["nombre"]
        )
    }
}
