import XCTest

/// Genera las capturas de la ficha de App Store con el simulador de iOS.
///
/// Apple rechazo la version 1.0 por la regla 2.3.10: las capturas eran de Android
/// (barra de estado y panel de ajustes rapidos de Android). Estas son las de
/// verdad: pantalla completa del simulador (`XCUIScreen.main`), con la barra de
/// estado fijada a 9:41 por `simctl status_bar` desde el flujo
/// `.github/workflows/ios-screenshots.yml`.
///
/// La app arranca en MODO DEMO (`-NEXARA_DEMO 1`): salta login y onboarding y sirve
/// datos ficticios sin red. Identificadores que usa el test (los pone la app):
///
///   tab-inicio  tab-actividades  tab-chat  tab-asistencias  tab-mas (rediseño v2)
///   bell-button (campana)   more-clientes / more-profile (renglones del hub «Más»)
///
/// Todo lo que no sea imprescindible es TOLERANTE: si un elemento no aparece se
/// anota como omitido, se adjunta el arbol de accesibilidad (`dbg-*`) para
/// depurar y el test sigue con lo que haya. Solo falla si la app ni siquiera
/// llega al shell o si no se pudo hacer ni una captura.
///
/// Salida: cada captura es un adjunto `NN-nombre` (lifetime `.keepAlways`) que el
/// flujo exporta del `.xcresult`. Ademas, si existe la variable
/// `NEXARA_SHOT_DIR` (el flujo la pasa como `TEST_RUNNER_NEXARA_SHOT_DIR`), el PNG
/// se escribe tambien ahi: red de seguridad por si `xcresulttool` cambia de formato.
@MainActor
final class StoreScreenshotsUITests: XCTestCase {

    // MARK: - Estado

    private var app: XCUIApplication!
    private var monitorDeAlertas: NSObjectProtocol?
    private var capturadas: [String] = []
    private var omitidas: [String] = []

    /// Botones que aceptan un permiso del sistema, en espanol de Mexico y en ingles.
    private static let botonesPermitir = [
        "Permitir al usar la app",
        "Permitir mientras se usa la app",
        "Permitir una vez",
        "Permitir",
        "Aceptar",
        "OK",
        "Allow While Using App",
        "Allow Once",
        "Allow"
    ]

    /// Una pestana del `TabView`: identificador que pone la app y etiqueta visible.
    private struct Pestana {
        let id: String
        let etiqueta: String

        static let inicio = Pestana(id: "tab-inicio", etiqueta: "Inicio")
        static let actividades = Pestana(id: "tab-actividades", etiqueta: "Actividades")
        static let asistencias = Pestana(id: "tab-asistencias", etiqueta: "Asistencia")
        static let chat = Pestana(id: "tab-chat", etiqueta: "Chat")
        static let mas = Pestana(id: "tab-mas", etiqueta: "Más")
    }

    // MARK: - Ciclo de vida

    override func setUpWithError() throws {
        try super.setUpWithError()
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait

        // Red de seguridad para permisos (notificaciones, ubicacion...). `simctl privacy`
        // ya concede ubicacion, fotos y microfono; la camara y las notificaciones no se
        // pueden conceder desde fuera y salen como alerta de SpringBoard.
        monitorDeAlertas = addUIInterruptionMonitor(withDescription: "Permisos del sistema") { [weak self] alerta in
            self?.pulsarPermitir(en: alerta) ?? false
        }

        app = XCUIApplication()
        app.launchArguments = [
            "-NEXARA_DEMO", "1",
            "-AppleLanguages", "(es-MX)",
            "-AppleLocale", "es_MX"
        ]
        // Equivale a `-NEXARA_DEMO 1`; por si la app lee el entorno en vez de los argumentos.
        app.launchEnvironment["NEXARA_DEMO"] = "1"
        // Hora de México: el runner de GitHub corre en UTC y, de noche, las actividades de
        // demo «de más tarde hoy» caían pasada la medianoche (03:01, 05:11 en «Después, hoy»).
        app.launchEnvironment["TZ"] = "America/Mexico_City"
        app.launch()
    }

    // MARK: - Test

    func testCapturasDeTienda() throws {
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30), "La app no llego a primer plano")
        despejarAlertas()

        // El shell (barra de pestanas) existe si el modo demo salto login y onboarding.
        // Rediseño v2: la app arranca en Inicio; Clientes y Mi perfil viven en «Más».
        guard buscar(elementosDePestana(.inicio), timeout: 30) != nil
            || buscar(elementosDePestana(.actividades), timeout: 5) != nil else {
            adjuntarJerarquia("dbg-sin-shell")
            XCTFail("No aparece la barra de pestanas: el modo demo (-NEXARA_DEMO 1) no llego al shell")
            return
        }
        Thread.sleep(forTimeInterval: 1.5)

        // 1. Inicio: jornada, aviso, actividad de ahora y siguientes.
        capturar(1, "inicio")
        adjuntarJerarquia("dbg-inicio")

        // 2. Actividades / pizarra del equipo.
        if irAPestana(.actividades) {
            capturar(2, "actividades")
            adjuntarJerarquia("dbg-actividades")

            // 3. Detalle de una actividad (primera tarjeta) y volver.
            let tituloRaiz = tituloActual()
            if abrirPrimeraFila() {
                capturar(3, "detalle-actividad")
                volver(a: tituloRaiz)
            } else {
                omitir("detalle-actividad: no se encontro una tarjeta que abra el detalle")
            }
        } else {
            omitir("actividades / detalle-actividad: no se encontro la pestana")
        }

        // 4. Asistencia.
        if irAPestana(.asistencias) {
            capturar(4, "asistencias")
        } else {
            omitir("asistencias: no se encontro la pestana")
        }

        // 5 y 6. Chat: la lista de canales y un canal abierto con mensajes.
        if irAPestana(.chat) {
            capturar(5, "chat-canales")
            let tituloChat = tituloActual()
            if abrirPrimeraFila() {
                Thread.sleep(forTimeInterval: 0.8)
                capturar(6, "chat-canal")
                volver(a: tituloChat)
            } else {
                omitir("chat-canal: no se encontro un canal que abrir")
            }
        } else {
            omitir("chat: no se encontro la pestana")
        }

        // 7. Hub «Más» (quinta pestaña).
        if irAPestana(.mas) {
            capturar(7, "mas-modulos")
            let tituloMas = tituloActual()

            // 8. Clientes (renglón del hub) y volver.
            if tocarSiExiste(renglonDelHub("more-clientes", etiqueta: "Clientes"), timeout: 5) {
                capturar(8, "clientes")
                volver(a: tituloMas)
            } else {
                omitir("clientes: no se encontro more-clientes en «Más»")
            }

            // 9. Notificaciones (campana).
            if tocarSiExiste(botonCampana(), timeout: 5) {
                capturar(9, "notificaciones")
                cerrarPantallaModal()
            } else {
                omitir("notificaciones: no se encontro bell-button")
                adjuntarJerarquia("dbg-sin-campana")
            }

            // 10. Mi perfil (renglón de arriba del hub).
            if tocarSiExiste(renglonDelHub("more-profile", etiqueta: "Mi perfil"), timeout: 5) {
                capturar(10, "mi-perfil")
                volver(a: tituloMas)
            } else {
                omitir("mi-perfil: no se encontro more-profile en «Más»")
            }
        } else {
            omitir("mas-modulos / clientes / notificaciones / mi-perfil: no se encontro la pestana Más")
            adjuntarJerarquia("dbg-sin-mas")
        }

        let listaCapturadas = capturadas.joined(separator: ", ")
        let listaOmitidas = omitidas.map { "  - \($0)" }.joined(separator: "\n")
        adjuntarTexto(
            "resumen",
            "Capturadas (\(capturadas.count)): \(listaCapturadas)\nOmitidas (\(omitidas.count)):\n\(listaOmitidas)\n"
        )
        XCTAssertFalse(capturadas.isEmpty, "No se pudo hacer ni una sola captura")
    }

    // MARK: - Captura

    /// Hace la captura numerada `NN-nombre` y la deja como adjunto del resultado.
    private func capturar(_ numero: Int, _ nombre: String) {
        despejarAlertas()
        esperarSinCarga()
        let prefijo = numero < 10 ? "0\(numero)" : "\(numero)"
        let etiqueta = "\(prefijo)-\(nombre)"
        let pantalla = XCUIScreen.main.screenshot()

        let adjunto = XCTAttachment(screenshot: pantalla)
        adjunto.name = etiqueta
        adjunto.lifetime = .keepAlways
        add(adjunto)
        guardarEnDisco(pantalla, etiqueta)
        capturadas.append(etiqueta)
    }

    /// Copia el PNG a la carpeta que indique `NEXARA_SHOT_DIR` (si existe). Es una
    /// red de seguridad: un fallo aqui no rompe nada.
    private func guardarEnDisco(_ pantalla: XCUIScreenshot, _ etiqueta: String) {
        guard let ruta = ProcessInfo.processInfo.environment["NEXARA_SHOT_DIR"], !ruta.isEmpty else { return }
        let carpeta = URL(fileURLWithPath: ruta, isDirectory: true)
        try? FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
        try? pantalla.pngRepresentation.write(to: carpeta.appendingPathComponent("\(etiqueta).png"))
    }

    private func omitir(_ motivo: String) {
        omitidas.append(motivo)
    }

    private func adjuntarTexto(_ nombre: String, _ texto: String) {
        let adjunto = XCTAttachment(string: texto)
        adjunto.name = nombre
        adjunto.lifetime = .keepAlways
        add(adjunto)
    }

    /// Arbol de accesibilidad de la pantalla actual: dice que identificadores
    /// existen de verdad cuando algo no se encuentra.
    private func adjuntarJerarquia(_ nombre: String) {
        adjuntarTexto(nombre, app.debugDescription)
    }

    // MARK: - Navegacion

    /// Toca la pestana y espera a que termine la animacion. `false` si no existe.
    private func irAPestana(_ pestana: Pestana) -> Bool {
        tocarSiExiste(elementosDePestana(pestana), timeout: 6)
    }

    /// Por identificador (lo que pone la app) y, como plan B, por la etiqueta visible.
    /// La barra inferior es propia (`NxBottomBar`, igual que Android): sus pestañas
    /// son botones con `tab-<clave>`, no elementos de `app.tabBars`.
    private func elementosDePestana(_ pestana: Pestana) -> [XCUIElement] {
        [
            app.buttons.matching(identifier: pestana.id).firstMatch,
            app.descendants(matching: .any).matching(identifier: pestana.id).firstMatch,
            app.tabBars.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", pestana.etiqueta)).firstMatch
        ]
    }

    private func botonCampana() -> [XCUIElement] {
        [
            app.descendants(matching: .any).matching(identifier: "bell-button").firstMatch,
            app.navigationBars.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Notificaciones")).firstMatch
        ]
    }

    /// Un renglón del hub «Más» por identificador y, como plan B, por su etiqueta.
    private func renglonDelHub(_ id: String, etiqueta: String) -> [XCUIElement] {
        [
            app.descendants(matching: .any).matching(identifier: id).firstMatch,
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", etiqueta)).firstMatch,
            app.cells.matching(NSPredicate(format: "label BEGINSWITH %@", etiqueta)).firstMatch
        ]
    }

    private func botonesCerrar() -> [XCUIElement] {
        ["Cerrar", "Listo", "Hecho"].map {
            app.buttons.matching(NSPredicate(format: "label == %@", $0)).firstMatch
        }
    }

    /// Primera fila de una lista o primera tarjeta-boton de un ScrollView.
    private func primeraFila() -> [XCUIElement] {
        [
            app.cells.firstMatch,
            app.scrollViews.buttons.firstMatch,
            app.scrollViews.otherElements.buttons.firstMatch
        ]
    }

    /// Titulo de la barra de navegacion visible ("" si no hay). Sirve para saber si
    /// una pulsacion navego de verdad o no hizo nada.
    private func tituloActual() -> String {
        let barra = app.navigationBars.firstMatch
        return barra.exists ? barra.identifier : ""
    }

    /// Abre la primera fila y devuelve `true` solo si la pantalla cambio.
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

    /// Vuelve a la pantalla raiz (la que tenia ese titulo): boton de cerrar, boton
    /// de atras de la barra, o deslizar desde el borde izquierdo.
    private func volver(a tituloRaiz: String) {
        for intento in 0..<3 {
            if tituloActual() == tituloRaiz { return }
            despejarAlertas()
            switch intento {
            case 0:
                if !tocarSiExiste(botonesCerrar(), timeout: 1, pausa: 0.4) {
                    let atras = app.navigationBars.buttons.firstMatch
                    if atras.exists { tocar(atras) }
                }
            case 1:
                deslizarAtras()
            default:
                let atras = app.navigationBars.buttons.firstMatch
                if atras.exists { tocar(atras) }
            }
            Thread.sleep(forTimeInterval: 0.8)
        }
    }

    /// Cierra el hub «Más» o las notificaciones (pantallas completas con «Cerrar»)
    /// y espera a que vuelva la pantalla de debajo.
    private func cerrarPantallaModal() {
        if !tocarSiExiste(botonesCerrar(), timeout: 3) {
            deslizarAtras()
            Thread.sleep(forTimeInterval: 0.8)
        }
        // La campana de la pantalla de debajo vuelve a existir cuando el modal se fue.
        _ = buscar(botonCampana(), timeout: 4)
    }

    private func deslizarAtras() {
        let inicio = app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.5))
        let fin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))
        inicio.press(forDuration: 0.05, thenDragTo: fin)
    }

    // MARK: - Busqueda y toques tolerantes

    /// Primer elemento que exista de la lista; consulta cada 0,25 s hasta agotar el tiempo.
    private func buscar(_ candidatos: [XCUIElement], timeout: TimeInterval) -> XCUIElement? {
        let limite = Date().addingTimeInterval(timeout)
        repeat {
            for candidato in candidatos where candidato.exists {
                return candidato
            }
            Thread.sleep(forTimeInterval: 0.25)
        } while Date() < limite
        return nil
    }

    /// Toca el primer candidato que exista y espera a que acabe la animacion.
    /// Devuelve `false` (sin fallar el test) si ninguno existe.
    @discardableResult
    private func tocarSiExiste(_ candidatos: [XCUIElement], timeout: TimeInterval = 6, pausa: TimeInterval = 0.8) -> Bool {
        despejarAlertas()
        guard let elemento = buscar(candidatos, timeout: timeout) else { return false }
        tocar(elemento)
        Thread.sleep(forTimeInterval: pausa)
        return true
    }

    /// `tap()` falla el test si el elemento no es «hittable»; tocar por coordenada no.
    private func tocar(_ elemento: XCUIElement) {
        if elemento.isHittable {
            elemento.tap()
        } else {
            elemento.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
    }

    /// Espera (poco) a que desaparezcan los indicadores de carga.
    private func esperarSinCarga(_ segundos: TimeInterval = 5) {
        let limite = Date().addingTimeInterval(segundos)
        while Date() < limite {
            if app.activityIndicators.count == 0 { return }
            Thread.sleep(forTimeInterval: 0.3)
        }
    }

    // MARK: - Alertas del sistema

    /// Acepta cualquier alerta de SpringBoard que este delante. El monitor de
    /// interrupciones solo salta cuando una interaccion queda bloqueada; esta
    /// comprobacion explicita cubre el resto (p. ej. antes de capturar).
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
