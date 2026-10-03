package mx.nexara.mobile.nativeapp.ui.enterprise

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable

private const val NxNavAnimMs = 220

/** No transition — use for bottom-tab route switches. */
object NxNavTransitions {
    val noneEnter: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition? =
        { EnterTransition.None }
    val noneExit: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition? =
        { ExitTransition.None }

    /** Horizontal slide for stack pushes (detail screens). */
    val pushEnter: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition? = {
        slideInHorizontally(animationSpec = tween(NxNavAnimMs)) { fullWidth -> fullWidth }
    }
    val pushExit: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition? = {
        slideOutHorizontally(animationSpec = tween(NxNavAnimMs)) { fullWidth -> -fullWidth / 4 }
    }
    val pushPopEnter: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition? = {
        slideInHorizontally(animationSpec = tween(NxNavAnimMs)) { fullWidth -> -fullWidth / 4 }
    }
    val pushPopExit: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition? = {
        slideOutHorizontally(animationSpec = tween(NxNavAnimMs)) { fullWidth -> fullWidth }
    }

    /** Subtle fade for modal-style screens (forms, builders). */
    val modalEnter: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition? = {
        fadeIn(animationSpec = tween(NxNavAnimMs))
    }
    val modalExit: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition? = {
        fadeOut(animationSpec = tween(NxNavAnimMs))
    }
}

enum class NxNavAnimStyle { Tab, Push, Modal }

fun NavGraphBuilder.nxComposable(
    route: String,
    style: NxNavAnimStyle = NxNavAnimStyle.Tab,
    content: @Composable (NavBackStackEntry) -> Unit,
) {
    when (style) {
        NxNavAnimStyle.Tab -> composable(
            route = route,
            enterTransition = NxNavTransitions.noneEnter,
            exitTransition = NxNavTransitions.noneExit,
            popEnterTransition = NxNavTransitions.noneEnter,
            popExitTransition = NxNavTransitions.noneExit,
            content = { entry -> content(entry) },
        )
        NxNavAnimStyle.Push -> composable(
            route = route,
            enterTransition = NxNavTransitions.pushEnter,
            exitTransition = NxNavTransitions.pushExit,
            popEnterTransition = NxNavTransitions.pushPopEnter,
            popExitTransition = NxNavTransitions.pushPopExit,
            content = { entry -> content(entry) },
        )
        NxNavAnimStyle.Modal -> composable(
            route = route,
            enterTransition = { fadeIn(animationSpec = tween(NxNavAnimMs)) },
            exitTransition = { fadeOut(animationSpec = tween(NxNavAnimMs)) },
            popEnterTransition = { fadeIn(animationSpec = tween(NxNavAnimMs)) },
            popExitTransition = { fadeOut(animationSpec = tween(NxNavAnimMs)) },
            content = { entry -> content(entry) },
        )
    }
}

/**
 * Barra inferior Material 3 del rediseño v2: pastilla teal suave en la activa,
 * icono relleno al seleccionar y una insignia roja con el conteo cuando hay
 * algo pendiente. Lee el tema (no [NxColors]) para que el modo oscuro funcione.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NxBottomTabBar(
    tabs: List<NxBottomTab>,
    isSelected: (String) -> Boolean,
    onTabSelected: (String) -> Unit,
) {
    val haptic = LocalHapticFeedback.current
    val scheme = MaterialTheme.colorScheme
    NavigationBar(
        containerColor = scheme.surface,
        contentColor = scheme.onSurface,
        tonalElevation = 0.dp,
    ) {
        tabs.forEach { tab ->
            val selected = isSelected(tab.route)
            NavigationBarItem(
                selected = selected,
                onClick = {
                    if (!selected) {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onTabSelected(tab.route)
                    }
                },
                icon = {
                    val glyph = if (selected) tab.selectedIcon ?: tab.icon else tab.icon
                    val badge = tab.badge
                    if (badge != null && badge > 0) {
                        BadgedBox(
                            badge = {
                                Badge(
                                    containerColor = scheme.error,
                                    contentColor = scheme.onError,
                                ) { Text(if (badge > 99) "99+" else badge.toString()) }
                            },
                        ) {
                            Icon(glyph, contentDescription = "${tab.label}, $badge pendientes")
                        }
                    } else {
                        Icon(glyph, contentDescription = tab.label)
                    }
                },
                label = {
                    Text(
                        tab.label,
                        fontSize = tab.labelFontSize,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                        maxLines = 1,
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = scheme.onSecondaryContainer,
                    selectedTextColor = scheme.onSurface,
                    indicatorColor = scheme.secondaryContainer,
                    unselectedIconColor = scheme.onSurfaceVariant,
                    unselectedTextColor = scheme.onSurfaceVariant,
                ),
            )
        }
    }
}

data class NxBottomTab(
    val route: String,
    val icon: ImageVector,
    val label: String,
    val labelFontSize: TextUnit = TextUnit.Unspecified,
    /** Icono relleno cuando la pestaña está activa (si no se da, se repite [icon]). */
    val selectedIcon: ImageVector? = null,
    /** Conteo pendiente; `null` o 0 = sin insignia. */
    val badge: Int? = null,
)
