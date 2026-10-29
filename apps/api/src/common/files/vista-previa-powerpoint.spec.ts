import JSZip from 'jszip';
import { parrafosDeDiapositiva, powerpointAHtml, tieneVistaPreviaHtml, tipoDeDocumento, vistaPreviaHtml } from './vista-previa-documento.js';

const diapositiva = (parrafos: string[], conFoto = false) =>
  `<p:sld><p:cSld><p:spTree>${parrafos
    .map((t) => `<p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`)
    .join('')}${conFoto ? '<p:pic><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>' : ''}</p:spTree></p:cSld></p:sld>`;

async function pptx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'ppt/presentation.xml',
    '<p:presentation><p:sldIdLst><p:sldId id="257" r:id="rId8"/><p:sldId id="256" r:id="rId7"/></p:sldIdLst></p:presentation>',
  );
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    '<Relationships><Relationship Id="rId7" Target="slides/slide1.xml"/><Relationship Id="rId8" Target="slides/slide2.xml"/></Relationships>',
  );
  zip.file('ppt/slides/slide1.xml', diapositiva(['Alcance', 'Instalación de 8 cámaras &amp; NVR']));
  zip.file('ppt/slides/slide2.xml', diapositiva(['Propuesta Plaza Norte'], true));
  zip.file('ppt/slides/_rels/slide2.xml.rels', '<Relationships><Relationship Id="rId2" Target="../media/image1.png"/></Relationships>');
  zip.file('ppt/media/image1.png', Buffer.from([137, 80, 78, 71]));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('vista previa de PowerPoint', () => {
  it('reconoce el pptx; el ppt viejo no tiene vista', () => {
    expect(tipoDeDocumento('Propuesta.pptx')).toBe('powerpoint');
    expect(tieneVistaPreviaHtml('powerpoint')).toBe(true);
    expect(tipoDeDocumento('vieja.ppt')).toBe('otro');
  });

  it('lee los párrafos y desescapa el texto', () => {
    expect(parrafosDeDiapositiva(diapositiva(['Hola', '&lt;b&gt; y &amp;']))).toEqual(['Hola', '<b> y &']);
  });

  it('una tarjeta por diapositiva en el orden de la presentación, con su foto incrustada', async () => {
    const html = await powerpointAHtml(await pptx(), 'Propuesta.pptx');
    expect(html.indexOf('Propuesta Plaza Norte')).toBeLessThan(html.indexOf('Alcance'));
    expect(html).toContain('Diapositiva 1');
    expect(html).toContain('data:image/png;base64,');
    // Se vuelve a escapar al pintar: nunca HTML crudo de la presentación.
    expect(html).toContain('Instalación de 8 cámaras &amp; NVR');
    expect(html).not.toContain('<script');
  });

  it('vistaPreviaHtml la usa para .pptx', async () => {
    expect(await vistaPreviaHtml(await pptx(), 'x.pptx')).toContain('class="lamina"');
  });
});
