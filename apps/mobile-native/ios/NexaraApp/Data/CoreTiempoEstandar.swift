import Foundation

/// Tiempo estándar al asignar a otra persona (§8, tarifas de Adam). Espejo de
/// apps/web/lib/tiempo-estandar.ts y de `TiempoEstandar.kt` de Android: la tabla vive en la API
/// (`GET ai/estandar/tabla`) y la suma se hace aquí con la misma fórmula que `calcularEstandar`,
/// para que el formulario responda al instante. La IA solo propone la cantidad (y el destino);
/// quien asigna la confirma y el tiempo lo da la tabla.
enum CoreTiempoEstandar {
    static let topeMin = 720
    /// Cambiar el tiempo del estándar pide un motivo de al menos esto.
    static let motivoMinimo = 5

    struct Unidad: Hashable {
        let clave: String
        let singular: String
        let plural: String
        /// «¿Cuántas partidas?»
        let pregunta: String
        let porUnidadMin: Int
        /// Unidades que ya cubre la base; se cobran solo las de más (cotización: hasta 10 partidas).
        let incluidas: Int
    }

    struct Regla: Hashable {
        /// `comercial`, `tarea:Instalación`, `servicio:CORRECTIVO`…
        let clave: String
        let nombre: String
        let baseMin: Int
        /// Lo que se cuenta; la primera es la de omisión. Vacío = el tipo no tiene cantidad.
        let unidades: [Unidad]
        /// Minutos por nivel, en los tipos sin cantidad.
        let porComplejidad: [CoreComplejidad: Int]?
        /// Va a otro lugar: se suma ida y vuelta según la ruta.
        let destino: Bool
        let enLugarMin: Int
        /// Juntas, cursos, guardias: dura lo que dure la agenda; no hay estándar.
        let agenda: Bool
    }

    struct Tabla: Hashable {
        let reglas: [Regla]
        let topeMin: Int
        let origen: String?
    }

    /// Renglón del desglose; viaja tal cual en `estandarDesglose`.
    struct Concepto: Hashable, Encodable {
        let concepto: String
        let minutos: Int
    }

    struct Traslado: Hashable {
        let idaMin: Int
        let vueltaMin: Int
    }

    enum Faltante: Hashable {
        case cantidad, destino, complejidad
    }

    struct Resultado: Hashable {
        let totalMin: Int?
        let desglose: [Concepto]
        let faltan: [Faltante]
        let topado: Bool
    }

    /// `unidades` de la actividad: qué se contó y cuántas.
    struct Unidades: Hashable, Encodable {
        let clave: String
        let cantidad: Int
    }

    /// Lo que se manda a la API (los mismos nombres que la web). Cada campo solo si se calculó:
    /// sin total no hay `tiempoEstandarMin` ni desglose (la API los completa), y el motivo solo si
    /// quien asigna cambió el tiempo con un motivo válido.
    struct Envio: Hashable {
        let unidades: Unidades?
        let tiempoEstandarMin: Int?
        let desglose: [Concepto]?
        let motivo: String?
    }

    // MARK: Tabla

    private static func entero(_ value: Any?) -> Int {
        guard let d = ActivityParse.double(value), d.isFinite, d > 0 else { return 0 }
        return Int(d.rounded())
    }

    private static func texto(_ value: Any?) -> String {
        ActivityParse.str(value).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Respuesta de `GET ai/estandar/tabla`; lo incompleto se descarta. nil si no trae reglas.
    static func tabla(map: [String: Any]) -> Tabla? {
        let filas = map["reglas"] as? [[String: Any]] ?? []
        let reglas: [Regla] = filas.compactMap { r in
            let clave = texto(r["clave"])
            guard !clave.isEmpty else { return nil }
            let nombre = texto(r["nombre"])
            let unidades: [Unidad] = (r["unidades"] as? [[String: Any]] ?? []).compactMap { u in
                let uc = texto(u["clave"])
                guard !uc.isEmpty else { return nil }
                let pluralLeido = texto(u["plural"])
                let plural = pluralLeido.isEmpty ? uc : pluralLeido
                let singular = texto(u["singular"])
                let pregunta = texto(u["pregunta"])
                return Unidad(
                    clave: uc,
                    singular: singular.isEmpty ? plural : singular,
                    plural: plural,
                    pregunta: pregunta.isEmpty ? "¿Cuántos \(plural)?" : pregunta,
                    porUnidadMin: entero(u["porUnidadMin"]),
                    incluidas: entero(u["incluidas"])
                )
            }
            var porComplejidad: [CoreComplejidad: Int]?
            if let niveles = r["porComplejidad"] as? [String: Any] {
                var leidos: [CoreComplejidad: Int] = [:]
                for nivel in CoreComplejidad.allCases where niveles[nivel.rawValue] != nil {
                    leidos[nivel] = entero(niveles[nivel.rawValue])
                }
                porComplejidad = leidos.isEmpty ? nil : leidos
            }
            return Regla(
                clave: clave,
                nombre: nombre.isEmpty ? clave : nombre,
                baseMin: entero(r["baseMin"]),
                unidades: unidades,
                porComplejidad: porComplejidad,
                destino: (r["destino"] as? Bool) ?? false,
                enLugarMin: entero(r["enLugarMin"]),
                agenda: (r["agenda"] as? Bool) ?? false
            )
        }
        guard !reglas.isEmpty else { return nil }
        let tope = entero(map["topeMin"])
        let origen = texto((map["origen"] as? [String: Any])?["nombre"])
        return Tabla(reglas: reglas, topeMin: tope > 0 ? tope : topeMin, origen: origen.isEmpty ? nil : origen)
    }

    // MARK: Qué regla le toca

    private static func normalizar(_ value: String?) -> String {
        (value ?? "")
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_MX"))
            .lowercased()
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
    }

    /// La clave de la tabla (`claveEstandar` web): en tarea, su subtipo del catálogo; en servicio,
    /// el tipo de ticket; en lo demás, el tipo Core.
    static func clave(coreKind: String?, ticketType: String?, tipoTarea: String?) -> String? {
        let kind = normalizar(coreKind)
        guard !kind.isEmpty else { return nil }
        if kind == "tarea" {
            let tipo = (tipoTarea ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return tipo.isEmpty ? nil : "tarea:\(tipo)"
        }
        if kind == "servicio" {
            let tipo = (ticketType ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return "servicio:\(tipo.isEmpty ? "PREVENTIVO" : tipo.uppercased())"
        }
        return kind
    }

    /// Sin pelear con acentos ni mayúsculas; nil si el tipo no tiene regla.
    static func reglaPara(_ tabla: Tabla?, clave: String?) -> Regla? {
        guard let tabla, let clave else { return nil }
        let buscada = normalizar(clave)
        return tabla.reglas.first(where: { normalizar($0.clave) == buscada })
    }

    /// La unidad elegida o, si no está en la regla, la primera (la de omisión).
    static func unidad(_ regla: Regla?, clave: String?) -> Unidad? {
        guard let regla else { return nil }
        return regla.unidades.first(where: { $0.clave == clave }) ?? regla.unidades.first
    }

    // MARK: La cuenta

    /// La misma cuenta que la API: base + (cantidad − incluidas) × tarifa (o por complejidad) +
    /// ida y vuelta + en el lugar, redondeada a 5 min y con tope.
    static func calcular(
        _ regla: Regla,
        cantidad: Int? = nil,
        unidad claveUnidad: String? = nil,
        complejidad: CoreComplejidad? = nil,
        traslado: Traslado? = nil,
        tope: Int = CoreTiempoEstandar.topeMin
    ) -> Resultado {
        var desglose: [Concepto] = []
        var faltan: [Faltante] = []
        if regla.agenda { return Resultado(totalMin: nil, desglose: [], faltan: [], topado: false) }
        if let u = unidad(regla, clave: claveUnidad) {
            let n = max(0, cantidad ?? 0)
            let incluidas = max(0, u.incluidas)
            if regla.baseMin > 0 {
                let hasta = incluidas > 0 ? " (hasta \(incluidas) \(u.plural))" : ""
                desglose.append(Concepto(concepto: "Base de \(regla.nombre.lowercased())\(hasta)", minutos: regla.baseMin))
            }
            // Lo que la base ya cubre no se cobra otra vez: solo las unidades de más.
            let extra = n - incluidas
            if n > 0 && extra > 0 {
                let nombre = extra == 1 ? u.singular : u.plural
                desglose.append(Concepto(
                    concepto: "\(extra) \(nombre)\(incluidas > 0 ? " más" : "") × \(u.porUnidadMin) min",
                    minutos: extra * u.porUnidadMin
                ))
            }
            if n <= 0 { faltan.append(.cantidad) }
        } else if let tabla = regla.porComplejidad {
            if let complejidad, let minutos = tabla[complejidad] {
                desglose.append(Concepto(concepto: "\(regla.nombre) · complejidad", minutos: minutos))
            } else {
                faltan.append(.complejidad)
            }
        } else if regla.baseMin > 0 {
            desglose.append(Concepto(concepto: regla.nombre, minutos: regla.baseMin))
        }
        if regla.destino {
            if let traslado {
                desglose.append(Concepto(concepto: "Ida", minutos: max(0, traslado.idaMin)))
                desglose.append(Concepto(concepto: "Vuelta", minutos: max(0, traslado.vueltaMin)))
            } else {
                faltan.append(.destino)
            }
            if regla.enLugarMin > 0 { desglose.append(Concepto(concepto: "En el lugar", minutos: regla.enLugarMin)) }
        }
        if !faltan.isEmpty { return Resultado(totalMin: nil, desglose: desglose, faltan: faltan, topado: false) }
        let suma = desglose.reduce(0) { $0 + $1.minutos }
        let redondeado = max(5, Int((Double(suma) / 5).rounded()) * 5)
        return Resultado(totalMin: min(tope, redondeado), desglose: desglose, faltan: [], topado: redondeado > tope)
    }

    /// «Para calcularlo falta la cantidad de dispositivos.» / «… falta la complejidad y el destino.»
    static func textoFaltan(_ faltan: [Faltante], regla: Regla?) -> String? {
        guard !faltan.isEmpty else { return nil }
        let nombres: [String] = faltan.map { f in
            switch f {
            case .cantidad: return regla?.unidades.first.map { "la cantidad de \($0.plural)" } ?? "la cantidad"
            case .destino: return "el destino"
            case .complejidad: return "la complejidad"
            }
        }
        let lista = nombres.count == 1
            ? nombres[0]
            : "\(nombres.dropLast().joined(separator: ", ")) y \(nombres[nombres.count - 1])"
        return "Para calcularlo falta \(lista)."
    }

    /// «Sale de la complejidad: Básica 1 h · Estándar 2 h · …»; nil si el tipo se cuenta por cantidad.
    static func textoPorComplejidad(_ regla: Regla) -> String? {
        guard let tabla = regla.porComplejidad else { return nil }
        let partes = CoreComplejidad.allCases.compactMap { nivel in
            tabla[nivel].map { "\(nivel.label) \(CoreComplejidad.formatoMinutos($0))" }
        }
        return partes.isEmpty ? nil : "Sale de la complejidad: \(partes.joined(separator: " · "))."
    }

    /// El motivo para no usar el estándar: obligatorio y con sustancia.
    static func motivoValido(_ motivo: String?) -> Bool {
        (motivo ?? "").trimmingCharacters(in: .whitespacesAndNewlines).count >= motivoMinimo
    }

    // MARK: Lo que viaja

    /// El estándar armado con lo capturado. nil sin regla, en tipos de agenda o si no hay nada que
    /// mandar (ni cantidad ni total).
    static func envio(
        regla: Regla?,
        resultado: Resultado?,
        cantidad: Int?,
        unidad: Unidad?,
        cambiando: Bool,
        motivo: String?
    ) -> Envio? {
        guard let regla, !regla.agenda, let resultado else { return nil }
        let n = max(0, cantidad ?? 0)
        let total = resultado.totalMin
        let unidades: Unidades? = !regla.unidades.isEmpty && n > 0 ? unidad.map { Unidades(clave: $0.clave, cantidad: n) } : nil
        let limpio = (motivo ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard unidades != nil || total != nil else { return nil }
        return Envio(
            unidades: unidades,
            tiempoEstandarMin: total,
            desglose: total == nil ? nil : resultado.desglose,
            motivo: total != nil && cambiando && motivoValido(limpio) ? limpio : nil
        )
    }

    /// El tiempo que fija el estándar en «¿Cuánto tiempo toma?»: el total mientras nadie lo
    /// cambie con motivo; nil = el campo es libre (sin total, o cambiado con motivo).
    static func minutosFijos(_ envio: Envio?) -> Int? {
        guard let envio, envio.motivo == nil else { return nil }
        return envio.tiempoEstandarMin
    }

    /// El estimado que sale. Nunca un `tiempoEstandarMin` distinto del estimado sin motivo (la API
    /// responde 400): sin motivo, el estimado es el estándar.
    static func estimadoAMandar(capturado: Int?, envio: Envio?) -> Int? {
        minutosFijos(envio) ?? capturado
    }
}
