package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.api.ConductorRefDto
import mx.nexara.mobile.nativeapp.data.api.SolicitudVehiculoDto
import mx.nexara.mobile.nativeapp.data.api.VehiculoRefDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Solicitudes por aprobar de dirección y el alta de unidad de Iván. */
class FlotillaSolicitudesTest {

    private fun solicitud(id: Long?, estatus: String?) = SolicitudVehiculoDto(id = id, estatusAprobacion = estatus)

    @Test
    fun `solo sale lo que sigue pendiente`() {
        val lista = listOf(
            solicitud(1, "Pendiente"),
            solicitud(2, "Aprobado"),
            solicitud(3, "Rechazado"),
            solicitud(4, " pendiente "),
            // Sin id no hay a qué aprobarle.
            solicitud(null, "Pendiente"),
            solicitud(5, null),
        )
        assertEquals(listOf(1L, 4L), FlotillaRules.porAprobar(lista).map { it.id })
        assertTrue(FlotillaRules.porAprobar(emptyList()).isEmpty())
    }

    @Test
    fun `aprobar un paso no es aprobar la solicitud`() {
        assertEquals("Solicitud aprobada.", FlotillaRules.avisoDecision(true, "Aprobado"))
        assertEquals(
            "Paso aprobado: le falta el siguiente visto bueno.",
            FlotillaRules.avisoDecision(true, "Pendiente"),
        )
        assertEquals("Solicitud rechazada.", FlotillaRules.avisoDecision(false, "Rechazado"))
    }

    @Test
    fun `el nombre sale de la solicitud o de la unidad`() {
        assertEquals(
            "Frontier · TXA-12",
            FlotillaRules.nombreSolicitud(SolicitudVehiculoDto(nombreVehiculo = "Frontier", placasVehiculo = "TXA-12")),
        )
        assertEquals(
            "Hilux · UAB-1",
            FlotillaRules.nombreSolicitud(SolicitudVehiculoDto(vehiculo = VehiculoRefDto(nombre = "Hilux", placas = "UAB-1"))),
        )
        assertEquals("Vehículo sin nombre", FlotillaRules.nombreSolicitud(SolicitudVehiculoDto()))
    }

    @Test
    fun `quien la pide`() {
        assertEquals("Ana", FlotillaRules.quienPide(SolicitudVehiculoDto(solicitante = ConductorRefDto(nombre = "Ana"))))
        assertEquals("Sin persona registrada", FlotillaRules.quienPide(SolicitudVehiculoDto()))
    }

    @Test
    fun `el vacio dice que sigue segun quien mira`() {
        assertTrue(FlotillaRules.vacioVehiculos(daDeAlta = true).contains("Da de alta"))
        assertFalse(FlotillaRules.vacioVehiculos(daDeAlta = false).contains("Da de alta"))
        assertTrue(FlotillaRules.vacioVehiculos(daDeAlta = false).contains("Iván"))
    }

    @Test
    fun `una unidad nueva avisa que ya se puede sacar`() {
        assertEquals(
            "Frontier dada de alta: ya la puede sacar cualquiera.",
            FlotillaRules.avisoUnidadCreada(" Frontier "),
        )
    }

    @Test
    fun `lee lo que manda GET vehicles`() {
        val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        val tipo = Types.newParameterizedType(List::class.java, SolicitudVehiculoDto::class.java)
        val lista = moshi.adapter<List<SolicitudVehiculoDto>>(tipo).fromJson(
            """[{"id":9,"estatusAprobacion":"Pendiente","approvalStep":1,"nombreVehiculo":null,
                "solicitante":{"id":3,"nombre":"Ana","email":"a@b.c"},
                "vehiculo":{"id":2,"nombre":"Frontier","placas":"TXA-12","notas":"x"},
                "actividad":{"id":4,"anNumber":"AN-1","titulo":"Instalar cámaras","estatus":"Abierta"}}]""",
        ).orEmpty()
        val s = FlotillaRules.porAprobar(lista).single()
        assertEquals("Frontier · TXA-12", FlotillaRules.nombreSolicitud(s))
        assertEquals("Ana", FlotillaRules.quienPide(s))
        assertEquals("Instalar cámaras", s.actividad?.titulo)
    }
}
