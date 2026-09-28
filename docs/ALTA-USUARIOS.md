# Alta de usuarios

El módulo está en `/erp/organigrama`. Solo lo ve quien tiene **subordinados directos** (`managerId`, activos, de su empresa; el lateral del organigrama no cuenta) y además puede crear algún tipo. El API repite esa regla: sin subordinados, `GET /api/users/delegated/contexto` trae `puede: false` y `POST /api/users/delegated` responde 403.

El tipo que cada quien crea sale de la política `users.creation_grants` (por correo, no por rol: David y Luis comparten `coord_operaciones`). Dirección no necesita esa fila.

| Quién | Formulario | Qué crea | Rol y jefe |
| --- | --- | --- | --- |
| Christian (CEO, usuario 1, `gerencia@`) | Completo: nombre, correo, contraseña, teléfono, foto, rol, departamento, jefe y número de empleado. Obligatorios: nombre, correo, contraseña y rol. | Cualquier rol de la empresa salvo otro CEO, super admin y cliente de portal. | Elige departamento y jefe. Si no elige, el departamento es el área del rol y el jefe es él. |
| David Zenón (`operaciones@`) | Básico: nombre, correo, contraseña, teléfono y foto. Teléfono obligatorio. | Solo instaladores (`ing_campo`), el tipo de su gente (por ejemplo los usuarios 57-60). | Rol y jefe fijos. El jefe es David. |
| Antonio (`jose.ramirez@`, encargado de soporte) | El mismo básico. | Solo soporte (`ing_soporte`). | Rol y jefe fijos. El jefe es Antonio. |
| Luis (`direccion.operaciones@`, `coord_operaciones`) | El mismo básico. | Los mismos tipos que Antonio: soporte. | Rol y jefe fijos. El jefe es Luis. |

Quien no tiene subordinados, o no está en esa política, no ve el botón. Un ingeniero con gente a cargo pero sin concesión tampoco.

La foto se toma con la cámara o se elige un archivo. Se recorta al centro en un cuadrado y se ve en círculo. Queda en `User.avatarUrl`, que es el avatar de la web, de Android y de iOS. No es la foto de entrada ni la de salida de una actividad, ni la selfie de la checada: esa selfie solo rellena el avatar cuando todavía está vacío y no pisa una foto ya subida. Desde el mismo módulo se puede cambiar la foto de quien le reporta al jefe; dirección puede cambiar la de cualquiera de la empresa (`PATCH /api/users/delegated/:id`).

El teléfono se guarda en `UserProfile.telefono`. No hay migración: `avatarUrl` y `telefono` ya existían.

Despliegue (no corrido desde el cambio): `cd /var/www/nexara-app && bash deploy/update.sh`.
