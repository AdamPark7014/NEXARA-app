import Foundation

/// Sábados y domingos del rango de `GET /guardias`.
/// La misma cuenta que `finesDeSemana` de la web: el día se lee en UTC.
struct FinDeSemana: Equatable {
    var sabado: String?
    var domingo: String?
}

enum GuardiasTextos {
    static let vacio = "No tienes guardias programadas."
    static let errorCarga = "No se pudieron cargar las guardias."
    static let errorProgramar = "No se pudo programar la guardia."
    static let errorQuitar = "No se pudo quitar la guardia."
    static let enCola = "Sin conexión: se enviará al volver la red."
    static let nadie = "Nadie de guardia."

    static func confirmarQuitar(nombre: String, dia: String) -> String {
        "\(nombre) ya no podrá checar el \(dia)."
    }
}

enum GuardiasFechas {
    private static var utc: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        return cal
    }

    static func fechaValida(_ fecha: String) -> Date? {
        let t = fecha.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let match = t.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) else { return nil }
        let partes = t[match].split(separator: "-")
        guard partes.count == 3,
              let y = Int(partes[0]), let mes = Int(partes[1]), let d = Int(partes[2]) else { return nil }
        var c = DateComponents()
        c.year = y
        c.month = mes
        c.day = d
        guard let date = utc.date(from: c) else { return nil }
        let back = utc.dateComponents([.year, .month, .day], from: date)
        guard back.year == y, back.month == mes, back.day == d else { return nil }
        return date
    }

    /// 0 = domingo … 6 = sábado.
    static func diaDeLaSemana(_ fecha: String) -> Int? {
        guard let date = fechaValida(fecha) else { return nil }
        return utc.component(.weekday, from: date) - 1
    }

    static func esFinDeSemana(_ fecha: String) -> Bool {
        guard let dia = diaDeLaSemana(fecha) else { return false }
        return dia == 0 || dia == 6
    }

    static func finesDeSemana(desde: String, hasta: String) -> [FinDeSemana] {
        guard let inicio = fechaValida(desde), let fin = fechaValida(hasta), fin >= inicio else { return [] }
        var out: [FinDeSemana] = []
        var d = inicio
        while d <= fin && out.count < 20 {
            let clave = iso(d)
            let dia = utc.component(.weekday, from: d) - 1
            if dia == 6 {
                out.append(FinDeSemana(sabado: clave, domingo: nil))
            } else if dia == 0 {
                if let ultimo = out.last, ultimo.domingo == nil, ultimo.sabado != nil {
                    out[out.count - 1].domingo = clave
                } else {
                    out.append(FinDeSemana(sabado: nil, domingo: clave))
                }
            }
            guard let siguiente = utc.date(byAdding: .day, value: 1, to: d) else { break }
            d = siguiente
        }
        return out
    }

    static func diasProgramables(desde: String, hasta: String, hoy: String) -> [String] {
        finesDeSemana(desde: desde, hasta: hasta)
            .flatMap { [$0.sabado, $0.domingo].compactMap { $0 } }
            .filter { $0 >= hoy }
    }

    /// «sáb 3 oct». Nombres fijos: el teléfono no decide el idioma de la etiqueta.
    static func diaCorto(_ fecha: String) -> String {
        guard let date = fechaValida(fecha) else { return fecha }
        let semanas = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
        let meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
        let semana = semanas[(utc.component(.weekday, from: date) - 1 + 7) % 7]
        let mes = meses[utc.component(.month, from: date) - 1]
        let n = utc.component(.day, from: date)
        return "\(semana) \(n) \(mes)"
    }

    static func tituloFin(_ fin: FinDeSemana) -> String {
        [fin.sabado, fin.domingo].compactMap { $0 }.map { diaCorto($0) }.joined(separator: " · ")
    }

    static func mostrarVacio(puedeProgramar: Bool, guardias: Int) -> Bool {
        !puedeProgramar && guardias == 0
    }

    private static func iso(_ date: Date) -> String {
        let c = utc.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}
