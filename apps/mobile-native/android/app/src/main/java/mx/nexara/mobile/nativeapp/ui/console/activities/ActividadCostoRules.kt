package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.access.PlatformAccounts
import mx.nexara.mobile.nativeapp.access.RoleKeys
import mx.nexara.mobile.nativeapp.data.api.ActivityMaterialesDto
import mx.nexara.mobile.nativeapp.data.api.ViaticoDto
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero

/**
 * «Costo directo» del detalle de actividad, como la web (`CostoActividad.tsx`): lo que ya carga
 * la actividad en viáticos (su parte del reparto) y en material que salió del almacén. Solo
 * dirección y coordinación de Admin y Operaciones. Sin nada que sumar no se pinta: hoy casi
 * ningún gasto pasa por el sistema y una tarjeta en ceros no dice nada.
 * Reglas puras: `ActividadCostoRulesTest`.
 */
object ActividadCostoRules {
    const val TITULO = "Costo directo"
    const val NOTA = "La mano de obra y el margen aparecen cuando la nómina y la factura pasen por el sistema."

    /** `VEN_COSTO` de la web: CEO, directores y coordinadores de Admin y Operaciones. */
    val VEN_COSTO: Set<String> = setOf(
        RoleKeys.CEO,
        RoleKeys.DIR_ADMIN,
        RoleKeys.DIR_OPERACIONES,
        RoleKeys.COORD_ADMIN,
        RoleKeys.COORD_OPERACIONES,
    )

    /**
     * La misma regla que la web: super admin, o un rol de [VEN_COSTO]. El dueño de la plataforma
     * (y su equivalente) cuenta como CEO, igual que `resolveV2RoleKey`.
     */
    fun puedeVer(
        isSuperAdmin: Boolean,
        email: String?,
        roleKey: String?,
        orgRoleKey: String?,
        rolVisible: String?,
    ): Boolean {
        if (isSuperAdmin) return true
        if (PlatformAccounts.isCeoEquivalentEmail(email)) return true
        val rol = RoleKeys.canonicalRoleKey(roleKey = roleKey, orgRoleKey = orgRoleKey, roleDisplayName = rolVisible)
        return rol != null && rol in VEN_COSTO
    }

    data class Costo(
        val viaticosCentavos: Long,
        val nViaticos: Int,
        val materialCentavos: Long,
        val nMaterial: Int,
    ) {
        val totalCentavos: Long get() = viaticosCentavos + materialCentavos
    }

    /**
     * Lo que este viático le carga a la actividad: su parte del reparto si está repartido (un viaje
     * que cubrió dos servicios paga la gasolina de los dos); si no, lo solicitado. `null` si no es suyo.
     */
    fun montoEnActividad(v: ViaticoDto, activityId: Long): Double? {
        val repartos = v.repartos.orEmpty()
        val propio = v.actividadId == activityId
        val parte = repartos.firstOrNull { it.actividadId == activityId }
        if (!propio && parte == null) return null
        return if (repartos.isNotEmpty()) parte?.monto ?: 0.0 else v.montoSolicitado ?: 0.0
    }

    /** Viáticos de `GET viatics` (ya filtrados por persona y jefe) + material de `activities/:id/materiales`. */
    fun costo(viaticos: List<ViaticoDto>?, activityId: Long, materiales: ActivityMaterialesDto?): Costo {
        val montos = viaticos.orEmpty().mapNotNull { montoEnActividad(it, activityId) }
        return Costo(
            viaticosCentavos = montos.sumOf { Dinero.deApi(it) },
            nViaticos = montos.size,
            materialCentavos = Dinero.deApi(materiales?.costoTotal),
            nMaterial = materiales?.movimientos?.size ?: 0,
        )
    }

    /** Se pinta si hay algo que sumar (un monto, o al menos un renglón aunque sea de $0). */
    fun visible(c: Costo): Boolean = !(c.totalCentavos <= 0L && c.nViaticos == 0 && c.nMaterial == 0)

    fun etiquetaViaticos(c: Costo): String = if (c.nViaticos > 0) "Viáticos · ${c.nViaticos}" else "Viáticos"

    fun etiquetaMaterial(c: Costo): String =
        if (c.nMaterial > 0) "Material del almacén · ${c.nMaterial}" else "Material del almacén"

    fun pesos(centavos: Long): String = Dinero.pesos(centavos)
}
