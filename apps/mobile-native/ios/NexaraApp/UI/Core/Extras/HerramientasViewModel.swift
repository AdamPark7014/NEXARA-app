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
    /// Una de las dos mitades falló y la otra no: se dice, pero no tapa lo que sí llegó.
    var avisoParcial: String?
    var kit: [KitAsignacion] = []
    var prestamos: [PrestamoHerramienta] = []
    var cargado = false
    /// Prórroga en curso: el diálogo se bloquea mientras tanto.
    var enviando = false
    var accionError: String?
}

/// «Mi kit» y «Mis préstamos» del personal de campo.
///
/// El día de hoy se fija al crear la pantalla (`hoy`) en vez de leerse en cada
/// dibujo: los plazos («vence mañana») se calculan en varios sitios de la misma
/// lista y dos lecturas del reloj a caballo de la medianoche darían dos respuestas.
@MainActor
final class HerramientasViewModel: ObservableObject {
    @Published private(set) var estado = HerramientasEstado()
    @Published var vista: HerramientasReglas.Vista = .kit
    @Published var filtro: HerramientasReglas.FiltroPrestamo = .abiertos
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

    func cambiarVista(_ nueva: HerramientasReglas.Vista) { vista = nueva }

    func cambiarFiltro(_ nuevo: HerramientasReglas.FiltroPrestamo) { filtro = nuevo }

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

        let datos = await HerramientasRepository.shared.cargar()
        guard mia == generacion else { return }

        // Las dos listas caídas es lo único que cuenta como «no se pudo»: con una sola
        // viva la pantalla sigue sirviendo. Se prefiere el fallo de los préstamos: es la
        // mitad que todo el mundo tiene, así que su mensaje es el que más veces acierta.
        if datos.todoFallo {
            let mensaje = (datos.falloPrestamos ?? datos.falloKit)?
                .toUserMessage(fallback: "No se pudieron cargar tus herramientas")
                ?? "No se pudieron cargar tus herramientas"
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
        estado.cargado = true
        ahora = Date()
    }

    /// Qué mitad no llegó, en una línea. `nil` cuando llegaron las dos.
    private static func avisoParcial(_ datos: HerramientasRepository.Datos) -> String? {
        if let fallo = datos.falloKit { return fallo.toUserMessage(fallback: "No se pudo leer tu kit") }
        if let fallo = datos.falloPrestamos { return fallo.toUserMessage(fallback: "No se pudieron leer tus préstamos") }
        return nil
    }

    // MARK: Prórroga

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
                : "Prórroga solicitada. Queda pendiente de que la autoricen.")
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
