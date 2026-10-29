import Foundation

/// Trayecto de una actividad (API `me/activities/:id/trayectos`, 29-10), espejo de
/// `TrayectoRules.kt` de Android con los mismos textos: «Iniciar trayecto» → llegar e
/// «Iniciar actividad» (la ida se cierra sola) → entregar en el sitio → «Regreso a la
/// oficina» → «Llegué». Cada tramo se mide aparte del reloj de la actividad y se califica
/// contra la ruta + 25 %. Reglas puras: la tarjeta es `ActivityTrayectoCard`.
enum TrayectoRules {
    static let ida = "IDA"
    static let regreso = "REGRESO"

    enum Accion: Equatable {
        case iniciarIda, llegue, regreso, ninguna
    }

    struct Estado: Equatable {
        let accion: Accion
        let titulo: String?
        let detalle: String?
        /// Tramos ya cerrados: «Ida · 18 min · en tiempo».
        let resumen: [String]

        /// Sin nada que hacer ni que contar: la tarjeta no se pinta.
        var vacio: Bool { accion == .ninguna && titulo == nil && resumen.isEmpty }
    }

    /// Ya tiene hora de llegada (Android `!endedAt.isNullOrBlank()`).
    static func terminado(_ tramo: ActivityTrayecto) -> Bool {
        !(tramo.endedAt ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// El último tramo sin cerrar: va en camino.
    static func abierto(_ tramos: [ActivityTrayecto]) -> ActivityTrayecto? {
        tramos.last { !terminado($0) }
    }

    /// Qué toca ahora.
    /// - iniciada: ya tiene hora real de inicio (o va «En Proceso»).
    /// - entregada: ya mandó su evidencia (Por Validar o cerrada con éxito): ahí se ofrece el regreso.
    /// - cancelada: cancelada o «No cumplida»: ya no se ofrece ningún tramo nuevo.
    /// - deOficina: trabajo de escritorio (`deOficina`): no se ofrece salir al sitio.
    /// El regreso solo se ofrece a quien registró la ida: si no salió, no hay de dónde regresar.
    static func estado(
        tramos: [ActivityTrayecto],
        iniciada: Bool,
        entregada: Bool,
        cancelada: Bool,
        deOficina: Bool = false
    ) -> Estado {
        let resumen = tramos.filter { terminado($0) }.map { resumenDe($0) }
        if let enCamino = abierto(tramos) {
            let esIda = enCamino.tipo == ida
            let reloj = ActivityDetailFormat.clock(enCamino.startedAt)
            let desde: String? = reloj == "—" ? nil : reloj
            let ruta: String? = minutosDeRuta(enCamino).map { "Ruta de \($0)" }
            let base = esIda ? "En camino al sitio" : "De regreso a la oficina"
            let paso = esIda ? "al llegar, inicia la actividad y la ida se cierra sola" : "toca «Llegué» al entrar"
            return Estado(
                accion: .llegue,
                titulo: base + (desde.map { " desde \($0)" } ?? ""),
                detalle: mayusculaInicial([ruta, paso].compactMap { $0 }.joined(separator: " · ")),
                resumen: resumen
            )
        }
        if cancelada { return Estado(accion: .ninguna, titulo: nil, detalle: nil, resumen: resumen) }
        let yaFue = tramos.contains { $0.tipo == ida }
        let yaRegreso = tramos.contains { $0.tipo == regreso }
        if !iniciada && !yaFue && !deOficina {
            return Estado(
                accion: .iniciarIda,
                titulo: "¿Vas al sitio?",
                detalle: "«Iniciar trayecto» mide el camino; se cierra solo al iniciar la actividad.",
                resumen: resumen
            )
        }
        if entregada && yaFue && !yaRegreso {
            return Estado(
                accion: .regreso,
                titulo: "¿Regresas a la oficina?",
                detalle: "Mide el regreso; toca «Llegué» al entrar. Al checar salida se cierra solo.",
                resumen: resumen
            )
        }
        return Estado(accion: .ninguna, titulo: nil, detalle: nil, resumen: resumen)
    }

    /// «Ida · 18 min · en tiempo» o «Regreso · 32 min · se pasó (ruta 21 min)».
    static func resumenDe(_ tramo: ActivityTrayecto) -> String {
        let nombre = tramo.tipo == regreso ? "Regreso" : "Ida"
        let duracion: String? = tramo.minutos.map { ActivityDetailFormat.minutes(max(1, $0)) }
        let calificacion: String?
        switch tramo.estado ?? "" {
        case "en_tiempo":
            calificacion = "en tiempo"
        case "excedido":
            if let ruta = minutosDeRuta(tramo) {
                calificacion = "se pasó (ruta \(ruta))"
            } else {
                calificacion = "se pasó"
            }
        default:
            calificacion = nil
        }
        let partes: [String?] = [nombre, duracion, calificacion]
        return partes.compactMap { $0 }.joined(separator: " · ")
    }

    /// «18 min» de lo que daba la ruta al salir; nil sin estimado.
    private static func minutosDeRuta(_ tramo: ActivityTrayecto) -> String? {
        guard let estimado = tramo.estimadoMin, estimado > 0 else { return nil }
        return ActivityDetailFormat.minutes(estimado)
    }

    /// Tipos de tarea de escritorio (catálogo del 28-10): ahí no se sale al sitio.
    private static let tareasDeOficina: Set<String> = [
        "Diseño, CAD y memoria técnica",
        "Configuración y soporte remoto",
        "Facturación y contabilidad",
        "Reporte / documentación",
    ]

    static func deOficina(coreKind: String?, ticketTypeCustom: String?) -> Bool {
        coreKind == "tarea" && tareasDeOficina.contains((ticketTypeCustom ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// Estatus que ya no admiten tramos nuevos.
    static func cancelada(_ estatus: String?) -> Bool {
        (estatus ?? "").range(of: "cancelada|no cumplida|incumplida", options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// Ya entregó en el sitio: evidencia enviada o actividad cerrada con éxito.
    static func entregada(_ estatus: String?, fotoSalida: Bool) -> Bool {
        fotoSalida
            || (estatus ?? "").range(of: "validar|finalizada|completada|aprobada", options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// Android `replaceFirstChar { it.uppercaseChar() }`.
    private static func mayusculaInicial(_ texto: String) -> String {
        guard let primera = texto.first else { return texto }
        return String(primera).uppercased() + texto.dropFirst()
    }
}
