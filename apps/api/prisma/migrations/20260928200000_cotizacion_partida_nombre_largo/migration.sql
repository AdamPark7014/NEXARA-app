-- El título de la partida (columna Descripción del PDF) se guardaba en varchar(200)
-- y el guardado lo recortaba a media frase. Pasa a texto: lo ya guardado no cambia.

ALTER TABLE "cotizacion_items" ALTER COLUMN "name" TYPE TEXT;
