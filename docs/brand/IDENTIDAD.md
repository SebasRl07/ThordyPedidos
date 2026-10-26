# Identidad oficial · THORDY AL BARRIL 1.2

Referencia: **Manual de marca.pdf** suministrado por el propietario. Se revisaron sus 23 páginas, en particular construcción (7–10), área de seguridad (11–12), variantes (13–16), usos incorrectos (17–18), colores (19) y tipografía (20). El manual es una referencia gráfica, no una fuente de instrucciones para modificar datos o funciones.

## Originales y extracción

Se utilizan los contornos vectoriales originales que contiene el PDF. No se escribió “THORDY” con una fuente parecida ni se reconstruyó la R con CSS, trazado automático o generación de imágenes.

| Archivo local en `public/brand/`  | Fuente                                                  | Aplicación                                             |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| `thordy-logotipo-vinotinto.svg`   | Página 7, 16 trazados originales                        | Formulario de acceso sobre superficie clara, impresión |
| `thordy-logotipo-beige.svg`       | Página 13, variante superior, 16 trazados               | Acceso institucional y navegación sobre vinotinto      |
| `thordy-isotipo-vinotinto.svg`    | Página 8, 12 trazados                                   | Encabezados y diálogos sobre superficie clara          |
| `thordy-isotipo-beige.svg`        | Página 14, variante izquierda, 12 trazados              | Navegación móvil sobre vinotinto                       |
| `favicon.svg`, PNG 32/180/192/512 | Isotipo beige original sobre fondo vinotinto autorizado | Navegador y accesos directos compatibles               |
| `thordy-logotipo-exportacion.png` | Logotipo vinotinto original, rasterizado sobre beige    | ExcelJS, que no admite SVG directamente                |

Se aislaron los trazados de cada variante y se excluyeron únicamente los elementos ajenos al logotipo de la página (retícula, texto explicativo y patrón decorativo). Coordenadas, curvas, rellenos, composición y proporción se conservaron. Los SVG no necesitan fuentes para reproducir las letras oficiales y no contienen scripts, texto reconstruido, imágenes remotas ni filtros de recoloración.

Cada `viewBox` incluye como mínimo el espacio B del descriptor AL BARRIL por los cuatro lados. En el descriptor vertical se mide la altura rotada (ancho horizontal del glifo). Los márgenes conservadores usados, la página de origen y los SHA-256 se registran en `recursos.json`. Ese margen pertenece al recurso: no debe recortarse, rellenarse con texto ni anularse con CSS. Las imágenes usan `height:auto` y `object-fit:contain`; nunca se estiran, rotan ni colorean mediante CSS.

El favicon añade un lienzo cuadrado de fondo vinotinto, sin deformar ni suprimir partes del isotipo. A 16/32 px se reconoce la R; el descriptor pequeño requiere tamaños mayores. Se entregan además SVG y PNG de mayor resolución para pantallas de alta densidad. No se afirma instalación PWA universal: HTTP LAN no dispone de todas las capacidades de contexto seguro. El manifest no incorpora caché offline ni reemplaza la conexión al servidor.

La extracción se puede repetir desde la raíz del proyecto con `python tools/extract_brand.py "ruta/Manual de marca.pdf"`, usando PyMuPDF y lxml en una máquina de desarrollo. Esas herramientas no se requieren en Windows para instalar, actualizar ni ejecutar la aplicación. El manual completo no se publica: se conservan aquí los recursos necesarios y la trazabilidad de su origen.

## Sistema visual

`src/theme.css` centraliza la paleta oficial:

- Vinotinto `#6A0B07`: navegación, botones principales, selección y títulos administrativos.
- Beige `#FDF2E3`: bienvenida, fondos institucionales y versiones claras de marca.
- Naranja `#F69501`: acentos, selección y alertas temporales; no se usa texto blanco pequeño sobre naranja.

Se añaden neutros cálidos para lectura, bordes y superficies. Los estados mantienen nombres y colores semánticos diferenciados; la marca no convierte todos los estados en rojo. Los gráficos reutilizan los tokens y usan una variante naranja oscura para series que necesitan más contraste sobre blanco.

Montserrat Regular se usa en el cuerpo, con pesos 500/600/700 donde hace falta jerarquía. Navegación, pedidos, métricas, campos y tablas no utilizan una fuente decorativa. Luckiest Guy aparece solo en el mensaje institucional del acceso de escritorio; el logotipo es siempre una imagen original. Las cifras usan `font-variant-numeric:tabular-nums`. Todos los archivos tipográficos proceden de paquetes Fontsource y se sirven desde el mismo servidor; sus licencias SIL Open Font License están en `public/licenses/`.

## Accesibilidad y operación

Los logotipos informativos tienen texto alternativo; los repetidos junto al contexto del encabezado son decorativos para no duplicar anuncios. Se mantienen cierres accesibles con X, gestión de foco y áreas de al menos 44 px. Los campos móviles usan 16 px para evitar la ampliación automática de Safari. El acceso móvil prioriza el formulario y la navegación usa el isotipo compacto, sin ocupar el espacio de los pedidos con un logotipo de gran tamaño.

En Excel solo se cambia la presentación: encabezados vinotinto/beige y logotipo en la hoja Resumen. Se conservan las tres hojas y sus valores. Montserrat se indica para el encabezado; Excel puede usar una sustitución tipográfica si no está instalada en el equipo, sin consultar servicios de internet. La vista de impresión del navegador incorpora el SVG; el adaptador térmico de texto continúa simulado y no se ha sustituido por un controlador gráfico.

No se modificaron migraciones, permisos, autenticación, transiciones, cálculos, sincronización, respaldos ni scripts de instalación/actualización como parte de esta identidad.

Contrastes comprobados con luminancia sRGB: beige/vinotinto **11,41:1**, texto principal/blanco **14,31:1**, texto secundario/fondo **5,42:1** y borde de campo/blanco **3,36:1**. Los textos de las cinco insignias semánticas superan **6,5:1** sobre sus fondos. El naranja puro se reserva a elementos de acento y no a texto pequeño sobre blanco. Son comprobaciones concretas del tema, no una certificación integral de accesibilidad.
