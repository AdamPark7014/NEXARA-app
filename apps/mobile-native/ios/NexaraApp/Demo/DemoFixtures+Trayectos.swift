import Foundation

// Trayecto de una actividad en la demostración (`me/activities/:id/trayectos`): la ida al sitio
// y el regreso a la oficina, con las mismas reglas y los mismos mensajes que
// apps/api/src/activities/trayectos/. Cada ruteo devuelve `DemoRespuesta`; `DemoBackend` la
// serializa. Nada se siembra: el trayecto aparece cuando se toca «Iniciar trayecto».

/// Un tramo del trayecto en la demo.
struct DemoTrayecto {
    let id: Int
    let activityId: Int
    /// IDA | REGRESO
    let tipo: String
    let startedAt: Date
    var endedAt: Date?
    /// LLEGADA | INICIO | SALIDA | NUEVO
    var finMotivo: String?
    /// Lo que «daba la ruta» al salir.
    let estimadoMin: Int
}

extension DemoStore {
    /// Lo que da la ruta desde la oficina en la demo (el servidor la pide a Google u OSRM).
    private static let rutaIdaMin = 18
    private static let rutaRegresoMin = 21
    /// Ruta + 25 % (`TOLERANCIA_TRAYECTO` del API).
    private static let toleranciaTrayecto = 1.25
    /// Un tramo abierto más de esto ya no es un traslado (`TOPE_TRAYECTO_MIN` del API).
    private static let topeTrayectoMin = 6 * 60

    private func trayectoFallo(_ status: Int, _ mensaje: String) -> DemoRespuesta {
        (status, dj(["statusCode": status, "message": mensaje]))
    }

    /// `GET me/activities/:id/trayectos`, `POST …/trayectos` `{tipo, lat?, lng?}` y
    /// `POST …/trayectos/terminar` `{lat?, lng?}`.
    func routeTrayectos(method: String, parts: [String], activityId: Int, json: DemoJSON, now: Date) -> DemoRespuesta {
        let sub = parts.count > 4 ? parts[4] : ""
        if method == "GET" {
            let lista = trayectos.filter { $0.activityId == activityId }.map { trayectoJSON($0, now: now) }
            return (200, lista)
        }
        guard method == "POST" else { return (200, DemoJSON()) }

        // «Llegué»: cierra el tramo abierto de esta actividad.
        if sub == "terminar" {
            guard let indice = trayectos.lastIndex(where: { $0.activityId == activityId && $0.endedAt == nil }) else {
                return trayectoFallo(400, "No tienes un trayecto en curso en esta actividad.")
            }
            trayectos[indice].endedAt = now
            trayectos[indice].finMotivo = "LLEGADA"
            return (200, trayectoJSON(trayectos[indice], now: now))
        }

        // «Iniciar trayecto» (IDA) o «Regreso a la oficina» (REGRESO).
        let tipo = json["tipo"] as? String ?? ""
        guard tipo == "IDA" || tipo == "REGRESO" else {
            return trayectoFallo(400, "Indica si es la ida o el regreso.")
        }
        if tipo == "IDA", let a = activity(activityId), isClosed(a) {
            return trayectoFallo(400, "La actividad ya está cerrada.")
        }
        if trayectos.contains(where: { $0.activityId == activityId && $0.tipo == tipo && $0.endedAt == nil }) {
            return trayectoFallo(
                400,
                tipo == "IDA" ? "Ya vas en camino: marca tu llegada o inicia la actividad." : "Ya vas de regreso."
            )
        }
        // Nadie va a dos lugares a la vez: lo que tuviera abierto (de esta u otra actividad) se cierra.
        cerrarTrayectos(motivo: "NUEVO", now: now)
        nextTrayectoId += 1
        let tramo = DemoTrayecto(
            id: nextTrayectoId,
            activityId: activityId,
            tipo: tipo,
            startedAt: now,
            endedAt: nil,
            finMotivo: nil,
            estimadoMin: tipo == "IDA" ? Self.rutaIdaMin : Self.rutaRegresoMin
        )
        trayectos.append(tramo)
        return (200, trayectoJSON(tramo, now: now))
    }

    /// Cierra lo abierto (todo, o solo una actividad o un tipo), como `cerrarAbiertos` del API:
    /// la ida al iniciar la actividad (INICIO) y todo al checar salida (SALIDA).
    func cerrarTrayectos(motivo: String, now: Date, activityId: Int? = nil, tipo: String? = nil) {
        for indice in trayectos.indices where trayectos[indice].endedAt == nil {
            if let activityId, trayectos[indice].activityId != activityId { continue }
            if let tipo, trayectos[indice].tipo != tipo { continue }
            trayectos[indice].endedAt = now
            trayectos[indice].finMotivo = motivo
        }
    }

    /// La forma de `trayectoDto` del API: minutos hasta ahora si sigue abierto, con tope, y la
    /// calificación contra la ruta + 25 % solo al cerrar.
    private func trayectoJSON(_ tramo: DemoTrayecto, now: Date) -> DemoJSON {
        let fin = tramo.endedAt ?? now
        let transcurridos = max(0, Int((fin.timeIntervalSince(tramo.startedAt) / 60).rounded()))
        let minutos = min(Self.topeTrayectoMin, transcurridos)
        var json = dj([
            "id": tramo.id,
            "activityId": tramo.activityId,
            "userId": DemoMode.meId,
            "tipo": tramo.tipo,
            "modo": "AUTO",
            "startedAt": DemoClock.iso(tramo.startedAt),
            "endedAt": isoOrNull(tramo.endedAt),
            "minutos": minutos,
            "estimadoMin": tramo.estimadoMin,
            "estimadoFuente": "aproximado",
        ])
        if let motivo = tramo.finMotivo {
            json["finMotivo"] = motivo
        } else {
            json["finMotivo"] = NSNull()
        }
        if tramo.endedAt != nil, tramo.estimadoMin > 0 {
            let tope = Int((Double(tramo.estimadoMin) * Self.toleranciaTrayecto).rounded())
            json["estado"] = minutos <= tope ? "en_tiempo" : "excedido"
        } else {
            json["estado"] = NSNull()
        }
        return json
    }
}
