# Manual de operación

1. Enciende el computador principal e inicia THORDY. Comprueba fecha/hora y conexión Wi-Fi. Mantén abierta la terminal del servidor.
2. Abre el panel desde el navegador e inicia sesión con tu usuario. Desde otro equipo usa la IP privada que muestra el servidor y el mismo puerto.
3. El administrador prepara **Catálogo** con productos, categorías, presentaciones y precios reales. Desactiva productos que no deban venderse o marca agotados.
4. Pulsa **Nuevo pedido**, escribe cliente, información de entrega, canal y pago. Agrega productos y cantidades; revisa descuento, domicilio, observaciones y total. Confirma una sola vez y espera el guardado. Número y hora vienen del computador principal.
5. En el tablero usa **Marcar como listo**, **Salió a domicilio** y **Pedido entregado** en ese orden. Abre **Detalles** para dirección, teléfono, auditoría y tiempos. Para cancelar indica un motivo; el registro queda conservado.
6. Si hay alerta de desconexión, comprueba Wi-Fi y servidor. No des por guardado un pedido sin respuesta exitosa. Reconecta; los datos se vuelven a consultar automáticamente. Perder internet no impide operar si la LAN funciona.
7. El administrador consulta **Historial** con fechas, cliente/número y estado. **Exportar Excel** descarga los resultados en el dispositivo actual.
8. En **Informes**, selecciona hoy, ayer, semana, mes o rango. Recuerda que ventas usa fecha de entrega y recibidos fecha de creación. Cambia agrupación diaria/semanal/mensual para revisar tendencias.
9. **Configuración** permite definir umbral de alerta, hora y conservación de respaldo; también crear/desactivar usuarios. Asigna Operador al personal operativo y Administrador solo a responsables.
10. Al cerrar operación crea un respaldo manual, comprueba el resultado `ok` y conserva otra copia en unidad externa. Espera a terminar antes de apagar. Cierra el servidor con Ctrl+C.
11. **Detalles → Vista previa / imprimir navegador** muestra el recibo. La comanda térmica está preparada con adaptador simulado; no imprime físicamente. Para impresora real se requiere integración y validación del modelo.

No compartas contraseñas. Cierra sesión en equipos compartidos. No dejes el servidor en una red pública ni sincronices la carpeta de la base con OneDrive/Dropbox mientras está en uso. Ante restauración o cambio de computador, sigue el procedimiento del README.

## Eliminar un pedido (solo administrador)

Abre Detalles o usa la papelera de Historial. Elige **Eliminar pedido**, revisa el número, escríbelo y marca la confirmación adicional. Solo entonces se habilita **Eliminar definitivamente**. Puedes conservarlo con la X, Escape o **Conservar pedido**. Se permite desde cualquier estado, incluso entregado o cancelado. Si cambió de estado, vuelve a revisar sus detalles; si se está imprimiendo, espera a que termine. La eliminación actualiza los demás dispositivos e informes y no puede deshacerse desde la aplicación.

## Mantener la aplicación actualizada

Cierra el servidor con Ctrl+C y ejecuta `scripts\update.cmd`. Espera **Actualización completada** y vuelve a iniciar con `scripts\start.cmd`. No borres datos ni configuración si aparece un error. El primer salto desde la versión 1.0 tiene instrucciones especiales en el README porque aún no incluía ese script.
