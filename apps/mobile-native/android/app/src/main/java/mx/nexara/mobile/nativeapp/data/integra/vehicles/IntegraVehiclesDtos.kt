package mx.nexara.mobile.nativeapp.data.integra.vehicles

/**
 * DTOs de vehículos y ANPR.
 *
 * **Regla dura de este fichero: todo campo que la API pueda devolver nulo es
 * nulable en Kotlin.** Un no-nulable que recibe `null` hace que Moshi lance
 * `JsonDataException` y la pantalla se queda vacía sin explicar por qué; ese
 * patrón ya se ha visto en este proyecto. Aquí incluso `id` y `plate` son
 * nulables, porque la rama «live» del servidor hace `String(v.vehicleId ?? '')`
 * y `v.plateNo || ''`: puede llegar cadena vacía, y con Artemis fuera de línea
 * el campo puede no venir. El saneado ocurre en [VehiculoDto.aDominio].
 */

// ── Vehículos ────────────────────────────────────────────────────────────────

data class VehiculoDto(
    val id: String? = null,
    val plate: String? = null,
    val personId: String? = null,
    val personName: String? = null,
) {
    /**
     * Convierte a dominio. Devuelve `null` si la ficha no tiene identificador:
     * sin `id` no se puede editar ni borrar, y pintarla sería ofrecer botones
     * que fallan.
     */
    fun aDominio(): Vehiculo? {
        val idLimpio = id?.trim().orEmpty()
        if (idLimpio.isEmpty()) return null
        return Vehiculo(
            id = idLimpio,
            plate = plate?.trim().orEmpty(),
            personId = personId?.trim()?.ifBlank { null },
            personName = personName?.trim()?.ifBlank { null },
        )
    }
}

data class VehiculosResponse(
    val total: Int? = null,
    /** `mirror` = espejo en NEXARA. `live` = leído de la plataforma. */
    val source: String? = null,
    val syncNote: String? = null,
    val items: List<VehiculoDto>? = null,
)

/**
 * Cuerpo de `POST`/`PATCH integra/vehicles`.
 *
 * `personId` distingue tres casos y por eso es nulable:
 *   · `null`  → Moshi lo omite; en `PATCH` significa «no toques al dueño».
 *   · `""`    → el servidor hace `personId || null`: **quita** al dueño.
 *   · un id   → lo asigna.
 */
data class VehiculoWriteRequest(
    val plateNo: String,
    val personId: String? = null,
)

/** Respuesta de alta/edición/baja. Todos los campos son informativos. */
data class VehiculoMutacionResponse(
    val success: Boolean? = null,
    val deviceSync: Boolean? = null,
    val note: String? = null,
)

// ── Personas (padrón para asignar dueño) ─────────────────────────────────────

data class PersonaDto(
    val id: String? = null,
    val personId: String? = null,
    val name: String? = null,
    val personName: String? = null,
    val code: String? = null,
    val personCode: String? = null,
    val orgName: String? = null,
) {
    fun aDominio(): PersonaResumen? {
        val idLimpio = (id ?: personId)?.trim().orEmpty()
        val nombre = (name ?: personName)?.trim().orEmpty()
        if (idLimpio.isEmpty()) return null
        return PersonaResumen(
            id = idLimpio,
            // Sin nombre la fila sería un hueco: se enseña el id, que al menos
            // permite localizarla en la plataforma.
            name = if (nombre.isNotEmpty()) nombre else "Persona $idLimpio",
            code = (code ?: personCode)?.trim()?.ifBlank { null },
            orgName = orgName?.trim()?.ifBlank { null },
        )
    }
}

data class PersonasResponse(
    val total: Int? = null,
    val items: List<PersonaDto>? = null,
)

// ── Cámaras (para nombrar el `cameraIndexCode` de cada cruce) ────────────────

data class CamaraDto(
    val id: String? = null,
    val name: String? = null,
    /**
     * Lo dice el servidor tras interrogar al equipo (`isapi.discovery.ts`), no
     * esta app. Si es `null` es que no se sabe, y así se enseña.
     */
    val anprCapable: Boolean? = null,
)

data class CamarasResponse(
    val total: Int? = null,
    val source: String? = null,
    val items: List<CamaraDto>? = null,
)

data class CamaraOpcion(
    val id: String,
    val name: String,
    val anprCapable: Boolean? = null,
)

// ── ANPR ─────────────────────────────────────────────────────────────────────

/**
 * Cuerpo de la petición (§5.8.2). Los `Opt.` del manual son filtros DE
 * SERVIDOR: al mandarlos, HikCentral acota la búsqueda entera, no la página
 * descargada. Moshi omite los nulos, así que un filtro vacío no viaja.
 */
data class AnprQueryRequest(
    /** Req. — 1 a 2 147 483 647. */
    val pageNo: Int,
    /** Req. — entre 1 y 500. */
    val pageSize: Int,
    /** Req. — ISO 8601 con huso. */
    val startTime: String,
    /** Req. — ISO 8601 con huso. Máximo 31 días desde `startTime`. */
    val endTime: String,
    /**
     * El manual la marca Req., pero el backend reenvía el cuerpo sin tocarlo y
     * la instalación acepta la búsqueda sin cámara (devuelve todas las del
     * parque). Se manda solo si el operador elige una.
     */
    val cameraIndexCode: String? = null,
    /** Filtro de servidor. Hasta 16 caracteres. */
    val plateNo: String? = null,
    /** Filtro de servidor. Hasta 64 caracteres. */
    val ownerName: String? = null,
    /** Único valor admitido por el manual. */
    val sortField: String? = "PassTime",
    /** 0 ascendente · 1 descendente (valor por defecto de la plataforma). */
    val orderType: Int? = 1,
)

/** Tabla A-73 · `PassVehicleRecord`. Todo opcional salvo los dos identificadores. */
data class AnprRecordDto(
    /** Req. — id del cruce, hasta 64 caracteres. */
    val crossRecordSyscode: String? = null,
    /** Req. — cámara que leyó la placa. */
    val cameraIndexCode: String? = null,
    val plateNo: String? = null,
    val ownerName: String? = null,
    val contact: String? = null,
    /** Enum «Vehicle Color» del manual. */
    val vehicleColor: Int? = null,
    /** Enum «Vehicle Type» del manual. */
    val vehicleType: Int? = null,
    /** Enum «Country/Region». No se pinta: no tenemos la tabla completa. */
    val country: Int? = null,
    /** URI interna de la foto en la plataforma. NO es una URL de navegador. */
    val vehiclePicUri: String? = null,
    /** ISO 8601 con huso: `2018-07-26T15:00:00+08:00`. */
    val crossTime: String? = null,
    val createTime: String? = null,
    /** 0 otras, 1 acercándose a la cámara, 2 alejándose. */
    val vehicleDirectionType: Int? = null,
    /** Enum «Vehicle Brand». No se pinta: la tabla del manual está incompleta. */
    val vehicleBrand: Int? = null,
    val vehicleSpeed: Double? = null,
) {
    /** Clave estable para `LazyColumn`; la misma heurística que usa la web. */
    fun claveDeLista(indice: Int): String =
        crossRecordSyscode?.takeIf { it.isNotBlank() }
            ?: "${plateNo ?: "s-placa"}-${crossTime ?: indice}"
}

/** Objeto `data` de la respuesta (§5.8.2). */
data class AnprPageResponse(
    val total: Int? = null,
    val pageNo: Int? = null,
    val pageSize: Int? = null,
    val list: List<AnprRecordDto>? = null,
)
