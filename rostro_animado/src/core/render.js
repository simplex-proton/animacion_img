/* ============================================================
 * render.js — Capa de renderizado (solo renderizado, sin lógica de negocio)
 *
 *   Sistema de coordenadas: viewBox 0 0 240 240, centro de cabeza C = 120
 *
 *   Cuerpo (calidad premium):
 *     4 paradas de degradado radial (luz superior → color → contraste borde) +
 *     mancha de brillo esmaltado + sombra suave del suelo,
 *     la sombra se contrae y atenúa automáticamente al elevarse del suelo (rebote)
 *
 *   Ojos (dos modos, física correcta):
 *     bean  Ojo judía: todo el anillo lens es el recorte de la párpora,
 *           cerrar = aplastar el recorte (modo original)
 *     iris  Ojo con pupila: el anillo lens actúa como clipPath de la abertura de la párpora;
 *           internamente se renderizan en orden:
 *           scleral → iris (degradado radial) → pupila → punto de luz fijo.
 *           Cerrar = la párpora ciérrala recortando todo el ojo, la pupila nunca quedará
 *           flotando fuera de una párpora cerrada;
 *           ojos pequeños (entrecerrar / escaneo) ocultan el punto de luz blanco,
 *           la pupila se escala proporcionalmente; al mirar, la pupila se recorta dentro del bbox del anillo ocular.
 *           El punto de luz mantiene la posición de la fuente de luz ——
 *           compatibiliza el movimiento real del ojo
 *
 *   Rasgos / accesorios: ver features.js (sistema de accesorios con enlace)
 *   Efectos: ver fx.js (emisores + acción de firma)
 *   Proyección esférica: según la altura actual del ojo, se muestrea el semiancho
 *   local del contorno corporal, se calcula la longitud y se comprime con coseno;
 *   al girar hacia el reverso, se oculta automáticamente (criterio cos <= 0.02)
 *   Zzz: partículas de letras que flotan en la esquina superior derecha durante el sueño
 * ============================================================ */
(function () {
   'use strict';

   var MM = (window.MoodMates = window.MoodMates || {});
   var SVGNS = 'http://www.w3.org/2000/svg';
   var uid = 0;

   var C = 120;   /* consistente con geometry.js */
   var TAU = Math.PI * 2;

   function el(tag, attrs) {
      var node = document.createElementNS(SVGNS, tag);
      for (var k in attrs) node.setAttribute(k, attrs[k]);
      return node;
   }
   function r2(v) { return Math.round(v * 100) / 100; }
   function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
   function shade(hex, amt) {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      var target = amt < 0 ? 0 : 255;
      var a = Math.abs(amt);
      r = Math.round(r + (target - r) * a);
      g = Math.round(g + (target - g) * a);
      b = Math.round(b + (target - b) * a);
      return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
   }

   /* Contorno del anillo → path de curva cerrada suave
    * Catmull-Rom → Bézier cúbica: los vértices de la polilínea al ampliar muestran
    * esquinas de polígono (sensación de entallado); usar interpolación de curva
    * por puntos para que cada segmento sea una curva C, los bordes son lisos a cualquier densidad de muestreo*/
   function ringPath(ring) {
      var n = ring.length;
      if (n < 3) return 'M0 0Z';
      var s = 'M' + ring[0][0].toFixed(2) + ' ' + ring[0][1].toFixed(2);
      for (var i = 0; i < n; i++) {
         var p0 = ring[(i - 1 + n) % n];
         var p1 = ring[i];
         var p2 = ring[(i + 1) % n];
         var p3 = ring[(i + 2) % n];
         s += 'C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(2) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(2) +
            ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(2) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(2) +
            ' ' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2);
      }
      return s + 'Z';
   }
   function centroid(ring) {
      var x = 0, y = 0;
      for (var i = 0; i < ring.length; i++) { x += ring[i][0]; y += ring[i][1]; }
      return [x / ring.length, y / ring.length];
   }
   /** Grosor real del contorno = área del lazo / ancho de la caja envolvente.
    *  Un ojo de sonrisa en arco (∩) tiene caja alta pero es realmente delgado,
    *  usar el grosor es lo correcto para determinar el cierre */
   function ringThickness(ring) {
      var area = 0, minX = 1e9, maxX = -1e9;
      for (var i = 0; i < ring.length; i++) {
         var a = ring[i], b = ring[(i + 1) % ring.length];
         area += a[0] * b[1] - b[0] * a[1];
         if (a[0] < minX) minX = a[0];
         if (a[0] > maxX) maxX = a[0];
      }
      var w = Math.max(maxX - minX, 1);
      return Math.abs(area) / 2 / w;
   }
   function ringBBox(ring) {
      var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (var i = 0; i < ring.length; i++) {
         var p = ring[i];
         if (p[0] < minX) minX = p[0];
         if (p[0] > maxX) maxX = p[0];
         if (p[1] < minY) minY = p[1];
         if (p[1] > maxY) maxY = p[1];
      }
      return { minX: minX, maxX: maxX, minY: minY, maxY: maxY, w: maxX - minX, h: maxY - minY };
   }
   /* Si la caja es demasiado estrecha, tomar el punto medio, evita que lo > hi después de recortar */
   function clampIn(v, lo, hi) {
      if (lo > hi) return (lo + hi) / 2;
      return clamp(v, lo, hi);
   }
   var BEAN_HL_MIN_H = 10;   /* Punto de luz del ojo judía: ocultar cuando la altura visible es menor que este valor (verdadero cierre/sonrisa en arco) */
   var BEAN_HL_FULL_H = 26;  /* Altura visible del punto de luz a tamaño completo;
                               formas de ojo más pequeñas reducen el punto de luz proporcionalmente */
   var IRIS_LASH = 0.26;     /* Pestaña: ocultar iris/pupila/punto de luz cuando effOpen es menor que esto */
   var IRIS_SMALL = 0.45;    /* Ojo pequeño: entre la pestaña y este valor solo se deja el iris */

   /**
    * createBall(container, opts)
    *   opts.character — definición del personaje ya resuelta (el motor se encarga de resolverla), contiene:
    *     bodyRing / face / palette / eyeStyle / features / fxSkin / defaultEyeRing
    */
   function createBall(container, opts) {
      opts = opts || {};
      var id = 'mm' + (uid++);
      var lite = !!opts.lite;
      var ch = opts.character;
      var face = ch.face;
      var headRing = ch.bodyRing;
      var palette = ch.palette;
      var feats = ch.features || {};
      var pupilCfg = ch.eyeStyle.pupil || null;

      /* ---- muestreo del contorno: [minX, maxX] por fila de cada 2px,
         para ajustar los rasgos a cualquier silueta ---- */
      var silMinY = 1e9, silMaxY = -1e9, silMaxW = 0;
      var i;
      for (i = 0; i < headRing.length; i++) {
         if (headRing[i][1] < silMinY) silMinY = headRing[i][1];
         if (headRing[i][1] > silMaxY) silMaxY = headRing[i][1];
      }
      var SIL_STEP = 2;
      var silRows = [];
      (function buildSil() {
         var rows = Math.ceil((silMaxY - silMinY) / SIL_STEP) + 1;
         for (var r = 0; r < rows; r++) {
            var y = silMinY + r * SIL_STEP;
            var lo = 1e9, hi = -1e9;
            for (var e = 0; e < headRing.length; e++) {
               var a = headRing[e], b = headRing[(e + 1) % headRing.length];
               var y0 = a[1], y1 = b[1];
               if ((y0 <= y && y1 >= y) || (y1 <= y && y0 >= y)) {
                  var t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
                  var x = a[0] + (b[0] - a[0]) * t;
                  if (x < lo) lo = x;
                  if (x > hi) hi = x;
               }
            }
            if (lo > hi) { lo = C - 4; hi = C + 4; }
            silRows.push([lo, hi]);
            if (hi - lo > silMaxW) silMaxW = hi - lo;
         }
      })();
      function silAt(y) {
         var r = Math.round((clamp(y, silMinY, silMaxY) - silMinY) / SIL_STEP);
         return silRows[clamp(r, 0, silRows.length - 1)];
      }

      /* ---- esqueleto SVG ---- */
      var svg = el('svg', {
         viewBox: '0 0 240 240',
         width: '100%',
         height: '100%',
         class: 'mm-svg',
         role: 'img',
         'aria-label': opts.label || ch.name || 'Mood Mates'
      });
      svg.style.display = 'block';
      svg.style.overflow = 'visible';

      var defs = el('defs', {});
      svg.appendChild(defs);

      /* degradado corporal: luz superior → resplandor → color base → borde más oscuro (volumen 3D pseudo) */
      var grad = el('radialGradient', { id: id + 'g', cx: '36%', cy: '26%', r: '86%' });
      var stops = [
         el('stop', { offset: '0%' }),
         el('stop', { offset: '38%' }),
         el('stop', { offset: '78%' }),
         el('stop', { offset: '100%' })
      ];
      stops.forEach(function (s) { grad.appendChild(s); });
      defs.appendChild(grad);

      /* degradado de brillo esmaltado (blanco → transparente) */
      var glossGrad = el('radialGradient', { id: id + 'gl', cx: '50%', cy: '42%', r: '58%' });
      glossGrad.appendChild(el('stop', { offset: '0%', 'stop-color': '#FFFFFF', 'stop-opacity': '0.9' }));
      glossGrad.appendChild(el('stop', { offset: '68%', 'stop-color': '#FFFFFF', 'stop-opacity': '0.22' }));
      glossGrad.appendChild(el('stop', { offset: '100%', 'stop-color': '#FFFFFF', 'stop-opacity': '0' }));
      defs.appendChild(glossGrad);

      /* degradado de sombra del suelo (negro → transparente) */
      var shGrad = el('radialGradient', { id: id + 'sh', cx: '50%', cy: '50%', r: '50%' });
      shGrad.appendChild(el('stop', { offset: '0%', 'stop-color': '#000000', 'stop-opacity': '0.9' }));
      shGrad.appendChild(el('stop', { offset: '72%', 'stop-color': '#000000', 'stop-opacity': '0.32' }));
      shGrad.appendChild(el('stop', { offset: '100%', 'stop-color': '#000000', 'stop-opacity': '0' }));
      defs.appendChild(shGrad);

      /* degradado del iris (para ojo con pupila): superior oscuro, inferior claro,
         simula la dispersión de luz incidente en el borde inferior del iris */
      var irisGrad = null;
      if (pupilCfg) {
         var irisColor = pupilCfg.irisColor || palette.eye;
         irisGrad = el('radialGradient', { id: id + 'ir', cx: '50%', cy: '38%', r: '72%' });
         irisGrad.appendChild(el('stop', { offset: '0%', 'stop-color': shade(irisColor, -0.25) }));
         irisGrad.appendChild(el('stop', { offset: '62%', 'stop-color': irisColor }));
         irisGrad.appendChild(el('stop', { offset: '100%', 'stop-color': shade(irisColor, 0.28) }));
         defs.appendChild(irisGrad);
      }

      /* ---- sombra suave del suelo (no rota con el cuerpo, solo sigue el desplazamiento / elevación del salto) ---- */
      var shadowRy = 7;
      var shadowCy = Math.min(silMaxY + 6, 234);
      var shadow = el('ellipse', {
         cx: C, cy: shadowCy,
         rx: r2(silMaxW * 0.36), ry: shadowRy,
         fill: 'url(#' + id + 'sh)', opacity: '0.16',
         'pointer-events': 'none'
      });
      svg.appendChild(shadow);

      var fxBack = el('g', { 'pointer-events': 'none' });
      svg.appendChild(fxBack);

      var bodyG = el('g', { class: 'mm-body' });

      /* Accesorios de capa trasera (sombrero / guantes que sobresalen del cuerpo) */
      var featureCtx = {
         el: el, ringPath: ringPath, r2: r2, clamp: clamp, shade: shade,
         C: C, face: face, palette: palette, eyeStyle: ch.eyeStyle, silAt: silAt,
         silMinY: silMinY, silMaxY: silMaxY, defs: defs, uid: id
      };
      var featureLayer = MM.createFeatures
         ? MM.createFeatures(bodyG, feats, featureCtx)
         : null;
      if (featureLayer && featureLayer.back) bodyG.appendChild(featureLayer.back);

      var head = el('path', { d: ringPath(headRing), fill: 'url(#' + id + 'g)', stroke: 'none', 'stroke-width': '2' });
      bodyG.appendChild(head);

      /* Mancha de brillo esmaltado: pegada al lado superior izquierdo del contorno,
       * sigue todos los movimientos del cuerpo; usar clipPath del contorno corporal
       * para recortar, evita que en contornos cóncavos (estrella / nube) el brillo
       * se salga del cuerpo */
      var glossAmt = palette.gloss != null ? palette.gloss : 0.3;
      var gloss = null;
      if (glossAmt > 0) {
         var glossClip = el('clipPath', { id: id + 'bc', clipPathUnits: 'userSpaceOnUse' });
         glossClip.appendChild(el('path', { d: ringPath(headRing) }));
         defs.appendChild(glossClip);
         /* El grupo recortado no lleva transform, garantizando que el clip
          * se alinee exactamente con el anillo corporal estático */
         var glossWrap = el('g', { 'clip-path': 'url(#' + id + 'bc)', 'pointer-events': 'none' });
         gloss = el('ellipse', {
            cx: r2(C - silMaxW * 0.17),
            cy: r2(silMinY + (silMaxY - silMinY) * 0.2),
            rx: r2(silMaxW * 0.15),
            ry: r2((silMaxY - silMinY) * 0.1),
            fill: 'url(#' + id + 'gl)',
            opacity: String(glossAmt),
            transform: 'rotate(-24 ' + r2(C - silMaxW * 0.17) + ' ' + r2(silMinY + (silMaxY - silMinY) * 0.2) + ')'
         });
         glossWrap.appendChild(gloss);
         bodyG.appendChild(glossWrap);
      }

      /* Oclusión de luz ambiental inferior (AO): oscurece ligeramente el borde inferior del cuerpo,
         mejorando la sensación de cuerpo apoyado en el suelo */
      var aoGrad = el('linearGradient', { id: id + 'ao', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
      aoGrad.appendChild(el('stop', { offset: '58%', 'stop-color': '#000000', 'stop-opacity': '0' }));
      aoGrad.appendChild(el('stop', { offset: '100%', 'stop-color': '#000000', 'stop-opacity': '0.14' }));
      defs.appendChild(aoGrad);
      var ao = el('path', { d: ringPath(headRing), fill: 'url(#' + id + 'ao)', 'pointer-events': 'none' });
      bodyG.appendChild(ao);

      /* Rubor en la capa media, debajo de los ojos y encima del cuerpo */
      if (featureLayer && featureLayer.mid) bodyG.appendChild(featureLayer.mid);

      var EYE_HALF = ch.eyeStyle.h / 2;

      /* ============ Construcción de ojos ============
      * bean: path único (modo original)
      * iris: g[clip] > scleral path + iris + pupila + punto de luz (el clipPath referencia el anillo de la párpado) */
      function buildEye(k) {
         var ring0 = ch.defaultEyeRing[k];
         var base = centroid(ring0);
         var eye = { ring: ring0, c: base, base: base, k: k,
            defBBox: ringBBox(ring0), bbox: ringBBox(ring0), thick: ringThickness(ring0) };

         if (!pupilCfg) {
            /* ---- Ojo judía (bean) ---- */
            eye.mode = 'bean';
            eye.node = el('path', { fill: palette.eye, stroke: 'none', 'stroke-width': '1.6', d: ringPath(ring0) });
            if (ch.eyeStyle.highlight) {
               var hls = ch.eyeStyle.highlight;
               eye.hls = (Array.isArray(hls) ? hls : [hls]).map(function (h) {
                  return {
                     cfg: h,
                     node: el('circle', {
                        r: h.r || 3, fill: h.color || palette.eyeHighlight || '#FFFFFF',
                        opacity: h.opacity != null ? h.opacity : 0.92, 'pointer-events': 'none'
                     })
                  };
               });
            }
            return eye;
         }

         /* ---- Ojo con pupila (iris) ---- */
         eye.mode = 'iris';
         eye.thick = ringThickness(ring0);
         var clipId = id + 'ec' + k;
         var cp = el('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
         eye.lidClip = el('path', { d: ringPath(ring0) });
         cp.appendChild(eye.lidClip);
         defs.appendChild(cp);

         eye.node = el('g', {});
         var inner = el('g', { 'clip-path': 'url(#' + clipId + ')' });
         eye.inner = inner;

         /* ---- v2.0: esclerótica esférica con gradiente radial desplazado a la luz ---- */
         var scleraId = id + 'sc' + k;
         var sg = el('radialGradient', { id: scleraId, cx: '38%', cy: '34%', r: '75%' });
         sg.appendChild(el('stop', { offset: '0%', 'stop-color': '#FFFFFF' }));
         sg.appendChild(el('stop', { offset: '60%', 'stop-color': '#EEF1F8' }));
         sg.appendChild(el('stop', { offset: '100%', 'stop-color': '#C9D0E2' }));
         defs.appendChild(sg);
         eye.socket = el('path', {
            d: ringPath(ring0),
            fill: pupilCfg.socket || ('url(#' + scleraId + ')')
         });
         inner.appendChild(eye.socket);

         /* ---- v2.0: sombra del párpado superior (linearGradient vertical, escala con `open`) ---- */
         var lidShadowId = id + 'ls' + k;
         var lg = el('linearGradient', { id: lidShadowId, x1: '0', y1: '0', x2: '0', y2: '1' });
         lg.appendChild(el('stop', { offset: '0%', 'stop-color': '#000000', 'stop-opacity': '0.28' }));
         lg.appendChild(el('stop', { offset: '35%', 'stop-color': '#000000', 'stop-opacity': '0' }));
         lg.appendChild(el('stop', { offset: '100%', 'stop-color': '#000000', 'stop-opacity': '0' }));
         defs.appendChild(lg);
         var bb0 = eye.defBBox;
         eye.lidShadow = el('rect', {
            x: bb0.x, y: bb0.y, width: bb0.w, height: bb0.h,
            fill: 'url(#' + lidShadowId + ')', opacity: 0.55, 'pointer-events': 'none'
         });
         inner.appendChild(eye.lidShadow);

         /* iris + pupila (círculos perfectos, no se aplastan con la párpida, recortados al cerrar) */
         var irisR = pupilCfg.irisR || EYE_HALF * 0.86;
         var pupilR = pupilCfg.pupilR || irisR * 0.52;
         eye.irisR = irisR;
         eye.pupilR = pupilR;
         eye.iris = el('circle', { r: irisR, fill: 'url(#' + id + 'ir)' });
         inner.appendChild(eye.iris);

         /* ---- v2.0: fibras radiales del iris (24 líneas finas, opacidad sutil) ---- */
         var fibG = el('g', { opacity: 0.13, stroke: shade(pupilCfg.irisColor || palette.eye, -0.45), 'stroke-width': 0.7, 'pointer-events': 'none' });
         for (var fi = 0; fi < 24; fi++) {
            var fa = TAU * fi / 24 + (k ? 0.13 : 0);
            fibG.appendChild(el('line', {
               x1: Math.cos(fa) * irisR * 0.35, y1: Math.sin(fa) * irisR * 0.35,
               x2: Math.cos(fa) * irisR * 0.92, y2: Math.sin(fa) * irisR * 0.92
            }));
         }
         eye.fibers = fibG;
         inner.appendChild(fibG);

         /* anillo límbico: borde oscuro fino del iris */
         eye.limb = el('circle', { r: irisR, fill: 'none', stroke: shade(pupilCfg.irisColor || palette.eye, -0.6), 'stroke-width': 1.4, opacity: 0.8 });
         inner.appendChild(eye.limb);

         /* cáustica inferior: arco claro opuesto a la luz */
         eye.caustic = el('path', {
            d: 'M ' + (-irisR * 0.62) + ' ' + (irisR * 0.42) + ' A ' + (irisR * 0.72) + ' ' + (irisR * 0.72) + ' 0 0 0 ' + (irisR * 0.62) + ' ' + (irisR * 0.42),
            fill: 'none', stroke: '#FFFFFF', 'stroke-width': 1.1, opacity: 0.22, 'pointer-events': 'none'
         });
         inner.appendChild(eye.caustic);

         /* ---- v2.0: menisco lagrimal (brillo húmedo en el borde inferior) ---- */
         eye.tearline = el('path', {
            d: ringPath(ring0), fill: 'none', stroke: '#FFFFFF', 'stroke-width': 1.2,
            opacity: 0.18, 'pointer-events': 'none',
            'stroke-dasharray': (bb0.w * 1.6) + ' ' + (bb0.w * 3.2),
            'stroke-dashoffset': -(bb0.w * 0.7)
         });
         inner.appendChild(eye.tearline);

         eye.pupil = el('circle', { r: pupilR, fill: pupilCfg.pupilColor || shade(pupilCfg.irisColor || palette.eye, -0.72) });
         inner.appendChild(eye.pupil);

         /* Punto de luz fijo: principal + secundario, no se mueve con el movimiento del ojo
            (la posición de la fuente de luz permanece constante) */
         var hlList = pupilCfg.highlights || [
            { dx: -irisR * 0.34, dy: -irisR * 0.4, r: irisR * 0.3 },
            { dx: irisR * 0.36, dy: irisR * 0.22, r: irisR * 0.13, opacity: 0.6 }
         ];
         eye.hlNodes = hlList.map(function (h) {
            var n = el('circle', {
               r: h.r, fill: h.color || '#FFFFFF',
               opacity: h.opacity != null ? h.opacity : 0.95,
               'pointer-events': 'none'
            });
            inner.appendChild(n);
            return { cfg: h, node: n };
         });

         eye.node.appendChild(inner);
         return eye;
      }

      var eyeL = buildEye(0);
      var eyeR = buildEye(1);
      bodyG.appendChild(eyeL.node);
      bodyG.appendChild(eyeR.node);
      if (eyeL.hls) eyeL.hls.forEach(function (h) { bodyG.appendChild(h.node); });
      if (eyeR.hls) eyeR.hls.forEach(function (h) { bodyG.appendChild(h.node); });

      /* cejas / boca / accesorios de capa frontal (gafas etc.) van encima de los ojos */
      if (featureLayer && featureLayer.front) bodyG.appendChild(featureLayer.front);

      svg.appendChild(bodyG);

      var fxFront = el('g', { 'pointer-events': 'none' });
      svg.appendChild(fxFront);

      var BASE_C = [centroid(ch.defaultEyeRing[0]), centroid(ch.defaultEyeRing[1])];

      /* ---- partículas zzz durante el sueño ---- */
      var zzzNodes = null;
      if (!lite) {
         zzzNodes = [];
         for (var zi = 0; zi < 3; zi++) {
            var zn = el('text', {
               x: 0, y: 0, fill: palette.zzz || '#A8A296', opacity: '0',
               'font-family': "'Space Grotesk', 'Noto Sans SC', sans-serif",
               'font-weight': '700', 'font-style': 'italic', 'text-anchor': 'middle'
            });
            zn.textContent = 'z';
            fxFront.appendChild(zn);
            zzzNodes.push(zn);
         }
      }

      container.appendChild(svg);

      /* ---- instancia de efectos (fx.js: emisores + acción de firma) ----
       * anchors: anclajes de boca / coronilla / base y semiancho del cuerpo,
       *          usados por los emisores de la acción de firma para posicionarse */
      var mouthAnchorY = C + face.y + (((feats.mouth && feats.mouth.dy) || 36)) * face.sy;
      var fx = (!lite && MM.createFx)
         ? MM.createFx({
            defs: defs, back: fxBack, front: fxFront, C: C,
            skin: ch.fxSkin, palette: palette, el: el, r2: r2,
            anchors: {
               mouth: { x: C, y: mouthAnchorY },
               top: { x: C, y: silMinY },
               bottom: { x: C, y: silMaxY },
               halfW: silMaxW / 2
            }
         })
         : null;

      /* ---- caché de estados ---- */
      var curBodyColor = null;
      var curSketch = -1;
      var prevYaw = 0, prevNow = 0;

      function setBodyColor(color) {
         if (color === curBodyColor) return;
         curBodyColor = color;
         stops[0].setAttribute('stop-color', shade(color, 0.42));
         stops[1].setAttribute('stop-color', shade(color, 0.14));
         stops[2].setAttribute('stop-color', color);
         stops[3].setAttribute('stop-color', shade(color, -0.22));
      }

      function applySketchChrome(on, color) {
         svg.classList.toggle('is-sketch', on);
         if (on) {
            head.setAttribute('fill', 'none');
            head.setAttribute('stroke', 'none');
            head.style.stroke = 'var(--sketch-ink, ' + shade(color, -0.6) + ')';
            head.setAttribute('stroke-opacity', '0.85');
            if (gloss) gloss.style.display = 'none';
            ao.style.display = 'none';
         } else {
            head.setAttribute('fill', 'url(#' + id + 'g)');
            head.setAttribute('stroke', 'none');
            head.style.stroke = '';
            head.removeAttribute('stroke-opacity');
            if (gloss) gloss.style.display = '';
            ao.style.display = '';
         }
      }

      /* ---- ojos: deformación del anillo + proyección esférica + ojo en capas ---- */
      function setEye(eye, pose, k, sketch, yaw) {
         var ring = pose.ring;
         if (ring && ring !== eye.ring) {
            eye.ring = ring;
            var d = ringPath(ring);
            if (eye.mode === 'bean') {
               eye.node.setAttribute('d', d);
            } else {
               eye.lidClip.setAttribute('d', d);
               eye.socket.setAttribute('d', d);
            }
            eye.c = centroid(ring);
            eye.bbox = ringBBox(ring);
            eye.thick = ringThickness(ring);
         }

         var base = eye.c || BASE_C[k];
         var open = clamp(pose.open, 0.02, 2.4);
         var syEye = clamp(pose.scaleY * face.eye, 0.02, 2.4);
         var sxBase = pose.scaleX * face.eye;

         /* Modo bean: el escalado vertical incluye la apertura;
            Modo iris: la apertura solo comprime la párpida */
         var syAll = eye.mode === 'bean' ? clamp(syEye * open, 0.02, 2.4) : syEye;

         var halfH = EYE_HALF * clamp(syEye * open, 0.02, 2.4) + 2;
         var ey0 = C + face.y + (base[1] - C) * face.sy + pose.y + pose.lookY;
         ey0 = clamp(ey0, silMinY + halfH, silMaxY - halfH);

         var sil = silAt(ey0);
         var cx0 = (sil[0] + sil[1]) / 2;
         var hw = Math.max((sil[1] - sil[0]) / 2, 12);

         var ox = face.x + (base[0] - C) * face.sx + pose.x + pose.lookX;
         var theta = clamp(ox / hw, -1.15, 1.15);
         var total = theta + (yaw || 0);
         var cn = Math.cos(total);
         if (cn <= 0.02) {
            eye.node.style.display = 'none';
            if (eye.hls) eye.hls.forEach(function (h) { h.node.style.display = 'none'; });
            return;
         }
         eye.node.style.display = '';
         var ex = cx0 + hw * Math.sin(total) * 0.985;
         var dyN = (ey0 - C) / 130;
         var fy = Math.sqrt(1 - dyN * dyN * 0.22);

         var tf =
            'translate(' + r2(ex) + ' ' + r2(ey0) + ')' +
            (pose.rotate ? ' rotate(' + r2(pose.rotate) + ')' : '') +
            ' scale(' + r2(sxBase * cn) + ' ' + r2(syAll * fy) + ')';
         var tfFull = tf + ' translate(' + r2(-base[0]) + ' ' + r2(-base[1]) + ')';
         eye.node.setAttribute('transform', tfFull);

         if (eye.mode === 'bean') {
            /* ---- bean: el punto de luz sigue la misma transformación;
               cuando la altura visible es muy baja (entrecerrar / sueño / escaneo) se oculta ---- */
            if (eye.hls) {
               var boxH = eye.bbox ? eye.bbox.h : EYE_HALF * 2;
               var thickH = (eye.thick != null ? eye.thick : boxH) * 1.65;
               var visH = Math.min(boxH, thickH) * Math.abs(syAll * fy);
               var hideHl = visH <= BEAN_HL_MIN_H || sketch > 0.5;
               var defB = eye.defBBox || eye.bbox;
               var curB = eye.bbox || defB;
               var sxOff = defB && defB.w > 0.5 ? curB.w / defB.w : 1;
               var syOff = defB && defB.h > 0.5 ? curB.h / defB.h : 1;
               var c0 = eye.c || base;
               for (var hi = 0; hi < eye.hls.length; hi++) {
                  var hl = eye.hls[hi];
                  if (hideHl) {
                     hl.node.style.display = 'none';
                  } else {
                     hl.node.style.display = '';
                     /* Las formas de ojo pequeñas conservan el punto de luz reducido proporcionalmente, no se pierde la expresividad */
                     var hlScale = clamp(visH / BEAN_HL_FULL_H, 0.55, 1);
                     var hlR = (hl.cfg.r || 3) * hlScale;
                     if (hlR !== hl.lastR) {
                        hl.node.setAttribute('r', r2(hlR));
                        hl.lastR = hlR;
                     }
                     var hdx = (hl.cfg.dx || 0) * (k === 0 ? 1 : -1) * sxOff;
                     var hdy = (hl.cfg.dy || 0) * syOff;
                     /* Escalar el desplazamiento según el anillo ocular actual,
                        y garantizar que el punto de luz no robe del borde del bbox */
                     if (curB) {
                        hdx = clampIn(hdx, (curB.minX - c0[0]) + hlR, (curB.maxX - c0[0]) - hlR);
                        hdy = clampIn(hdy, (curB.minY - c0[1]) + hlR, (curB.maxY - c0[1]) - hlR);
                     }
                     hl.node.setAttribute('transform', tf +
                        ' translate(' + r2(hdx) + ' ' + r2(hdy) + ')');
                  }
               }
            }
            var fill = sketch > 0.5 ? 'none' : pose.color;
            /* El contorno del ojo en modo boceto usa tinta del tema,
               el color oscuro de la pupila sigue visible en fondo oscuro */
            var stroke = sketch > 0.5 ? 'var(--sketch-ink, ' + pose.color + ')' : '';
            if (fill !== eye.lastFill) { eye.node.setAttribute('fill', fill); eye.lastFill = fill; }
            if (stroke !== eye.lastStroke) { eye.node.style.stroke = stroke; eye.lastStroke = stroke; }
            return;
         }

         /* ---- iris: recorte de párpara + deslizamiento del globo ocular ---- */

         /* Criterio real de cierre: grosor del contorno × apertura.
          * Modo pestaña (effOpen < 0.26): línea oscura de pestaña, oculta iris/pupila/punto de luz;
          * Modo ojo pequeño (0.26~0.45): conserva iris y "pupila reducida proporcionalmente",
          *                                solo oculta el punto de luz blanco ——
          *                                la pupila oscura más profunda no desaparece entera en
          *                                expresiones de ojos cerrados / escaneo, la expresividad no se pierde */
         var thick = eye.thick != null ? eye.thick : EYE_HALF * 2 * 0.7;
         var effOpen = open * thick / (EYE_HALF * 2);
         var lash = effOpen < IRIS_LASH;
         var small = !lash && effOpen < IRIS_SMALL;
         if (lash !== eye.lastLash || small !== eye.lastSmall) {
            eye.lastLash = lash;
            eye.lastSmall = small;
            eye.iris.style.display = lash ? 'none' : '';
            eye.pupil.style.display = lash ? 'none' : '';
            for (var lh = 0; lh < eye.hlNodes.length; lh++) {
               eye.hlNodes[lh].node.style.display = (lash || small) ? 'none' : '';
            }
         }
         /* En modo ojo pequeño, la pupila se escala según la apertura (mínimo 0.6×),
            manteniendo la coherencia visual de la pupila en todas las emociones */
         var pupilScl = lash ? 1 : clamp(effOpen / IRIS_SMALL, 0.6, 1);
         /* v2.0: `pupil` en la pose (dilatación emocional) + hippus ±3% a ~3 Hz */
         var pDil = (pose.pupil != null ? pose.pupil : 1) *
                    (1 + 0.03 * Math.sin(performance.now() / 1000 * TAU * 3 + eye.k * 1.7));
         var pupilRNow = eye.pupilR * pupilScl * clamp(pDil, 0.5, 1.6);
         if (pupilRNow !== eye.lastPupilR) {
            eye.pupil.setAttribute('r', r2(pupilRNow));
            eye.lastPupilR = pupilRNow;
         }
         var socketFill = lash ? pose.color : (pupilCfg.socket || 'url(#' + id + 'sc' + k + ')');
         if (socketFill !== eye.lastSocketFill) {
            eye.socket.setAttribute('fill', socketFill);
            eye.lastSocketFill = socketFill;
         }

         var lidTf = open >= 0.995 && open <= 1.005
            ? ''
            : 'translate(' + r2(base[0]) + ' ' + r2(base[1]) + ') scale(1 ' + r2(open) + ') translate(' + r2(-base[0]) + ' ' + r2(-base[1]) + ')';
         if (lidTf !== eye.lastLidTf) {
            if (lidTf) {
               eye.lidClip.setAttribute('transform', lidTf);
               eye.socket.setAttribute('transform', lidTf);
            } else {
               eye.lidClip.removeAttribute('transform');
               eye.socket.removeAttribute('transform');
            }
            eye.lastLidTf = lidTf;
         }

         /* ---- v2.0: sombra del párpado y húmedo reactivos a la apertura ---- */
         if (eye.lidShadow) {
            var shOp = clamp((1.25 - open) * 0.55, 0.12, 0.85);   /* crece al entrecerrar */
            if (shOp !== eye.lastShOp) { eye.lidShadow.setAttribute('opacity', r2(shOp)); eye.lastShOp = shOp; }
         }
         if (eye.tearline) {
            var tlOp = clamp(0.14 + (pose.wet || 0) * 0.46, 0, 0.6);
            if (pose.wet > 0.05) tlOp += 0.08 * Math.sin(performance.now() / 1000 * TAU * 0.8); /* shimmer */
            if (tlOp !== eye.lastTlOp) { eye.tearline.setAttribute('opacity', r2(tlOp)); eye.lastTlOp = tlOp; }
         }

         /* La pupila se desplaza 50% más que la párpara, y se recorta dentro del bbox del anillo
            actual para evitar que se quede como un cuarto de luna recortado por la párpara */
         var travel = eye.irisR * 0.5;
         var px = base[0] + clamp(pose.lookX * 0.5, -travel, travel);
         var py = base[1] + clamp(pose.lookY * 0.55, -travel, travel);
         var bb = eye.bbox;
         if (bb) {
            var pR = eye.pupilR || eye.irisR * 0.5;
            var iPad = (eye.irisR || pR) * 0.32;   /* restricción del iris algo más flexible */
            var padX = Math.max(pR, iPad);
            var visMinY = base[1] + (bb.minY - base[1]) * open;
            var visMaxY = base[1] + (bb.maxY - base[1]) * open;
            px = clampIn(px, bb.minX + padX, bb.maxX - padX);
            py = clampIn(py, visMinY + pR, visMaxY - pR);
         }
         var ballTf = 'translate(' + r2(px - base[0]) + ' ' + r2(py - base[1]) + ')';
         if (ballTf !== eye.lastBallTf) {
            eye.iris.setAttribute('transform', ballTf);
            eye.pupil.setAttribute('transform', ballTf);
            eye.lastBallTf = ballTf;
         }
         eye.iris.setAttribute('cx', r2(base[0]));
         eye.iris.setAttribute('cy', r2(base[1]));
         eye.pupil.setAttribute('cx', r2(base[0]));
         eye.pupil.setAttribute('cy', r2(base[1]));

         /* Punto de luz fijo: posición relativa al centro del ojo (espejo), no sigue el movimiento del ojo */
         for (var hj = 0; hj < eye.hlNodes.length; hj++) {
            var hn = eye.hlNodes[hj];
            hn.node.setAttribute('cx', r2(base[0] + (hn.cfg.dx || 0) * (k === 0 ? 1 : -1)));
            hn.node.setAttribute('cy', r2(base[1] + (hn.cfg.dy || 0)));
         }

         /* Sombra de la párpara: en modo iris, pose.color se usa como color de la línea de la párpara (trazo en modo boceto) */
         var showInner = sketch <= 0.5;
         if (showInner !== eye.lastShowInner) {
            eye.inner.style.display = showInner ? '' : 'none';
            eye.lastShowInner = showInner;
         }
         if (sketch > 0.5) {
            if (!eye.sketchNode) {
               eye.sketchNode = el('path', { fill: 'none', 'stroke-width': '1.6' });
               eye.node.appendChild(eye.sketchNode);
            }
            eye.sketchNode.style.display = '';
            eye.sketchNode.setAttribute('d', ringPath(eye.ring));
            eye.sketchNode.style.stroke = 'var(--sketch-ink, ' + pose.color + ')';
            if (lidTf) eye.sketchNode.setAttribute('transform', lidTf);
            else eye.sketchNode.removeAttribute('transform');
         } else if (eye.sketchNode) {
            eye.sketchNode.style.display = 'none';
         }
      }

      /* ---- por fotograma ---- */
      function applyPose(pose) {
         var b = pose.body;
         var now = performance.now();
         var sketch = b.sketch || 0;

         /* Expresión de giro: la rotación del ángulo es preferible a la flexión ——
          * el cuerpo se inclina ligeramente con el guiñeo + compresión elástica horizontal,
          * creando sensación de perspectiva de moneda giratoria;
          * evita la sensación de "doblez de papel" donde solo se mueven los rasgos y el cuerpo no se mueve */
         var yaw0 = b.yaw || 0;
         var spinTilt = 0, spinSqX = 1;
         if (yaw0 > 0.001 || yaw0 < -0.001) {
            spinTilt = 5 * Math.sin(yaw0);
            spinSqX = 0.88 + 0.12 * Math.abs(Math.cos(yaw0));
         }

         bodyG.setAttribute('transform',
            'translate(' + r2(C + b.x) + ' ' + r2(C + b.y) + ')' +
            ' rotate(' + r2((b.rotate || 0) + spinTilt) + ')' +
            ' scale(' + r2(b.scale * spinSqX) + ' ' + r2(b.scale) + ')' +
            ' translate(' + r2(-C) + ' ' + r2(-C) + ')');
         setBodyColor(b.color);

         /* Sombra del suelo: sigue el desplazamiento horizontal,
            al elevarse del suelo (rebote) se contrae y atenúa */
         var lift = clamp(-b.y / 52, 0, 1);
         var shOp = sketch > 0.5 ? 0 : 0.16 * (1 - 0.55 * lift);
         shadow.setAttribute('opacity', shOp.toFixed(3));
         if (shOp > 0.001) {
            shadow.setAttribute('transform',
               'translate(' + r2(C + b.x * 0.7) + ' ' + shadowCy + ')' +
               ' scale(' + r2((1 - 0.3 * lift) * b.scale) + ' ' + r2(1 - 0.35 * lift) + ')' +
               ' translate(' + (-C) + ' ' + (-shadowCy) + ')');
         }

         /* El modo boceto es un interruptor de visualización: cambiar según el umbral,
            al desactivarse limpiar el trazo del atributo para evitar que los trazos
            temporales de la celebración permanezcan en el relleno sólido */
         var sketchOn = sketch > 0.5;
         if (sketchOn !== (curSketch > 0.5)) {
            curSketch = sketchOn ? 1 : 0;
            applySketchChrome(sketchOn, b.color);
         }

         var yaw = b.yaw || 0;
         setEye(eyeL, pose.left, 0, sketch, yaw);
         setEye(eyeR, pose.right, 1, sketch, yaw);

         if (featureLayer) featureLayer.apply(pose, sketch, yaw, now);

         if (lite) return;

         var dt = prevNow ? clamp((now - prevNow) / 1000, 0.001, 0.05) : 1 / 60;
         prevNow = now;

         /* ---- partículas zzz durante el sueño ---- */
         if (zzzNodes) {
            var zOn = (b.zzz || 0) > 0;
            for (var z = 0; z < zzzNodes.length; z++) {
               var znode = zzzNodes[z];
               if (!zOn) {
                  if (znode.getAttribute('opacity') !== '0') znode.setAttribute('opacity', '0');
                  continue;
               }
               var zp = (now * 0.00033 + z / 3) % 1;
               var zo = (zp < 0.18 ? zp / 0.18 : 1 - (zp - 0.18) / 0.82) * 0.8 * b.zzz;
               znode.setAttribute('opacity', zo.toFixed(3));
               znode.setAttribute('font-size', (12 + zp * 11).toFixed(1));
               znode.setAttribute('transform',
                  'translate(' + r2(186 + zp * 34 + 4 * Math.sin(zp * 9)) + ' ' + r2(52 - zp * 42) + ')' +
                  ' rotate(' + r2(-10 + zp * 14) + ')');
            }
         }

         /* ---- velocidad angular de giro (fuente de disparadores de efectos) ---- */
         var dYaw = yaw - prevYaw;
         if (!isFinite(dYaw) || Math.abs(dYaw) > 1.2) dYaw = 0;
         prevYaw = yaw;
         var vel = dYaw / dt;

         if (fx) {
            fx.update(dt, now, {
               yaw: yaw, dYaw: dYaw, vel: vel,
               orbitWant: (b.orbit || 0) > 0,
               bodyX: b.x, bodyY: b.y
            });
         }
      }

      function burst(count) {
         if (fx) fx.burst(count);
      }
      /* Acción de firma (burbuja de nube / estallido estelar),
         devuelve false si este tema no tiene acción de firma */
      function signature(strength) {
         return fx && fx.signature ? fx.signature(strength) : false;
      }

      function destroy() {
         if (fx) fx.destroy();
         if (svg.parentNode) svg.parentNode.removeChild(svg);
      }

      return { svg: svg, applyPose: applyPose, burst: burst, signature: signature, destroy: destroy,
         signatureMouth: fx && fx.signatureMouth, signatureMouthMs: fx && fx.signatureMouthMs,
         signatureComplete: !!(fx && fx.signatureComplete) };
   }

   MM.createBall = createBall;
   MM.util = { shade: shade, ringPath: ringPath, centroid: centroid };
})();
