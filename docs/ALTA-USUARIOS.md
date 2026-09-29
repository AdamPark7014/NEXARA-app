# Alta de usuarios y «Perfiles»

El módulo está en `/erp/perfiles` (página propia, no vive dentro de Organigrama — esa es solo el árbol de lectura). Solo lo ve quien tiene **subordinados directos** (`managerId`, activos, de su empresa; el lateral del organigrama no cuenta) y además puede crear algún tipo. El API repite esa regla: sin subordinados, `GET /api/users/delegated/contexto` trae `puede: false` y `POST /api/users/delegated` responde 403.

**«Mi perfil» pasa a «Perfiles»** en el menú de la cuenta (abajo a la izquierda) y en la barra lateral, para quien tiene ese permiso — lleva a `/erp/perfiles` en vez del formulario de un solo perfil. Ahí, además de dar de alta, ve la lista de su gente con un botón «Editar» por persona, y un botón «Mi perfil» para editar el suyo. Quien no tiene el permiso sigue viendo «Mi perfil» normal, sin cambios. Sin permiso y entrando directo a `/erp/perfiles`, la página avisa que no hay nada para esa cuenta en vez de quedar en blanco.

**«Editar»** abre un modal con foto, nombre y teléfono — eso lo cambia cualquiera con el permiso, con quien le reporta (dirección, con cualquiera de la empresa). Si quien edita es dirección, el modal suma tipo de usuario, departamento, jefe y número de empleado; para los demás esos cuatro campos ni se muestran (y si llegaran igual al API, los rechaza con 403). Reusa `UsersService.update` para esos cuatro: valida rol/departamento/jefe contra la empresa, sincroniza el número de empleado en la membresía y empuja el cambio a control de acceso igual que la edición general de usuarios. Nadie puede quedar como su propio jefe, y ni el dueño ni la cuenta de desarrollo se editan desde aquí.

El tipo que cada quien crea sale de la política `users.creation_grants` (por correo, no por rol: David y Luis comparten `coord_operaciones`). Dirección no necesita esa fila.

| Quién | Formulario | Qué crea | Rol y jefe | Lista de «Perfiles» |
| --- | --- | --- | --- | --- |
| Christian (CEO, usuario 1, `gerencia@`) | Completo: nombre, correo, contraseña, teléfono, foto, rol, departamento, jefe y número de empleado. Obligatorios: nombre, correo, contraseña y rol. | Cualquier rol de la empresa salvo otro CEO, super admin y cliente de portal. | Elige departamento y jefe. Si no elige, el departamento es el área del rol y el jefe es él. | Toda la empresa (menos él, el dueño y la cuenta de desarrollo). |
| David Zenón (`operaciones@`) | Básico: nombre, correo, contraseña, teléfono y foto. Teléfono obligatorio. | Solo instaladores (`ing_campo`), el tipo de su gente (por ejemplo los usuarios 57-60). | Rol y jefe fijos. El jefe es David. | Solo quien le reporta directo. |
| Antonio (`jose.ramirez@`, encargado de soporte) | El mismo básico. | Solo soporte (`ing_soporte`). | Rol y jefe fijos. El jefe es Antonio. | Solo quien le reporta directo. |
| Luis (`direccion.operaciones@`, `coord_operaciones`) | El mismo básico. | Los mismos tipos que Antonio: soporte. | Rol y jefe fijos. El jefe es Luis. | Solo quien le reporta directo. |

Quien no tiene subordinados, o no está en esa política, no ve el módulo. Un ingeniero con gente a cargo pero sin concesión tampoco.

La foto se toma con la cámara o se elige un archivo. Se recorta al centro en un cuadrado y se ve en círculo. Queda en `User.avatarUrl`, que es el avatar de la web, de Android y de iOS (y, desde ahora, también de la tarjeta de Asistencias). No es la foto de entrada ni la de salida de una actividad, ni la selfie de la checada: esa selfie solo rellena el avatar cuando todavía está vacío y no pisa una foto ya subida. Desde el mismo módulo se puede cambiar la foto de quien le reporta al jefe; dirección puede cambiar la de cualquiera de la empresa (`PATCH /api/users/delegated/:id`).

El teléfono se guarda en `UserProfile.telefono`. No hay migración: `avatarUrl` y `telefono` ya existían.

Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
