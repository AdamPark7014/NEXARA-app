import Foundation

/// «Servidor» de la demostración. `ApiClient` le pasa cada petición mientras
/// `DemoMode.isActive`, antes de tocar la red, la caché sin conexión o la cola de
/// mutaciones. Contesta JSON válido para los GET de las pantallas principales y simula en
/// memoria lo que se ve al usar la app (checar, escribir en el chat, iniciar una actividad,
/// autorizar un viático, marcar una notificación como leída…).
///
/// Reglas:
///  - NUNCA devuelve 401 ni `{"queued":true}`.
///  - Un POST/PUT/PATCH/DELETE sin ruta conocida contesta 200 con `{}`.
///  - Un GET sin ruta conocida contesta `{}` (las pantallas lo leen como «sin datos»).
///  - Las horas son relativas al momento de entrar al demo (`DemoStore.epoch`).
enum DemoBackend {
    static func handle(
        method: String,
        path: String,
        query: [String: String],
        body: Data?
    ) async -> (status: Int, data: Data)? {
        let reply = DemoStore.shared.route(method: method, path: path, query: query, body: body)
        return (reply.status, reply.data)
    }
}

/// Respuesta ya serializada.
struct DemoReply {
    let status: Int
    let data: Data
}

extension DemoStore {
    // MARK: Entrada

    func route(method rawMethod: String, path: String, query: [String: String], body: Data?) -> DemoReply {
        lock.lock()
        defer { lock.unlock() }
        let method = rawMethod.uppercased()
        let parts = path
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            .split(separator: "/")
            .map { String($0) }
        let now = Date()
        let json = parseJSON(body)
        let payload = dispatch(method: method, parts: parts, query: query, json: json, body: body, now: now)
        return payload
    }

    private func parseJSON(_ body: Data?) -> DemoJSON {
        guard let body, !body.isEmpty else { return [:] }
        return (try? JSONSerialization.jsonObject(with: body)) as? DemoJSON ?? [:]
    }

    private func reply(_ payload: Any, status: Int = 200) -> DemoReply {
        if JSONSerialization.isValidJSONObject(payload),
           let data = try? JSONSerialization.data(withJSONObject: payload, options: []) {
            return DemoReply(status: status, data: data)
        }
        return DemoReply(status: status, data: Data("{}".utf8))
    }

    private func failure(_ status: Int, _ message: String) -> DemoReply {
        reply(dj(["statusCode": status, "message": message]), status: status)
    }

    private func empty() -> DemoReply { reply(DemoJSON()) }

    private func intAt(_ parts: [String], _ index: Int) -> Int? {
        parts.indices.contains(index) ? Int(parts[index]) : nil
    }

    // MARK: Ruteo

    private func dispatch(
        method: String,
        parts: [String],
        query: [String: String],
        json: DemoJSON,
        body: Data?,
        now: Date
    ) -> DemoReply {
        let head = parts.first ?? ""
        let isGet = method == "GET"
        switch head {
        case "me":
            return routeMe(method: method, parts: parts, query: query, json: json, now: now)
        case "activities":
            return routeActivities(method: method, parts: parts, json: json)
        case "activity-evidence":
            return routeEvidence(method: method, parts: parts, json: json, now: now)
        case "attendance":
            return routeAttendance(method: method, parts: parts, query: query, json: json, now: now)
        case "lunch-breaks":
            return routeLunch(method: method, parts: parts, query: query, json: json, now: now)
        case "gps":
            return routeGps(method: method, parts: parts, query: query, json: json, now: now)
        case "chat":
            return routeChat(method: method, parts: parts, query: query, json: json, now: now)
        case "notifications":
            return routeNotifications(method: method, parts: parts)
        case "viatics":
            return routeViatics(method: method, parts: parts, json: json, body: body, now: now)
        case "vehicles":
            return routeVehicles(method: method, parts: parts, json: json, now: now)
        case "ventas":
            return routeClients(method: method, parts: parts, query: query, json: json)
        case "activity-feed":
            return reply(fxActivityFeed())
        case "operational-projects":
            if isGet { return reply(fxOperationalProjects()) }
            return reply(dj(["id": 7100, "ok": true]))
        case "proyectos":
            return reply(fxProyectos())
        case "stock":
            if isGet, parts.count >= 2, parts[1] == "levels" { return reply(fxStockLevels()) }
            if isGet, parts.count >= 3, parts[1] == "alerts" { return reply(fxLowStock()) }
            return isGet ? reply([DemoJSON]()) : empty()
        case "users":
            return routeUsers(method: method, parts: parts, json: json)
        case "integra":
            return reply(fxIdentity())
        case "auth":
            if isGet, parts.count >= 2, parts[1] == "profile" { return reply(fxAuthProfile()) }
            return empty()
        case "company":
            return reply(fxCompanyMine())
        default:
            return empty()
        }
    }

    // MARK: me/*

    private func routeMe(method: String, parts: [String], query: [String: String], json: DemoJSON, now: Date) -> DemoReply {
        let sub = parts.count > 1 ? parts[1] : ""
        let isGet = method == "GET"
        switch sub {
        case "navigation":
            return reply(fxNavigation())
        case "board":
            if let id = intAt(parts, 2) {
                if parts.count >= 4, parts[3] == "history" { return reply(fxBoardHistory(personId: id)) }
                return reply(boardUserJSON(DemoData.person(id), now: now))
            }
            return reply(fxBoard(now: now))
        case "celebraciones":
            return reply(fxCelebraciones(now: now))
        case "kpis":
            let range = ConsoleHelpersFallback.range(query)
            return reply(fxKpis(desde: range.desde, hasta: range.hasta))
        case "activities":
            return routeMyActivities(method: method, parts: parts, json: json, now: now, isGet: isGet)
        default:
            return empty()
        }
    }

    private func routeMyActivities(method: String, parts: [String], json: DemoJSON, now: Date, isGet: Bool) -> DemoReply {
        // me/activities
        if parts.count == 2 {
            if isGet { return reply(fxMyActivities()) }
            if method == "POST" { return createActivity(json, selfAssign: true, now: now) }
            return empty()
        }
        // me/activities/order
        if parts[2] == "order" {
            if let ids = json["activityIds"] as? [Int] {
                let kept = openOrder.filter { !ids.contains($0) }
                openOrder = ids.filter { DemoData.myOpenIds.contains($0) || openOrder.contains($0) } + kept
                if let moved = json["movedActivityId"] as? Int, let why = json["justificacion"] as? String {
                    reorderNote[moved] = why
                }
            }
            return reply(fxMyActivities())
        }
        guard let id = Int(parts[2]) else { return empty() }
        let action = parts.count > 3 ? parts[3] : ""
        switch action {
        case "iniciar":
            startedAt[id] = now
            return reply(dj(["ok": true, "inicioRealAt": DemoClock.iso(now)]))
        case "herramientas":
            return reply(dj([
                "activityId": id, "requisitos": [DemoJSON](), "total": 0, "listos": 0,
                "pendientes": [String](), "completo": true,
            ]))
        case "evidencias":
            if parts.count >= 6, parts[5] == "revision", let userId = Int(parts[4]) {
                applyReview(activityId: id, userId: userId, json: json, now: now)
            }
            return reply(fxTeamEvidence(id))
        case "despacho":
            let users = json["userIds"] as? [Int] ?? []
            return reply(dj(["asignados": max(1, users.count)]))
        default:
            return empty()
        }
    }

    private func applyReview(activityId: Int, userId: Int, json: DemoJSON, now: Date) {
        let wants = (json["decision"] as? String ?? "aprobar").lowercased()
        let all = (json["todo"] as? Bool) == true
        let steps = json["pasos"] as? [String] ?? []
        var decision = "APROBADA"
        if wants != "aprobar" { decision = all ? "DEVUELTA_TODO" : "DEVUELTA_PASOS" }
        reviews[reviewKey(activityId, userId)] = DemoReview(
            decision: decision,
            notes: json["observaciones"] as? String ?? "",
            rating: json["calificacion"] as? Int ?? 5,
            at: now,
            steps: steps
        )
    }

    // MARK: activities/*

    private func routeActivities(method: String, parts: [String], json: DemoJSON) -> DemoReply {
        let isGet = method == "GET"
        if parts.count == 1 {
            if method == "POST" { return createActivity(json, selfAssign: false, now: Date()) }
            return isGet ? reply([DemoJSON]()) : empty()
        }
        if parts[1] == "next-an" {
            return reply(dj(["next": "AN-0\(160 + extraActivities.count)"]))
        }
        guard let id = Int(parts[1]) else { return empty() }
        let action = parts.count > 2 ? parts[2] : ""
        switch action {
        case "":
            return reply(fxActivityDetail(id))
        case "timeline":
            return reply(fxTimeline(id))
        case "acciones":
            return reply(dj([
                "puedeCancelar": false, "puedePasar": false, "personas": [DemoJSON](),
                "cerrada": false, "motivoMinimo": 10,
            ]))
        default:
            return empty()
        }
    }

    private func createActivity(_ json: DemoJSON, selfAssign: Bool, now: Date) -> DemoReply {
        nextActivityId += 1
        let id = nextActivityId
        let owner = selfAssign ? DemoMode.meId : (json["responsableId"] as? Int ?? DemoMode.meId)
        let title = (json["titulo"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let start = minutesFromEpoch(json["fechaInicio"] as? String) ?? 30
        let limit = minutesFromEpoch(json["fechaMaxima"] as? String) ?? (start + 240)
        let activity = DemoActivity(
            id: id,
            folio: "AN-0\(160 + extraActivities.count)",
            titulo: title.isEmpty ? "Actividad nueva" : title,
            kind: json["coreKind"] as? String ?? "tarea",
            clientServiceId: json["clientId"] as? Int ?? 0,
            projectId: json["projectId"] as? Int,
            ownerId: owner,
            creatorId: DemoMode.meId,
            prioridad: (json["prioridad"] as? String ?? "media").lowercased(),
            estatus: "Asignada",
            startMin: start,
            maxMin: limit,
            finMin: nil,
            avance: 0,
            evidencia: "",
            indicaciones: json["indicaciones"] as? String ?? "",
            estimadoMin: json["tiempoEstimadoMin"] as? Int ?? 60,
            descripcion: ""
        )
        extraActivities.append(activity)
        if owner == DemoMode.meId { openOrder.append(id) }
        return reply(dj(["id": id, "anNumber": activity.folio]))
    }

    private func minutesFromEpoch(_ iso: String?) -> Int? {
        guard let iso, let date = ActivityParse.isoDate(iso) else { return nil }
        return Int(date.timeIntervalSince(epoch) / 60)
    }

    // MARK: activity-evidence/*

    private func routeEvidence(method: String, parts: [String], json: DemoJSON, now: Date) -> DemoReply {
        guard let id = intAt(parts, 1), let a = activity(id) else { return failure(404, "Sin evidencia") }
        let action = parts.count > 2 ? parts[2] : ""
        if method == "GET" {
            if action == "geocerca" { return reply(fxGeofence(id)) }
            if let flow = fxEvidenceFlow(id) { return reply(flow) }
            return failure(404, "Sin evidencia todavía")
        }

        var state = evidence[id] ?? DemoEvidenceState()
        switch action {
        case "entry-photo":
            state.entryPhoto = json["photoUrl"] as? String ?? DemoImages.dataURL(.entry)
            state.entryAt = now
            state.status = nextEvidenceStep(after: "ENTRY_PHOTO", kind: a.kind)
            startedAt[id] = startedAt[id] ?? now
        case "evidence-photos":
            let urls = json["photoUrls"] as? [String] ?? []
            state.photos = urls
            state.photosAt = now
            state.status = nextEvidenceStep(after: "EVIDENCE_PHOTOS", kind: a.kind)
        case "service-sheet-pdf":
            state.status = nextEvidenceStep(after: "SERVICE_SHEET_PDF", kind: a.kind)
        case "service-sheet-data":
            var sheet: [String: String] = [:]
            for (key, value) in json {
                if let text = value as? String { sheet[key] = text }
            }
            state.sheet = sheet.isEmpty ? sampleSheet(a) : sheet
            state.sheetAt = now
            state.status = nextEvidenceStep(after: "SERVICE_SHEET_DATA", kind: a.kind)
        case "exit-photo":
            state.exitPhoto = json["photoUrl"] as? String ?? DemoImages.dataURL(.exit)
            state.exitAt = now
            state.status = "COMPLETED"
            state.reviewStatus = ""
        case "resubmit":
            // Corrección de un paso devuelto: vuelve a quedar en revisión.
            state.status = "COMPLETED"
            state.reviewStatus = ""
            state.rejectedSteps = []
            reviews.removeValue(forKey: reviewKey(id, DemoMode.meId))
        default:
            break
        }
        evidence[id] = state
        return reply(evidenceFlowJSON(a, state: state))
    }

    private func fxGeofence(_ id: Int) -> DemoJSON {
        var json = dj([
            "activityId": id,
            "radioM": 100,
            "seguimientoActivo": false,
            "puntos": [DemoJSON](),
            "alertas": [DemoJSON](),
        ])
        if let state = evidence[id], !state.entryPhoto.isEmpty {
            let coords = DemoImages.coords
            json["seguimientoActivo"] = state.exitPhoto.isEmpty
            json["origen"] = dj([
                "latitude": coords.latitude,
                "longitude": coords.longitude,
                "at": isoOrNull(state.entryAt),
            ])
            json["dentro"] = true
            json["ultimo"] = dj([
                "latitude": coords.latitude,
                "longitude": coords.longitude,
                "at": isoOrNull(state.entryAt),
                "distanciaM": 8,
            ])
        }
        return json
    }

    // MARK: attendance/*

    private func routeAttendance(method: String, parts: [String], query: [String: String], json: DemoJSON, now: Date) -> DemoReply {
        let sub = parts.count > 1 ? parts[1] : ""
        if method == "POST" {
            if sub == "justificaciones" { return empty() }
            return checkIn(json: json, now: now)
        }
        let today = DemoClock.day(now)
        switch sub {
        case "current":
            return reply(fxAttendanceCurrent(now: now))
        case "day":
            return reply(fxAttendanceDay(date: query["date"] ?? today, now: now))
        case "history":
            return reply(fxAttendanceHistory(date: query["date"] ?? today, now: now))
        case "hierarchy":
            let from = query["from"] ?? today
            return reply(fxHierarchyRange(from: from, to: query["to"] ?? from, now: now))
        case "range":
            let from = query["from"] ?? today
            return reply(fxAttendanceRange(from: from, to: query["to"] ?? from))
        case "hybrid":
            return reply(fxAttendanceHybrid(now: now))
        default:
            return empty()
        }
    }

    private func checkIn(json: DemoJSON, now: Date) -> DemoReply {
        let type = (json["type"] as? String ?? "entrada").lowercased()
        let photo = json["photoBase64"] as? String ?? ""
        if type.hasPrefix("entrada") {
            if myEntry != nil {
                return failure(400, "Ya registraste tu entrada de hoy.")
            }
            myEntry = now
            myExit = nil
            myEntryPhoto = photo.isEmpty ? DemoImages.dataURL(.entry) : photo
            return reply(dj(["id": 1, "type": "entrada", "timestamp": DemoClock.iso(now), "message": "Entrada registrada"]))
        }
        guard myEntry != nil, myExit == nil else {
            return failure(400, "No tienes una jornada abierta.")
        }
        myExit = now
        myExitPhoto = photo.isEmpty ? DemoImages.dataURL(.exit) : photo
        return reply(dj(["id": 1, "type": "salida", "timestamp": DemoClock.iso(now), "message": "Salida registrada"]))
    }

    // MARK: lunch-breaks/*

    private func routeLunch(method: String, parts: [String], query: [String: String], json: DemoJSON, now: Date) -> DemoReply {
        let sub = parts.count > 1 ? parts[1] : ""
        switch (method, sub) {
        case ("GET", "mi-dia"):
            return reply(fxLunchMyDay(now: now))
        case ("GET", "equipo"):
            return reply(fxLunchTeam(date: query["fecha"] ?? DemoClock.day(now), now: now))
        case ("POST", "checkin"):
            lunchOut = now
            lunchIn = nil
            lunchOutPhoto = json["checkinPhotoUrl"] as? String ?? ""
            return reply(dj(["id": 88001, "ok": true]))
        case ("PUT", "checkout"):
            lunchIn = now
            lunchInPhoto = json["checkoutPhotoUrl"] as? String ?? ""
            return reply(dj(["id": 88001, "ok": true]))
        case ("PATCH", _):
            // lunch-breaks/:id/revision
            if let id = Int(sub) {
                let approve = (json["decision"] as? String ?? "aprobar").lowercased() == "aprobar"
                lunchReviews[id] = approve ? "APROBADA" : "RECHAZADA"
            }
            return empty()
        default:
            return empty()
        }
    }

    // MARK: gps/*

    private func routeGps(method: String, parts: [String], query: [String: String], json: DemoJSON, now: Date) -> DemoReply {
        let sub = parts.count > 1 ? parts[1] : ""
        switch (method, sub) {
        case ("GET", "me"):
            return reply(fxGpsMe())
        case ("GET", "team"):
            return reply(fxGpsTeam(now: now))
        case ("GET", "trajectory"):
            return reply(fxGpsTrajectory(date: query["date"] ?? DemoClock.day(now), now: now))
        case ("PATCH", "consent"):
            gpsConsent = (json["enabled"] as? Bool) ?? false
            return reply(dj(["consent": gpsConsent]))
        default:
            return empty()
        }
    }

    // MARK: chat/*

    private func routeChat(method: String, parts: [String], query: [String: String], json: DemoJSON, now: Date) -> DemoReply {
        let sub = parts.count > 1 ? parts[1] : ""
        switch sub {
        case "channels":
            return routeChatChannels(method: method, parts: parts, query: query, json: json, now: now)
        case "messages":
            return routeChatMessages(method: method, parts: parts, json: json, now: now)
        case "colleagues":
            return reply(fxColleagues(query: query["q"] ?? ""))
        case "mentions":
            return reply(fxMentions(query: query["q"] ?? ""))
        case "search":
            let channel = query["channelId"].flatMap { Int($0) }
            return reply(fxChatSearch(query: query["q"] ?? "", channelId: channel))
        case "dm":
            let userId = (json["userId"] as? Int) ?? 101
            return reply(openDirectChannel(with: userId))
        case "upload":
            return reply(dj(["url": "demo/documento.pdf", "name": "documento.pdf"]))
        default:
            return empty()
        }
    }

    private func routeChatChannels(method: String, parts: [String], query: [String: String], json: DemoJSON, now: Date) -> DemoReply {
        if parts.count == 2 {
            if method == "GET" { return reply(fxChatChannels()) }
            if method == "POST" {
                return reply(createChannel(
                    name: json["name"] as? String ?? "",
                    kind: json["kind"] as? String ?? "PUBLIC",
                    topic: json["topic"] as? String ?? ""
                ))
            }
            return empty()
        }
        guard let id = Int(parts[2]) else { return empty() }
        let action = parts.count > 3 ? parts[3] : ""
        switch (method, action) {
        case ("GET", ""):
            return reply(fxChannelDetail(id))
        case ("GET", "messages"):
            let parent = query["parentId"].flatMap { Int($0) }
            return reply(fxChatMessages(channelId: id, parentId: parent))
        case ("GET", "pins"):
            return reply(fxChatPins(channelId: id))
        case ("POST", "messages"):
            let text = (json["body"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let attachment = json["attachmentUrl"] as? String
            guard !text.isEmpty || attachment != nil else { return failure(400, "Escribe un mensaje.") }
            let message = addMessage(
                channelId: id,
                body: text,
                parentId: json["parentId"] as? Int,
                attachmentUrl: attachment,
                attachmentName: json["attachmentName"] as? String,
                now: now
            )
            return reply(message)
        case ("PATCH", "read"):
            channelUnread[id] = 0
            return empty()
        case ("PATCH", "mute"):
            if (json["muted"] as? Bool) == true { channelMuted.insert(id) } else { channelMuted.remove(id) }
            return reply(fxChannelDetail(id))
        case ("PATCH", "topic"):
            channelTopic[id] = json["topic"] as? String ?? ""
            return reply(fxChannelDetail(id))
        case ("DELETE", "leave"):
            removedChannels.insert(id)
            return empty()
        default:
            return empty()
        }
    }

    private func routeChatMessages(method: String, parts: [String], json: DemoJSON, now: Date) -> DemoReply {
        guard let id = intAt(parts, 2) else { return empty() }
        let action = parts.count > 3 ? parts[3] : ""
        switch (method, action) {
        case ("POST", "reactions"):
            let emoji = json["emoji"] as? String ?? "👍"
            applyReaction(messageId: id, emoji: emoji, userId: DemoMode.meId, minutesAgo: 0)
            return empty()
        case ("POST", "pin"):
            return reply(togglePin(messageId: id, now: now))
        case ("PATCH", ""):
            return reply(editMessage(messageId: id, body: json["body"] as? String ?? "", now: now))
        default:
            return empty()
        }
    }

    // MARK: notifications/*

    private func routeNotifications(method: String, parts: [String]) -> DemoReply {
        let sub = parts.count > 1 ? parts[1] : ""
        switch (method, sub) {
        case ("GET", ""):
            return reply(fxNotifications())
        case ("GET", "count"):
            return reply(fxUnreadCount())
        case ("PATCH", "read"):
            // notifications/read/all
            for notice in DemoStore.notices { notifRead.insert(notice.id) }
            return empty()
        case ("PATCH", _):
            if let id = Int(sub) { notifRead.insert(id) }
            return empty()
        case ("DELETE", _):
            if let id = Int(sub) { notifRemoved.insert(id) }
            return empty()
        default:
            return empty()
        }
    }

    // MARK: viatics/*

    private func routeViatics(method: String, parts: [String], json: DemoJSON, body: Data?, now: Date) -> DemoReply {
        if parts.count == 1 {
            if method == "GET" { return reply(fxViaticos()) }
            if method == "POST" { return createViatico(fields: multipartFields(body), now: now) }
            return empty()
        }
        guard let id = Int(parts[1]) else { return empty() }
        let action = parts.count > 2 ? parts[2] : ""
        switch (method, action) {
        case ("GET", ""):
            return reply(fxViatico(id))
        case ("PUT", "reparto"):
            let partes = json["partes"] as? [DemoJSON] ?? []
            updateViatico(id) { viatico in
                var repartos: [DemoJSON] = []
                for (index, parte) in partes.enumerated() {
                    var row = dj([
                        "id": id * 10 + index,
                        "actividadId": parte["actividadId"] as? Int ?? 0,
                        "monto": parte["monto"] as? Double ?? 0,
                    ])
                    if let note = parte["nota"] as? String, !note.isEmpty { row["nota"] = note }
                    repartos.append(row)
                }
                viatico["repartos"] = repartos
            }
            return empty()
        case ("PATCH", "comprobar"):
            let fields = multipartFields(body)
            let spent = Double(fields["montoComprobado"] ?? "") ?? 0
            let stamp = DemoClock.iso(now)
            updateViatico(id) { viatico in
                viatico["montoComprobado"] = spent
                viatico["fechaComprobacion"] = stamp
                let delivered = (viatico["montoAprobado"] as? Double) ?? (viatico["montoSolicitado"] as? Double) ?? 0
                viatico["liquidacion"] = self.liquidacionJSON(entregado: delivered, comprobado: spent)
            }
            return empty()
        case ("PATCH", "approve"):
            let approve = (json["action"] as? String ?? "approve") == "approve"
            let note = json["note"] as? String
            let cut = json["montoAprobado"] as? Double
            updateViatico(id) { viatico in
                if approve {
                    let asked = viatico["montoSolicitado"] as? Double ?? 0
                    let granted = cut ?? asked
                    viatico["estatus"] = "Aprobado"
                    viatico["montoAprobado"] = granted
                    viatico["liquidacion"] = self.liquidacionJSON(entregado: granted, comprobado: nil)
                } else {
                    viatico["estatus"] = "Rechazado"
                }
                if let note, !note.isEmpty { viatico["motivoDecision"] = note }
            }
            return empty()
        case ("PATCH", "pagado"):
            updateViatico(id) { viatico in
                viatico["estatus"] = "Pagado"
                viatico["contabilidadRef"] = "POL-2026-0499"
            }
            return empty()
        default:
            return empty()
        }
    }

    private func createViatico(fields: [String: String], now: Date) -> DemoReply {
        nextViaticoId += 1
        let id = nextViaticoId
        let amount = Double(fields["montoSolicitado"] ?? "") ?? 0
        let motivo = (fields["motivo"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        var viatico = makeViatico(
            id: id,
            userId: DemoMode.meId,
            estatus: "Pendiente",
            categoria: fields["categoria"] ?? "OTROS",
            motivo: motivo,
            solicitado: amount,
            aprobado: nil,
            comprobado: nil,
            daysAgo: 0,
            actividadId: fields["actividadId"].flatMap { Int($0) }
        )
        viatico["fechaSolicitud"] = DemoClock.iso(now)
        viaticos.insert(viatico, at: 0)
        return reply(dj(["id": id]))
    }

    /// Campos de texto de un `multipart/form-data` (las fotos se ignoran).
    private func multipartFields(_ body: Data?) -> [String: String] {
        guard let body, !body.isEmpty else { return [:] }
        let text = String(decoding: body, as: UTF8.self)
        guard let regex = try? NSRegularExpression(
            pattern: "name=\"([^\"]+)\"\\r\\n\\r\\n([^\\r]*)\\r\\n",
            options: []
        ) else { return [:] }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        var fields: [String: String] = [:]
        regex.enumerateMatches(in: text, options: [], range: range) { match, _, _ in
            guard let match,
                  let keyRange = Range(match.range(at: 1), in: text),
                  let valueRange = Range(match.range(at: 2), in: text) else { return }
            fields[String(text[keyRange])] = String(text[valueRange])
        }
        return fields
    }

    // MARK: vehicles/*

    private func routeVehicles(method: String, parts: [String], json: DemoJSON, now: Date) -> DemoReply {
        let sub = parts.count > 1 ? parts[1] : ""
        if method == "GET", sub == "mis-vehiculos" { return reply(fxVehicles()) }
        if method == "POST" {
            if parts.count == 1 {
                // Solicitud nueva.
                vehicleRequests.append(dj([
                    "id": 90 + vehicleRequests.count,
                    "nombreVehiculo": "Vehículo solicitado",
                    "placasVehiculo": "DEM-000-Z",
                    "estatusAprobacion": "Pendiente",
                    "entregaEstatus": "",
                    "fechaInicioSolicitada": json["fechaInicioSolicitada"] as? String ?? DemoClock.iso(now),
                    "fechaFinSolicitada": json["fechaFinSolicitada"] as? String ?? DemoClock.iso(now),
                ]))
                return empty()
            }
            // Salida o regreso con check list.
            let last = parts.last ?? ""
            if last == "end-use" || last == "return" { vehicleAssigned = false }
            return empty()
        }
        return empty()
    }

    // MARK: ventas/*

    private func routeClients(method: String, parts: [String], query: [String: String], json: DemoJSON) -> DemoReply {
        guard parts.count >= 2, parts[1] == "clientes" else { return empty() }
        if parts.count == 2 {
            if method == "GET" { return reply(fxClients(sector: query["sector"])) }
            if method == "POST" { return createClient(json) }
            return empty()
        }
        let sub = parts[2]
        if method == "GET", sub == "permisos" { return reply(fxClientPermissions()) }
        if method == "GET", sub == "fiscal-lookup" {
            return reply(dj([
                "validation": dj(["rfc": query["rfc"] ?? "", "valid": true, "type": "MORAL", "errors": [String]()]),
                "regimes": [dj(["code": "601", "name": "General de Ley Personas Morales"])],
                "suggestedRegime": "601",
                "message": "Datos de ejemplo.",
            ]))
        }
        guard let id = Int(sub) else { return empty() }
        if method == "GET" { return reply(fxClient(id)) }
        if method == "POST", parts.count >= 4, parts[3] == "sectors" {
            // No se guarda el sector nuevo: se devuelve la ficha tal cual.
            return reply(fxClient(id))
        }
        return reply(fxClient(id))
    }

    private func createClient(_ json: DemoJSON) -> DemoReply {
        nextClientId += 1
        let id = nextClientId
        let name = (json["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let sectors = (json["sectors"] as? [String]) ?? ["PROYECTO"]
        let client = DemoClient(
            id: id,
            serviceId: id + 1000,
            name: name.isEmpty ? "Cliente nuevo" : name,
            legalName: json["legalName"] as? String ?? name,
            taxId: json["taxId"] as? String ?? "",
            sectors: sectors.isEmpty ? ["PROYECTO"] : sectors,
            ownerId: DemoMode.meId,
            city: "Puebla, Pue."
        )
        extraClients.append(client)
        return reply(clientJSON(client))
    }

    // MARK: users/*

    private func routeUsers(method: String, parts: [String], json: DemoJSON) -> DemoReply {
        let sub = parts.count > 1 ? parts[1] : ""
        if sub == "orgchart" { return reply(fxOrgchart()) }
        if sub == "profile" {
            if method == "PATCH" {
                for (key, value) in json {
                    if let text = value as? String { profileFields[key] = text }
                }
                return reply(dj(["ok": true]))
            }
            return reply(fxProfileMe())
        }
        return empty()
    }
}

/// Rango `desde`/`hasta` de los KPIs (7 días si no vienen).
private enum ConsoleHelpersFallback {
    static func range(_ query: [String: String]) -> (desde: String, hasta: String) {
        if let desde = query["desde"], let hasta = query["hasta"] { return (desde, hasta) }
        let fallback = CoreExtrasFormato.rango(dias: 7)
        return (query["desde"] ?? fallback.desde, query["hasta"] ?? fallback.hasta)
    }
}
