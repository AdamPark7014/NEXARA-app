package mx.nexara.mobile.nativeapp.ui.modules

import androidx.compose.runtime.Composable
import mx.nexara.mobile.nativeapp.ui.common.SimpleRow

private fun fmtMoney(v: Double?): String =
    if (v == null) "—" else "$" + String.format("%,.2f", v)

private fun nn(s: String?): String = if (s.isNullOrBlank()) "—" else s

// ── News ──────────────────────────────────────────────────────────────────
@Composable
fun NewsModuleScreen() = GenericListModuleScreen(title = "Noticias") { repo ->
    repo.news().map { n ->
        SimpleRow(
            id = n.id.toString(),
            title = nn(n.title),
            subtitle = n.excerpt,
            meta = listOfNotNull(n.status, n.publishedAt).joinToString(" · "),
            trailing = n.category,
        )
    }
}

// ── Contact messages ──────────────────────────────────────────────────────
@Composable
fun ContactMessagesModuleScreen() = GenericListModuleScreen(title = "Mensajes de contacto") { repo ->
    repo.contactMessages().map { m ->
        SimpleRow(
            id = m.id.toString(),
            title = nn(m.subject ?: m.name),
            subtitle = m.message,
            meta = listOfNotNull(m.name, m.email, m.phone).joinToString(" · "),
            trailing = listOfNotNull(m.status, m.category).joinToString(" · "),
        )
    }
}

// ── Newsletter ────────────────────────────────────────────────────────────
@Composable
fun NewsletterModuleScreen() = GenericListModuleScreen(title = "Suscriptores newsletter") { repo ->
    repo.newsletter().map { s ->
        SimpleRow(
            id = s.id.toString(),
            title = nn(s.name ?: s.email),
            subtitle = s.email,
            meta = s.createdAt,
            trailing = s.status,
        )
    }
}

// ── Audit ─────────────────────────────────────────────────────────────────
@Composable
fun AuditModuleScreen() = GenericListModuleScreen(title = "Auditoría") { repo ->
    repo.audit().map { a ->
        SimpleRow(
            id = a.id.toString(),
            title = listOfNotNull(a.action, a.entityType).joinToString(" · ").ifBlank { "Evento" },
            subtitle = a.description,
            meta = listOfNotNull(a.userName, a.createdAt).joinToString(" · "),
            trailing = a.entityId?.let { "ID $it" },
        )
    }
}

// ── Expenses ──────────────────────────────────────────────────────────────
@Composable
fun ExpensesModuleScreen() = GenericListModuleScreen(title = "Gastos") { repo ->
    repo.expenses().map { e ->
        SimpleRow(
            id = e.id.toString(),
            title = nn(e.concepto),
            subtitle = fmtMoney(e.monto),
            meta = listOfNotNull(e.usuario?.nombre, e.createdAt).joinToString(" · "),
            trailing = e.estatus,
        )
    }
}

// ── Fines ─────────────────────────────────────────────────────────────────
@Composable
fun FinesModuleScreen() = GenericListModuleScreen(title = "Multas") { repo ->
    repo.fines().map { f ->
        SimpleRow(
            id = f.id.toString(),
            title = nn(f.motivo),
            subtitle = fmtMoney(f.monto),
            meta = listOfNotNull(f.usuario?.nombre, f.createdAt).joinToString(" · "),
            trailing = f.estatus,
        )
    }
}

// ── Employee payments ─────────────────────────────────────────────────────
@Composable
fun EmployeePaymentsModuleScreen() = GenericListModuleScreen(title = "Pagos a empleados") { repo ->
    repo.employeePayments().map { p ->
        SimpleRow(
            id = p.id.toString(),
            title = nn(p.concepto),
            subtitle = fmtMoney(p.monto),
            meta = listOfNotNull(
                p.usuario?.nombre,
                listOfNotNull(p.periodoInicio, p.periodoFin).takeIf { it.isNotEmpty() }?.joinToString(" → "),
                p.createdAt,
            ).joinToString(" · "),
            trailing = p.estatus,
        )
    }
}

// ── Cotizaciones ──────────────────────────────────────────────────────────
@Composable
fun CotizacionesModuleScreen() = GenericListModuleScreen(title = "Cotizaciones") { repo ->
    repo.cotizaciones().map { c ->
        SimpleRow(
            id = c.id.toString(),
            title = nn(c.folio ?: "Cotización #${c.id}"),
            subtitle = nn(c.cliente),
            meta = listOfNotNull(c.fecha ?: c.createdAt).joinToString(" · "),
            trailing = listOfNotNull(fmtMoney(c.total), c.estatus).joinToString(" · "),
        )
    }
}

// ── Lunch breaks ──────────────────────────────────────────────────────────
@Composable
fun LunchBreaksModuleScreen() = GenericListModuleScreen(title = "Comidas") { repo ->
    repo.lunchBreaks().map { l ->
        SimpleRow(
            id = l.id.toString(),
            title = nn(l.user?.nombre ?: "Usuario ${l.userId}"),
            subtitle = listOfNotNull(l.startTime, l.endTime).joinToString(" → "),
            meta = l.date,
            trailing = l.durationMinutes?.let { "${it} min" },
        )
    }
}

// ── My lunch breaks (filtra por usuario actual)
@Composable
fun MyLunchBreaksModuleScreen(currentUserId: Long?) = GenericListModuleScreen(title = "Mis comidas") { repo ->
    repo.lunchBreaks()
        .filter { currentUserId == null || it.userId == currentUserId || it.user?.id == currentUserId }
        .map { l ->
            SimpleRow(
                id = l.id.toString(),
                title = l.date ?: "—",
                subtitle = listOfNotNull(l.startTime, l.endTime).joinToString(" → "),
                trailing = l.durationMinutes?.let { "${it} min" },
            )
        }
}

// ── Documents ─────────────────────────────────────────────────────────────
@Composable
fun DocumentsModuleScreen() = GenericListModuleScreen(title = "Documentos") { repo ->
    repo.documents().map { d ->
        SimpleRow(
            id = d.id.toString(),
            title = nn(d.title),
            subtitle = d.fileUrl,
            meta = d.createdAt,
            trailing = d.type,
        )
    }
}

// ── Accounting journal entries ────────────────────────────────────────────
@Composable
fun AccountingModuleScreen() = GenericListModuleScreen(title = "Contabilidad · Asientos") { repo ->
    repo.journalEntries().map { j ->
        SimpleRow(
            id = j.id.toString(),
            title = nn(j.description ?: j.reference),
            subtitle = "Débito ${fmtMoney(j.totalDebit)}  ·  Crédito ${fmtMoney(j.totalCredit)}",
            meta = j.entryDate,
            trailing = j.status,
        )
    }
}

// ── Invoicing ─────────────────────────────────────────────────────────────
@Composable
fun InvoicingModuleScreen() = GenericListModuleScreen(title = "Facturación") { repo ->
    repo.invoices().map { i ->
        SimpleRow(
            id = i.id.toString(),
            title = nn(i.folio ?: "Factura #${i.id}"),
            subtitle = nn(i.clientName),
            meta = i.issueDate,
            trailing = listOfNotNull(fmtMoney(i.total), i.status).joinToString(" · "),
        )
    }
}

// ── Banking ───────────────────────────────────────────────────────────────
@Composable
fun BankingModuleScreen() = GenericListModuleScreen(title = "Banca · Cuentas") { repo ->
    repo.bankAccounts().map { b ->
        SimpleRow(
            id = b.id.toString(),
            title = nn(b.name),
            subtitle = listOfNotNull(b.bank, b.accountNumber).joinToString(" · "),
            trailing = listOfNotNull(fmtMoney(b.balance), b.currency).joinToString(" · "),
        )
    }
}

// ── Workflow ──────────────────────────────────────────────────────────────
@Composable
fun WorkflowModuleScreen() = GenericListModuleScreen(title = "Flujos") { repo ->
    repo.workflow().map { w ->
        SimpleRow(
            id = w.id.toString(),
            title = nn(w.name),
            subtitle = w.assignedTo,
            meta = w.updatedAt,
            trailing = w.status,
        )
    }
}
