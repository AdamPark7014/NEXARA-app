import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const fuente = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "NexaraApp/UI/Common/MediaPickerBar.swift"),
  "utf8",
);

/** El aviso de antes: dos frases y el botón Entendido. */
const textoViejo = "No se pudo leer el archivo. Intenta con otro o vuelve a elegirlo.";
const texto = "No se pudo leer el archivo; intenta con otro o vuelve a elegirlo.";

const cuerpoDelBoton = (etiqueta) => {
  const inicio = fuente.indexOf(`Button("${etiqueta}")`);
  assert.notEqual(inicio, -1, etiqueta);
  const resto = fuente.slice(inicio);
  const fin = resto.indexOf("} message:");
  assert.notEqual(fin, -1, etiqueta);
  return resto.slice(0, fin);
};

test("el fallo al leer el archivo es una frase y Reintentar vuelve a abrirlo", () => {
  assert.equal(fuente.includes(textoViejo), false, textoViejo);
  assert.equal(fuente.includes('Button("Entendido"'), false);

  const avisos = [...fuente.matchAll(/importError = "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(avisos, [texto]);
  const frases = texto.split(/(?<=[.!?])\s+/).filter(Boolean);
  assert.equal(frases.length, 1);
  assert.match(texto, /^No se pudo leer el archivo\b/);

  const reintentar = cuerpoDelBoton("Reintentar");
  assert.match(reintentar, /showDocPicker = true/);
  assert.doesNotMatch(reintentar, /role:\s*\.cancel/);

  assert.match(fuente, /Label\("Archivo", systemImage: "paperclip"\)/);
  assert.match(fuente, /maxSelectionCount: 10/);
  assert.match(
    fuente,
    /allowedContentTypes: \[\.pdf, \.spreadsheet, UTType\(filenameExtension: "xlsx"\) \?\? \.data, \.plainText, \.image, \.data\]/,
  );
  assert.match(fuente, /allowsMultipleSelection: true/);
  assert.match(fuente, /NSUserCancelledError/);
});
