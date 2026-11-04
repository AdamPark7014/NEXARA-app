package mx.nexara.mobile.nativeapp.ui.console.inicio

import mx.nexara.mobile.nativeapp.data.api.SugerenciaDto

/** Lo que decide «¿Qué sigue?» en el teléfono. Espejo: `QueSigueRules.swift`. Las sugerencias vienen de la API. */
object QueSigueRules {
    const val LARGO_PENDIENTE = 200

    enum class Boton { EMPEZAR, ABRIR_ACTIVIDAD, ABRIR_ACTIVIDADES, NINGUNO }

    private val RUTA_ACTIVIDAD = Regex("^/erp/actividades/(\\d+)")

    /** Solo cuando no trae nada corriendo: con el reloj andando, estorba. A dirección no le aplica. */
    fun mostrar(esDireccion: Boolean, algoCorriendo: Boolean): Boolean = !esDireccion && !algoCorriendo

    fun actividadDe(href: String?): Long? = href?.let { RUTA_ACTIVIDAD.find(it)?.groupValues?.get(1)?.toLongOrNull() }

    /** Lo de Mesa contable y Obra vive en la web: en el teléfono se lee, sin botón que no lleve a ningún lado. */
    fun botonDe(s: SugerenciaDto): Boton = when {
        s.accion == "empezar" -> Boton.EMPEZAR
        actividadDe(s.href) != null -> Boton.ABRIR_ACTIVIDAD
        s.href?.startsWith("/erp/pizarra") == true -> Boton.ABRIR_ACTIVIDADES
        else -> Boton.NINGUNO
    }

    fun pendienteValido(texto: String): Boolean = texto.trim().length in 1..LARGO_PENDIENTE
}
