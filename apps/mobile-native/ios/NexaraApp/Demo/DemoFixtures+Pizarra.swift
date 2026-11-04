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

    /// `me/que-sigue`: lo que le sale a quien no trae nada corriendo.
    func fxQueSigue() -> DemoJSON {
        func sugerencia(_ clave: String, _ tipo: String, _ titulo: String, _ detalle: String) -> DemoJSON {
            dj(["clave": clave, "tipo": tipo, "titulo": titulo, "detalle": detalle, "accion": "empezar"])
        }
        return dj([
            "aplica": true,
            "area": "comercial",
            "resumen": "También tienes 3 cotizaciones que vencen esta semana.",
            "sugerencias": [
                sugerencia("contacto:1", "contacto", "Llamar a Laura Méndez", "Pidió contacto por la página y nadie le ha respondido"),
                sugerencia("fija:prospectos", "fija", "Buscar 5 prospectos nuevos", "Comercial · 1 hora"),
            ],
        ])
    }

    /// `me/pendientes`: la lista personal.
    func fxPendientes() -> DemoJSON {
        dj(["pendientes": [dj(["id": 1, "texto": "Pedir los datos de la fianza"])]])
    }

    /// `proyectos/:id`: un proyecto con todas sus secciones.
    func fxProyectoDetalle(id: Int) -> DemoJSON {
        dj([
            "id": id,
            "title": "Modernización eléctrica",
            "status": "ACTIVE",
            "objective": "Dejar el edificio con instalación nueva y documentada.",
            "startDate": "2026-09-01",
            "endDate": "2026-12-15",
            "client": dj(["id": 1, "name": "Grupo de ejemplo"]),
            "responsable": dj(["id": 2, "nombre": "Encargado de ejemplo"]),
            "resumen": dj(["avance": dj(["total": 12, "cerradas": 8, "abiertas": 4, "porcentaje": 67, "origen": "actividades"])]),
            "milestones": [
                dj(["id": 1, "name": "Levantamiento", "orden": 1, "status": "CUMPLIDO", "plannedDate": "2026-09-15"]),
                dj(["id": 2, "name": "Energización", "orden": 2, "status": "EN_CURSO", "plannedDate": "2026-11-20"]),
            ],
            "scopeItems": [
                dj(["id": 1, "kind": "ENTREGABLE", "titulo": "Tableros nuevos", "orden": 1]),
                dj(["id": 2, "kind": "EXCLUSION", "titulo": "Obra civil", "orden": 1]),
            ],
            "requirements": [dj(["id": 1, "titulo": "Planos aprobados", "status": "CUMPLIDO"])],
            "members": [dj(["id": 1, "role": "RESPONSABLE", "user": dj(["id": 2, "nombre": "Encargado de ejemplo"])])],
            "documents": [dj(["id": 1, "nombre": "Planos.pdf"])],
            "activities": [dj(["id": 1, "anNumber": "AN-100", "titulo": "Visita de obra", "estatus": "En Proceso"])],
        ])
    }

    /// `me/revisiones`: dos de lo que repartí esperan mi visto bueno (una es corrección
    /// reenviada), para que la pizarra enseñe «En espera de revisión».
    func fxRevisiones(now: Date) -> DemoJSON {
        let mias = allActivities.filter {
            $0.creatorId == DemoMode.meId && $0.ownerId != DemoMode.meId
        }
        var pendientes: [DemoJSON] = []
        for (i, a) in mias.prefix(2).enumerated() {
            let persona = DemoData.person(a.ownerId)
            pendientes.append(dj([
                "activityId": a.id,
                "anNumber": a.folio,
                "titulo": a.titulo,
                "estatus": "Por Validar",
                "persona": dj(["id": persona.id, "nombre": persona.nombre]),
                "enviadaAt": DemoClock.iso(now.addingTimeInterval(i == 0 ? -26 * 3600 : -95 * 60)),
                "correccion": i == 1,
            ]))
        }
        return dj(["pendientes": pendientes, "revisadas": [DemoJSON]()])
    }
}
