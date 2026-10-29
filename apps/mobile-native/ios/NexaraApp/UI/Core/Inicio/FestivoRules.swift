import Foundation

/// Días festivos en «Mi día» (mockup aprobado por Adam el 29-10, tableros «App · quien descansa»
/// y «App · a quien le toca laborar»). Si a alguien le toca o no lo resuelve el servidor
/// (`GET festivos/mio`); aquí solo se nombra.
///
/// Espejo de `FestivoRules.kt` de Android, con los mismos textos (sus pruebas:
/// `FestivoRulesTest.kt`). Sin SwiftUI: lógica pura. Las fechas son días de México.
enum FestivoRules {

    enum Estado: Equatable { case ninguno, descansa, labora }

    struct Proximo: Equatable {
        /// «Vie 25 dic».
        let dia: String
        let nombre: String
        /// «No se labora», «De 10:00 a 14:00» o «Se labora».
        let como: String

        /// Le toca trabajarlo (chip naranja); si no, chip gris.
        var labora: Bool { como != FestivoRules.noSeLabora }
    }

    struct Cifra: Equatable {
        let etiqueta: String
        let valor: String
    }

    static let tituloDescansa = "Hoy descansas"
    static let textoDescansa =
        "Es descanso pagado. No necesitas checar entrada ni salida, y este día no cuenta en tu desempeño."
    static let noSeLabora = "No se labora"

    // MARK: Estado y textos

    /// `hoyMexico`: si la respuesta guardada ya no es de hoy (no se pudo volver a pedir), no cuenta.
    static func estado(_ f: FestivosMio?, hoyMexico: String? = nil) -> Estado {
        if let hoyMexico, primerosDiez(f?.hoy) != hoyMexico { return .ninguno }
        guard let hoy = f?.festivoHoy else { return .ninguno }
        return hoy.como?.trabaja == true ? .labora : .descansa
    }

    /// «Día de la Revolución · festivo de ley» / «· lo da la empresa» / «· festivo trabajado».
    static func chip(_ f: Festivo, estado: Estado) -> String {
        let nombre = limpio(f.nombre) ?? "Día festivo"
        let tipo: String
        if estado == .labora {
            tipo = "festivo trabajado"
        } else if (f.origen ?? "").caseInsensitiveCompare("EMPRESA") == .orderedSame {
            tipo = "lo da la empresa"
        } else {
            tipo = "festivo de ley"
        }
        return "\(nombre) · \(tipo)"
    }

    /// «Hoy te toca de 10:00 a 14:00»; sin horario propio, la jornada completa.
    static func tituloLabora(_ f: Festivo) -> String {
        guard let h = horario(f) else { return "Hoy te toca tu jornada completa" }
        return "Hoy te toca de \(h.entrada) a \(h.salida)"
    }

    static func textoLabora(_ f: Festivo) -> String? {
        f.como?.pagoDoble == true ? "Se paga como festivo trabajado (doble)." : nil
    }

    /// Entrada, salida y jornada; vacío si le toca la jornada completa (no hay horario propio).
    static func cifras(_ f: Festivo) -> [Cifra] {
        guard let h = horario(f) else { return [] }
        var lista = [Cifra(etiqueta: "Entrada", valor: h.entrada), Cifra(etiqueta: "Salida", valor: h.salida)]
        if let minutos = minutosEntre(h.entrada, h.salida), minutos > 0 {
            lista.append(Cifra(etiqueta: "Jornada", valor: ActividadesTexto.minutos(Double(minutos))))
        }
        return lista
    }

    static func nota(_ f: Festivo) -> String? { limpio(f.nota) }

    // MARK: Siguiente día de trabajo y próximos

    /// El siguiente día de trabajo: entre semana y sin un festivo que no le toque. Hasta 14 días;
    /// los fines de semana con guardia no cuentan aquí.
    static func siguienteDiaDeTrabajo(_ f: FestivosMio) -> Date? {
        guard let hoy = dia(f.hoy) else { return nil }
        let descansos = Set(
            (f.proximos ?? [])
                .filter { $0.como?.trabaja != true }
                .compactMap { dia($0.fecha) }
                .map { texto($0) }
        )
        for n in 1...14 {
            guard let d = calendario.date(byAdding: .day, value: n, to: hoy) else { continue }
            // 1 = domingo, 7 = sábado (calendario gregoriano).
            let semana = calendario.component(.weekday, from: d)
            if semana != 1 && semana != 7 && !descansos.contains(texto(d)) { return d }
        }
        return nil
    }

    /// «Vuelves mañana» o «Vuelves el martes».
    static func vuelves(hoy: Date, siguiente: Date) -> String {
        if let manana = calendario.date(byAdding: .day, value: 1, to: hoy), texto(manana) == texto(siguiente) {
            return "Vuelves mañana"
        }
        return "Vuelves el \(diaSemanaLargo(siguiente))"
    }

    /// Lo de la tarjeta del día: «NOV», «17», «mar».
    static func mesCorto(_ d: Date) -> String {
        mesesCortos[calendario.component(.month, from: d) - 1].uppercased(with: locale)
    }

    static func diaDelMes(_ d: Date) -> Int {
        calendario.component(.day, from: d)
    }

    static func diaSemanaCorto(_ d: Date) -> String {
        diasCortos[calendario.component(.weekday, from: d) - 1]
    }

    /// Los próximos festivos (sin el de hoy): «Vie 25 dic» · Navidad · «No se labora».
    static func proximos(_ f: FestivosMio) -> [Proximo] {
        (f.proximos ?? [])
            .filter { $0.fecha != f.hoy }
            .compactMap { (p: Festivo) -> Proximo? in
                guard let d = dia(p.fecha), let nombre = limpio(p.nombre) else { return nil }
                let semana = diaSemanaCorto(d)
                let dSemana = semana.prefix(1).uppercased() + semana.dropFirst()
                let mes = mesesCortos[calendario.component(.month, from: d) - 1]
                return Proximo(dia: "\(dSemana) \(diaDelMes(d)) \(mes)", nombre: nombre, como: como(p))
            }
    }

    /// «No se labora», «De 10:00 a 14:00» o «Se labora».
    static func como(_ p: Festivo) -> String {
        if p.como?.trabaja != true { return noSeLabora }
        if let h = horario(p) { return "De \(h.entrada) a \(h.salida)" }
        return "Se labora"
    }

    // MARK: Fechas y horas

    /// `AAAA-MM-DD` (los primeros 10, sin espacios) a la medianoche de ese día en México;
    /// nil si no es una fecha real (`2026-13-45` no lo es), como `LocalDate.parse` de Android.
    static func dia(_ v: String?) -> Date? {
        guard let t = v?.trimmingCharacters(in: .whitespacesAndNewlines), t.count >= 10 else { return nil }
        let diez = String(t.prefix(10))
        guard let d = formatoDia.date(from: diez), formatoDia.string(from: d) == diez else { return nil }
        return d
    }

    private static let zona = TimeZone(identifier: "America/Mexico_City") ?? .current
    private static let locale = Locale(identifier: "es_MX")

    /// Calendario gregoriano en la zona de México (un iPhone con calendario budista o japonés
    /// escribía otro año).
    private static let calendario: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = zona
        return c
    }()

    private static let formatoDia: DateFormatter = {
        let f = DateFormatter()
        f.calendar = calendario
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = zona
        f.dateFormat = "yyyy-MM-dd"
        f.isLenient = false
        return f
    }()

    /// Abreviaturas fijas, sin punto (las de `es-MX` de Android): no dependen de la versión de iOS.
    private static let mesesCortos = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]
    /// Por `weekday` de `Calendar`: 1 = domingo.
    private static let diasCortos = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
    private static let diasLargos = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

    private static func diaSemanaLargo(_ d: Date) -> String {
        diasLargos[calendario.component(.weekday, from: d) - 1]
    }

    private static func texto(_ d: Date) -> String {
        formatoDia.string(from: d)
    }

    private static func primerosDiez(_ v: String?) -> String? {
        v.map { String($0.prefix(10)) }
    }

    private static func horario(_ f: Festivo) -> (entrada: String, salida: String)? {
        guard let h = f.como?.horario, let e = hora(h.entrada), let s = hora(h.salida) else { return nil }
        return (e, s)
    }

    /// «HH:MM» de 24 h con dos dígitos de hora, como `LocalTime.parse` de Android: «9:45» no
    /// cuenta y «10:00:00» se lee como «10:00».
    private static func hora(_ v: String?) -> String? {
        guard let t = v?.trimmingCharacters(in: .whitespacesAndNewlines) else { return nil }
        let partes = t.prefix(5).split(separator: ":", omittingEmptySubsequences: false)
        guard partes.count == 2,
              partes.allSatisfy({ parte in parte.count == 2 && parte.allSatisfy { $0.isASCII && $0.isNumber } }),
              let h = Int(partes[0]), let m = Int(partes[1]),
              (0...23).contains(h), (0...59).contains(m) else { return nil }
        return String(format: "%02d:%02d", h, m)
    }

    /// Minutos de `a` a `b` («HH:MM» ya leídas por `hora`).
    private static func minutosEntre(_ a: String, _ b: String) -> Int? {
        guard let x = minutoDelDia(a), let y = minutoDelDia(b) else { return nil }
        return y - x
    }

    private static func minutoDelDia(_ v: String) -> Int? {
        let partes = v.split(separator: ":")
        guard partes.count == 2, let h = Int(partes[0]), let m = Int(partes[1]) else { return nil }
        return h * 60 + m
    }

    private static func limpio(_ v: String?) -> String? {
        let t = (v ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}
