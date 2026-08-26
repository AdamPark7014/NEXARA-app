package mx.nexara.mobile.nativeapp.ui.commandcenter

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.data.SessionUser

@Composable
fun CommandCenterRail(
    user: SessionUser?,
    panel: CommandPanelFilter = CommandPanelFilter.ALL,
    extraWidgets: List<CommandWidget> = emptyList(),
    onOpenModule: (String) -> Unit,
    title: String = "Accesos rápidos",
    modifier: Modifier = Modifier,
) {
    val widgets = remember(user, panel, extraWidgets) {
        val base = filterCommandWidgetsForPanel(getCommandWidgetsForUser(user), panel)
        mergeCommandWidgets(extraWidgets, base)
    }
    CommandCenterRail(widgets = widgets, onWidgetClick = { onOpenModule(it.moduleKey) }, title = title, modifier = modifier)
}

@Composable
fun CommandCenterRail(
    widgets: List<CommandWidget>,
    onWidgetClick: (CommandWidget) -> Unit,
    title: String = "Accesos rápidos",
    modifier: Modifier = Modifier,
) {
    if (widgets.isEmpty()) return
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            title,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 8.dp),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            widgets.forEach { w ->
                FilterChip(
                    selected = false,
                    onClick = { onWidgetClick(w) },
                    label = { Text("${w.icon} ${w.label}") },
                    modifier = Modifier.semantics {
                        contentDescription = if (w.hint.isNotBlank()) "${w.label}. ${w.hint}" else w.label
                    },
                )
            }
        }
    }
}
