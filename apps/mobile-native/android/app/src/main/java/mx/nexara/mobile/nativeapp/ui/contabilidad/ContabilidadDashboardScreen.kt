package mx.nexara.mobile.nativeapp.ui.contabilidad

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.BankAccountDto
import mx.nexara.mobile.nativeapp.data.api.ExpenseDto
import mx.nexara.mobile.nativeapp.data.api.InvoiceDto
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader

private val GreenLight  = Color(0xFFD1FAE5); private val GreenColor  = Color(0xFF059669)
private val TealLight   = Color(0xFFCCFBF1); private val TealColor   = Color(0xFF0D9488)
private val BlueLight   = Color(0xFFDBEAFE); private val BlueColor   = Color(0xFF3B82F6)
private val AmberLight  = Color(0xFFFEF3C7); private val AmberColor  = Color(0xFFF59E0B)
private val RedLight    = Color(0xFFFEE2E2); private val RedColor    = Color(0xFFEF4444)
private val SlateText   = Color(0xFF0F172A); private val SubText     = Color(0xFF64748B)

data class ContaDashState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val invoices: List<InvoiceDto> = emptyList(),
    val expenses: List<ExpenseDto> = emptyList(),
    val bankAccounts: List<BankAccountDto> = emptyList(),
)

class ContabilidadDashboardViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(ContaDashState())
    val state: StateFlow<ContaDashState> = _state

    fun load(refresh: Boolean = false) {
        _state.update {
            if (refresh) it.copy(isRefreshing = true, error = null)
            else it.copy(loading = true, error = null)
        }
        viewModelScope.launch {
            try {
                val invoices     = withContext(Dispatchers.IO) { repo.invoices() }
                val expenses     = withContext(Dispatchers.IO) { repo.expenses() }
                val bankAccounts = withContext(Dispatchers.IO) { repo.bankAccounts() }
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        invoices = invoices,
                        expenses = expenses,
                        bankAccounts = bankAccounts,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.message ?: "Error al cargar contabilidad",
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContabilidadDashboardScreen(
    onOpenInvoicing: () -> Unit = {},
    onOpenExpenses: () -> Unit = {},
    onOpenChat: () -> Unit = {},
    onOpenViaticos: () -> Unit = {},
) {
    val vm: ContabilidadDashboardViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(Unit) { vm.load() }

    if (state.loading && !state.isRefreshing && state.invoices.isEmpty() && state.error == null) {
        Box(Modifier.fillMaxSize().background(NxColors.Surface), contentAlignment = Alignment.Center) {
            NxLoadingBlock("Cargando contabilidad…")
        }
        return
    }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.load(refresh = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(NxColors.Surface).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Column {
                Text("Dashboard Contabilidad", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), color = SlateText)
                Text("Facturación · Gastos · Banca", style = MaterialTheme.typography.bodySmall, color = SubText)
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ContaQuickActionCard(
                        modifier = Modifier.weight(1f),
                        icon = "🧾",
                        title = "Facturas",
                        subtitle = "Facturación CFDI",
                        bg = TealColor,
                        onClick = onOpenInvoicing,
                    )
                    ContaQuickActionCard(
                        modifier = Modifier.weight(1f),
                        icon = "📊",
                        title = "Gastos",
                        subtitle = "Registros y aprobación",
                        bg = AmberColor,
                        onClick = onOpenExpenses,
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ContaQuickActionCard(
                        modifier = Modifier.weight(1f),
                        icon = "💬",
                        title = "Chat",
                        subtitle = "Equipo NEXARA",
                        bg = BlueColor,
                        onClick = onOpenChat,
                    )
                    ContaQuickActionCard(
                        modifier = Modifier.weight(1f),
                        icon = "💼",
                        title = "Viáticos",
                        subtitle = "Solicitudes y gastos",
                        bg = GreenColor,
                        onClick = onOpenViaticos,
                    )
                }
            }
        }

        if (!state.error.isNullOrBlank()) {
            item {
                NxErrorBlock(state.error!!, onRetry = { vm.load(refresh = true) })
            }
        }

        // ── KPI cards
        item {
            val invTotal  = state.invoices.sumOf { it.total ?: 0.0 }
            val invPaid   = state.invoices.count { (it.status ?: "").lowercase().contains("pagad") || (it.status ?: "").lowercase().contains("cobrad") }
            val expTotal  = state.expenses.sumOf { it.monto ?: 0.0 }
            val balance   = state.bankAccounts.sumOf { it.balance ?: 0.0 }

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ContaKpiCard(Modifier.weight(1f), "🧾", "Facturación", fmtMxn(invTotal), "$invPaid cobradas", TealLight, TealColor)
                    ContaKpiCard(Modifier.weight(1f), "📊", "Gastos", fmtMxn(expTotal), "${state.expenses.size} registros", AmberLight, AmberColor)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ContaKpiCard(Modifier.weight(1f), "🏦", "Saldo bancario", fmtMxn(balance), "${state.bankAccounts.size} cuentas", GreenLight, GreenColor)
                    ContaKpiCard(Modifier.weight(1f), "📋", "Facturas total", state.invoices.size.toString(), "${state.invoices.count { (it.status ?: "").lowercase().contains("pendiente") }} pendientes", BlueLight, BlueColor)
                }
            }
        }

        // ── Bank accounts
        if (state.bankAccounts.isNotEmpty()) {
            item { NxSectionHeader("Cuentas bancarias", "${state.bankAccounts.size} cuentas") }
            items(state.bankAccounts) { b ->
                NxPanelShell {
                    Row(horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(b.name ?: "Cuenta", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = SlateText)
                            Text(listOfNotNull(b.bank, b.accountNumber?.takeLast(4)?.let { "****$it" }).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = SubText)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(fmtMxn(b.balance ?: 0.0), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = if ((b.balance ?: 0.0) >= 0) GreenColor else RedColor)
                            if (!b.currency.isNullOrBlank()) Text(b.currency!!, style = MaterialTheme.typography.labelSmall, color = SubText)
                        }
                    }
                }
            }
        }

        // ── Recent invoices
        if (state.invoices.isNotEmpty()) {
            item { NxSectionHeader("Facturas recientes", "Últimas 8") }
            items(state.invoices.take(8)) { inv ->
                val statusColor = when {
                    (inv.status ?: "").lowercase().contains("pagad") || (inv.status ?: "").lowercase().contains("cobrad") -> GreenColor
                    (inv.status ?: "").lowercase().contains("pendiente") -> AmberColor
                    (inv.status ?: "").lowercase().contains("cancelad") -> RedColor
                    else -> SubText
                }
                NxPanelShell {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.width(4.dp).height(48.dp).clip(RoundedCornerShape(2.dp)).background(statusColor))
                        Column(Modifier.weight(1f)) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(inv.folio ?: "Factura #${inv.id}", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold), color = TealColor)
                                Text(fmtMxn(inv.total ?: 0.0), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = SlateText)
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(inv.clientName ?: "—", style = MaterialTheme.typography.bodySmall, color = SubText)
                                Box(Modifier.clip(RoundedCornerShape(6.dp)).background(statusColor.copy(alpha = 0.12f)).padding(horizontal = 8.dp, vertical = 2.dp)) {
                                    Text(inv.status ?: "–", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold), color = statusColor)
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Recent expenses
        if (state.expenses.isNotEmpty()) {
            item { NxSectionHeader("Gastos recientes", "Últimos 8") }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.expenses.take(8)) { e ->
                        Card(
                            modifier = Modifier.width(160.dp),
                            shape = RoundedCornerShape(NxDimens.PanelRadius),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            elevation = CardDefaults.cardElevation(2.dp),
                        ) {
                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("📊", fontSize = 22.sp)
                                Text(fmtMxn(e.monto ?: 0.0), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = SlateText)
                                Text(e.concepto ?: "Gasto", style = MaterialTheme.typography.bodySmall, color = SubText, maxLines = 2)
                                Text(e.estatus ?: "–", style = MaterialTheme.typography.labelSmall, color = AmberColor)
                            }
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
    }
}

@Composable
private fun ContaQuickActionCard(
    modifier: Modifier,
    icon: String,
    title: String,
    subtitle: String,
    bg: Color,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = bg),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(icon, fontSize = 20.sp)
            Spacer(Modifier.height(6.dp))
            Text(title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            Text(subtitle, color = Color.White.copy(alpha = 0.9f), fontSize = 11.sp)
        }
    }
}

@Composable
private fun ContaKpiCard(
    modifier: Modifier, icon: String, title: String,
    value: String, sub: String, bg: Color, accent: Color,
) {
    Card(
        modifier = modifier, shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = bg), elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(icon, fontSize = 18.sp)
                Text(title, style = MaterialTheme.typography.labelMedium, color = accent)
            }
            Spacer(Modifier.height(8.dp))
            Text(value, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), color = SlateText)
            Spacer(Modifier.height(2.dp))
            Text(sub, style = MaterialTheme.typography.bodySmall, color = SubText)
        }
    }
}

private fun fmtMxn(v: Double): String = "$%,d".format(kotlin.math.round(v).toLong())
