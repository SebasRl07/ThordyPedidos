# THORDY AL BARRIL · Gestión local de pedidos

Versión 1.2.1 para la operación interna en Manizales. React + TypeScript + Vite, Fastify, SQLite/WAL y Socket.IO. El servidor sirve la aplicación compilada y la API desde el mismo puerto. **No necesita internet para operar** después de instalar las dependencias. No usa fuentes, imágenes, autenticación ni bases de datos externas.

## Instalación en Windows

1. Instala **Node.js 24 LTS** de su distribución oficial. Copia el proyecto en una carpeta local permanente, fuera de OneDrive/Dropbox y con permiso de escritura.
2. Ejecuta `scripts\install.cmd`: instala versiones del lockfile, compila, migra SQLite y solicita un administrador. Elige una contraseña única de al menos 12 caracteres. No existe cuenta ni contraseña predeterminada.
3. Ejecuta `scripts\start.cmd`. La terminal indica las direcciones IPv4 detectadas. Abre el panel en el computador y usa la dirección **privada de su Wi-Fi/Ethernet** desde celulares conectados a la misma red. Las direcciones de VPN o Docker no necesariamente son las del negocio.
4. Permite TCP 3000 en el firewall **solo en el perfil Privado y desde LocalSubnet**. No autorices el perfil Público. Un administrador Windows puede crear la regla explícita:

```powershell
New-NetFirewallRule -DisplayName 'THORDY LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private -RemoteAddress LocalSubnet
```

5. Reserva por DHCP en el router la IP del computador. Evita suspensión durante el servicio. No actives redirección de puertos, UPnP, túneles ni acceso público. Los clientes de Wi-Fi de invitados pueden estar aislados y no llegar al servidor.
6. Opcional: ejecuta `powershell -ExecutionPolicy RemoteSigned -File scripts\autostart.ps1`. Crea un acceso directo para iniciar el servidor **al iniciar sesión** de ese usuario; no es un servicio previo al inicio de sesión. Elimínalo de la carpeta Inicio para desactivarlo.

En Linux/macOS:

```sh
npm ci
npm run build
npm run admin
npm start
```

`npm run admin` exige una terminal interactiva y solo funciona si todavía no hay usuarios. Para desarrollo frontend: `npm run dev` en una terminal y `npx vite --host 127.0.0.1` en otra. Para uso normal basta `npm start` después de compilar.

## Configuración

Copia `.env.example` a `.env` si necesitas modificar los valores. El servidor lee el archivo mediante dotenv. Rutas relativas se resuelven desde la raíz del proyecto; todos los scripts cambian a esa carpeta.

| Variable      | Valor inicial      | Uso                                                             |
| ------------- | ------------------ | --------------------------------------------------------------- |
| HOST          | 0.0.0.0            | Interfaz; usar 127.0.0.1 para acceso solo desde el computador   |
| PORT          | 3000               | Puerto local                                                    |
| DB_PATH       | data/thordy.sqlite | Base oficial; no sincronizar su carpeta en uso                  |
| BACKUP_DIR    | data/backups       | Carpeta de respaldos; puede ser una unidad local/USB permanente |
| COOKIE_SECURE | false              | Cambiar a true únicamente al configurar HTTPS local confiable   |

Se rechazan conexiones con IP de origen pública; esto complementa el firewall, no lo sustituye. No pongas un proxy público delante del servidor: un proxy local oculta el origen real. HTTP LAN **no cifra contraseñas ni datos**; utiliza una red privada confiable con WPA2/WPA3 y acceso restringido. Para mayor protección puede administrarse HTTPS con una CA local instalada en cada dispositivo. Cookies HttpOnly/SameSite, validación de origen y de solicitudes de escritura, sesiones de 12 horas, hash scrypt con sal y límite de intentos de acceso. En HTTP no se depende de service workers ni funciones exclusivas de contexto seguro. La aplicación no ofrece operación offline cuando se pierde el servidor.

Mantén actualizado el reloj de Windows: todos los tiempos oficiales se generan en el servidor, se guardan en UTC y se muestran en America/Bogota. La falta de internet no impide la operación local; un aviso de desconexión indica que se perdió el servidor/WebSocket, no que falte internet.

## Funciones y reglas

- Catálogo configurable: categoría, presentación, precio entero COP, activo y agotado. No contiene precios ni productos comerciales inventados. El documento `PG-THORDYALBARRIL-SRL-LMOR-MIS.docx` no se recibió; debe contrastarse el catálogo con ese documento y la información del negocio.
- Pedidos con varios productos; precios oficiales desde catálogo, subtotal, descuento y domicilio. El detalle conserva nombre y precio históricos. No se edita el precio por pedido en esta versión: el administrador cambia el catálogo antes de registrar la venta.
- Consecutivo SQLite `AUTOINCREMENT`, clave idempotente por envío, transacciones y control del estado esperado. Un reintento del mismo envío devuelve el pedido guardado. No refresques la página antes de resolver un envío cuya respuesta no llegó.
- Recibido → Listo → En camino → Entregado. Cancelación desde cualquier estado activo con motivo obligatorio. Timestamps e historial con responsable. No se salta ni se revierte un estado y no cambian automáticamente por alertas de tiempo.
- Tablero con todos los pedidos activos y entregados de hoy; historial administrativo con filtros y páginas de 50 registros. Los operadores pueden ver información operativa actual, no informes, usuarios ni respaldos.
- WebSocket avisa de cambios; cada cliente vuelve a consultar la fuente oficial al conectar/reconectar. Sin confirmación del servidor no se informa éxito. El formulario se mantiene en memoria si falla el envío, pero no sobrevive a cerrar/recargar la página.
- Informes: recepción/cancelación/pendientes según **fecha de creación**. Ventas, ranking y tiempos según **fecha de entrega**, exclusivamente pedidos entregados. Son poblaciones diferentes: un pedido de ayer entregado hoy cuenta en ventas de hoy. Límites diarios Colombia, semana lunes–hoy y mes primero–hoy. Rango máximo 366 días. Evolución diaria, semanal y mensual, ranking, participación, canales, pagos, distribución de tiempos y extremos.
- Promedio diario divide pedidos creados por días naturales del rango. Promedio operativo usa días con creación o entrega. Importes por producto se presentan antes del descuento global/domicilio; ventas y ticket usan el total final con ambos conceptos. Por ello los subtotales por producto no tienen por qué sumar las ventas finales.
- Duraciones entre timestamps completos, incluso al cruzar medianoche. Se muestran minutos decimales. Preparación mide recepción→listo, no cocción física. Promedios solo de entregados con los timestamps requeridos.
- Excel real de tres hojas. Historial exporta el rango y sus filtros; Informes exporta todo el período. La hoja de productos contiene líneas de todos los pedidos seleccionados, incluso cancelados, para trazabilidad; ventas del resumen excluyen cancelados y usan fecha de entrega, lo que se declara en la hoja Resumen.

## Respaldos y restauración

En Configuración, define retención y hora de cierre (Colombia). El servidor revisa cada minuto y crea una copia después de la hora seleccionada, una por día; recupera respaldos vencidos si estuvo encendido antes. Debe seguir funcionando a la hora de cierre. Si estuvo apagado, usa respaldo manual al abrir. La API de backup SQLite incluye el WAL de forma consistente; cada archivo se verifica con `integrity_check`, se registra éxito/error y se eliminan solo respaldos propios vencidos. Cambia `BACKUP_DIR` para otra carpeta y reinicia. Mantén otra copia en USB/unidad externa: un respaldo en el mismo disco no protege de su pérdida.

Restauración:

1. Cierra el servidor con Ctrl+C y confirma que ningún proceso usa la base.
2. Conserva la carpeta `data` completa. No borres archivos WAL/SHM arbitrariamente.
3. Ejecuta `npm run restore -- "ruta/al/respaldo.sqlite" --server-stopped`.
4. La utilidad valida integridad y tablas, rechaza restaurar si hay archivos WAL/SHM, conserva la base anterior y copia el respaldo.
5. Inicia el servidor e inicia sesión con un usuario del respaldo; verifica pedidos y catálogo. Restaurar sustituye también usuarios, sesiones y configuración por los del respaldo.

Excel no reemplaza el respaldo. Prueba periódicamente la restauración en una carpeta aislada mediante otro `DB_PATH`.

## Impresión: integración preparada

`server/printing.ts` define `PrintAdapter`, formatea comandas/recibos y procesa una cola persistente con idempotencia y máximo tres intentos. **El único adaptador instalado es simulado**: nunca envía a hardware. Configuración admite ancho 58/80 mm, copias y comandas automáticas simuladas. El detalle muestra vista previa de recibo o comanda e impresión del navegador; el botón de impresión simulada registra y procesa un trabajo simulado. Los trabajos se consultan como administrador en `/api/print-jobs`; `POST /api/print-jobs/retry` procesa pendientes/reintentos. Los trabajos interrumpidos en `processing` necesitan revisión manual para evitar reimpresiones ambiguas.

Para hardware futuro, implementar `send` de un adaptador ESC/POS en el computador principal y habilitar explícitamente su configuración. Validar modelo, transporte USB/red/serial, controladores, code page española, corte, ancho y permisos. No se afirma compatibilidad universal ni impresión real validada. La configuración no permite seleccionar hardware mientras ese adaptador no exista.

## Pruebas

```sh
npm test
npm run build
# Instalar Chromium de Playwright una sola vez si no hay navegador:
npx playwright install chromium
npm run test:browser
# Linux con Chromium ya instalado:
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

Pruebas de integración usan carpetas temporales y contraseñas solo de prueba. Las del navegador usan exclusivamente `data/browser-tests`, puerto 3101 y un usuario de prueba aislado. Nunca se cargan en `data/thordy.sqlite`. Cubren importes, pedidos múltiples, timestamps, transiciones/cancelaciones, idempotencia, concurrencia, medianoche, informes día/semana/mes, ranking, Excel, sesiones/permisos, dos clientes WebSocket, respaldo/restauración/persistencia y flujo del navegador en tres tamaños, vista previa PDF y desconexión/reconexión. Chromium no prueba físicamente Safari/iOS, Android ni Windows; realiza una prueba de aceptación en los equipos reales antes de operar.

## Estructura y mantenimiento

`server/migrations` contiene migraciones SQL versionadas aplicadas en transacción al abrir la base. Haz respaldo antes de agregar una migración. `server/orders.ts` concentra reglas de negocio; `server/reports.ts` informes/Excel; `server/backup.ts` respaldo; `server/app.ts` autenticación y API; `src` interfaz. Para cambiar de equipo detén el servidor y mueve una copia íntegra verificada, no dos bases en paralelo.

La instalación y compilación requieren internet; una vez compilado todo se sirve localmente. No se incluyen telemetría, pagos externos, túneles ni despliegue público. No existe sincronización entre servidores independientes.

## Actualización 1.1: administración y nueva interfaz

La versión 1.1 incorporó una interfaz sobria y componentes accesibles. La identidad oficial de la versión 1.2 reemplaza su tipografía y acentos anteriores, manteniendo esos componentes y sus funciones. Todos los cierres de ventanas usan solo una X con nombre accesible **Cerrar** y área de 44 × 44 px; Escape y el foco del teclado se gestionan en un componente común. Cerrar sesión sigue siendo una acción distinta.

El administrador puede eliminar un pedido **en cualquier estado**, desde sus detalles o el icono de papelera de Historial. Debe escribir el número exacto y marcar una segunda confirmación. El operador no dispone de esta acción y el servidor la rechaza aunque intente llamar directamente a la API. No hay deshacer: se eliminan también líneas, historial de estados y trabajos de impresión; el catálogo y los demás pedidos se conservan. El consecutivo nunca se reduce ni se reutiliza.

La tabla independiente `order_deletions` conserva identificador, fecha UTC, administrador y estado anterior, sin datos personales del cliente. No participa en informes ni exportaciones comerciales. Su consulta administrativa está en `GET /api/deletions` (últimos 100 eventos). La clave del envío eliminado se conserva para impedir que un reintento de red lo vuelva a crear. Si el pedido cambió desde que se abrió la confirmación, cierra la ventana, revisa el estado y confirma de nuevo. Si hay una impresión en curso, espera a que termine antes de eliminar: no puede retirarse una comanda que ya está siendo enviada a hardware.

Tablero, detalles abiertos e informes se actualizan por Socket.IO. Las ventas, tickets, rankings, tiempos y Excel posteriores se calculan desde la base oficial sin incluir registros eliminados. Restaurar un respaldo anterior devuelve **todo el estado de esa fecha**, incluidos pedidos que se hubieran eliminado después.

## Actualizar desde GitHub sin perder datos

Instala Git para Windows y Node.js 24. La instalación debe provenir de `git clone` y tener su rama vinculada a GitHub; una carpeta descargada como ZIP no permite `git pull`. Conserva los datos locales en `data/` y la configuración en `.env`. No edites los archivos de código para configurar el negocio.

**En versiones que ya tienen `scripts\update.cmd`:**

1. Finaliza el servicio, crea un respaldo manual y cierra la terminal del servidor con **Ctrl+C**. Si se inicia al iniciar sesión, no vuelvas a abrirlo durante la actualización.
2. Ejecuta `scripts\update.cmd` desde el Explorador. No necesitas abrir la aplicación ni escribir comandos internos.
3. El actualizador verifica código sin cambios locales y rama con upstream, toma el mismo bloqueo exclusivo que usa el servidor y comprueba el puerto configurado. Si el servidor sigue activo, se detiene con un mensaje.
4. Antes de tocar el código, crea en un proceso hijo mediante la API SQLite integrada en Node.js 24 una copia consistente e íntegra en `data/update-backups/` (o `update-backups/` junto a un `DB_PATH` personalizado). Incluye correctamente el WAL. Estas copias de actualización no se borran por la retención diaria; consérvalas hasta validar la nueva versión.
5. Ejecuta `git pull --ff-only`, `npm ci`, compilación y, solo si todo ello funciona, `npm run init` para aplicar las migraciones versionadas. El bloqueo se mantiene incluso mientras se reinstalan las dependencias. No reinicia automáticamente el servidor.
6. Si muestra **Actualización completada**, ejecuta `scripts\start.cmd`, inicia sesión y verifica tus pedidos. Ningún paso sustituye `.env` ni la carpeta de datos por archivos de Git.

**Primer salto desde la versión 1.0, que todavía no tiene el actualizador:** con el servidor completamente detenido, copia mediante el Explorador la carpeta `data` completa y `.env`, si existe, a otra carpeta segura fuera del repositorio. Conserva juntos SQLite y cualquier WAL/SHM; no copies solo un archivo de una base en uso. Luego, en una terminal situada en el proyecto, ejecuta `git pull --ff-only` para obtener los scripts nuevos y ejecuta `scripts\update.cmd`. Este primer pull solo cambia código; no inicies el servidor entre ambos pasos. Si tienes cambios locales, el pull puede detenerse y deberás resolverlos sin borrar los datos.

En Linux/macOS, desde la raíz del proyecto, el equivalente es `npm run update`. Instalar dependencias y descargar cambios requiere internet; la operación posterior del negocio continúa siendo local.

### Si se interrumpe una actualización

- No borres `data`, `.env`, los respaldos ni los archivos WAL/SHM. No ejecutes `git reset --hard` para resolver un mensaje.
- El actualizador muestra el respaldo verificado y el SHA anterior. Si falla instalación o compilación, las migraciones no se ejecutan. Corrige la causa (por ejemplo, conexión para descargar paquetes) y vuelve a ejecutar el actualizador con el servidor detenido.
- Si falla una migración, no inicies una versión antigua sobre un esquema nuevo. Cada migración es transaccional; pueden haber terminado migraciones anteriores del mismo lote. Conserva el respaldo y solicita revisión. Para volver atrás, un responsable debe restaurar la copia mediante el procedimiento de este README y usar código compatible con ese esquema.
- Si hubo un apagado brusco puede quedar `<DB_PATH>.server-lock`. Consulta `owner.json` para identificar el proceso y comprueba en el Administrador de tareas que no queda ningún proceso del servidor **ni del actualizador**. Solo después puede retirarse esa carpeta de bloqueo. No se retira automáticamente basándose en que el puerto no responda.

Las pruebas del actualizador ejecutan un pull fast-forward real contra un remoto Git local, instalación npm y migración sobre una base v1 con datos. También fuerzan un fallo de compilación y verifican que los datos, `.env` y el respaldo permanezcan. La regresión específica del actualizador se ejecuta también en el workflow `Actualizador Windows`, con runners Windows y Linux. Su resultado para cada commit está en la pestaña Actions de GitHub. El firewall del equipo del negocio no forma parte de esas pruebas.

Consulta [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) para las decisiones de concurrencia, persistencia y crecimiento.

## Identidad visual oficial (versión 1.2)

La aplicación utiliza los logotipos vectoriales originales extraídos del manual de marca proporcionado por THORDY AL BARRIL, sin recrearlos ni alterar sus contornos. Los SVG y sus variantes autorizadas están en `public/brand/`, con espacio de seguridad incluido. El logotipo completo identifica el acceso y la navegación de escritorio; el isotipo se usa en móvil, encabezados compactos, favicon e iconos. La vista de impresión y el resumen Excel incluyen el logotipo oficial.

La paleta se centraliza en `src/theme.css`: **vinotinto #6A0B07, beige #FDF2E3 y naranja #F69501**. Los estados operativos conservan sus colores semánticos y sus nombres. Montserrat se sirve localmente para la operación; Luckiest Guy se reserva para el mensaje institucional del acceso. Las licencias de ambas fuentes se incluyen en `public/licenses/`. No hay solicitudes a Google Fonts, CDN ni servicios externos durante el uso.

La pantalla de acceso combina un área institucional vinotinto y un formulario claro. En celulares se reduce el área de marca para priorizar el registro de pedidos. Se mantienen las confirmaciones de eliminación, cierres con X accesible, sincronización, reportes, respaldos y actualización segura. Este cambio no requiere una migración adicional de la base de datos.

Consulta [docs/brand/IDENTIDAD.md](docs/brand/IDENTIDAD.md) para procedencia, variantes, área de seguridad, uso de tipografías y limitaciones de los iconos en HTTP local. Para actualizar desde 1.1, detén el servidor y ejecuta `scripts\update.cmd`; para el primer salto desde 1.0 sigue las instrucciones especiales anteriores.

## Corrección del actualizador en Windows (1.2.1)

El error `EPERM ... unlink ... better_sqlite3.node` podía producirlo el propio actualizador, incluso sin un servidor escuchando. El coordinador importaba `maintenance.ts`, que abría la base con `better-sqlite3` para respaldarla. Las conexiones se cerraban correctamente, pero cerrar SQLite **no descarga la biblioteca nativa del proceso**. Windows podía impedir que `npm ci` reemplazara ese archivo mientras el coordinador seguía ejecutándose.

Ahora el flujo es:

1. `update.mjs` y `maintenance.mjs` usan únicamente módulos de Node.js y archivos locales. `.env` se lee con `process.loadEnvFile`, sin depender de `dotenv`, `tsx` ni otros paquetes que podrían faltar tras una instalación interrumpida.
2. Un proceso hijo ejecuta `backup-before-update.mjs`, usando `node:sqlite`, integrado en Node.js 24. Abre la base en modo de solo lectura, crea una copia consistente con WAL, verifica `integrity_check` y `foreign_key_check` y cierra ambas conexiones.
3. El coordinador espera a que **termine completamente el proceso hijo**, manteniendo el bloqueo de actualización. Solo entonces ejecuta el pull y `npm ci`. También comprueba que no tenga cargado `better_sqlite3.node` antes de reinstalar.
4. Después de una instalación y compilación correctas, aplica las migraciones. No modifica configuraciones, usuarios, pedidos, respaldos anteriores ni el diseño de la aplicación.

### Recuperar un equipo donde falló `npm ci`

Conserva los respaldos verificados que ya se crearon. No necesitas borrar `node_modules` manualmente ni tocar archivos SQLite.

1. Cierra el servidor y las ventanas de actualizaciones anteriores; espera a que hayan terminado los procesos asociados. Comprueba que dispones de **Node.js 24** y Git.
2. Desde una terminal en la carpeta del proyecto, obtén el código corregido con Git, que no depende de los paquetes npm:

```bat
git pull --ff-only
scripts\update.cmd
```

3. Es necesario ejecutar el `.cmd` corregido en **un proceso nuevo**. Un actualizador antiguo que ya estaba ejecutándose no reemplaza el código que tiene en memoria al hacer pull. Si la primera ejecución del actualizador antiguo obtuvo los archivos nuevos pero falló después, ciérralo y vuelve a ejecutar el `.cmd` actualizado.
4. Aunque la instalación anterior haya dejado `node_modules` incompleto, el coordinador nuevo puede leer `.env`, bloquear y respaldar SQLite antes de recuperar las dependencias con `npm ci`. Inicia con `scripts\start.cmd` únicamente después de ver **Actualización completada**.
5. Si existe un bloqueo persistente después de un corte, sigue el procedimiento anterior de `owner.json`: verifica que no quedan procesos del servidor, coordinador ni respaldo antes de retirar únicamente esa carpeta de bloqueo. No borres archivos `.sqlite`, WAL/SHM, `.env` ni copias de seguridad.

Si fallan la copia o sus comprobaciones, el proceso se detiene antes del pull y la reinstalación. Si falla `npm ci` o el build, no se migrará la base: conserva la copia y reintenta desde un proceso nuevo tras resolver el error. No desactives protecciones de Windows ni la verificación de paquetes para completar la actualización.

### Prueba de regresión del actualizador

`npm run test:update` crea repositorios y bases temporales, conserva una biblioteca nativa real en el `node_modules` de prueba y ejecuta una reinstalación real. En Windows invoca **`scripts\update.cmd --no-pause`**: este argumento omite solamente las pausas de consola, sin saltarse ninguna protección. Se comprueban además rutas con espacios, acentos y `&`, `.env` con CRLF, datos y respaldos intactos, y recuperación sin `dotenv` ni un `better-sqlite3` utilizable. Una prueba exclusiva de Windows reproduce el bloqueo tras cerrar una conexión y comprueba que salir del proceso libera el archivo. En Linux esa comprobación de bloqueo se marca como omitida, no como aprobada.

El workflow [Actualizador Windows](https://github.com/SebasRl07/ThordyPedidos/actions/workflows/update-windows.yml) instala desde el lockfile, ejecuta esta regresión, las pruebas existentes y la compilación en ambos sistemas. No se utilizan los datos del negocio en CI.

Validación confirmada de esta corrección: [ejecución Windows/Linux aprobada](https://github.com/SebasRl07/ThordyPedidos/actions/runs/40351324100), commit `2b915e1`. El runner Windows completó las 4 regresiones del actualizador, las 27 pruebas generales y la compilación. Es una prueba en Windows real de GitHub Actions; no reemplaza la revisión del computador del negocio.
