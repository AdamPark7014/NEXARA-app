import Foundation

/// Textos y reglas de Horarios y del pago semanal — espejo de `HorariosRules.kt` y `PagoSemanalRules.kt`.
enum HorariosReglas {
    private static let mx = TimeZone(identifier: "America/Mexico_City") ?? .current

    private static func formato(_ patron: String, zona: TimeZone = TimeZone(identifier: "UTC") ?? .current) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.timeZone = zona
        f.dateFormat = patron
        return f
    }

    private static func fechaUtc(_ dia: String?) -> Date? {
        let f = formato("yyyy-MM-dd")
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.date(from: String((dia ?? "").prefix(10)))
    }

    /// Suma días a `AAAA-MM-DD` sin pasar por la zona del teléfono.
    static func sumar(_ dia: String, _ n: Int) -> String {
        guard let d = fechaUtc(dia) else { return dia }
        let f = formato("yyyy-MM-dd")
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: d.addingTimeInterval(Double(n) * 86_400))
    }

    /// «miércoles 25»
    static func dia(_ fecha: String?) -> String {
        fechaUtc(fecha).map { formato("EEEE d").string(from: $0) } ?? ""
    }

    static func diaConMayuscula(_ fecha: String?) -> String {
        let t = dia(fecha)
        return t.prefix(1).uppercased() + t.dropFirst()
    }

    static func rango(_ d: DiaHorario) -> String {
        let e = d.horario?.horaEntrada ?? ""
        let s = d.horario?.horaSalida ?? ""
        return d.trabaja == false || e.isEmpty || s.isEmpty ? "Descansas" : "\(e)–\(s)"
    }

    /// «Extendido por Luis: cerrar rack»; nil si es el de siempre.
    static func quienYPorQue(_ d: DiaHorario) -> String? {
        guard d.programado == true else { return nil }
        let que: String
        switch d.ajuste {
        case "extender": que = "Extendido"
        case "recortar": que = "Recortado"
        default: que = "Programado"
        }
        let quien = (d.loPuso ?? "").trimmingCharacters(in: .whitespaces)
        let motivo = (d.horario?.motivo ?? "").trimmingCharacters(in: .whitespaces)
        return que + (quien.isEmpty ? "" : " por \(quien)") + (motivo.isEmpty ? "" : ": \(motivo)")
    }

    static func horas(_ min: Int?) -> String {
        let n = max(0, min ?? 0)
        let h = n / 60
        let m = n % 60
        if h == 0 { return "\(m) min" }
        return m == 0 ? "\(h) h" : "\(h) h \(m)"
    }

    /// Minutos de un `HH:MM` válido.
    private static func minutos(_ hora: String?) -> Int? {
        guard let hora, hora.count == 5 else { return nil }
        let p = hora.split(separator: ":", omittingEmptySubsequences: false)
        guard p.count == 2, p[0].count == 2, p[1].count == 2,
              let h = Int(p[0]), let m = Int(p[1]), (0..<24).contains(h), (0..<60).contains(m) else { return nil }
        return h * 60 + m
    }

    private static func duracion(_ e: Int, _ s: Int) -> Int { s > e ? s - e : s + 24 * 60 - e }

    private static func enPunto(_ h: Int) -> String { String(format: "%02d:00", ((h % 24) + 24) % 24) }

    static func sugerencias(entrada: String?, salida: String?, extender: Bool) -> [String] {
        guard let s = minutos(salida) else { return [] }
        let h = s / 60
        if extender { return (1...3).map { enPunto(h + $0) } }
        guard let e = minutos(entrada) else { return [] }
        let base = s % 60 == 0 ? 1 : 0
        return (0...2).map { enPunto(h - base - $0) }.filter { t in
            guard let m = minutos(t) else { return false }
            return m != e && duracion(e, m) < duracion(e, s)
        }
    }

    /// nil = se puede mandar.
    static func falta(hora: String, entrada: String?, salida: String?, extender: Bool) -> String? {
        guard let nueva = minutos(hora) else { return "Escribe la hora como 20:00" }
        if hora == entrada { return "La salida no puede ser igual a la entrada" }
        guard let e = minutos(entrada), let s = minutos(salida) else { return nil }
        if extender, duracion(e, nueva) <= duracion(e, s) { return "Para extender, la salida va después de las \(salida ?? "")" }
        if !extender, duracion(e, nueva) >= duracion(e, s) {
            return "Para terminar antes, la salida va antes de las \(salida ?? "")"
        }
        return nil
    }

    // MARK: - Pago semanal

    static let formas: [(clave: String, texto: String)] = [
        ("transferencia", "Transferencia"), ("efectivo", "Efectivo"), ("otro", "Otro"),
    ]

    static func lunes(_ dia: String) -> String {
        guard let d = fechaUtc(dia) else { return dia }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC") ?? .current
        // 1 = domingo … 7 = sábado.
        return sumar(dia, -((cal.component(.weekday, from: d) + 5) % 7))
    }

    /// «16 al 22 de noviembre»
    static func tituloSemana(_ lunes: String) -> String {
        guard let a = fechaUtc(lunes), let b = fechaUtc(sumar(lunes, 6)) else { return lunes }
        let d = formato("d")
        let m = formato("MMMM")
        let ma = m.string(from: a)
        let mb = m.string(from: b)
        return ma == mb
            ? "\(d.string(from: a)) al \(d.string(from: b)) de \(mb)"
            : "\(d.string(from: a)) de \(ma) al \(d.string(from: b)) de \(mb)"
    }

    static func centavos(_ v: Double?) -> Int { Int(((v ?? 0) * 100).rounded()) }

    static func pesos(_ v: Double?) -> String {
        let c = centavos(v)
        return (c < 0 ? "−" : "") + Dinero.pesos(abs(c))
    }

    static func ajuste(_ v: Double?) -> String { centavos(v) > 0 ? "+" + pesos(v) : pesos(v) }

    static func estado(_ clave: String?) -> String {
        switch clave {
        case "por_pagar": return "Por pagar"
        case "parcial": return "Parcial, falta"
        case "pagado": return "Pagado"
        default: return "Sin monto"
        }
    }

    static func forma(_ clave: String?) -> String { formas.first { $0.clave == clave }?.texto ?? "Pago" }

    static func faltaParaPagar(importe: String, saldo: Double?) -> String? {
        let tope = centavos(saldo)
        guard let c = Dinero.parsearCentavos(importe), c > 0 else { return "Escribe cuánto pagas" }
        return c > tope ? "Solo faltan \(Dinero.pesos(tope)) por pagar" : nil
    }
}
