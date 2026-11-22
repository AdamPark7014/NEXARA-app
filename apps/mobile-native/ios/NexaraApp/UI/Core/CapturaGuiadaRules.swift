import Foundation

/// Captura guiada de vehículo en 5 pasos (salida y devolución). Solo Foundation, para leerla junto a
/// `apps/api/src/vehicles/captura-guiada.ts` (la fuente de verdad), `apps/web/lib/vehiculos-captura.ts`
/// y el `CapturaGuiadaRules.kt` de Android: mismos slots, mismos tiempos de los cuadros y, palabra por
/// palabra, los mismos mensajes, para no dejar mandar algo que la API va a rechazar con un 400.
///
/// 1. Vuelta completa en video (10 a 20 s). De ahí salen 8 cuadros, uno al centro de cada octavo.
/// 2. Asientos traseros. 3. Asientos delanteros. 4. Tablero completo.
/// 5. Kilometraje y gasolina de cerca: la IA los lee y la persona confirma.
enum CapturaGuiadaRules {

    struct Vista: Hashable {
        let slot: String
        let etiqueta: String
    }

    struct Paso: Hashable, Identifiable {
        let paso: Int
        let id: String
        let etiqueta: String
        let instruccion: String
    }

    /// Los 8 cuadros de la vuelta, en el orden en que se camina (frente y hacia la derecha).
    static let vistasVuelta: [Vista] = [
        Vista(slot: "vuelta-1", etiqueta: "Frente"),
        Vista(slot: "vuelta-2", etiqueta: "Frente derecho"),
        Vista(slot: "vuelta-3", etiqueta: "Lado derecho"),
        Vista(slot: "vuelta-4", etiqueta: "Trasera derecha"),
        Vista(slot: "vuelta-5", etiqueta: "Trasera"),
        Vista(slot: "vuelta-6", etiqueta: "Trasera izquierda"),
        Vista(slot: "vuelta-7", etiqueta: "Lado izquierdo"),
        Vista(slot: "vuelta-8", etiqueta: "Frente izquierdo"),
    ]

    static let slotKmGasolina = "km-gasolina"

    /// Pasos 2 a 5: una foto cada uno.
    static let fotosGuiadas: [Vista] = [
        Vista(slot: "asientos-traseros", etiqueta: "Asientos traseros"),
        Vista(slot: "asientos-delanteros", etiqueta: "Asientos delanteros"),
        Vista(slot: "tablero", etiqueta: "Tablero completo"),
        Vista(slot: slotKmGasolina, etiqueta: "Kilometraje y gasolina"),
    ]

    static var slotsVuelta: [String] { vistasVuelta.map(\.slot) }

    /// Las 12 partes de imagen que espera la API: 8 cuadros + 4 fotos.
    static var slots: [String] { slotsVuelta + fotosGuiadas.map(\.slot) }

    /// Parte del multipart con el video de la vuelta.
    static let campoVideo = "video-vuelta"

    static let duracionMinSeg = 10
    static let duracionMaxSeg = 20

    /// Un segundo de gracia por el redondeo del teléfono (igual que la API).
    private static let graciaSeg = 1.0

    /// Tope del video en el teléfono. La API acepta hasta 80 MB por archivo; con 60 queda margen
    /// para las 12 fotos.
    static let videoMaxBytes = 60 * 1024 * 1024

    /// Cómo se graba la vuelta (igual en web y Android): 720p, unos 2.5 Mbps y sin audio. Una vuelta
    /// de 20 s pesa unos 6 MB y sube en menos de un minuto aun con señal floja (el proxy puede cortar
    /// una subida que tarda más); sin audio no se graban conversaciones.
    static let videoAltoPx = 720
    static let videoBitsPorSegundo = 2_500_000
    static let videoConAudio = false

    /// Los 5 pasos tal como los da la API cuando no contesta (`GET vehicles/captura-guiada`).
    static let pasos: [Paso] = [
        Paso(
            paso: 1,
            id: "vuelta",
            etiqueta: "Vuelta completa",
            instruccion: "Camina una vuelta completa alrededor de la unidad, empezando por el frente y hacia tu derecha, sin detenerte. Entre 10 y 20 segundos."
        ),
        Paso(paso: 2, id: "asientos-traseros", etiqueta: "Asientos traseros", instruccion: "Abre una puerta trasera y toma todo el asiento de atrás."),
        Paso(paso: 3, id: "asientos-delanteros", etiqueta: "Asientos delanteros", instruccion: "Toma los dos asientos de adelante desde la puerta del conductor."),
        Paso(paso: 4, id: "tablero", etiqueta: "Tablero completo", instruccion: "Con el motor encendido, toma el tablero completo: volante, pantalla y testigos."),
        Paso(paso: 5, id: slotKmGasolina, etiqueta: "Kilometraje y gasolina", instruccion: "Acércate al odómetro y a la aguja de gasolina. La IA los lee y tú confirmas."),
    ]

    static func etiqueta(_ slot: String) -> String {
        (vistasVuelta + fotosGuiadas).first { $0.slot == slot }?.etiqueta ?? slot
    }

    // MARK: Vuelta en video

    /// En qué segundo va cada cuadro: el centro de cada octavo, `dur × (i + 0.5) / 8`. Nunca el
    /// primer ni el último instante (suelen salir movidos). Mismo cálculo en web y Android.
    static func tiemposCuadros(_ duracionSeg: Double, cuadros: Int = 8) -> [Double] {
        guard duracionSeg.isFinite, duracionSeg > 0, cuadros > 0 else { return [] }
        let total = Double(cuadros)
        var tiempos: [Double] = []
        for i in 0..<cuadros {
            let centro: Double = Double(i) + 0.5
            let segundo: Double = duracionSeg * centro / total
            let milesimas: Double = (segundo * 1000).rounded()
            tiempos.append(milesimas / 1000)
        }
        return tiempos
    }

    /// La hora de cada cuadro: la hora en que empezó la grabación más su segundo dentro del video.
    static func horasCuadros(inicio: Date, duracionSeg: Double, cuadros: Int = 8) -> [Date] {
        tiemposCuadros(duracionSeg, cuadros: cuadros).map { inicio.addingTimeInterval($0) }
    }

    static func duracionValida(_ duracionSeg: Double) -> Bool {
        guard duracionSeg.isFinite else { return false }
        let minimo: Double = Double(duracionMinSeg) - graciaSeg
        let maximo: Double = Double(duracionMaxSeg) + graciaSeg
        return duracionSeg >= minimo && duracionSeg <= maximo
    }

    /// Un decimal, como lo manda la web: 14.26 → 14.3.
    static func duracionRedondeada(_ duracionSeg: Double) -> Double {
        (duracionSeg * 10).rounded() / 10
    }

    // MARK: Validación antes de mandar

    struct Toma: Equatable {
        var capturedAt: Date?
        var lat: Double?
        var lng: Double?
    }

    struct Video: Equatable {
        var capturedAt: Date?
        var duracionSeg: Double
        var bytes: Int
    }

    /// Lo que la IA leyó en el paso 5 antes de que la persona confirmara.
    struct LecturaIa: Equatable {
        var odometroKm: Int?
        var combustiblePct: Int?
        var vacia: Bool { odometroKm == nil && combustiblePct == nil }
    }

    /// Los errores en el orden de los pasos; el primero basta para el aviso.
    /// `kmAnterior` es el último registro de la unidad (`ultimoRegistro.km`): pásalo solo cuando la
    /// API dice `exigida`, porque con el interruptor apagado un km menor solo deja una alerta.
    static func validar(
        tomas: [String: Toma],
        video: Video?,
        odometroKm: Int?,
        combustible: NivelCombustible?,
        kmAnterior: Int? = nil,
        forzarKm: Bool = false
    ) -> [String] {
        var errores: [String] = []
        if let video, video.bytes > 0 {
            if video.capturedAt == nil {
                errores.append("Graba la vuelta con la cámara en vivo, no de la galería")
            } else if !duracionValida(video.duracionSeg) {
                errores.append("La vuelta debe durar entre \(duracionMinSeg) y \(duracionMaxSeg) segundos")
            } else if video.bytes > videoMaxBytes {
                errores.append("El video pesa demasiado; vuelve a grabar la vuelta")
            }
        } else {
            errores.append("Falta el video de la vuelta completa")
        }
        for slot in slots {
            guard let toma = tomas[slot] else {
                errores.append("Falta la foto: \(etiqueta(slot))")
                continue
            }
            if toma.capturedAt == nil { errores.append("Falta la hora de la foto: \(etiqueta(slot))") }
        }
        if let km = odometroKm, km >= 0 {
            if let kmAnterior, km < kmAnterior, !forzarKm {
                errores.append("El kilometraje (\(km)) es menor al último registro de la unidad (\(kmAnterior))")
            }
        } else {
            errores.append("Confirma el kilometraje del tablero")
        }
        if combustible == nil { errores.append("Confirma el nivel de gasolina") }
        return errores
    }

    /// ¿La persona cambió lo que leyó la IA? Liz ve las dos lecturas.
    static func corrigioLectura(_ ia: LecturaIa?, odometroKm: Int?, combustible: NivelCombustible?) -> Bool {
        guard let ia, !ia.vacia else { return false }
        let km = ia.odometroKm.map { $0 != odometroKm } ?? false
        let gas = ia.combustiblePct.map { $0 != combustible?.pct } ?? false
        return km || gas
    }

    // MARK: Campos de texto del multipart

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static func horaIso(_ fecha: Date) -> String { iso.string(from: fecha) }

    /// La parte `meta`: una entrada por foto en el orden de `slots` y la del video con su duración.
    /// `0,0` no es una ubicación: viaja como `null` (igual que la web).
    static func metaJson(tomas: [String: Toma], video: Video) -> String {
        var campos: [String] = []
        for slot in slots {
            guard let toma = tomas[slot], let hora = toma.capturedAt else { continue }
            let clave: String = jsonString(slot)
            let horaTexto: String = jsonString(horaIso(hora))
            let lat: String = numero(coordenada(toma.lat))
            let lng: String = numero(coordenada(toma.lng))
            campos.append("\(clave):{\"capturedAt\":\(horaTexto),\"lat\":\(lat),\"lng\":\(lng)}")
        }
        if let hora = video.capturedAt {
            let clave: String = jsonString(campoVideo)
            let horaTexto: String = jsonString(horaIso(hora))
            let duracion: Double = duracionRedondeada(video.duracionSeg)
            campos.append("\(clave):{\"capturedAt\":\(horaTexto),\"duracionSeg\":\(duracion)}")
        }
        return "{" + campos.joined(separator: ",") + "}"
    }

    /// `{"odometroKm":48215,"combustiblePct":50}`; `nil` si la IA no leyó nada (no se manda).
    static func lecturaIaJson(_ lectura: LecturaIa?) -> String? {
        guard let lectura, !lectura.vacia else { return nil }
        let km = lectura.odometroKm.map(String.init) ?? "null"
        let pct = lectura.combustiblePct.map(String.init) ?? "null"
        return "{\"odometroKm\":\(km),\"combustiblePct\":\(pct)}"
    }

    /// Los campos de texto tal como los manda la web. Los opcionales solo si traen valor.
    static func camposTexto(
        tomas: [String: Toma],
        video: Video,
        odometroKm: Int,
        combustible: NivelCombustible,
        lecturaIa: LecturaIa? = nil,
        forzarKm: Bool = false,
        actividadId: Int? = nil,
        encargadoId: Int? = nil
    ) -> [String: String] {
        var campos: [String: String] = [
            "capturaVersion": "2",
            "meta": metaJson(tomas: tomas, video: video),
            "odometroKm": String(odometroKm),
            "combustible": combustible.apiValue,
        ]
        if let json = lecturaIaJson(lecturaIa) { campos["lecturaIa"] = json }
        if forzarKm { campos["forzarKm"] = "true" }
        if let actividadId, actividadId > 0 { campos["actividadId"] = String(actividadId) }
        if let encargadoId, encargadoId > 0 { campos["encargadoId"] = String(encargadoId) }
        return campos
    }

    // MARK: Unidad fuera, firmas y textos cortos

    /// ¿La unidad sigue fuera? Para el aviso «devuelve la unidad» al cerrar la actividad.
    static func unidadSigueFuera(estatus: String?, conSalida: Bool, conDevolucion: Bool) -> Bool {
        estatus == "En uso" || (conSalida && !conDevolucion)
    }

    static let momentoSalida = "salida"
    static let momentoDevolucion = "devolucion"
    static let rolEntrega = "entrega"
    static let rolRecibe = "recibe"

    /// Una firma de menos de un trazo corto no es firma.
    static func firmaSuficiente(puntos: Int) -> Bool { puntos >= 12 }

    /// Km con separador de miles, sin depender del idioma del teléfono: 48215 → «48,215 km».
    static func kmTexto(_ km: Int?) -> String? {
        guard let km else { return nil }
        let digitos = Array(String(abs(km)))
        var salida = ""
        for (i, c) in digitos.enumerated() {
            if i > 0, (digitos.count - i) % 3 == 0 { salida.append(",") }
            salida.append(c)
        }
        let signo: String = km < 0 ? "-" : ""
        return signo + salida + " km"
    }

    /// Segundos grabados → «0:14» para el contador de la vuelta.
    static func reloj(_ segundos: Double) -> String {
        let positivos: Double = max(0.0, segundos)
        let s: Int = Int(positivos.rounded())
        let minutos: Int = s / 60
        let resto: String = String(format: "%02d", s % 60)
        return "\(minutos):\(resto)"
    }

    private static func coordenada(_ v: Double?) -> Double? {
        guard let v, v.isFinite, v != 0 else { return nil }
        return v
    }

    private static func numero(_ v: Double?) -> String {
        guard let v else { return "null" }
        return "\(v)"
    }

    private static func jsonString(_ value: String) -> String {
        var s = "\""
        for c in value.unicodeScalars {
            switch c {
            case "\"": s += "\\\""
            case "\\": s += "\\\\"
            case "\n": s += "\\n"
            case "\r": s += "\\r"
            case "\t": s += "\\t"
            default:
                if c.value < 0x20 {
                    s += String(format: "\\u%04x", c.value)
                } else {
                    s.unicodeScalars.append(c)
                }
            }
        }
        return s + "\""
    }
}
