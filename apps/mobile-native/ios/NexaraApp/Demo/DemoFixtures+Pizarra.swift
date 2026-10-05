import Foundation

// Pizarra de la demostración, contrato C: «Asignadas por mí» (`me/board/asignadas-por-mi`)
// y el semáforo de cada actividad con la misma regla del servidor
// (`apps/api/src/activities/semaforo-actividad.ts`).

extension DemoStore {
    /// Minutos antes del inicio o del tope en los que el semáforo pasa a ámbar.
    static let umbralPorVencerMin = 30

    /// Tope real de una actividad (`topeDe` del servidor): su fecha máxima si es
    /// posterior al inicio; si no, el fin de ese día en hora de México. Así una
    /// actividad iniciada cuyo tope no es posterior al inicio no sale atrasada.
    func topeMin(_ a: DemoActivity) -> Int {
        if a.maxMin > a.startMin { return a.maxMin }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/Mexico_City") ?? .current
        let inicio = at(a.startMin)
        guard let manana = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: inicio)) else {
            return a.maxMin
        }
        return Int(manana.timeIntervalSince(epoch) / 60) - 1
    }

    /// ¿Ya arrancó? Hora real de inicio, evidencia en curso o «En Proceso».
    func arrancada(_ a: DemoActivity) -> Bool {
        if startedAt[a.id] != nil || evidence[a.id] != nil { return true }
        let status = effectiveStatus(a)
        return status == "En Proceso" || status == "Por Validar"
    }

    /// Minutos reales: del inicio al fin, o al ahora si sigue abierta.
    func minutosReales(_ a: DemoActivity, now: Date) -> Int? {
        guard arrancada(a) else { return nil }
        let inicio = startedAt[a.id] ?? at(a.startMin)
        let fin = a.finMin.map { at($0) } ?? now
        return max(0, DemoClock.minutes(from: inicio, to: fin))
    }

    /// rojo | amarillo | verde, como el servidor: lo cerrado va en verde; rojo si no
    /// ha empezado y ya pasó su inicio, si pasó su tope o si el real superó al plan.
    func semaforo(_ a: DemoActivity, now: Date) -> String {
        if isClosed(a) { return "verde" }
        let ahora = elapsedMinutes(now: now)
        let tope = topeMin(a)
        let empezada = arrancada(a)
        if !empezada && a.startMin < ahora { return "rojo" }
        if tope < ahora { return "rojo" }
        if let real = minutosReales(a, now: now), a.estimadoMin > 0, real > a.estimadoMin { return "rojo" }
        let umbral = Self.umbralPorVencerMin
        if !empezada && a.startMin - ahora <= umbral { return "amarillo" }
        if tope - ahora <= umbral { return "amarillo" }
        return "verde"
    }

    /// Campos del contrato B que la API real manda en `me/activities` y en la pizarra.
    func semaforoJSON(_ a: DemoActivity, now: Date) -> DemoJSON {
        var json = dj([
            "semaforo": semaforo(a, now: now),
            "minutosPlan": a.estimadoMin,
        ])
        if let real = minutosReales(a, now: now) {
            json["minutosReales"] = real
            json["excedida"] = a.estimadoMin > 0 && real > a.estimadoMin
        }
        return json
    }

    /// Lo que la dirección (yo) le asignó a otras personas, con persona y semáforo.
    func fxAsignadasPorMi(now: Date) -> DemoJSON {
        let mias = allActivities.filter {
            $0.creatorId == DemoMode.meId && $0.ownerId != DemoMode.meId
        }
        var items: [DemoJSON] = []
        for a in mias {
            let persona = DemoData.person(a.ownerId)
            var json = dj([
                "id": a.id,
                "anNumber": a.folio,
                "titulo": a.titulo,
                "estatus": effectiveStatus(a),
                "prioridad": a.prioridad,
                "aceptacion": arrancada(a) ? "ACEPTADA" : "PENDIENTE",
                "fechaMaxima": iso(topeMin(a)),
                "persona": dj(["id": persona.id, "nombre": persona.nombre]),
            ])
            if arrancada(a) {
                json["inicioRealAt"] = DemoClock.iso(startedAt[a.id] ?? at(a.startMin))
            }
            json.merge(semaforoJSON(a, now: now)) { _, nuevo in nuevo }
            items.append(json)
        }
        return dj([
            "desde": DemoClock.iso(now),
            "hasta": DemoClock.iso(now),
            "items": items,
        ])
    }
}
