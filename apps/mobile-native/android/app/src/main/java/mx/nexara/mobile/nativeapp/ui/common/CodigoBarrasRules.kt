package mx.nexara.mobile.nativeapp.ui.common

/**
 * Códigos de barras leídos con la cámara o escritos a mano: limpieza, tipo y si el
 * dígito verificador cuadra. Espejo de `apps/api/src/warehouse/codigo-barras.ts`
 * (almacén) y de `normalizarCodigoEtiqueta` en `tool-nomenclature.ts` (herramientas).
 * El API vuelve a validar; esto solo evita mandar lo que de seguro rebota.
 */
object CodigoBarrasRules {
    const val LARGO_MINIMO = 3
    const val LARGO_MAXIMO = 64

    enum class Tipo { UPC_A, EAN_13, EAN_8, GTIN_14, INTERNO }

    data class Clasificado(
        val codigo: String,
        val tipo: Tipo,
        /** Parece UPC/EAN (12 o 13 dígitos) pero el verificador no cuadra: casi siempre un dedazo. */
        val sospechoso: Boolean,
    )

    private val CONTROL = Regex("[\\u0000-\\u001f\\u007f]")
    private val PREFIJO_AIM = Regex("^\\][A-Za-z][0-9A-Za-z]")
    private val DIGITOS = Regex("^\\d+$")
    private val IMPRIMIBLE = Regex("^[\\x20-\\x7e]+$")
    private val LARGOS_GTIN = setOf(8, 12, 13, 14)

    /** Quita espacios, caracteres de control y el prefijo AIM (`]C1`, `]E0`) que meten algunos lectores. */
    fun limpiar(valor: String?): String =
        valor.orEmpty().replace(CONTROL, "").trim().replace(PREFIJO_AIM, "").trim()

    /** Dígito verificador GTIN del cuerpo sin verificador (pesos 3-1 desde la derecha). */
    fun digitoVerificadorGtin(cuerpo: String): Int {
        require(DIGITOS.matches(cuerpo)) { "El cuerpo de un GTIN solo lleva dígitos" }
        var suma = 0
        for (i in cuerpo.indices) {
            val digito = cuerpo[cuerpo.length - 1 - i] - '0'
            suma += digito * (if (i % 2 == 0) 3 else 1)
        }
        return (10 - (suma % 10)) % 10
    }

    fun esGtinValido(codigo: String): Boolean {
        if (!DIGITOS.matches(codigo) || codigo.length !in LARGOS_GTIN) return false
        return digitoVerificadorGtin(codigo.dropLast(1)) == codigo.last() - '0'
    }

    fun clasificar(valor: String?): Clasificado {
        val codigo = limpiar(valor)
        if (esGtinValido(codigo)) {
            val tipo = when (codigo.length) {
                12 -> Tipo.UPC_A
                13 -> Tipo.EAN_13
                8 -> Tipo.EAN_8
                else -> Tipo.GTIN_14
            }
            return Clasificado(codigo, tipo, sospechoso = false)
        }
        // 8 dígitos sin verificador válido puede ser un UPC-E legítimo: no se marca.
        val sospechoso = DIGITOS.matches(codigo) && (codigo.length == 12 || codigo.length == 13)
        return Clasificado(codigo, Tipo.INTERNO, sospechoso)
    }

    /** Por qué no se puede buscar este código de producto, o null si está bien. */
    fun motivoInvalido(valor: String?): String? {
        val c = clasificar(valor)
        return when {
            c.codigo.isEmpty() -> "Escanea o escribe un código de barras"
            c.codigo.length < LARGO_MINIMO -> "El código es demasiado corto (mínimo $LARGO_MINIMO caracteres)"
            c.codigo.length > LARGO_MAXIMO -> "El código es demasiado largo (máximo $LARGO_MAXIMO caracteres)"
            !IMPRIMIBLE.matches(c.codigo) -> "El código trae caracteres que un lector no puede leer"
            c.sospechoso -> "Parece un UPC/EAN pero el dígito verificador no cuadra. Vuelve a escanearlo."
            else -> null
        }
    }

    /** ¿Tiene caso pedirle datos al catálogo internacional? Solo GTIN de 12 a 14 dígitos. */
    fun esConsultableInternacional(valor: String?): Boolean =
        clasificar(valor).tipo in setOf(Tipo.UPC_A, Tipo.EAN_13, Tipo.GTIN_14)

    fun etiquetaTipo(tipo: Tipo): String = when (tipo) {
        Tipo.UPC_A -> "UPC-A"
        Tipo.EAN_13 -> "EAN-13"
        Tipo.EAN_8 -> "EAN-8"
        Tipo.GTIN_14 -> "GTIN-14"
        Tipo.INTERNO -> "Código interno"
    }

    /**
     * Etiqueta de herramienta (Code 128 con la nomenclatura `PREFIJO-SERIE`): sin lo que mete
     * el lector alrededor y en mayúsculas, igual que la compara el API.
     */
    fun normalizarEtiquetaHerramienta(valor: String?): String =
        valor.orEmpty().replace(CONTROL, "").trim().replace(PREFIJO_AIM, "").trim().uppercase()

    fun motivoEtiquetaInvalida(valor: String?): String? {
        val codigo = normalizarEtiquetaHerramienta(valor)
        return when {
            codigo.isEmpty() -> "Escanea o escribe la etiqueta de la herramienta"
            codigo.length > LARGO_MAXIMO -> "La etiqueta es demasiado larga (máximo $LARGO_MAXIMO caracteres)"
            !IMPRIMIBLE.matches(codigo) -> "La etiqueta trae caracteres que un lector no puede leer"
            else -> null
        }
    }

    /** Cantidad de un movimiento: entera o decimal con punto o coma, mayor que cero. */
    fun parseCantidad(texto: String?): Double? {
        val limpio = texto.orEmpty().trim().replace(',', '.')
        val n = limpio.toDoubleOrNull() ?: return null
        return n.takeIf { it > 0 && it.isFinite() }
    }
}
