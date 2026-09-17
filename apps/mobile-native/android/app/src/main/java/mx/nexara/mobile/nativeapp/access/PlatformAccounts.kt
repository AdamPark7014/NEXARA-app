package mx.nexara.mobile.nativeapp.access

/**
 * Cuentas de plataforma NEXARA — espejo de `apps/web/lib/platform-accounts.ts`.
 *
 * Claudia (tester) debe tener EXACTAMENTE los mismos permisos que Christian
 * (dueño de la plataforma / CEO) sin aparecer como empleada. Cualquier
 * decisión de permisos que antes comparaba contra `gerencia@nexara.com.mx`
 * directo debe usar [isCeoEquivalentEmail] en su lugar, y cualquier lista de
 * "equipo" / "asignar a" / asistencia debe descartar [isNonEmployeeEmail].
 */
object PlatformAccounts {
    const val CEO_EMAIL = "gerencia@nexara.com.mx"
    const val DEVELOPER_EMAIL = "developer@nexara.com.mx"
    const val CLAUDIA_TESTER_EMAIL = "claudia.bernal@nexara.com.mx"
    const val PLAY_REVIEW_EMAIL = "play.review@nexara.com.mx"

    fun norm(email: String?): String = email?.trim()?.lowercase().orEmpty()

    /** Christian y su equivalente de permisos (Claudia). */
    private val CEO_EQUIVALENT_EMAILS = setOf(CEO_EMAIL, CLAUDIA_TESTER_EMAIL)

    fun isCeoEquivalentEmail(email: String?): Boolean = norm(email) in CEO_EQUIVALENT_EMAILS

    fun isDeveloperEmail(email: String?): Boolean = norm(email) == DEVELOPER_EMAIL

    /**
     * Cuentas de plataforma / pruebas que NUNCA deben listarse como empleados
     * (equipo, pizarra, pickers de "asignar a", listas de asistencia/comida).
     */
    private val NON_EMPLOYEE_EMAILS = setOf(CEO_EMAIL, DEVELOPER_EMAIL, CLAUDIA_TESTER_EMAIL, PLAY_REVIEW_EMAIL)

    fun isNonEmployeeEmail(email: String?): Boolean = norm(email) in NON_EMPLOYEE_EMAILS
}
