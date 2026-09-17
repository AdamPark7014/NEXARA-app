package mx.nexara.mobile.nativeapp.data.clients

import android.content.Context
import mx.nexara.mobile.nativeapp.access.ClientSector
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.AddClientSectorBody
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.ClientDto
import mx.nexara.mobile.nativeapp.data.api.ClientPermissionsDto
import mx.nexara.mobile.nativeapp.data.api.ClientProjectDto
import mx.nexara.mobile.nativeapp.data.api.ClientsApi
import mx.nexara.mobile.nativeapp.data.api.CreateClientBody
import mx.nexara.mobile.nativeapp.data.api.CreateClientProjectBody
import mx.nexara.mobile.nativeapp.data.api.FiscalLookupDto

/**
 * Padrón de clientes de Core. El servidor vuelve a comprobar los sectores por
 * correo (`apps/api/src/ventas/client-sectors.ts`): la app filtra para no
 * enseñar de más, no para sustituir ese permiso.
 */
class ClientsRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: ClientsApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(ClientsApi::class.java)

    suspend fun bySector(sector: ClientSector): List<ClientDto> = api.listBySector(sector.name)

    suspend fun client(id: Long): ClientDto = api.getClient(id)

    /** Qué puede hacer la sesión con el padrón (agregar, editar, desactivar, eliminar). */
    suspend fun permissions(): ClientPermissionsDto = api.permissions()

    suspend fun create(body: CreateClientBody): ClientDto = api.createClient(body)

    /** Desactivar (`activo = false`) o reactivar. El servidor responde 403 si no eres Christian. */
    suspend fun setActive(id: Long, activo: Boolean) {
        if (activo) api.reactivateClient(id).close() else api.deactivateClient(id).close()
    }

    suspend fun delete(id: Long) {
        api.deleteClient(id).close()
    }

    suspend fun addSector(id: Long, sector: ClientSector): ClientDto =
        api.addSector(id, AddClientSectorBody(sector.name))

    suspend fun fiscalLookup(rfc: String): FiscalLookupDto =
        api.fiscalLookup(rfc.trim().uppercase())

    /** Proyectos del cliente: se piden por el puente operativo, no por el id del padrón. */
    suspend fun projects(serviceClientId: Long): List<ClientProjectDto> =
        api.clientProjects(serviceClientId)

    suspend fun createProject(
        title: String,
        serviceClientId: Long,
        vendorId: Long,
        startDate: String,
    ): ClientProjectDto = api.createProject(
        CreateClientProjectBody(
            title = title.trim(),
            clientId = serviceClientId,
            vendorId = vendorId,
            startDate = startDate,
        ),
    )
}
