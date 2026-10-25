import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));
const fuente = readFileSync(join(raiz, "NexaraApp/Data/VehiculosRepository.swift"), "utf8");

/** A 390 px iban en el mismo renglón. */
const textoViejo = "Ranger · ABC-123";
const hojaVieja = "Solicitar Ranger · ABC-123";

function bloque(tipo) {
  const marca = `struct ${tipo}`;
  const inicio = fuente.indexOf(marca);
  assert.notEqual(inicio, -1, tipo);
  const resto = fuente.slice(inicio + marca.length);
  const corte = resto.search(/\n(?:struct |enum |final class |private func )/);
  return corte === -1 ? resto : resto.slice(0, corte);
}

function titulo(nombre, placas) {
  const fn = fuente.match(
    /private func tituloNombreYPlacas\(nombre: String, placas: String\?\) -> String \{([\s\S]*?)\n\}/,
  );
  assert.ok(fn, "tituloNombreYPlacas");
  const cuerpo = fn[1];
  assert.match(cuerpo, /let base = nombre\.isEmpty \? "Vehículo" : nombre/);
  assert.match(cuerpo, /guard let placas, !placas\.isEmpty else \{ return base \}/);
  assert.match(cuerpo, /return "\\\(base\)\\n\\\(placas\)"/);
  assert.doesNotMatch(cuerpo, / · /);
  assert.doesNotMatch(cuerpo, /disponible/);
  const base = nombre === "" ? "Vehículo" : nombre;
  if (placas == null || placas === "") return base;
  return `${base}\n${placas}`;
}

test("el nombre y las placas van cada uno en su renglón", () => {
  const libre = titulo("Ranger", "ABC-123");
  const hoja = `Solicitar ${libre}`;

  assert.equal(libre, "Ranger\nABC-123");
  assert.notEqual(libre, textoViejo);
  assert.deepEqual(libre.split("\n"), ["Ranger", "ABC-123"]);
  assert.equal(libre.split("\n")[0], "Ranger");

  assert.equal(hoja, "Solicitar Ranger\nABC-123");
  assert.notEqual(hoja, hojaVieja);
  assert.deepEqual(hoja.split("\n"), ["Solicitar Ranger", "ABC-123"]);

  assert.equal(titulo("Ranger", null), "Ranger");
  assert.equal(titulo("Ranger", ""), "Ranger");
  assert.equal(titulo("", "ABC-123"), "Vehículo\nABC-123");
  assert.equal(titulo("", null), "Vehículo");
  assert.equal(titulo("Ranger", null).includes("\n"), false);

  assert.equal(fuente.includes(textoViejo), false, textoViejo);
  assert.equal(fuente.includes(hojaVieja), false, hojaVieja);
  assert.equal(fuente.includes(" · \\(placas)"), false);

  assert.match(bloque("VehiculoRef"), /var titulo: String \{ tituloNombreYPlacas\(nombre: nombre, placas: placas\) \}/);
  assert.match(
    bloque("SolicitudResumen"),
    /var titulo: String \{ tituloNombreYPlacas\(nombre: nombreVehiculo \?\? "", placas: placasVehiculo\) \}/,
  );
  assert.match(bloque("VehiculoFlota"), /var titulo: String \{ tituloNombreYPlacas\(nombre: nombre, placas: placas\) \}/);

  assert.match(fuente, /disponible = \(try\? c\.decode\(Bool\.self, forKey: \.disponible\)\) \?\? false/);
  assert.match(fuente, /func solicitar\(\s*actividadId: Int,\s*vehicleId: Int,/);
  assert.match(fuente, /api\.postJSON\("vehicles", body: body\)/);
});
