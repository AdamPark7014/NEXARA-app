package mx.nexara.mobile.nativeapp.data.api

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * El 400 era el agujero.
 *
 * NestJS contesta las reglas de negocio con `{"statusCode":400,"message":"…"}`
 * y ese texto ya viene en español. Como `toUserMessage` no miraba el cuerpo, el
 * usuario veía «HTTP 400 Bad Request» y no había forma de saber qué había hecho
 * mal — el mismo síntoma que motivó esta revisión.
 */
class ApiErrorsTest {

    @Test
    fun `extrae el mensaje de un error de Nest`() {
        val body = """{"statusCode":400,"message":"Solo puedes reabrir OT finalizadas","error":"Bad Request"}"""
        assertEquals("Solo puedes reabrir OT finalizadas", parseServerErrorBody(body))
    }

    @Test
    fun `el mensaje gana al campo error`() {
        val body = """{"error":"Bad Request","message":"Comentario demasiado corto"}"""
        assertEquals("Comentario demasiado corto", parseServerErrorBody(body))
    }

    @Test
    fun `cae en error cuando no hay message`() {
        val body = """{"statusCode":409,"error":"El registro ya existe"}"""
        assertEquals("El registro ya existe", parseServerErrorBody(body))
    }

    @Test
    fun `une el arreglo de class-validator en una sola frase`() {
        val body = """{"statusCode":400,"message":["monto debe ser positivo","categoria es obligatoria"]}"""
        assertEquals("monto debe ser positivo. categoria es obligatoria", parseServerErrorBody(body))
    }

    @Test
    fun `un arreglo de un solo elemento no lleva punto de mas`() {
        val body = """{"message":["La fecha de fin no puede ser anterior a la de inicio"]}"""
        assertEquals("La fecha de fin no puede ser anterior a la de inicio", parseServerErrorBody(body))
    }

    @Test
    fun `acepta acentos literales en UTF-8`() {
        val body = """{"message":"Sesión inválida"}"""
        assertEquals("Sesión inválida", parseServerErrorBody(body))
    }

    @Test
    fun `decodifica acentos escritos como escape unicode`() {
        // Algunos serializadores escapan lo no-ASCII. Sin decodificarlo, el
        // usuario leería la secuencia cruda en pantalla.
        val backslashU = "\\u"
        val body = "{\"message\":\"Sesi${backslashU}00f3n inv${backslashU}00e1lida\"}"
        assertEquals("Sesión inválida", parseServerErrorBody(body))
    }

    @Test
    fun `decodifica comillas escapadas sin cortar la cadena`() {
        val body = """{"message":"El campo \"folio\" es obligatorio"}"""
        assertEquals("El campo \"folio\" es obligatorio", parseServerErrorBody(body))
    }

    @Test
    fun `un arreglo con escapes no desalinea los elementos siguientes`() {
        // El índice tiene que avanzar sobre el texto CRUDO: si avanzara sobre el
        // ya decodificado, el segundo elemento se leería a medias.
        val body = """{"message":["Falta \"folio\"","Falta área"]}"""
        assertEquals("Falta \"folio\". Falta área", parseServerErrorBody(body))
    }

    @Test
    fun `el HTML de un proxy caido no se le ensenia al usuario`() {
        val body = "<html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>"
        assertNull(parseServerErrorBody(body))
    }

    @Test
    fun `un cuerpo vacio no produce mensaje`() {
        assertNull(parseServerErrorBody(""))
        assertNull(parseServerErrorBody("   "))
    }

    @Test
    fun `un texto plano corto se aprovecha tal cual`() {
        assertEquals("Ticket no encontrado", parseServerErrorBody("Ticket no encontrado"))
    }

    @Test
    fun `un texto plano larguisimo se descarta`() {
        assertNull(parseServerErrorBody("x".repeat(500)))
    }

    @Test
    fun `un JSON sin campos conocidos no inventa mensaje`() {
        assertNull(parseServerErrorBody("""{"statusCode":400,"detalle":"algo"}"""))
    }

    @Test
    fun `un JSON roto no revienta`() {
        // Esto corre en la ruta de error de toda la app: lanzar aquí cambiaría
        // un mensaje malo por un fallo.
        assertNull(parseServerErrorBody("""{"message":"sin cerrar"""))
        assertNull(parseServerErrorBody("""{"message":"""))
        assertNull(parseServerErrorBody("{"))
    }

    @Test
    fun `un message que no es texto ni arreglo se ignora`() {
        assertNull(parseServerErrorBody("""{"message":404}"""))
        assertNull(parseServerErrorBody("""{"message":null}"""))
    }

    @Test
    fun `un message vacio no se muestra`() {
        assertNull(parseServerErrorBody("""{"message":""}"""))
    }

    @Test
    fun `los saltos de linea escapados se vuelven espacios`() {
        assertEquals("Primera linea segunda", parseServerErrorBody("""{"message":"Primera linea\nsegunda"}"""))
    }
}
