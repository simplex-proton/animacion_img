//+++ rostro_animado/src/core/geometry.js
/* ============================================================
 * geometry.js — Biblioteca de generación de contornos paramétrica (base geométrica original de Mood Mates)
 *
 * Todos los contornos de cuerpo y forma de ojo se generan en tiempo real
 * mediante funciones parametrizadas de este archivo.
 * No existen datos de coordenadas dibujados a mano o trazados en el repositorio.
 * Los parámetros de generación son el lenguaje de diseño,
 * registrados en docs/DESIGN-PROVENANCE.md como evidencia de originalidad.
 *
 * Sistema de coordenadas: viewBox 0 0 240 240, centro de cabeza C = 120, radio base 104
 *
 * Dos tipos de contornos:
 *   Anillo corporal BODY: polilínea cerrada de 96 puntos, generada por función radial r(θ) o curva paramétrica
 *   Anillo ocular   EYE : polilínea cerrada de 48 puntos, topología lens unificada (doble envolvente) —
 *                         línea central mid(u) + envolvente de grosor halfThick(u), 24 puntos en
 *                         cada borde superior e inferior; todos los huecos de forma comparten
 *                         la misma topología, la interpolación punto a punto de la deformación es naturalmente coherente
 * ============================================================ */
(function () {
   'use strict';

   var MM = (window.MoodMates = window.MoodMates || {});
   var TAU = Math.PI * 2;

   var C = 120;          /* centro de la cabeza */
   var R = 104;          /* radio base del cuerpo */
   var BODY_N = 96;      /* número de puntos del anillo corporal */
   var EYE_N = 48;       /* número de puntos del anillo ocular (24 en cada borde) */

   function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
   function r2(v) { return Math.round(v * 100) / 100; }

   /* ---------------- Anillo corporal: muestreo radial de función ----------------
    * radialFn(theta) devuelve el radio en esa dirección (θ = 0 apunta a la derecha, sentido antihorario, coordenadas de pantalla)*/
   function sampleRadial(radialFn, opts) {
      opts = opts || {};
      var cx = opts.cx != null ? opts.cx : C;
      var cy = opts.cy != null ? opts.cy : C;
      var rot = opts.rot || 0;
      var ring = [];
      for (var i = 0; i < BODY_N; i++) {
         var th = TAU * i / BODY_N - Math.PI / 2 + rot;   /* empezando desde la parte superior */
         var r = radialFn(th);
         ring.push([r2(cx + r * Math.cos(th)), r2(cy + r * Math.sin(th))]);
      }
      return ring;
   }

   /* Salto periódico suave: cerca del ángulo center, anchura width, elevación en forma de campana (0~1) */
   function bump(th, center, width) {
      var d = Math.atan2(Math.sin(th - center), Math.cos(th - center));
      var x = clamp(1 - Math.abs(d) / width, 0, 1);
      return x * x * (3 - 2 * x);
   }

   var BODY_GEN = {
      /** Nube: borde ondulado escamoso (lobes número de ventanas, amp amplitud) */
      cloud: function (p) {
         p = p || {};
         var base = (p.r || 0.98) * R;
         var lobes = p.lobes || 7;
         var amp = p.amp != null ? p.amp : 0.075;
         var flat = p.flat != null ? p.flat : 0.10;
         return sampleRadial(function (th) {
            var scallop = Math.pow(Math.abs(Math.sin(lobes * th / 2)), 1.4);
            /* achicar ligeramente la base, como una nube sentada en el suelo */
            var seat = 1 - flat * Math.pow(Math.max(0, Math.sin(th)), 3);
            return base * seat * (1 + amp * scallop);
         }, p);
      },

      /** Estrella redondeada: points número de puntas, sharp agudeza (0 redondo ~ 1 pun punto) */
      star: function (p) {
         p = p || {};
         var outer = (p.r || 1.04) * R;
         var inner = outer * (p.inner != null ? p.inner : 0.72);
         var pts = p.points || 5;
         var k = 1 + 3 * (p.sharp != null ? p.sharp : 0.55);
         return sampleRadial(function (th) {
            var w = Math.pow(0.5 + 0.5 * Math.cos(pts * (th + Math.PI / 2)), k);
            return inner + (outer - inner) * w;
         }, p);
      },

      /** Círculo de bufón general (alternativa / punto de partida para derivados): círculo con perturbación de ondas armónicas */
      puff: function (p) {
         p = p || {};
         var base = (p.r || 1) * R;
         var waves = p.waves || [];
         return sampleRadial(function (th) {
            var v = 1;
            for (var i = 0; i < waves.length; i++) {
               var w = waves[i];
               v += (w.amp || 0) * Math.sin((w.k || 2) * th + (w.phase || 0));
            }
            return base * v;
         }, p);
      }
   };

   /** Genera un anillo corporal: desc = { type, ...parámetros } */
   function buildBody(desc) {
      var gen = BODY_GEN[desc.type];
      if (!gen) throw new Error('[MoodMates]  generador de cuerpo desconocido: ' + desc.type);
      return gen(desc);
   }

   /* ---------------- Anillo ocular: topología lens doble envolvente ----------------
    * Parámetros (todos relativos a la caja de ojos):
    *   w, h      ancho / alto del ojo (px absolutos)
    *   bend      curvatura del eje medio: >0 arco hacia arriba (ojos de sonrisa ∩), <0 caídos
    *   slope     pendiente del eje medio: >0 exterior más alto que interior (expresa ira / tristeza con mirror)
    *   taper     exponente de cierre de extremos (0.3 sensación de rectángulo redondeado ~ 2.5 puntas en ambos extremos)
    *   shift     desplazamiento del centro de grosor: >0 el borde inferior es más grueso, <0 el superior
    *   tilt      rotación general (grados)
    * mirror = -1 horizontalmente espejado (ojo derecho), slope / tilt se invierten automáticamente */
   function lens(cx, cy, o, mirror) {
      mirror = mirror || 1;
      var w = o.w, h = o.h;
      var bend = (o.bend || 0) * h;
      var slope = (o.slope || 0) * h * mirror;
      var taper = o.taper != null ? o.taper : 0.55;
      var shift = o.shift || 0;
      var tiltRad = (o.tilt || 0) * Math.PI / 180 * mirror;

      /* muestreo parametrizado de curva cerrada: φ recorre toda la circunferencia, u = (1-cosφ)/2
       * distribuye los puntos muestreados hacia los extremos ——
       * los bordes superior e inferior se unen en un solo punto en los extremos:
       * la interpolación de la curva sin punto repetido no forma esquinas agudas,
       * los extremos con muestreo denso + sin puntos repetidos → bordes lisos, limpios hasta el capuchón analítico */
      var ring = [];
      var cs = Math.cos(tiltRad), sn = Math.sin(tiltRad);
      for (var k = 0; k < EYE_N; k++) {
         var phi = TAU * k / EYE_N;
         var u = (1 - Math.cos(phi)) / 2;           /* 0 extremo izquierdo → 1 extremo derecho → de vuelta */
         var x = (u - 0.5) * w * mirror;
         var arch = Math.sin(Math.PI * u);          /* 0 en extremos, 1 en medio */
         var mid = -bend * arch + slope * (u - 0.5);
         var th = (h / 2) * Math.pow(arch, taper);
         /* φ ∈ (0,π) traza el borde superior, (π,2π) traza el borde inferior */
         var y = Math.sin(phi) >= 0 ? mid - th * (1 - shift) : mid + th * (1 + shift);
         ring.push([r2(cx + x * cs - y * sn), r2(cy + x * sn + y * cs)]);
      }
      return ring;
   }

   /* ---------------- Huecos semánticos de forma de ojo ----------------
    * Cada hueco es un mapa de estilo (tono base del ojo) → parámetros de lens.
    * style: { w, h, taper, tilt, bend } valores por defecto específicos del personaje */
   var EYE_SLOTS = {
      /* mirada tranquila */
      calm:    function (s) { return { w: s.w, h: s.h, bend: s.bend, taper: s.taper, tilt: s.tilt }; },
      calm2:   function (s) { return { w: s.w * 0.96, h: s.h * 1.05, bend: s.bend + 0.04, taper: s.taper, tilt: s.tilt }; },
      /* ojos de sonrisa (arco ∩) */
      happy:   function (s) { return { w: s.w * 1.05, h: s.h * 0.5, bend: 0.62, taper: 1.15, tilt: s.tilt }; },
      happy2:  function (s) { return { w: s.w * 1.1, h: s.h * 0.42, bend: 0.5, taper: 0.9, tilt: s.tilt + 2 }; },
      /* ojos bien abiertos */
      wide:    function (s) { return { w: s.w * 1.12, h: s.h * 1.3, bend: 0, taper: Math.max(s.taper * 0.8, 0.3), tilt: 0 }; },
      wide2:   function (s) { return { w: s.w * 1.05, h: s.h * 1.42, bend: 0.05, taper: Math.max(s.taper * 0.7, 0.3), tilt: 0 }; },
      /* cerrado / sueño */
      closed:  function (s) { return { w: s.w * 0.95, h: s.h * 0.12, bend: -0.25, taper: 0.9, tilt: s.tilt }; },
      closed2: function (s) { return { w: s.w * 0.9, h: s.h * 0.1, bend: 0.2, taper: 0.9, tilt: s.tilt }; },
      sleepy:  function (s) { return { w: s.w, h: s.h * 0.34, bend: -0.3, taper: 0.7, shift: 0.35, tilt: s.tilt }; },
      /* ojo medio cerrado / cansancio */
      squint:  function (s) { return { w: s.w * 1.02, h: s.h * 0.5, bend: 0.05, slope: 0.35, taper: 0.7, tilt: s.tilt }; },
      squint2: function (s) { return { w: s.w * 0.96, h: s.h * 0.44, bend: -0.1, slope: 0.3, taper: 0.8, tilt: s.tilt + 3 }; },
      /* ojos enfadados: interior bajo exterior alto + borde superior plano */
      angry:   function (s) { return { w: s.w * 1.02, h: s.h * 0.72, bend: 0.1, slope: -0.5, taper: 0.6, shift: 0.3, tilt: s.tilt }; },
      angry2:  function (s) { return { w: s.w * 0.98, h: s.h * 0.62, bend: 0.05, slope: -0.62, taper: 0.65, shift: 0.35, tilt: s.tilt }; },
      /* lectura: barra ancha y plana */
      scan:    function (s) { return { w: s.w * 1.3, h: s.h * 0.46, bend: 0, taper: 0.45, tilt: 0 }; },
      scan2:   function (s) { return { w: s.w * 1.18, h: s.h * 0.56, bend: 0.08, taper: 0.5, tilt: 0 }; },
      scan3:   function (s) { return { w: s.w * 1.36, h: s.h * 0.38, bend: -0.06, taper: 0.42, tilt: 0 }; },
      /* escucha: óvalo estrecho y alto */
      listen:  function (s) { return { w: s.w * 0.78, h: s.h * 1.18, bend: 0, taper: Math.max(s.taper * 0.85, 0.35), tilt: 0 }; },
      listen2: function (s) { return { w: s.w * 0.72, h: s.h * 1.08, bend: 0.08, taper: Math.max(s.taper * 0.85, 0.35), tilt: s.tilt }; },
      /* tímido: caído y ligeramente cerrado, esquina exterior hacia abajo */
      shy:     function (s) { return { w: s.w * 0.92, h: s.h * 0.6, bend: -0.18, slope: 0.22, taper: 0.85, tilt: s.tilt + 4 }; },
      /* triste: exterior bajo interior alto */
      sad:     function (s) { return { w: s.w * 0.95, h: s.h * 0.62, bend: -0.1, slope: 0.45, taper: 0.75, tilt: s.tilt }; }
   };

   /** Genera un par de anillos oculares (incluido el espejo izquierdo-derecho)
    *  style: { dx, cy, w, h, taper, tilt, bend } —— dx es la distancia del centro del ojo a la línea media de la cara */
   function buildEyePair(slotName, style) {
      var slotFn = EYE_SLOTS[slotName];
      if (!slotFn) throw new Error('[MoodMates]  hueco de forma de ojo desconocido: ' + slotName);
      var o = slotFn(style);
      var L = lens(C - style.dx, style.cy, o, 1);
      var Rr = lens(C + style.dx, style.cy, o, -1);
      return [L, Rr];
   }

   /** Genera el conjunto completo de anillos oculares: slotName → [izquierdo, derecho] */
   function buildEyeFamily(style) {
      var fam = {};
      for (var name in EYE_SLOTS) fam[name] = buildEyePair(name, style);
      return fam;
   }

   /* ---------------- Boca: misma topología lens (anillo pequeño de 24 puntos) ----------------
    * Los huecos incluyen formas labiales cerradas y bocas abiertas, la topología compartida puede deformarse libremente */
   var MOUTH_N = 24;

   /* v2.0: skew y cornerL/cornerR introducen asimetría facial (offset lineal sobre la línea media).
      Es opcional: las formas clásicas siguen siendo simétricas. */
   function mouthLens(o) {
      var w = o.w, h = o.h;
      var bend = (o.bend || 0) * Math.max(h, 4);
      var taper = o.taper != null ? o.taper : 0.8;
      var skew = o.skew || 0;                 /* desplazamiento lateral proporcional a u */
      var cL = o.cornerL || 0, cR = o.cornerR || 0;  /* levantado vertical de cada comisura */
      /* misma parametrización de curva cerrada que lens: los extremos se unen en un solo punto +
       * muestreo denso en los extremos, los labros de la boca son lisos y uniformes */
      var ring = [];
      for (var k = 0; k < MOUTH_N; k++) {
         var phi = TAU * k / MOUTH_N;
         var u = (1 - Math.cos(phi)) / 2;
         var x = (u - 0.5) * w + skew * (u - 0.5) * w;
         var arch = Math.sin(Math.PI * u);
         var corners = lerpCorner(cL, cR, u); /* interpolación lineal entre comisuras */
         var mid = -bend * arch + corners;
         var th = (h / 2) * Math.pow(arch, taper);
         var y = Math.sin(phi) >= 0 ? mid - th : mid + th;
         ring.push([r2(x), r2(y)]);
      }
      return ring;
   }
   function lerpCorner(a, b, u) { return a + (b - a) * u; }

   /* base: { w } — ancho base de la boca del personaje; la altura / curvatura de cada hueco son constantes semánticas.
      v2.0: bocas más grandes y con nuevos huecos expresivos (la geometría sigue siendo el mismo anillo
      de 24 puntos, por lo que todas las formas existentes deforman igual de bien). */
   var MOUTH_SLOTS = {
      smile:  function (b) { return mouthLens({ w: b.w, h: 3.4, bend: -0.9, taper: 0.9 }); },
      grin:   function (b) { return mouthLens({ w: b.w * 1.25, h: 17, bend: -0.55, taper: 0.6 }); },
      o:      function (b) { return mouthLens({ w: b.w * 0.5, h: b.w * 0.62, bend: 0, taper: 0.4 }); },
      flat:   function (b) { return mouthLens({ w: b.w * 0.8, h: 2.6, bend: 0, taper: 0.9 }); },
      frown:  function (b) { return mouthLens({ w: b.w * 0.85, h: 3, bend: 0.85, taper: 0.9 }); },
      wavy:   function (b) { return mouthLens({ w: b.w, h: 3, bend: -0.15, taper: 0.5 }); },
      pout:   function (b) { return mouthLens({ w: b.w * 0.42, h: 3.4, bend: 0.5, taper: 0.5 }); },
      open:   function (b) { return mouthLens({ w: b.w * 0.72, h: b.w * 0.72, bend: -0.25, taper: 0.45 }); },
      dot:    function (b) { return mouthLens({ w: b.w * 0.2, h: b.w * 0.18, bend: 0, taper: 0.4 }); },
      /* ---- v2.0: huecos nuevos ---- */
      laugh:  function (b) { return mouthLens({ w: b.w * 1.15, h: b.w * 0.8, bend: -0.7, taper: 0.42 }); },
      shout:  function (b) { return mouthLens({ w: b.w * 0.9, h: b.w * 0.95, bend: -0.1, taper: 0.38 }); },
      smirk:  function (b) { return mouthLens({ w: b.w * 0.85, h: 3.2, bend: -0.55, taper: 0.85, cornerL: -1.2, cornerR: 2.6, skew: 0.08 }); },
      sob:    function (b) { return mouthLens({ w: b.w * 0.6, h: b.w * 0.42, bend: 0.75, taper: 0.5, cornerL: 1.6, cornerR: -1.2 }); },
      yawn:   function (b) { return mouthLens({ w: b.w * 0.62, h: b.w * 0.9, bend: -0.05, taper: 0.35 }); },
      kiss:   function (b) { return mouthLens({ w: b.w * 0.34, h: b.w * 0.3, bend: 0.15, taper: 0.3 }); },
      tongue: function (b) { return mouthLens({ w: b.w * 0.8, h: b.w * 0.55, bend: -0.3, taper: 0.45 }); }
   };

   function buildMouth(slotName, base) {
      var fn = MOUTH_SLOTS[slotName] || MOUTH_SLOTS.flat;
      return fn(base);
   }

   /* ---------------- Contornos personalizados (entrada para grupos de contornos exclusivos por emoción) ----------------
    * El personaje puede definir formas personalizadas de ojo / boca en eyeShapes / mouthShapes
    * usando los parámetros lens / mouthLens originales;
    * luego puede referenciar estos nombres personalizados en pool / mouth de la emoción correspondiente */

   /** Par de forma de ojo personalizada: o es los parámetros lens originales (w/h/bend/slope/taper/shift/tilt),
    *  la posición sigue usando dx / cy del estilo del personaje */
   function buildCustomEyePair(o, style) {
      var merged = Object.assign({ w: style.w, h: style.h, taper: style.taper, tilt: style.tilt, bend: style.bend }, o);
      return [lens(C - style.dx, style.cy, merged, 1), lens(C + style.dx, style.cy, merged, -1)];
   }

   /** Boca personalizada: o es los parámetros mouthLens originales (w/h/bend/taper) */
   function buildCustomMouth(o) {
      return mouthLens(Object.assign({ w: 24, h: 3, bend: 0, taper: 0.8 }, o));
   }

   MM.geo = {
      C: C,
      R: R,
      BODY_N: BODY_N,
      EYE_N: EYE_N,
      MOUTH_N: MOUTH_N,
      buildBody: buildBody,
      buildEyePair: buildEyePair,
      buildEyeFamily: buildEyeFamily,
      buildMouth: buildMouth,
      buildCustomEyePair: buildCustomEyePair,
      buildCustomMouth: buildCustomMouth,
      eyeSlots: Object.keys(EYE_SLOTS),
      mouthSlots: Object.keys(MOUTH_SLOTS),
      bodyTypes: Object.keys(BODY_GEN),
      lens: lens,
      sampleRadial: sampleRadial
   };
})();
