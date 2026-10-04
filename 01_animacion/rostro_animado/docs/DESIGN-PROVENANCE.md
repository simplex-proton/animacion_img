# Registro de proceso de diseño · Design Provenance

> Este archivo es la cadena de evidencia de originalidad de todos los recursos visuales de Mood Mates: registra la motivación de diseño, método de generación, parámetros e histórico de iteración de cada personaje. Todos los contornos se generan en tiempo real mediante funciones parametrizadas de `src/core/geometry.js`; no existe ningún dato de coordenadas dibujado a mano ni conseguido de terceros en el repositorio.

## 1. Metodología de diseño

**Fecha**: 2026-08-20 (v1.0 inicial; el mismo día v1.1 refina: boceto de concepto finalizado, ojo de capas, accesorios enlazados, efectos de firma, reemplazo de roles comerciales/educativos; el mismo día v1.2: refactorización en forma de 4 siluetas, Peachy reemplazado a Hearty, normas físicas de ojo pequeño/pupila); 

**Método central**: toda forma visual = primitiva geométrica parametrizada + parámetros de diseño.

1. **Silueta corporal**: generada con función radial r(θ) (muestreo de 96 puntos) o curva paramétrica de superelipse. Los primitivos incluyen: protuberancia campanilla (bump), onda de concha (scallop), peso de estrellas coseno, superelipse, etc., todos combinados con funciones matemáticas elementales.
2. **Forma de ojo**: topología única de lens (doble envolvente) —— línea central mid(u) + envolvente de grosor halfThick(u), 24 puntos en cada borde superior e inferior. Los 20 huecos semánticos (calmado/ojos de risa/abiertos/cerrados/entrecerrados/enfadados/escaneando/escuchando/tímidos/tristes y variantes) son una implementación parametrizada de "cómo los ojos expresan emociones", cada personaje los instancia con su propia parametrización base (ancho/alto/rotura/ancho/rotación/curvatura).
3. **Forma de boca**: anillo pequeño lens de 24 puntos, 9 huecos semánticos (smile/grin/o/flat/frown/wavy/pout/open/dot).
4. **Efectos**: tres clases de sistemas de partículas (orbital/estallido/emisor), dos skins (burbuja de nube / polvo estelar), formas de partículas generadas programádicamente (círculo, mini nube con mismo clip, estrella de 4 puntas, estrella de 5 puntas, lápiz); cada personaje tiene un "script de acción de firma" de emisión (burbuja de nube / explosión de estrellas).
5. **Ojos de capas (v1.1)**: ojo de pupila = anillo lens del párpados como clipPath + esclerófita/iris (círculo de degradado radial)/pupila/punto de luz de fuente fija. El cierre se juzga por el "grosor real del contorno" (área del lazo ÷ ancho), por debajo del umbral cambia a línea de pestaña oscura. Todo es construcción geométrica, sin recursos de imagen.
6. **Herramienta**: `tools/ring-editor.html`, editor parametrizado adjunto a este repositorio. La iteración de diseño es el proceso de ajuste de parámetros, los parámetros finales se escriben directamente en el archivo de datos del personaje y pueden reproducirse en cualquier momento.
7. **Boceto de concepto (v1.1)**: antes del detalle, se genera un borrador 3D de alta calidad mediante texto-para-imagen como referencia de estilo; luego se aproxima mediante geometría parametrizada la silueta y la paleta de colores. El boceto de concepto solo sirve como referencia de estilo interna, todos los recursos finales son generados por parámetros.

**Declaración de independencia**: tanto el código de este proyecto (máquina de estados, interpolación de resortes, proyección esférica, centro de registro de configuración) como los recursos visuales (todos los parámetros geométricos, paletas de colores, trayectorias de accesorios) son creaciones originales; no se ha referenciado, copiado ni rastreado ninguna obra artística de terceros. "Imagen cartón animado que expresa emociones" es un concepto creativo no protegido por derechos de autor; las expresiones específicas de este proyecto (parámetros de silueta, sistema de ojos, paletas, accesorios, lenguaje de efectos) son todas originales.

## 2. Archivo de personaje

### Nimbo Bubbles (universal · nube)

- **Motivación**: el personaje predeterminado necesita la máxima aceptabilidad y temperamento relajado; el carácter lento se implementa mediante cubiertas de emoción (rodajas de espera de 12~20s de rotación). Boceto de concepto finalizado: combinación de azul niebla y lavanda.
- **Cuerpo**: `{ type:'cloud', r:0.94, lobes:7, amp:0.08, flat:0.12 }` —— 7 lóbulos impares evitan simetría rígida; la base plana simula estar sentado en una nube.
- **Ojos**: ojo judía, sensación de luna menguante por bend 0.1 + tilt -2; brillo 0.2 (la nube es mate, se atenúa el esmalte).
- **Color**: azul niebla lavanda #B4C6EE.
- **Acción de firma**: burbuja —— al clicar se sopla una burbuja de nube con distintas distancias por sector; clics continuos cambian de sector; las burbujas cercanas estallan primero, las lejanas después. Celebrar no cambia la emoción. Las burbujas ligeras son más claras que el cuerpo de la nube, en modo boceto se cambian a trazos de tinta.
- **Bitácora de iteración**: v1.0 la firma era "lluvia de la nube"; v1.5 "floración de la nube"; v1.6 se abandonó el arco de tinta, cinta orbital, halo de luz y el gráfico `50`«celebrar»; actualmente es expulsar burbujas por sector al clicar.

### Twinkle Spark (universal · estrella)

- **Motivación**: personalidad de "profesor entusiasta", la estrella + frame de gafas redondas balancean sensación académica y amigabilidad (a partir de v1.3 el rol pasó de educativo a universal). Boceto de concepto finalizado: dorado miel + gafas de marco dorado.
- **Cuerpo**: `{ type:'star', r:1.02, points:5, inner:0.74, sharp:0.5 }` —— inner 0.74 hace que las puntas de la estrella sean suaves y no punzantes.
- **Ojos**: ojo de pupila (taper 0.38) + `pupil: { irisR:10, pupilR:4.8, irisColor:#7A4E2A（marrón cálido）}`。
- **Accesorios**: gafas de montura redonda autoFit (`kind:'glasses'`, fit 1.3, marco dorado #C9973F)——la posición y radio del marco se calculan automáticamente desde la posición/forma real de los ojos, siguen la mirada 75%, resbalan al parpadear con rebote, el cristal barre luz periódicamente.
- **Color**: dorado miel #F5B93F; efecto polvo estelar (órbitas de pensamiento mezcladas con lápiz de rotación, chance 0.3).
- **Ajuste facial**: la zona central de la estrella es pequeña, face sx/sy 0.82 ajusta los rasgos.

## 3. Histórico de iteración v1.2 (2026-08-20)

Esta versión establece normas físicas de ojos para todos los personajes:

- El punto de luz del ojo judía se oculta según la altura efectiva visible (entrecerrar/escanear/fatigado ya no muestran el punto blanco); el offset se escala relativamente al bbox del ojo actual y se limita dentro del borde;
- Se añade el modo de ojo pequeño: debajo de la pestaña se esconde el iris; el centro de la pupila se limita dentro del bbox reducido del ojo;
- Mecanismo `signatureMouth` puesto en marcha: durante la acción de firma, la boca se sobrescribe temporalmente (p. ej. `o`), vuelve a la boca de la emoción actual al terminar.

Esta versión también realizó la refactorización de forma de 4 personajes posteriores (gota / llama / durazno / hucha), los archivos de personaje y generadores relacionados se eliminaron completamente en v1.3 / v1.5, aquí no se detallan más parámetros.

## 4. Histórico de iteración v1.3 (2026-08-20)

- **Reducción de personajes**: solo se conservan los 2 personajes Nimbo y Twinkle. Mochila / Llama / Durazno / Hucha y sus planes de respaldo (bolsa de compras / monedero) fueron revisados y eliminados por falta de reconocimiento y carisma. Nimbo mantiene el ojo judía + punto de luz, sin cejas ni extremidades.
- **Renderizado de contorno suavizado**: en `render.js` el ringPath pasó de polilínea (segmentos L) a spline Catmull-Rom → Bézier cúbica por puntos; cuerpos / ojos / bocas / cejas todos los contornos mantienen bordes suaves a cualquier escala, los parámetros de muestreo geométrica no cambian.
- **Animación de giro**: al girar, el cuerpo añade una ligera inclinación angular (±5°) y compresión elástica horizontal (0.88~1.0), usar "giro angular" en lugar de "pliegue de papel" donde solo se mueven los rasgos pero no el cuerpo.
- **Consistencia del punto de luz del ojo judía**: antes, cualquier forma de ojo con altura visible < 18px ocultaba el punto de luz, causando que entrecerrar / escanear / pequeños ojos "perdieran la pupila". Mejorado a: solo se oculta al verdadero cierre (<10px), en el rango 10~26px el punto de luz se reduce proporcionalmente (mínimo 0.55 veces); radio del punto de luz base de Nimbo 2.8 → 3.2, consistencia visual de la pupila en todas las emociones.
- **Diseño de exposición de la galería**: la fila de personajes (cast row) se movió del fondo de la página a la parte superior —— encima de la pestaña de filtro y el grupo (grid con divisiones explícitas cast / head / thumbs), modo de muro y modo de álbum consistentes, no necesario hacer scroll a la página inferior al cambiar de personaje.
- **Tipo de industria de Twinkle**: education → general, mismo que Nimbo como personaje universal.
- **Integración al repositorio emotion-ball**: este proyecto se incorpora como subdirectorio `mood-mates/` dentro del repositorio emotion-ball, con sitio de muestra y todos los archivos de licencia adjuntos; el directorio raíz de personajes esféricos mantiene licencia "solo para aprendizaje", este proyecto mantiene doble licencia, independientes entre sí.

## 5. Histórico de iteración v1.4 (2026-08-20)

- **Reconstrucción de topología lens（ojo / boca）**: la implementación anterior colocaba puntos uniformemente en longitud por separado en bordes superior e inferior, fusionándolos en dos puntos superpuestos en los extremos (grosor 0), pasando el spline por puntos repetidos produce esquinas afiladas visibles a simple vista；y justo donde la curvatura es máxima en los extremos hay menos puntos de muestra. Refactorizado a muestreo parametrizado de curva cerrada (φ recorre toda la vuelta, u = (1-cosφ)/2), los puntos de cruce de bordes superior e inferior convergen a un solo punto, la muestra se concentra naturalmente hacia los dos extremos——la calidad de los bordes de ojos y bocas alcanza el nivel de cápsulas analíticas, los parámetros semánticos de hueco (w/h/bend/slope/taper/shift/tilt) y el número de puntos del anillo no cambian, total compatibilidad con deformaciones de expresiones.
- **Mecanismo de variantes de contorno corporal**（capacidad del motor）: un personaje puede declarar `variants = { id: { name, en, body } }`, la variante solo reemplaza el contorno corporal bodyRing, las familias de ojos/colores/emociones compartidos; `MoodMates.create` añade opción `variant`. El menú desplegable "Forma" de la galería usa esta entrada (las 3 formas de la bola esférica de EB se mapean a shapes).
- **Segunda silueta de nube de Nimbo（eliminada）**: intentó 5/6 lóbulos con concavidad profunda en estilo adhesivo; 5 lóbulos chocaban con la estrella de 5 puntas de Twinkle, 6 lóbulos no alcanzaban la calidad, tras revisión se eliminó completamente; Nimbo conserva solo la nube de 7 lóbulos por defecto; el mecanismo de variantes se mantiene para uso futuro.
- **Modo de ojo pequeño ya no esconde la pupila**: la versión anterior del modo pequeño (apertura efectiva 0.26~0.45) ocultaba la pupila y el punto de luz juntos, dejando solo el iris, causando que Twinkle en expresiones de entrecerrar/escanear "pierda el punto de pupila más oscuro". Mejorado: pupila e iris entran y salen juntos, se reducen proporcionalmente según apertura (mínimo 0.6 veces), solo el punto de luz blanco se oculta en modo pequeño; el modo pestaña (<0.26, verdadero cierre) sin cambios.
- **Eliminación de cejas en Twinkle**: el palillo corto encima del marco y el ojo de pupila + gafas superponen demasiada información en la cara; la emoción ya se expresa suficientemente por apertura de párpados / mirada / forma de boca, eliminar mantiene un idioma de diseño minimalista.
- **Boca no dibujada en modo boceto**: dibujar el contorno de la boca en modo boceto genera círculos irregulares feas, intentado reemplazar con arco medio, tras revisión final se decide: el boceto solo dibuja el contorno del cuerpo y las líneas de los párpados, no la boca——más próximo a la expresión de boceto a mano.
- **acción de celebración combinada `celebrate()`**: una sola acción de firma como respuesta al clic es monótona, se añade método de motor que empaqueta "acción de firma + giro/rebote aleatorio + confeti" como una celebración, el efecto visual alcanza el nivel de la banda elástica + fuegos artificiales de emotion-ball; las antics de espera siguen usando la firma ligera, no afectadas.
- **Color de trazo de boceto sigue al tema**: la versión anterior usaba color corporal oscurecido / color de ojo para el trazo de boceto, casi invisible en páginas oscuras. Mejorado: prioridad al consumo de la variable CSS del sitio `--sketch-ink` (tinta clara en página oscura, tinta oscura en página clara), sin variable del tema retrocede a la lógica anterior——el motor mantiene cero acoplamiento con el sitio, la adaptación de tema depende del sitio definir la variable.

## 6. Histórico de iteración v1.5（2026-08-21)

- **Actualización de la acción de firma de Nimbo**: lluvia de la nube → floración de la nube. La lluvia es demasiado silenciosa como respuesta de clic y dirección única; intermediamente se intentó "inhala arcoíris"（espiral de absorción + cinta de arcoíris), pero el coste de adaptación de la boca de inhalación con formas de boca de expresiones es alto y no se ajusta al carácter, finalmente se decide: floración de la nube——alrededor del cuerpo se abren un círculo de pequeñas nubes, con rebote elástico al salir, flotan con ondulación, acompañadas de ondas de aire y pequeñas estrellas; todas las partículas se anclan al centro del cuerpo + desplazamiento corporal en tiempo real, siguen correctamente durante rebote / giro / cualquier expresión, independientemente de la forma de boca. rain / rainbow skins eliminados sincronizadamente.
- **Limpieza de código muerto de entrega final**: se eliminan generadores de cuerpo no usados por ningún personaje (drop / flame / bag / shield / heart / peach / pig, solo se conservan cloud / star y el punto de extensión puff)、skins de efectos（bubbles / embers / hearts / coins)、construcciones de accesorios (snout / coinslot / limbs) y claves de texto del sitio sin usar; el skin de efectos predeterminado del motor cambia a cloudpuff. La capacidad del motor se basa en "lo que los personajes realmente usan + puntos de extensión general", no se conservan capacidades huérfanas.
- **Corrección de despleisable de forma**: IDs de variante descontinuados almacenados en localStorage (por ejemplo scallop) no pueden coincidir con ninguna opción en el select y se muestra en blanco; rellenar con verificación y retroceso a la forma predeterminada.
- **Composición de apertura**: personaje de línea de boceto semioculta ampliado (720 → 880px) y desplazado 7% hacia abajo, solo se muestra la parte superior de la cara por encima de la línea de corte；la cinta en la parte superior y los dos lados queda completamente visible.

## 7. Histórico de iteración v1.6（2026-08-24)

- **Actualización de la firma de Nimbo**: floración de la nube → burbuja de nube. Arco de tinta, cinta orbital, halo de luz, halo de luz, burbuja de luz, el gráfico `50`«celebrar» están todos abandonados; al hacer clic se sopla burbujas de nube con la misma silueta hacia derecha e izquierda, flotan en el aire y estallan una a una, no cambia emotionId.
- **Capa de niebla de la galería**: pintada en el background de `.gallery` mismo, varios elipses desplazadas desde el centro de la galería hacia fuera forman una nube de niebla irregular. No usar `::before` / `isolation` / z-index hijo, evita errores de capas al hacer scroll, abrir diálogos de escenario y barra superior.

## 8. Histórico de iteración v1.7（2026-08-25)

- **Burbujas de nube out of bounds**: `filter` CSS del SVG del escenario recorta partículas que salen del viewBox; la sombra se aplica solo al grupo `.mm-body`. El punto de partida se calcula extrapolando el ancho de la silueta, 6 burbujas desalineadas soplando hacia arriba a la derecha.
- **Adaptación de tema**: en modo claro, las burbujas de color claro son más claras que el cuerpo de la nube, trazos finos; en modo boceto (incluido el personaje de línea de boceto de apertura), burbujas / estrellas se dibujan con trazos `--sketch-ink`, sin relleno de luz.
- **Ritmo de expulsión de burbujas**: un soplo por sector, primero las lejanas, luego las cercanas; el vuelo usa duración absoluta (lejos vuela más, no la misma tensión). Las burbujas cercanas estallan primero, las lejanas después. Clics continuos cambian de sector; clics rápidos reparten burbujas a izquierda / derecha / coronilla.

## 9. Histórico de iteración v1.8（2026-08-25)

- **Boceto es conmutador de visualización**: `setStyle({ sketch })` escribe después de fundido de caras / transición, no interpola entre fotogramas clave lerp. Al cambiar el color corporal durante la celebración, no se escribe el trazo en atributos SVG；al desactivar el boceto, se eliminan atributos y estilos juntos, el trazo temporal no queda en el color sólido.
- **Barra de selección de álbum**: barra horizontal con espacio en blanco a izquierda y derecha, usar anillo de acento común resaltada; centrado de desplazamiento calculado según rectángulo de viewport, 3 personajes usan el mismo conjunto.

## 10. Base de emociones compartida

32 configuraciones de emociones (`src/data/emotions.js`) usan el formato de configuración de tres capas auto-desarrollado por este proyecto "huecos de forma de ojo + primitivas de animación + secuencia de fotogramas clave", parámetros (duración, amplitud, frecuencia) ajustados uno a uno con diseño de interpretación. Los huecos de forma de ojo referencian huecos semánticos, no geometría específica; los colores referencian @token no valores de color específicos——la misma configuración presenta apariencias y colores propios en cada personaje.

## 11. Añadir nuevos personajes

Al añadir un nuevo personaje, añadir una sección de archivo en este documento, incluyendo: motivación, parámetros corporales, parámetros de ojos, paleta de colores, explicación de accesorios, historial de iteración (incluida la fecha). Esto es el requisito para mantener la cadena de evidencia de originalidad, también parte de las normas de `docs/CHARACTER-DESIGN.md`.
