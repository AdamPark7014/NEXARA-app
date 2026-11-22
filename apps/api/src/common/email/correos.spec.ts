import nodemailer from 'nodemailer';
import {
  aTextoPlano,
  botonDeCorreo,
  conSaltos,
  correoNexara,
  escaparHtml,
  parrafo,
  remitenteConNombre,
  saludo,
} from './correo-nexara.js';
import { avisoInterno } from './email.service.js';
import { correoDeCotizacion } from '../../cotizaciones/correo-cotizacion.js';
import { correoDeAccesoAlPortal, correoDeEncuestaDeServicio } from '../../service-clients/correos-portal.js';
import { correoDeNuevoContacto, correoDeRespuestaAContacto } from '../../contact-messages/correos-contacto.js';
import { correoDeNoticia, ligaDeLaNoticia } from '../../news/correo-noticia.js';

const VARIABLES = ['EMAIL_LOGO_URL', 'PUBLIC_WEB_URL', 'WEB_URL'] as const;
const antes: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const v of VARIABLES) {
    antes[v] = process.env[v];
    delete process.env[v];
  }
});
afterEach(() => {
  for (const v of VARIABLES) {
    if (antes[v] === undefined) delete process.env[v];
    else process.env[v] = antes[v];
  }
});

/** Cada etiqueta que abre tiene su cierre: un `<td>` suelto descuadra el correo entero en Outlook. */
function etiquetasCuadran(html: string): boolean {
  return ['table', 'tr', 'td', 'p', 'a', 'h1', 'div', 'strong'].every(
    (e) => (html.match(new RegExp(`<${e}\\b`, 'g')) ?? []).length === (html.match(new RegExp(`</${e}>`, 'g')) ?? []).length,
  );
}

describe('marco de los correos', () => {
  it('es un documento completo, en español, con la cabecera pintada también sin degradados', () => {
    const html = correoNexara({ etiqueta: 'Cotización', avance: 'Va adjunta', cuerpo: parrafo('Hola') });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('name="viewport"');
    // Outlook no pinta `linear-gradient`: sin color de respaldo quedaban letras blancas sobre blanco.
    expect(html).toContain('bgcolor="#0b1b2e"');
    expect(html).toContain('background-color:#0b1b2e');
    expect(html).toContain('<!--[if mso]>');
    expect(html).toContain('>Va adjunta</div>');
    expect(etiquetasCuadran(html)).toBe(true);
  });

  it('el logo guarda su proporción y el nombre se lee aunque las imágenes estén bloqueadas', () => {
    const html = correoNexara({ etiqueta: 'Aviso', cuerpo: '' });
    // `logo-nexara.png` mide 343×374; a 120×40 salía estirado al triple.
    expect(html).toContain('src="https://nexara.com.mx/logo-nexara.png"');
    expect(html).toContain('width="37" height="40"');
    expect(html).not.toContain('width="120"');
    expect(html).toMatch(/letter-spacing:2px;[^>]*>NEXARA<\/td>/);
  });

  it('con un logo propio solo fija el alto, porque no conoce su proporción', () => {
    process.env['EMAIL_LOGO_URL'] = 'https://cdn.example.com/logo-ancho.png';
    const html = correoNexara({ etiqueta: 'Aviso', cuerpo: '' });
    expect(html).toContain('src="https://cdn.example.com/logo-ancho.png" alt="NEXARA" height="40"');
    expect(html).not.toContain('width="37"');
  });

  it('toma el sitio de la configuración, sin diagonal final', () => {
    process.env['PUBLIC_WEB_URL'] = 'https://demo.example.com/';
    expect(correoNexara({ etiqueta: 'Aviso', cuerpo: '' })).toContain('src="https://demo.example.com/logo-nexara.png"');
  });

  it('escapa lo que escribe una persona, en el cuerpo y en los rótulos', () => {
    expect(escaparHtml(`<b onclick="x">Ana & 'Luis'</b>`)).toBe('&lt;b onclick=&quot;x&quot;&gt;Ana &amp; &#39;Luis&#39;&lt;/b&gt;');
    expect(escaparHtml(null)).toBe('');
    expect(conSaltos(' uno\r\ndos <3 ')).toBe('uno<br />dos &lt;3');
    expect(saludo('<script>')).toContain('Hola &lt;script&gt;,');
    expect(saludo('  ')).toContain('>Hola,<');
    const html = correoNexara({ etiqueta: '<i>x</i>', avance: '"hola"', pie: 'a < b', cuerpo: '' });
    expect(html).toContain('&lt;i&gt;x&lt;/i&gt;');
    expect(html).toContain('&quot;hola&quot;');
    expect(html).toContain('a &lt; b');
  });

  it('el botón lleva el color en la celda y la dirección escapada', () => {
    const boton = botonDeCorreo('Ver "todo"', 'https://example.com/a?x=1&y=2');
    expect(boton).toContain('bgcolor="#1f4aa8"');
    expect(boton).toContain('href="https://example.com/a?x=1&amp;y=2"');
    expect(boton).toContain('>Ver &quot;todo&quot;</a>');
  });

  it('el remitente lleva el nombre de la empresa, sin tocar el que ya lo trae', async () => {
    expect(remitenteConNombre('ventas@example.com')).toBe('"NEXARA" <ventas@example.com>');
    expect(remitenteConNombre(' ventas@example.com ')).toBe('"NEXARA" <ventas@example.com>');
    expect(remitenteConNombre('Ventas <ventas@example.com>')).toBe('Ventas <ventas@example.com>');
    expect(remitenteConNombre('')).toBe('');
    // Lo que la librería entiende de ese remitente: nombre y dirección por separado.
    const info = await nodemailer.createTransport({ jsonTransport: true }).sendMail({
      from: remitenteConNombre('ventas@example.com'),
      to: 'cliente@example.com',
      subject: 'x',
      text: 'x',
    });
    expect(JSON.parse(String(info.message)).from).toEqual({ address: 'ventas@example.com', name: 'NEXARA' });
    expect(info.envelope.from).toBe('ventas@example.com');
  });

  it('saca la versión en texto: ligas a la vista, entidades de vuelta y sin etiquetas', () => {
    const cuerpo = [
      saludo('Ana & Luis'),
      parrafo('Va la <strong>cotización</strong>.<br />Segundo renglón.'),
      botonDeCorreo('Revisar', 'https://example.com/f?a=1&b=2'),
      parrafo('<a href="https://example.com">https://example.com</a>'),
    ].join('\n');
    expect(aTextoPlano(cuerpo)).toBe(
      ['Hola Ana & Luis,', 'Va la cotización.\nSegundo renglón.', 'Revisar: https://example.com/f?a=1&b=2', 'https://example.com'].join(
        '\n\n',
      ),
    );
    // Lo que una persona escribió con signos de HTML llega como lo escribió, no como etiqueta.
    expect(aTextoPlano(parrafo(escaparHtml('1 < 2 & <b>ojo</b>')))).toBe('1 < 2 & <b>ojo</b>');
  });
});

describe('cada correo', () => {
  it('cotización: asunto con acento, botón para firmar, mensaje escapado y texto equivalente', () => {
    const liga = 'https://nexara.com.mx/cotizaciones/firmar/abc123';
    const c = correoDeCotizacion({
      cliente: 'Farmacias <Patito>',
      folio: 'COT-2026-0142',
      mensaje: 'Incluye instalación.\n<img src=x onerror=alert(1)>',
      ligaParaFirmar: liga,
    });
    expect(c.subject).toBe('Cotización COT-2026-0142');
    expect(c.html).toContain('Hola Farmacias &lt;Patito&gt;,');
    expect(c.html).toContain('<strong>COT-2026-0142</strong>');
    expect(c.html).toContain('Incluye instalación.<br />&lt;img src=x onerror=alert(1)&gt;');
    expect(c.html).not.toContain('<img src=x');
    expect(c.html).toContain(`href="${liga}"`);
    expect(c.html).toContain('>Revisar y firmar la cotización</a>');
    expect(etiquetasCuadran(c.html)).toBe(true);
    expect(c.text).toContain('Hola Farmacias <Patito>,');
    expect(c.text).toContain(`Puedes revisarla y firmarla en línea: ${liga}`);
    expect(c.text).toContain('<img src=x onerror=alert(1)>');
  });

  it('cotización sin nombre ni mensaje: saluda sin inventar a quién y no deja un recuadro vacío', () => {
    const c = correoDeCotizacion({ cliente: null, folio: 'COT-1', ligaParaFirmar: 'https://example.com/f' });
    expect(c.html).toContain('>Hola,<');
    expect(c.html).not.toContain('Hola cliente');
    expect(c.html).not.toContain('border:1px solid #d7e1f2');
    expect(c.text.startsWith('Hola,\n\nTe compartimos la cotización COT-1.')).toBe(true);
  });

  it('acceso al portal: «Contraseña», datos escapados y la liga del portal', () => {
    const c = correoDeAccesoAlPortal({
      cliente: 'Hotel Demo',
      usuario: 'hotel.demo@example.com',
      contrasena: 'Abc<123>&',
      ligaDelPortal: 'https://nexara.com.mx/tickets',
    });
    expect(c.subject).toBe('Tu acceso al portal de tickets de NEXARA');
    expect(c.html).toContain('<strong>Contraseña:</strong> Abc&lt;123&gt;&amp;');
    expect(c.html).not.toMatch(/Password|genero tu acceso/);
    expect(c.text).toContain('Usuario: hotel.demo@example.com');
    expect(c.text).toContain('Contraseña: Abc<123>&');
    expect(c.text).toContain('Entrar al portal: https://nexara.com.mx/tickets');
    // En texto la dirección ya va junto al botón: el renglón de respaldo no se repite.
    expect(c.html).toContain('Si el botón no abre');
    expect(c.text).not.toContain('Si el botón no abre');
    expect(etiquetasCuadran(c.html)).toBe(true);
  });

  it('encuesta de servicio: ortografía y botón', () => {
    const c = correoDeEncuestaDeServicio({
      cliente: 'Hotel Demo',
      servicio: 'Mantenimiento de 12 cámaras',
      ligaDelPortal: 'https://nexara.com.mx/tickets',
    });
    expect(c.subject).toBe('Tu opinión sobre el servicio de NEXARA');
    expect(c.html).toContain('Terminamos el servicio <strong>Mantenimiento de 12 cámaras</strong>');
    expect(c.html).toContain('>Responder la encuesta</a>');
    expect(c.html).not.toMatch(/opinion\b|se marco/);
    expect(etiquetasCuadran(c.html)).toBe(true);
  });

  it('nuevo contacto: rótulos en español y solo los datos que llegaron', () => {
    const c = correoDeNuevoContacto({
      categoria: 'Ventas y Productos',
      nombre: 'Ana <Demo>',
      correo: 'ana@example.com',
      telefono: null,
      empresa: 'Demo & Hijos',
      asunto: null,
      mensaje: 'Quiero 8 cámaras.\nGracias.',
      origen: null,
    });
    expect(c.subject).toBe('Nuevo contacto [Ventas y Productos]: Ana <Demo>');
    expect(c.html).toContain('Ana &lt;Demo&gt;');
    expect(c.html).toContain('<strong>Correo:</strong> ana@example.com');
    expect(c.html).toContain('<strong>Empresa:</strong> Demo &amp; Hijos');
    expect(c.html).toContain('<strong>Categoría:</strong> Ventas y Productos');
    expect(c.html).not.toMatch(/Teléfono|Asunto|Categoria|Email:/);
    expect(c.html).toContain('Quiero 8 cámaras.<br />Gracias.');
    expect(c.html).toContain('Origen: formulario');
    expect(etiquetasCuadran(c.html)).toBe(true);
  });

  it('respuesta a un contacto: nombre escapado (viene de un formulario público) y ortografía', () => {
    const c = correoDeRespuestaAContacto({
      nombre: '<b>Ana</b>',
      asuntoOriginal: 'Cámaras',
      respuesta: 'Con gusto.\nTe llamamos mañana.',
      ligaDeWhatsApp: 'https://wa.me/5210000000000?text=Hola',
      telefono: '+52 1 55 0000 0000',
      sitio: 'https://nexara.com.mx',
    });
    expect(c.subject).toBe('Respuesta: Cámaras');
    expect(c.html).toContain('Hola &lt;b&gt;Ana&lt;/b&gt;,');
    expect(c.html).not.toContain('<b>Ana</b>');
    expect(c.html).toContain('Si tienes más dudas');
    expect(c.html).not.toMatch(/continuacion|mas dudas/);
    expect(c.html).toContain('>nexara.com.mx</a>');
    expect(c.text).toContain('Con gusto.\nTe llamamos mañana.');
    expect(correoDeRespuestaAContacto({ ...datosDeRespuesta(), asuntoOriginal: null }).subject).toBe('Respuesta de NEXARA');
    expect(etiquetasCuadran(c.html)).toBe(true);
  });

  it('noticia: «Ver noticia» abre la noticia cuando el blog del sitio la publica, y si no la portada', () => {
    expect(ligaDeLaNoticia('https://nexara.com.mx/', 'nueva-sede puebla', true)).toBe(
      'https://nexara.com.mx/blog/nueva-sede%20puebla',
    );
    expect(ligaDeLaNoticia('https://nexara.com.mx', 'nueva-sede', false)).toBe('https://nexara.com.mx');
    expect(ligaDeLaNoticia('https://nexara.com.mx', '  ', true)).toBe('https://nexara.com.mx');
    const c = correoDeNoticia({
      suscriptor: '<i>Luis</i>',
      tituloDeLaNoticia: 'Nueva sede',
      resumen: 'Abrimos en Puebla.',
      liga: 'https://nexara.com.mx/blog/nueva-sede',
    });
    expect(c.html).toContain('Hola &lt;i&gt;Luis&lt;/i&gt;,');
    expect(c.html).toContain('href="https://nexara.com.mx/blog/nueva-sede"');
    expect(c.html).toContain('Recibes este correo porque te suscribiste a Nexara News.');
    expect(c.html).not.toMatch(/Estas recibiendo/);
    expect(correoDeNoticia({ tituloDeLaNoticia: 'x', resumen: 'y', liga: 'z' }).text.startsWith('Hola,')).toBe(true);
    expect(etiquetasCuadran(c.html)).toBe(true);
  });

  it('aviso interno: título, renglones y su versión en texto', () => {
    const a = avisoInterno('Factura vencida', [parrafo('La factura <strong>F-12</strong> tiene <strong>1</strong> día de atraso.')]);
    expect(a.html).toContain('>Factura vencida</h1>');
    expect(a.html).toContain('Aviso automático de NEXARA. No hace falta responder.');
    expect(a.text).toBe('Factura vencida\n\nLa factura F-12 tiene 1 día de atraso.');
    expect(etiquetasCuadran(a.html)).toBe(true);
  });
});

function datosDeRespuesta() {
  return {
    nombre: 'Ana',
    respuesta: 'Listo.',
    ligaDeWhatsApp: 'https://wa.me/5210000000000',
    telefono: '+52 1 55 0000 0000',
    sitio: 'https://nexara.com.mx',
  };
}
