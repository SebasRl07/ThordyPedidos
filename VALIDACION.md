# Entrega y validación de la primera versión

Entorno verificado: Linux, Node.js 24, SQLite nativo y Chromium instalado en el sistema. Se ejecutaron instalación desde lockfile, migraciones, compilación TypeScript/Vite, pruebas del dominio/API y prueba real de navegador. La base operativa se inicializa vacía, sin cuentas predeterminadas ni ventas de ejemplo.

| Fase | Entrega | Evidencia |
| --- | --- | --- |
| Arquitectura | React/Fastify/SQLite, migración versionada, WAL y claves foráneas | Inicialización y compilación |
| Pedidos | Catálogo, múltiples líneas, COP entero, consecutivos, snapshots e idempotencia | Integración y navegador |
| Estados | Secuencia, cancelación, timestamps, historial y concurrencia | Integración, medianoche y solicitudes simultáneas |
| Multidispositivo | Socket.IO, reconexión, interfaz responsive | Dos clientes autenticados y Chromium a 390, 820 y 1440 px |
| Historial | Búsqueda, fechas, estado, páginas y detalles | API e interfaz implementadas; prueba de navegación del flujo principal |
| Informes | Fechas Colombia, día/semana/mes, ranking, canales, pagos y tiempos | Integración con creación y entrega en días distintos |
| Excel | Tres hojas, filtros, fechas y COP | Serialización ExcelJS y descarga real del navegador |
| Seguridad y respaldo | Sesiones, roles backend, origen, hash, restricción LAN y respaldo íntegro | Pruebas de permisos, backup, reapertura y restauración por CLI |
| Impresión | Interfaz de adaptador, cola, deduplicación, intentos limitados, recibo/comanda | Adaptador simulado y PDF del navegador |
| Entrega | Scripts Windows, arranque al iniciar sesión, configuración y manual | Archivos preparados; Windows no ejecutado en esta máquina |

Resultado automatizado: **9 pruebas de integración y 1 escenario de navegador aprobados**. Un escenario agrupa varias comprobaciones; no se presenta como si fueran 24 pruebas separadas. `npm audit` reportó cero vulnerabilidades conocidas, incluidas las dependencias de desarrollo, al consultar el registro durante esta entrega.

El escenario del navegador cubre acceso, catálogo, formulario, total, estados, tres tamaños sin desbordamiento horizontal, vista previa en PDF, Excel, pérdida y recuperación de conexión. Las pruebas emplean exclusivamente bases temporales o `data/browser-tests`; sus productos/clientes son de prueba y no se incorporan a la base del negocio.

Pendientes de aceptación en el negocio: documento de grado no suministrado, catálogo/precios reales, elección del administrador, instalación nativa Windows, reglas de firewall/router, prueba física Android/iOS/Safari y procedimiento de respaldo en USB. La programación diaria debe comprobarse a la hora elegida con el computador encendido. La impresora ESC/POS requiere implementar y verificar un adaptador real; el actual es explícitamente simulado. No se ha publicado ni desplegado públicamente la aplicación, ni enviado el código a GitHub.
