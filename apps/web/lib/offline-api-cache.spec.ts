import { describe, expect, it } from 'vitest';
import { authCacheTag } from './offline-api-cache';

/**
 * QA adversarial · la caché offline de GET no puede cruzar empresas.
 *
 * La clave de cada respuesta guardada es `${authCacheTag}::${url}`. La empresa
 * activa NO viaja en la URL: va en la cabecera `X-Company-Id` que pone
 * `apiRequest` desde `localStorage`. Si la etiqueta sólo lleva token y usuario,
 * una contadora que pertenece a dos empresas guarda el libro de movimientos de
 * la empresa A y, al cambiar a la B y quedarse sin red, lee la cartera de A
 * creyendo que es la de B.
 *
 * La propia caché ya se versionó de v1 a v2 por este mismo tipo de cruce entre
 * usuarios; faltaba la dimensión de empresa.
 */

describe('caché offline de GET · la etiqueta separa por empresa', () => {
  const TOKEN = 'jwt-de-la-contadora';

  it('el mismo usuario en dos empresas no comparte etiqueta', () => {
    expect(authCacheTag(TOKEN, 9, 1)).not.toBe(authCacheTag(TOKEN, 9, 2));
  });

  it('sin empresa activa tampoco se mezcla con una empresa concreta', () => {
    expect(authCacheTag(TOKEN, 9, null)).not.toBe(authCacheTag(TOKEN, 9, 1));
  });

  it('la misma empresa y el mismo usuario sí reutilizan la copia local', () => {
    expect(authCacheTag(TOKEN, 9, 3)).toBe(authCacheTag(TOKEN, 9, 3));
  });

  it('sigue separando por usuario y por token', () => {
    expect(authCacheTag(TOKEN, 9, 1)).not.toBe(authCacheTag(TOKEN, 10, 1));
    expect(authCacheTag(TOKEN, 9, 1)).not.toBe(authCacheTag('otro-jwt', 9, 1));
  });

  it('un valor de empresa vacío o basura no cuenta como empresa', () => {
    expect(authCacheTag(TOKEN, 9, '  ')).toBe(authCacheTag(TOKEN, 9, null));
  });
});
