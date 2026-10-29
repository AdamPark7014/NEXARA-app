import Foundation

/// Los tres módulos de «Más» que son **solo consulta** — mismo contrato que
/// `CoreExtrasApi` en Android:
///
/// | Pantalla        | Endpoint                                         |
/// |-----------------|--------------------------------------------------|
/// | KPIs del equipo | `GET me/kpis/equipo?desde&hasta`                 |
/// | Proyectos       | `GET proyectos`                                  |
/// | Almacén         | `GET stock/levels` · `GET stock/alerts/low-stock` |
///
/// Regla de decodificación, igual que en el resto del árbol: **todo campo que el
/// API pueda mandar nulo se decodifica con valor por omisión**. Un registro raro
/// deja una tarjeta incompleta, nunca tumba la pantalla. Los `Decimal` de Prisma
/// llegan como texto o como número según el campo, así que pasan por
/// `StockParse`, que entiende las dos formas.

// MARK: - KPIs del equipo

/// Entero que el API puede mandar como `12` o como `12.0`; lo que no se lee, 0.
private func kpiEntero<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> Int {
    if let n = try? c.decode(Int.self, forKey: key) { return n }
    if let d = try? c.decode(Double.self, forKey: key), d.isFinite, abs(d) < 1e12 { return Int(d.rounded()) }
    return 0
}

/// Un texto que el API puede mandar tal cual («alta», «verde») o dentro de un objeto
/// (`{ "nivel": "alta" }`, `{ "semaforo": "verde" }`). Es para la confianza y el semáforo
/// que el API va a empezar a mandar: se aceptan las dos formas y lo que no se entiende
/// queda vacío (las reglas calculan entonces lo suyo, como la web).
struct KpiTextoFlexible: Decodable, Hashable {
    /// Cuando llega como texto.
    var texto: String?
    /// Cuando llega como objeto: sus campos de texto.
    var campos: [String: String] = [:]

    private struct Clave: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }

    init(from decoder: Decoder) throws {
        if let c = try? decoder.singleValueContainer(), let s = try? c.decode(String.self) {
            texto = KpiTextoFlexible.limpio(s)
            return
        }
        if let c = try? decoder.container(keyedBy: Clave.self) {
            for k in c.allKeys {
                if let s = try? c.decode(String.self, forKey: k), let t = KpiTextoFlexible.limpio(s) {
                    campos[k.stringValue] = t
                }
            }
        }
    }

    /// El texto, o el primero de `claves` que traiga el objeto.
    func valor(_ claves: [String]) -> String? {
        if let texto { return texto }
        for k in claves {
            if let v = campos[k] { return v }
        }
        return nil
    }

    private static func limpio(_ s: String) -> String? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}

struct KpiUniforme: Decodable, Hashable {
    var revisadas: Int = 0
    var ok: Int = 0
    var noOk: Int = 0
    var sinRevisar: Int = 0
    /// % de las revisadas con ✓; `nil` si nadie ha revisado ninguna.
    var pct: Double?

    private enum CodingKeys: String, CodingKey { case revisadas, ok, noOk, sinRevisar, pct }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        revisadas = (try? c.decode(Int.self, forKey: .revisadas)) ?? 0
        ok = (try? c.decode(Int.self, forKey: .ok)) ?? 0
        noOk = (try? c.decode(Int.self, forKey: .noOk)) ?? 0
        sinRevisar = (try? c.decode(Int.self, forKey: .sinRevisar)) ?? 0
        pct = try? c.decode(Double.self, forKey: .pct)
    }
}

/// Entregas de actividades del rango: el «en tiempo y forma» (07-10). Llega en los
/// totales de cada persona y del equipo; con la API vieja no viene.
struct KpiEntregas: Decodable, Hashable {
    /// Entregadas en el rango + las que vencieron en el rango sin entregarse.
    var medidas: Int = 0
    /// Entregadas antes de su límite (sin límite cuentan a tiempo).
    var aTiempo: Int = 0
    var tarde: Int = 0
    /// Su límite ya pasó y no la ha entregado.
    var sinEntregar: Int = 0
    /// Con al menos una revisión del jefe.
    var revisadas: Int = 0
    var aprobadasALaPrimera: Int = 0
    var devueltas: Int = 0
    /// aTiempo ÷ medidas; `nil` sin medidas.
    var pctATiempo: Double?
    /// aprobadasALaPrimera ÷ revisadas; `nil` sin revisadas.
    var pctALaPrimera: Double?
    /// Horas estándar ganadas (pilar Rendimiento, 29-10): entregadas con tiempo estándar,
    /// la suma de sus estándares (lo autoasignado sin validar, la mitad) y lo que tardaron.
    var conEstandar: Int = 0
    var minutosEstandarGanados: Int = 0
    var minutosRealesConEstandar: Int = 0
    /// Estándar ÷ real con tope de 100; `nil` sin dato.
    var pctEficienciaEstandar: Double?

    private enum CodingKeys: String, CodingKey {
        case medidas, aTiempo, tarde, sinEntregar, revisadas, aprobadasALaPrimera, devueltas
        case pctATiempo, pctALaPrimera
        case conEstandar, minutosEstandarGanados, minutosRealesConEstandar, pctEficienciaEstandar
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func entero(_ key: CodingKeys) -> Int { kpiEntero(c, key) }
        medidas = entero(.medidas)
        aTiempo = entero(.aTiempo)
        tarde = entero(.tarde)
        sinEntregar = entero(.sinEntregar)
        revisadas = entero(.revisadas)
        aprobadasALaPrimera = entero(.aprobadasALaPrimera)
        devueltas = entero(.devueltas)
        pctATiempo = try? c.decode(Double.self, forKey: .pctATiempo)
        pctALaPrimera = try? c.decode(Double.self, forKey: .pctALaPrimera)
        conEstandar = entero(.conEstandar)
        minutosEstandarGanados = entero(.minutosEstandarGanados)
        minutosRealesConEstandar = entero(.minutosRealesConEstandar)
        pctEficienciaEstandar = try? c.decode(Double.self, forKey: .pctEficienciaEstandar)
    }
}

/// Disciplina v2 (pilar del índice): por día que debía checar, hasta 15 min tarde 1 punto,
/// 16–30 0.6, 31–60 0.3, más o sin checar 0; cada 3 retardos, una falta en el índice; todo
/// por el registro completo (salida propia y comida).
struct KpiDisciplina: Decodable, Hashable {
    var esperados: Int = 0
    /// Con decimales («4.6»).
    var puntos: Double = 0
    /// Días que llegó más de 15 min tarde.
    var retardos: Int = 0
    var faltasPorRetardos: Int = 0
    var jornadasRevisables: Int = 0
    var registroCompleto: Int = 0
    var pct: Double?

    private enum CodingKeys: String, CodingKey {
        case esperados, puntos, retardos, faltasPorRetardos, jornadasRevisables, registroCompleto, pct
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        esperados = kpiEntero(c, .esperados)
        puntos = (try? c.decode(Double.self, forKey: .puntos)) ?? 0
        retardos = kpiEntero(c, .retardos)
        faltasPorRetardos = kpiEntero(c, .faltasPorRetardos)
        jornadasRevisables = kpiEntero(c, .jornadasRevisables)
        registroCompleto = kpiEntero(c, .registroCompleto)
        pct = try? c.decode(Double.self, forKey: .pct)
    }
}

/// Calificación de sus revisiones, calibrada por revisor (0–100).
struct KpiCalificacion: Decodable, Hashable {
    var n: Int = 0
    var pct: Double?

    private enum CodingKeys: String, CodingKey { case n, pct }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        n = kpiEntero(c, .n)
        pct = try? c.decode(Double.self, forKey: .pct)
    }
}

/// Revisiones que hizo un coordinador en el rango y cuántas dentro de 24 h hábiles.
struct KpiRevisiones: Decodable, Hashable {
    var total: Int = 0
    var enPlazo: Int = 0

    private enum CodingKeys: String, CodingKey { case total, enPlazo }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        total = kpiEntero(c, .total)
        enPlazo = kpiEntero(c, .enPlazo)
    }
}

/// Solo coordinadores: lo de su equipo (él incluido) y sus revisiones.
struct KpiEquipoCoordinado: Decodable, Hashable {
    var personas: Int = 0
    var aTiempo: Int = 0
    var medidas: Int = 0
    var minutosEstandarGanados: Int = 0
    var minutosLaborados: Int = 0
    var revisiones: KpiRevisiones?

    private enum CodingKeys: String, CodingKey {
        case personas, aTiempo, medidas, minutosEstandarGanados, minutosLaborados, revisiones
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        personas = kpiEntero(c, .personas)
        aTiempo = kpiEntero(c, .aTiempo)
        medidas = kpiEntero(c, .medidas)
        minutosEstandarGanados = kpiEntero(c, .minutosEstandarGanados)
        minutosLaborados = kpiEntero(c, .minutosLaborados)
        revisiones = try? c.decode(KpiRevisiones.self, forKey: .revisiones)
    }
}

/// Días laborables en que checó a tiempo de los que debía checar.
struct KpiAsistenciaPuntual: Decodable, Hashable {
    var esperados: Int = 0
    var puntuales: Int = 0
    var pct: Double?

    private enum CodingKeys: String, CodingKey { case esperados, puntuales, pct }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        esperados = (try? c.decode(Int.self, forKey: .esperados)) ?? 0
        puntuales = (try? c.decode(Int.self, forKey: .puntuales)) ?? 0
        pct = try? c.decode(Double.self, forKey: .pct)
    }
}

/// Una parte del índice v2. Con peso: `entregas` (Confiabilidad), `forma` (Calidad),
/// `estandar` (Rendimiento), `asistencia` y `uniforme` (Disciplina); las reglas las agrupan
/// en los cuatro pilares. Con peso 0, diagnóstico (`tiempo`, `ritmo`, `ocupacion`, `carga`,
/// `dias`): se leen aparte y no cuentan.
struct KpiParteCumplimiento: Decodable, Hashable {
    var clave: String = ""
    var etiqueta: String = ""
    /// 0–100.
    var pct: Double?
    /// Lo que pesa en el índice (suman 100); 0 = diagnóstico.
    var peso: Double?
    /// «17 de 18», «7 de 8 días».
    var detalle: String = ""
    /// Semáforo de la parte si el API ya lo manda (texto u objeto); `nil` mientras no.
    var semaforo: KpiTextoFlexible?

    private enum CodingKeys: String, CodingKey { case clave, etiqueta, pct, peso, detalle, semaforo }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        clave = (try? c.decode(String.self, forKey: .clave)) ?? ""
        etiqueta = (try? c.decode(String.self, forKey: .etiqueta)) ?? ""
        pct = try? c.decode(Double.self, forKey: .pct)
        peso = try? c.decode(Double.self, forKey: .peso)
        detalle = (try? c.decode(String.self, forKey: .detalle)) ?? ""
        semaforo = try? c.decode(KpiTextoFlexible.self, forKey: .semaforo)
    }
}

struct KpiTotales: Decodable, Hashable {
    var diasConJornada: Int = 0
    var diasSinChecada: Int = 0
    var faltasJustificadas: Int = 0
    var retardos: Int = 0
    var minutosTarde: Int = 0
    var uniforme: KpiUniforme?
    var minutosLaborados: Int = 0
    var minutosProductivos: Int = 0
    var minutosInactivos: Int = 0
    var productividadPct: Double?
    /// `nil` = sin horario (24/7, visitante): no se puede hablar de extra.
    var minutosExtra: Int?
    var minutosExtraAprobados: Int = 0
    var minutosExtraPendientes: Int = 0
    var diasExtraPendientes: Int = 0
    var jornadasAbiertas: Int = 0
    var jornadasSinSalida: Int = 0
    var cierresAutomaticos: Int = 0
    /// Entregas del rango (07-10); `nil` con la API vieja.
    var entregas: KpiEntregas?
    /// Días que entró sin retardo de los que debía checar (binario).
    var asistenciaPuntual: KpiAsistenciaPuntual?
    /// Índice de desempeño v2, 0–100 (29-10): 30 Confiabilidad + 25 Calidad + 30
    /// Rendimiento + 15 Disciplina. El campo conserva su nombre. `nil` = nada que medir.
    var cumplimientoPct: Double?
    var cumplimientoPartes: [KpiParteCumplimiento] = []
    /// El API ya manda el índice: viene `cumplimientoPct` (aunque sea nulo, que es «nada
    /// que medir»), `entregas` o las partes. Con la API vieja no viene nada de eso y la
    /// pantalla se queda como antes: por productividad y semáforo.
    var traeCumplimiento = false
    /// Puntualidad graduada y registro completo (pilar Disciplina, v2).
    var disciplina: KpiDisciplina?
    /// Calificación calibrada de sus revisiones (v2).
    var calificacion: KpiCalificacion?
    /// `campo` u `oficina`: decide la meta de Rendimiento.
    var familia: String?
    /// Meta de Rendimiento ya ponderada (0.6 = 60 %).
    var metaRendimiento: Double?
    /// Solo coordinadores: su equipo y sus revisiones.
    var equipo: KpiEquipoCoordinado?
    /// Confianza del índice (`alta` · `media` · `baja`); el API la manda como texto desde
    /// f2dc7130, aquí se acepta también un objeto.
    var confianza: KpiTextoFlexible?
    /// Semáforo del índice ya calculado por el API (≥ 90 verde, ≥ 75 amarillo).
    var semaforoIndice: KpiTextoFlexible?
    /// Los cuatro pilares ya agrupados por el API con los pesos v2; vacío con un API anterior.
    var pilares: [KpiPilar] = []

    private enum CodingKeys: String, CodingKey {
        case diasConJornada, diasSinChecada, faltasJustificadas, retardos, minutosTarde
        case uniforme, minutosLaborados, minutosProductivos, minutosInactivos, productividadPct
        case minutosExtra, minutosExtraAprobados, minutosExtraPendientes, diasExtraPendientes
        case jornadasAbiertas, jornadasSinSalida, cierresAutomaticos
        case entregas, asistenciaPuntual, cumplimientoPct, cumplimientoPartes
        case disciplina, calificacion, familia, metaRendimiento, equipo, confianza
        case semaforoIndice, pilares
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func entero(_ key: CodingKeys) -> Int { (try? c.decode(Int.self, forKey: key)) ?? 0 }
        diasConJornada = entero(.diasConJornada)
        diasSinChecada = entero(.diasSinChecada)
        faltasJustificadas = entero(.faltasJustificadas)
        retardos = entero(.retardos)
        minutosTarde = entero(.minutosTarde)
        uniforme = try? c.decode(KpiUniforme.self, forKey: .uniforme)
        minutosLaborados = entero(.minutosLaborados)
        minutosProductivos = entero(.minutosProductivos)
        minutosInactivos = entero(.minutosInactivos)
        productividadPct = try? c.decode(Double.self, forKey: .productividadPct)
        minutosExtra = try? c.decode(Int.self, forKey: .minutosExtra)
        minutosExtraAprobados = entero(.minutosExtraAprobados)
        minutosExtraPendientes = entero(.minutosExtraPendientes)
        diasExtraPendientes = entero(.diasExtraPendientes)
        jornadasAbiertas = entero(.jornadasAbiertas)
        jornadasSinSalida = entero(.jornadasSinSalida)
        cierresAutomaticos = entero(.cierresAutomaticos)
        entregas = try? c.decode(KpiEntregas.self, forKey: .entregas)
        asistenciaPuntual = try? c.decode(KpiAsistenciaPuntual.self, forKey: .asistenciaPuntual)
        cumplimientoPct = try? c.decode(Double.self, forKey: .cumplimientoPct)
        cumplimientoPartes = (try? c.decode([KpiParteCumplimiento].self, forKey: .cumplimientoPartes)) ?? []
        traeCumplimiento = c.contains(.cumplimientoPct) || c.contains(.entregas) || c.contains(.cumplimientoPartes)
        disciplina = try? c.decode(KpiDisciplina.self, forKey: .disciplina)
        calificacion = try? c.decode(KpiCalificacion.self, forKey: .calificacion)
        familia = try? c.decode(String.self, forKey: .familia)
        metaRendimiento = try? c.decode(Double.self, forKey: .metaRendimiento)
        equipo = try? c.decode(KpiEquipoCoordinado.self, forKey: .equipo)
        confianza = try? c.decode(KpiTextoFlexible.self, forKey: .confianza)
        semaforoIndice = try? c.decode(KpiTextoFlexible.self, forKey: .semaforoIndice)
        pilares = (try? c.decode([KpiPilar].self, forKey: .pilares)) ?? []
    }
}

/// Un pilar del índice v2 como lo manda el API: `{ id, label, pct, semaforo }`.
struct KpiPilar: Decodable, Hashable {
    /// `confiabilidad` · `calidad` · `rendimiento` · `disciplina`.
    var id: String = ""
    var label: String = ""
    /// 0–100; `nil` = sin dato en el rango (no pesa).
    var pct: Double?
    var semaforo: KpiTextoFlexible?

    private enum CodingKeys: String, CodingKey { case id, label, pct, semaforo }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? ""
        label = (try? c.decode(String.self, forKey: .label)) ?? ""
        pct = try? c.decode(Double.self, forKey: .pct)
        semaforo = try? c.decode(KpiTextoFlexible.self, forKey: .semaforo)
    }
}

struct KpiPersonaRef: Decodable, Hashable {
    var id: Int = 0
    var nombre: String = ""
    var email: String?
    var avatarUrl: String?
    var puesto: String?

    private enum CodingKeys: String, CodingKey { case id, nombre, email, avatarUrl, puesto }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        nombre = (try? c.decode(String.self, forKey: .nombre)) ?? ""
        email = try? c.decode(String.self, forKey: .email)
        avatarUrl = try? c.decode(String.self, forKey: .avatarUrl)
        puesto = try? c.decode(String.self, forKey: .puesto)
    }
}

struct KpiHorarioRef: Decodable, Hashable {
    var etiqueta: String = ""
    var entrada: String?
    var salida: String?

    private enum CodingKeys: String, CodingKey { case etiqueta, entrada, salida }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        etiqueta = (try? c.decode(String.self, forKey: .etiqueta)) ?? ""
        entrada = try? c.decode(String.self, forKey: .entrada)
        salida = try? c.decode(String.self, forKey: .salida)
    }
}

struct KpiPersonaFila: Decodable, Identifiable, Hashable {
    var persona: KpiPersonaRef?
    var horario: KpiHorarioRef?
    var totales: KpiTotales?
    var semaforo: String = "sin_datos"
    var motivos: [String] = []
    /// Confianza del índice si el API ya la manda por persona (`alta` · `media` · `baja`, o
    /// un objeto con `nivel`). Mientras no, las reglas la calculan como la web.
    var confianza: KpiTextoFlexible?

    var id: Int { persona?.id ?? 0 }

    private enum CodingKeys: String, CodingKey { case persona, horario, totales, semaforo, motivos, confianza }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        persona = try? c.decode(KpiPersonaRef.self, forKey: .persona)
        horario = try? c.decode(KpiHorarioRef.self, forKey: .horario)
        totales = try? c.decode(KpiTotales.self, forKey: .totales)
        semaforo = (try? c.decode(String.self, forKey: .semaforo)) ?? "sin_datos"
        motivos = (try? c.decode([String].self, forKey: .motivos)) ?? []
        confianza = try? c.decode(KpiTextoFlexible.self, forKey: .confianza)
    }
}

struct KpiBloqueEquipo: Decodable, Hashable {
    var totales: KpiTotales?
    var semaforo: String = "sin_datos"
    var motivos: [String] = []

    private enum CodingKeys: String, CodingKey { case totales, semaforo, motivos }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        totales = try? c.decode(KpiTotales.self, forKey: .totales)
        semaforo = (try? c.decode(String.self, forKey: .semaforo)) ?? "sin_datos"
        motivos = (try? c.decode([String].self, forKey: .motivos)) ?? []
    }
}

struct KpisEquipoResumen: Decodable, Hashable {
    /// `company` (toda la empresa) o `subtree` (mi organigrama hacia abajo).
    var scope: String = "subtree"
    var desde: String = ""
    var hasta: String = ""
    var supuestos: [String] = []
    var equipo: KpiBloqueEquipo?
    var personas: [KpiPersonaFila] = []

    private enum CodingKeys: String, CodingKey { case scope, desde, hasta, supuestos, equipo, personas }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        scope = (try? c.decode(String.self, forKey: .scope)) ?? "subtree"
        desde = (try? c.decode(String.self, forKey: .desde)) ?? ""
        hasta = (try? c.decode(String.self, forKey: .hasta)) ?? ""
        supuestos = (try? c.decode([String].self, forKey: .supuestos)) ?? []
        equipo = try? c.decode(KpiBloqueEquipo.self, forKey: .equipo)
        personas = (try? c.decode([KpiPersonaFila].self, forKey: .personas)) ?? []
    }

    var alcanceTexto: String { scope == "company" ? "Toda la empresa" : "Mi equipo" }
}

// MARK: - Proyectos

struct ProyectoRefPersona: Decodable, Hashable {
    var id: Int = 0
    var nombre: String = ""

    private enum CodingKeys: String, CodingKey { case id, nombre }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        nombre = (try? c.decode(String.self, forKey: .nombre)) ?? ""
    }
}

struct ProyectoRefCliente: Decodable, Hashable {
    var id: Int = 0
    var name: String = ""

    private enum CodingKeys: String, CodingKey { case id, name }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        name = (try? c.decode(String.self, forKey: .name)) ?? ""
    }
}

struct ProyectoHito: Decodable, Hashable {
    var id: Int = 0
    var name: String = ""
    var plannedDate: String?

    private enum CodingKeys: String, CodingKey { case id, name, plannedDate }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        name = (try? c.decode(String.self, forKey: .name)) ?? ""
        plannedDate = try? c.decode(String.self, forKey: .plannedDate)
    }
}

struct ProyectoAvance: Decodable, Hashable {
    var total: Int = 0
    var cerradas: Int = 0
    var abiertas: Int = 0
    /// 0–100. `nil` cuando no hay de dónde calcularlo: no es un cero.
    var porcentaje: Int?
    /// `actividades` · `hitos` · `ninguno`.
    var origen: String = "ninguno"

    private enum CodingKeys: String, CodingKey { case total, cerradas, abiertas, porcentaje, origen }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        total = (try? c.decode(Int.self, forKey: .total)) ?? 0
        cerradas = (try? c.decode(Int.self, forKey: .cerradas)) ?? 0
        abiertas = (try? c.decode(Int.self, forKey: .abiertas)) ?? 0
        porcentaje = (try? c.decode(Int.self, forKey: .porcentaje)).map { min(max($0, 0), 100) }
        origen = (try? c.decode(String.self, forKey: .origen)) ?? "ninguno"
    }

    /// «8 de 12 actividades» · «Sin actividades ligadas».
    var texto: String {
        guard total > 0 else {
            return origen == "hitos" ? "Avance por cronograma" : "Sin actividades ligadas"
        }
        return "\(cerradas) de \(total) \(total == 1 ? "actividad" : "actividades")"
    }
}

struct ProyectoRequerimientos: Decodable, Hashable {
    var total: Int = 0
    var cumplidos: Int = 0

    private enum CodingKeys: String, CodingKey { case total, cumplidos }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        total = (try? c.decode(Int.self, forKey: .total)) ?? 0
        cumplidos = (try? c.decode(Int.self, forKey: .cumplidos)) ?? 0
    }
}

struct ProyectoResumenSalud: Decodable, Hashable {
    var salud: String = ""
    var etiqueta: String = ""
    var enRiesgo: Bool = false
    var diasDeRetraso: Int = 0
    var diasRestantes: Int?
    var motivo: String = ""
    var avance: ProyectoAvance?
    var requerimientos: ProyectoRequerimientos?

    private enum CodingKeys: String, CodingKey {
        case salud, etiqueta, enRiesgo, diasDeRetraso, diasRestantes, motivo, avance, requerimientos
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        salud = (try? c.decode(String.self, forKey: .salud)) ?? ""
        etiqueta = (try? c.decode(String.self, forKey: .etiqueta)) ?? ""
        enRiesgo = (try? c.decode(Bool.self, forKey: .enRiesgo)) ?? false
        diasDeRetraso = (try? c.decode(Int.self, forKey: .diasDeRetraso)) ?? 0
        diasRestantes = try? c.decode(Int.self, forKey: .diasRestantes)
        motivo = (try? c.decode(String.self, forKey: .motivo)) ?? ""
        avance = try? c.decode(ProyectoAvance.self, forKey: .avance)
        requerimientos = try? c.decode(ProyectoRequerimientos.self, forKey: .requerimientos)
    }
}

struct ProyectoResumenFila: Decodable, Identifiable, Hashable {
    var id: Int = 0
    var title: String = ""
    var client: ProyectoRefCliente?
    var responsable: ProyectoRefPersona?
    var equipoCount: Int = 0
    var proximoHito: ProyectoHito?
    var resumen: ProyectoResumenSalud?

    private enum CodingKeys: String, CodingKey {
        case id, title, client, responsable, equipoCount, proximoHito, resumen
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        let crudo = (try? c.decode(String.self, forKey: .title)) ?? ""
        title = crudo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Proyecto sin título" : crudo
        client = try? c.decode(ProyectoRefCliente.self, forKey: .client)
        responsable = try? c.decode(ProyectoRefPersona.self, forKey: .responsable)
        equipoCount = (try? c.decode(Int.self, forKey: .equipoCount)) ?? 0
        proximoHito = try? c.decode(ProyectoHito.self, forKey: .proximoHito)
        resumen = try? c.decode(ProyectoResumenSalud.self, forKey: .resumen)
    }

    /// «ACME · Ana» — cliente y responsable en una línea.
    var contextoTexto: String {
        let partes = [client?.name.nilSiVacio, responsable?.nombre.nilSiVacio].compactMap { $0 }
        return partes.isEmpty ? "Sin cliente ni responsable" : partes.joined(separator: " · ")
    }
}

// MARK: - Almacén

struct StockProducto: Decodable, Hashable {
    var id: Int = 0
    var name: String = ""
    var sku: String = ""

    private enum CodingKeys: String, CodingKey { case id, name, sku }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        name = (try? c.decode(String.self, forKey: .name)) ?? ""
        sku = (try? c.decode(String.self, forKey: .sku)) ?? ""
    }
}

struct StockAlmacenRef: Decodable, Hashable {
    var id: Int = 0
    var code: String = ""
    var name: String = ""

    private enum CodingKeys: String, CodingKey { case id, code, name }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        code = (try? c.decode(String.self, forKey: .code)) ?? ""
        name = (try? c.decode(String.self, forKey: .name)) ?? ""
    }
}

/// Una existencia: producto × almacén.
///
/// Las cantidades son `Decimal` de Prisma y viajan como texto (`"12.5"`) o como
/// número según el campo, así que se decodifican con `StockParse.dbl`, que
/// entiende las dos formas y devuelve `nil` cuando no entiende — nunca un cero
/// fingido, que en inventario es una mentira cara.
struct StockNivel: Decodable, Identifiable, Hashable {
    var id: Int = 0
    var cantidad: Double?
    var reservado: Double?
    var puntoDeReorden: Double?
    var product: StockProducto?
    var warehouse: StockAlmacenRef?

    private enum CodingKeys: String, CodingKey {
        case id, quantity, reservedQty, reorderPoint, product, warehouse
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        cantidad = StockNivel.numero(c, .quantity)
        reservado = StockNivel.numero(c, .reservedQty)
        puntoDeReorden = StockNivel.numero(c, .reorderPoint)
        product = try? c.decode(StockProducto.self, forKey: .product)
        warehouse = try? c.decode(StockAlmacenRef.self, forKey: .warehouse)
    }

    /// Número o texto, lo que mande el servidor.
    private static func numero(
        _ c: KeyedDecodingContainer<CodingKeys>,
        _ key: CodingKeys
    ) -> Double? {
        if let d = try? c.decode(Double.self, forKey: key) { return d }
        if let s = try? c.decode(String.self, forKey: key) { return StockParse.dbl(s) }
        return nil
    }

    /// Producto legible; si no hay nombre, al menos el SKU.
    var titulo: String {
        product?.name.nilSiVacio ?? product?.sku.nilSiVacio ?? "Producto sin nombre"
    }

    /// SKU y bodega, uno por renglón. El pasillo no viaja en este modelo.
    var ubicacionTexto: String {
        let partes = [
            product?.sku.nilSiVacio,
            warehouse?.name.nilSiVacio ?? warehouse?.code.nilSiVacio,
        ].compactMap { $0 }
        return partes.isEmpty ? "Sin almacén asignado" : partes.joined(separator: "\n")
    }

    /// Lo que de verdad se puede tomar: existencia menos lo apartado.
    var disponible: Double? {
        guard let cantidad else { return nil }
        return cantidad - (reservado ?? 0)
    }

    /// Misma regla que `getLowStockAlerts` en el servidor: hace falta un punto de
    /// reorden mayor que cero. Sin él, nadie dijo cuánto es poco.
    var bajoMinimo: Bool {
        guard let punto = puntoDeReorden, punto > 0, let cantidad else { return false }
        return cantidad <= punto
    }

    var agotado: Bool { (cantidad ?? -1) <= 0 }

    /// Cuánto de la barra se llena: existencia contra punto de reorden, 0–1.
    var progreso: Double? {
        guard let punto = puntoDeReorden, punto > 0, let cantidad else { return nil }
        return min(max(cantidad / punto, 0), 1)
    }

    /// Mínimo, apartado y libre: solo lo que aporta algo.
    var detalleTexto: String {
        var partes: [String] = []
        if let punto = puntoDeReorden, punto > 0 {
            partes.append("mínimo \(CoreExtrasFormato.numero(punto))")
        } else {
            partes.append("sin mínimo fijado")
        }
        if let apartado = reservado, apartado > 0 {
            partes.append("\(CoreExtrasFormato.numero(apartado)) apartado")
            partes.append("\(CoreExtrasFormato.numero(disponible)) libre")
        }
        return partes.joined(separator: "\n")
    }
}

// MARK: - Repositorio

/// Existencias y alertas de mínimo, juntas.
struct AlmacenConsulta {
    var niveles: [StockNivel] = []
    var bajoMinimo: [StockNivel] = []
}

/// Lectura de los tres módulos de consulta. Solo lectura a propósito: lo que mueve
/// inventario desde el teléfono (el escáner) vive en `EscaneoRepository`.
/// (El organigrama se quedó en la web.)
final class CoreExtrasRepository {
    static let shared = CoreExtrasRepository()
    private let api = ApiClient.shared
    private init() {}

    /// `GET me/kpis/equipo?desde&hasta` (fechas en `AAAA-MM-DD`).
    func kpisEquipo(desde: String, hasta: String) async throws -> KpisEquipoResumen {
        let data = try await api.get("me/kpis/equipo", query: ["desde": desde, "hasta": hasta])
        do {
            return try JSONDecoder().decode(KpisEquipoResumen.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    /// `GET proyectos`.
    func proyectos() async throws -> [ProyectoResumenFila] {
        let data = try await api.get("proyectos")
        return try ApiClient.decodeList(data)
    }

    /// `GET stock/levels` y `GET stock/alerts/low-stock`, en paralelo.
    ///
    /// Si las alertas fallan pero las existencias llegan, la pantalla se pinta
    /// igual: el bajo mínimo se deduce de los propios niveles con la regla del
    /// servidor. Al revés no: sin existencias no hay nada que enseñar.
    func almacen() async throws -> AlmacenConsulta {
        async let nivelesData = api.get("stock/levels")
        // Las alertas son un extra: si fallan, no se llevan la pantalla por delante.
        async let alertasData = try? await api.get("stock/alerts/low-stock")

        let niveles: [StockNivel] = try ApiClient.decodeList(try await nivelesData)
        let crudoAlertas = await alertasData

        let bajoMinimo: [StockNivel]
        if let crudoAlertas, let decodificadas: [StockNivel] = try? ApiClient.decodeList(crudoAlertas) {
            bajoMinimo = decodificadas
        } else {
            // Misma regla que el servidor, calculada aquí.
            bajoMinimo = niveles.filter { $0.bajoMinimo }
        }
        return AlmacenConsulta(niveles: niveles, bajoMinimo: bajoMinimo)
    }
}

// MARK: - Formato compartido

/// Números y textos que comparten las cuatro pantallas de consulta.
enum CoreExtrasFormato {
    /// «12» · «12.5» · «—». Sin decimales cuando no los tiene.
    static func numero(_ valor: Double?) -> String {
        guard let valor, valor.isFinite else { return "—" }
        // `Int(...)` revienta con un Double fuera de rango; un dato corrupto del
        // servidor no puede tumbar la pantalla de inventario.
        guard abs(valor) < 1e15 else { return "—" }
        let redondeado = (valor * 100).rounded() / 100
        if redondeado == redondeado.rounded() {
            return String(Int(redondeado))
        }
        return String(redondeado)
    }

    /// «83 %» · «—» cuando no hay porcentaje que dar (que no es un cero).
    static func pct(_ valor: Double?) -> String {
        guard let valor, valor.isFinite else { return "—" }
        return "\(Int(valor.rounded())) %"
    }

    /// «7 h 30 m» · «45 m» · «—».
    static func horas(_ minutos: Int?) -> String {
        guard let minutos else { return "—" }
        let total = abs(minutos)
        let h = total / 60
        let resto = total % 60
        let signo = minutos < 0 ? "-" : ""
        if h == 0 { return "\(signo)\(resto) m" }
        if resto == 0 { return "\(signo)\(h) h" }
        return "\(signo)\(h) h \(resto) m"
    }

    /// «25 sep» de una fecha ISO; `nil` si no se puede leer. Antes ninguna fecha
    /// que una inventada.
    static func fechaCorta(_ iso: String?) -> String? {
        guard let iso, iso.count >= 10 else { return nil }
        let soloFecha = String(iso.prefix(10))
        let entrada = DateFormatter()
        entrada.dateFormat = "yyyy-MM-dd"
        entrada.locale = Locale(identifier: "en_US_POSIX")
        guard let fecha = entrada.date(from: soloFecha) else { return nil }
        let salida = DateFormatter()
        salida.locale = Locale(identifier: "es_MX")
        salida.dateFormat = "d MMM"
        return salida.string(from: fecha)
    }

    /// Rango `AAAA-MM-DD` de los periodos de la pantalla de KPIs.
    static func rango(dias: Int, hoy: Date = Date()) -> (desde: String, hasta: String) {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.locale = Locale(identifier: "en_US_POSIX")
        let desde = Calendar.current.date(byAdding: .day, value: -(max(dias, 1) - 1), to: hoy) ?? hoy
        return (fmt.string(from: desde), fmt.string(from: hoy))
    }
}

extension String {
    /// `nil` en vez de una cadena en blanco, para poder encadenar con `??`.
    var nilSiVacio: String? {
        let limpio = trimmingCharacters(in: .whitespacesAndNewlines)
        return limpio.isEmpty ? nil : limpio
    }
}
