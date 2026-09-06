package mx.nexara.mobile.nativeapp.access

import java.text.Normalizer

/**
 * Espejo Android de `apps/api/src/common/rbac/roles.v2.ts`
 * (`ROLES`, `ROLE_HOME_PANEL`, `ROLE_EXTRA_PANELS`, `LEGACY_TO_V2`).
 *
 * Sirve de respaldo determinista cuando `GET /me/navigation` no responde o
 * devuelve paneles vacíos (modo sin conexión, `roleKey` crudo nulo en el
 * servidor, sesión restaurada de disco).
 *
 * REGLA: aquí NO se decide por subcadena del nombre visible del rol. Se
 * normaliza el rol a una clave canónica por **igualdad exacta** contra una
 * tabla de alias, y esa clave manda. Un `contains("rh")` dejaba fuera a
 * «Recursos Humanos»; una tabla de alias no.
 */
object RolePanelMatrix {

    // Claves canónicas (roles.v2.ts · ROLES).
    const val SUPER_ADMIN = "super_admin"
    const val CEO = "ceo"
    const val ARQUITECTO = "arquitecto"
    const val DIR_OPERACIONES = "dir_operaciones"
    const val DIR_ADMIN = "dir_admin"
    const val COORD_ADMIN = "coord_admin"
    const val ADMINISTRATIVO = "administrativo"
    const val COORD_OPERACIONES = "coord_operaciones"
    const val ING_CAMPO = "ing_campo"
    const val ING_SOPORTE = "ing_soporte"
    const val COORD_VENTAS = "coord_ventas"
    const val VENDEDOR = "vendedor"
    const val LIDER_DISENO = "lider_diseno"
    const val DISENADOR = "disenador"
    const val RH = "rh"
    const val CONTABILIDAD = "contabilidad"
    const val CLIENTE = "cliente"

    /** No existe en roles.v2 (la sucursal entra por `portal/login`), pero sí como rol legacy. */
    const val SUCURSAL = "sucursal"

    /** Cuentas externas: solo portal, nunca paneles internos. */
    val EXTERNAL_ROLES: Set<String> = setOf(CLIENTE, SUCURSAL)

    /**
     * Paneles por rol = HOME ∪ EXTRA de roles.v2.ts.
     * `core` → ERP, `sales` → CRM. PORTAL queda fuera de los roles internos:
     * en móvil el portal es una app de cliente, no una pestaña más.
     */
    private val ROLE_PANELS: Map<String, List<PanelId>> = mapOf(
        SUPER_ADMIN to listOf(
            PanelId.ERP, PanelId.CRM, PanelId.OPS, PanelId.STUDIO, PanelId.LAB, PanelId.INTEGRA,
        ),
        CEO to listOf(
            PanelId.ERP, PanelId.CRM, PanelId.OPS, PanelId.STUDIO, PanelId.LAB, PanelId.INTEGRA,
        ),
        ARQUITECTO to listOf(PanelId.OPS, PanelId.ERP, PanelId.CRM, PanelId.INTEGRA),
        DIR_OPERACIONES to listOf(PanelId.ERP, PanelId.OPS, PanelId.CRM, PanelId.INTEGRA),
        DIR_ADMIN to listOf(PanelId.ERP, PanelId.CRM),
        COORD_ADMIN to listOf(PanelId.ERP, PanelId.CRM),
        ADMINISTRATIVO to listOf(PanelId.ERP),
        RH to listOf(PanelId.ERP),
        CONTABILIDAD to listOf(PanelId.ERP),
        COORD_OPERACIONES to listOf(PanelId.OPS, PanelId.ERP, PanelId.INTEGRA),
        ING_CAMPO to listOf(PanelId.OPS),
        ING_SOPORTE to listOf(PanelId.OPS, PanelId.ERP, PanelId.INTEGRA),
        COORD_VENTAS to listOf(PanelId.CRM, PanelId.ERP),
        VENDEDOR to listOf(PanelId.CRM),
        LIDER_DISENO to listOf(PanelId.STUDIO, PanelId.ERP),
        DISENADOR to listOf(PanelId.STUDIO),
        CLIENTE to listOf(PanelId.PORTAL),
        SUCURSAL to listOf(PanelId.PORTAL),
    )

    /**
     * Alias → clave canónica, por **cadena completa normalizada**.
     * Cubre: claves v2, `LEGACY_TO_V2` del backend, y los nombres visibles de
     * `ROLE_LABELS.es` tal como llegan en `LoginUserDto.role` (`Role.nombre`).
     */
    private val ROLE_ALIASES: Map<String, String> = buildMap {
        ROLE_PANELS.keys.forEach { put(it, it) }

        // ── Nombres visibles (ROLE_LABELS.es) ──────────────────────────────
        put("super_administrador", SUPER_ADMIN)
        put("super_admin", SUPER_ADMIN)
        put("superadmin", SUPER_ADMIN)
        put("arquitecto_dir_tecnico", ARQUITECTO)
        put("director_tecnico", ARQUITECTO)
        put("director_de_operaciones", DIR_OPERACIONES)
        put("director_operaciones", DIR_OPERACIONES)
        put("director_administrativo", DIR_ADMIN)
        put("directora_administrativa", DIR_ADMIN)
        put("coordinador_administrativo", COORD_ADMIN)
        put("coordinadora_administrativa", COORD_ADMIN)
        put("coordinador_de_operaciones", COORD_OPERACIONES)
        put("coordinador_operaciones", COORD_OPERACIONES)
        put("ingeniero_de_campo", ING_CAMPO)
        put("ingeniero_campo", ING_CAMPO)
        put("ingeniero_de_soporte", ING_SOPORTE)
        put("ingeniero_soporte", ING_SOPORTE)
        put("soporte_tecnico", ING_SOPORTE)
        put("coordinador_de_ventas", COORD_VENTAS)
        put("coordinador_ventas", COORD_VENTAS)
        put("gerente_comercial", COORD_VENTAS)
        put("ejecutivo_de_ventas", VENDEDOR)
        put("lider_de_diseno", LIDER_DISENO)
        put("community_manager", DISENADOR)
        put("recursos_humanos", RH)
        put("recursos_humanos_rh", RH)
        put("capital_humano", RH)
        put("contador", CONTABILIDAD)
        put("facturacion", CONTABILIDAD)
        put("cliente_externo", CLIENTE)
        put("client_portal", CLIENTE)
        put("branch_portal", SUCURSAL)

        // ── LEGACY_TO_V2 (roles.v2.ts) ────────────────────────────────────
        put("admin", DIR_ADMIN)
        put("ingeniero", ING_CAMPO)
        put("director_admin", DIR_ADMIN)
        put("director_ops", DIR_OPERACIONES)
        put("director_commercial", COORD_VENTAS)
        put("sales_manager", COORD_VENTAS)
        put("sales_rep", VENDEDOR)
        put("project_manager", COORD_OPERACIONES)
        put("senior_engineer", ING_SOPORTE)
        put("field_engineer", ING_CAMPO)
        put("designer", DISENADOR)
        put("admin_staff", ADMINISTRATIVO)
        put("accountant", CONTABILIDAD)
        put("hr_specialist", RH)
        put("hr", RH)
        put("warehouse_manager", COORD_ADMIN)
        put("procurement_officer", COORD_ADMIN)
        put("maintenance_coordinator", COORD_OPERACIONES)
        put("support_agent", ING_SOPORTE)
        put("noc_lead", ING_SOPORTE)
        put("noc_operator", ING_SOPORTE)
        put("client", CLIENTE)
        put("branch", SUCURSAL)
    }

    /**
     * Alias que también valen como **token suelto** dentro del nombre del rol
     * («Recursos Humanos (RH)», «Ventas · Vendedor»). Solo entran claves sin
     * ambigüedad: nada que pueda aparecer como adjetivo de otro rol.
     */
    private val ROLE_TOKEN_ALIASES: Map<String, String> = mapOf(
        "rh" to RH,
        "ceo" to CEO,
        "arquitecto" to ARQUITECTO,
        "vendedor" to VENDEDOR,
        "administrativo" to ADMINISTRATIVO,
        "contabilidad" to CONTABILIDAD,
        "contador" to CONTABILIDAD,
        "disenador" to DISENADOR,
        "cliente" to CLIENTE,
        "sucursal" to SUCURSAL,
        "superadmin" to SUPER_ADMIN,
    )

    /** minúsculas · sin acentos · separadores → `_` · sin `_` repetidos ni en los bordes. */
    fun normalize(raw: String?): String {
        val value = raw?.trim().orEmpty()
        if (value.isEmpty()) return ""
        val decomposed = Normalizer.normalize(value, Normalizer.Form.NFD)
        val stripped = decomposed.replace(Regex("\\p{Mn}+"), "")
        return stripped
            .lowercase()
            .replace(Regex("[^a-z0-9]+"), "_")
            .trim('_')
    }

    /**
     * Clave canónica del usuario. Prioridad: `roleKey` (ya resuelto por el
     * backend en `mapSessionUser`) → `orgRoleKey` → nombre visible del rol.
     */
    fun canonicalRoleKey(roleKey: String?, orgRoleKey: String?, roleDisplayName: String?): String? {
        listOf(roleKey, orgRoleKey, roleDisplayName).forEach { candidate ->
            resolveOne(candidate)?.let { return it }
        }
        return null
    }

    private fun resolveOne(candidate: String?): String? {
        val normalized = normalize(candidate)
        if (normalized.isEmpty()) return null
        ROLE_ALIASES[normalized]?.let { return it }
        // Igualdad por token — nunca `contains`.
        normalized.split('_').forEach { token ->
            ROLE_TOKEN_ALIASES[token]?.let { return it }
        }
        return null
    }

    /** Paneles del rol canónico; lista vacía si el rol no se reconoce. */
    fun panelsForRole(canonicalRole: String?): List<PanelId> =
        canonicalRole?.let { ROLE_PANELS[it] }.orEmpty()

    fun isExternalRole(canonicalRole: String?): Boolean =
        canonicalRole != null && canonicalRole in EXTERNAL_ROLES
}
