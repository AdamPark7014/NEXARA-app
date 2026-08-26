package mx.nexara.mobile.nativeapp.ui.onboarding

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

private data class OnboardingSlide(
    val emoji: String,
    val title: String,
    val subtitle: String,
    val accent: Color,
    val accentSoft: Color,
)

private val slides = listOf(
    OnboardingSlide(
        emoji = "🏗️",
        title = "ERP en campo",
        subtitle = "Gestiona operaciones, inventario, GPS, asistencia y evidencias desde cualquier sitio de trabajo.",
        accent = NxColors.Teal,
        accentSoft = NxColors.TealSoft,
    ),
    OnboardingSlide(
        emoji = "📊",
        title = "CRM y Smart Quote",
        subtitle = "Da seguimiento a leads, oportunidades y genera cotizaciones inteligentes en minutos.",
        accent = NxColors.Info,
        accentSoft = NxColors.InfoSoft,
    ),
    OnboardingSlide(
        emoji = "💬",
        title = "Chat y OPS",
        subtitle = "Coordina equipos en tiempo real, tickets y alertas operativas en un solo lugar.",
        accent = Color(0xFF7C3AED),
        accentSoft = Color(0xFFEDE9FE),
    ),
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun OnboardingScreen(
    onFinish: () -> Unit,
) {
    val pagerState = rememberPagerState(pageCount = { slides.size })
    val scope = rememberCoroutineScope()
    val isLastPage = pagerState.currentPage == slides.lastIndex

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color(0xFFE6F7F6), NxColors.Surface, Color.White),
                ),
            ),
    ) {
        TextButton(
            onClick = onFinish,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 8.dp, end = 4.dp),
        ) {
            Text(
                "Omitir",
                color = NxColors.Muted,
                style = MaterialTheme.typography.labelLarge,
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(72.dp))

            HorizontalPager(
                state = pagerState,
                modifier = Modifier.weight(1f),
            ) { page ->
                OnboardingSlideContent(slide = slides[page])
            }

            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(bottom = 24.dp),
            ) {
                slides.forEachIndexed { index, slide ->
                    val selected = pagerState.currentPage == index
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 4.dp)
                            .height(if (selected) 8.dp else 6.dp)
                            .width(if (selected) 24.dp else 8.dp)
                            .clip(CircleShape)
                            .background(
                                if (selected) slide.accent else NxColors.Muted.copy(alpha = 0.3f),
                            ),
                    )
                }
            }

            Button(
                onClick = {
                    if (isLastPage) {
                        onFinish()
                    } else {
                        scope.launch {
                            pagerState.animateScrollToPage(pagerState.currentPage + 1)
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = NxColors.Teal,
                    contentColor = Color.White,
                ),
            ) {
                Text(
                    if (isLastPage) "Comenzar" else "Siguiente",
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                )
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun OnboardingSlideContent(slide: OnboardingSlide) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(140.dp)
                .clip(RoundedCornerShape(32.dp))
                .background(
                    Brush.linearGradient(
                        colors = listOf(slide.accentSoft, Color.White),
                    ),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = slide.emoji,
                fontSize = 64.sp,
            )
        }

        Spacer(Modifier.height(40.dp))

        Text(
            text = slide.title,
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            color = NxColors.Slate,
            textAlign = TextAlign.Center,
        )

        Spacer(Modifier.height(12.dp))

        Text(
            text = slide.subtitle,
            style = MaterialTheme.typography.bodyLarge,
            color = NxColors.Muted,
            textAlign = TextAlign.Center,
            lineHeight = 24.sp,
            modifier = Modifier.padding(horizontal = 8.dp),
        )
    }
}
