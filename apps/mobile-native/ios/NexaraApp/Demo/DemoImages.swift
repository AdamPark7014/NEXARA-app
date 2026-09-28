import UIKit

/// Imágenes de muestra del modo demostración, dibujadas en código: no hay red ni archivos
/// que descargar, y el simulador (que no tiene cámara) no se queda sin foto.
///
/// Salen de dos maneras:
///  - como `data:image/jpeg;base64,…` dentro de las respuestas de `DemoBackend`
///    (`AuthenticatedAssetLoader` entiende esas URLs sin tocar la red);
///  - como `CapturedGeoPhoto` para `GeoPhotoCaptureView`, que en demo salta la cámara.
enum DemoImages {
    enum Kind: String, CaseIterable {
        case entry, work1, work2, work3, exit, ticket, selfie
    }

    /// Coordenadas fijas de la demostración (Puebla). Sin GPS real, sin permisos, sin mock.
    static let coords = DeviceCoords(latitude: 19.0432, longitude: -98.1981, accuracyM: 8, mock: false, fixAgeMs: 400)

    private static let lock = NSLock()
    private static var cache: [String: String] = [:]
    private static var rotation = 0

    // MARK: Data URLs

    /// `data:image/jpeg;base64,…` de una foto de muestra (se dibuja una sola vez).
    static func dataURL(_ kind: Kind) -> String {
        lock.lock()
        defer { lock.unlock() }
        if let hit = cache[kind.rawValue] { return hit }
        let bytes = render(kind).jpegData(compressionQuality: 0.55) ?? Data()
        let url = "data:image/jpeg;base64," + bytes.base64EncodedString()
        cache[kind.rawValue] = url
        return url
    }

    // MARK: Foto «tomada» sin cámara

    /// La foto que `GeoPhotoCaptureView` da por tomada en demo. El título decide el motivo:
    /// entrada, salida, ticket, comida… y las fotos «en sitio» van rotando.
    static func capturedPhoto(title: String) -> CapturedGeoPhoto {
        let kind = kindFor(title: title)
        let image = render(kind)
        let jpeg = image.jpegData(compressionQuality: 0.6) ?? Data()
        return CapturedGeoPhoto(image: image, jpeg: jpeg, coords: coords, capturedAt: Date())
    }

    private static func kindFor(title: String) -> Kind {
        let lower = title.lowercased()
        if lower.contains("ticket") || lower.contains("comprobante") { return .ticket }
        if lower.contains("comer") || lower.contains("regreso") { return .selfie }
        if lower.contains("salida") { return .exit }
        if lower.contains("entrada") { return .entry }
        lock.lock()
        defer { lock.unlock() }
        rotation += 1
        let work: [Kind] = [.work1, .work2, .work3]
        return work[rotation % work.count]
    }

    // MARK: Dibujo

    private static func size(for kind: Kind) -> CGSize {
        switch kind {
        case .ticket: return CGSize(width: 360, height: 480)
        case .selfie: return CGSize(width: 320, height: 320)
        default: return CGSize(width: 480, height: 360)
        }
    }

    private static func render(_ kind: Kind) -> UIImage {
        let canvas = size(for: kind)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: canvas, format: format)
        return renderer.image { context in
            let cg = context.cgContext
            let bounds = CGRect(origin: .zero, size: canvas)
            switch kind {
            case .entry:
                drawSite(cg, bounds: bounds, top: rgb(0.55, 0.75, 0.95), bottom: rgb(0.86, 0.92, 0.98), floors: 3, caption: "Foto de entrada · muestra")
            case .work1:
                drawPanel(cg, bounds: bounds, tint: rgb(0.16, 0.30, 0.55), caption: "Tablero principal · muestra")
            case .work2:
                drawCables(cg, bounds: bounds, tint: rgb(0.12, 0.42, 0.40), caption: "Cableado terminado · muestra")
            case .work3:
                drawSite(cg, bounds: bounds, top: rgb(0.98, 0.80, 0.55), bottom: rgb(0.99, 0.93, 0.82), floors: 2, caption: "Avance en sitio · muestra")
            case .exit:
                drawSite(cg, bounds: bounds, top: rgb(0.60, 0.85, 0.75), bottom: rgb(0.90, 0.97, 0.93), floors: 4, caption: "Foto de salida · muestra")
            case .ticket:
                drawTicket(cg, bounds: bounds)
            case .selfie:
                drawSelfie(cg, bounds: bounds)
            }
        }
    }

    private static func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> UIColor {
        UIColor(red: r, green: g, blue: b, alpha: 1)
    }

    private static func gradient(_ cg: CGContext, in rect: CGRect, top: UIColor, bottom: UIColor) {
        let colors = [top.cgColor, bottom.cgColor] as CFArray
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) else {
            cg.setFillColor(top.cgColor)
            cg.fill(rect)
            return
        }
        cg.saveGState()
        cg.clip(to: rect)
        cg.drawLinearGradient(
            gradient,
            start: CGPoint(x: rect.midX, y: rect.minY),
            end: CGPoint(x: rect.midX, y: rect.maxY),
            options: []
        )
        cg.restoreGState()
    }

    private static func text(
        _ value: String,
        in rect: CGRect,
        size: CGFloat,
        color: UIColor,
        weight: UIFont.Weight = .semibold,
        align: NSTextAlignment = .center
    ) {
        let style = NSMutableParagraphStyle()
        style.alignment = align
        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: size, weight: weight),
            .foregroundColor: color,
            .paragraphStyle: style,
        ]
        (value as NSString).draw(in: rect, withAttributes: attributes)
    }

    private static func caption(_ cg: CGContext, bounds: CGRect, value: String) {
        let band = CGRect(x: 0, y: bounds.maxY - 34, width: bounds.width, height: 34)
        cg.setFillColor(UIColor(white: 0, alpha: 0.45).cgColor)
        cg.fill(band)
        text(value, in: band.insetBy(dx: 8, dy: 8), size: 14, color: .white)
    }

    /// Obra: edificio de varios pisos con ventanas y una franja de piso.
    private static func drawSite(_ cg: CGContext, bounds: CGRect, top: UIColor, bottom: UIColor, floors: Int, caption label: String) {
        gradient(cg, in: bounds, top: top, bottom: bottom)
        let ground = CGRect(x: 0, y: bounds.maxY - 90, width: bounds.width, height: 90)
        cg.setFillColor(rgb(0.45, 0.47, 0.50).cgColor)
        cg.fill(ground)

        let towerWidth: CGFloat = 220
        let floorHeight: CGFloat = 46
        let towerHeight = CGFloat(floors) * floorHeight + 20
        let tower = CGRect(
            x: (bounds.width - towerWidth) / 2,
            y: ground.minY - towerHeight,
            width: towerWidth,
            height: towerHeight
        )
        cg.setFillColor(rgb(0.93, 0.94, 0.96).cgColor)
        cg.fill(tower)
        cg.setStrokeColor(rgb(0.30, 0.34, 0.40).cgColor)
        cg.setLineWidth(3)
        cg.stroke(tower)

        cg.setFillColor(rgb(0.25, 0.45, 0.75).cgColor)
        for row in 0..<floors {
            for column in 0..<4 {
                let window = CGRect(
                    x: tower.minX + 18 + CGFloat(column) * 50,
                    y: tower.minY + 14 + CGFloat(row) * floorHeight,
                    width: 32,
                    height: 26
                )
                cg.fill(window)
            }
        }
        // Grúa
        cg.setStrokeColor(rgb(0.90, 0.55, 0.10).cgColor)
        cg.setLineWidth(5)
        cg.move(to: CGPoint(x: tower.maxX + 40, y: ground.minY))
        cg.addLine(to: CGPoint(x: tower.maxX + 40, y: tower.minY - 30))
        cg.addLine(to: CGPoint(x: tower.minX - 20, y: tower.minY - 30))
        cg.strokePath()
        caption(cg, bounds: bounds, value: label)
    }

    /// Tablero eléctrico: caja con interruptores en filas.
    private static func drawPanel(_ cg: CGContext, bounds: CGRect, tint: UIColor, caption label: String) {
        gradient(cg, in: bounds, top: rgb(0.30, 0.34, 0.40), bottom: rgb(0.14, 0.16, 0.20))
        let box = CGRect(x: 90, y: 34, width: bounds.width - 180, height: bounds.height - 96)
        cg.setFillColor(rgb(0.80, 0.82, 0.86).cgColor)
        cg.fill(box)
        cg.setStrokeColor(rgb(0.20, 0.22, 0.26).cgColor)
        cg.setLineWidth(4)
        cg.stroke(box)
        for row in 0..<4 {
            for column in 0..<6 {
                let breaker = CGRect(
                    x: box.minX + 16 + CGFloat(column) * 32,
                    y: box.minY + 18 + CGFloat(row) * 44,
                    width: 24,
                    height: 34
                )
                cg.setFillColor((row + column) % 5 == 0 ? rgb(0.86, 0.25, 0.22).cgColor : tint.cgColor)
                cg.fill(breaker)
                cg.setFillColor(rgb(0.95, 0.96, 0.98).cgColor)
                cg.fill(CGRect(x: breaker.minX + 8, y: breaker.minY + 6, width: 8, height: 12))
            }
        }
        caption(cg, bounds: bounds, value: label)
    }

    /// Cableado: haces de cable ordenados sobre una charola.
    private static func drawCables(_ cg: CGContext, bounds: CGRect, tint: UIColor, caption label: String) {
        gradient(cg, in: bounds, top: rgb(0.92, 0.94, 0.95), bottom: rgb(0.74, 0.78, 0.80))
        let tray = CGRect(x: 30, y: 120, width: bounds.width - 60, height: 120)
        cg.setFillColor(rgb(0.35, 0.38, 0.42).cgColor)
        cg.fill(tray)
        let colors: [UIColor] = [
            rgb(0.16, 0.44, 0.86), rgb(0.95, 0.60, 0.12), rgb(0.20, 0.65, 0.35),
            rgb(0.86, 0.25, 0.22), tint, rgb(0.55, 0.30, 0.75),
        ]
        cg.setLineWidth(9)
        cg.setLineCap(.round)
        for (index, color) in colors.enumerated() {
            let y = tray.minY + 16 + CGFloat(index) * 17
            cg.setStrokeColor(color.cgColor)
            cg.move(to: CGPoint(x: tray.minX + 10, y: y))
            cg.addCurve(
                to: CGPoint(x: tray.maxX - 10, y: y),
                control1: CGPoint(x: tray.minX + 140, y: y - 22),
                control2: CGPoint(x: tray.maxX - 140, y: y + 22)
            )
            cg.strokePath()
        }
        caption(cg, bounds: bounds, value: label)
    }

    /// Ticket de compra: papel blanco con renglones y total.
    private static func drawTicket(_ cg: CGContext, bounds: CGRect) {
        cg.setFillColor(rgb(0.86, 0.87, 0.88).cgColor)
        cg.fill(bounds)
        let paper = bounds.insetBy(dx: 40, dy: 24)
        cg.setFillColor(UIColor.white.cgColor)
        cg.fill(paper)
        text("GASOLINERA DEMO", in: CGRect(x: paper.minX, y: paper.minY + 18, width: paper.width, height: 26), size: 18, color: rgb(0.15, 0.17, 0.20), weight: .bold)
        text("Ticket de muestra", in: CGRect(x: paper.minX, y: paper.minY + 46, width: paper.width, height: 20), size: 13, color: rgb(0.40, 0.43, 0.48), weight: .regular)
        let lines: [(String, String)] = [
            ("Magna 24.6 L", "$ 598.00"),
            ("IVA incluido", "$ 82.48"),
            ("Bomba 04", "—"),
            ("Pago", "Efectivo"),
        ]
        var y = paper.minY + 96
        for line in lines {
            text(line.0, in: CGRect(x: paper.minX + 18, y: y, width: 150, height: 22), size: 14, color: rgb(0.20, 0.22, 0.26), weight: .regular, align: .left)
            text(line.1, in: CGRect(x: paper.maxX - 138, y: y, width: 120, height: 22), size: 14, color: rgb(0.20, 0.22, 0.26), weight: .regular, align: .right)
            y += 34
        }
        cg.setStrokeColor(rgb(0.60, 0.62, 0.66).cgColor)
        cg.setLineWidth(1)
        cg.setLineDash(phase: 0, lengths: [5, 4])
        cg.move(to: CGPoint(x: paper.minX + 18, y: y + 6))
        cg.addLine(to: CGPoint(x: paper.maxX - 18, y: y + 6))
        cg.strokePath()
        text("TOTAL", in: CGRect(x: paper.minX + 18, y: y + 22, width: 120, height: 28), size: 20, color: rgb(0.10, 0.12, 0.15), weight: .bold, align: .left)
        text("$ 598.00", in: CGRect(x: paper.maxX - 178, y: y + 22, width: 160, height: 28), size: 20, color: rgb(0.10, 0.12, 0.15), weight: .bold, align: .right)
    }

    /// Retrato genérico para las fotos de asistencia y de comida.
    private static func drawSelfie(_ cg: CGContext, bounds: CGRect) {
        gradient(cg, in: bounds, top: rgb(0.62, 0.72, 0.92), bottom: rgb(0.82, 0.88, 0.97))
        cg.setFillColor(rgb(0.20, 0.32, 0.62).cgColor)
        cg.fillEllipse(in: CGRect(x: bounds.midX - 110, y: bounds.maxY - 120, width: 220, height: 200))
        cg.setFillColor(rgb(0.93, 0.78, 0.66).cgColor)
        cg.fillEllipse(in: CGRect(x: bounds.midX - 52, y: bounds.minY + 70, width: 104, height: 124))
        cg.setFillColor(rgb(0.16, 0.12, 0.10).cgColor)
        cg.fillEllipse(in: CGRect(x: bounds.midX - 58, y: bounds.minY + 56, width: 116, height: 56))
    }
}
