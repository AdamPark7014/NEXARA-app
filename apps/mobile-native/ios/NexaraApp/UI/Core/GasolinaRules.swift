import Foundation

/// Reglas de «Cargar gasolina» y del regreso con foto del tablero: espejo de
/// `GasolinaRules.kt` de Android y de `apps/web/lib/vehiculos-ficha.ts` (`aNumero`,
/// `rendimientoDeEstaCarga`). Solo Foundation.
///
/// La lectura de la foto es ayuda: llena lo que la persona no ha escrito y nunca pisa
/// lo que sí escribió. Si falla, los campos se quedan como estaban y se captura a mano.
enum GasolinaRules {
    /// Lo que mide el rendimiento de una carga anterior.
    struct CargaPrevia: Hashable {
        let odometro: Int
        let litros: Double
        let tanqueLleno: Bool
    }

    struct Rendimiento: Hashable {
        let km: Int
        let litros: Double
        let kmPorLitro: Double
    }

    // MARK: Lo que se teclea

    /// «Número» de un campo de texto: vacío o basura es `nil`, no cero. Acepta `$` y comas.
    static func aNumero(_ texto: String?) -> Double? {
        let limpio = (texto ?? "").filter { $0 != "$" && $0 != "," && !$0.isWhitespace }
        guard !limpio.isEmpty, let numero = Double(limpio), numero.isFinite else { return nil }
        return numero
    }

    static func soloDigitos(_ texto: String, maximo: Int = 7) -> String {
        String(texto.filter { $0.isASCII && $0.isNumber }.prefix(maximo))
    }

    /// Dígitos y a lo sumo un punto: es lo que se guarda; las comas solo se pintan.
    static func soloDecimal(_ texto: String, maximo: Int = 9) -> String {
        var salida = ""
        var hayPunto = false
        for c in texto {
            if c.isASCII && c.isNumber {
                salida.append(c)
            } else if c == "." && !hayPunto {
                hayPunto = true
                salida.append(c)
            }
        }
        return String(salida.prefix(maximo))
    }

    /// `52.0` → «52» y `52.3` → «52.3»: el texto que se pone en el campo, sin ceros de más.
    static func textoCrudo(_ valor: Double) -> String {
        let redondeado = (valor * 100).rounded() / 100
        if redondeado == redondeado.rounded() { return String(Int64(redondeado)) }
        return String(redondeado)
    }

    /// «1281.35» → «1,281.35»: solo para pintar.
    static func agrupado(_ crudo: String) -> String {
        let partes = crudo.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
        let enteros = String(partes.first ?? "")
        var salida = ""
        for (i, c) in enteros.enumerated() {
            if i > 0 && (enteros.count - i) % 3 == 0 { salida.append(",") }
            salida.append(c)
        }
        return partes.count > 1 ? "\(salida).\(partes[1])" : salida
    }

    // MARK: La lectura no pisa

    /// Lo que queda en un campo tras leer una foto. Lo escrito por la persona se respeta; si lo
    /// borró, cuenta como vacío. Lo que llenó una lectura anterior sí se reemplaza: por eso se
    /// repite la foto.
    static func tras(lectura: String?, actual: String, escrito: Bool) -> String {
        guard let lectura, !lectura.isEmpty else { return actual }
        if escrito && !actual.isEmpty { return actual }
        return lectura
    }

    // MARK: Rendimiento

    /// Lo que mediría esta carga si llena el tanque: km desde el último lleno, entre los litros
    /// de lo que se cargó desde entonces. Sin un lleno anterior no se puede medir.
    static func rendimientoDeEstaCarga(
        cargas: [CargaPrevia],
        odometro: Int,
        litros: Double
    ) -> Rendimiento? {
        let previas = cargas.filter { $0.odometro < odometro }.sorted { $0.odometro > $1.odometro }
        var total = litros
        for carga in previas {
            if carga.tanqueLleno {
                let recorridos = odometro - carga.odometro
                let rendimiento = Double(recorridos) / total
                if rendimiento < 2 || rendimiento > 40 { return nil }
                return Rendimiento(
                    km: recorridos,
                    litros: (total * 100).rounded() / 100,
                    kmPorLitro: (rendimiento * 100).rounded() / 100
                )
            }
            total += carga.litros
        }
        return nil
    }

    /// El km final no puede ser menor que el de salida: sin dato o con error, no hay viaje.
    static func kmDelViaje(inicio: Int?, final: Int?) -> Int? {
        guard let inicio, let final, final >= inicio else { return nil }
        return final - inicio
    }

    // MARK: Textos

    /// 12480 → «12,480».
    static func miles(_ valor: Int) -> String { agrupado(String(valor)) }

    static func km(_ valor: Int) -> String { "\(miles(valor)) km" }

    /// «8.6 km por litro».
    static func tituloRendimiento(_ r: Rendimiento) -> String {
        String(format: "%.1f km por litro", r.kmPorLitro)
    }

    /// «450 km desde el tanque anterior, entre 52.3 litros.»
    static func detalleRendimiento(_ r: Rendimiento) -> String {
        "\(km(r.km)) desde el tanque anterior, entre \(textoCrudo(r.litros)) litros."
    }

    /// Lo que se ve en el campo Gasolina; el valor que viaja sigue siendo `E`, `1/4`…
    static func textoNivel(_ nivel: NivelCombustible?) -> String {
        switch nivel {
        case .vacio: return "Vacío"
        case .unCuarto: return "1/4 de tanque"
        case .medio: return "1/2 tanque"
        case .tresCuartos: return "3/4 de tanque"
        case .lleno: return "Lleno"
        case nil: return ""
        }
    }

    /// «Nissan Frontier · Instalación de cámaras» y debajo el proyecto. Sin actividad (salida
    /// directa de inventario, o una API sin desplegar), el nombre y las placas.
    static func encabezadoRegreso(nombre: String?, placas: String?, actividad: String?, proyecto: String?) -> [String] {
        func valor(_ texto: String?) -> String? {
            let limpio = (texto ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return limpio.isEmpty ? nil : limpio
        }
        let vehiculo = valor(nombre) ?? "Vehículo"
        let trabajo = valor(actividad)
        let primera = [vehiculo, trabajo ?? valor(placas)].compactMap { $0 }.joined(separator: " · ")
        if trabajo != nil, let proyecto = valor(proyecto) { return [primera, proyecto] }
        return [primera]
    }

    // MARK: Formulario de la carga

    /// Texto crudo de cada campo y si lo escribió la persona; la pantalla pinta las comas.
    struct FormCarga: Equatable {
        var litros = ""
        var litrosEscritos = false
        var total = ""
        var totalEscrito = false
        var odometro = ""
        var odometroEscrito = false
        var lleno = true

        var tieneDatos: Bool { !litros.isEmpty || !total.isEmpty || !odometro.isEmpty }
    }

    /// Quien no ve costos no ve importes: si el total ya salió del ticket, viaja sin enseñarse. Solo
    /// se le pide cuando no se pudo leer, porque el servidor lo exige y lo copia de su propio ticket.
    static func totalLeidoOculto(veCostos: Bool, form: FormCarga) -> Bool {
        !veCostos && !form.totalEscrito && !form.total.isEmpty
    }

    /// Aplica lo leído del ticket. Con `revisar` sin permiso de costos el total se descarta: la
    /// persona no podría revisarlo, así que escribe el del papel.
    static func conTicket(
        _ form: FormCarga,
        litros: Double?,
        total: Double?,
        revisar: Bool,
        veCostos: Bool
    ) -> FormCarga {
        var siguiente = form
        siguiente.litros = tras(lectura: litros.map(textoCrudo), actual: form.litros, escrito: form.litrosEscritos)
        if revisar && !veCostos {
            if !form.totalEscrito { siguiente.total = "" }
        } else {
            siguiente.total = tras(lectura: total.map(textoCrudo), actual: form.total, escrito: form.totalEscrito)
        }
        return siguiente
    }

    static func conTablero(_ form: FormCarga, odometroKm: Int?) -> FormCarga {
        var siguiente = form
        siguiente.odometro = tras(lectura: odometroKm.map { String($0) }, actual: form.odometro, escrito: form.odometroEscrito)
        return siguiente
    }

    /// El aviso tras leer el ticket; `nil` si salió bien.
    static func avisoTicket(legible: Bool, revisar: Bool, veCostos: Bool) -> String? {
        if !legible { return "No se pudo leer el ticket: escribe los datos." }
        if revisar && veCostos { return "Los litros por el precio no dan el total: revisa las cifras." }
        if revisar { return "Los litros no cuadran con el ticket: revísalos y escribe el total." }
        return nil
    }

    static let avisoTablero = "No se pudo leer el odómetro: escríbelo."

    /// Lo que falta para guardar; `nil` si se puede enviar. Mismo texto que la web.
    static func faltaEnCarga(_ form: FormCarga) -> String? {
        guard aNumero(form.odometro) != nil,
              let litros = aNumero(form.litros), litros > 0,
              let total = aNumero(form.total), total > 0
        else {
            return "Faltan el odómetro, los litros o el importe"
        }
        return nil
    }

    static func rendimientoDelForm(_ form: FormCarga, cargas: [CargaPrevia]) -> Rendimiento? {
        guard form.lleno,
              let litros = aNumero(form.litros), litros > 0,
              let odometro = aNumero(form.odometro)
        else {
            return nil
        }
        return rendimientoDeEstaCarga(cargas: cargas, odometro: Int(odometro), litros: litros)
    }
}
