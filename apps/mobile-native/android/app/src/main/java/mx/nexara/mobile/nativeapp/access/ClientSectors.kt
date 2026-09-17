package mx.nexara.mobile.nativeapp.access

import mx.nexara.mobile.nativeapp.ui.enterprise.NxGlyph

/**
 * Sectores del padrón de clientes — espejo de `apps/web/lib/client-sectors.ts`
 * (y de `apps/api/src/ventas/client-sectors.ts`, que es quien lo hace cumplir).
 *
 * El acceso a Clientes depende del correo, no del rol: quien no está en la
 * matriz no tiene sectores y no ve el módulo.
 */
enum class ClientSector(
    val slug: String,
    val title: String,
    val glyph: NxGlyph,
    val help: String,
) {
    PROYECTO(
        slug = "proyecto",
        title = "Clientes de proyecto",
        glyph = NxGlyph.PROJECT,
        help = "Se usan en actividades de tipo proyecto u obra. Aquí también creas sus proyectos.",
    ),
    CORPORATIVO(
        slug = "corporativo",
        title = "Clientes corporativos",
        glyph = NxGlyph.CORPORATE,
        help = "Se usan en actividades de tipo servicio.",
    ),
    COMERCIAL(
        slug = "comercial",
        title = "Clientes comerciales",
        glyph = NxGlyph.CLIENT,
        help = "Se usan en actividades de tipo comercial (también puedes sumarlos a otros sectores).",
    ),
    ;

    /** «proyecto», «corporativos», «comerciales». */
    val shortLabel: String get() = title.replace(Regex("^Clientes de |^Clientes ", RegexOption.IGNORE_CASE), "")

    companion object {
        fun fromApi(value: String?): ClientSector? =
            entries.firstOrNull { it.name.equals(value?.trim(), ignoreCase = true) || it.slug == value?.trim()?.lowercase() }
    }
}

object ClientSectors {
    private val ALL = listOf(ClientSector.PROYECTO, ClientSector.CORPORATIVO, ClientSector.COMERCIAL)
    private val PROYECTO_COMERCIAL = listOf(ClientSector.PROYECTO, ClientSector.COMERCIAL)

    private val SECTOR_MATRIX: Map<String, List<ClientSector>> = mapOf(
        OrgEmails.CEO to ALL,
        OrgEmails.DEVELOPER to ALL,
        OrgEmails.ANTONIO to ALL,
        OrgEmails.LUIS to listOf(ClientSector.CORPORATIVO),
        OrgEmails.DAVID to PROYECTO_COMERCIAL,
        OrgEmails.JOSUE to PROYECTO_COMERCIAL,
        OrgEmails.MONICA to PROYECTO_COMERCIAL,
        OrgEmails.DANIELA to listOf(ClientSector.COMERCIAL),
    )

    /** Sectores que puede usar un correo; vacío = sin acceso al módulo. */
    fun forEmail(email: String?): List<ClientSector> {
        if (PlatformAccounts.isCeoEquivalentEmail(email)) return ALL
        return SECTOR_MATRIX[OrgEmails.norm(email)].orEmpty()
    }

    /** `canSeeClientesModule` de la web: solo por correo, también para super admin. */
    fun canSeeModule(email: String?): Boolean = forEmail(email).isNotEmpty()
}

/** Correos con reglas propias en Core — `ORG_EMAILS` de `apps/web/lib/activity-kinds.ts`. */
object OrgEmails {
    const val CEO = "gerencia@nexara.com.mx"
    const val DEVELOPER = "developer@nexara.com.mx"
    const val DAVID = "operaciones@nexara.com.mx"
    const val LUIS = "direccion.operaciones@nexara.com.mx"
    const val ANTONIO = "jose.ramirez@nexara.com.mx"
    const val CAROLINA = "soporte@nexara.com.mx"
    const val ALEJANDRO = "alejandro.gonzalez@nexara.com.mx"
    const val ROBERTO = "roberto.vivanco@nexara.com.mx"
    const val DANIELA = "daniela.hernandez@nexara.com.mx"
    const val MONICA = "soluciones@nexara.com.mx"
    const val JOAN = "joan.sanchez@nexara.com.mx"
    const val ISRAEL = "israel.ramos@nexara.com.mx"
    const val JUAN = "juan.gonzalez@nexara.com.mx"
    const val JOSUE = "infraestructura@nexara.com.mx"

    fun norm(email: String?): String = email?.trim()?.lowercase().orEmpty()
}
