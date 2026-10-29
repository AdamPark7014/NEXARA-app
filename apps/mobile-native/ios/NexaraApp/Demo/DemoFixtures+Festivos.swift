import Foundation

// Días festivos de la demostración (`GET festivos/mio`). Por omisión no hay festivo hoy: la ruta
// contesta `null` y «Mi día» se ve normal. Con `NEXARA_DEMO_FESTIVO=descansa|labora` hoy es el
// Día de la Revolución del tipo pedido, con los datos de las capturas de Android
// (`CapturasMiDiaTest`: horario 10:00–14:00, pago doble y la nota de dirección), y Navidad y
// Año Nuevo en los próximos.

extension DemoStore {
    /// El festivo de hoy pedido por `DemoMode.festivoHoy`; nil = la ruta contesta `null`.
    func fxFestivosMio() -> DemoJSON? {
        guard let modo = DemoMode.festivoHoy else { return nil }
        // El mismo «hoy» de México con el que la pantalla decide si la respuesta cuenta.
        let hoy = AttendanceClock.today()
        let labora = modo == "labora"
        var festivoHoy = festivoDemo(hoy, nombre: "Día de la Revolución", trabaja: labora)
        if labora {
            festivoHoy["como"] = dj([
                "trabaja": true,
                "horario": dj(["entrada": "10:00", "salida": "14:00"]),
                "pagoDoble": true,
            ])
            festivoHoy["nota"] = "Cerramos la entrega del corporativo; Iván abre la bodega a las 9:45."
        }
        return dj([
            "hoy": hoy,
            "festivoHoy": festivoHoy,
            "proximos": [
                festivoDemo(siguienteFecha(mes: 12, dia: 25, despuesDe: hoy), nombre: "Navidad", trabaja: false),
                festivoDemo(siguienteFecha(mes: 1, dia: 1, despuesDe: hoy), nombre: "Año Nuevo", trabaja: false),
            ],
        ])
    }

    /// Un festivo de ley sin horario propio ni nota.
    private func festivoDemo(_ fecha: String, nombre: String, trabaja: Bool) -> DemoJSON {
        dj([
            "fecha": fecha,
            "nombre": nombre,
            "origen": "LEY",
            "finDeSemana": esFinDeSemana(fecha),
            "nota": NSNull(),
            "como": dj(["trabaja": trabaja, "horario": NSNull(), "pagoDoble": false]),
        ])
    }

    /// La siguiente fecha `AAAA-MM-DD` con ese mes y día, después de `hoy` (este año o el que sigue).
    private func siguienteFecha(mes: Int, dia: Int, despuesDe hoy: String) -> String {
        let anio = Int(hoy.prefix(4)) ?? 2026
        let esteAnio = String(format: "%04d-%02d-%02d", anio, mes, dia)
        // Las fechas ISO se comparan bien como texto.
        return esteAnio > hoy ? esteAnio : String(format: "%04d-%02d-%02d", anio + 1, mes, dia)
    }

    private func esFinDeSemana(_ fecha: String) -> Bool {
        guard let fechaDia = AttendanceClock.date(fromDay: fecha) else { return false }
        let semana = AttendanceClock.calendar.component(.weekday, from: fechaDia)
        return semana == 1 || semana == 7
    }
}
