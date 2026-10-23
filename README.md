# THORDY AL BARRIL · Gestión local de pedidos

Primera versión para la operación interna en Manizales. React + TypeScript + Vite, Fastify, SQLite/WAL y Socket.IO. El servidor sirve la aplicación compilada y la API desde el mismo puerto. **No necesita internet para operar** después de instalar las dependencias. No usa fuentes, imágenes, autenticación ni bases de datos externas.

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
