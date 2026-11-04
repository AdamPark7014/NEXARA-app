import Foundation

/// Estado de Herramientas — espejo de `HerramientasUiState` / `HerramientasViewModel.kt`.
///
/// La regla que ordena todo: **un refresco fallido no borra lo que ya se veía**. La
/// primera carga fallida deja `error` y pantalla de error; a partir de ahí, lo que
/// falla se cuenta en `avisoRefresco`, una cinta encima de la lista de siempre.
/// `error` y «no tienes nada» nunca conviven: mientras haya `error` no se pinta el
/// estado vacío.
struct HerramientasEstado {
    var cargando = true
    var refrescando = false
    /// Primera carga fallida: no hay nada en pantalla.
    var error: String?
    /// Refresco fallido con datos viejos todavía puestos.
    var avisoRefresco: String?
    /// Una parte falló y las otras no: se dice, pero no tapa lo que sí llegó.
    var avisoParcial: String?
    var kit: [KitAsignacion] = []
    var prestamos: [PrestamoHerramienta] = []
    /// Los préstamos de toda la empresa (dirección y quien administra).
    var empresa: [PrestamoHerramienta] = []
    var renovaciones: [RenovacionHerramienta] = []
    var inventario: [PiezaDeInventario] = []
    /// Los kits de la gente: solo sirven para decir quién trae cada pieza.
    var kitsEmpresa: [KitAsignacion] = []
    var cargado = false
    /// Una acción en curso: los botones y las hojas se bloquean mientras tanto.
    var enviando = false
    var accionError: String?
}

/// Herramientas por rol: lo que cada quien lee y lo que puede hacer (`HerramientasReglas.Perfil`).
///
/// El día de hoy se fija al crear la pantalla (`hoy`) en vez de leerse en cada
/// dibujo: los plazos («vence mañana») se calculan en varios sitios de la misma
/// lista y dos lecturas del reloj a caballo de la medianoche darían dos respuestas.
@MainActor
final class HerramientasViewModel: ObservableObject {
    /// Quién mira. Se fija al abrir: el menú ya se decidió con la misma sesión.
    let perfil: HerramientasReglas.Perfil = HerramientasReglas.perfil(de: SessionStore.shared.currentUser)

    @Published private(set) var estado = HerramientasEstado()
    @Published var vista: HerramientasReglas.Vista = HerramientasReglas.vistaInicial(
        HerramientasReglas.perfil(de: SessionStore.shared.currentUser)
    )
    @Published var filtro: HerramientasReglas.FiltroPrestamo = .abiertos
    @Published var filtroEmpresa: HerramientasReglas.FiltroEmpresa = .abiertos
    @Published var consulta = ""
    /// Aviso pasajero al pie (Android `Snackbar`).
    @Published private(set) var mensaje: String?

    /// Qué día es hoy donde está la persona, no donde está el servidor.
    let hoy = HerramientasReglas.Dia.hoy()

    /// Un solo instante para toda la lista: dos lecturas del reloj podrían dar por
    /// caducado un código en una tarjeta y por vigente el mismo en otra. Se
    /// renueva cada vez que llegan préstamos nuevos.
    @Published private(set) var ahora = Date()

    private var arrancado = false
    /// Cada carga lleva su número: si una vieja contesta después de una nueva, se ignora.
    private var generacion = 0
    private var tareaMensaje: Task<Void, Never>?

    // MARK: Listas ya calculadas

    var kitVisible: [KitAsignacion] {
        HerramientasReglas.ordenarKit(HerramientasReglas.kitActivo(estado.kit), hoy: hoy)
    }

    var prestamosVisibles: [PrestamoHerramienta] {
        HerramientasReglas.ordenarPrestamos(
            HerramientasReglas.buscarPrestamos(
                HerramientasReglas.filtrarPrestamos(estado.prestamos, filtro: filtro),
                consulta: consulta
            ),
            hoy: hoy
        )
    }

    /// «Préstamos» de toda la empresa: primero lo vencido y lo que vence antes.
    var empresaVisibles: [PrestamoHerramienta] {
        HerramientasReglas.ordenarPrestamos(
            HerramientasReglas.buscarPrestamos(
                HerramientasReglas.prestamosDeEmpresa(estado.empresa, perfil: perfil, filtro: filtroEmpresa, hoy: hoy),
                consulta: consulta
            ),
            hoy: hoy
        )
    }

    var pendientes: [PrestamoHerramienta] { HerramientasReglas.pendientes(estado.empresa) }

    var renovacionesPendientes: [RenovacionHerramienta] {
        HerramientasReglas.renovacionesPendientes(estado.renovaciones)
    }

    var inventarioVisible: [PiezaDeInventario] {
        HerramientasReglas.buscarInventario(estado.inventario, consulta: consulta)
    }

    /// El botón principal de la pestaña en que se está; `nil` en las que solo se consulta.
    var botonPrincipal: HerramientasReglas.BotonPrincipal? {
        HerramientasReglas.botonPrincipal(perfil, vista: vista)
    }

    /// Primera carga fallida: no hay nada que enseñar y el vacío no aplica.
    var soloError: Bool { estado.error != nil && !estado.cargado }

    // MARK: Carga

    /// La primera carga la dispara la pantalla, no el constructor: volver a la
    /// pantalla no vuelve a pedirlo todo.
    func arrancar() async {
        guard !arrancado else { return }
        arrancado = true
        await cargar(refresco: false)
    }

    func refrescar() async { await cargar(refresco: true) }

    func reintentar() async { await cargar(refresco: estado.cargado) }

    func descartarAviso() { estado.avisoRefresco = nil }

    /// La búsqueda es de la pestaña en que se escribió: en otra lista no significa nada.
    func cambiarVista(_ nueva: HerramientasReglas.Vista) {
        if nueva != vista { consulta = "" }
        vista = nueva
    }

    func cambiarFiltro(_ nuevo: HerramientasReglas.FiltroPrestamo) { filtro = nuevo }

    func cambiarFiltroEmpresa(_ nuevo: HerramientasReglas.FiltroEmpresa) { filtroEmpresa = nuevo }

    func limpiarAccionError() { estado.accionError = nil }

    private func cargar(refresco: Bool) async {
        generacion += 1
        let mia = generacion
        if refresco {
            estado.refrescando = true
            estado.avisoRefresco = nil
        } else {
            estado.cargando = true
            estado.error = nil
            estado.avisoRefresco = nil
        }

        let datos = await HerramientasRepository.shared.cargar(perfil: perfil)
        guard mia == generacion else { return }

        // Que caiga todo es lo único que cuenta como «no se pudo»: con una parte viva la
        // pantalla sigue sirviendo. Se prefiere el mensaje de la parte principal de cada
        // quien, que es el que más veces acierta.
        if datos.todoFallo {
            let primero = datos.falloPrestamos ?? datos.falloEmpresa ?? datos.falloKit ?? datos.falloInventario
            let mensaje = primero?.toUserMessage(fallback: "No se pudieron cargar las herramientas")
                ?? "No se pudieron cargar las herramientas"
            estado.cargando = false
            estado.refrescando = false
            if estado.cargado {
                estado.avisoRefresco = mensaje
            } else {
                estado.error = mensaje
            }
            return
        }

        estado.cargando = false
        estado.refrescando = false
        estado.error = nil
        estado.avisoRefresco = nil
        estado.avisoParcial = Self.avisoParcial(datos)
        estado.kit = datos.kit
        estado.prestamos = datos.prestamos
        estado.empresa = datos.empresa
        estado.renovaciones = datos.renovaciones
        estado.inventario = datos.inventario
        estado.kitsEmpresa = datos.kitsEmpresa
        estado.cargado = true
        ahora = Date()
    }

    /// Qué parte no llegó, en una línea. `nil` cuando llegaron todas.
    private static func avisoParcial(_ datos: HerramientasRepository.Datos) -> String? {
        if let fallo = datos.falloEmpresa { return fallo.toUserMessage(fallback: "No se pudieron leer los préstamos") }
        if let fallo = datos.falloInventario { return fallo.toUserMessage(fallback: "No se pudo leer el inventario") }
        if let fallo = datos.falloRenovaciones { return fallo.toUserMessage(fallback: "No se pudieron leer las prórrogas") }
        if let fallo = datos.falloKit { return fallo.toUserMessage(fallback: "No se pudo leer tu kit") }
        if let fallo = datos.falloPrestamos { return fallo.toUserMessage(fallback: "No se pudieron leer tus préstamos") }
        return nil
    }

    // MARK: Acciones

    /// Nada es optimista: la fila cambia cuando el servidor confirma y se relee. Mientras
    /// falle, la hoja se queda abierta con lo que la persona escribió.
    private func ejecutar(
        hecho: String,
        fallo: String,
        bloque: @escaping () async throws -> Void
    ) async -> Bool {
        guard !estado.enviando else { return false }
        estado.enviando = true
        estado.accionError = nil
        do {
            try await bloque()
            estado.enviando = false
            avisar(hecho)
            await cargar(refresco: true)
            return true
        } catch {
            estado.enviando = false
            estado.accionError = error.toUserMessage(fallback: fallo)
            return false
        }
    }

    /// Lo que no tiene hoja abierta cuenta su error en el aviso del pie.
    private func contarError() {
        guard let texto = estado.accionError else { return }
        estado.accionError = nil
        avisar(texto)
    }

    func aprobar(_ prestamo: PrestamoHerramienta) async {
        let id = prestamo.id
        _ = await ejecutar(
            hecho: "Préstamo aprobado: ya tiene su código para recoger.",
            fallo: "No se pudo aprobar el préstamo"
        ) { try await HerramientasRepository.shared.aprobar(prestamoId: id) }
        contarError()
    }

    func rechazar(_ prestamo: PrestamoHerramienta, motivo: String) async -> Bool {
        let id = prestamo.id
        return await ejecutar(
            hecho: "Préstamo rechazado.",
            fallo: "No se pudo rechazar el préstamo"
        ) { try await HerramientasRepository.shared.rechazar(prestamoId: id, motivo: motivo) }
    }

    func aprobarRenovacion(_ renovacion: RenovacionHerramienta) async {
        let id = renovacion.id
        _ = await ejecutar(
            hecho: "Prórroga aprobada.",
            fallo: "No se pudo aprobar la prórroga"
        ) { try await HerramientasRepository.shared.aprobarRenovacion(id: id) }
        contarError()
    }

    func rechazarRenovacion(_ renovacion: RenovacionHerramienta, motivo: String) async -> Bool {
        let id = renovacion.id
        return await ejecutar(
            hecho: "Prórroga rechazada.",
            fallo: "No se pudo rechazar la prórroga"
        ) { try await HerramientasRepository.shared.rechazarRenovacion(id: id, motivo: motivo) }
    }

    /// Registra la salida con el código que enseña quien la recoge.
    func entregar(_ prestamo: PrestamoHerramienta, codigo: String) async -> Bool {
        let id = prestamo.id
        return await ejecutar(
            hecho: "Salida registrada: \(HerramientasReglas.tituloPrestamo(prestamo)).",
            fallo: "No se pudo registrar la salida"
        ) { try await EscaneoRepository.shared.entregarHerramienta(prestamoId: id, pickupCode: codigo) }
    }

    /// Registra la entrada. Con daño, la pieza queda en reparación.
    func recibir(_ prestamo: PrestamoHerramienta, danio: String) async -> Bool {
        let id = prestamo.id
        let hecho = danio.nilSiVacio == nil
            ? "Entrada registrada: \(HerramientasReglas.tituloPrestamo(prestamo))."
            : "Entrada registrada con daño: queda en reparación."
        return await ejecutar(
            hecho: hecho,
            fallo: "No se pudo registrar la entrada"
        ) { try await EscaneoRepository.shared.recibirHerramienta(prestamoId: id, damageDescription: danio) }
    }

    /// Reporta un daño de una pieza de mi kit. Es lo único de aquí que puede esperar en la cola.
    func reportarDanio(_ asignacion: KitAsignacion, descripcion: String) async -> Bool {
        guard !estado.enviando else { return false }
        estado.enviando = true
        estado.accionError = nil
        do {
            let encolado = try await HerramientasRepository.shared.reportarDanio(
                asignacionId: asignacion.id,
                descripcion: descripcion
            )
            estado.enviando = false
            avisar(encolado
                ? "Sin conexión: el reporte quedó en la cola y sale solo al volver la señal."
                : "Daño reportado: almacén lo revisa.")
            if !encolado { await cargar(refresco: true) }
            return true
        } catch {
            estado.enviando = false
            estado.accionError = error.toUserMessage(fallback: "No se pudo reportar el daño")
            return false
        }
    }

    /// Lo que crearon las hojas con formulario propio: el aviso y la relectura.
    func alCrear(_ aviso: String) {
        avisar(aviso)
        Task { await self.cargar(refresco: true) }
    }

    // MARK: Prórroga

    /// Aviso cuando la prórroga salió, en una frase.
    ///
    /// Sigue siendo lo mismo: ya se pidió y queda pendiente de que la autoricen.
    static func avisoProrrogaSolicitada() -> String {
        "Prórroga solicitada: queda pendiente de que la autoricen."
    }

    /// Pide más plazo. Devuelve `true` si salió (o si quedó en cola): mientras falle,
    /// el diálogo se queda abierto con lo que la persona eligió.
    func renovar(_ prestamo: PrestamoHerramienta, fecha: HerramientasReglas.Dia, motivo: String?) async -> Bool {
        guard !estado.enviando else { return false }
        estado.enviando = true
        estado.accionError = nil
        do {
            let encolado = try await HerramientasRepository.shared.pedirRenovacion(
                prestamoId: prestamo.id,
                nuevaFecha: fecha,
                motivo: motivo
            )
            estado.enviando = false
            avisar(encolado
                ? "Sin conexión: la prórroga quedó en la cola y sale sola al volver la señal."
                : Self.avisoProrrogaSolicitada())
            Task { await self.cargar(refresco: true) }
            return true
        } catch {
            estado.enviando = false
            estado.accionError = error.toUserMessage(fallback: "No se pudo pedir la prórroga")
            return false
        }
    }

    // MARK: Aviso pasajero

    /// Lo enseña unos segundos y lo quita solo (Android `SnackbarDuration.Short`).
    func avisar(_ texto: String) {
        tareaMensaje?.cancel()
        mensaje = texto
        tareaMensaje = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            guard !Task.isCancelled else { return }
            self?.mensaje = nil
        }
    }

    func cerrarMensaje() {
        tareaMensaje?.cancel()
        mensaje = nil
    }
}
