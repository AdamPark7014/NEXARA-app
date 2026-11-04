package mx.nexara.mobile.nativeapp.ui.console.herramientas

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import mx.nexara.mobile.nativeapp.data.api.KitAsignacionDto
import mx.nexara.mobile.nativeapp.data.api.KitPiezaDto
import mx.nexara.mobile.nativeapp.data.api.PrestamoHerramientaDto
import mx.nexara.mobile.nativeapp.data.api.RenovacionPendienteDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormat

/**
 * Las cuentas de Herramientas, sin una sola línea de Android: así se prueban en
 * la JVM (`HerramientasRulesTest`) y la pantalla se queda solo con el dibujo.
 *
 * Toda la lógica de esta pantalla es de fechas, y las fechas del API llegan como
 * texto ISO en UTC. Compararlas «a ojo» con `startsWith` o `take(10)` es de donde
 * salen los «vence hoy» que en realidad vencieron ayer: aquí se pasan siempre por
 * [fecha], que devuelve `null` cuando no entiende en vez de inventar una.
 *
 * El vocabulario de estados es el del servidor (`ToolRequestStatus` y
 * `ToolInventoryStatus` de `schema.prisma`), traducido a lo que una persona de
 * campo diría: `IN_USE` no es «en uso», es «la traes tú».
 */
object HerramientasRules {

    /** La zona en la que trabaja la gente; con ella se decide qué día es «hoy». */
    val ZONA: ZoneId = ZoneId.of("America/Mexico_City")

    /**
     * Tono de la tarjeta, en vocabulario propio.
     *
     * No se usa `NxTone` aquí a propósito: ese enum vive junto a los composables
     * y arrastrar la interfaz a las reglas obligaría a levantar Compose para
     * probar una resta de días. La pantalla traduce.
     */
    enum class Tono { NEUTRO, EXITO, AVISO, PELIGRO, INFO, MARCA }

    // ── Quién mira ───────────────────────────────────────────────────────────

    /**
     * Adam (04-11-2026): el CEO ve lo administrativo sin escáner, Iván da de alta y aprueba, y la gente
     * solo pide. Lo decide `PorRol`; aquí está qué le toca a cada uno.
     */
    enum class Perfil { DIRECCION, ADMINISTRA, PERSONAL }

    fun perfil(esDireccion: Boolean, administra: Boolean): Perfil = when {
        esDireccion -> Perfil.DIRECCION
        administra -> Perfil.ADMINISTRA
        else -> Perfil.PERSONAL
    }

    /** Las pestañas de la pantalla. La primera de [vistas] es la que se abre. */
    enum class Vista(val etiqueta: String) {
        POR_APROBAR("Por aprobar"),
        EMPRESA("Préstamos"),
        INVENTARIO("Inventario"),
        KIT("Mi kit"),
        PRESTAMOS("Mis préstamos"),
    }

    fun vistas(perfil: Perfil): List<Vista> = when (perfil) {
        Perfil.DIRECCION -> listOf(Vista.EMPRESA, Vista.INVENTARIO)
        Perfil.ADMINISTRA -> listOf(Vista.POR_APROBAR, Vista.EMPRESA, Vista.INVENTARIO, Vista.KIT, Vista.PRESTAMOS)
        Perfil.PERSONAL -> listOf(Vista.KIT, Vista.PRESTAMOS)
    }

    /** Solo quien entrega y recibe con la herramienta en la mano. */
    fun muestraEscaner(perfil: Perfil): Boolean = perfil == Perfil.ADMINISTRA

    /** El único botón principal de cada pestaña; `null` donde solo se consulta. */
    enum class BotonPrincipal(val etiqueta: String) {
        PEDIR_PRESTAMO("Pedir préstamo"),
        NUEVA_HERRAMIENTA("Nueva herramienta"),
    }

    fun botonPrincipal(perfil: Perfil, vista: Vista): BotonPrincipal? = when {
        perfil == Perfil.ADMINISTRA && vista == Vista.INVENTARIO -> BotonPrincipal.NUEVA_HERRAMIENTA
        perfil != Perfil.DIRECCION && (vista == Vista.KIT || vista == Vista.PRESTAMOS) -> BotonPrincipal.PEDIR_PRESTAMO
        else -> null
    }

    /** Dirección no toca nada; solo Iván entrega y recibe. */
    fun puedeOperar(perfil: Perfil): Boolean = perfil == Perfil.ADMINISTRA

    /** Qué préstamos se enseñan. «Abiertos» es lo que todavía se debe. */
    enum class FiltroPrestamo(val etiqueta: String) {
        ABIERTOS("Abiertos"),
        TODOS("Historial"),
    }

    // ── Estados ──────────────────────────────────────────────────────────────

    private fun clave(valor: String?): String = valor?.trim()?.uppercase(Locale.ROOT).orEmpty()

    /** `ToolRequestStatus` dicho como se dice en campo. */
    fun etiquetaEstado(status: String?): String = when (clave(status)) {
        "PENDING" -> "Por aprobar"
        "APPROVED" -> "Lista para recoger"
        "IN_USE" -> "La traes tú"
        "RETURNED" -> "Devuelta"
        "DAMAGED" -> "Devuelta con daño"
        "REJECTED" -> "Rechazada"
        else -> "Sin estado"
    }

    fun tonoEstado(status: String?): Tono = when (clave(status)) {
        "PENDING" -> Tono.AVISO
        "APPROVED" -> Tono.INFO
        "IN_USE" -> Tono.MARCA
        "RETURNED" -> Tono.EXITO
        "DAMAGED", "REJECTED" -> Tono.PELIGRO
        else -> Tono.NEUTRO
    }

    /** `ToolInventoryStatus` de la pieza del kit. */
    fun etiquetaEstadoPieza(status: String?): String = when (clave(status)) {
        "AVAILABLE" -> "Disponible"
        "ASSIGNED" -> "Asignada"
        "IN_REPAIR" -> "En reparación"
        "RETIRED" -> "Dada de baja"
        else -> "Sin estado"
    }

    fun tonoEstadoPieza(status: String?): Tono = when (clave(status)) {
        "ASSIGNED" -> Tono.MARCA
        "AVAILABLE" -> Tono.EXITO
        "IN_REPAIR" -> Tono.AVISO
        "RETIRED" -> Tono.PELIGRO
        else -> Tono.NEUTRO
    }

    /** Lo que todavía cuenta, y lo que se lee de toda la empresa. */
    val ESTADOS_ABIERTOS: List<String> = listOf("PENDING", "APPROVED", "IN_USE")

    /** Todavía cuenta: o la esperas, o la tienes. Lo devuelto y lo rechazado es historia. */
    fun estaAbierto(prestamo: PrestamoHerramientaDto): Boolean =
        clave(prestamo.status) in ESTADOS_ABIERTOS

    /** El estado visto desde fuera: «La traes tú» solo es cierto para quien la trae. */
    fun etiquetaEstadoEmpresa(status: String?): String = when (clave(status)) {
        "APPROVED" -> "Por entregar"
        "IN_USE" -> "Prestada"
        else -> etiquetaEstado(status)
    }

    /**
     * Solo se pide más plazo de algo que ya te dieron.
     *
     * Con la solicitud en `PENDING` no hay fecha que correr —nadie ha aprobado
     * nada— y el servidor aceptaría la renovación igual, dejando una petición de
     * prórroga colgando de un préstamo que quizá se rechace.
     */
    fun sePuedeRenovar(prestamo: PrestamoHerramientaDto): Boolean =
        clave(prestamo.status) in setOf("APPROVED", "IN_USE")

    // ── Fechas ───────────────────────────────────────────────────────────────

    private val FORMATO_CORTO: DateTimeFormatter =
        mx.nexara.mobile.nativeapp.ui.enterprise.NxFormat.patron("d MMM yyyy")

    /**
     * Texto ISO del API → el día que le toca en México.
     *
     * Prisma serializa `DateTime` como `2026-09-30T00:00:00.000Z`. Ese instante
     * en UTC es el 29 a las 18:00 en México, así que convertir a la zona local
     * daría un día antes del que la web enseña. Una fecha de vencimiento es un
     * **día**, no un instante, y por eso se lee el día que trae el texto tal cual.
     */
    fun fecha(iso: String?): LocalDate? {
        val texto = iso?.trim()?.takeIf { it.length >= 10 } ?: return null
        return runCatching { LocalDate.parse(texto.substring(0, 10)) }.getOrNull()
    }

    /** El instante completo; solo hace falta para saber si un código ya caducó. */
    fun instante(iso: String?): Instant? {
        val texto = iso?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return runCatching { Instant.parse(texto) }.getOrNull()
    }

    /** «30 sep 2026», o vacío si no hay fecha: nunca un «null» en pantalla. */
    fun fechaCorta(iso: String?): String = fecha(iso)?.format(FORMATO_CORTO).orEmpty()

    fun fechaCorta(dia: LocalDate): String = dia.format(FORMATO_CORTO)

    /** Días que faltan para [iso]. Negativo = ya venció. `null` = no hay fecha. */
    fun diasPara(iso: String?, hoy: LocalDate): Long? {
        val dia = fecha(iso) ?: return null
        return ChronoUnit.DAYS.between(hoy, dia)
    }

    /**
     * El plazo en palabras: «Venció hace 3 días», «Vence hoy», «Vence mañana»,
     * «Faltan 5 días».
     *
     * Siempre se dice con letras además del color, porque el color no llega a
     * quien no lo distingue ni al sol de mediodía.
     */
    fun textoPlazo(iso: String?, hoy: LocalDate): String? {
        val dias = diasPara(iso, hoy) ?: return null
        return when {
            dias < -1L -> "Venció hace ${-dias} días"
            dias == -1L -> "Venció ayer"
            dias == 0L -> "Vence hoy"
            dias == 1L -> "Vence mañana"
            else -> "Faltan $dias días"
        }
    }

    /** Rojo pasado el plazo, ámbar en los tres días previos, gris el resto. */
    fun tonoPlazo(iso: String?, hoy: LocalDate): Tono {
        val dias = diasPara(iso, hoy) ?: return Tono.NEUTRO
        return when {
            dias < 0L -> Tono.PELIGRO
            dias <= 3L -> Tono.AVISO
            else -> Tono.NEUTRO
        }
    }

    /** Pasado de fecha y todavía sin devolver: lo que hay que resolver hoy mismo. */
    fun estaVencido(prestamo: PrestamoHerramientaDto, hoy: LocalDate): Boolean {
        if (!estaAbierto(prestamo)) return false
        return (diasPara(prestamo.expectedReturnDate, hoy) ?: return false) < 0L
    }

    /**
     * ¿El código de recolección sigue sirviendo?
     *
     * Sin `pickupExpiresAt` se da por bueno: el servidor solo pone caducidad
     * cuando la hay, y esconder el código por falta de un dato dejaría a alguien
     * parado en la ventanilla sin nada que enseñar.
     */
    fun codigoVigente(prestamo: PrestamoHerramientaDto, ahora: Instant): Boolean {
        if (prestamo.pickupCode.isNullOrBlank()) return false
        if (prestamo.pickedUpAt != null) return false
        val caduca = instante(prestamo.pickupExpiresAt) ?: return true
        return ahora.isBefore(caduca)
    }

    // ── Kit ──────────────────────────────────────────────────────────────────

    /** Partes de daño que nadie ha dictaminado todavía. */
    fun eventosAbiertos(asignacion: KitAsignacionDto): Int =
        asignacion.events.orEmpty().count { clave(it.resolution) == "PENDING" || it.resolvedAt == null }

    /** Revisión periódica pasada de fecha. Sin revisión programada no hay nada que vencer. */
    fun revisionVencida(asignacion: KitAsignacionDto, hoy: LocalDate): Boolean {
        val dias = diasPara(asignacion.proximaInspeccion, hoy) ?: return false
        return dias < 0L
    }

    /** Lo que traigo encima ahora mismo: asignaciones vivas, sin devolver. */
    fun kitActivo(kit: List<KitAsignacionDto>): List<KitAsignacionDto> =
        kit.filter { it.isActive != false && it.returnedAt == null }

    /** Nombre de la pieza; si el inventario no trae nombre, al menos el modelo. */
    fun tituloPieza(asignacion: KitAsignacionDto): String = tituloPieza(asignacion.inventoryItem)

    fun tituloPieza(item: KitPiezaDto?): String =
        item?.toolName?.trim()?.ifEmpty { null }
            ?: item?.model?.trim()?.ifEmpty { null }
            ?: item?.codigoInterno?.trim()?.ifEmpty { null }
            ?: "Herramienta sin nombre"

    /**
     * Código, modelo y serie, cada uno listo para su renglón y en ese orden.
     *
     * Vacío si no hay nada: la pantalla pone entonces «Sin identificación registrada».
     */
    fun renglonesPieza(asignacion: KitAsignacionDto): List<String> = renglonesPieza(asignacion.inventoryItem)

    fun renglonesPieza(item: KitPiezaDto?): List<String> = listOfNotNull(
        item?.codigoInterno?.trim()?.ifEmpty { null },
        item?.model?.trim()?.ifEmpty { null },
        item?.serialNumber?.trim()?.ifEmpty { null }?.let { "Serie $it" },
    )

    /** «MUL-12345 · Makita HP1640 · Serie 4419B» — la misma identificación, dicha de un tirón. */
    fun identificacionPieza(asignacion: KitAsignacionDto): String {
        val partes = renglonesPieza(asignacion)
        return if (partes.isEmpty()) "Sin identificación registrada" else partes.joinToString(" · ")
    }

    /** Lo mismo para un préstamo, que guarda su propia copia de los datos. */
    fun tituloPrestamo(prestamo: PrestamoHerramientaDto): String =
        prestamo.toolName?.trim()?.ifEmpty { null }
            ?: prestamo.model?.trim()?.ifEmpty { null }
            ?: "Herramienta sin nombre"

    /** Modelo y serie del préstamo, cada uno en su renglón. El préstamo no trae código interno. */
    fun renglonesPrestamo(prestamo: PrestamoHerramientaDto): List<String> = listOfNotNull(
        prestamo.model?.trim()?.ifEmpty { null },
        prestamo.serialNumber?.trim()?.ifEmpty { null }?.let { "Serie $it" },
    )

    fun identificacionPrestamo(prestamo: PrestamoHerramientaDto): String {
        val partes = renglonesPrestamo(prestamo)
        return if (partes.isEmpty()) "Sin identificación registrada" else partes.joinToString(" · ")
    }

    // ── Orden y filtros ──────────────────────────────────────────────────────

    /**
     * Primero lo que urge: lo vencido, luego lo abierto por fecha de devolución
     * más cercana, y al final el historial de lo más reciente a lo más viejo.
     *
     * Un préstamo abierto sin fecha de devolución se va detrás de los que sí la
     * tienen: no se puede decir que urja algo que nadie fechó.
     */
    fun ordenarPrestamos(prestamos: List<PrestamoHerramientaDto>, hoy: LocalDate): List<PrestamoHerramientaDto> =
        prestamos.sortedWith(
            compareBy(
                { if (estaVencido(it, hoy)) 0 else if (estaAbierto(it)) 1 else 2 },
                { diasPara(it.expectedReturnDate, hoy) ?: Long.MAX_VALUE },
                { fecha(it.requestDate)?.toEpochDay()?.unaryMinus() ?: 0L },
            ),
        )

    /** El kit se ordena por lo que reclama atención: daño abierto, revisión vencida, y el resto por nombre. */
    fun ordenarKit(kit: List<KitAsignacionDto>, hoy: LocalDate): List<KitAsignacionDto> =
        kit.sortedWith(
            compareBy(
                { if (eventosAbiertos(it) > 0) 0 else 1 },
                { if (revisionVencida(it, hoy)) 0 else 1 },
                { tituloPieza(it).lowercase(Locale.ROOT) },
            ),
        )

    fun filtrarPrestamos(
        prestamos: List<PrestamoHerramientaDto>,
        filtro: FiltroPrestamo,
    ): List<PrestamoHerramientaDto> = when (filtro) {
        FiltroPrestamo.ABIERTOS -> prestamos.filter { estaAbierto(it) }
        FiltroPrestamo.TODOS -> prestamos
    }

    /** Buscar por nombre, modelo o serie, que es como se busca una herramienta a ojo. */
    fun buscarPrestamos(prestamos: List<PrestamoHerramientaDto>, consulta: String): List<PrestamoHerramientaDto> {
        val q = consulta.trim().lowercase(Locale.ROOT)
        if (q.isEmpty()) return prestamos
        return prestamos.filter { prestamo ->
            listOfNotNull(prestamo.toolName, prestamo.model, prestamo.serialNumber, prestamo.reason, prestamo.usuario?.nombre)
                .any { it.lowercase(Locale.ROOT).contains(q) }
        }
    }

    // ── Resúmenes ────────────────────────────────────────────────────────────

    /** «2 vencidas · 3 abiertas», o `null` cuando no hay nada abierto que contar. */
    fun resumenPrestamos(prestamos: List<PrestamoHerramientaDto>, hoy: LocalDate): String? {
        val abiertos = prestamos.filter { estaAbierto(it) }
        if (abiertos.isEmpty()) return null
        val vencidos = abiertos.count { estaVencido(it, hoy) }
        val partes = mutableListOf<String>()
        if (vencidos > 0) partes += if (vencidos == 1) "1 vencida" else "$vencidos vencidas"
        val resto = abiertos.size - vencidos
        if (resto > 0) partes += if (resto == 1) "1 abierta" else "$resto abiertas"
        return partes.joinToString(" · ")
    }

    /** Lo que el kit reclama: daños sin cerrar y revisiones pasadas de fecha. */
    fun resumenKit(kit: List<KitAsignacionDto>, hoy: LocalDate): String? {
        val activo = kitActivo(kit)
        val conDanio = activo.count { eventosAbiertos(it) > 0 }
        val conRevision = activo.count { revisionVencida(it, hoy) }
        val partes = mutableListOf<String>()
        if (conDanio > 0) partes += if (conDanio == 1) "1 con daño sin cerrar" else "$conDanio con daño sin cerrar"
        if (conRevision > 0) {
            partes += if (conRevision == 1) "1 con revisión vencida" else "$conRevision con revisión vencida"
        }
        return partes.takeIf { it.isNotEmpty() }?.joinToString(" · ")
    }

    // ── Renovación ───────────────────────────────────────────────────────────

    /**
     * Los plazos que se ofrecen al renovar, contados desde la fecha que hoy
     * tiene el préstamo — o desde hoy si ya venció, porque ampliar una fecha
     * pasada dejaría un plazo que nace vencido.
     */
    fun fechasSugeridas(
        prestamo: PrestamoHerramientaDto,
        hoy: LocalDate,
        dias: List<Long> = listOf(7L, 15L, 30L),
    ): List<Pair<String, LocalDate>> {
        val base = fecha(prestamo.expectedReturnDate)?.takeIf { !it.isBefore(hoy) } ?: hoy
        return dias.map { d -> "+$d días" to base.plusDays(d) }
    }

    /**
     * La fecha elegida, en el texto que espera el API.
     *
     * Se manda mediodía UTC a propósito: el servidor hace `new Date(...)` y la
     * guarda tal cual, y con `T00:00:00Z` la misma fecha se leería como el día
     * anterior en cualquier huso al oeste de Greenwich —México incluido—, que es
     * exactamente el bug de «pedí hasta el 30 y me dieron hasta el 29».
     */
    fun fechaParaApi(fecha: LocalDate): String = "${fecha}T12:00:00.000Z"

    // ── Toda la empresa ──────────────────────────────────────────────────────

    /** Qué préstamos de la empresa se enseñan. Los dos son de lo que sigue abierto. */
    enum class FiltroEmpresa(val etiqueta: String) {
        ABIERTOS("Abiertos"),
        VENCIDOS("Vencidos"),
    }

    fun filtrarEmpresa(
        prestamos: List<PrestamoHerramientaDto>,
        filtro: FiltroEmpresa,
        hoy: LocalDate,
    ): List<PrestamoHerramientaDto> = when (filtro) {
        FiltroEmpresa.ABIERTOS -> prestamos.filter { estaAbierto(it) }
        FiltroEmpresa.VENCIDOS -> prestamos.filter { estaVencido(it, hoy) }
    }

    /** Lo que espera a Iván, de lo más viejo a lo más nuevo: lo primero que entró es lo que más espera. */
    fun porAprobar(prestamos: List<PrestamoHerramientaDto>): List<PrestamoHerramientaDto> =
        prestamos.filter { clave(it.status) == "PENDING" }.sortedBy { it.requestDate.orEmpty() }

    /** Lo que ya se aprobó o se entregó: la pestaña «Préstamos» de Iván. */
    fun porOperar(prestamos: List<PrestamoHerramientaDto>): List<PrestamoHerramientaDto> =
        prestamos.filter { clave(it.status) in setOf("APPROVED", "IN_USE") }

    fun personaDe(prestamo: PrestamoHerramientaDto): String =
        prestamo.usuario?.nombre?.trim()?.ifEmpty { null } ?: "Sin persona registrada"

    /** Lo que Iván hace con un préstamo; `null` si todavía no le toca o ya se cerró. */
    enum class AccionAlmacen(val etiqueta: String) {
        ENTREGAR("Entregar"),
        NUEVO_CODIGO("Generar otro código"),
        RECIBIR("Recibir"),
    }

    /**
     * Con el código de recolección vencido el servidor no deja entregar (`validarPickup`). Lo que sí
     * deja es volver a aprobar, que genera otro. Sin código, un préstamo viejo, se entrega y ya.
     */
    fun accionAlmacen(prestamo: PrestamoHerramientaDto, ahora: Instant): AccionAlmacen? = when (clave(prestamo.status)) {
        "APPROVED" -> if (codigoVencido(prestamo, ahora)) AccionAlmacen.NUEVO_CODIGO else AccionAlmacen.ENTREGAR
        "IN_USE" -> AccionAlmacen.RECIBIR
        else -> null
    }

    fun codigoVencido(prestamo: PrestamoHerramientaDto, ahora: Instant): Boolean {
        if (prestamo.pickupCode.isNullOrBlank()) return false
        val caduca = instante(prestamo.pickupExpiresAt) ?: return false
        return !ahora.isBefore(caduca)
    }

    /** Solo se pide teclear el código a quien lo tiene: uno viejo sin código se entrega sin más. */
    fun pideCodigo(prestamo: PrestamoHerramientaDto): Boolean = !prestamo.pickupCode.isNullOrBlank()

    fun nombreRenovacion(renovacion: RenovacionPendienteDto): String =
        renovacion.toolRequest?.let { tituloPrestamo(it) } ?: "Herramienta sin nombre"

    fun quienPideRenovacion(renovacion: RenovacionPendienteDto): String =
        renovacion.toolRequest?.let { personaDe(it) } ?: "Sin persona registrada"

    // ── Inventario ───────────────────────────────────────────────────────────

    fun buscarInventario(piezas: List<KitPiezaDto>, consulta: String): List<KitPiezaDto> {
        val q = consulta.trim().lowercase(Locale.ROOT)
        val ordenadas = piezas.sortedBy { tituloPieza(it).lowercase(Locale.ROOT) }
        if (q.isEmpty()) return ordenadas
        return ordenadas.filter { pieza ->
            listOfNotNull(pieza.toolName, pieza.model, pieza.serialNumber, pieza.codigoInterno, pieza.barcode)
                .any { it.lowercase(Locale.ROOT).contains(q) }
        }
    }

    /**
     * `GET inventory` no dice quién trae cada pieza: se cruza con los préstamos abiertos y los kits.
     * Si la pieza dice estar asignada y no aparece en ninguna de las dos, se dice así, sin inventar nombre.
     */
    fun quienLaTrae(
        pieza: KitPiezaDto,
        prestamos: List<PrestamoHerramientaDto>,
        kits: List<KitAsignacionDto>,
    ): String {
        val id = pieza.id
        if (id != null) {
            prestamos.firstOrNull { it.inventoryItemId == id && clave(it.status) == "IN_USE" }?.let {
                return "La trae ${personaDe(it)}"
            }
            prestamos.firstOrNull { it.inventoryItemId == id && clave(it.status) == "APPROVED" }?.let {
                return "Por entregar a ${personaDe(it)}"
            }
            kitActivo(kits).firstOrNull { it.inventoryItemId == id }?.user?.nombre?.trim()?.ifEmpty { null }?.let {
                return "En el kit de $it"
            }
        }
        return when (clave(pieza.status)) {
            "AVAILABLE" -> "En almacén"
            "ASSIGNED" -> "Asignada; falta saber a quién"
            "IN_REPAIR" -> "En reparación"
            "RETIRED" -> "Dada de baja"
            else -> "Sin estado"
        }
    }

    // ── Formularios ──────────────────────────────────────────────────────────

    const val MIN_MOTIVO = 5

    fun motivoValido(texto: String): Boolean = texto.trim().length >= MIN_MOTIVO

    /** Qué le falta a «Pedir préstamo»; `null` si ya se puede mandar. */
    fun faltaParaPedir(piezaId: Long?, regreso: LocalDate?, motivo: String, hoy: LocalDate): String? = when {
        piezaId == null -> "Elige la herramienta."
        regreso == null -> "Di cuándo la regresas."
        regreso.isBefore(hoy) -> "La fecha de regreso ya pasó."
        motivo.isBlank() -> "Escribe para qué la necesitas."
        else -> null
    }

    /** Qué le falta a «Nueva herramienta». El servidor exige las dos fotos. */
    fun faltaParaAlta(
        nombre: String,
        modelo: String,
        serie: String,
        conPanoramica: Boolean,
        conFotoSerie: Boolean,
    ): String? = when {
        nombre.isBlank() -> "Escribe el nombre."
        modelo.isBlank() -> "Escribe el modelo."
        serie.isBlank() -> "Escribe el número de serie."
        !conPanoramica -> "Falta la foto de la herramienta completa."
        !conFotoSerie -> "Falta la foto del número de serie."
        else -> null
    }

    const val AVISO_PRESTAMO_PEDIDO = "Préstamo pedido: cuando lo aprueben aquí sale tu código para recogerla."

    const val AVISO_DANIO = "Daño reportado: almacén lo va a revisar."

    const val AVISO_DANIO_COLA = "Sin conexión: el reporte quedó en la cola y sale solo al volver la señal."

    // ── Vacíos y pie ─────────────────────────────────────────────────────────

    data class Vacio(val titulo: String, val texto: String)

    /** Sin coincidencias o sin nada dado de alta: el servidor no distingue, así que no se afirma ninguna. */
    fun vacioDeBusqueda(consulta: String): Vacio = Vacio(
        titulo = "No salió ninguna herramienta libre",
        texto = "Con «${consulta.trim()}» no encontramos ninguna disponible. Prueba con otra palabra o " +
            "pregúntale a Iván: él las da de alta, y la que buscas puede estar prestada.",
    )

    const val AYUDA_BUSQUEDA = "Escribe el nombre, el modelo o la serie."

    fun vacioInventario(perfil: Perfil): Vacio = Vacio(
        titulo = "Todavía no hay herramientas dadas de alta",
        texto = when (perfil) {
            Perfil.ADMINISTRA -> "Da de alta la primera con su nombre, modelo, serie y dos fotos."
            else -> "Las da de alta Iván. En cuanto haya, aquí ves cuáles son y quién las trae."
        },
    )

    fun vacioPrestamosEmpresa(perfil: Perfil, filtro: FiltroEmpresa, total: Int): Vacio = when {
        filtro == FiltroEmpresa.VENCIDOS && total > 0 ->
            Vacio("Ningún préstamo vencido", "Todo lo prestado sigue dentro de su fecha.")
        perfil == Perfil.ADMINISTRA ->
            Vacio("Nada por entregar ni por recibir", "Cuando apruebes un préstamo aparece aquí para entregarlo.")
        else ->
            Vacio("Sin préstamos abiertos", "Cuando alguien pida una herramienta y la aprueben, aquí la ves.")
    }

    val VACIO_POR_APROBAR = Vacio(
        "Nada por aprobar",
        "Cuando alguien pida una herramienta o más plazo, aparece aquí.",
    )

    val VACIO_MIS_PRESTAMOS = Vacio(
        "Todavía no pides herramienta prestada",
        "Toca «Pedir préstamo», busca la herramienta y di cuándo la regresas. " +
            "Aquí sale su fecha y su código para recogerla.",
    )

    /** Lo que esta pantalla no hace, dicho al pie sin mandar a nadie al navegador. */
    fun limite(perfil: Perfil): String = when (perfil) {
        Perfil.DIRECCION -> "Solo lectura: aprobar, entregar y dar de alta lo hace Iván."
        Perfil.ADMINISTRA -> "Asignar kits, imprimir etiquetas y dictaminar daños se hacen desde la computadora."
        Perfil.PERSONAL -> "Aquí pides, renuevas y reportas daños. Aprobar y entregar lo hace almacén."
    }
}
