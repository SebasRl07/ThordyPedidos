# Decisiones de evolución · THORDY 1.1

Se conserva la arquitectura local y el esquema original. No se incorpora infraestructura externa, inventario, costos ni nuevos módulos comerciales.

## Responsabilidades

- `shared/domain.ts`: tipos de pedido, estados, actor y eventos compartidos; TypeScript mantiene `strict`.
- `server/orders.ts`: validación y transacciones de creación, transición y eliminación; el cliente nunca decide precios oficiales, horas ni permisos.
- `server/orderQueries.ts`: validación de filtros y paginación, alcance operativo de cada rol y lectura consistente del historial.
- `server/db.ts`: migraciones y carga por lotes de pedidos, líneas e historial. Tres lecturas para los detalles de N pedidos; se usa `json_each` para no exceder el límite de parámetros SQLite. Los índices por pedido y por fecha de entrega están en la migración aditiva 002.
- `server/reports.ts`: un snapshot de lectura de SQLite para los indicadores. Los informes no cargan detalles completos para cada pedido; las líneas vendidas se leen en lote. Excel pide explícitamente los detalles del período.
- `server/printing.ts`: cola y adaptador independientes. Cada trabajo se reclama dentro de una transacción antes de llamar al adaptador; después de cada espera asíncrona se revalida el siguiente trabajo.
- `server/errors.ts`: errores de dominio con estado HTTP; las excepciones internas se registran en el servidor sin enviar detalles SQLite al navegador.
- `src/components`: diálogo con gestión de foco, cierre accesible, iconografía y confirmación de eliminación reutilizables. `src/api.ts` concentra transporte y errores HTTP.
- `src/hooks/useRealtime.ts`: un socket por usuario, independiente de la pantalla y los filtros; agrupa ráfagas de cambios por recurso. Los borrados se atienden inmediatamente y se vuelve a consultar la información oficial.
- `scripts/maintenance.mjs`: bloqueo compartido y coordinación del respaldo sin dependencias npm. `maintenance.ts` conserva la entrada compatible para TypeScript; los tipos están en `maintenance.d.mts`. `backup-before-update.mjs` ejecuta la copia en un hijo con SQLite integrado en Node 24. El coordinador usa Node directamente y `process.loadEnvFile`, por lo que puede reparar una instalación incompleta sin cargar `dotenv`, `tsx` ni addons de `node_modules`.

## Garantías de eliminación

`DELETE /api/orders/:id` exige sesión administrativa, protección de origen/solicitud, número escrito, aceptación explícita y revisión del historial observada por el cliente. La transacción `BEGIN IMMEDIATE` revalida existencia, revisión y trabajos en curso, registra auditoría y elimina relaciones antes de eliminar el pedido. Un error revierte el conjunto completo.

La auditoría no tiene FK al pedido eliminado y no conserva su cliente, dirección, teléfono o productos. Sí conserva actor, estado, instante e identificador. El `AUTOINCREMENT` original y `sqlite_sequence` permanecen intactos. La clave idempotente se conserva en la auditoría para impedir resucitar un pedido por un envío repetido.

El procesador marca `processing` antes de invocar al adaptador. Una eliminación encuentra ese estado y devuelve 409; no puede garantizarse retirar un trabajo ya enviado físicamente. Los pendientes/reintentos se borran en la transacción y el procesador vuelve a consultar sus registros antes de enviarlos. Si dos clientes eliminan el mismo pedido, solo una transacción lo consigue. Si una transición llega primero, la revisión obsoleta impide eliminar inadvertidamente una versión distinta.

El evento de Socket.IO solo se emite después del commit. No se publican datos personales por el socket: se notifica recurso/identificador y las lecturas REST autenticadas traen la información. Una reconexión vuelve a consultar la vista y el detalle abierto, incluso si se perdieron eventos. No se mantiene un segundo almacén de ventas acumuladas que pueda quedar desactualizado tras un borrado.

## Límites de crecimiento

El historial conserva páginas de 50. El tablero agrupa una vez por estado y renderiza inicialmente 20 tarjetas por columna; Mostrar más da acceso a las restantes sin alterar sus contadores. Las búsquedas esperan 250 ms entre cambios. Las respuestas de vistas antiguas se descartan mediante una secuencia de consultas. Un evento de catálogo no vuelve a descargar informes; las pantallas ajenas a pedidos no los recargan con cada operación.

La consulta operativa todavía trae todos los pedidos activos y entregados de hoy; para volúmenes mucho mayores se puede añadir paginación por columna en la API, sin cambiar reglas de negocio. Los informes procesan el período seleccionado en memoria y exportan mediante ExcelJS; no se afirma capacidad ilimitada ni escalabilidad distribuida. Se probó un conjunto sintético de 3000 pedidos y 300 entregas en una base aislada, incluidas lectura de página, ranking e índice usado. Esa medición no sustituye una prueba de carga en los equipos del negocio.

SQLite sigue siendo adecuado para un servidor local con escrituras cortas transaccionales y WAL. Una futura migración de almacenamiento puede conservar contratos REST, tipos de dominio y servicios. Cualquier adaptador real de impresión debe respetar el protocolo de reclamación de la cola. No se implementan todavía inventario, rentabilidad, roles adicionales ni servidores múltiples.

## Actualización y recuperación

Servidor y actualizador compiten por el mismo directorio de bloqueo por DB_PATH; no se basa solo en un PID que pueda reutilizarse. El bloqueo persiste durante todo el pull, reinstalación, build y migración. Un corte requiere revisión manual antes de retirarlo. Se comprueba además el puerto para detectar la versión previa, que todavía no tenía bloqueo.

El respaldo SQLite se obtiene antes del pull, verifica integridad y referencias, y se convierte en un archivo independiente con journal DELETE. El origen continúa en WAL. Las migraciones se aplican después del build, dentro de transacciones y sin recrear datos ni reescribir la migración 001. La 002 solo añade auditoría e índices. Configuración y bases están ignoradas por Git; el actualizador rechaza repositorios que las estén rastreando. No hay restauración automática que pueda reemplazar ventas recientes tras un fallo ambiguo.

## Aislamiento del respaldo y bloqueo nativo en Windows

No basta con cerrar conexiones para poder sustituir un addon nativo de Node. En la versión anterior, `backupBeforeUpdate` cargaba `better_sqlite3.node` dentro del proceso que más tarde lanzaba `npm ci`; la DLL seguía cargada hasta terminar ese proceso, aunque la base y la copia estuvieran cerradas.

El coordinador y su módulo de bloqueo importan solo `node:*`. `backupBeforeUpdate` crea un proceso mediante `spawnSync(process.execPath, ...)` y valida su salida JSON. Ese hijo es el único que importa `node:sqlite`, no necesita paquetes instalados y usa modo de solo lectura para la fuente. El coordinador espera su salida completa, comprueba el resultado y solo entonces permite reinstalar. El bloqueo del archivo de datos sigue perteneciendo al coordinador durante todo el respaldo, pull, instalación, build y migración. Los fallos de verificación abortan el flujo antes de reinstalar.

`npm run test:update` ejecuta el escenario completo con un remoto Git local, un addon nativo real y dependencias interrumpidas. El workflow Windows usa el `.cmd` real; la prueba exclusiva de DLL comprueba el comportamiento de Windows, no una simulación desde Linux. No se añaden dependencias, migraciones ni cambios al negocio para este arreglo.
