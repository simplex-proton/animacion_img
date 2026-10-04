# Guía de integración · Integration Guide

Mood Mates es un motor de emociones SVG + JavaScript nativo sin dependencias y sin compilación.
El anfitrión solo necesita cargar los scripts en orden y llamar `MoodMates.create`.

## Integración rápida

```html
<!-- Motor (orden fijo): geometría → renderizado → rasgos → efectos → datos emocionales → motor -->
<script src="src/core/geometry.js"></script>
<script src="src/core/render.js"></script>
<script src="src/core/features.js"></script>
<script src="src/core/fx.js"></script>
<script src="src/data/emotions.js"></script>
<script src="src/core/engine.js"></script>
<!-- Cargar personajes según sea necesario (al menos uno) -->
<script src="src/characters/nimbo.js"></script>

<div id="mate" style="width:200px;height:200px"></div>
<script>
  var mate = MoodMates.create(document.getElementById('mate'), {
    character: 'nimbo',
    emotion: '02',
    idle: true
  });
</script>
```

`site/i18n.js` y `site/app.js` pertenecen al shell de la galería de demostración; el anfitrión no los necesita.

## Protocolo de IA

La IA solo necesita generar un JSON y pasarlo a `handleAIMessage` (acepta objeto o string):

```js
mate.handleAIMessage('{"emotionId":"30","tips":"Pensando en la pregunta del usuario"}');
```

- `emotionId` desconocido, error de análisis JSON, campo faltante: dispara evento `error` y
  vuelve a la emoción de respaldo (`fallbackId`, por defecto `'02'`); nunca deja la pantalla en blanco;
- `tips` es un texto opcional que se entrega mediante el evento `tips` para que el anfitrión lo renderice.

### Regla de segmentación de emotionId (contrato externo, los números nunca se reordenan)

| Rango | Grupo | Comunes |
| --- | --- | --- |
| 00-09 | ciclo de vida | 00 dormir · 01 despertar · 02 espera · 03 curiosidad |
| 10-29 | reacciones emocionales | 10 feliz · 13 sorpresa · 14 tímido · 21 enfadado |
| 30-49 | estados de trabajo de IA | 30 pensar · 33 completado · 34 error · 38 rechazar · 40 buscar |
| 50+ | personalizado | registro en tiempo de ejecución |

## Parámetros de creación

| Parámetro | Por defecto | Descripción |
| --- | --- | --- |
| `character` | primer personaje registrado | ID del personaje: `nimbo` / `twinkle` |
| `emotion` | `'02'` | ID de emoción inicial |
| `color` / `eyeColor` | — | Color corporal / de ojos del tema (para instancias de equipo) |
| `eyeScale` | `1` | Escala de los ojos; para tamaños < 80px recomendar 1.5~1.8 |
| `idle` | `false` | Estrategia de espera: conmutación automática tras inactividad / dormir; pasar un objeto para personalizar tiempos y estados |
| `autostart` | `true` | `false` renderiza un solo fotograma estático (para miniaturas) |
| `lite` | sigue `autostart` | Modo ligero: desactiva partículas de efectos y zzz |
| `fallbackId` | `'02'` | Emoción de respaldo para IDs desconocidos |

## Eventos y métodos

```js
mate.on('change', e => {});         // Emoción cambiada { id, def, auto }
mate.on('tips',   e => {});         // Texto opcional de IA { text }
mate.on('error',  e => {});         // Error de protocolo { message, ... }

mate.setEmotion('21');              // Cambio directo
mate.setGaze(nx, ny);               // Mirada normalizada [-1,1]; el anfitrión escucha pointermove
mate.setStyle({ sketch: 1 });       // Modo boceto
mate.celebrate();                  // Celebración de clic: Nimbo sopla burbujas; Twinkle firma + cuerpo + confeti
mate.signature();                  // Solo la acción de firma (burbuja de nube / estallido estelar)
                                    // Devuelve false si el personaje no tiene acción de firma
mate.spin(3);                      // Girar y lanzar partículas (genérico)
mate.burst(24);                    // Confeti
mate.bounce();                     // Rebote
mate.startTour(ids, 2500);         // Recorrido automático / mate.stopTour()
mate.setActive(false);             // Detener fotogramas cuando está fuera de pantalla; true lo reanuda
mate.renderStatic();               // Renderizar un fotograma estático
mate.registerEmotion(raw);         // Registrar emoción personalizada en tiempo de ejecución (rango 50+)
mate.destroy();                    // Destruir instancia
```

## Múltiples instancias y rendimiento

- Todas las instancias comparten un único latido rAF; más instancias no multiplican el costo del bucle;
- Muro de miniaturas: `autostart: false` renderiza estático, al pasar el ratón `setActive(true)`,
  al salir `setActive(false)`;
- Usar IntersectionObserver para `setActive(false)` en instancias fuera de pantalla.

## Mascota de escritorio / Electron

- Parámetros de ventana: `transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true`,
  fondo transparente solo con el contenedor del personaje;
- Transparencia del ratón: `win.setIgnoreMouseEvents(true, { forwardMouseMove: true })`
  — el personaje aún recibe `setGaze`, el clic atraviesa al escritorio;
- Reenvío de mensajes de IA por IPC: `ipcRenderer.on('emotion', (_, msg) => mate.handleAIMessage(msg))`;
- Ventanas pequeñas (≤ 120px) recomendar `eyeScale: 1.5` + `lite: true`.

## Emociones personalizadas

```js
MoodMates.config.register({
  id: '50', name: 'Saludo', group: 'custom',
  pool: ['happy', 'wide'],        // Huecos de forma de ojo (comunes a todos los personajes)
  mouth: 'grin',                  // Hueco de forma de boca
  body: { color: '@soft' },       // Color con @token, se adapta a la paleta de cada personaje
  anims: [ { target: 'body', prop: 'rotate', type: 'sine', amp: 6, period: 900 } ]
});
```

El formato de configuración completo está en los comentarios de cabecera de `src/data/emotions.js`;
importar y exportar con `MoodMates.config.exportConfig()` / `importConfig(json)`.
