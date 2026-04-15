package mx.nexara.mobile.nativeapp.ui.console.util

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter

data class DateRange(
    val from: String,
    val to: String,
)

private val fmt: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

/**
 * Matches the web dashboard logic (week starts on Monday).
 */
fun currentWeekRange(today: LocalDate = LocalDate.now()): DateRange {
    val dow = today.dayOfWeek
    val deltaToMonday = (dow.value - DayOfWeek.MONDAY.value).toLong() // Monday=1..Sunday=7
    val start = today.minusDays(deltaToMonday)
    val end = start.plusDays(6)
    return DateRange(from = start.format(fmt), to = end.format(fmt))
}

