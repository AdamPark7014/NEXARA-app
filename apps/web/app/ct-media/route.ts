import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = new Set(['static.ctonline.mx']);

/**
 * Proxy de imágenes CT. Cloudflare de CT bloquea hotlink con Referer externo (403).
 * Este route fetcha sin Referer y sirve la imagen desde el mismo origen de Nexara.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('u')?.trim() || '';
  if (!raw) {
    return NextResponse.json({ message: 'Missing u' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ message: 'Invalid url' }, { status: 400 });
  }

  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ message: 'Host not allowed' }, { status: 400 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        'User-Agent': 'NEXARA-SmartQuote/1.0',
        // Sin Referer: CT Cloudflare responde 200
      },
      // Sin seguir redirecciones: un 30x de CT podía llevar el proxy a otro host (o a la red interna).
      redirect: 'error',
      cache: 'force-cache',
      next: { revalidate: 60 * 60 * 24 * 7 },
    } as RequestInit);

    if (!upstream.ok) {
      return NextResponse.json(
        { message: `Upstream ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    // Solo mapas de bits: un SVG servido desde nuestro dominio puede llevar <script>.
    if (!/^image\/(jpeg|png|webp|gif|avif)\b/i.test(contentType)) {
      return NextResponse.json({ message: 'Not an image' }, { status: 502 });
    }

    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    };

    const body = upstream.body;
    if (!body) {
      const buf = await upstream.arrayBuffer();
      return new NextResponse(buf, { status: 200, headers });
    }

    return new NextResponse(body, { status: 200, headers });
  } catch {
    return NextResponse.json({ message: 'Proxy failed' }, { status: 502 });
  }
}
