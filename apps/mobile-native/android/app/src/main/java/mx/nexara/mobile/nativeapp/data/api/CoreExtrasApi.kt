package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Los cuatro módulos de «Más» que son **solo consulta** — espejo de:
 *
 * | Pantalla          | Endpoint                                              |
 * |-------------------|-------------------------------------------------------|
 * | KPIs del equipo   | `GET me/kpis/equipo?desde&hasta` (`me/me.controller.ts`) |
 * | Organigrama       | `GET users/orgchart` (`users/users.controller.ts`)      |
 * | Proyectos         | `GET proyectos` (`projects/proyectos-profesional.controller.ts`) |
 * | Almacén           | `GET stock/levels` · `GET stock/alerts/low-stock` (`warehouse/stock.controller.ts`) |
 *
 * Reglas de los DTO, iguales en todo el árbol: **todo anulable con valor por
 * omisión**. Un campo que el servidor deje de mandar no puede tumbar la
 * pantalla, y los números de Prisma (`Decimal`) llegan unas veces como número y
 * otras como texto — por eso las cantidades se declaran `String?` y se
 * interpretan en las reglas puras (`AlmacenRules`), no aquí.
 */
interface CoreExtrasApi {

    @GET("me/kpis/equipo")
    suspend fun kpisEquipo(
        @Query("desde") desde: String,
        @Query("hasta") hasta: String,
    ): KpisEquipoDto

    @GET("users/orgchart")
    suspend fun orgchart(): List<OrgNodeDto>

    @GET("proyectos")
    suspend fun proyectos(): List<ProyectoResumenDto>

    @GET("stock/levels")
    suspend fun stockLevels(): List<StockLevelDto>

    @GET("stock/alerts/low-stock")
    suspend fun lowStock(): List<StockLevelDto>
}

// ── KPIs del equipo ──────────────────────────────────────────────────────────

data class KpisEquipoDto(
    /** `company` (toda la empresa) o `subtree` (mi organigrama hacia abajo). */
    val scope: String? = null,
    val desde: String? = null,
    val hasta: String? = null,
    val generadoAt: String? = null,
    /** Qué se dio por supuesto al contar; se enseña tal cual. */
    val supuestos: List<String>? = null,
    val equipo: KpiBloqueDto? = null,
    val personas: List<KpiPersonaFilaDto>? = null,
)

data class KpiBloqueDto(
    val totales: KpiTotalesDto? = null,
    /** `verde` · `amarillo` · `rojo` · `sin_datos`. */
    val semaforo: String? = null,
    val motivos: List<String>? = null,
)

data class KpiPersonaFilaDto(
    val persona: KpiPersonaDto? = null,
    val horario: KpiHorarioDto? = null,
    val totales: KpiTotalesDto? = null,
    val semaforo: String? = null,
    val motivos: List<String>? = null,
)

data class KpiPersonaDto(
    val id: Long? = null,
    val nombre: String? = null,
    val email: String? = null,
    val avatarUrl: String? = null,
    val puesto: String? = null,
)

data class KpiHorarioDto(
    val clave: String? = null,
    val etiqueta: String? = null,
    val entrada: String? = null,
    val salida: String? = null,
    val graciaMin: Int? = null,
    val jornadaOrdinariaMin: Int? = null,
    val dias: List<Int>? = null,
    val personalizado: Boolean? = null,
)

data class KpiUniformeDto(
    val revisadas: Int? = null,
    val ok: Int? = null,
    val noOk: Int? = null,
    val sinRevisar: Int? = null,
    /** % de las revisadas con ✓; `null` si nadie ha revisado ninguna. */
    val pct: Double? = null,
)

data class KpiTotalesDto(
    val diasConJornada: Int? = null,
    val diasSinChecada: Int? = null,
    val faltasJustificadas: Int? = null,
    val retardos: Int? = null,
    val minutosTarde: Int? = null,
    val uniforme: KpiUniformeDto? = null,
    val minutosLaborados: Int? = null,
    val minutosProductivos: Int? = null,
    val minutosInactivos: Int? = null,
    val productividadPct: Double? = null,
    /** `null` = sin horario (24/7, visitante): no se puede hablar de extra. */
    val minutosExtra: Int? = null,
    val minutosExtraAprobados: Int? = null,
    val minutosExtraPendientes: Int? = null,
    val diasExtraPendientes: Int? = null,
    val jornadasAbiertas: Int? = null,
    val jornadasSinSalida: Int? = null,
    val cierresAutomaticos: Int? = null,
    val actividadesFueraDeJornada: Int? = null,
)

// ── Organigrama ──────────────────────────────────────────────────────────────

data class OrgRefDto(
    val id: Long? = null,
    val nombre: String? = null,
)

/**
 * Un nodo del árbol que devuelve `users/orgchart`: ya viene anidado por
 * `managerId`, con las raíces (quien no tiene jefe dentro de la empresa) en el
 * primer nivel. [lateralDeId] es la colocación al costado del dibujo de la web:
 * no cambia a quién reporta, y en el teléfono se enseña como una etiqueta.
 */
data class OrgNodeDto(
    val id: Long? = null,
    val nombre: String? = null,
    val managerId: Long? = null,
    val lateralDeId: Long? = null,
    val puesto: String? = null,
    val avatarUrl: String? = null,
    val role: OrgRefDto? = null,
    val department: OrgRefDto? = null,
    val children: List<OrgNodeDto>? = null,
)

// ── Proyectos ────────────────────────────────────────────────────────────────

data class ProyectoPersonaDto(
    val id: Long? = null,
    val nombre: String? = null,
    val email: String? = null,
    val avatarUrl: String? = null,
)

data class ProyectoClienteDto(
    val id: Long? = null,
    val name: String? = null,
)

data class ProyectoHitoDto(
    val id: Long? = null,
    val name: String? = null,
    val plannedDate: String? = null,
    val status: String? = null,
)

data class ProyectoAvanceDto(
    val total: Int? = null,
    val cerradas: Int? = null,
    val finalizadas: Int? = null,
    val abiertas: Int? = null,
    /** 0–100. `null` cuando no hay de dónde calcularlo: no es un cero. */
    val porcentaje: Int? = null,
    /** `actividades` · `hitos` · `ninguno`. */
    val origen: String? = null,
)

data class ProyectoRequerimientosDto(
    val total: Int? = null,
    val cumplidos: Int? = null,
    val pendientes: Int? = null,
    val porcentaje: Int? = null,
)

data class ProyectoResumenSaludDto(
    /** `SIN_PLAN` · `PLANEADO` · `EN_TIEMPO` · `EN_RIESGO` · `RETRASADO` · `TERMINADO` · `CANCELADO`. */
    val salud: String? = null,
    val etiqueta: String? = null,
    val enRiesgo: Boolean? = null,
    val diasDeRetraso: Int? = null,
    val diasRestantes: Int? = null,
    val hitosVencidos: Int? = null,
    /** Una frase que se puede enseñar al cliente. */
    val motivo: String? = null,
    val avance: ProyectoAvanceDto? = null,
    val requerimientos: ProyectoRequerimientosDto? = null,
    val estadoEtiqueta: String? = null,
)

data class ProyectoResumenDto(
    val id: Long? = null,
    val title: String? = null,
    val description: String? = null,
    val status: String? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val actualEndDate: String? = null,
    val client: ProyectoClienteDto? = null,
    val responsable: ProyectoPersonaDto? = null,
    val vendor: ProyectoPersonaDto? = null,
    val documentosCount: Int? = null,
    val equipoCount: Int? = null,
    val hitosCount: Int? = null,
    val proximoHito: ProyectoHitoDto? = null,
    val resumen: ProyectoResumenSaludDto? = null,
)

// ── Almacén ──────────────────────────────────────────────────────────────────

data class StockProductoDto(
    val id: Long? = null,
    val name: String? = null,
    val sku: String? = null,
)

data class StockAlmacenDto(
    val id: Long? = null,
    val code: String? = null,
    val name: String? = null,
)

data class StockUbicacionDto(
    val id: Long? = null,
    val code: String? = null,
    val name: String? = null,
)

/**
 * Una existencia: producto × almacén. Las cantidades son `Decimal` en Prisma, y
 * eso viaja como texto (`"12.5"`) o como número según el campo y la versión —
 * se declaran `String?` porque el adaptador de Moshi sí sabe leer un número como
 * texto, y nunca al revés. Quien necesita el número llama a `AlmacenRules`.
 */
data class StockLevelDto(
    val id: Long? = null,
    val quantity: String? = null,
    val reservedQty: String? = null,
    val reorderPoint: String? = null,
    val unitCost: String? = null,
    val product: StockProductoDto? = null,
    val warehouse: StockAlmacenDto? = null,
    val location: StockUbicacionDto? = null,
)
