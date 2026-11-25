/**
 * Script en línea que va justo antes del hero de la portada. Si la persona ya vio la entrada en esta sesión (y no
 * recargó la página a propósito), marca `<html data-intro="visto">` antes del primer pintado y el escenario aparece ya
 * armado. Vive en su propio archivo, sin "use client", para que el servidor lo importe como texto.
 */
export const GUION_ENTRADA =
  "try{var n=performance.getEntriesByType('navigation')[0];if(sessionStorage.getItem('nx:intro')&&!(n&&n.type==='reload')){document.documentElement.setAttribute('data-intro','visto')}else{sessionStorage.setItem('nx:intro','1')}}catch(e){}";
