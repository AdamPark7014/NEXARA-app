import Foundation

// Pizarra, «Mis actividades», detalle, evidencias e historial de la demostración.
// Las formas de cada respuesta salen de los modelos `Decodable` de `Data/CoreModels.swift`
// y de las fixtures de capturas de tienda (`scripts/store-demo/generar-fixtures.py`).

extension DemoStore {
    /// Despachos que se reparten a otra persona: no cuentan como «abiertas» de nadie en la pizarra.
    static let dispatchedIds: Set<Int> = [5154]

    /// Minutos atrás (respecto a la entrada al demo) a los que entró cada compañero hoy.
    static let clockInAgo: [Int: Int] = [
        101: 190, 102: 175, 103: 195, 104: 240, 105: 150, 106: 170, 107: 200, 108: 160, 109: 185,
    ]

    /// Quién ya salió hoy y hace cuánto.
    static let clockOutAgo: [Int: Int] = [107: 20]

    // MARK: Actividades: estado efectivo

    var allActivities: [DemoActivity] { DemoData.activities + extraActivities }

    func activity(_ id: Int) -> DemoActivity? {
        allActivities.first { $0.id == id }
    }

    func isClosed(_ a: DemoActivity) -> Bool {
        let status = effectiveStatus(a)
        return status == "Por Validar" || status == "Finalizada" || status == "Cancelada"
    }

    /// Estatus con lo que ya hizo el usuario en esta sesión (iniciar, subir evidencia, revisar).
    func effectiveStatus(_ a: DemoActivity) -> String {
        if let review = reviews[reviewKey(a.id, executorId(a))] {
            return review.decision == "APROBADA" ? "Finalizada" : "En Proceso"
        }
        if let state = evidence[a.id] {
            if state.status == "COMPLETED" { return "Por Validar" }
            if a.estatus == "Asignada" { return "En Proceso" }
        }
        if a.estatus == "Asignada", startedAt[a.id] != nil { return "En Proceso" }
        return a.estatus
    }

    func reviewKey(_ activityId: Int, _ userId: Int) -> String { "\(activityId)-\(userId)" }

    /// Quién ejecuta la actividad (en un despacho, no es el responsable).
    func executorId(_ a: DemoActivity) -> Int {
        a.id == 5154 ? 101 : a.ownerId
    }

    func ticketCustom(_ a: DemoActivity) -> String? {
        switch a.id {
        case 5151: return "Junta"
        case 5152: return "Trámite"
        case 5153: return "Reporte / documentación"
        case 5147: return "Trámite"
        case 5149: return "Recolección"
        default: return nil
        }
    }

    func clientName(_ a: DemoActivity) -> String? {
        DemoData.client(serviceId: a.clientServiceId)?.name
    }

    func projectTitle(_ a: DemoActivity) -> String? {
        guard let pid = a.projectId else { return nil }
        return DemoData.projects.first { $0.id == pid }?.title
    }

    // MARK: Evidencia

    /// Formulario de ejemplo según el tipo (mismos campos que `CoreEvidence.formFields`).
    func sampleSheet(_ a: DemoActivity) -> [String: String] {
        switch a.kind {
        case "servicio":
            return [
                "sucursal": clientName(a) ?? "Sucursal centro",
                "gerenteEncargado": "Encargado de mantenimiento",
                "queSeHizo": "Se revisó el equipo, se limpiaron filtros y se verificó su funcionamiento.",
                "observaciones": "Sin pendientes. Se recomienda revisión en 30 días.",
            ]
        case "proyecto", "obra":
            return [
                "lugar": clientName(a) ?? "Sitio de obra",
                "encargadoSitio": "Residente de obra",
                "queSeHizo": "Se completó el trabajo del día conforme al alcance y se dejó limpia el área.",
                "observaciones": "Se pidió material adicional para la siguiente etapa.",
            ]
        default:
            return ["queHiciste": "Se completó la tarea y se dejó registro para el seguimiento."]
        }
    }

    /// Evidencia de una actividad: la que el usuario fue subiendo o, si es del equipo, la del guion.
    func effectiveEvidence(_ a: DemoActivity) -> DemoEvidenceState? {
        var state: DemoEvidenceState
        if let live = evidence[a.id] {
            state = live
        } else if let seeded = seededEvidence(a) {
            state = seeded
        } else {
            return nil
        }
        if let review = reviews[reviewKey(a.id, executorId(a))] {
            if review.decision == "APROBADA" {
                state.reviewStatus = "APPROVED"
            } else {
                state.reviewStatus = "REJECTED"
                state.reviewNotes = review.notes
                state.rejectedSteps = review.steps
            }
        }
        return state
    }

    func seededEvidence(_ a: DemoActivity) -> DemoEvidenceState? {
        guard !a.evidencia.isEmpty else { return nil }
        let order = ["ENTRY_PHOTO", "EVIDENCE_PHOTOS", "SERVICE_SHEET_PDF", "SERVICE_SHEET_DATA", "EXIT_PHOTO", "COMPLETED"]
        let index = order.firstIndex(of: a.evidencia) ?? 0
        var state = DemoEvidenceState()
        state.status = a.evidencia
        if index >= 1 {
            state.entryPhoto = DemoImages.dataURL(.entry)
            state.entryAt = at(a.startMin + 6)
        }
        if index >= 2 {
            state.photos = [DemoImages.dataURL(.work1), DemoImages.dataURL(.work2), DemoImages.dataURL(.work3)]
            state.photosAt = at(a.startMin + 45)
        }
        if index >= 4 {
            state.sheet = sampleSheet(a)
            state.sheetAt = at(a.startMin + 70)
        }
        if index >= 5 {
            state.exitPhoto = DemoImages.dataURL(.exit)
            state.exitAt = at(a.finMin ?? (a.startMin + 100))
            state.reviewStatus = a.estatus == "Finalizada" ? "APPROVED" : ""
        }
        return state
    }

    func progressPct(_ a: DemoActivity, state: DemoEvidenceState?) -> Double {
        guard let state else { return Double(a.avance) }
        if evidence[a.id] == nil { return Double(a.avance) }
        let steps = CoreEvidence.steps(for: a.kind)
        if state.status == "COMPLETED" { return 100 }
        let index = steps.firstIndex(of: state.status) ?? 0
        return Double(index * 100 / max(steps.count, 1))
    }

    /// Columnas de `TeamEvidenceData` (lo que subió una persona).
    func evidenceDataJSON(_ state: DemoEvidenceState) -> DemoJSON {
        var json = dj([
            "status": state.status,
            "reviewStatus": state.reviewStatus.isEmpty ? "PENDING" : state.reviewStatus,
            "evidencePhotos": state.photos,
        ])
        let coords = DemoImages.coords
        if !state.entryPhoto.isEmpty {
            json["entryPhotoUrl"] = state.entryPhoto
            json["entryLatitude"] = coords.latitude
            json["entryLongitude"] = coords.longitude
            json["entryPhotoUploadedAt"] = isoOrNull(state.entryAt)
        }
        if !state.photos.isEmpty {
            var geo: [DemoJSON] = []
            for (index, _) in state.photos.enumerated() {
                geo.append(dj([
                    "latitude": coords.latitude + Double(index) * 0.0001,
                    "longitude": coords.longitude,
                    "capturedAt": isoOrNull(state.photosAt),
                ]))
            }
            json["evidencePhotosGeo"] = geo
            json["evidencePhotosUploadedAt"] = isoOrNull(state.photosAt)
        }
        if !state.sheet.isEmpty {
            json["serviceSheetData"] = state.sheet
            json["serviceSheetCompletedAt"] = isoOrNull(state.sheetAt)
        }
        if !state.exitPhoto.isEmpty {
            json["exitPhotoUrl"] = state.exitPhoto
            json["exitLatitude"] = coords.latitude
            json["exitLongitude"] = coords.longitude
            json["exitPhotoUploadedAt"] = isoOrNull(state.exitAt)
            json["completedAt"] = isoOrNull(state.exitAt)
        }
        if !state.reviewNotes.isEmpty { json["reviewNotes"] = state.reviewNotes }
        return json
    }

    // MARK: Tablero (`me/board`)

    func openActivities(for personId: Int) -> [DemoActivity] {
        if personId == DemoMode.meId {
            return openOrder.compactMap { activity($0) }.filter { !isClosed($0) }
        }
        return allActivities.filter {
            $0.ownerId == personId
                && !DemoStore.dispatchedIds.contains($0.id)
                && ($0.estatus == "En Proceso" || $0.estatus == "Asignada")
                && !isClosed($0)
        }
    }

    /// La última actividad que terminó hoy la persona (para «Libre»).
    func lastFinished(for personId: Int) -> DemoActivity? {
        allActivities
            .filter { $0.ownerId == personId && isClosed($0) && $0.finMin != nil }
            .sorted { ($0.finMin ?? 0) > ($1.finMin ?? 0) }
            .first
    }

    func clockIn(for personId: Int) -> Date? {
        if personId == DemoMode.meId { return myEntry }
        guard let ago = DemoStore.clockInAgo[personId] else { return nil }
        return todayTime(minutesAgo: ago)
    }

    func clockOut(for personId: Int) -> Date? {
        if personId == DemoMode.meId { return myExit }
        guard let ago = DemoStore.clockOutAgo[personId] else { return nil }
        return todayTime(minutesAgo: ago)
    }

    func openActivityJSON(_ a: DemoActivity) -> DemoJSON {
        let state = effectiveEvidence(a)
        var json = dj([
            "id": a.id,
            "anNumber": a.folio,
            "titulo": a.titulo,
            "estatus": effectiveStatus(a),
            "progressPct": progressPct(a, state: state),
            "coreKind": a.kind,
            "assignmentCharge": "ejecucion",
            "indicaciones": a.indicaciones,
            "teamEmails": [DemoData.person(a.ownerId).email],
            "reparte": false,
            "fechaInicio": iso(a.startMin),
        ])
        if let state { json["evidenceStatus"] = state.status }
        return json
    }

    func boardUserJSON(_ p: DemoPerson, now: Date) -> DemoJSON {
        let open = openActivities(for: p.id)
        let elapsed = elapsedMinutes(now: now)
        let clockInDate = clockIn(for: p.id)
        let clockOutDate = clockOut(for: p.id)

        // Estado: con algo abierto, «activo» (o «atrasado» si ya pasó su hora máxima);
        // sin nada abierto, «libre» si terminó algo hoy; si no, «sin actividad».
        let current = open.first { effectiveStatus($0) == "En Proceso" }
        let late = open.first { $0.maxMin < elapsed && effectiveStatus($0) == "En Proceso" }
        var status = "sin_actividad"
        if late != nil {
            status = "atrasado"
        } else if !open.isEmpty {
            status = "activo"
        } else if lastFinished(for: p.id) != nil {
            status = "libre"
        }

        let mine = allActivities.filter { $0.ownerId == p.id }
        let waiting = mine.filter { effectiveStatus($0) == "Por Validar" }.count
        var fixing = 0
        for candidate in mine {
            let devuelta = reviews[reviewKey(candidate.id, executorId(candidate))]?.decision == "DEVUELTA_PASOS"
            if devuelta { fixing += 1 }
        }
        let openJSON: [DemoJSON] = open.map { openActivityJSON($0) }
        var json = dj([
            "id": p.id,
            "nombre": p.nombre,
            "email": p.email,
            "puesto": p.puesto,
            "status": status,
            "openActivities": openJSON,
            "enEsperaAprobacion": waiting,
            "enCorreccion": fixing,
        ])
        if let clockInDate {
            json["clockInAt"] = DemoClock.iso(clockInDate)
            let end = clockOutDate ?? now
            json["workedMinutes"] = DemoClock.minutes(from: clockInDate, to: end)
        }
        if let current {
            json["currentActivity"] = dj([
                "id": current.id,
                "anNumber": current.folio,
                "titulo": current.titulo,
                "estatus": "En Proceso",
                "fechaMaxima": iso(current.maxMin),
                "bucket": current.kind == "servicio" ? "services" : "projects",
            ])
            let startedDate = startedAt[current.id] ?? at(current.startMin)
            json["activityStartedAt"] = DemoClock.iso(startedDate)
            json["activityElapsedMinutes"] = DemoClock.minutes(from: startedDate, to: now)
            if let late {
                json["currentLateMinutes"] = DemoClock.minutes(from: at(late.maxMin), to: now)
            }
        }
        if status == "libre", let finished = lastFinished(for: p.id), let fin = finished.finMin {
            json["lastFinished"] = dj([
                "id": finished.id,
                "anNumber": finished.folio,
                "titulo": finished.titulo,
                "finishedAt": iso(fin),
                "lateMinutes": max(0, fin - finished.maxMin),
            ])
            json["idleSinceAt"] = iso(fin)
        }
        return json
    }

    func fxBoard(now: Date) -> DemoJSON {
        let order = ["activo": 0, "atrasado": 1, "libre": 2, "sin_actividad": 3]
        var users = DemoData.people.map { boardUserJSON($0, now: now) }
        users.sort { lhs, rhs in
            let l = order[lhs["status"] as? String ?? ""] ?? 4
            let r = order[rhs["status"] as? String ?? ""] ?? 4
            if l != r { return l < r }
            return (lhs["nombre"] as? String ?? "") < (rhs["nombre"] as? String ?? "")
        }
        return dj(["scope": "company", "users": users])
    }

    func fxBoardHistory(personId: Int) -> [DemoJSON] {
        var items: [DemoJSON] = []
        let finished = allActivities.filter {
            $0.ownerId == personId && isClosed($0) && $0.finMin != nil
        }
        for a in finished {
            items.append(dj([
                "id": a.id,
                "anNumber": a.folio,
                "titulo": a.titulo,
                "estatus": effectiveStatus(a),
                "coreKind": a.kind,
                "assignmentCharge": "ejecucion",
                "fechaAsignacion": iso(a.startMin - 600),
                "fechaFinalizacion": isoOrNull(a.finMin),
                "evidence": dj(["status": "COMPLETED", "progressPct": 100.0, "evidencePhotos": [String]()]),
            ]))
        }
        for (offset, work) in DemoData.olderWork.enumerated() {
            let done = -(work.daysAgo * 1440) + 200 - offset * 30
            items.append(dj([
                "id": work.id,
                "anNumber": "AN-0\(work.id - 5000 + 90)",
                "titulo": work.titulo,
                "estatus": "Finalizada",
                "coreKind": "servicio",
                "assignmentCharge": "ejecucion",
                "fechaAsignacion": iso(done - 300),
                "fechaFinalizacion": iso(done),
                "evidence": dj(["status": "COMPLETED", "progressPct": 100.0, "evidencePhotos": [String]()]),
            ]))
        }
        return items
    }

    // MARK: «Mis actividades» (`me/activities`)

    func myItemJSON(_ a: DemoActivity, index: Int) -> DemoJSON {
        let creator = DemoData.person(a.creatorId)
        var json = dj([
            "id": a.id,
            "anNumber": a.folio,
            "titulo": a.titulo,
            "descripcion": a.descripcion,
            "estatus": effectiveStatus(a),
            "prioridad": a.prioridad,
            "coreKind": a.kind,
            "assignmentCharge": "ejecucion",
            "fechaInicio": iso(a.startMin),
            "fechaMaxima": iso(a.maxMin),
            "fechaAsignacion": iso(a.startMin - 600),
            "tiempoEstimadoMin": a.estimadoMin,
            "tiempoMaximoMin": a.estimadoMin + 60,
            "rol": "EJECUTOR",
            "indicaciones": a.indicaciones,
            "asignadaPor": dj(["id": creator.id, "nombre": creator.nombre]),
            "autoAsignada": a.creatorId == a.ownerId,
            "orden": index + 1,
            "despachador": false,
            "porRepartir": false,
            "aceptacion": "PENDIENTE",
        ])
        if let custom = ticketCustom(a) { json["ticketTypeCustom"] = custom }
        if let cliente = clientName(a) { json["cliente"] = cliente }
        if let proyecto = projectTitle(a) { json["proyecto"] = proyecto }
        if let started = startedAt[a.id] {
            json["inicioRealAt"] = DemoClock.iso(started)
        } else if let entry = evidence[a.id]?.entryAt {
            json["inicioRealAt"] = DemoClock.iso(entry)
        }
        if let state = effectiveEvidence(a), evidence[a.id] != nil { json["evidenceStatus"] = state.status }
        if let note = reorderNote[a.id] {
            json["ordenJustificacion"] = note
            json["ordenActualizadoAt"] = iso(-1)
        }
        if let fin = a.finMin { json["fechaFinalizacion"] = iso(fin) }
        return json
    }

    func fxMyActivities() -> DemoJSON {
        let open = openOrder.compactMap { activity($0) }.filter { !isClosed($0) }
        var done: [DemoJSON] = []
        for a in allActivities where a.ownerId == DemoMode.meId
            && a.id != 5154 && isClosed(a) {
            done.append(myItemJSON(a, index: done.count))
        }

        // Seguimiento: el despacho que ya se le pasó a Mariana.
        var follow = myItemJSON(DemoData.activity(5154) ?? DemoData.activities[0], index: 0)
        follow["assignmentCharge"] = "despacho"
        follow["despachador"] = true
        follow["rol"] = "LEAD"
        follow["pasadaA"] = [
            dj([
                "nombre": DemoData.person(101).nombre,
                "rol": "EJECUTOR",
                "at": iso(-110),
                "por": DemoData.me.nombre,
                "evidenceStatus": "EVIDENCE_PHOTOS",
            ]),
        ]
        follow.removeValue(forKey: "aceptacion")

        return dj([
            "canReorder": true,
            "canSelfAssign": false,
            "open": open.enumerated().map { myItemJSON($0.element, index: $0.offset) },
            "seguimiento": [follow],
            "doneToday": done,
        ])
    }

    // MARK: Detalle (`activities/:id`)

    func fxActivityDetail(_ id: Int) -> DemoJSON {
        guard let a = activity(id) else { return fxOlderDetail(id) }
        let owner = DemoData.person(executorId(a))
        let responsable = DemoData.person(a.ownerId)
        let creator = DemoData.person(a.creatorId)
        let isDispatch = DemoStore.dispatchedIds.contains(a.id)
        var assignees: [DemoJSON] = []
        if isDispatch {
            assignees.append(dj([
                "userId": responsable.id,
                "user": dj(["id": responsable.id, "nombre": responsable.nombre]),
                "rol": "LEAD",
                "asignadoPorId": creator.id,
                "indicaciones": a.indicaciones,
            ]))
        }
        assignees.append(dj([
            "userId": owner.id,
            "user": dj(["id": owner.id, "nombre": owner.nombre]),
            "rol": "EJECUTOR",
            "asignadoPorId": isDispatch ? responsable.id : creator.id,
            "indicaciones": a.indicaciones,
        ]))
        var json = dj([
            "id": a.id,
            "anNumber": a.folio,
            "titulo": a.titulo,
            "descripcion": a.descripcion,
            "estatus": effectiveStatus(a),
            "prioridad": a.prioridad,
            "coreKind": a.kind,
            "assignmentCharge": isDispatch ? "despacho" : "ejecucion",
            "fechaInicio": iso(a.startMin),
            "fechaMaxima": iso(a.maxMin),
            "fechaAsignacion": iso(a.startMin - 600),
            "tiempoEstimadoMin": a.estimadoMin,
            "tiempoMaximoMin": a.estimadoMin + 60,
            "indicaciones": a.indicaciones,
            "evidencePhotoRequired": 2,
            "responsableId": responsable.id,
            "responsable": dj(["id": responsable.id, "nombre": responsable.nombre]),
            "creador": dj(["id": creator.id, "nombre": creator.nombre]),
            "assignees": assignees,
        ])
        if let custom = ticketCustom(a) { json["ticketTypeCustom"] = custom }
        if let name = clientName(a), let client = DemoData.client(serviceId: a.clientServiceId) {
            json["client"] = dj(["id": client.serviceId, "name": name])
        }
        if let title = projectTitle(a), let pid = a.projectId {
            json["project"] = dj(["id": pid, "title": title])
        }
        if let fin = a.finMin { json["fechaFinalizacion"] = iso(fin) }
        return json
    }

    /// Actividades viejas del historial: detalle genérico, ya finalizadas.
    func fxOlderDetail(_ id: Int) -> DemoJSON {
        guard let work = DemoData.olderWork.first(where: { $0.id == id }) else { return [:] }
        let owner = DemoData.person(102)
        let finished = -(work.daysAgo * 1440) + 200
        return dj([
            "id": work.id,
            "anNumber": "AN-0\(work.id - 5000 + 90)",
            "titulo": work.titulo,
            "descripcion": "Trabajo concluido y aprobado por la coordinación.",
            "estatus": "Finalizada",
            "prioridad": "media",
            "coreKind": "servicio",
            "assignmentCharge": "ejecucion",
            "fechaInicio": iso(finished - 300),
            "fechaMaxima": iso(finished + 60),
            "fechaAsignacion": iso(finished - 900),
            "fechaFinalizacion": iso(finished),
            "tiempoEstimadoMin": 180,
            "tiempoMaximoMin": 240,
            "evidencePhotoRequired": 2,
            "responsableId": owner.id,
            "responsable": dj(["id": owner.id, "nombre": owner.nombre]),
            "creador": dj(["id": 1, "nombre": DemoData.me.nombre]),
            "assignees": [
                dj([
                    "userId": owner.id,
                    "user": dj(["id": owner.id, "nombre": owner.nombre]),
                    "rol": "EJECUTOR",
                    "asignadoPorId": 1,
                ]),
            ],
        ])
    }

    // MARK: Historial (`activities/:id/timeline`)

    func fxTimeline(_ id: Int) -> [DemoJSON] {
        guard let a = activity(id) else {
            guard let work = DemoData.olderWork.first(where: { $0.id == id }) else { return [] }
            let finished = -(work.daysAgo * 1440) + 200
            return [
                dj(["id": "\(id)-1", "at": iso(finished - 900), "kind": "creada", "title": "Actividad creada",
                    "subtitle": "Por \(DemoData.me.corto)", "icon": "🆕"]),
                dj(["id": "\(id)-2", "at": iso(finished - 300), "kind": "inicio", "title": "Inició el trabajo",
                    "subtitle": DemoData.person(102).corto, "icon": "▶️"]),
                dj(["id": "\(id)-3", "at": iso(finished), "kind": "finalizada", "title": "Actividad finalizada",
                    "subtitle": "Evidencia aprobada", "icon": "✅"]),
            ]
        }
        let executor = DemoData.person(executorId(a))
        var events: [DemoJSON] = [
            dj(["id": "\(id)-1", "at": iso(a.startMin - 600), "kind": "creada", "title": "Actividad creada",
                "subtitle": "Por \(DemoData.person(a.creatorId).corto)", "icon": "🆕"]),
            dj(["id": "\(id)-2", "at": iso(a.startMin - 590), "kind": "asignada", "title": "Asignada a \(executor.corto)",
                "subtitle": a.indicaciones, "icon": "👤"]),
        ]
        if DemoStore.dispatchedIds.contains(a.id) {
            events.append(dj(["id": "\(id)-d", "at": iso(-110), "kind": "despacho", "title": "Despachada al equipo",
                              "subtitle": "\(DemoData.me.corto) → \(executor.corto)", "icon": "📤"]))
        }
        if let state = effectiveEvidence(a) {
            if let entry = state.entryAt {
                events.append(dj(["id": "\(id)-3", "at": DemoClock.iso(entry), "kind": "inicio", "title": "Foto de entrada",
                                  "subtitle": "\(executor.corto) inició la actividad", "icon": "▶️"]))
            }
            if let photosAt = state.photosAt {
                events.append(dj(["id": "\(id)-4", "at": DemoClock.iso(photosAt), "kind": "fotos", "title": "Fotos en sitio",
                                  "subtitle": "\(state.photos.count) fotos de evidencia", "icon": "📷"]))
            }
            if let sheetAt = state.sheetAt {
                events.append(dj(["id": "\(id)-5", "at": DemoClock.iso(sheetAt), "kind": "formulario", "title": "Formulario completado",
                                  "subtitle": "Hoja de servicio", "icon": "📝"]))
            }
            if let exitAt = state.exitAt {
                events.append(dj(["id": "\(id)-6", "at": DemoClock.iso(exitAt), "kind": "por_revisar", "title": "Evidencia enviada a revisión",
                                  "subtitle": "Foto de salida registrada", "icon": "🔍"]))
            }
            if let review = reviews[reviewKey(a.id, executorId(a))] {
                let approved = review.decision == "APROBADA"
                events.append(dj(["id": "\(id)-7", "at": DemoClock.iso(review.at), "kind": approved ? "aprobada" : "devuelta",
                                  "title": approved ? "Evidencia aprobada" : "Evidencia devuelta",
                                  "subtitle": review.notes, "icon": approved ? "✅" : "↩️"]))
            }
        }
        return events
    }

    // MARK: Evidencias del equipo (`me/activities/:id/evidencias`)

    func fxTeamEvidence(_ id: Int) -> DemoJSON {
        guard let a = activity(id) else {
            // Historial viejo: una persona, evidencia aprobada.
            guard let work = DemoData.olderWork.first(where: { $0.id == id }) else { return [:] }
            var state = DemoEvidenceState()
            state.status = "COMPLETED"
            state.entryPhoto = DemoImages.dataURL(.entry)
            state.entryAt = at(-work.daysAgo * 1440 - 100)
            state.photos = [DemoImages.dataURL(.work1), DemoImages.dataURL(.work2)]
            state.photosAt = at(-work.daysAgo * 1440 - 60)
            state.exitPhoto = DemoImages.dataURL(.exit)
            state.exitAt = at(-work.daysAgo * 1440)
            state.reviewStatus = "APPROVED"
            let owner = DemoData.person(102)
            return dj([
                "activity": dj(["id": work.id, "titulo": work.titulo, "estatus": "Finalizada", "coreKind": "servicio",
                                "assignmentCharge": "ejecucion", "evidencePhotoRequired": 2]),
                "alcance": "todo",
                "creador": DemoData.me.nombre,
                "responsable": owner.nombre,
                "soloLectura": true,
                "resumen": dj(["ejecutores": 1, "terminaron": 1, "aprobadas": 1, "porRevisarMias": 0]),
                "members": [
                    dj([
                        "userId": owner.id, "nombre": owner.nombre, "puesto": owner.puesto, "rol": "EJECUTOR",
                        "reparte": false, "progressPct": 100.0, "puedoRevisar": false,
                        "evidence": evidenceDataJSON(state),
                    ]),
                ],
            ])
        }

        let executor = DemoData.person(executorId(a))
        let state = effectiveEvidence(a)
        let canReview = executor.id != DemoMode.meId
        let completed = state?.status == "COMPLETED"
        let reviewState = state?.reviewStatus ?? ""
        let pending = canReview && completed && (reviewState == "PENDING" || reviewState.isEmpty)
        var member = dj([
            "userId": executor.id,
            "nombre": executor.nombre,
            "puesto": executor.puesto,
            "rol": "EJECUTOR",
            "reparte": false,
            "asignadoAt": iso(a.startMin - 590),
            "asignadoPor": DemoData.person(a.creatorId).nombre,
            "indicaciones": a.indicaciones,
            "progressPct": progressPct(a, state: state),
            "puedoRevisar": canReview,
            "rejectedSteps": state?.rejectedSteps ?? [String](),
        ])
        if let state { member["evidence"] = evidenceDataJSON(state) }
        if let review = reviews[reviewKey(a.id, executorId(a))] {
            member["revisiones"] = [
                dj([
                    "id": 1,
                    "decision": review.decision,
                    "pasos": review.steps,
                    "observaciones": review.notes,
                    "calificacion": review.rating,
                    "at": DemoClock.iso(review.at),
                    "revisor": DemoData.me.nombre,
                ]),
            ]
            if review.decision == "APROBADA" { member["eficienciaScore"] = review.rating }
        }
        let approved = state?.reviewStatus == "APPROVED"
        return dj([
            "activity": dj([
                "id": a.id, "anNumber": a.folio, "titulo": a.titulo, "estatus": effectiveStatus(a),
                "coreKind": a.kind, "assignmentCharge": "ejecucion", "evidencePhotoRequired": 2,
                "fechaFinalizacion": isoOrNull(a.finMin),
            ]),
            "alcance": "todo",
            "creador": DemoData.person(a.creatorId).nombre,
            "responsable": DemoData.person(a.ownerId).nombre,
            "soloLectura": false,
            "resumen": dj([
                "ejecutores": 1,
                "terminaron": completed ? 1 : 0,
                "aprobadas": approved ? 1 : 0,
                "porRevisarMias": pending ? 1 : 0,
            ]),
            "members": [member],
        ])
    }

    // MARK: Captura del ejecutor (`activity-evidence/:id`)

    func fxEvidenceFlow(_ id: Int) -> DemoJSON? {
        guard let a = activity(id), let state = evidence[id] else { return nil }
        return evidenceFlowJSON(a, state: state)
    }

    func evidenceFlowJSON(_ a: DemoActivity, state: DemoEvidenceState) -> DemoJSON {
        var json = evidenceDataJSON(state)
        json["id"] = a.id * 10
        json["activityId"] = a.id
        json["userId"] = DemoMode.meId
        json["progressPct"] = progressPct(a, state: state)
        json["assigneeIndicaciones"] = a.indicaciones
        json["campos"] = [DemoJSON]()
        json["activity"] = dj([
            "id": a.id,
            "indicaciones": a.indicaciones,
            "coreKind": a.kind,
            "evidencePhotoRequired": 2,
            "responsableId": DemoMode.meId,
            "estatus": effectiveStatus(a),
        ])
        if !state.rejectedSteps.isEmpty { json["rejectedSteps"] = state.rejectedSteps }
        return json
    }

    /// Paso que sigue al actual, según el tipo (sin PDF si no es servicio).
    func nextEvidenceStep(after step: String, kind: String) -> String {
        let steps = CoreEvidence.steps(for: kind)
        guard let index = steps.firstIndex(of: step), index + 1 < steps.count else { return "COMPLETED" }
        return steps[index + 1]
    }
}
