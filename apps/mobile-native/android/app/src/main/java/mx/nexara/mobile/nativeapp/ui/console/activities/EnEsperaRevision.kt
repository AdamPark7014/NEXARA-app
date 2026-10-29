package mx.nexara.mobile.nativeapp.ui.console.activities

import java.time.Instant
import mx.nexara.mobile.nativeapp.data.api.RevisionPendienteDto

/**
 * «En espera de revisión» (apps/web/lib/revisiones-api.ts y EnEsperaRevisionView.tsx): la
 * evidencia enviada que quien mira puede aprobar o devolver. Lo enviado ya cuenta como cumplido y
 * revisarlo tarde no es un atraso (Adam, 29-10): la espera solo informa, sin semáforo.
 */
object EnEsperaRevision {
    /** Cuánto lleva esperando, en minutos (null sin fecha o con fecha inválida). */
    fun minutosEsperando(iso: String?, ahora: Instant = Instant.now()): Long? {
        val t = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return null
        return ((ahora.toEpochMilli() - t.toEpochMilli()) / 60_000L).coerceAtLeast(0L)
    }

    /** «hace 25 min», «hace 3 h», «hace 2 días». */
    fun textoEspera(minutos: Long?): String {
        if (minutos == null) return "Sin fecha de envío"
        if (minutos < 1) return "hace un momento"
        if (minutos < 60) return "hace $minutos min"
        val horas = minutos / 60
        if (horas < 24) return "hace $horas h"
        val dias = horas / 24
        return if (dias == 1L) "hace 1 día" else "hace $dias días"
    }

    /** La que más lleva esperando va primero; las que no traen fecha, al final. */
    fun ordenar(items: List<RevisionPendienteDto>): List<RevisionPendienteDto> =
        items.sortedWith(
            compareBy<RevisionPendienteDto, Instant?>(nullsLast()) { r ->
                r.enviadaAt?.let { iso -> runCatching { Instant.parse(iso) }.getOrNull() }
            },
        )

    /** «AN-0130 · Cableado de nodos». */
    fun titulo(r: RevisionPendienteDto): String =
        listOfNotNull(r.anNumber?.takeIf { it.isNotBlank() }, r.titulo?.takeIf { it.isNotBlank() })
            .joinToString(" · ")
            .ifEmpty { "Actividad #${r.activityId}" }

    /** «Iván Pérez · enviada hace 3 h» (o «corrección reenviada…»). */
    fun detalle(r: RevisionPendienteDto, ahora: Instant = Instant.now()): String {
        val quien = r.persona?.nombre?.takeIf { it.isNotBlank() }?.let { CoreActivityRules.shortName(it) }
        val min = minutosEsperando(r.enviadaAt, ahora)
        val cuando = when {
            min == null -> "sin fecha de envío"
            r.correccion == true -> "corrección reenviada ${textoEspera(min)}"
            else -> "enviada ${textoEspera(min)}"
        }
        return listOfNotNull(quien, cuando).joinToString(" · ")
    }
}
