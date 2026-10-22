# Reuniones: versión local sin commitear (12-10-2026)

Estos 14 archivos estaban modificados sin commitear en `C:\dev\apps\NEXARA-app` desde el 12-10-2026
(15:35 hora de México), unos minutos después de que una sesión en la nube subiera `63accdee`
«feat(reuniones): empezar reunión ahora, acta sola y acuerdos que se vuelven actividades».
Son otra implementación de la misma especificación (`438eaca7`) y NO coinciden con `63accdee`,
que es lo que está en `main` remoto y en el servidor.

El 22-10-2026, para poder poner `main` local al día con el remoto sin perderlos, se guardaron aquí
(`reuniones-sin-commitear.patch`, base `438eaca7`) y además en `git stash` con el mismo nombre.
Nadie los ha descartado: Adam decide si algo de esta versión se rescata sobre `63accdee`.

Para verla: `git apply --3way .ai/salvado/2026-10-12-reuniones-local/reuniones-sin-commitear.patch`
sobre un árbol limpio (va a chocar con `63accdee` en los mismos archivos).
