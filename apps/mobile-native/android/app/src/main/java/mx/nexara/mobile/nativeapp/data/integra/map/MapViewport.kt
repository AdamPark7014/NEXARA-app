package mx.nexara.mobile.nativeapp.data.integra.map

/** Desplazamiento del plano en píxeles, medido desde el centro. */
data class Pan(val x: Float, val y: Float) {
    companion object {
        val ZERO = Pan(0f, 0f)
    }
}

/**
 * Zoom y arrastre del plano.
 *
 * Aparte de la pantalla y sin tipos de Compose para poder probarlo: los dos
 * fallos clásicos de un visor con gestos son de aritmética, no de dibujo.
 *
 *  1. **El plano se escapa.** Sin recorte, dos dedos torpes mandan la imagen
 *     fuera del marco y el operador se queda con una pantalla gris sin manera
 *     obvia de volver. Aquí el desplazamiento no puede pasar del borde.
 *  2. **`NaN` invisible.** Un gesto que termina con cero punteros puede producir
 *     `Float.NaN`; metido en un `graphicsLayer` no lanza ninguna excepción,
 *     simplemente deja de dibujarse todo. Se sanea en la entrada.
 */
object MapViewport {

    const val MIN_SCALE = 1f
    const val MAX_SCALE = 6f

    /** Zoom del doble toque: suficiente para leer el nombre de una puerta. */
    const val DOUBLE_TAP_SCALE = 2.5f

    fun clampScale(raw: Float): Float {
        if (!raw.isFinite()) return MIN_SCALE
        return raw.coerceIn(MIN_SCALE, MAX_SCALE)
    }

    /**
     * Recorta el desplazamiento al margen que el zoom deja libre.
     *
     * A escala 1 el margen es cero, así que el plano queda clavado: con la
     * imagen entera a la vista, arrastrarla sólo desorienta.
     */
    fun clampPan(pan: Pan, scale: Float, viewportWidth: Float, viewportHeight: Float): Pan {
        val s = clampScale(scale)
        val maxX = maxOffset(s, viewportWidth)
        val maxY = maxOffset(s, viewportHeight)
        return Pan(
            x = sane(pan.x).coerceIn(-maxX, maxX),
            y = sane(pan.y).coerceIn(-maxY, maxY),
        )
    }

    /**
     * Nuevo zoom tras un pellizco, con el desplazamiento ya recortado al margen
     * que queda. Sin esto, alejar deja el plano descentrado y con banda negra.
     */
    fun applyGesture(
        scale: Float,
        pan: Pan,
        zoomChange: Float,
        panChange: Pan,
        viewportWidth: Float,
        viewportHeight: Float,
    ): Pair<Float, Pan> {
        val factor = if (zoomChange.isFinite() && zoomChange > 0f) zoomChange else 1f
        val newScale = clampScale(scale * factor)
        val moved = Pan(
            x = sane(pan.x) + sane(panChange.x),
            y = sane(pan.y) + sane(panChange.y),
        )
        return newScale to clampPan(moved, newScale, viewportWidth, viewportHeight)
    }

    /** Alterna entre plano completo y acercado. El doble toque siempre recentra. */
    fun toggleZoom(scale: Float): Pair<Float, Pan> =
        if (clampScale(scale) > MIN_SCALE) MIN_SCALE to Pan.ZERO else DOUBLE_TAP_SCALE to Pan.ZERO

    /**
     * Posición del pin en píxeles dentro del plano ya dibujado.
     *
     * El porcentaje se mide contra la imagen, no contra el hueco de la pantalla:
     * quien la dibuja tiene que darle a este cálculo el rectángulo real de la
     * imagen, o los pines saldrán corridos en cuanto el plano tenga bandas.
     */
    fun pinOffset(xPct: Float, yPct: Float, contentWidth: Float, contentHeight: Float): Pan = Pan(
        x = sane(xPct).coerceIn(0f, 100f) / 100f * sane(contentWidth),
        y = sane(yPct).coerceIn(0f, 100f) / 100f * sane(contentHeight),
    )

    /**
     * Proporción del plano, con red por si la imagen viene degenerada. Un `0`
     * en `Modifier.aspectRatio` lanza; devolver 1 deja un cuadrado y se ve.
     */
    fun aspectRatio(width: Int, height: Int): Float {
        if (width <= 0 || height <= 0) return 1f
        val r = width.toFloat() / height.toFloat()
        return if (r.isFinite() && r > 0f) r.coerceIn(0.05f, 20f) else 1f
    }

    private fun maxOffset(scale: Float, viewport: Float): Float {
        val v = sane(viewport)
        if (v <= 0f) return 0f
        return ((scale - 1f) * v / 2f).coerceAtLeast(0f)
    }

    private fun sane(v: Float): Float = if (v.isFinite()) v else 0f
}
