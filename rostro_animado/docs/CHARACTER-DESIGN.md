# Normas de diseño de personajes · Character Design Guide

> Guía completa para crear un nuevo personaje de Mood Mates desde cero. Un personaje = un archivo de datos autónomo, sin necesidad de modificar el código del motor.

## 1. Esquema del paquete de datos

```js
window.MoodMates.characters.register({
  id: 'puffy',                     // ID único (minúsculas)
  name: 'Puffball',                // nombre en chino (nombre interno)
  en: { name: 'Puffy', desc: '...' },
  industry: 'general',             // general / personalizado (añadir industry_<key> al texto del sitio)
  desc: 'Breve descripción del personaje',

  /* 1. Silueta corporal: descriptor del generador parametrizado (ver "Generador corporal" más abajo) */
  body: { type: 'puff', r: 0.96, waves: [{ k: 6, amp: 0.05 }] },

  /* 2. Ajuste facial: desplazamiento y escala global de los rasgos sobre la silueta */
  face: { x: 0, y: 6, sx: 1, sy: 0.96, eye: 1 },
  //  x/y: traslación; sx/sy: escala horizontal/vertical de los ojos; eye: factor de tamaño de ojos

  /* 3. Paleta de colores: color corporal principal + estados semánticos (las emociones referencian con @token) */
  palette: {
    body: '#8AD6C8',
    eye: '#25333B',                // color de ojos (@eye)
    eyeHighlight: '#FFFFFF',
    blush: '#F0A8A8',              // rubor
    mouth: '#31424B',              // boca (usa el color de ojos por defecto)
    zzz: '#8FB5AC',                // partículas de letras durante el sueño
    fx: ['#7FD8CE', '#9BC7F0'],    // opcional: sobrescribir colores predeterminados de la piel de efectos
    states: {
      base: '#8AD6C8',             // @base normal
      dim: '#7CB4A9',              // @dim  triste/sueño
      soft: '#98E0D2',             // @soft  suave/feliz
      blush: '#EFB9BC',            // @blush  ruborizado
      angry: '#E5705F',            // @angry  enfadado
      alert: '#E25B5B',            // @alert  error de alerta
      off: '#93AFA8'               // @off  detenido
    }
  },

  /* 4. Estilo de ojo: determina la "apariencia" de los 20 huecos semánticos de ojos */
  eyeStyle: {
    dx: 30,       // distancia del centro del ojo al eje central de la cara
    cy: 102,      // coordenada vertical del centro del ojo (centro de la cabeza = 120)
    w: 25, h: 33, // ancho / alto del ojo
    taper: 0.42,  // punta del extremo: 0.3 estilo rectángulo con esquinas redondeadas ~ 1.2 puntas muy afiladas
    tilt: 0,      // ángulo general (grados, valor positivo: alto exterior, bajo interior)
    bend: 0.02,   // curvatura del eje central (valor positivo: arco hacia arriba)
    highlight: { dx: 4, dy: -7, r: 3.2 },  // punto de luz del ojo judía, null para desactivar

    /* Opcional: ojo de pupila (al rellenar pupil se cambia del ojo judía al ojo de capas).
     * El anillo lens del párpados se convierte en clipPath, renderizando internamente en capas: esclerófita / iris / pupila / punto de luz:
     * - Al cerrar/parpadear/entrecerrar se cambia automáticamente a línea oscura de pestaña; la pupila nunca se verá fuera de un ojo cerrado
     * - Al mirar, la pupila se desliza adicionalmente dentro del bbox del anillo ocular (50% más que el párpad)
     * - La posición del punto de luz es fija (la dirección de la fuente de luz no cambia), no gira con el ojo */
    pupil: {
      irisR: 11,               // radio del iris
      pupilR: 5.2,             // radio de la pupila
      irisColor: '#23424E',    // color del iris (degradado radial generado automáticamente)
      socket: '#FFFFFF',       // color de la esclerófita
      highlights: [            // puntos de luz de fuente fija (pueden ser múltiples, dx se invierte automáticamente en el ojo izquierdo)
        { dx: -3.6, dy: -4.4, r: 3.4 },
        { dx: 4.2, dy: 2.8, r: 1.5, opacity: 0.65 }
      ]
    }
  },

  /* 4b. Grupo de contornos específicos (opcional): definir contornos personalizados más allá de los 20 huecos semánticos.
   * eyeShapes: usando parámetros originales lens (w/h/bend/slope/taper/shift/tilt)
   * mouthShapes: usando parámetros originales mouthLens (w/h/bend/taper);
   * entonces se puede referenciar por nombre en las cubiertas de emociones */
  eyeShapes: {
    delight: { w: 28, h: 15, bend: 0.7, taper: 1.3 }
  },
  mouthShapes: {
    bigGrin: { w: 20, h: 9, bend: -0.35, taper: 0.5 }
  },

  /* 5. Configuración de rasgos faciales */
  features: {
    mouth: { w: 25, dy: 33 },                       // ancho de boca / posición vertical; false para desactivar
    blush: { dx: 42, dy: 22, rx: 11, ry: 6.5, max: 0.85 },  // rubor; true usar predeterminado; false para desactivar
    brows: { w: 15, h: 3.2, dx: 30, dyTop: -26, always: false },  // cejas; false para desactivar
    /* Componentes de accesorios enlazados (ver "4. Sistema de accesorios enlazados") */
    accessories: [
      { kind: 'glasses', color: '#C9973F', fit: 1.3 },
      { kind: 'path', layer: 'back', d: 'M...', fill: '...', micro: { type: 'float', amp: 1.6, period: 3000 } }
    ]
  },

  /* 6. Piel de efectos (incluye acción de firma):
   * cloudpuff burbuja de nube: un soplo por sector de nube, distintas distancias; clic continuo cambia de sector
   * stardust polvo estelar: estrellas parpadeantes alrededor del cuerpo una a una; órbita de pensamiento mezclada con lápiz de rotación
   * La piel puede establecer signatureMouth: la boca se sobrescribe temporalmente durante la acción de firma, vuelve a la boca actual al terminar */
  fxSkin: 'cloudpuff',

  /* 7. Cubiertas de emociones (opcional): fusión superficial por ID de emoción sobre la base compartida;
   * pool / mouth pueden referenciar nombres de contornos específicos definidos en 4b */
  emotions: {
    '02': { antics: false, poolMs: [14000, 22000] },
    '21': { pool: ['delight'] },
    '33': { body: { spinFx: 0, confetti: 0.8 }, mouth: 'bigGrin' }
  }
});
```

## 2. Generador corporal

Todos los generadores están en `src/core/geometry.js`, salen anillos cerrados de 96 puntos. Usa `tools/ring-editor.html` para ajustar visualmente y luego copiar el descriptor al archivo del personaje.

| type | Silueta | Parámetros clave |
| --- | --- | --- |
| `cloud` | Nube de concha | `lobes` número de lóbulos, `amp` amplitud, `flat` aplanar base |
| `star` | Estrella redondeada | `points` número de puntas, `inner` radio interno, `sharp` agudeza |
| `puff` | Círculo perturbado armónico | `waves: [{k, amp, phase}]` (primitiva libre, punto de partida para creaciones derivadas) |

**Verificación de salida**: viewBox es 0 0 240 240, centro de cabeza 120, radio base 104. Comprobar que `r × 104 × (1 + máxima protuberancia)` no exceda 118, de lo contrario la parte superior de la silueta saldrá del viewBox.

## 3. Huecos semánticos de forma de ojo

La base de emociones hace referencia a los huecos de forma de ojo por nombre, cada personaje los instancia con su propio `eyeStyle`. Los 20 huecos:

- Calmado: `calm` `calm2`
- Ojos de risa: `happy` `happy2`
- Abiertos: `wide` `wide2`
- Cerrados: `closed` `closed2` `sleepy`
- Entrecerrados: `squint` `squint2`
- Enfadados: `angry` `angry2`
- Escaneando: `scan` `scan2` `scan3`
- Escuchando: `listen` `listen2`
- Tímidos: `shy` · Tristes: `sad`

9 huecos de forma de boca: `smile` `grin` `o` `flat` `frown` `wavy` `pout` `open` `dot`.

La personalidad del personaje depende principalmente de 4 parámetros de `eyeStyle`: `taper` (redondeado ↔ afilado), `tilt` (inocente ↔ astuto), `bend` (recto ↔ luna), proporción `w/h` (listón ↔ tonto).

## 4. Sistema de accesorios enlazados

Los accesorios no son texturas estáticas, sino componentes enlazados con anclaje y microanimación (`src/core/features.js`):

| kind | Descripción | Comportamiento enlazado |
| --- | --- | --- |
| `glasses` | Gafas de montura redonda | **autoFit**: centro y radio de la montura calculados automáticamente a partir de la posición/realidad de los ojos del personaje (`fit` coeficiente de escala); sigue la mirada 75% (los ojos se desplazan dentro de la montura con paralaje); al parpadear la montura resbala ligeramente con rebote; barrido de luz periódico (`glintPeriod`) |
| `path` | path personalizado | `anchor: 'face'` proyección contra el rostro / `'abs'` coordenadas del cuerpo; `micro: { type: 'float' \| 'swing', amp, period }` microanimación |

Todos los accesorios se escriben en el sistema de coordenadas del cuerpo (240 × 240, centro 120), siguen la respiración / inclinación / rebote del cuerpo; `layer: 'back'` se renderiza tras el cuerpo (bolsas, alas), `layer: 'front'` se renderiza encima de los rasgos (gafas, insignias).

Posición real de los ojos: x = 120 ± eyeStyle.dx × face.sx, y = 120 + face.y + (eyeStyle.cy − 120) × face.sy。

## 4b. Normas de física correcta

El motor ya incorpora las siguientes normas; no romperlas al diseñar nuevos personajes/expresiones:

1. **Al cerrar, no se ve la pupila**: la apertura del ojo de pupila se juzga por el grosor real del contorno (área del lazo ÷ ancho). `effOpen < 0.26` cambia automáticamente a línea de pestaña oscura; `0.26~0.45` es modo de ojo pequeño (pupila e iris se reducen proporcionalmente según la apertura, ocultando solo el punto de luz blanco; el punto de pupila más oscuro siempre visible). Si defines `eyeShapes` para expresar "cerrar/entrecerrar", haz el contorno delgado para obtener automáticamente el efecto de pestaña;
2. **Rasgos enlazados coordinados**: al mirar, la pupila se mueve 50%, las cejas 80%, las gafas 75%, la boca 35%, el rubor 25%——la diferencia de capas crea sensación de volumen; los nuevos accesorios sigan usando esta escala;
3. **Cierre en cascada**: al parpadear/cerrar, las cejas se relajan y caen, las gafas resbalan con rebote; el punto de luz del ojo judía se oculta según la altura efectiva visible (el ancho de bbox y el grosor del contorno, tomando el menor × apertura × escalaY, alrededor de <10px), no solo con `open<0.35`;
4. **Punto de luz / pupila no salen del ojo**: el offset del punto de luz del ojo judía se escala relativamente al bbox del ojo actual frente al predeterminado, y se limita el borde del bbox ± radio; el centro de la pupila se limita dentro del bbox del ojo actual reducido `pupilR` (el iris es algo más flexible), evita que al mirar la pupila se corte como luna menguante;
5. **Ocultación al girar**: todos los accesorios/puntos de referencia comparten la misma proyección de longitud horizontal, al girar hacia el reverso se ocultan automáticamente。

## 5. Personalidad = datos

Sin cambiar código, expresa la personalidad del personaje mediante cubiertas de emociones:

- **Estable** (finanzas): `antics: false`, `poolMs` prolongado, amplitud de animación reducida a la mitad, `period` alargado;
- ** inquieto** (juegos): `poolMs` acortado, amplitud aumentada, cejas siempre visibles;
- **lento**: `period` de la mirada de espera elevado a 6000+;
- **Estilo de celebración**: clic `celebrate()` (el personaje de nube sopla burbujas, el de estrella firma + cuerpo + confeti); el gráfico `33` de la guía de datos solo afecta `spinFx` / `confetti` al entrar en esa emoción, no a la celebración de clic;
- **Forma única de expresión**: referenciar `pool` / `mouth` a `eyeShapes` / `mouthShapes` definidos en 4b, dejar que las expresiones clave tengan rasgos únicos。

## 6. Lista de verificación de lanzamiento

1. Ajustar en `tools/ring-editor.html`, la silueta no sale del viewBox, sin auto-intersección;
2. Verificar a simple vista los 6 estados básicos: 02 espera / 10 feliz / 14 tímido / 21 enfadado / 30 pensar / 33 completado;
3. Completar los 7 estados de color en la paleta (el valor predeterminado retrocede al color corporal, causando que no se pulse en rojo al enfadarse);
4. Añadir una línea en `index.html`: `<script src="src/characters/tu_personaje.js"></script>`（después de engine.js);
5. **Añadir el archivo de perfil del personaje en `docs/DESIGN-PROVENANCE.md`**（motivación, parámetros, fecha, historial de iteraciones）——requisito para la cadena de evidencia de originalidad;
6. Comparar la silueta con los personajes existentes, asegurarse de que no se parezcan entre sí y no se asemejen a ninguna figura reconocida de terceros.
