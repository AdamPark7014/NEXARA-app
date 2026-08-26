package mx.nexara.mobile.nativeapp.ui.web

import androidx.compose.runtime.Composable
import mx.nexara.mobile.nativeapp.ui.studio.StudioNavHost

/**
 * Legacy alias for the public web/studio panel. Routing lives in [StudioNavHost]
 * to avoid divergent module maps (projects/documents were generic here only).
 */
@Composable
fun WebNavHost(
    onExitToPanels: () -> Unit,
    panelTitle: String = "NEXARA STUDIO",
) = StudioNavHost(onExitToPanels = onExitToPanels, panelTitle = panelTitle)
