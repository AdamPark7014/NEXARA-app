import Foundation

/// Reglas de la vista de dirección de Vehículos: espejo de `FlotillaRules.kt` de Android y de
/// `apps/web/lib/vehiculos-ficha.ts` (`repartoDelMes`, `textoServicio`, `fechaCorta`).
///
/// El CEO no pide vehículos: en vez de «Solicitar» y «Salida» ve quién trae cada uno y lo que cuesta.
enum FlotillaRules {
    private static let meses = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ]
    private static let mesesCortos = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

    // MARK: Mes

    private static func partes(_ mes: String) -> (anio: Int, numero: Int)? {
        let trozos = mes.split(separator: "-")
        guard trozos.count == 2, let anio = Int(trozos[0]), let numero = Int(trozos[1]), (1...12).contains(numero) else {
            return nil
        }
        return (anio, numero)
    }

    /// El mes en curso en hora de México, como `2026-11`.
    static func mesDeHoy(_ ahora: Date = Date()) -> String {
        let c = FechaMexico.calendario.dateComponents([.year, .month], from: ahora)
        return String(format: "%04d-%02d", c.year ?? 0, c.month ?? 1)
    }

    /// `2026-11` → «Noviembre 2026».
    static func nombreMes(_ mes: String) -> String {
        guard let p = partes(mes) else { return mes }
        let nombre = meses[p.numero - 1]
        return "\(nombre.prefix(1).uppercased())\(nombre.dropFirst()) \(p.anio)"
    }

    static func mesAnterior(_ mes: String) -> String {
        guard let p = partes(mes) else { return mes }
        return p.numero == 1 ? String(format: "%04d-12", p.anio - 1) : String(format: "%04d-%02d", p.anio, p.numero - 1)
    }

    static func mesSiguiente(_ mes: String) -> String {
        guard let p = partes(mes) else { return mes }
        return p.numero == 12 ? String(format: "%04d-01", p.anio + 1) : String(format: "%04d-%02d", p.anio, p.numero + 1)
    }

    // MARK: Textos

    /// Sin dato es «—», no cero.
    static func pesos(_ valor: Double?) -> String {
        guard let valor else { return "—" }
        return "$" + GasolinaRules.agrupado(String(format: "%.0f", valor))
    }

    static func pesos2(_ valor: Double?) -> String {
        guard let valor else { return "—" }
        return "$" + GasolinaRules.agrupado(String(format: "%.2f", valor))
    }

    static func km(_ valor: Double?) -> String {
        guard let valor else { return "—" }
        return GasolinaRules.agrupado(String(format: "%.0f", valor)) + " km"
    }

    static func kmPorLitro(_ valor: Double?) -> String {
        guard let valor else { return "—" }
        return String(format: "%.1f km/L", valor)
    }

    static func litros(_ valor: Double?) -> String {
        guard let valor else { return "—" }
        return "\(GasolinaRules.textoCrudo(valor)) L"
    }

    /// `2026-10-28…` → «28 oct». No pasa por fecha: un día sin hora se correría en México.
    static func fechaCorta(_ iso: String?) -> String {
        let trozos = (iso ?? "").prefix(10).split(separator: "-")
        guard trozos.count == 3, let mes = Int(trozos[1]), (1...12).contains(mes), let dia = Int(trozos[2]) else {
            return "—"
        }
        return "\(dia) \(mesesCortos[mes - 1])"
    }

    /// «En 7,540 km», «Vencido por 320 km» o la fecha, si solo va por tiempo.
    static func textoServicio(_ p: ProximoServicioFicha?) -> String {
        guard let p else { return "Sin programa" }
        if let faltan = p.faltanKm {
            return faltan < 0 ? "Vencido por \(km(-faltan))" : "En \(km(faltan))"
        }
        if let fecha = p.fecha {
            return "\(p.estado == "VENCIDO" ? "Venció" : "El") \(fechaCorta(fecha))"
        }
        return "Sin programa"
    }

    /// Quién lo trae, y si no, en qué está.
    static func quienLoTrae(_ v: VehiculoFlota) -> String {
        if let conductor = v.conductor?.nombre, !conductor.isEmpty { return "Lo trae \(conductor)" }
        if v.disponible { return "Libre" }
        return v.estatus.isEmpty ? "Sin asignar" : v.estatus
    }

    // MARK: Solicitudes y altas

    /// Lo que todavía se puede decidir: el servidor rechaza lo que ya está `Aprobado` o `Rechazado`.
    static func porAprobar(_ solicitudes: [SolicitudPorAprobar]) -> [SolicitudPorAprobar] {
        solicitudes.filter { solicitud in
            let estatus = solicitud.estatusAprobacion.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return !["aprobado", "aprobada", "rechazado", "rechazada"].contains(estatus)
        }
    }

    /// El vehículo pedido, con lo que traiga la solicitud o la unidad ligada.
    static func vehiculoDe(_ solicitud: SolicitudPorAprobar) -> String {
        let nombre = solicitud.vehiculo?.nombre.nilSiVacio ?? solicitud.nombreVehiculo?.nilSiVacio
        let placas = solicitud.vehiculo?.placas?.nilSiVacio ?? solicitud.placasVehiculo?.nilSiVacio
        let partes = [nombre, placas].compactMap { $0 }
        return partes.isEmpty ? "Vehículo sin nombre" : partes.joined(separator: " · ")
    }

    static func quienPide(_ solicitud: SolicitudPorAprobar) -> String {
        solicitud.solicitante?.nombre.nilSiVacio ?? "Sin persona registrada"
    }

    /// «Da de alta unidades»: Iván. `vehicles.inventory` no basta: también lo traen operaciones y
    /// arquitectura, y a arquitectura el servidor se lo niega. Dirección ve su flotilla.
    static func daDeAltaUnidades(esDireccion: Bool, permisos: [String]) -> Bool {
        !esDireccion && permisos.contains("vehicles.inventory") && permisos.contains("stock.manage")
    }

    /// El vacío de quien usa vehículos, según lo que puede hacer al respecto.
    static func vacioSinVehiculos(daDeAlta: Bool) -> String {
        daDeAlta
            ? "Todavía no hay unidades libres. Da de alta la primera y aquí aparece para sacarla."
            : "No traes vehículo y ahora no hay unidades libres. Cuando haya una, aquí la puedes sacar."
    }

    // MARK: A dónde se fue el dinero

    struct RenglonGasto: Identifiable, Hashable {
        var id: String { nombre }
        let nombre: String
        let nota: String
        let km: Double?
        let importe: Double
        var pct: Int = 0
    }

    /// Lo que vale cero no se pinta.
    static func repartoDelMes(_ r: RepartoMes?) -> [RenglonGasto] {
        guard let r else { return [] }
        let crudos = [
            RenglonGasto(nombre: "A proyectos", nota: "Costo directo del proyecto", km: r.proyectos?.km, importe: r.proyectos?.importe ?? 0),
            RenglonGasto(nombre: "A cotizaciones sin proyecto", nota: "Pasa al proyecto si se gana; si no, es costo de venta", km: r.cotizaciones?.km, importe: r.cotizaciones?.importe ?? 0),
            RenglonGasto(nombre: "Oficina", nota: "Trámites y compras: indirecto", km: r.oficina?.km, importe: r.oficina?.importe ?? 0),
            RenglonGasto(nombre: "Sin ligar", nota: "Falta decir a qué trabajo fue", km: r.sinLigar?.km, importe: r.sinLigar?.importe ?? 0),
            RenglonGasto(nombre: "Parado", nota: "Seguro y dinero invertido aunque no salga: indirecto", km: nil, importe: r.parado ?? 0),
        ]
        let total = crudos.reduce(0) { $0 + $1.importe }
        guard total > 0 else { return [] }
        return crudos.filter { $0.importe > 0 }.map { renglon in
            var conPct = renglon
            conPct.pct = Int((renglon.importe / total * 100).rounded())
            return conPct
        }
    }
}
