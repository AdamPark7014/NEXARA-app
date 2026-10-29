import Foundation

// MARK: - Tiempo

/// Tarjeta «Tiempo» y renglón «Tiempo estándar» del detalle de actividad, como la web
/// (`TiempoActividad.tsx` con `medidorDeTiempo` de `apps/web/lib/actividad-tiempos.ts`, y
/// `resumenEstandar` de `apps/web/lib/tiempo-estandar.ts`). Espejo de `ActividadTiempoRules.kt`.
enum ActividadTiempoRules {

    /// Sin tiempo máximo, el tope es el plan más este margen (el mismo de los KPI).
    static let toleranciaDelPlan = 1.25

    enum Estado: String {
        case sinPlan, enTiempo, cerca, excedida
    }

    struct Medidor: Equatable {
        let real: Int
        let plan: Int?
        let tope: Int?
        /// real ÷ plan, de 0 a 1: el anillo da una vuelta en el plan. nil sin plan.
        let avance: Double?
        let estado: Estado
        /// «va en tiempo», «le quedan 40 min para el tope», «se pasó 25 min del tope».
        let texto: String
    }

    /// «2 h 35 min», «45 min», «0 min»; nil sin dato (igual que `formatoMinutos` de la web).
    static func formatoMinutos(_ minutos: Double?) -> String? {
        guard let minutos, minutos.isFinite, minutos >= 0, minutos < 1_000_000_000 else { return nil }
        let total = Int(minutos.rounded())
        let h = total / 60
        let m = total % 60
        if h <= 0 { return "\(m) min" }
        return m != 0 ? "\(h) h \(m) min" : "\(h) h"
    }

    static func formatoMinutos(_ minutos: Int?) -> String? {
        formatoMinutos(minutos.map { Double($0) })
    }

    /// Minutos redondeados si son útiles (más de cero); nil si no.
    private static func positivo(_ valor: Double?) -> Int? {
        guard let valor, valor.isFinite, valor < 1_000_000_000 else { return nil }
        let n = Int(valor.rounded())
        return n > 0 ? n : nil
    }

    /// Lo trabajado contra lo planeado y el tope (su tiempo máximo, o el plan + 25 %).
    /// «Cerca» = ya pasó el plan sin llegar al tope; «excedida» = pasó el tope.
    static func medidor(minutosPlan: Double?, minutosReales: Double?, tiempoMaximoMin: Double?) -> Medidor {
        var bruto = 0.0
        if let minutosReales, minutosReales.isFinite, minutosReales > 0, minutosReales < 1_000_000_000 {
            bruto = minutosReales
        }
        let real = Int(bruto.rounded())
        let plan = positivo(minutosPlan)
        let maximo = positivo(tiempoMaximoMin)
        let tope: Int? = maximo ?? plan.map { Int((Double($0) * toleranciaDelPlan).rounded()) }
        guard let plan else {
            return Medidor(
                real: real,
                plan: nil,
                tope: tope,
                avance: nil,
                estado: .sinPlan,
                texto: real > 0 ? "sin tiempo planeado" : "aún sin tiempo"
            )
        }
        let avance = min(1, max(0, Double(real) / Double(plan)))
        if let tope, real > tope {
            let pasado = formatoMinutos(real - tope) ?? ""
            return Medidor(real: real, plan: plan, tope: tope, avance: avance, estado: .excedida, texto: "se pasó \(pasado) del tope")
        }
        if real > plan {
            let texto: String
            if let tope {
                texto = "le quedan \(formatoMinutos(tope - real) ?? "") para el tope"
            } else {
                texto = "ya pasó lo planeado"
            }
            return Medidor(real: real, plan: plan, tope: tope, avance: avance, estado: .cerca, texto: texto)
        }
        return Medidor(real: real, plan: plan, tope: tope, avance: avance, estado: .enTiempo, texto: "va en tiempo")
    }

    /// Sin plan y sin nada trabajado no hay nada que contar: la tarjeta no se pinta.
    static func visible(_ m: Medidor) -> Bool {
        !(m.estado == .sinPlan && m.real == 0)
    }

    /// «En curso»: el reloj de CUALQUIERA del equipo que siga en la actividad, no solo el de quien
    /// mira (un jefe que revisa no está en el equipo y nunca veía que el reloj corría).
    static func enCurso(_ assignees: [[String: Any]]) -> Bool {
        assignees.contains { fila in
            let retirada = ActivityParse.str(fila["retiradoAt"]).trimmingCharacters(in: .whitespacesAndNewlines)
            let desde = ActivityParse.str(fila["sesionAbiertaDesde"]).trimmingCharacters(in: .whitespacesAndNewlines)
            return retirada.isEmpty && !desde.isEmpty
        }
    }

    static func realTexto(_ m: Medidor) -> String {
        formatoMinutos(m.real) ?? "0 min"
    }

    static func contraTexto(_ m: Medidor) -> String {
        guard let plan = m.plan else { return "trabajadas" }
        return "de \(formatoMinutos(plan) ?? "") planeadas"
    }

    /// «Tope: 2 h 30 min (plan + 25 %)»; sin «plan + 25 %» cuando el tope es su tiempo máximo.
    static func pieTope(_ m: Medidor, tiempoMaximoMin: Double?) -> String? {
        guard let tope = m.tope else { return nil }
        let propio = (tiempoMaximoMin ?? 0) > 0
        return "Tope: \(formatoMinutos(tope) ?? "")" + (propio ? "" : " (plan + 25 %)")
    }

    /// «Estándar: 4 h · lleva el 35 % del estándar».
    static func pieEstandar(_ minutosEstandar: Double?, _ m: Medidor) -> String? {
        guard let estandar = minutosEstandar, estandar.isFinite, estandar > 0 else { return nil }
        let base = "Estándar: \(formatoMinutos(estandar) ?? "")"
        guard m.real > 0 else { return base }
        let porcentaje = Int((Double(m.real) / estandar * 100).rounded())
        return "\(base) · lleva el \(porcentaje) % del estándar"
    }

    /// Lo que lee VoiceOver sobre la tarjeta.
    static func etiquetaAccesible(_ m: Medidor) -> String {
        guard let plan = m.plan else { return m.texto }
        return "\(realTexto(m)) de \(formatoMinutos(plan) ?? "") planeadas: \(m.texto)"
    }

    // MARK: Tiempo estándar en «Datos de la actividad»

    struct ResumenEstandar: Equatable {
        let valor: String
        let detalle: String?
    }

    /// «4 h» con su desglose en una línea: «Base de cotización 40 min · 50 partidas × 4 min 3 h 20 min
    /// · Destino: … (en transporte) · Se cambió el tiempo: …». nil sin tiempo estándar guardado.
    static func resumenEstandar(_ raw: [String: Any]) -> ResumenEstandar? {
        guard let total = ActivityParse.double(raw["tiempoEstandarMin"]), total.isFinite else { return nil }
        var partes: [String] = []
        for linea in raw["estandarDesglose"] as? [[String: Any]] ?? [] {
            let concepto = ActivityParse.str(linea["concepto"]).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !concepto.isEmpty else { continue }
            // «Supuesto: …» llega con 0: va sin minutos.
            if let minutos = ActivityParse.double(linea["minutos"]), minutos.isFinite, minutos > 0 {
                partes.append("\(concepto) \(texto(minutos))")
            } else {
                partes.append(concepto)
            }
        }
        let destino = raw["destino"] as? [String: Any]
        let direccion = ActivityParse.str(destino?["direccion"]).trimmingCharacters(in: .whitespacesAndNewlines)
        if !direccion.isEmpty {
            let modo = ActivityParse.str(raw["trasladoModo"]).trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
            partes.append("Destino: \(direccion)" + (modo == "TRANSPORTE" ? " (en transporte)" : ""))
        }
        let motivo = ActivityParse.str(raw["estandarCambiadoMotivo"]).trimmingCharacters(in: .whitespacesAndNewlines)
        if !motivo.isEmpty {
            partes.append("Se cambió el tiempo: \(motivo)")
        }
        return ResumenEstandar(valor: texto(total), detalle: partes.isEmpty ? nil : partes.joined(separator: " · "))
    }

    private static func texto(_ minutos: Double) -> String {
        formatoMinutos(minutos) ?? "\(Int(minutos.rounded())) min"
    }
}

// MARK: - Costo directo

/// «Costo directo» del detalle de actividad, como la web (`CostoActividad.tsx`): viáticos imputados
/// (su parte del reparto) y material del almacén. Solo dirección y coordinación de Admin y
/// Operaciones; sin nada que sumar no se pinta. Espejo de `ActividadCostoRules.kt`.
enum ActividadCostoRules {
    static let titulo = "Costo directo"
    static let nota = "La mano de obra y el margen aparecen cuando la nómina y la factura pasen por el sistema."

    /// `VEN_COSTO` de la web: CEO, directores y coordinadores de Admin y Operaciones.
    static let venCosto: Set<String> = [
        RolePanelMatrix.ceo,
        RolePanelMatrix.dirAdmin,
        RolePanelMatrix.dirOperaciones,
        RolePanelMatrix.coordAdmin,
        RolePanelMatrix.coordOperaciones,
    ]

    /// La misma regla que la web: super admin, o un rol de `venCosto`. El dueño de la plataforma
    /// (y su equivalente) cuenta como CEO, igual que `resolveV2RoleKey`.
    static func puedeVer(_ user: SessionUser?) -> Bool {
        guard let user else { return false }
        if user.isSuperAdmin || CoreOrg.isCeo(user.email) { return true }
        let rol = RolePanelMatrix.canonicalRoleKey(
            roleKey: user.roleKey,
            orgRoleKey: user.orgRoleKey,
            roleDisplayName: user.role
        )
        guard let rol else { return false }
        return venCosto.contains(rol)
    }

    struct Costo: Equatable {
        let viaticosCentavos: Int
        let nViaticos: Int
        let materialCentavos: Int
        let nMaterial: Int

        var totalCentavos: Int { viaticosCentavos + materialCentavos }
    }

    /// Lo que este viático le carga a la actividad: su parte del reparto si está repartido; si no,
    /// lo solicitado. nil si no es suyo.
    static func montoEnActividad(_ v: Viatico, activityId: Int) -> Double? {
        let propio = v.actividadId == activityId
        let parte = v.repartos.first { $0.actividadId == activityId }
        guard propio || parte != nil else { return nil }
        if v.repartos.isEmpty { return v.montoSolicitado }
        return parte?.monto ?? 0
    }

    static func costo(viaticos: [Viatico]?, activityId: Int, materiales: ActivityMateriales?) -> Costo {
        let montos = (viaticos ?? []).compactMap { montoEnActividad($0, activityId: activityId) }
        return Costo(
            viaticosCentavos: montos.reduce(0) { $0 + Dinero.deApi($1) },
            nViaticos: montos.count,
            materialCentavos: Dinero.deApi(materiales?.costoTotal),
            nMaterial: materiales?.movimientos ?? 0
        )
    }

    /// Se pinta si hay algo que sumar (un monto, o al menos un renglón aunque sea de $0).
    static func visible(_ c: Costo) -> Bool {
        !(c.totalCentavos <= 0 && c.nViaticos == 0 && c.nMaterial == 0)
    }

    static func etiquetaViaticos(_ c: Costo) -> String {
        c.nViaticos > 0 ? "Viáticos · \(c.nViaticos)" : "Viáticos"
    }

    static func etiquetaMaterial(_ c: Costo) -> String {
        c.nMaterial > 0 ? "Material del almacén · \(c.nMaterial)" : "Material del almacén"
    }

    static func pesos(_ centavos: Int) -> String {
        Dinero.pesos(centavos)
    }
}

// MARK: - Cotización ligada

/// La cotización de una actividad comercial (`GET activities/:id` → `cotizacion`).
struct ActividadCotizacionLigada: Equatable {
    let id: Int
    let quoteNumber: String?
    let status: String?
    /// Decimal del API, como texto («14500.5»).
    let total: String?

    init?(_ valor: Any?) {
        guard let map = valor as? [String: Any], let id = ActivityParse.int(map["id"]), id > 0 else { return nil }
        self.id = id
        let folio = ActivityParse.str(map["quoteNumber"]).trimmingCharacters(in: .whitespacesAndNewlines)
        quoteNumber = folio.isEmpty ? nil : folio
        let estado = ActivityParse.str(map["status"]).trimmingCharacters(in: .whitespacesAndNewlines)
        status = estado.isEmpty ? nil : estado
        let monto = ActivityParse.str(map["total"]).trimmingCharacters(in: .whitespacesAndNewlines)
        total = monto.isEmpty ? nil : monto
    }

    init(id: Int, quoteNumber: String?, status: String?, total: String?) {
        self.id = id
        self.quoteNumber = quoteNumber
        self.status = status
        self.total = total
    }
}

/// Como la web (`CotizacionDeActividad.tsx` y `PropuestaEmbebida.tsx`): folio · estado · total y la
/// propuesta en PDF (`GET cotizaciones/:id/pdf`). El teléfono solo la consulta. Espejo de
/// `ActividadCotizacionRules.kt`.
enum ActividadCotizacionRules {
    static let titulo = "Cotización"
    static let nota = "Las fotos del levantamiento de esta actividad salen como anexos (03 Planos) de la propuesta."
    static let boton = "Ver propuesta en PDF"
    static let abriendo = "Abriendo la propuesta…"
    static let sinAcceso = "No tienes acceso a cotizaciones"
    static let fallo = "No se pudo generar la propuesta en PDF."

    /// Solo en comerciales con una cotización ligada.
    static func aplica(coreKind: String?, cotizacion: ActividadCotizacionLigada?) -> Bool {
        CoreEvidence.isComercial(coreKind) && cotizacion != nil
    }

    static func folio(_ c: ActividadCotizacionLigada) -> String {
        c.quoteNumber ?? "#\(c.id)"
    }

    /// El estado en español; sin estado conocido es «Borrador», como en la web.
    static func estado(_ status: String?) -> String {
        let e = CotizacionesRules.estado(status)
        return e == .desconocido ? CotizacionesRules.Estado.borrador.etiqueta : e.etiqueta
    }

    /// «COT-0012 · Enviada · $14,500.50» (sin total si no llega o no se lee).
    static func linea(_ c: ActividadCotizacionLigada) -> String {
        var partes = [folio(c), estado(c.status)]
        let monto = CotizacionesRules.pesos(c.total)
        if monto != "—" { partes.append(monto) }
        return partes.joined(separator: " · ")
    }

    /// El mensaje cuando el PDF no abre: 403 = el rol no ve cotizaciones.
    static func error(prohibido: Bool, mensaje: String?) -> String {
        if prohibido { return sinAcceso }
        let texto = (mensaje ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return texto.isEmpty ? fallo : texto
    }
}
