package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Los tres módulos de «Más» que son **solo consulta** — espejo de:
 *
 * | Pantalla          | Endpoint                                              |
 * |-------------------|-------------------------------------------------------|
 * | KPIs del equipo   | `GET me/kpis/equipo?desde&hasta` (`me/me.controller.ts`) |
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
    /**
     * Confianza del índice si el API ya la manda por persona: `alta` · `media` · `baja`, o un
     * objeto con `nivel` (o `valor`/`clave`). Mientras no venga, la app la calcula como la web
     * (`KpisEquipoRules.confianza`). `Any?` para aceptar las dos formas sin tumbar la respuesta.
     */
    val confianza: Any? = null,
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
    // ── «En tiempo y forma» (07-10). La API vieja no manda nada de esto: todo `null`.
    /** Entregas de actividades del rango. La API nueva lo manda SIEMPRE, aunque sea en ceros. */
    val entregas: KpiEntregasDto? = null,
    /** Días laborables en que checó a tiempo, de los que debía checar (binario: con o sin retardo). */
    val asistenciaPuntual: KpiAsistenciaPuntualDto? = null,
    /**
     * Índice de desempeño v2, 0–100 (29-10): 30 Confiabilidad + 25 Calidad + 30 Rendimiento +
     * 15 Disciplina. El nombre del campo es el de siempre. `null` = nada que medir en el rango.
     */
    val cumplimientoPct: Double? = null,
    /**
     * De qué está hecho el índice. Las de peso > 0 se agrupan en los cuatro pilares
     * (`KpisEquipoRules.pilares`); las de peso 0 (tiempo, ritmo, ocupación, carga, días) son
     * solo diagnóstico: se leen, no cuentan.
     */
    val cumplimientoPartes: List<KpiParteCumplimientoDto>? = null,
    // ── Índice v2 (29-10). Un API anterior no los manda: `null`.
    /** Puntualidad graduada y registro completo (pilar Disciplina). */
    val disciplina: KpiDisciplinaDto? = null,
    /** Calificación de sus revisiones, calibrada por revisor (0–100). */
    val calificacion: KpiCalificacionDto? = null,
    /** `campo` u `oficina`: decide la meta de Rendimiento. */
    val familia: String? = null,
    /** Meta de Rendimiento ya ponderada (0.6 = 60 %). */
    val metaRendimiento: Double? = null,
    /** Solo coordinadores: su equipo y sus revisiones. */
    val equipo: KpiEquipoCoordinadoDto? = null,
    /**
     * Confianza del índice (`alta` · `media` · `baja`, por entregas medidas: ≥ 20, 10–19, < 10).
     * El API la manda como texto desde f2dc7130; `Any?` para aceptar también un objeto.
     */
    val confianza: Any? = null,
    /**
     * Semáforo del índice (`cumplimientoPct`) ya calculado por el API con sus cortes únicos
     * (≥ 90 verde, ≥ 75 amarillo): `verde` · `amarillo` · `rojo` · `sin_datos`.
     */
    val semaforoIndice: Any? = null,
    /** Los cuatro pilares ya agrupados por el API con los pesos v2, con su semáforo. */
    val pilares: List<KpiPilarDto>? = null,
)

/** Un pilar del índice v2 como lo manda el API: `{ id, label, pct, semaforo }`. */
data class KpiPilarDto(
    /** `confiabilidad` · `calidad` · `rendimiento` · `disciplina`. */
    val id: String? = null,
    val label: String? = null,
    /** 0–100; `null` = sin dato en el rango (no pesa). */
    val pct: Double? = null,
    /** `verde` · `amarillo` · `rojo` · `sin_datos` (`Any?`: también un objeto). */
    val semaforo: Any? = null,
)

/**
 * Disciplina v2: por día que debía checar, hasta 15 min tarde 1 punto · 16–30 0.6 · 31–60 0.3 ·
 * más o sin checar 0; cada 3 retardos, una falta en el índice; × registro completo.
 */
data class KpiDisciplinaDto(
    val esperados: Int? = null,
    /** Con decimales («4.6»): por eso `Double`. */
    val puntos: Double? = null,
    /** Días que llegó más de 15 min tarde. */
    val retardos: Int? = null,
    val faltasPorRetardos: Int? = null,
    /** Jornadas terminadas y, de ellas, con salida propia y comida registrada. */
    val jornadasRevisables: Int? = null,
    val registroCompleto: Int? = null,
    val pct: Double? = null,
)

data class KpiCalificacionDto(
    val n: Int? = null,
    val pct: Double? = null,
)

/** Coordinación: lo de su equipo (él incluido) y sus revisiones. */
data class KpiEquipoCoordinadoDto(
    val personas: Int? = null,
    val aTiempo: Int? = null,
    val medidas: Int? = null,
    val minutosEstandarGanados: Int? = null,
    val minutosLaborados: Int? = null,
    val revisiones: KpiRevisionesDto? = null,
)

/** Revisiones que hizo en el rango y cuántas dentro de 24 h hábiles del envío. */
data class KpiRevisionesDto(
    val total: Int? = null,
    val enPlazo: Int? = null,
)

/** Las entregas del rango: el «tiempo y forma». */
data class KpiEntregasDto(
    /** Entregadas en el rango + las que vencieron en el rango sin entregarse. */
    val medidas: Int? = null,
    /** Entregadas antes de su límite (sin límite cuenta a tiempo). */
    val aTiempo: Int? = null,
    val tarde: Int? = null,
    /** Su límite ya pasó y no la ha entregado. */
    val sinEntregar: Int? = null,
    /** Con al menos una revisión del jefe. */
    val revisadas: Int? = null,
    val aprobadasALaPrimera: Int? = null,
    val devueltas: Int? = null,
    /** 0–100; `null` sin medidas. */
    val pctATiempo: Double? = null,
    /** 0–100; `null` sin revisadas. */
    val pctALaPrimera: Double? = null,
    // ── Horas estándar ganadas (pilar Rendimiento, 29-10).
    /** Entregadas que traían tiempo estándar. */
    val conEstandar: Int? = null,
    /** Suma de sus estándares (lo autoasignado sin validar, la mitad). */
    val minutosEstandarGanados: Int? = null,
    val minutosRealesConEstandar: Int? = null,
    /** Estándar ÷ real con tope de 100; `null` sin dato. */
    val pctEficienciaEstandar: Double? = null,
)

data class KpiAsistenciaPuntualDto(
    val esperados: Int? = null,
    val puntuales: Int? = null,
    val pct: Double? = null,
)

/** Una parte del índice: «Entregas a tiempo · 17 de 18 · 94 % · pesa 30». */
data class KpiParteCumplimientoDto(
    /**
     * Con peso: `entregas` (Confiabilidad), `forma` (Calidad), `estandar` (Rendimiento),
     * `asistencia` y `uniforme` (Disciplina). Con peso 0, diagnóstico: `tiempo`, `ritmo`,
     * `ocupacion`, `carga`, `dias`.
     */
    val clave: String? = null,
    val etiqueta: String? = null,
    /** 0–100. */
    val pct: Double? = null,
    /** Lo que pesa en el índice (suman 100); 0 = diagnóstico, no cuenta. */
    val peso: Double? = null,
    /** «17 de 18», «7 de 8 días». */
    val detalle: String? = null,
    /**
     * Semáforo de la parte si el API ya lo manda: `verde` · `amarillo` · `rojo` · `sin_datos`, o
     * un objeto con `semaforo`/`nivel`/`color`. Mientras no venga, se usan los cortes del API.
     */
    val semaforo: Any? = null,
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
