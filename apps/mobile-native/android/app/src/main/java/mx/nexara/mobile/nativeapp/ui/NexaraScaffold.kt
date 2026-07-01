package mx.nexara.mobile.nativeapp.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.offline.NetworkMonitor
import mx.nexara.mobile.nativeapp.data.offline.NexaraOffline
import mx.nexara.mobile.nativeapp.data.offline.OfflineSyncCoordinator
import mx.nexara.mobile.nativeapp.ui.shared.OfflineBanner

@Composable
fun NexaraScaffold(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val isOnline by NetworkMonitor.isOnline.collectAsState()
    var pending by remember { mutableIntStateOf(0) }
    val repo = remember(context) { AuthRepository(context) }

    LaunchedEffect(isOnline) {
        pending = NexaraOffline.mutationQueue().load().size
        if (isOnline) {
            OfflineSyncCoordinator.replay(NexaraOffline.mutationQueue(), repo.token())
            pending = NexaraOffline.mutationQueue().load().size
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        OfflineBanner(isOffline = !isOnline, pendingMutations = pending)
        content()
    }
}
