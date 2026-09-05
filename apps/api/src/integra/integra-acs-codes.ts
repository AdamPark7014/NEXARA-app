/**
 * Los códigos ACS viven ahora en `hikvision-isapi/acs-codes.ts`.
 *
 * Se movieron porque son conocimiento del **protocolo Hikvision**, no de
 * INTEGRA: el Apéndice C es del fabricante. Mientras vivían aquí, el propio
 * cliente ISAPI no podía usarlos sin invertir las capas, y por eso
 * `describeAcsEvent` acabó siendo una QUINTA copia del mismo mapa — con el
 * mismo error: el minor 21 etiquetado «Acceso denegado» cuando es la puerta
 * abriéndose.
 *
 * Este archivo se queda como puente para no obligar a cambiar los imports de
 * media docena de servicios.
 */
export * from '../hikvision-isapi/acs-codes';
