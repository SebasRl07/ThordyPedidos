# Validación de THORDY 1.2

Verificación ejecutada en Linux con Node.js 24, SQLite nativo y Chromium local. La aplicación se evolucionó sobre el commit inicial, sin sustituir el esquema original ni cargar datos de prueba en la base operativa.

## Resultado

- `npm run build`: aprobado, incluye TypeScript en modo `strict` y compilación Vite de producción. Fuentes Montserrat y Luckiest Guy incluidas localmente en `dist`.
- `npm test`: **27 pruebas aprobadas**, ninguna fallida, omitida o deshabilitada.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`: **3 escenarios aprobados**, ninguno omitido.
- `npm audit --omit=dev`: cero vulnerabilidades conocidas en dependencias de producción en la consulta de esta entrega.
- `git diff --check`: sin errores de espacios.

## Comprobaciones

1. Se conservaron las nueve pruebas originales: pedidos múltiples, cálculo COP, timestamps, estados, cancelaciones, medianoche, concurrencia, informes, ranking, Excel, autenticación, permisos, dos clientes WebSocket, impresión simulada y respaldo/restauración por CLI.
2. Eliminación en los cinco estados, incluyendo entregado y cancelado. Se verifican relaciones eliminadas, catálogo y otro pedido conservados, integridad referencial, auditoría UTC con administrador, consecutivos e imposibilidad de resucitar el mismo envío idempotente.
3. Autorización y origen de la petición, confirmaciones incompletas, revisión obsoleta, dos eliminaciones simultáneas, rollback completo ante error provocado y bloqueo cuando hay una impresión en curso.
4. Cola asíncrona: se retiene el primer envío con un adaptador controlado, se elimina otro trabajo pendiente y se verifica que el segundo pedido no se envía al continuar.
5. Eliminar un entregado cambia ventas, ticket, conteos, ranking, tiempos, gráfico diario y hojas de Excel en rangos diario, semanal y mensual.
6. Actualizador: exclusión servidor/actualización y detección de un servidor anterior por puerto. Una base v1 con pedidos, usuario, catálogo y configuración conserva sus datos al aplicar la migración 002, incluso al abrirla nuevamente. La copia previa incluye datos WAL y conserva el esquema anterior.
7. Prueba del orquestador con un repositorio Git de fixture y remoto local: pull fast-forward real, `npm ci`, build controlado y migración real de la aplicación. Se fuerza también un fallo de build y se comprueba que no se migra, `.env` permanece, los datos siguen presentes y existe un respaldo íntegro anterior. La compilación completa de producción se comprueba por separado con `npm run build`.
8. Base sintética de **3000 pedidos**, con 300 entregados: página de 50 registros, detalles por lotes, cantidades y ventas exactas e índice usado por SQLite. La duración es informativa, no una garantía de rendimiento en otros equipos.
9. Navegador: flujo de catálogo→pedido→entrega→Excel, recibo PDF, desconexión/reconexión y diseño a 390, 820 y 1440 px.
10. Navegador multicliente: administrador, operador con detalle abierto y administrador viendo informes. El entregado se elimina con número escrito y casilla adicional; los otros clientes actualizan sin recargar. El operador no ve la acción. El cierre solo con X tiene área ≥44 px, se validan 360, 390, 820 y 1440 px, no hay desbordamiento horizontal y se libera el scroll tras cerrar diálogos anidados. La prueba bloquea todos los destinos HTTP externos y confirma que Montserrat se sirve localmente.

Los fixtures se guardan en carpetas temporales o `data/browser-tests`, nunca en `data/thordy.sqlite`. Las contraseñas presentes en los tests son exclusivas de esas bases aisladas.

## Límites pendientes

La aceptación física del equipo Windows del negocio, firewall/router, Safari/iOS y hardware Android permanece pendiente. La identidad visual se verificó en Chromium/Linux. El actualizador dispone además de las pruebas Windows reales descritas en la corrección 1.2.1 más abajo. La impresora térmica continúa explícitamente simulada. Una impresión física que ya comenzó no puede retirarse; la eliminación devuelve conflicto hasta terminar. Un corte brusco puede requerir revisar un bloqueo persistente o un trabajo de impresión ambiguo.

La operación sigue siendo local y sin servicios externos, pero descargar cambios/dependencias exige internet. El calendario de respaldos y las unidades USB deben comprobarse en el computador del negocio. No se añadieron inventario, costos, nuevos roles, PostgreSQL ni infraestructura pública.

## Identidad oficial

Se comprobaron los trazados de los cuatro SVG contra los hashes de los recursos extraídos, los iconos PNG, la inclusión del logotipo en Excel y la conservación de sus ventas y líneas. El escenario de identidad recorre acceso y las cinco pantallas principales a 360, 820 y 1440 px, verifica proporciones de las imágenes, favicon, icono Apple, nombre de fuentes locales, cierre de diálogo y contraste del botón de acceso (≥4.5:1). Bloquea todos los destinos HTTP externos durante la navegación; no afirma una certificación WCAG completa ni pruebas físicas en Safari/iOS. También se revisaron visualmente las capturas de escritorio y celular y los originales extraídos del manual.

## Corrección del actualizador 1.2.1

El respaldo anterior cerraba las conexiones, pero el addon `better_sqlite3.node` permanecía cargado en el coordinador hasta terminar el proceso. El coordinador ahora usa únicamente módulos Node y archivos locales, lee `.env` sin `dotenv` y espera el final de un proceso hijo con SQLite integrado en Node.js 24 antes de `npm ci`. No se cambian reglas comerciales, diseño ni migraciones.

Pruebas incorporadas con `npm run test:update`:

- Ejecución real del actualizador con un addon nativo anterior en `node_modules`: npm lo reemplaza tras un respaldo verificado.
- Recuperación con dependencias incompletas: faltan `dotenv` y los archivos JS de `better-sqlite3`, pero el coordinador consigue respaldar antes de reinstalar.
- En Windows se ejecuta el `.cmd` real, en una ruta con espacios, acentos y `&`; se comprueban `.env` con CRLF, usuarios, pedidos, configuración, versión SQLite y copia íntegra después del pull y de npm.
- Prueba exclusiva Windows: cargar el addon y cerrar `Database` todavía impide eliminar el archivo nativo; terminar el proceso lo libera. En Linux esta prueba se marca como omitida.
- El módulo del coordinador se puede importar sin cargar el addon.

La suite general se hizo portable a Windows corrigiendo la URL del loader de las pruebas y normalizando únicamente CRLF→LF al comprobar los hashes de los SVG. No se alteran los gráficos ni se relajan las comprobaciones de contornos o contenido.

Resultado confirmado: [ejecución 40351324100](https://github.com/SebasRl07/ThordyPedidos/actions/runs/40351324100), commit `2b915e1`, **Success** en ambos jobs. En `windows-latest`/Node.js 24 pasan las **4 pruebas de regresión del actualizador**, las **27 pruebas generales** y la compilación de producción. En Ubuntu pasan las 27 generales, la compilación y 3 regresiones; la comprobación exclusiva del bloqueo DLL se omite allí. Los resultados siguientes quedan disponibles en el workflow [Actualizador Windows](https://github.com/SebasRl07/ThordyPedidos/actions/workflows/update-windows.yml). Los datos de estas pruebas son fixtures aislados; no se accede a bases del negocio.
