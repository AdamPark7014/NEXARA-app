import Foundation

// La salida de la jornada y «Asignar con formato» de la demostración (Programa Velocidad Core, Ola 3).

extension DemoStore {
    // MARK: Salida de la jornada

    /// `GET attendance/salida/riesgo`: el reloj que corre y lo ya empezado que vence hoy.
    func fxRiesgoSalida(now: Date) -> DemoJSON {
        let hoy = DemoClock.day(now)
        let abiertas = openOrder.compactMap { activity($0) }.filter { !isClosed($0) }
        func fila(_ a: DemoActivity) -> DemoJSON {
            dj(["id": a.id, "folio": a.folio, "titulo": a.titulo])
        }
        var corriendo: [DemoJSON] = []
        var porCerrar: [DemoJSON] = []
        for a in abiertas {
            if (sesionJSON(a)["enCurso"] as? Bool) == true {
                corriendo.append(fila(a))
                if DemoClock.day(at(a.maxMin)) == hoy { porCerrar.append(fila(a)) }
            }
        }
        return dj(["corriendo": corriendo, "porCerrar": porCerrar])
    }

    /// `POST attendance/salida/deshacer`: dentro de 10 minutos la jornada vuelve a quedar abierta.
    func deshacerSalidaDemo(now: Date) -> DemoRespuesta {
        guard let salida = myExit else {
            return (400, dj(["statusCode": 400, "message": "No hay una salida de hoy que deshacer"]))
        }
        guard now.timeIntervalSince(salida) <= 10 * 60 else {
            return (400, dj(["statusCode": 400, "message": "Ya pasaron los 10 minutos: pídele a tu jefe que la deshaga"]))
        }
        myExit = nil
        myExitPhoto = ""
        return (200, dj([
            "message": "Salida deshecha",
            "noCumplidasRegresadas": [String](),
            "relojesReabiertos": 1,
        ]))
    }

    // MARK: Personas

    /// `GET users/assignable`.
    func fxUsuariosAsignables() -> [DemoJSON] {
        DemoData.people.map { persona in
            dj(["id": persona.id, "nombre": persona.nombre, "email": persona.email])
        }
    }

    // MARK: Formatos

    private func renglonDemo(
        _ titulo: String,
        kind: String,
        base: Int,
        porUnidad: Int,
        indicaciones: String,
        puntos: [DemoJSON] = [],
        herramientas: [DemoJSON] = []
    ) -> DemoJSON {
        dj([
            "titulo": titulo,
            "coreKind": kind,
            "minutosBase": base,
            "minutosPorUnidad": porUnidad,
            "fotos": 2,
            "indicaciones": indicaciones,
            "puntos": puntos,
            "herramientas": herramientas,
        ])
    }

    /// `GET formatos-actividad`: dos recetas de muestra, una con cantidad y otra sin ella.
    func fxFormatos() -> [DemoJSON] {
        let camaras = dj([
            "id": 1,
            "nombre": "Instalación de cámaras",
            "descripcion": "De la visita a las pruebas finales.",
            "usos": 12,
            "receta": dj([
                "unidad": "Cámaras",
                "cantidadPorOmision": 4,
                "renglones": [
                    renglonDemo(
                        "Levantamiento en sitio",
                        kind: "tarea",
                        base: 45,
                        porUnidad: 0,
                        indicaciones: "Recorre el sitio y marca dónde va cada cámara."
                    ),
                    renglonDemo(
                        "Instalación y cableado",
                        kind: "servicio",
                        base: 30,
                        porUnidad: 45,
                        indicaciones: "Fija cada cámara y deja el cable etiquetado.",
                        puntos: [dj(["nombre": "Rack", "momentos": ["DESPUES"]])],
                        herramientas: [dj(["descripcion": "Escalera de tijera", "cantidad": 1])]
                    ),
                    renglonDemo(
                        "Configuración y pruebas",
                        kind: "tarea",
                        base: 30,
                        porUnidad: 10,
                        indicaciones: "Da de alta cada cámara en el grabador y revisa la imagen."
                    ),
                ],
            ]),
        ])
        let mantenimiento = dj([
            "id": 2,
            "nombre": "Mantenimiento preventivo",
            "descripcion": "Visita de rutina.",
            "usos": 7,
            "receta": dj([
                "cantidadPorOmision": 1,
                "renglones": [
                    renglonDemo(
                        "Revisión de equipos",
                        kind: "servicio",
                        base: 90,
                        porUnidad: 0,
                        indicaciones: "Limpia, revisa conexiones y anota lo que haya que cambiar."
                    ),
                    renglonDemo(
                        "Reporte al cliente",
                        kind: "tarea",
                        base: 30,
                        porUnidad: 0,
                        indicaciones: "Manda el resumen de la visita."
                    ),
                ],
            ]),
        ])
        return [camaras, mantenimiento]
    }

    func routeFormatos(method: String, parts: [String], json: DemoJSON, now: Date) -> DemoRespuesta {
        if method == "GET" { return (200, fxFormatos()) }
        if method == "POST", parts.count >= 3, parts[2] == "aplicar" {
            return aplicarFormatoDemo(json: json)
        }
        return (200, DemoJSON())
    }

    /// `POST formatos-actividad/:id/aplicar`: una actividad por renglón. La `clave` evita duplicar.
    private func aplicarFormatoDemo(json: DemoJSON) -> DemoRespuesta {
        let clave = json["clave"] as? String ?? ""
        if !clave.isEmpty, let previa = formatoAplicaciones[clave] { return (200, previa) }
        let renglones = json["renglones"] as? [DemoJSON] ?? []
        let responsable = json["responsableId"] as? Int ?? DemoMode.meId
        // A las 10:00 del día elegido, la entrada de la oficina.
        var inicio = 30
        if let dia = json["fecha"] as? String, let cero = DemoClock.startOfDay(dia) {
            inicio = Int(cero.timeIntervalSince(epoch) / 60) + 600
        }
        var actividades: [DemoJSON] = []
        for renglon in renglones {
            nextActivityId += 1
            let id = nextActivityId
            let minutos = renglon["minutos"] as? Int ?? 60
            let titulo = renglon["titulo"] as? String ?? "Actividad nueva"
            let folio = "AN-0\(160 + extraActivities.count)"
            extraActivities.append(DemoActivity(
                id: id,
                folio: folio,
                titulo: titulo,
                kind: renglon["coreKind"] as? String ?? "tarea",
                clientServiceId: json["clientId"] as? Int ?? 0,
                projectId: nil,
                ownerId: responsable,
                creatorId: DemoMode.meId,
                prioridad: "media",
                estatus: "Asignada",
                startMin: inicio,
                maxMin: inicio + max(minutos, 60),
                finMin: nil,
                avance: 0,
                evidencia: "",
                indicaciones: renglon["indicaciones"] as? String ?? "",
                estimadoMin: minutos,
                descripcion: ""
            ))
            if responsable == DemoMode.meId { openOrder.append(id) }
            actividades.append(dj(["id": id, "anNumber": folio, "titulo": titulo]))
        }
        let respuesta = dj(["actividades": actividades, "fallidas": [DemoJSON]()])
        if !clave.isEmpty { formatoAplicaciones[clave] = respuesta }
        return (200, respuesta)
    }
}
