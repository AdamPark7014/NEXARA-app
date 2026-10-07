import UIKit

// «Archivos de evidencia» de la sesión ficticia: `activities/:id/adjuntos` (lista,
// adjuntar por multipart, quitar) y `…/:adjuntoId/archivo` con bytes de verdad, para
// que Vista Rápida abra el Excel, el Word y el PDF de ejemplo igual que en producción.
// La forma es la del `AdjuntoDto` del API (`ActivityAdjuntosRepository`).
//
// La comercial del demo es AN-0155 (Presentación de propuesta · Hotel Casa Azul): trae una
// propuesta en Excel, la minuta en Word y el PDF que mandó el cliente. Lo que se adjunte
// durante el demo se guarda en memoria y se puede abrir y quitar.

/// Lo que el usuario adjunta o quita durante el demo. Vive fuera de `DemoStore` para no
/// tocar su `seed()`: se vuelve a sembrar cuando cambia el epoch (cada entrada al demo) y
/// solo se usa con `DemoStore.lock` tomado.
private final class AdjDemoEstado {
    static let shared = AdjDemoEstado()
    var epoch: Date?
    /// Por actividad, lo más reciente primero.
    var listas: [Int: [DemoJSON]] = [:]
    var bytes: [Int: Data] = [:]
    var siguiente = 9600
}

extension DemoStore {
    /// La actividad comercial sembrada con archivos.
    static let actividadComercialConAdjuntos = 5155

    /// `activities/:id/adjuntos[/:adjuntoId[/archivo|/vista-previa]]`.
    func routeAdjuntos(method: String, activityId: Int, parts: [String], body: Data?, now: Date) -> DemoReply {
        adjAsegurarEstado()
        let estado = AdjDemoEstado.shared
        let adjuntoId = parts.count > 3 ? Int(parts[3]) : nil
        let accion = parts.count > 4 ? parts[4] : ""

        switch (method, adjuntoId, accion) {
        case ("GET", nil, _):
            return adjResponder(estado.listas[activityId] ?? [])
        case ("POST", nil, _):
            return adjAgregar(activityId: activityId, body: body, now: now)
        case ("DELETE", let id?, _):
            var lista = estado.listas[activityId] ?? []
            guard lista.contains(where: { ($0["id"] as? Int) == id }) else {
                return adjFallo(404, "Archivo no encontrado")
            }
            lista.removeAll { ($0["id"] as? Int) == id }
            estado.listas[activityId] = lista
            estado.bytes[id] = nil
            return adjResponder(dj(["ok": true]))
        case ("GET", let id?, "archivo"):
            guard let datos = estado.bytes[id] else { return adjFallo(404, "Archivo no encontrado") }
            return DemoReply(status: 200, data: datos)
        case ("GET", _, "vista-previa"):
            // El teléfono no la usa (Vista Rápida abre Excel y Word).
            return adjFallo(404, "Este archivo no tiene vista previa")
        default:
            return adjResponder(DemoJSON())
        }
    }

    // MARK: Estado

    private func adjAsegurarEstado() {
        let estado = AdjDemoEstado.shared
        guard estado.epoch != epoch else { return }
        estado.epoch = epoch
        estado.listas = [:]
        estado.bytes = [:]
        estado.siguiente = 9600

        let actividad = DemoStore.actividadComercialConAdjuntos
        let semillas: [(id: Int, nombre: String, datos: Data, autor: Int, minutos: Int)] = [
            (9501, "Propuesta póliza anual Hotel Casa Azul.xlsx", adjExcelDePropuesta(), 101, -45),
            (9502, "Minuta de la junta con gerencia.docx", adjWordDeMinuta(), DemoMode.meId, -(24 * 60) - 150),
            (9503, "Requerimientos del cliente.pdf", adjPdfDeRequerimientos(), 101, -(3 * 24 * 60) - 200),
        ]
        var lista: [DemoJSON] = []
        for semilla in semillas {
            estado.bytes[semilla.id] = semilla.datos
            lista.append(adjDto(
                id: semilla.id,
                activityId: actividad,
                nombre: semilla.nombre,
                tamano: semilla.datos.count,
                autor: semilla.autor,
                creado: at(semilla.minutos)
            ))
        }
        estado.listas[actividad] = lista
    }

    private func adjDto(id: Int, activityId: Int, nombre: String, tamano: Int, autor: Int, creado: Date) -> DemoJSON {
        let persona = DemoData.person(autor)
        let tipo = adjTipo(nombre)
        let ext = ActivityAdjuntosRules.extensionDe(nombre)
        return dj([
            "id": id,
            "activityId": activityId,
            "nombre": nombre,
            "url": "/uploads/actividades-adjuntos/demo-\(id)\(ext.isEmpty ? "" : ".\(ext)")",
            "mimeType": ActivityAdjuntosRules.mime(nombre),
            "sizeBytes": tamano,
            "tipo": tipo,
            "vistaPrevia": tipo == "excel" || tipo == "csv" || tipo == "word",
            "createdAt": DemoClock.iso(creado),
            "subidoPor": dj(["id": persona.id, "nombre": persona.nombre]),
            // La persona del demo es de dirección: puede quitar cualquiera.
            "puedeQuitar": true,
        ])
    }

    /// `tipoDeDocumento` del API.
    private func adjTipo(_ nombre: String) -> String {
        switch ActivityAdjuntosRules.extensionDe(nombre) {
        case "pdf": return "pdf"
        case "png", "jpg", "jpeg", "webp", "gif", "heic", "heif", "bmp", "svg": return "imagen"
        case "xlsx", "xlsm": return "excel"
        case "csv": return "csv"
        case "docx": return "word"
        default: return "otro"
        }
    }

    // MARK: Adjuntar

    private func adjAgregar(activityId: Int, body: Data?, now: Date) -> DemoReply {
        let partes = adjPartesMultipart(body).filter { $0.campo == "files" }
        guard !partes.isEmpty else { return adjFallo(400, "Adjunta al menos un archivo") }
        guard partes.count <= ActivityAdjuntosRules.maximoPorEnvio else {
            return adjFallo(400, "Se pueden adjuntar hasta \(ActivityAdjuntosRules.maximoPorEnvio) archivos a la vez")
        }
        for parte in partes {
            if !ActivityAdjuntosRules.extensionesPermitidas.contains(ActivityAdjuntosRules.extensionDe(parte.nombre)) {
                return adjFallo(400, ActivityAdjuntosRules.mensajeTipoNoPermitido(parte.nombre))
            }
            if parte.datos.count > ActivityAdjuntosRules.limiteBytes {
                return adjFallo(413, "File too large")
            }
        }
        let estado = AdjDemoEstado.shared
        var creados: [DemoJSON] = []
        for parte in partes {
            estado.siguiente += 1
            let id = estado.siguiente
            estado.bytes[id] = parte.datos
            creados.append(adjDto(
                id: id,
                activityId: activityId,
                nombre: parte.nombre,
                tamano: parte.datos.count,
                autor: DemoMode.meId,
                creado: now
            ))
        }
        // Lo más reciente primero, como el API.
        let anteriores: [DemoJSON] = estado.listas[activityId] ?? []
        estado.listas[activityId] = creados + anteriores
        return adjResponder(creados)
    }

    /// Partes de un `multipart/form-data` armado por `ApiClient.uploadMultipartFiles`:
    /// campo, nombre del archivo y bytes (binarios: no se puede leer como texto).
    private func adjPartesMultipart(_ body: Data?) -> [(campo: String, nombre: String, datos: Data)] {
        guard let body, !body.isEmpty else { return [] }
        let cuerpo = Data(body)
        let salto = Data("\r\n".utf8)
        guard let primerSalto = cuerpo.range(of: salto) else { return [] }
        let marca = cuerpo.subdata(in: cuerpo.startIndex..<primerSalto.lowerBound)
        guard marca.count > 2 else { return [] }
        var separador = salto
        separador.append(marca)
        let finDeCabeceras = Data("\r\n\r\n".utf8)

        var partes: [(campo: String, nombre: String, datos: Data)] = []
        var cursor = primerSalto.upperBound
        while cursor < cuerpo.endIndex,
              let fin = cuerpo.range(of: separador, options: [], in: cursor..<cuerpo.endIndex) {
            let parte = cuerpo.subdata(in: cursor..<fin.lowerBound)
            if let corte = parte.range(of: finDeCabeceras) {
                let cabeceras = String(decoding: parte.subdata(in: parte.startIndex..<corte.lowerBound), as: UTF8.self)
                let datos = parte.subdata(in: corte.upperBound..<parte.endIndex)
                if let nombre = adjValor("filename", en: cabeceras) {
                    partes.append((campo: adjValor("name", en: cabeceras) ?? "", nombre: nombre, datos: datos))
                }
            }
            // Tras la marca viene «--» (fin) o «\r\n» (otra parte).
            let siguiente = fin.upperBound + 2
            guard siguiente <= cuerpo.endIndex,
                  cuerpo[fin.upperBound] != UInt8(ascii: "-") else { break }
            cursor = siguiente
        }
        return partes
    }

    /// `name="files"` / `filename="Propuesta.xlsx"` de las cabeceras de una parte.
    private func adjValor(_ clave: String, en cabeceras: String) -> String? {
        guard let inicio = cabeceras.range(of: " \(clave)=\"") ?? cabeceras.range(of: ";\(clave)=\"") else { return nil }
        let resto = cabeceras[inicio.upperBound...]
        guard let cierre = resto.firstIndex(of: "\"") else { return nil }
        return String(resto[..<cierre])
    }

    // MARK: Respuestas

    private func adjResponder(_ payload: Any, status: Int = 200) -> DemoReply {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload, options: []) else {
            return DemoReply(status: status, data: Data("{}".utf8))
        }
        return DemoReply(status: status, data: data)
    }

    private func adjFallo(_ status: Int, _ mensaje: String) -> DemoReply {
        adjResponder(dj(["statusCode": status, "message": mensaje]), status: status)
    }

    // MARK: Archivos de ejemplo

    /// Propuesta en Excel: una hoja con conceptos, cantidades e importes.
    private func adjExcelDePropuesta() -> Data {
        let filas: [[Any]] = [
            ["Concepto", "Cantidad", "Precio unitario", "Importe"],
            ["Mantenimiento preventivo mensual de climas", 12, 8500, 102_000],
            ["Limpieza profunda de serpentines", 2, 6200, 12_400],
            ["Reposición de filtros (por equipo)", 48, 350, 16_800],
            ["Atención de emergencias 24/7", 1, 18_000, 18_000],
            ["", "", "Subtotal", 149_200],
            ["", "", "IVA 16 %", 23_872],
            ["", "", "Total", 173_072],
        ]
        let columnas = ["A", "B", "C", "D"]
        var renglones = ""
        for (indice, fila) in filas.enumerated() {
            let r = indice + 1
            var celdas = ""
            for (columna, valor) in fila.enumerated() where columna < columnas.count {
                let referencia = "\(columnas[columna])\(r)"
                if let numero = valor as? Int {
                    celdas += "<c r=\"\(referencia)\"><v>\(numero)</v></c>"
                } else if let texto = valor as? String, !texto.isEmpty {
                    celdas += "<c r=\"\(referencia)\" t=\"inlineStr\"><is><t>\(adjXml(texto))</t></is></c>"
                }
            }
            renglones += "<row r=\"\(r)\">\(celdas)</row>"
        }
        let encabezado = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
        let principal = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        let relaciones = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
        return AdjDemoZip.archivo([
            ("[Content_Types].xml", encabezado
                + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
                + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
                + "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>"
                + "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
                + "</Types>"),
            ("_rels/.rels", encabezado
                + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                + "<Relationship Id=\"rId1\" Type=\"\(relaciones)/officeDocument\" Target=\"xl/workbook.xml\"/>"
                + "</Relationships>"),
            ("xl/workbook.xml", encabezado
                + "<workbook xmlns=\"\(principal)\" xmlns:r=\"\(relaciones)\">"
                + "<sheets><sheet name=\"Propuesta\" sheetId=\"1\" r:id=\"rId1\"/></sheets>"
                + "</workbook>"),
            ("xl/_rels/workbook.xml.rels", encabezado
                + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                + "<Relationship Id=\"rId1\" Type=\"\(relaciones)/worksheet\" Target=\"worksheets/sheet1.xml\"/>"
                + "</Relationships>"),
            ("xl/worksheets/sheet1.xml", encabezado
                + "<worksheet xmlns=\"\(principal)\">"
                + "<cols><col min=\"1\" max=\"1\" width=\"46\" customWidth=\"1\"/><col min=\"2\" max=\"4\" width=\"16\" customWidth=\"1\"/></cols>"
                + "<sheetData>\(renglones)</sheetData>"
                + "</worksheet>"),
        ])
    }

    /// Minuta en Word: título, asistentes y acuerdos.
    private func adjWordDeMinuta() -> Data {
        let parrafos: [(String, Bool)] = [
            ("Minuta de la junta con gerencia · Hotel Casa Azul", true),
            ("Asistentes: gerencia general, jefe de mantenimiento y Mariana López (NEXARA).", false),
            ("Acuerdos", true),
            ("1. NEXARA envía la propuesta de póliza anual de climas con 12 visitas preventivas.", false),
            ("2. El hotel comparte el inventario de equipos por piso antes de la presentación.", false),
            ("3. La presentación de la propuesta queda para esta semana con la gerencia.", false),
            ("Pendientes", true),
            ("Confirmar horario de acceso a azoteas y cuartos de máquinas.", false),
        ]
        var cuerpo = ""
        for (texto, negritas) in parrafos {
            let formato = negritas ? "<w:rPr><w:b/><w:sz w:val=\"28\"/></w:rPr>" : ""
            cuerpo += "<w:p><w:r>\(formato)<w:t xml:space=\"preserve\">\(adjXml(texto))</w:t></w:r></w:p>"
        }
        let encabezado = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
        return AdjDemoZip.archivo([
            ("[Content_Types].xml", encabezado
                + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
                + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
                + "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>"
                + "</Types>"),
            ("_rels/.rels", encabezado
                + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>"
                + "</Relationships>"),
            ("word/document.xml", encabezado
                + "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
                + "<w:body>\(cuerpo)</w:body>"
                + "</w:document>"),
        ])
    }

    /// PDF del cliente: requerimientos de la póliza, dibujado aquí mismo.
    private func adjPdfDeRequerimientos() -> Data {
        let lineas: [(String, CGFloat, UIFont.Weight)] = [
            ("Hotel Casa Azul · Requerimientos de mantenimiento", 17, .bold),
            ("Para: NEXARA · Atención: Mariana López", 11, .medium),
            ("", 8, .regular),
            ("1. Mantenimiento preventivo mensual de 36 equipos de clima (habitaciones y lobby).", 11.5, .regular),
            ("2. Atención de emergencias en menos de 4 horas, todos los días.", 11.5, .regular),
            ("3. Reporte mensual con fotos de cada equipo atendido.", 11.5, .regular),
            ("4. Trabajos en habitaciones solo de 11:00 a 15:00.", 11.5, .regular),
            ("", 8, .regular),
            ("Favor de incluir precio por visita y precio de la póliza anual.", 11.5, .semibold),
        ]
        let tinta = UIColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 1)
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 612, height: 792))
        return renderer.pdfData { contexto in
            contexto.beginPage()
            var y: CGFloat = 56
            for (texto, tamano, peso) in lineas {
                if !texto.isEmpty {
                    NSString(string: texto).draw(
                        in: CGRect(x: 56, y: y, width: 500, height: tamano * 3),
                        withAttributes: [.font: UIFont.systemFont(ofSize: tamano, weight: peso), .foregroundColor: tinta]
                    )
                }
                y += tamano + 14
            }
        }
    }

    private func adjXml(_ texto: String) -> String {
        texto
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }
}

/// ZIP sin compresión: lo justo para armar un .xlsx o un .docx de ejemplo.
private enum AdjDemoZip {
    private static let tabla: [UInt32] = (0..<256).map { indice -> UInt32 in
        var c = UInt32(indice)
        for _ in 0..<8 {
            c = (c & 1) != 0 ? (0xEDB8_8320 ^ (c >> 1)) : (c >> 1)
        }
        return c
    }

    static func crc32(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xFFFF_FFFF
        for byte in data {
            crc = tabla[Int((crc ^ UInt32(byte)) & 0xFF)] ^ (crc >> 8)
        }
        return crc ^ 0xFFFF_FFFF
    }

    /// (ruta dentro del ZIP, contenido en UTF-8).
    static func archivo(_ entradas: [(String, String)]) -> Data {
        var salida = Data()
        var central = Data()
        for (ruta, texto) in entradas {
            let nombre = Data(ruta.utf8)
            let datos = Data(texto.utf8)
            let crc = crc32(datos)
            let tamano = UInt32(datos.count)
            let desplazamiento = UInt32(salida.count)
            // Encabezado local: versión 2.0, sin banderas, guardado (sin compresión), 1-ene-1980.
            le32(&salida, 0x0403_4B50)
            le16(&salida, 20)
            le16(&salida, 0)
            le16(&salida, 0)
            le16(&salida, 0)
            le16(&salida, 0x21)
            le32(&salida, crc)
            le32(&salida, tamano)
            le32(&salida, tamano)
            le16(&salida, UInt16(nombre.count))
            le16(&salida, 0)
            salida.append(nombre)
            salida.append(datos)
            // Directorio central.
            le32(&central, 0x0201_4B50)
            le16(&central, 20)
            le16(&central, 20)
            le16(&central, 0)
            le16(&central, 0)
            le16(&central, 0)
            le16(&central, 0x21)
            le32(&central, crc)
            le32(&central, tamano)
            le32(&central, tamano)
            le16(&central, UInt16(nombre.count))
            le16(&central, 0)
            le16(&central, 0)
            le16(&central, 0)
            le16(&central, 0)
            le32(&central, 0)
            le32(&central, desplazamiento)
            central.append(nombre)
        }
        let inicioCentral = UInt32(salida.count)
        salida.append(central)
        // Fin del directorio central.
        le32(&salida, 0x0605_4B50)
        le16(&salida, 0)
        le16(&salida, 0)
        le16(&salida, UInt16(entradas.count))
        le16(&salida, UInt16(entradas.count))
        le32(&salida, UInt32(central.count))
        le32(&salida, inicioCentral)
        le16(&salida, 0)
        return salida
    }

    private static func le16(_ data: inout Data, _ valor: UInt16) {
        data.append(UInt8(valor & 0xFF))
        data.append(UInt8(valor >> 8))
    }

    private static func le32(_ data: inout Data, _ valor: UInt32) {
        data.append(UInt8(valor & 0xFF))
        data.append(UInt8((valor >> 8) & 0xFF))
        data.append(UInt8((valor >> 16) & 0xFF))
        data.append(UInt8(valor >> 24))
    }
}
