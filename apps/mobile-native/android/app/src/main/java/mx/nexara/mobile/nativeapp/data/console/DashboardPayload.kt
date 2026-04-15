package mx.nexara.mobile.nativeapp.data.console

import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.ViaticDto

data class DashboardPayload(
    val viatics: List<ViaticDto>,
    val activities: List<ActivityDto>,
)

