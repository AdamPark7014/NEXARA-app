import Foundation

// Asistencias, hora de comida y GPS de jornada de la demostración.

extension DemoStore {
    static let deviceInfo = "Móvil · iPhone · NEXARA App"

    // MARK: Checadas

    /// Una checada tal como la manda `GET attendance/history` / `attendance/hierarchy/range`.
    func punchJSON(type: String, time: Date, photo: String, index: Int) -> DemoJSON {
        let coords = DemoImages.coords
        let lat = coords.latitude + Double(index % 7) * 0.0006
        let lng = coords.longitude - Double(index % 5) * 0.0005
        var json = dj([
            "type": type,
            "timestamp": DemoClock.iso(time),
            "deviceInfo": DemoStore.deviceInfo,
        ])
        if !photo.isEmpty { json["photoUrl"] = photo }
        if type == "entrada" {
            json["entryLatitude"] = lat
            json["entryLongitude"] = lng
        } else {
            json["exitLatitude"] = lat
            json["exitLongitude"] = lng
        }
        return json
    }

    /// Entrada y salida de un día que ya pasó (lunes a viernes, con alguna falta suelta).
    /// Jornada normal de NEXARA: entrada 10:00 y salida 18:00 (hay quien llega antes o se va después).
    func historicPunches(day: String, personId: Int) -> (entry: Date, exit: Date)? {
        guard let start = DemoClock.startOfDay(day) else { return nil }
        let weekday = Calendar.current.component(.weekday, from: start)
        if weekday == 1 || weekday == 7 { return nil }
        let dayNumber = Int(start.timeIntervalSince1970 / 86400)
        if (dayNumber + personId) % 11 == 0 { return nil }
        let entryMinutes = 9 * 60 + 45 + (personId * 3 + dayNumber) % 25
        let exitMinutes = 18 * 60 + (personId * 5 + dayNumber) % 35
        return (
            start.addingTimeInterval(TimeInterval(entryMinutes) * 60),
            start.addingTimeInterval(TimeInterval(exitMinutes) * 60)
        )
    }

    // MARK: Mi jornada

    func fxAttendanceCurrent(now: Date) -> DemoJSON {
        guard let entry = myEntry else { return [:] }
        var closedMinutes = 0
        if let closed = myExit { closedMinutes = DemoClock.minutes(from: entry, to: closed) }
        var json = dj([
            "id": 1,
            "userId": DemoMode.meId,
            "date": DemoClock.day(entry),
            "checkIn": DemoClock.iso(entry),
            "isOpen": myExit == nil,
            "lastEntryAt": DemoClock.iso(entry),
            "totalMinutes": closedMinutes,
        ])
        if let exit = myExit { json["checkOut"] = DemoClock.iso(exit) }
        return json
    }

    /// `GET attendance/day`: la fila del día o `{}` si nadie checó.
    func fxAttendanceDay(date: String, now: Date) -> DemoJSON {
        if date == DemoClock.day(now), let entry = myEntry {
            var closedMinutes = 0
            if let closed = myExit { closedMinutes = DemoClock.minutes(from: entry, to: closed) }
            var json = dj([
                "id": 1,
                "date": date,
                "checkIn": DemoClock.iso(entry),
                "isOpen": myExit == nil,
                "totalMinutes": closedMinutes,
            ])
            if let exit = myExit { json["checkOut"] = DemoClock.iso(exit) }
            return json
        }
        // Hoy sin checar (o un día que no llega) no tiene jornada: antes caía en la
        // del historial y salía «Sin entrada registrada» con 8 h trabajadas.
        if date >= DemoClock.day(now) { return [:] }
        if let pair = historicPunches(day: date, personId: DemoMode.meId) {
            return dj([
                "id": 2,
                "date": date,
                "checkIn": DemoClock.iso(pair.entry),
                "checkOut": DemoClock.iso(pair.exit),
                "isOpen": false,
                "totalMinutes": DemoClock.minutes(from: pair.entry, to: pair.exit),
            ])
        }
        return [:]
    }

    func fxAttendanceHistory(date: String, now: Date) -> [DemoJSON] {
        if date == DemoClock.day(now) {
            var punches: [DemoJSON] = []
            if let entry = myEntry {
                punches.append(punchJSON(type: "entrada", time: entry, photo: myEntryPhoto, index: 1))
            }
            if let exit = myExit {
                punches.append(punchJSON(type: "salida", time: exit, photo: myExitPhoto, index: 2))
            }
            return punches
        }
        guard date < DemoClock.day(now),
              let pair = historicPunches(day: date, personId: DemoMode.meId) else { return [] }
        return [
            punchJSON(type: "entrada", time: pair.entry, photo: "", index: 1),
            punchJSON(type: "salida", time: pair.exit, photo: "", index: 2),
        ]
    }

    // MARK: Equipo del día

    func fxHierarchyRange(from: String, to: String, now: Date) -> DemoJSON {
        let today = DemoClock.day(now)
        var users: [DemoJSON] = []
        var totalAll = 0
        for p in DemoData.people {
            var punches: [DemoJSON] = []
            var days: [DemoJSON] = []
            var minutes = 0
            if from == today {
                if let entry = clockIn(for: p.id) {
                    let entryPhoto = p.id == DemoMode.meId ? myEntryPhoto : DemoImages.dataURL(.selfie)
                    punches.append(punchJSON(type: "entrada", time: entry, photo: entryPhoto, index: p.id))
                    let exit = clockOut(for: p.id)
                    if let exit {
                        let exitPhoto = p.id == DemoMode.meId ? myExitPhoto : ""
                        punches.append(punchJSON(type: "salida", time: exit, photo: exitPhoto, index: p.id + 3))
                    }
                    minutes = DemoClock.minutes(from: entry, to: exit ?? now)
                    days = [dj(["date": today, "totalMinutes": minutes, "isOpen": exit == nil])]
                }
            } else if from < today, let pair = historicPunches(day: from, personId: p.id) {
                punches.append(punchJSON(type: "entrada", time: pair.entry, photo: "", index: p.id))
                punches.append(punchJSON(type: "salida", time: pair.exit, photo: "", index: p.id + 3))
                minutes = DemoClock.minutes(from: pair.entry, to: pair.exit)
                days = [dj(["date": from, "totalMinutes": minutes, "isOpen": false])]
            }
            totalAll += minutes
            users.append(dj([
                "userId": p.id,
                "userName": p.nombre,
                "email": p.email,
                "department": p.departamento,
                "roleName": p.puesto,
                "totalMinutes": minutes,
                "days": days,
                "attendances": punches,
                "justificaciones": [DemoJSON](),
            ]))
        }
        return dj([
            "rangeStart": from,
            "rangeEnd": to,
            "totalUsers": users.count,
            "totalMinutesAll": totalAll,
            "avgMinutesPerUser": users.isEmpty ? 0 : totalAll / users.count,
            "users": users,
        ])
    }

    /// `GET attendance/range` (sin jerarquía): solo se usa para las faltas justificadas propias.
    func fxAttendanceRange(from: String, to: String) -> DemoJSON {
        dj([
            "rangeStart": from,
            "rangeEnd": to,
            "totalUsers": 1,
            "totalMinutesAll": 0,
            "users": [DemoJSON](),
            "justificaciones": [DemoJSON](),
        ])
    }

    /// `GET attendance/hybrid`: mi checador de la app y mis pases en puerta.
    func fxAttendanceHybrid(now: Date) -> DemoJSON {
        var erp = dj(["checkIn": "", "checkOut": ""])
        var acs = dj(["firstAt": "", "passes": 0, "firstDoor": ""])
        if let entry = myEntry {
            erp["checkIn"] = DemoClock.iso(entry)
            if let exit = myExit { erp["checkOut"] = DemoClock.iso(exit) }
            acs["firstAt"] = DemoClock.iso(entry.addingTimeInterval(-240))
            acs["passes"] = myExit == nil ? 2 : 3
            acs["firstDoor"] = "Acceso principal"
        }
        return dj(["items": [dj(["erp": erp, "acs": acs])]])
    }

    // MARK: Hora de comida

    func lunchRecordJSON(
        id: Int,
        userId: Int,
        out: Date,
        back: Date?,
        outPhoto: String,
        backPhoto: String,
        late: Bool,
        revision: String?,
        reason: String?
    ) -> DemoJSON {
        var json = dj([
            "id": id,
            "userId": userId,
            "status": back == nil ? "EN_COMIDA" : "COMPLETADA",
            "checkinTime": DemoClock.iso(out),
            "isCheckinLate": false,
            "isCheckoutLate": late,
        ])
        if !outPhoto.isEmpty { json["checkinPhotoUrl"] = outPhoto }
        if let back {
            json["checkoutTime"] = DemoClock.iso(back)
            json["minutos"] = DemoClock.minutes(from: out, to: back)
            if !backPhoto.isEmpty { json["checkoutPhotoUrl"] = backPhoto }
        }
        if let reason { json["checkoutJustificacion"] = reason }
        if let revision { json["revisionEstado"] = revision }
        return json
    }

    func fxLunchMyDay(now: Date) -> DemoJSON {
        var next = "salida"
        if lunchOut != nil { next = lunchIn == nil ? "regreso" : "listo" }
        var json = dj([
            "debeRegistrar": true,
            "ahora": DemoClock.iso(now),
            "ventana": dj([
                "inicio": "15:00",
                "fin": "16:00",
                "regresoLimite": "16:05",
                "texto": "3:00 a 4:00 p.m.",
            ]),
            "salidaADestiempo": false,
            "regresoADestiempo": false,
            "siguiente": next,
        ])
        if let out = lunchOut {
            json["registro"] = lunchRecordJSON(
                id: 88001, userId: DemoMode.meId, out: out, back: lunchIn,
                outPhoto: lunchOutPhoto, backPhoto: lunchInPhoto, late: false, revision: nil, reason: nil
            )
        }
        return json
    }

    /// Estado de revisión de la comida a destiempo de Javier (la única pendiente del guion).
    func javierLunchReview() -> String {
        lunchReviews[88104] ?? "PENDIENTE"
    }

    func fxLunchTeam(date: String, now: Date) -> DemoJSON {
        var rows: [DemoJSON] = []
        var registered = 0
        var eating = 0
        var late = 0
        var pending = 0
        let isToday = date == DemoClock.day(now)
        for p in DemoData.people {
            var row = dj([
                "userId": p.id,
                "nombre": p.nombre,
                "puesto": p.puesto,
                "puedoRevisar": p.id != DemoMode.meId,
            ])
            var record: DemoJSON?
            if isToday {
                switch p.id {
                case DemoMode.meId:
                    if let out = lunchOut {
                        record = lunchRecordJSON(
                            id: 88001, userId: p.id, out: out, back: lunchIn,
                            outPhoto: lunchOutPhoto, backPhoto: lunchInPhoto, late: false, revision: nil, reason: nil
                        )
                    }
                case 101:
                    record = lunchRecordJSON(
                        id: 88101, userId: p.id, out: at(-12), back: nil,
                        outPhoto: DemoImages.dataURL(.selfie), backPhoto: "", late: false, revision: nil, reason: nil
                    )
                case 102:
                    record = lunchRecordJSON(
                        id: 88102, userId: p.id, out: at(-75), back: at(-15),
                        outPhoto: DemoImages.dataURL(.selfie), backPhoto: DemoImages.dataURL(.selfie),
                        late: false, revision: nil, reason: nil
                    )
                case 104:
                    record = lunchRecordJSON(
                        id: 88104, userId: p.id, out: at(-110), back: at(-25),
                        outPhoto: "", backPhoto: "", late: true, revision: javierLunchReview(),
                        reason: "Esperé al proveedor con el material del rack."
                    )
                default:
                    record = nil
                }
            }
            if let record {
                row["registro"] = record
                registered += 1
                if record["checkoutTime"] == nil { eating += 1 }
                if (record["isCheckoutLate"] as? Bool) == true { late += 1 }
                if (record["revisionEstado"] as? String) == "PENDIENTE" { pending += 1 }
            }
            rows.append(row)
        }
        return dj([
            "fecha": "\(date)T00:00:00.000Z",
            "alcance": "todo",
            "filas": rows,
            "resumen": dj([
                "total": rows.count,
                "registraron": registered,
                "enComida": eating,
                "aDestiempo": late,
                "pendientes": pending,
            ]),
        ])
    }

    // MARK: GPS de jornada

    func fxGpsMe() -> DemoJSON {
        dj(["consent": gpsConsent, "location": NSNull()])
    }

    func fxGpsTeam(now: Date) -> [DemoJSON] {
        let coords = DemoImages.coords
        var rows: [DemoJSON] = []
        for (index, id) in [101, 102, 104, 105, 108].enumerated() {
            let p = DemoData.person(id)
            rows.append(dj([
                "id": 500 + index,
                "usuarioId": id,
                "usuario": dj([
                    "nombre": p.nombre,
                    "role": dj(["nombre": p.puesto]),
                    "department": dj(["nombre": p.departamento]),
                ]),
                "latitud": coords.latitude + Double(index) * 0.004 - 0.006,
                "longitud": coords.longitude - Double(index) * 0.003 + 0.004,
                "velocidadKmh": index == 2 ? 28.0 : 0.0,
                "estaActivo": true,
                "ultimaActualizacion": DemoClock.iso(now.addingTimeInterval(-TimeInterval(60 + index * 90))),
            ]))
        }
        return rows
    }

    /// Recorrido de hoy: solo existe si ya checaste entrada.
    func fxGpsTrajectory(date: String, now: Date) -> [DemoJSON] {
        guard date == DemoClock.day(now), let entry = myEntry else { return [] }
        let end = myExit ?? now
        let coords = DemoImages.coords
        let path: [(Double, Double)] = [
            (0.0000, 0.0000), (0.0021, 0.0034), (0.0048, 0.0050), (0.0067, 0.0091), (0.0040, 0.0122), (0.0012, 0.0080),
        ]
        var points: [DemoJSON] = []
        let span = max(end.timeIntervalSince(entry), 60)
        for (index, offset) in path.enumerated() {
            let when = entry.addingTimeInterval(span * Double(index) / Double(path.count - 1))
            points.append(dj([
                "id": 700 + index,
                "latitud": coords.latitude + offset.0,
                "longitud": coords.longitude + offset.1,
                "velocidadKmh": index % 2 == 0 ? 0.0 : 24.0,
                "ultimaActualizacion": DemoClock.iso(when),
            ]))
        }
        return points
    }
}
