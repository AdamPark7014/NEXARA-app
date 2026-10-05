import XCTest

/// Recorre TODAS las pantallas de la app en modo demo y deja una captura de cada
/// una, para compararlas con la app Android (la referencia de diseño y funciones).
///
/// No son capturas de tienda: las de App Store salen de `StoreScreenshotsUITests`.
/// Estas las genera `.github/workflows/ios-screenshots.yml` en cada push a `main`
/// que toque `apps/mobile-native/ios/` y el bot las deja en
/// `docs/ios-paridad/iphone-69/NN-nombre.png` para revisarlas sin Mac.
///
/// Identificadores que usa (los pone la app):
///   tab-inicio  tab-actividades  tab-chat  tab-asistencias  tab-mas
///   bell-button   more-profile  more-clientes  more-<clave del módulo>
///
/// Igual que la de tienda, todo es TOLERANTE: lo que no aparece se anota como
/// omitido (con el árbol de accesibilidad adjunto) y el recorrido sigue.
@MainActor
final class ParityScreenshotsUITests: XCTestCase {

    private var app: XCUIApplication!
    private var monitorDeAlertas: NSObjectProtocol?
    private var capturadas: [String] = []
    private var omitidas: [String] = []
    private var numero = 0

    private static let botonesPermitir = [
        "Permitir al usar la app", "Permitir mientras se usa la app", "Permitir una vez",
        "Permitir", "Aceptar", "OK", "Allow While Using App", "Allow Once", "Allow"
    ]

    /// Módulos de «Más» en el orden del hub de Android. Los que la app aún no
    /// muestre se anotan como omitidos.
    private static let modulosDelHub: [(clave: String, etiqueta: String)] = [
        ("erp-cotizaciones", "Cotizaciones"),
        ("erp-proyectos", "Proyectos"),
        ("kpis-equipo", "KPIs del equipo"),
        ("erp-aprobaciones", "Aprobaciones"),
        ("erp-almacen", "Almacén"),
        ("erp-herramientas", "Herramientas"),
        ("erp-vehiculos", "Vehículos"),
        ("erp-gastos", "Gastos"),
        ("erp-pagos-empleados", "Pagos a empleados"),
        ("viatics", "Viáticos")
    ]

    override func setUpWithError() throws {
        try super.setUpWithError()
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        monitorDeAlertas = addUIInterruptionMonitor(withDescription: "Permisos del sistema") { [weak self] alerta in
            self?.pulsarPermitir(en: alerta) ?? false
        }
        app = XCUIApplication()
        app.launchArguments = ["-NEXARA_DEMO", "1", "-AppleLanguages", "(es-MX)", "-AppleLocale", "es_MX"]
        app.launchEnvironment["NEXARA_DEMO"] = "1"
        app.launchEnvironment["TZ"] = "America/Mexico_City"
        app.launch()
    }

    func testRecorridoDeParidad() throws {
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30), "La app no llegó a primer plano")
        despejarAlertas()
        guard buscar(pestana("tab-inicio", "Inicio"), timeout: 30) != nil else {
            adjuntarJerarquia("dbg-sin-shell")
            XCTFail("No aparece la barra de pestañas: el modo demo no llegó al shell")
            return
        }
        Thread.sleep(forTimeInterval: 1.5)

        capturar("inicio")
        deslizarYCapturar("inicio-abajo")

        if irA("tab-actividades", "Actividades") {
            capturar("actividades")
            if tocarSiExiste(textoTocable("Mi equipo"), timeout: 3) {
                capturar("actividades-equipo")
                _ = tocarSiExiste(textoTocable("Mis actividades"), timeout: 3)
            } else {
                omitir("actividades-equipo: no hay «Mi equipo»")
            }
            let raiz = tituloActual()
            if abrirPrimeraFila() {
                capturar("detalle-actividad")
                if tocarSiExiste(textoTocable("Evidencias"), timeout: 3) { capturar("detalle-evidencias") }
                if tocarSiExiste(textoTocable("Historial"), timeout: 3) { capturar("detalle-historial") }
                volver(a: raiz)
            } else {
                omitir("detalle-actividad: no se abrió ninguna tarjeta")
            }
        } else {
            omitir("actividades: no hay pestaña")
        }

        if irA("tab-asistencias", "Asistencia") {
            capturar("asistencias")
            deslizarYCapturar("asistencias-abajo")
            if tocarSiExiste(textoTocable("Comidas"), timeout: 3) { capturar("asistencias-comidas") }
            if tocarSiExiste(textoTocable("Trayectoria"), timeout: 3) { capturar("asistencias-trayectoria") }
        } else {
            omitir("asistencias: no hay pestaña")
        }

        if irA("tab-chat", "Chat") {
            capturar("chat")
            let raiz = tituloActual()
            if abrirPrimeraFila() {
                Thread.sleep(forTimeInterval: 0.8)
                capturar("chat-conversacion")
                volver(a: raiz)
            } else {
                omitir("chat-conversacion: no se abrió ningún canal")
            }
        } else {
            omitir("chat: no hay pestaña")
        }

        guard irA("tab-mas", "Más") else {
            omitir("mas: no hay pestaña")
            cerrarRecorrido()
            return
        }
        capturar("mas")
        deslizarYCapturar("mas-abajo")
        let raizMas = tituloActual()

        if tocarSiExiste(notificaciones(), timeout: 4) {
            capturar("notificaciones")
            volver(a: raizMas)
        } else {
            omitir("notificaciones: no hay bell-button")
        }

        abrirDelHub("more-profile", "Mi perfil", nombre: "mi-perfil", raiz: raizMas, conScroll: true)
        abrirDelHub("more-clientes", "Clientes", nombre: "clientes", raiz: raizMas, conScroll: false)
        for modulo in Self.modulosDelHub {
            abrirDelHub("more-\(modulo.clave)", modulo.etiqueta, nombre: modulo.clave, raiz: raizMas, conScroll: true)
        }

        cerrarRecorrido()
    }

    // MARK: - Recorrido

    private func cerrarRecorrido() {
        let resumen = "Capturadas (\(capturadas.count)): \(capturadas.joined(separator: ", "))\n"
            + "Omitidas (\(omitidas.count)):\n" + omitidas.map { "  - \($0)" }.joined(separator: "\n") + "\n"
        adjuntarTexto("resumen", resumen)
        XCTAssertFalse(capturadas.isEmpty, "No se pudo hacer ni una captura")
    }

    /// Abre un renglón del hub (desplazándose si hace falta), captura arriba y abajo y vuelve.
    private func abrirDelHub(_ id: String, _ etiqueta: String, nombre: String, raiz: String, conScroll: Bool) {
        subirAlPrincipio()
        var elemento = buscar(renglon(id, etiqueta), timeout: 2)
        var intentos = 0
        while (elemento == nil || !(elemento?.isHittable ?? false)), intentos < 4 {
            app.swipeUp()
            Thread.sleep(forTimeInterval: 0.5)
            elemento = buscar(renglon(id, etiqueta), timeout: 1)
            intentos += 1
        }
        guard let elemento else {
            omitir("\(nombre): no está en «Más»")
            return
        }
        tocar(elemento)
        Thread.sleep(forTimeInterval: 1.2)
        capturar(nombre)
        if conScroll { deslizarYCapturar("\(nombre)-abajo") }
        volver(a: raiz)
    }

    private func subirAlPrincipio() {
        for _ in 0..<3 {
            app.swipeDown()
            Thread.sleep(forTimeInterval: 0.3)
        }
    }

    /// Desliza una pantalla hacia arriba y captura solo si el contenido cambió.
    private func deslizarYCapturar(_ nombre: String) {
        let antes = XCUIScreen.main.screenshot().pngRepresentation
        app.swipeUp()
        Thread.sleep(forTimeInterval: 0.8)
        let despues = XCUIScreen.main.screenshot().pngRepresentation
        if antes != despues {
            capturar(nombre)
        }
        app.swipeDown()
        app.swipeDown()
        Thread.sleep(forTimeInterval: 0.5)
    }

    // MARK: - Captura

    private func capturar(_ nombre: String) {
        despejarAlertas()
        esperarSinCarga()
        numero += 1
        let etiqueta = String(format: "%02d-%@", numero, nombre)
        let pantalla = XCUIScreen.main.screenshot()
        let adjunto = XCTAttachment(screenshot: pantalla)
        adjunto.name = etiqueta
        adjunto.lifetime = .keepAlways
        add(adjunto)
        if let ruta = ProcessInfo.processInfo.environment["NEXARA_SHOT_DIR"], !ruta.isEmpty {
            let carpeta = URL(fileURLWithPath: ruta, isDirectory: true)
            try? FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
            try? pantalla.pngRepresentation.write(to: carpeta.appendingPathComponent("\(etiqueta).png"))
        }
        capturadas.append(etiqueta)
    }

    private func omitir(_ motivo: String) {
        omitidas.append(motivo)
        adjuntarJerarquia("dbg-\(omitidas.count)")
    }

    private func adjuntarTexto(_ nombre: String, _ texto: String) {
        let adjunto = XCTAttachment(string: texto)
        adjunto.name = nombre
        adjunto.lifetime = .keepAlways
        add(adjunto)
    }

    private func adjuntarJerarquia(_ nombre: String) {
        adjuntarTexto(nombre, app.debugDescription)
    }

    // MARK: - Elementos

    private func pestana(_ id: String, _ etiqueta: String) -> [XCUIElement] {
        [
            app.descendants(matching: .any).matching(identifier: id).firstMatch,
            app.tabBars.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", etiqueta)).firstMatch,
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", etiqueta)).firstMatch
        ]
    }

    private func irA(_ id: String, _ etiqueta: String) -> Bool {
        tocarSiExiste(pestana(id, etiqueta), timeout: 6)
    }

    private func notificaciones() -> [XCUIElement] {
        [
            app.descendants(matching: .any).matching(identifier: "bell-button").firstMatch,
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Notificaciones")).firstMatch
        ]
    }

    private func renglon(_ id: String, _ etiqueta: String) -> [XCUIElement] {
        [
            app.descendants(matching: .any).matching(identifier: id).firstMatch,
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", etiqueta)).firstMatch,
            app.cells.matching(NSPredicate(format: "label BEGINSWITH %@", etiqueta)).firstMatch
        ]
    }

    /// Una pestaña interna, un segmento o un botón por su texto visible.
    private func textoTocable(_ texto: String) -> [XCUIElement] {
        [
            app.buttons.matching(NSPredicate(format: "label == %@", texto)).firstMatch,
            app.segmentedControls.buttons.matching(NSPredicate(format: "label == %@", texto)).firstMatch,
            app.staticTexts.matching(NSPredicate(format: "label == %@", texto)).firstMatch
        ]
    }

    private func primeraFila() -> [XCUIElement] {
        [app.cells.firstMatch, app.scrollViews.buttons.firstMatch, app.scrollViews.otherElements.buttons.firstMatch]
    }

    private func tituloActual() -> String {
        let barra = app.navigationBars.firstMatch
        return barra.exists ? barra.identifier : ""
    }

    private func abrirPrimeraFila() -> Bool {
        let antes = tituloActual()
        guard tocarSiExiste(primeraFila(), timeout: 6) else { return false }
        let limite = Date().addingTimeInterval(4)
        while Date() < limite {
            if tituloActual() != antes { return true }
            Thread.sleep(forTimeInterval: 0.3)
        }
        return false
    }

    private func volver(a raiz: String) {
        for intento in 0..<3 {
            if tituloActual() == raiz { return }
            despejarAlertas()
            switch intento {
            case 0:
                let cerrar = ["Cerrar", "Listo", "Hecho"].map {
                    app.buttons.matching(NSPredicate(format: "label == %@", $0)).firstMatch
                }
                if !tocarSiExiste(cerrar, timeout: 1, pausa: 0.4) {
                    let atras = app.navigationBars.buttons.firstMatch
                    if atras.exists { tocar(atras) }
                }
            case 1:
                let inicio = app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.5))
                inicio.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)))
            default:
                let atras = app.navigationBars.buttons.firstMatch
                if atras.exists { tocar(atras) }
            }
            Thread.sleep(forTimeInterval: 0.8)
        }
    }

    // MARK: - Toques tolerantes

    private func buscar(_ candidatos: [XCUIElement], timeout: TimeInterval) -> XCUIElement? {
        let limite = Date().addingTimeInterval(timeout)
        repeat {
            for candidato in candidatos where candidato.exists { return candidato }
            Thread.sleep(forTimeInterval: 0.25)
        } while Date() < limite
        return nil
    }

    @discardableResult
    private func tocarSiExiste(_ candidatos: [XCUIElement], timeout: TimeInterval = 6, pausa: TimeInterval = 0.8) -> Bool {
        despejarAlertas()
        guard let elemento = buscar(candidatos, timeout: timeout) else { return false }
        tocar(elemento)
        Thread.sleep(forTimeInterval: pausa)
        return true
    }

    private func tocar(_ elemento: XCUIElement) {
        if elemento.isHittable {
            elemento.tap()
        } else {
            elemento.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
    }

    private func esperarSinCarga(_ segundos: TimeInterval = 5) {
        let limite = Date().addingTimeInterval(segundos)
        while Date() < limite {
            if app.activityIndicators.count == 0 { return }
            Thread.sleep(forTimeInterval: 0.3)
        }
    }

    // MARK: - Alertas del sistema

    private func despejarAlertas() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for _ in 0..<3 {
            let alerta = springboard.alerts.firstMatch
            guard alerta.exists, pulsarPermitir(en: alerta) else { return }
            Thread.sleep(forTimeInterval: 0.6)
        }
    }

    private func pulsarPermitir(en alerta: XCUIElement) -> Bool {
        for nombre in Self.botonesPermitir {
            let boton = alerta.buttons[nombre]
            if boton.exists {
                boton.tap()
                return true
            }
        }
        let cualquiera = alerta.buttons.firstMatch
        if cualquiera.exists {
            cualquiera.tap()
            return true
        }
        return false
    }
}
