# Validación de THORDY 1.1

Verificación ejecutada en Linux con Node.js 24, SQLite nativo y Chromium local. La aplicación se evolucionó sobre el commit inicial, sin sustituir el esquema original ni cargar datos de prueba en la base operativa.

## Resultado

- `npm run build`: aprobado, incluye TypeScript en modo `strict` y compilación Vite de producción. Fuentes Inter incluidas localmente en `dist`.
- `npm test`: **25 pruebas aprobadas**, ninguna fallida, omitida o deshabilitada.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`: **2 escenarios aprobados**, ninguno omitido.
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
10. Navegador multicliente: administrador, operador con detalle abierto y administrador viendo informes. El entregado se elimina con número escrito y casilla adicional; los otros clientes actualizan sin recargar. El operador no ve la acción. El cierre solo con X tiene área ≥44 px, se validan 360, 390, 820 y 1440 px, no hay desbordamiento horizontal y se libera el scroll tras cerrar diálogos anidados. La prueba bloquea todos los destinos HTTP externos y confirma que Inter se sirve localmente.

Los fixtures se guardan en carpetas temporales o `data/browser-tests`, nunca en `data/thordy.sqlite`. Las contraseñas presentes en los tests son exclusivas de esas bases aisladas.

## Límites pendientes

La envoltura `update.cmd`, Windows nativo, firewall/router, Safari/iOS y hardware Android deben aceptarse en los dispositivos reales. El orquestador y sus fallos se probaron en Linux; no se presenta como una ejecución de cmd.exe. La impresora térmica continúa explícitamente simulada. Una impresión física que ya comenzó no puede retirarse; la eliminación devuelve conflicto hasta terminar. Un corte brusco puede requerir revisar un bloqueo persistente o un trabajo de impresión ambiguo.

La operación sigue siendo local y sin servicios externos, pero descargar cambios/dependencias exige internet. El calendario de respaldos y las unidades USB deben comprobarse en el computador del negocio. No se añadieron inventario, costos, nuevos roles, PostgreSQL ni infraestructura pública.
