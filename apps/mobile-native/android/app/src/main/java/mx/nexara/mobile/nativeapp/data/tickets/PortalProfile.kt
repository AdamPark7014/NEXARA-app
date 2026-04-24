package mx.nexara.mobile.nativeapp.data.tickets

data class PortalProfile(
    val kind: Kind,
    val id: Long,
    val name: String,
    val logoUrl: String? = null,
    val contactName: String? = null,
    val contactEmail: String? = null,
    val contactPhone: String? = null,
    val address: String? = null,
    val city: String? = null,
    val state: String? = null,
    val country: String? = null,
    val branchNumber: String? = null,
) {
    enum class Kind { CLIENT, BRANCH }
}

