// rostro_animado/src/core/engine.js
/* ============================================================
 * engine.js — Capa de motor (depende de geometry / render / features / fx; consume datos puros de emotions.js)
 *
 * Responsabilidades:
 *   1. Centro de registros de personajes MoodMates.characters: paquete de datos →
 *      extrae geometría / familia de anillos oculares / familia de bocas
 *   2. Centro de registros de emociones MoodMates.config: validación /
 *      ranuras semánticas / importación y exportación (plataforma compartida por todos los personajes)
 *   3. EmotionEngine: máquina de estados rAF + primitivas de animación + interpolación elástica +
 *      valor de respaldo + estrategia de espera
 *   4. SDK externo: MoodMates.create(el, opts) → instancia del motor
 *
 * API externa (el anfitrión solo depende de esta capa):
 *   const mate = MoodMates.create(el, { character:'nimbo', emotion:'02', idle:true });
 *   mate.setEmotion('30');
 *   mate.handleAIMessage({ emotionId:'30', tips:'Pensando en la pregunta del usuario' });   // o string JSON
 *   mate.on('change'|'tips'|'error', cb);
 *   mate.startTour(ids, interval) / mate.stopTour();
 *   mate.registerEmotion(config); mate.destroy();
 *   MoodMates.characters.register(def) / list();
 *   MoodMates.config.exportConfig() / importConfig(json);
 *
 * Diseño semántico en la configuración de emociones (independiente del personaje específico):
 *   pool  usa nombres de huecos de forma de ojo ('calm'/'happy'/…), cada personaje implementa con su propia familia de anillos
 *   mouth usa nombres de huecos de forma de boca ('smile'/'o'/…), se deforma elásticamente al cambiar
 *   color usa '@token' ('@base'/'@blush'/'@angry'/…) consulta la tabla states de la paleta del personaje
 * ============================================================ */
(function () {
  'use strict';

  var MM = (window.MoodMates = window.MoodMates || {});
  var GEO = MM.geo;
  var TAU = Math.PI * 2;
  var FALLBACK_ID = '02';

  /* ---------------- Utilidades básicas ---------------- */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /* Integración de paso de resorte con amortiguación crítica, subpasos 1/120 garantizan estabilidad numérica */
  function spring(v0) { return { x: v0, v: 0, t: v0 }; }
  function springStep(s, w, z, dt) {
    s.v += (-2 * z * w * s.v - w * w * (s.x - s.t)) * dt;
    s.x += s.v * dt;
    if (!isFinite(s.x) || !isFinite(s.v)) { s.x = s.t; s.v = 0; }
  }

  /* Interpolación punto a punto entre dos anillos de contorno */
  function lerpRing(a, b, t) {
    var out = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      out[i] = [a[i][0] + (b[i][0] - a[i][0]) * t, a[i][1] + (b[i][1] - a[i][1]) * t];
    }
    return out;
  }

  /* Rebote: 4 segmentos de parábola decreciente */
  var BOUNCE_SEGS = [{ h: 48, d: 0.5 }, { h: 28, d: 0.382 }, { h: 14, d: 0.27 }, { h: 6, d: 0.177 }];
  var BOUNCE_TOTAL = BOUNCE_SEGS.reduce(function (s, q) { return s + q.d; }, 0);

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    }).join('');
  }
  function lerpColor(a, b, t) {
    if (a === b) return b;
    var A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
  }

  /* ---------------- Auto-palette: derivación HSL de los estados semánticos ----------------
   * A partir de un único palette.body se generan los 7 tokens @dim @soft @blush @angry @off
   * (y zzz como sombra fría del cuerpo). Los estados declarados explícitamente en la paleta
   * siempre mandan sobre el derivado. @alert es fijo (#E25B5B, alarma estándar del catálogo). */

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2, d = max - min;
    if (d > 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h * 360, s, l];
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;   /* C = (1-|2L-1|)·S */
    var p = 2 * l - q;                                /* X = C·(1-|2t-1|) base */
    function f(t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return rgbToHex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
  }

  /** Deriva los estados semánticos desde bodyHex; `declared` tiene prioridad */
  function deriveStates(bodyHex, declared) {
    var c = hexToRgb(bodyHex);
    var hsl = rgbToHsl(c[0], c[1], c[2]);
    var H = hsl[0], S = hsl[1], L = hsl[2];
    var out = {
      base:  bodyHex,
      dim:   hslToHex(H, S * 0.92, L - 0.10),
      soft:  hslToHex(H, S * 0.95, L + 0.06),
      blush: hslToHex(345, 0.40, clamp(L + 0.02, 0.55, 0.82)),
      angry: hslToHex(8, 0.70, clamp(L - 0.02, 0.48, 0.66)),
      alert: '#E25B5B',
      off:   hslToHex(H, S * 0.35, L - 0.02)
    };
    Object.assign(out, declared || {});
    return out;
  }

  /* ---------------- Centro de registros de personajes ---------------- */

  var characters = new Map();
  var charOrder = [];

  /** Tabla de colores states por defecto del personaje: los colores semánticos no proporcionados
    *  todos vuelven al color principal */
  var STATE_KEYS = ['base', 'dim', 'soft', 'blush', 'angry', 'alert', 'off'];

  function resolveCharacter(raw) {
    if (raw._resolved) return raw._resolved;
    var eyeStyle = Object.assign(
      { dx: 30, cy: 96, w: 26, h: 34, taper: 0.5, tilt: 0, bend: 0, highlight: null, pupil: null },
      raw.eyeStyle || {}
    );
    var family = GEO.buildEyeFamily(eyeStyle);
    /* Formas de ojo personalizadas del personaje (grupo de contornos exclusivo por emoción):
     * raw.eyeShapes = { nombre: parámetros de lens } */
    if (raw.eyeShapes) {
      for (var esk in raw.eyeShapes) {
        family[esk] = GEO.buildCustomEyePair(raw.eyeShapes[esk], eyeStyle);
      }
    }
    var mouthBase = { w: (raw.features && raw.features.mouth && raw.features.mouth.w) || 26 };
    var mouthShapes = {};
    GEO.mouthSlots.forEach(function (slot) {
      mouthShapes[slot] = GEO.buildMouth(slot, mouthBase);
    });
    /* Formas de boca personalizadas del personaje: raw.mouthShapes = { nombre: parámetros de mouthLens } */
    if (raw.mouthShapes) {
      for (var msk in raw.mouthShapes) {
        mouthShapes[msk] = GEO.buildCustomMouth(Object.assign({ w: mouthBase.w }, raw.mouthShapes[msk]));
      }
    }
    var palette = Object.assign({ eye: '#233038', eyeHighlight: '#FFFFFF' }, raw.palette || {});
    /* Auto-palette: los 7 estados semánticos se derivan de palette.body por armónicos HSL;
     * lo declarado en palette.states (o blush/zzz sueltos) siempre manda sobre el derivado */
    var declared = Object.assign({}, raw.palette && raw.palette.states);
    if (!declared.blush && palette.blush) declared.blush = palette.blush;
    palette.states = deriveStates(palette.body, declared);
    if (!palette.zzz) {
      var zc = hexToRgb(palette.states.dim);
      var zh = rgbToHsl(zc[0], zc[1], zc[2]);
      palette.zzz = hslToHex(zh[0], zh[1] * 0.8, zh[2] + 0.10);
    }

    var resolved = {
      id: raw.id,
      name: raw.name,
      en: raw.en || null,
      industry: raw.industry || 'general',
      desc: raw.desc || '',
      bodyRing: GEO.buildBody(raw.body),
      face: Object.assign({ x: 0, y: 0, sx: 1, sy: 1, eye: 1 }, raw.face || {}),
      palette: palette,
      eyeStyle: eyeStyle,
      eyeFamily: family,
      mouthShapes: mouthShapes,
      defaultEyeRing: family.calm,
      features: raw.features || {},
      fxSkin: raw.fxSkin || 'cloudpuff',
      celebrateBeat: raw.celebrateBeat || null,
      emotions: raw.emotions || null,
      raw: raw
    };
    raw._resolved = resolved;
    return resolved;
  }

  /* Variante de personaje: raw.variants = { idVariante: { name, en, body?, palette?, eyeStyle?,
   * features?, face?, fxSkin?, emotions? } }.
   * v1.9: ya no es solo contorno corporal — fusiona paleta (con auto-palette), ojos, rasgos,
   * posición facial, skin de efectos y parches de emoción sobre el personaje base. */

  function deepMergeObj(a, b) {
    var out = Object.assign({}, a);
    for (var k in b) {
      var av = out[k], bv = b[k];
      if (bv && typeof bv === 'object' && !Array.isArray(bv) &&
          av && typeof av === 'object' && !Array.isArray(av)) {
        out[k] = deepMergeObj(av, bv);
      } else {
        out[k] = bv;
      }
    }
    return out;
  }

  function resolveVariant(raw, vid) {
    var base = resolveCharacter(raw);
    if (!vid || !raw.variants || !raw.variants[vid]) return base;
    raw._variantCache = raw._variantCache || {};
    if (!raw._variantCache[vid]) {
      var v = raw.variants[vid];
      var merged = Object.assign({}, base, { variant: vid });
      if (v.body) merged.bodyRing = GEO.buildBody(v.body);
      if (v.fxSkin) merged.fxSkin = v.fxSkin;
      if (v.face) merged.face = Object.assign({}, base.face, v.face);
      if (v.emotions) merged.emotions = deepMergeObj(base.emotions || {}, v.emotions);
      if (v.palette) {
        var pal = deepMergeObj(base.palette, v.palette);
        var dec = Object.assign({}, v.palette.states || {});
        if (!dec.blush && v.palette.blush) dec.blush = v.palette.blush;
        pal.states = deriveStates(pal.body, dec);
        if (!pal.zzz) {
          var zc = hexToRgb(pal.states.dim);
          var zh = rgbToHsl(zc[0], zc[1], zc[2]);
          pal.zzz = hslToHex(zh[0], zh[1] * 0.8, zh[2] + 0.10);
        }
        merged.palette = pal;
      }
      if (v.eyeStyle) {
        /* ojo con pupila: el degradado de iris se construye al crear la bola a partir de
         * ch.eyeStyle.pupil, basta con reconstruir el objeto de estilo fusionado */
        merged.eyeStyle = deepMergeObj(base.eyeStyle, v.eyeStyle);
      }
      if (v.features) {
        merged.features = deepMergeObj(base.features, v.features);
        if (v.features.mouth) {
          var mouthShapes = Object.assign({}, base.mouthShapes);
          var mw = { w: merged.features.mouth.w || 26 };
          GEO.mouthSlots.forEach(function (slot) { mouthShapes[slot] = GEO.buildMouth(slot, mw); });
          merged.mouthShapes = mouthShapes;
        }
      }
      raw._variantCache[vid] = merged;
    }
    return raw._variantCache[vid];
  }

  MM.characters = {
    register: function (raw) {
      if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) {
        return { ok: false, errors: ['El personaje carece de un id válido'] };
      }
      if (!raw.body || !raw.body.type) {
        return { ok: false, id: raw.id, errors: ['El personaje carece de body.type (generador de cuerpo)'] };
      }
      try {
        resolveCharacter(raw);
        if (raw.variants) {
          for (var vk in raw.variants) resolveVariant(raw, vk);
        }
      } catch (e) {
        return { ok: false, id: raw.id, errors: [e.message] };
      }
      if (!characters.has(raw.id)) charOrder.push(raw.id);
      characters.set(raw.id, raw);
      return { ok: true, id: raw.id };
    },
    get: function (id, variant) {
      var raw = characters.get(id);
      return raw ? resolveVariant(raw, variant) : null;
    },
    /** Lista las variantes de contorno corporal del personaje (excluye el contorno por defecto) */
    variants: function (id) {
      var raw = characters.get(id);
      if (!raw || !raw.variants) return [];
      return Object.keys(raw.variants).map(function (k) {
        var v = raw.variants[k];
        return { id: k, name: v.name || k, en: v.en || null };
      });
    },
    list: function () {
      return charOrder.map(function (id) { return resolveCharacter(characters.get(id)); });
    },
    defaultId: function () { return charOrder[0] || null; }
  };

  /* ---------------- Pose: valores por defecto / fusión / interpolación ---------------- */

  var DEFAULT_BODY = {
    x: 0, y: 0, scale: 1, rotate: 0, color: '@base', breathe: 0.01,
    spinFx: 0, confetti: 0, sketch: 0,
    zzz: 0,      /* partículas de letras durante el sueño (0~1) */
    orbit: 0     /* partículas en órbita constante (0~1) */
  };
  var DEFAULT_EYE = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, open: 1, color: '@eye', lookX: 0, lookY: 0 };
  var DEFAULT_FACE = {
    blush: 0, browVis: 0, browTilt: 0, browRaise: 0,
    mouthX: 0, mouthY: 0, mouthSX: 1, mouthSY: 1
  };

  function defaultPose() {
    return {
      body: Object.assign({}, DEFAULT_BODY),
      left: Object.assign({}, DEFAULT_EYE),
      right: Object.assign({}, DEFAULT_EYE),
      face: Object.assign({}, DEFAULT_FACE)
    };
  }
  function clonePose(p) {
    return {
      body: Object.assign({}, p.body),
      left: Object.assign({}, p.left),
      right: Object.assign({}, p.right),
      face: Object.assign({}, p.face)
    };
  }

  /** Fusiona un fragmento de configuración (body / eyes.both|left|right / face) sobre el pose (modifica in situ) */
  function applySpec(pose, spec) {
    if (!spec) return pose;
    if (spec.body) Object.assign(pose.body, spec.body);
    if (spec.face) Object.assign(pose.face, spec.face);
    var e = spec.eyes;
    if (e) {
      if (e.both) { Object.assign(pose.left, e.both); Object.assign(pose.right, e.both); }
      if (e.left) Object.assign(pose.left, e.left);
      if (e.right) Object.assign(pose.right, e.right);
    }
    return pose;
  }

  var POSE_PARTS = ['body', 'left', 'right', 'face'];

  function lerpPose(a, b, t) {
    var out = defaultPose();
    POSE_PARTS.forEach(function (part) {
      var pa = a[part], pb = b[part], po = out[part];
      for (var k in pb) {
        var vb = pb[k];
        if (typeof vb === 'number') po[k] = lerp(pa[k] != null ? pa[k] : vb, vb, t);
        else if (k === 'color') po[k] = lerpColor(pa[k] || vb, vb, t);
        else po[k] = vb;
      }
    });
    return out;
  }

  function sampleFrameList(frames, t) {
    if (!frames.length) return null;
    if (t <= frames[0].at) return clonePose(frames[0].pose);
    var last = frames[frames.length - 1];
    if (t >= last.at) return clonePose(last.pose);
    for (var i = 0; i < frames.length - 1; i++) {
      var a = frames[i], b = frames[i + 1];
      if (t >= a.at && t < b.at) {
        return lerpPose(a.pose, b.pose, easeInOutCubic((t - a.at) / (b.at - a.at)));
      }
    }
    return clonePose(last.pose);
  }

  /* ---------------- Primitivas de animación ---------------- */

  var ANIM_TYPES = {
     /** Desplazamiento sinusoidal / respiración / escaneo de mirada */
    sine: function (a, t) {
      return a.amp * Math.sin(TAU * t / (a.period || 2000) + (a.phase || 0));
    },
     /** Escala rítmica: va Suavemente de 0 → amp y de vuelta */
    pulse: function (a, t) {
      return a.amp * 0.5 * (1 - Math.cos(TAU * t / (a.period || 1000) + (a.phase || 0)));
    },
     /** Pequeña sacudida aleatoria (múltiples senos como ruido pseudo); se atenúa a 0 en `decay` milisegundos */
    jitter: function (a, t, eng) {
      var s = t / 1000 * (a.speed || 8);
      var v = (Math.sin(s * 3.1 + eng._seed) +
               Math.sin(s * 5.7 + eng._seed * 2.3) +
               Math.sin(s * 9.3 + eng._seed * 4.1)) / 3 * a.amp;
      if (a.decay) v *= clamp(1 - t / a.decay, 0, 1);
      return v;
    },
     /** Onda triangular rápida de vaivén */
    scan: function (a, t) {
      var per = a.period || 800;
      var p = ((t + (a.phaseMs || 0)) % per) / per;
      var tri = p < 0.5 ? p * 4 - 1 : 3 - p * 4;
      return a.amp * tri;
    },
     /** Mirada dispersa: onda cuadrada suave, se detiene un momento en cada extremo antes de cambiar */
    glance: function (a, t) {
      var per = a.period || 3600;
      var ph = TAU * (((t + (a.phaseMs || 0)) % per) / per) + (a.phase || 0);
      return a.amp * Math.tanh(2.8 * Math.sin(ph));
    },
     /** Parpadeo periódico; la fase se superpone con la semilla aleatoria de cada instancia,
     *  de modo que múltiples instancias no parpadean sincronizadas */
    blink: function (a, t, eng) {
      var interval = a.interval || 3800, dur = a.dur || 200;
      var p = (t + (a.phaseMs || 0) + (eng ? eng._seed * 97 : 0)) % interval;
      if (p >= dur) return 0;
      return -(a.depth == null ? 1 : a.depth) * Math.sin(Math.PI * (p / dur));
    }
  };

  function applyAnim(pose, a, t, eng) {
    var fn = ANIM_TYPES[a.type];
    if (!fn) return;
    var v = fn(a, t, eng);
    var targets =
      a.target === 'eyes' ? [pose.left, pose.right] :
      a.target === 'body' ? [pose.body] :
      a.target === 'face' ? [pose.face] :
      a.target === 'left' ? [pose.left] :
      a.target === 'right' ? [pose.right] : [];
    for (var i = 0; i < targets.length; i++) {
      var tg = targets[i];
      if (a.prop === 'scale') {
        if (tg === pose.body) tg.scale += v;
        else { tg.scaleX += v; tg.scaleY += v; }
      } else if (a.prop in tg) {
        tg[a.prop] += v;
      }
    }
  }

  /* ---------------- Centro de registros de emociones (configuración original compartida por todos los personajes) ---------------- */

  var GROUPS = (window.EMOTION_GROUPS || [
    { key: 'life',    name: 'Ciclo de vida',     en: 'Lifecycle' },
    { key: 'emotion', name: 'Reacciones emocionales', en: 'Emotions' },
    { key: 'agent',   name: 'Estados de trabajo de IA', en: 'Agent States' },
    { key: 'custom',  name: 'Personalizado',     en: 'Custom' }
  ]).slice();

  var registry = new Map();   /* id → raw */
  var order = [];
  var enabledMap = {};        /* id → false solo para emociones deshabilitadas (setEnabled) */
  var configVersion = 0;

  /* Perfiles de parpadeo por emoción (blinkProfile / blinkS del preset):
   * los intervalos siguen viniendo de blinkMs; el perfil cambia la FORMA del parpadeo */
  var BLINK_PROFILES = {
    /* entrecierre parcial + ojeada lateral: pensando / evaluando */
    thinking: { depth: 0.7, glance: true },
    /* párpados pesados: caída lenta y recuperación perezosa (cansado / durmiente) */
    heavy:    { depth: 1, close: 240, pause: 160, rise: 520, settle: 380 },
    /* ráfagas cortas e irregulares: agitado / nervioso */
    nervous:  { depth: 0.9, close: 90, pause: 40, rise: 160, burstChance: 0.5 }
  };

  function knownGroup(g) {
    return GROUPS.some(function (x) { return x.key === g; });
  }

  function validate(raw) {
    var errs = [];
    if (!raw || typeof raw !== 'object') { errs.push('配置必须是对象'); return errs; }
    if (typeof raw.id !== 'string' || !raw.id.trim()) errs.push('缺少合法的字符串 id');
    if (typeof raw.name !== 'string' || !raw.name.trim()) errs.push('缺少 name');
    if (!knownGroup(raw.group)) errs.push('group 不合法：' + raw.group);
    if (raw.pool != null) {
      /* El nombre de la ranura permite contornos personalizados del personaje (eyeShapes);
       * aquí solo se comprueba el tipo, los nombres desconocidos se filtran por la familia
       * de anillos de ojos del personaje en normalizeFor */
      if (!Array.isArray(raw.pool)) errs.push('pool 必须是眼形槽位名数组');
      else raw.pool.forEach(function (s, i) {
        if (typeof s !== 'string') errs.push('pool[' + i + '] 必须是眼形槽位名字符串');
      });
    }
    if (raw.mouth != null && typeof raw.mouth !== 'string') {
      errs.push('mouth 必须是嘴形槽位名字符串');
    }
    if (raw.anims != null) {
      if (!Array.isArray(raw.anims)) errs.push('anims 必须是数组');
      else raw.anims.forEach(function (a, i) {
        if (!a || !ANIM_TYPES[a.type]) errs.push('anims[' + i + '] 未知动画类型：' + (a && a.type));
      });
    }
    if (raw.sequence != null && !Array.isArray(raw.sequence.frames)) {
      errs.push('sequence.frames 必须是数组');
    }
    if (raw.presets != null) {
      if (!Array.isArray(raw.presets)) errs.push('presets 必须是 arreglo de nombres de preset');
      else raw.presets.forEach(function (p, i) {
        if (typeof p !== 'string') errs.push('presets[' + i + '] debe ser string');
      });
    }
    if (raw.blinkProfile != null && !BLINK_PROFILES[raw.blinkProfile]) {
      errs.push('blinkProfile desconocido: ' + raw.blinkProfile);
    }
    return errs;
  }

  function register(raw) {
    var errs = validate(raw);
    if (errs.length) return { ok: false, id: raw && raw.id, errors: errs };
    if (!registry.has(raw.id)) order.push(raw.id);
    registry.set(raw.id, raw);
    configVersion++;
    return { ok: true, id: raw.id };
  }

  /* ---- Fusión de superposiciones de personajes: mezclar superficialmente los fragmentos emotions[id] del archivo del personaje a la configuración original ---- */
  function mergeRaw(base, over) {
    if (!over) return base;
    var out = Object.assign({}, base, over);
    if (base.body || over.body) out.body = Object.assign({}, base.body, over.body);
    if (base.face || over.face) out.face = Object.assign({}, base.face, over.face);
    if (base.eyes || over.eyes) {
      out.eyes = {};
      ['both', 'left', 'right'].forEach(function (k) {
        if ((base.eyes && base.eyes[k]) || (over.eyes && over.eyes[k])) {
          out.eyes[k] = Object.assign({}, base.eyes && base.eyes[k], over.eyes && over.eyes[k]);
        }
      });
    }
    return out;
  }

   /* ---- resolución de colores semánticos: '@token' → estados de la paleta del personaje / claves especiales ---- */
  function resolveColor(v, ch) {
    if (typeof v !== 'string' || v.charAt(0) !== '@') return v;
    var key = v.slice(1);
    if (key === 'eye') return ch.palette.eye;
    return ch.palette.states[key] || ch.palette.body;
  }
  function resolvePoseColors(pose, ch) {
    pose.body.color = resolveColor(pose.body.color, ch);
    pose.left.color = resolveColor(pose.left.color, ch);
    pose.right.color = resolveColor(pose.right.color, ch);
    return pose;
  }

   /** Normaliza una configuración de emoción para un personaje: fusión profunda de la pose base,
    *  pregenera la secuencia con frames completos.
   *  Presets: `presets: ['steady', …]` se expanden vía MM.config.preset() antes de normalizar.
   *  Parpadeo por emoción: blinkProfile 'thinking' (entrecierre + ojeada), 'heavy' (caída lenta),
   *  'nervous' (rafagas rápidas); sin perfil, parpadeo estándar con sobreimpulso al abrir. */
  function normalizeFor(raw, ch) {
    raw = mergeRaw(raw, ch.emotions && ch.emotions[raw.id]);
    if (Array.isArray(raw.presets) && raw.presets.length) raw = applyPresets(raw);
    var base = resolvePoseColors(applySpec(defaultPose(), raw), ch);
    var pool = (raw.pool || ['calm', 'calm2']).filter(function (s) { return ch.eyeFamily[s]; });
    if (!pool.length) pool = ['calm'];
    var def = {
      id: raw.id, name: raw.name, group: raw.group,
      desc: raw.desc || '',
      en: raw.en || null,
      gaze: raw.gaze !== false,
      transition: raw.transition != null ? raw.transition : 500,
      pool: pool,
      poolMs: raw.poolMs || [9000, 16000],
      poolSpeed: raw.poolSpeed || 6,
      blinkMs: raw.blinkMs !== undefined ? raw.blinkMs : [6000, 14000],
      openness: raw.openness != null ? raw.openness : 1,
      antics: !!raw.antics,
      blinkProfile: BLINK_PROFILES[raw.blinkProfile] ? raw.blinkProfile : null,
      mouth: raw.mouth && ch.mouthShapes[raw.mouth] ? raw.mouth : 'flat',
      base: base,
      anims: (raw.anims || []).map(function (a) { return Object.assign({}, a); }),
      sequence: null,
      raw: raw
    };
    if (raw.sequence) {
      var frames = raw.sequence.frames.map(function (f) {
        return { at: f.at || 0, pose: resolvePoseColors(applySpec(clonePose(base), f), ch) };
      }).sort(function (x, y) { return x.at - y.at; });
      def.sequence = { frames: frames, settle: raw.sequence.settle || 'base' };
    }
    return def;
  }

  /* ---------------- Presets nombrados (`presets: ['steady', …]`) ----------------
   * Reducen la definición de emociones a lo esencial: un preset aporta ritmo de rotación,
   * parpadeo, respiración y — si se declara `blinkS` — el perfil de parpadeo por emoción. */

  var PRESETS = {
    steady:  { poolMs: [9000, 16000], blinkMs: [6000, 14000], breathe: 0.010 },
    calm:    { poolMs: [7000, 12000], blinkMs: [5000, 11000], breathe: 0.010 },
    slow:    { poolMs: [12000, 20000], blinkMs: [8000, 16000], breathe: 0.006, blinkS: 'heavy' },
    lively:  { poolMs: [2500, 4500], blinkMs: [2500, 5000], breathe: 0.014, antics: true },
    jumpy:   { poolMs: [1400, 2600], blinkMs: [1600, 3500], breathe: 0.008, poolSpeed: 9 },
    nervous: { poolMs: [900, 1800], blinkMs: [1200, 2600], breathe: 0.006, blinkS: 'nervous' },
    focused: { poolMs: [1800, 3200], blinkMs: [2800, 5500], breathe: 0.004 },
    sleepy:  { poolMs: [4000, 8000], blinkMs: null, breathe: 0.005, blinkS: 'heavy' },
    thinking:{ poolMs: [2000, 3600], blinkMs: [3500, 7000], breathe: 0.010, blinkS: 'thinking' }
  };

  function applyPresets(raw) {
    var out = Object.assign({}, raw);
    var anims = (raw.anims || []).slice();
    raw.presets.forEach(function (pname) {
      var p = PRESETS[pname];
      if (!p) { console.warn('[MoodMates] preset desconocido: ' + pname); return; }
      if (out.poolMs == null && p.poolMs) out.poolMs = p.poolMs.slice();
      if (raw.blinkMs === undefined && p.blinkMs !== undefined) out.blinkMs = p.blinkMs === null ? null : p.blinkMs.slice();
      if (out.poolSpeed == null && p.poolSpeed) out.poolSpeed = p.poolSpeed;
      if (out.antics == null && p.antics) out.antics = true;
      if (out.blinkProfile == null && p.blinkS) out.blinkProfile = p.blinkS;
      if (p.breathe && !(anims.length && anims[0].isBreathe)) {
        anims.unshift({ target: '_breathe', prop: 'scale', type: 'sine', amp: p.breathe, period: 3600, isBreathe: true });
      }
    });
    out.anims = anims.filter(function (a) { return !a.isBreathe; });
    delete out.presets;
    return out;
  }

  MM.config = {
    register: register,
    /** Registra / sobrescribe un preset nombrado utilizable en `presets: [...]` */
    registerPreset: function (name, spec) {
      if (!name || typeof name !== 'string' || !spec || typeof spec !== 'object') {
        return { ok: false, errors: ['registerPreset requiere (nombre, objeto)'] };
      }
      PRESETS[name] = Object.assign({}, PRESETS[name] || {}, spec);
      configVersion++;
      return { ok: true, name: name };
    },
    preset: function (name) { return PRESETS[name] ? Object.assign({}, PRESETS[name]) : null; },
    presets: function () { return Object.keys(PRESETS); },
    getRaw: function (id) { return registry.get(id) || null; },
    isEnabled: function (id) { return enabledMap[id] !== false; },
    /** Deshabilita una emoción sin borrarla: desaparece de list()/tours; setEmotion cae en respaldo */
    setEnabled: function (id, on) {
      if (!registry.has(id)) return { ok: false, id: id, errors: ['Emoción no registrada: ' + id] };
      if (on === false) enabledMap[id] = false; else delete enabledMap[id];
      configVersion++;
      return { ok: true, id: id, enabled: on !== false };
    },
    enabledIds: function () {
      return order.filter(function (id) { return enabledMap[id] !== false; });
    },
    list: function (group) {
      return order.map(function (id) { return registry.get(id); })
        .filter(function (d) { return enabledMap[d.id] !== false; })
        .filter(function (d) { return !group || d.group === group; });
    },
    groups: function () {
      return GROUPS.map(function (g) { return { key: g.key, name: g.name, en: g.en || g.name }; });
    },
    version: function () { return configVersion; },
    exportConfig: function () {
      return JSON.stringify(order.map(function (id) { return registry.get(id); }), null, 2);
    },
    importConfig: function (json) {
      var data;
      try {
        data = typeof json === 'string' ? JSON.parse(json) : json;
      } catch (e) {
        return { ok: false, added: 0, errors: ['Error al analizar JSON: ' + e.message] };
      }
      /* Formato emotions.json: array de emociones O objeto { presets, emotions } */
      var added = 0, errors = [];
      var presets = null, arr;
      if (Array.isArray(data)) arr = data;
      else if (data && Array.isArray(data.emotions)) { arr = data.emotions; presets = data.presets || null; }
      else arr = [data];
      if (presets) {
        Object.keys(presets).forEach(function (pn) {
          MM.config.registerPreset(pn, presets[pn]);
        });
      }
      arr.forEach(function (raw) {
        if (raw && raw.enabled === false) enabledMap[raw.id] = false;
        var r = register(raw);
        if (r.ok) added++;
        else errors.push('[' + ((raw && raw.id) || '?') + '] ' + r.errors.join('; '));
      });
      return { ok: errors.length === 0, added: added, errors: errors };
    },
    /** Carga el catálogo externo data/emotions.json (nunca rechaza):
     *  Promise<{ ok, added, errors }> — ante red/parse/validación inválida devuelve errores
     *  y el motor sigue funcionando con el seed embebido. */
    loadFromUrl: function (url) {
      return fetch(url)
        .then(function (res) {
          if (!res.ok) return { ok: false, added: 0, errors: ['HTTP ' + res.status + ' al cargar ' + url] };
          return res.text().then(function (txt) { return MM.config.importConfig(txt); });
        })
        .catch(function (e) {
          return { ok: false, added: 0, errors: ['No se pudo cargar ' + url + ': ' + e.message] };
        });
    }
  };

  /* ---------------- Reloj rAF global compartido (un solo bucle para múltiples instancias) ---------------- */

  var ticker = {
    set: new Set(),
    raf: 0,
    add: function (e) {
      this.set.add(e);
      if (!this.raf) this.raf = requestAnimationFrame(ticker.loop);
    },
    remove: function (e) { this.set.delete(e); },
    loop: function (now) {
      ticker.raf = 0;
      ticker.set.forEach(function (e) { e._tick(now); });
      if (ticker.set.size) ticker.raf = requestAnimationFrame(ticker.loop);
    }
  };

  /* ---------------- EmotionEngine ---------------- */

  function Engine(target, opts) {
    opts = opts || {};
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) throw new Error('MoodMates.create: no se encontró el contenedor');

    var chId = opts.character || MM.characters.defaultId();
    var ch = MM.characters.get(chId, opts.variant);
    if (!ch) throw new Error('MoodMates.create: no se ha registrado ningún personaje (cargue primero src/characters/*.js)');
    this.character = ch;

    this.ball = window.createBall(el, Object.assign({}, opts, {
      character: ch,
      lite: opts.lite != null ? opts.lite : opts.autostart === false
    }));
    this._seed = Math.random() * 100;
    this._events = {};
    this._gaze = { x: 0, y: 0, tx: 0, ty: 0 };
    this._style = { sketch: 0 };
    this._theme = opts.color
      ? { body: opts.color, eyes: opts.eyeColor || '#FFFFFF' }
      : null;
    this._eyeScale = opts.eyeScale || 1;
    this._lastTick = 0;
    this._spin = null;

    /* ---- opciones de animación (documentadas en docs/INTEGRATION.md) ---- */
    /* layered: transiciones en capas rubor → cejas → ojos → boca (desfase por grupo de rasgos);
       saccades: mirada sacádica (saltos + pausa); false = seguimiento suavizado exponencial */
    this._layered = opts.layered !== false;
    this._saccades = opts.saccades !== false;
    this._sac = { x: 0, y: 0, next: 0 };

    /* ---- caché de definiciones de emoción normalizadas para este personaje ---- */
    this._defs = new Map();
    this._defsVersion = -1;

    /* ---- sistema de deformación del anillo ocular (impulsado por ranuras) ---- */
    var calm = ch.eyeFamily.calm;
    this._ringSrc = [calm[0], calm[1]];
    this._ringDst = [calm[0], calm[1]];
    this._ringCur = this._ringDst;
    this._ringSpring = spring(1);
    this._ringSpeed = 7;
    this._exprSlot = 'calm';
    this._poolPos = 0;
    this._poolNext = 0;

     /* ---- subsistema de deformación de la boca ---- */
    var flat = ch.mouthShapes.flat;
    this._mouthSrc = flat;
    this._mouthDst = flat;
    this._mouthCur = flat;
    this._mouthSpring = spring(1);
    this._mouthSlot = 'flat';
    this._mouthHoldUntil = 0;

     /* ---- sistema de parpadeo ---- */
    this._open = spring(1);
    this._blinkQ = [];
    this._blinkNext = Infinity;
     /* ---- movimientos ocasionales de espera ---- */
    this._anticNext = 0;
    this._bounceAt = -1;

    this._def = null;
    this._lastPose = null;
    this._prevPose = null;
    this._transStart = 0;
    this._transDur = 0;
    this._emoStart = 0;
    this._seq = null;
    this._clickSeq = null;
    this._active = false;
    this._touring = false;
    this._tourTimer = 0;
    this._fallbackId = opts.fallbackId || FALLBACK_ID;
    this._lastActivity = performance.now();

    if (opts.idle) {
      this._idle = Object.assign(
        { standbyAfter: 60000, sleepAfter: 180000, standbyId: '02', sleepId: '00' },
        opts.idle === true ? {} : opts.idle
      );
    } else {
      this._idle = null;
    }

    this.setEmotion(opts.emotion || this._fallbackId, { auto: true });
    if (opts.autostart !== false) this.setActive(true);
    else this.renderStatic();
  }

  Engine.prototype = {

    /* ---------- eventos ---------- */
    on: function (evt, cb) {
      (this._events[evt] = this._events[evt] || []).push(cb);
      return this;
    },
    off: function (evt, cb) {
      var list = this._events[evt];
      if (list) {
        var i = list.indexOf(cb);
        if (i >= 0) list.splice(i, 1);
      }
      return this;
    },
    _emit: function (evt, payload) {
      (this._events[evt] || []).slice().forEach(function (cb) {
        try { cb(payload); } catch (e) { console.error(e); }
      });
    },

    get emotionId() { return this._def ? this._def.id : null; },
    get touring() { return this._touring; },

    /** Obtiene la definición de emoción normalizada para este personaje (con caché invalidada por versión) */
    _getDef: function (id) {
      if (this._defsVersion !== MM.config.version()) {
        this._defs.clear();
        this._defsVersion = MM.config.version();
      }
      if (this._defs.has(id)) return this._defs.get(id);
      var raw = MM.config.getRaw(id);
      if (!raw) return null;
      var def = normalizeFor(raw, this.character);
      this._defs.set(id, def);
      return def;
    },

    /* ---------- núcleo: cambiar emoción (con valor de respaldo) ---------- */
    setEmotion: function (id, o) {
      o = o || {};
      var def = this._getDef(id);
      if (!def) {
        console.warn('[MoodMates] emoción ID desconocida "' + id + '", recayendo en espera (' + this._fallbackId + ')');
        this._emit('error', { message: 'Emoción ID desconocida "' + id + '", recuperación a espera', id: id });
        def = this._getDef(this._fallbackId);
        if (!def) return false;
      }
      var now = performance.now();
      this._clickSeq = null;
      var prevId = this._def ? this._def.id : null;
      this._prevPose = this._lastPose ? clonePose(this._lastPose) : null;
      this._def = def;
      this._emoStart = now;
      this._transStart = now;
      this._transDur = this._prevPose ? def.transition : 0;
      this._seq = def.sequence
        ? { frames: def.sequence.frames, settle: def.sequence.settle, done: false }
        : null;
      if (!o.auto) this._lastActivity = now;

      this._poolPos = 0;
      this._mouthHoldUntil = 0;
      /* Transiciones en capas (layered): la pose base / rubor viaja con el lerp global,
       * pero ojos y boca entran desfasados (~80 ms de retraso entre grupos) para que el
       * cambio se lea como un gesto natural escalonado, no como un corte sincronizado */
      if (this._layered && prevId !== null && prevId !== def.id && !def.sequence) {
        var self = this;
        setTimeout(function () {
          if (self._def === def) self._setExpr(def.pool[0], def.poolSpeed >= 10 ? 10 : 8);
        }, 70);
        setTimeout(function () {
          if (self._def === def) self._setMouth(def.mouth, 8);
        }, 150);
      } else {
        this._setExpr(def.pool[0], def.poolSpeed >= 10 ? 10 : 8);
        this._setMouth(def.mouth, 8);
      }
      this._poolNext = now + rand(def.poolMs[0], def.poolMs[1]);
      if (prevId !== null && prevId !== def.id && def.blinkMs) this._blinkNow(now);
      this._blinkNext = def.blinkMs ? now + rand(def.blinkMs[0], def.blinkMs[1]) : Infinity;
      this._anticNext = now + rand(2500, 5000);

      this._emit('change', { id: def.id, def: def, auto: !!o.auto });
      /* spinFx / confetti son eventos únicos al entrar en una emoción.
        * La firma completa (burbujas de nube) es una escena completa, no se superpone confeti;
        * Twinkle u otros siguen con firma + cuerpo + confeti; sin firma, usar giro de respaldo */
      if (this._active) {
        var fx = def.base.body;
        var signed = false;
        if (fx.spinFx > 0) {
          signed = this.signature(fx.spinFx >= 1 ? 1 : 0.7);
          if (!signed) this.spin(fx.spinFx >= 1 ? 2 : 1);
        }
        if (fx.confetti > 0 && !(signed && this.ball.signatureComplete)) this.burst(20);
      }
      if (!this._active) this.renderStatic();
      return true;
    },

    /** Entrada de conexión de IA: acepta objeto o string JSON { emotionId, tips } */
    handleAIMessage: function (msg) {
      var obj = msg;
      if (typeof msg === 'string') {
        try { obj = JSON.parse(msg); }
        catch (e) {
          this._emit('error', { message: 'Error al analizar JSON del mensaje de IA, recayendo en espera', raw: msg });
          this.setEmotion(this._fallbackId);
          return false;
        }
      }
      if (!obj || typeof obj !== 'object' || typeof obj.emotionId !== 'string') {
        this._emit('error', { message: 'El mensaje de IA carece del campo emotionId, recayendo en espera', raw: msg });
        this.setEmotion(this._fallbackId);
        return false;
      }
      var ok = this.setEmotion(obj.emotionId);
      if (obj.tips) this._emit('tips', { text: String(obj.tips) });
      return ok;
    },

    /* ---------- recorrido automático ---------- */
    startTour: function (ids, interval) {
      this.stopTour();
      if (ids) ids = ids.filter(function (id) { return MM.config.isEnabled(id); });
      if (!ids || !ids.length) ids = MM.config.enabledIds();
      if (!ids.length) return;
      interval = interval || 2500;
      this._touring = true;
      var self = this, i = 0;
      this.setEmotion(ids[0], { auto: true });
      this._tourTimer = setInterval(function () {
        i = (i + 1) % ids.length;
        self.setEmotion(ids[i], { auto: true });
      }, interval);
    },
    stopTour: function () {
      if (this._tourTimer) { clearInterval(this._tourTimer); this._tourTimer = 0; }
      this._touring = false;
      this._lastActivity = performance.now();
    },

    resetIdle: function () { this._lastActivity = performance.now(); },

    /* Punto de mira: desviación horizontal ±24, vertical ±15 (coordenadas viewBox) */
    setGaze: function (nx, ny) {
      this._gaze.tx = clamp(nx, -1, 1) * 24;
      this._gaze.ty = clamp(ny, -1, 1) * 15;
      return this;
    },
    clearGaze: function () {
      this._gaze.tx = 0;
      this._gaze.ty = 0;
      return this;
    },
    setStyle: function (style) {
      Object.assign(this._style, style || {});
      if (!this._active) this.renderStatic();
      return this;
    },

    /* Giro (interacción de clic): giro elástico de múltiples vueltas completas,
     * al alcanzar la velocidad el sistema de efectos lanza partículas */
    spin: function (turns, dir) {
      if (this._spin) return this;
      var d = dir || (Math.random() < 0.5 ? -1 : 1);
      this._spin = { x: 0, v: 0, t: Math.max(1, Math.round(turns || 1)) * TAU * d };
      return this;
    },
    /* Lluvia de confeti: explosión única de partículas físicas */
    burst: function (count) {
      if (this.ball.burst) this.ball.burst(count);
      return this;
    },
    /* Acción de firma: interacción específica del personaje (burbuja de nube / estallido estelar)
     * Devuelve false si este tema no tiene acción de firma */
    signature: function (strength) {
      var ok = this.ball.signature ? !!this.ball.signature(strength) : false;
      /* El tema puede declarar signatureMouth: forma de boca temporal al activar la firma,
       * al expirar vuelve a la forma de boca actual de la emoción */
      if (ok && this.ball.signatureMouth) {
        this._mouthHoldUntil = performance.now() + (this.ball.signatureMouthMs || 1400);
        this._setMouth(this.ball.signatureMouth, 10);
      }
      return ok;
    },
    /* Celebración de clic: no cambia la emoción del catálogo.
     * Si tiene celebrateBeat, superpone un pequeño fragmento facial;
     * firma completa no vuelve a superponer giro / lluvia de confeti,
     * el resto sigue con firma + cuerpo aleatorio + lluvia de confeti */
    celebrate: function (strength) {
      var s = strength == null ? 1 : strength;
      this._playCelebrateBeat();
      var signed = this.signature(s);
      if (signed && this.ball.signatureComplete) return this;
      var r = Math.random();
      if (r < 0.5) this.spin(1);
      else if (r < 0.85) this.bounce();
      this.burst(Math.round(10 + 8 * s));
      return this;
    },
    /* Expresión facial de celebración de clic: pose temporal, se reproduce y vuelve a la emoción actual, sin cambiar emotionId */
    _playCelebrateBeat: function () {
      var beat = this.character && this.character.celebrateBeat;
      if (!beat || !beat.frames || !beat.frames.length) return;
      var ch = this.character;
      var frames = beat.frames.map(function (f) {
        return { at: f.at || 0, pose: resolvePoseColors(applySpec(defaultPose(), f), ch) };
      }).sort(function (x, y) { return x.at - y.at; });
      var now = performance.now();
      this._clickSeq = { start: now, frames: frames, fade: beat.fade != null ? beat.fade : 280 };
      var expr = beat.expr && ch.eyeFamily[beat.expr] ? beat.expr : 'happy';
      var mouth = beat.mouth && ch.mouthShapes[beat.mouth] ? beat.mouth : 'grin';
      this._setExpr(expr, 10);
      this._setMouth(mouth, 10);
      this._mouthHoldUntil = now + frames[frames.length - 1].at + this._clickSeq.fade;
    },
    _applyClickBeat: function (basePose, now) {
      var seq = this._clickSeq;
      if (!seq) return null;
      var t = now - seq.start;
      var frames = seq.frames;
      var last = frames[frames.length - 1];
      var fade = seq.fade;
      if (t >= last.at + fade) {
        this._clickSeq = null;
        if (this._def) {
          this._setMouth(this._def.mouth, 8);
          this._setExpr(this._def.pool[this._poolPos] || this._def.pool[0], 8);
        }
        return null;
      }
      var beat = t >= last.at ? last.pose : sampleFrameList(frames, t);
      var out = t >= last.at
        ? lerpPose(beat, basePose, easeInOutCubic((t - last.at) / fade))
        : beat;
      out.left.ring = basePose.left.ring;
      out.right.ring = basePose.right.ring;
      out.face.mouthRing = basePose.face.mouthRing;
      return out;
    },
    /* Rebote (4 segmentos de parábola decreciente) */
    bounce: function () {
      if (this._bounceAt < 0) this._bounceAt = performance.now();
      return this;
    },

    /* Cambio de ranura del anillo ocular: congelar la interpolación actual como nuevo origen,
     * el resorte empieza desde 0 y se dirige hacia 1 */
    _setExpr: function (slot, speed) {
      if (slot === this._exprSlot && this._ringSpring.x >= 0.999) return;
      var pair = this.character.eyeFamily[slot];
      if (!pair) return;
      var s = clamp(this._ringSpring.x, 0, 1);
      this._ringSrc = [
        lerpRing(this._ringSrc[0], this._ringDst[0], s),
        lerpRing(this._ringSrc[1], this._ringDst[1], s)
      ];
      this._ringDst = [pair[0], pair[1]];
      this._ringSpring.x = 0;
      this._ringSpring.v = 0;
      this._ringSpring.t = 1;
      this._ringSpeed = speed || 7;
      this._exprSlot = slot;
    },

    /* Cambio de ranura de la boca (misma lógica que el anillo ocular) */
    _setMouth: function (slot, speed) {
      if (slot === this._mouthSlot && this._mouthSpring.x >= 0.999) return;
      var ring = this.character.mouthShapes[slot];
      if (!ring) return;
      var s = clamp(this._mouthSpring.x, 0, 1);
      this._mouthSrc = lerpRing(this._mouthSrc, this._mouthDst, s);
      this._mouthDst = ring;
      this._mouthSpring.x = 0;
      this._mouthSpring.v = 0;
      this._mouthSpring.t = 1;
      this._mouthSlot = slot;
    },

    /* Parpadeo: estándar = cerrar → pausa 70ms → abrir a 1.08 (sobrepaso) → 300ms volver a 1.
     * Con blinkProfile activo cambia la FORMA del parpadeo según la emoción:
     *   thinking → entrecierre parcial + micro-ojeada lateral durante el cierre
     *   heavy    → párpados pesados: caída lenta, pausa larga, recuperación perezosa
     *   nervous  → ráfagas cortas e irregulares */
    _blinkNow: function (t) {
      var pr = (this._def && this._def.blinkProfile) ? BLINK_PROFILES[this._def.blinkProfile] : null;
      if (!pr) {
        this._blinkQ.push(
          { at: t, v: 0.05 }, { at: t + 70, v: 0.05 },
          { at: t + 150, v: 1.08 }, { at: t + 300, v: 1 }
        );
        if (Math.random() < 0.14) {
          this._blinkQ.push({ at: t + 370, v: 0.05 }, { at: t + 480, v: 1 });
        }
        return;
      }
      var d = pr.depth == null ? 1 : pr.depth;
      var vC = 0.05 + (1 - d) * 0.9;               /* profundidad de cierre (entrecierre si d<1) */
      var close = pr.close || 120, pause = pr.pause || 70, rise = pr.rise || 150;
      this._blinkQ.push(
        { at: t, v: vC }, { at: t + close, v: vC },
        { at: t + close + pause, v: 1.06 }, { at: t + close + pause + rise, v: 1 }
      );
      if (pr.glance) {
        /* pensando: ojeada lateral mientras el párpado está entornado */
        this._gaze.tx += rand(-6, 6);
      }
      if (pr.settle) {
        /* heavy: segunda caída perezosa antes de asentarse del todo */
        var s2 = t + close + pause + rise;
        this._blinkQ.push(
          { at: s2 + pr.settle * 0.4, v: vC + (1 - vC) * 0.45 },
          { at: s2 + pr.settle, v: 1 }
        );
      }
      if (pr.burstChance && Math.random() < pr.burstChance) {
        /* nervous: refugio de ráfaga tras el primer parpadeo */
        var b2 = t + close + pause + rise + 90;
        this._blinkQ.push({ at: b2, v: vC }, { at: b2 + 80, v: 1 });
      }
    },

    registerEmotion: function (raw) { return MM.config.register(raw); },

    /* ---------- ciclo de vida ---------- */
    setActive: function (on) {
      if (on === this._active) return;
      this._active = on;
      if (on) ticker.add(this);
      else ticker.remove(this);
    },
    replay: function () {
      if (this._def) this.setEmotion(this._def.id, { auto: true });
    },
    /** Renderiza estáticamente un fotograma */
    renderStatic: function () {
      this._transDur = 0;
      this._ringSpring.x = 1;
      this._ringSpring.v = 0;
      this._mouthSpring.x = 1;
      this._mouthSpring.v = 0;
      this._open.x = this._def ? this._def.openness : 1;
      this._open.v = 0;
      var seq = this._seq;
      this._seq = null;
      this._tick(performance.now());
      this._seq = seq;
    },
    destroy: function () {
      this.stopTour();
      this.setActive(false);
      this._events = {};
      this.ball.destroy();
    },

    /* ---------- por fotograma ---------- */
    _tick: function (now) {
      this._dt = this._lastTick ? clamp((now - this._lastTick) / 1000, 0.001, 0.05) : 1 / 60;
      this._lastTick = now;
      if (this._idle && !this._touring) this._checkIdle(now);
      var pose = this._compose(now, 0);
      this.ball.applyPose(pose);
      this._lastPose = pose;
    },

    _checkIdle: function (now) {
      var idle = this._idle;
      var elapsed = now - this._lastActivity;
      var cur = this.emotionId;
      if (elapsed >= idle.sleepAfter) {
        if (cur !== idle.sleepId) this.setEmotion(idle.sleepId, { auto: true });
      } else if (elapsed >= idle.standbyAfter) {
        if (cur !== idle.standbyId && cur !== idle.sleepId) {
          this.setEmotion(idle.standbyId, { auto: true });
        }
      }
    },

    /** Compone la pose del fotograma actual: base → secuencia → animadores → interpolación de transición */
    _compose: function (now, depth) {
      var def = this._def;
      var t = now - this._emoStart;
      var pose;

      if (this._seq) {
        var res = this._seqPose(t, now);
        if (res === 'switch') {
          return depth < 4 ? this._compose(now, depth + 1) : clonePose(this._def.base);
        }
        pose = res || clonePose(def.base);
      } else {
        pose = clonePose(def.base);
      }

      /* respiración incorporada: fase con tiempo absoluto, sin saltos al cambiar de emoción */
      var br = pose.body.breathe || 0;
      if (br) {
        var ph = TAU * now / 3600;
        pose.body.scale += br * Math.sin(ph);
        pose.body.y += br * 55 * Math.sin(ph + 0.6);
      }

      for (var i = 0; i < def.anims.length; i++) applyAnim(pose, def.anims[i], t, this);

      var dt = this._dt || 1 / 60;

      /* ---- rotación del grupo de ojos ---- */
      if (this._active && now >= this._poolNext) {
        if (def.pool.length > 1) {
          this._poolPos = (this._poolPos + 1 + Math.floor(rand(0, def.pool.length - 1))) % def.pool.length;
          this._setExpr(def.pool[this._poolPos], def.poolSpeed);
        }
        this._poolNext = now + rand(def.poolMs[0], def.poolMs[1]);
      }

      /* ---- programación de parpadeos ---- */
      if (this._active && def.blinkMs && now >= this._blinkNext) {
        this._blinkNow(now);
        this._blinkNext = now + rand(def.blinkMs[0], def.blinkMs[1]);
      }
      var openKey = null;
      while (this._blinkQ.length && now >= this._blinkQ[0].at) {
        openKey = this._blinkQ[0].v;
        this._blinkQ.shift();
      }
      this._open.t = openKey != null ? openKey : (this._blinkQ.length ? this._open.t : def.openness);

      /* ---- movimientos ocasionales de espera: prioridad a la firma del personaje (versión ligera),
           sin firma se usa giro genérico ---- */
      if (this._active && def.antics && now >= this._anticNext) {
        if (!this._spin && this._bounceAt < 0) {
          var pick = Math.random();
          if (pick < 0.45) {
            if (!this.signature(0.55)) this.spin(1);
          }
          else if (pick < 0.8) this.bounce();
          else this._blinkNow(now);
        }
        this._anticNext = now + rand(9000, 18000);
      }

      /* La forma de boca de la firma caduca: volver a la ranura actual (el cambio de emoción ya reinició el hold, no se mezclarán bocas) */
      if (this._mouthHoldUntil && now >= this._mouthHoldUntil) {
        this._mouthHoldUntil = 0;
        this._setMouth(def.mouth, 8);
      }

      /* ---- pasos de resorte (subpasos 1/120): deformación de ojos / boca / apertura / giro ---- */
      var steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      var j = dt / steps;
      for (var si = 0; si < steps; si++) {
        springStep(this._ringSpring, this._ringSpeed, 1, j);
        springStep(this._mouthSpring, 9, 1, j);
        springStep(this._open, 26, 1, j);
        if (this._spin) {
          springStep(this._spin, 6.2, 1, j);
          if (Math.abs(this._spin.t - this._spin.x) < 0.01 && Math.abs(this._spin.v) < 0.05) {
            this._spin = null;
          }
        }
      }
      pose.body.yaw = this._spin ? this._spin.x : 0;

      /* ---- Desplazamiento de rebote ---- */
      if (this._bounceAt >= 0) {
        var be = (now - this._bounceAt) / 1000;
        if (be >= BOUNCE_TOTAL) {
          this._bounceAt = -1;
        } else {
          var acc = 0, bi = 0;
          while (bi < BOUNCE_SEGS.length && be >= acc + BOUNCE_SEGS[bi].d) { acc += BOUNCE_SEGS[bi].d; bi++; }
          var seg = BOUNCE_SEGS[Math.min(bi, BOUNCE_SEGS.length - 1)];
          var bn = (be - acc) / seg.d;
          pose.body.y += -4 * seg.h * bn * (1 - bn);
        }
      }

      /* ---- anillo ocular / boca actual: interpolación deformada punto a punto,
         cuando se detiene reutiliza la referencia del objetivo ---- */
      if (this._ringSpring.x < 0.999 || this._ringSpring.v > 0.001 || this._ringSpring.v < -0.001) {
        var rs = clamp(this._ringSpring.x, 0, 1.35);
        this._ringCur = [
          lerpRing(this._ringSrc[0], this._ringDst[0], rs),
          lerpRing(this._ringSrc[1], this._ringDst[1], rs)
        ];
      } else if (this._ringCur !== this._ringDst) {
        this._ringCur = this._ringDst;
      }
      pose.left.ring = this._ringCur[0];
      pose.right.ring = this._ringCur[1];

      if (this._mouthSpring.x < 0.999 || Math.abs(this._mouthSpring.v) > 0.001) {
        var ms = clamp(this._mouthSpring.x, 0, 1.25);
        this._mouthCur = lerpRing(this._mouthSrc, this._mouthDst, ms);
      } else if (this._mouthCur !== this._mouthDst) {
        this._mouthCur = this._mouthDst;
      }
      pose.face.mouthRing = this._mouthCur;

      /* Mirada: con saccades activos el ojo salta a micro-destinos (transición casi
       * instantánea + sobreimpulso ~4% + fijación), imitando el movimiento sacádico real;
       * sin ellos, suavizado exponencial independiente de la tasa de fotogramas */
      var gx = def.gaze !== false ? this._gaze.tx : 0;
      var gy = def.gaze !== false ? this._gaze.ty : 0;
      if (this._saccades && this._active && def.gaze !== false) {
        if (now >= this._sac.next) {
          var baseX = gx || 0, baseY = gy || 0;
          this._sac.x = baseX + rand(-7, 7);
          this._sac.y = baseY + rand(-4, 4);
          this._sac.next = now + rand(260, 900);
          this._sac.over = 1;                      /* flag de fase de sobreimpulso */
        }
        var ks = 1 - Math.exp(-26 * dt);           /* muy rápido ≈ salto sacádico */
        this._gaze.x += (this._sac.x - this._gaze.x) * ks;
        this._gaze.y += (this._sac.y - this._gaze.y) * ks;
        if (this._sac.over && Math.abs(this._sac.x - this._gaze.x) < 0.6) {
          this._gaze.x += (this._sac.x - gx > 0 ? 1 : -1) * 0.9;   /* micro-overshoot ~4% */
          this._sac.over = 0;
        }
      } else {
        var k = 1 - Math.exp(-5.66 * dt);
        this._sac.x = gx; this._sac.y = gy;
        this._gaze.x += (gx - this._gaze.x) * k;
        this._gaze.y += (gy - this._gaze.y) * k;
      }
      pose.left.lookX += this._gaze.x;
      pose.right.lookX += this._gaze.x;
      pose.left.lookY += this._gaze.y;
      pose.right.lookY += this._gaze.y;
      pose.face.mouthX += this._gaze.x * 0.35;
      pose.face.mouthY += this._gaze.y * 0.28;

      /* micro-desplazamiento constante de la mirada */
      if (def.gaze !== false) {
        var w = now / 1000;
        pose.left.lookX += 1.4 * Math.sin(0.42 * w) + 0.5 * Math.sin(1.0 * w);
        pose.right.lookX += 1.4 * Math.sin(0.42 * w + 1) + 0.5 * Math.sin(1.0 * w + 2);
        pose.left.lookY += 0.9 * Math.sin(0.58 * w);
        pose.right.lookY += 0.9 * Math.sin(0.58 * w + 1);
      }

      /* Escalar ojos en instancias pequeñas */
      if (this._eyeScale !== 1) {
        pose.left.scaleX *= this._eyeScale;
        pose.left.scaleY *= this._eyeScale;
        pose.right.scaleX *= this._eyeScale;
        pose.right.scaleY *= this._eyeScale;
        pose.face.mouthSX *= this._eyeScale;
        pose.face.mouthSY *= this._eyeScale;
      }

      /* Color del tema de la instancia (team mate): el color corporal es siempre el color del tema,
         los ojos solo cubren el color por defecto */
      if (this._theme) {
        pose.body.color = this._theme.body;
        var chEye = this.character.palette.eye;
        if (pose.left.color === chEye) pose.left.color = this._theme.eyes;
        if (pose.right.color === chEye) pose.right.color = this._theme.eyes;
      }

      /* apertura = valor base de configuración × resorte de parpadeo */
      var openS = clamp(this._open.x, 0.02, 1.5);
      pose.left.open = clamp(pose.left.open, 0, 1.3) * openS;
      pose.right.open = clamp(pose.right.open, 0, 1.3) * openS;
      pose.left.scaleX = Math.max(pose.left.scaleX, 0.05);
      pose.left.scaleY = Math.max(pose.left.scaleY, 0.05);
      pose.right.scaleX = Math.max(pose.right.scaleX, 0.05);
      pose.right.scaleY = Math.max(pose.right.scaleY, 0.05);

      /* interpolación de transición de cambio de emoción */
      var tt = now - this._transStart;
      if (this._transDur > 0 && tt < this._transDur && this._prevPose) {
        var mouthRing = pose.face.mouthRing;
        pose = lerpPose(this._prevPose, pose, easeInOutCubic(tt / this._transDur));
        pose.face.mouthRing = mouthRing;   /* la deformación del anillo la gestiona el resorte, no participa en la interpolación de poses */
        pose.left.ring = this._ringCur[0];
        pose.right.ring = this._ringCur[1];
      }
      if (this._clickSeq) {
        var mixed = this._applyClickBeat(pose, now);
        if (mixed) pose = mixed;
      }
      /* El modo boceto es un interruptor de visualización, no un fotograma clave.
         Se escribe superpuesto después de superponer caras / transiciones, evitando residuos de lerp */
      pose.body.sketch = this._style.sketch ? 1 : 0;
      return pose;
    },

    /** Muestreo de la secuencia; al finalizar procesa según settle (hold / base / next) */
    _seqPose: function (t, now) {
      var seq = this._seq;
      var frames = seq.frames;
      var last = frames[frames.length - 1];

      if (t >= last.at) {
        if (!seq.done) {
          seq.done = true;
          var s = seq.settle;
          if (s === 'base') {
            this._prevPose = this._lastPose ? clonePose(this._lastPose) : clonePose(last.pose);
            this._transStart = now;
            this._transDur = this._def.transition || 500;
            this._seq = null;
            return null;
          }
          if (s && typeof s === 'object' && s.next) {
            this.setEmotion(s.next, { auto: true });
            return 'switch';
          }
        }
        return clonePose(last.pose);
      }

      if (t <= frames[0].at) return clonePose(frames[0].pose);
      for (var i = 0; i < frames.length - 1; i++) {
        var a = frames[i], b = frames[i + 1];
        if (t >= a.at && t < b.at) {
          var k = easeInOutCubic((t - a.at) / (b.at - a.at));
          return lerpPose(a.pose, b.pose, k);
        }
      }
      return clonePose(last.pose);
    }
  };

  /* ---------------- interfaz externa ---------------- */

  MM.create = function (target, opts) { return new Engine(target, opts); };
  MM.version = '1.0.0';

  /* Cargar configuración semilla (emotions.js se carga antes que este script) */
  if (Array.isArray(window.EMOTION_SEED)) {
    window.EMOTION_SEED.forEach(function (raw) {
      var r = register(raw);
      if (!r.ok) console.warn('[MoodMates] configuración semilla inválida：', r.id, r.errors);
    });
  }
})();
