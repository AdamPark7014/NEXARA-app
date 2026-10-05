import Foundation

// Herramientas de la sesión ficticia: «Mi kit» (`tool-requests/kits/my`), «Mis
// préstamos» (`tool-requests/my-requests`) y pedir más plazo
// (`POST tool-requests/:id/renewal-request`). Las formas son las de
// `HerramientasRepository.swift` (las del API: `getMyKit` y `findByUser`).
//
// Kit creíble de una directora de operaciones que también sale a obra: cinco
// piezas, una con un parte de daño sin dictaminar y otra con la revisión vencida,
// para que se vea la tarjeta «Tu kit necesita atención». Siete préstamos que cubren
// todos los estados (por aprobar, lista para recoger con su código, dos en uso —uno
// vencido— y tres de historial), así que también aparece el buscador.
//
// Los días de devolución se escriben como el día de México + `T12:00:00.000Z`; los
// instantes (asignación, partes, caducidad del código) son relativos a la entrada al
// demo, como el resto de los datos.

/// Un opcional para el JSON del demo: el valor o `null`.
private func herrNulo(_ valor: Any?) -> Any {
    valor ?? NSNull()
}

extension DemoStore {

    /// `AAAA-MM-DDT12:00:00.000Z` del día de México que cae `dias` después de hoy.
    private func diaDemo(_ dias: Int) -> String {
        HerramientasReglas.fechaParaApi(HerramientasReglas.Dia.hoy(epoch).sumando(dias: dias))
    }

    /// Instante `dias` días (y `horas` horas) respecto a la entrada al demo.
    private func haceDias(_ dias: Int, horas: Int = 0) -> String {
        iso(-(dias * 24 * 60) - horas * 60)
    }

    // MARK: Mi kit

    private func piezaDemo(
        id: Int, nombre: String, modelo: String, codigo: String, serie: String?
    ) -> DemoJSON {
        dj([
            "id": id, "toolName": nombre, "model": modelo, "codigoInterno": codigo,
            "barcode": codigo, "serialNumber": herrNulo(serie), "status": "ASSIGNED",
        ])
    }

    private func asignacionDemo(
        id: Int,
        pieza: DemoJSON,
        asignadaHaceDias: Int,
        revisionCada: Int?,
        proximaRevision: Int?,
        notas: String? = nil,
        partes: [DemoJSON] = []
    ) -> DemoJSON {
        dj([
            "id": id,
            "inventoryItemId": herrNulo(pieza["id"]),
            "userId": DemoMode.meId,
            "assignmentType": "KIT",
            "assignedAt": haceDias(asignadaHaceDias),
            "dueReturnDate": NSNull(),
            "returnedAt": NSNull(),
            "isActive": true,
            "replacementCount": 0,
            "notes": herrNulo(notas),
            "inspeccionCadaDias": herrNulo(revisionCada),
            "proximaInspeccion": herrNulo(proximaRevision.map { diaDemo($0) }),
            "inventoryItem": pieza,
            "events": partes,
        ])
    }

    /// `GET tool-requests/kits/my`: solo lo activo, de lo más reciente a lo más viejo.
    func fxMiKit() -> [DemoJSON] {
        let kit: [DemoJSON] = [
            asignacionDemo(
                id: 7102,
                pieza: piezaDemo(id: 5502, nombre: "Pinza amperimétrica", modelo: "Fluke 323",
                                 codigo: "PIN-00233", serie: "FK323-55810"),
                asignadaHaceDias: 150, revisionCada: nil, proximaRevision: nil,
                partes: [
                    dj([
                        "id": 9301,
                        "description": "La pantalla parpadea al medir corriente alterna arriba de 200 A. "
                            + "Se notó en el tablero general de Hotel Casa Azul.",
                        "resolution": "PENDING",
                        "reportedAt": haceDias(3, horas: 2),
                        "resolvedAt": NSNull(),
                    ]),
                ]
            ),
            asignacionDemo(
                id: 7105,
                pieza: piezaDemo(id: 5505, nombre: "Arnés de seguridad de cuerpo completo",
                                 modelo: "3M DBI-SALA Delta", codigo: "ARN-00051", serie: "DS-1109872"),
                asignadaHaceDias: 120, revisionCada: 30, proximaRevision: 2,
                notas: "Con línea de vida de 1.8 m y amortiguador."
            ),
            asignacionDemo(
                id: 7104,
                pieza: piezaDemo(id: 5504, nombre: "Ponchadora RJ45", modelo: "Klein Tools VDV226-110",
                                 codigo: "PON-00092", serie: "VDV226-3381"),
                asignadaHaceDias: 90, revisionCada: nil, proximaRevision: nil,
                partes: [
                    dj([
                        "id": 9288,
                        "description": "Se atoraba el trinquete al cerrar.",
                        "resolution": "EQUIPMENT_FAILURE",
                        "reportedAt": haceDias(60),
                        "resolvedAt": haceDias(55),
                    ]),
                ]
            ),
            asignacionDemo(
                id: 7101,
                pieza: piezaDemo(id: 5501, nombre: "Multímetro digital", modelo: "Fluke 117",
                                 codigo: "MUL-00418", serie: "4419B0217"),
                asignadaHaceDias: 230, revisionCada: 90, proximaRevision: 12
            ),
            asignacionDemo(
                id: 7103,
                pieza: piezaDemo(id: 5503, nombre: "Juego de desarmadores aislados 1000 V",
                                 modelo: "Klein Tools 33527", codigo: "DES-00107", serie: nil),
                asignadaHaceDias: 400, revisionCada: 180, proximaRevision: -5,
                notas: "Juego completo de 7 piezas en estuche."
            ),
        ]
        // Mismo orden que `getMyKit` (`assignedAt desc`); la pantalla vuelve a ordenar.
        return kit.sorted { ($0["assignedAt"] as? String ?? "") > ($1["assignedAt"] as? String ?? "") }
    }

    // MARK: Mis préstamos

    private struct PrestamoDemo {
        let id: Int
        let nombre: String
        let modelo: String
        let serie: String
        let motivo: String
        let estado: String
        /// Días (respecto a hoy) de la fecha de devolución esperada.
        let devolver: Int
        let pedidoHaceDias: Int
        var aprobadoHaceHoras: Int? = nil
        var entregadoHaceDias: Int? = nil
        var devueltoHaceDias: Int? = nil
        var prorrogas: Int = 0
        var codigo: String? = nil
        var dano: String? = nil
        var notasAdmin: String? = nil
    }

    private static let prestamosDemo: [PrestamoDemo] = [
        PrestamoDemo(
            id: 6201, nombre: "Cámara termográfica", modelo: "FLIR E8-XT", serie: "FLIR-E8-7731",
            motivo: "Revisión de tableros en Colegio Montebello antes del mantenimiento preventivo.",
            estado: "PENDING", devolver: 8, pedidoHaceDias: 0
        ),
        PrestamoDemo(
            id: 6202, nombre: "Fusionadora de fibra óptica", modelo: "Fujikura 41S", serie: "FJ41S-0093",
            motivo: "Empalmes del enlace de fibra entre edificios de Corporativo Atlixco.",
            estado: "APPROVED", devolver: 10, pedidoHaceDias: 2, aprobadoHaceHoras: 20, codigo: "KQ7M3H"
        ),
        PrestamoDemo(
            id: 6207, nombre: "Generador portátil", modelo: "Honda EU2200i", serie: "EAMJ-1032117",
            motivo: "Respaldo de energía para la puesta en marcha del CCTV en obra.",
            estado: "REJECTED", devolver: 3, pedidoHaceDias: 6,
            notasAdmin: "No hay generador libre esta semana; pídelo de nuevo a partir del lunes."
        ),
        PrestamoDemo(
            id: 6203, nombre: "Escalera de extensión 24 ft", modelo: "Werner D1224-2", serie: "WE24-1180",
            motivo: "Instalación de cámaras en la fachada de Hotel Casa Azul.",
            estado: "IN_USE", devolver: -2, pedidoHaceDias: 12, aprobadoHaceHoras: 11 * 24,
            entregadoHaceDias: 10, codigo: "DMR4TQ"
        ),
        PrestamoDemo(
            id: 6204, nombre: "Rotomartillo SDS Plus", modelo: "Bosch GBH 2-28 L", serie: "BH-55120",
            motivo: "Anclajes para racks en el site de Corporativo Atlixco.",
            estado: "IN_USE", devolver: 2, pedidoHaceDias: 20, aprobadoHaceHoras: 19 * 24 + 4,
            entregadoHaceDias: 19, prorrogas: 1, codigo: "HX3PWA"
        ),
        PrestamoDemo(
            id: 6205, nombre: "Probador de cableado", modelo: "Fluke MicroScanner2", serie: "MS2-20931",
            motivo: "Certificación de nodos de red en Colegio Montebello.",
            estado: "RETURNED", devolver: -21, pedidoHaceDias: 35, aprobadoHaceHoras: 34 * 24,
            entregadoHaceDias: 33, devueltoHaceDias: 21
        ),
        PrestamoDemo(
            id: 6206, nombre: "Pistola de calor", modelo: "DeWalt D26960", serie: "DW26960-4410",
            motivo: "Termocontráctil en el cableado del acceso vehicular.",
            estado: "DAMAGED", devolver: -42, pedidoHaceDias: 50, aprobadoHaceHoras: 49 * 24,
            entregadoHaceDias: 48, devueltoHaceDias: 40,
            dano: "Se devolvió con la boquilla doblada; queda en reparación."
        ),
    ]

    private func prestamoJSON(_ p: PrestamoDemo) -> DemoJSON {
        let almacen = DemoData.person(109)
        let aprobado = p.aprobadoHaceHoras.map { iso(-$0 * 60) }
        // Quien decidió: el almacén aprueba y también rechaza.
        let conAprobador = p.aprobadoHaceHoras != nil || p.estado == "REJECTED"
        let aprobador = dj(["id": almacen.id, "nombre": almacen.nombre, "email": almacen.email])
        return dj([
            "id": p.id,
            "usuarioId": DemoMode.meId,
            "toolName": p.nombre,
            "model": p.modelo,
            "serialNumber": p.serie,
            "reason": p.motivo,
            "status": p.estado,
            "startDate": diaDemo(-p.pedidoHaceDias),
            "expectedReturnDate": diaDemo(p.devolver),
            "requestDate": haceDias(p.pedidoHaceDias, horas: 2),
            "approvalDate": herrNulo(aprobado),
            "deliveryDate": herrNulo(p.entregadoHaceDias.map { haceDias($0) }),
            "returnDate": herrNulo(p.devueltoHaceDias.map { haceDias($0) }),
            "damageDescription": herrNulo(p.dano),
            "adminNotes": herrNulo(p.notasAdmin),
            "renewalCount": p.prorrogas,
            "activityId": NSNull(),
            "pickupCode": herrNulo(p.codigo),
            // El código sirve 48 h desde que se aprueba (`PICKUP_VIGENCIA_HORAS`).
            "pickupExpiresAt": herrNulo(p.aprobadoHaceHoras.map { iso((48 - $0) * 60) }),
            "pickedUpAt": herrNulo(p.entregadoHaceDias.map { haceDias($0) }),
            "approver": herrNulo(conAprobador ? aprobador : nil),
        ])
    }

    /// `GET tool-requests/my-requests`: de la solicitud más reciente a la más vieja.
    func fxMisPrestamos() -> [DemoJSON] {
        DemoStore.prestamosDemo
            .sorted { $0.pedidoHaceDias < $1.pedidoHaceDias }
            .map { prestamoJSON($0) }
    }

    // MARK: Ruteo

    /// `kits/my`, `my-requests` y `:id/renewal-request`. `nil` = no es de aquí (lo
    /// atiende el escáner, `routeHerramientas`).
    func routeMisHerramientas(method: String, parts: [String], json: DemoJSON) -> DemoRespuesta? {
        let sub = parts.count > 1 ? parts[1] : ""
        switch (method, sub) {
        case ("GET", "kits") where parts.count >= 3 && parts[2] == "my":
            return (200, fxMiKit())
        case ("GET", "my-requests"):
            return (200, fxMisPrestamos())
        case ("POST", _) where parts.count >= 3 && parts[2] == "renewal-request":
            guard let id = Int(sub), let p = DemoStore.prestamosDemo.first(where: { $0.id == id }) else {
                return (403, dj(["statusCode": 403, "message": "No tienes permiso para renovar esta solicitud"]))
            }
            let nueva = (json["newReturnDate"] as? String) ?? diaDemo(p.devolver + 7)
            return (201, dj([
                "id": 8800 + id % 100,
                "toolRequestId": id,
                "previousReturnDate": diaDemo(p.devolver),
                "newReturnDate": nueva,
                "renewalReason": herrNulo(json["renewalReason"] as? String),
                "status": "PENDING",
            ]))
        default:
            return nil
        }
    }
}
