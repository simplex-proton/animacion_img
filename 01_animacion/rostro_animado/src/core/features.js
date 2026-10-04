/* ============================================================
 * features.js —— Sistema de rasgos faciales y accesorios enlazados
 *
 * Rasgos faciales:
 *   boca: anillo lens de 24 puntos, engine interpola punto por punto
 *   (pose.face.mouthRing), esta capa se encarga de proyectar a la silueta
 *   (longitud horizontal + ocultación del reverso, misma proyección que los ojos)
 *   rubor: dos elipses, opacidad controlada por pose.face.blush (0~1)
 *   cejas: dos segmentos lens cortos, ángulo / elevación controlados por
 *   pose.face.browTilt / browRaise
 *
 * Sistema de accesorios: los accesorios no son path estáticos, sino componentes
 * con anclaje ——
 *   kind: 'glasses'  gafas: montura calculada automáticamente (autoFit) a partir
 *                    de la posición/eforma real de los ojos,
 *                    sigue la mirada 75% (los ojos se desplazan dentro de la
 *                    montura con paralaje),
 *                    al parpadear la montura resbala ligeramente y rebote,
 *                    barrido de luz periódico (glint)
 *   kind: 'path'     path personalizado: anclaje ('face' proyección contra el
 *                    rostro / 'abs' coordenadas absolutas del cuerpo)
 *                    + micro animación (float flotar / swing balancear)
 *
 * Llamado desde render.js:
 *   var layer = MM.createFeatures(bodyG, feats, ctx)
 *   layer.back / layer.mid / layer.front —— tres puntos de montaje (pueden ser null)
 *   layer.apply(pose, sketch, yaw, now)  —— actualización por fotograma
 * ============================================================ */
(function () {
   'use strict';

   var MM = (window.MoodMates = window.MoodMates || {});
   var TAU = Math.PI * 2;

   function createFeatures(bodyG, feats, ctx) {
      var el = ctx.el, ringPath = ctx.ringPath, r2 = ctx.r2, clamp = ctx.clamp, shade = ctx.shade;
      var C = ctx.C, face = ctx.face, palette = ctx.palette, eyeStyle = ctx.eyeStyle;

      var back = null, mid = null, front = el('g', { 'pointer-events': 'none' });
      var updaters = [];   /* Conjunto de callbacks por fotograma (accesorios enlazados) */

      function ensureBack() {
         if (!back) back = el('g', { 'pointer-events': 'none' });
         return back;
      }

      /* Conversión de longitud horizontal (misma proyección que los ojos),
         devuelve null si se ha girado hacia el reverso */
      function project(ox, oy, yaw) {
         var sil = ctx.silAt(oy);
         var cx0 = (sil[0] + sil[1]) / 2;
         var hw = Math.max((sil[1] - sil[0]) / 2, 12);
         var theta = clamp(ox / hw, -1.15, 1.15);
         var total = theta + (yaw || 0);
         var cn = Math.cos(total);
         if (cn <= 0.02) return null;
         return { x: cx0 + hw * Math.sin(total) * 0.985, cn: cn };
      }

      /* Ancla estática de los ojos en coordenadas del plano (base para autoFit) */
      function eyeAnchor(side) {   /* side: -1 izquierda / 1 derecha */
         return {
            ox: face.x + side * eyeStyle.dx * face.sx,             /* desplazamiento relativo al eje central */
            y: C + face.y + (eyeStyle.cy - C) * face.sy            /* coordenada vertical en el plano */
         };
      }

      /* Evaluación de micro animación: devuelve { dy, rot } */
      function microVal(micro, now, seed) {
         if (!micro) return { dy: 0, rot: 0 };
         var ph = TAU * now / (micro.period || 3000) + (seed || 0);
         if (micro.type === 'float') return { dy: (micro.amp != null ? micro.amp : 1.6) * Math.sin(ph), rot: 0 };
         if (micro.type === 'swing') return { dy: 0, rot: (micro.amp != null ? micro.amp : 4) * Math.sin(ph) };
         return { dy: 0, rot: 0 };
      }

      /* ================= Constructores de accesorios ================= */

      var ACC_BUILDERS = {

         /* ---- Gafas: montura doble autoFit + puente + brazos externos + barrido de luz ---- */
         glasses: function (acc) {
            var aL = eyeAnchor(-1), aR = eyeAnchor(1);
            var rr = (Math.max(eyeStyle.w, eyeStyle.h) / 2) * face.eye * (acc.fit != null ? acc.fit : 1.22) + 2;
            var color = acc.color || '#C9A24B';
            var sw = acc.strokeWidth != null ? acc.strokeWidth : 2.6;

            var g = el('g', { 'pointer-events': 'none' });
            var lensG = [null, null];
            var glintNodes = [];

            [aL, aR].forEach(function (a, idx) {
               var lg = el('g', {});
               /* Sensación de cristal: relleno blanco muy tenue */
               lg.appendChild(el('circle', { r: r2(rr), fill: '#FFFFFF', 'fill-opacity': 0.07 }));
               /* Montura */
               lg.appendChild(el('circle', {
                  r: r2(rr), fill: 'none', stroke: color, 'stroke-width': sw
               }));
               /* Barrido de luz: rayo brillante, clip dentro de la montura */
               var clipId = ctx.uid + 'gls' + idx;
               var cp = el('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
               cp.appendChild(el('circle', { cx: 0, cy: 0, r: r2(rr - sw / 2) }));
               ctx.defs.appendChild(cp);
               var glintWrap = el('g', { 'clip-path': 'url(#' + clipId + ')' });
               var glint = el('rect', {
                  x: r2(-rr * 0.22), y: r2(-rr * 1.6), width: r2(rr * 0.34), height: r2(rr * 3.2),
                  fill: '#FFFFFF', opacity: 0.55, transform: 'rotate(24)'
               });
               glintWrap.appendChild(glint);
               lg.appendChild(glintWrap);
               glintNodes.push(glint);
               lensG[idx] = lg;
               g.appendChild(lg);
            });

            /* Arco del puente + brazos externos cortos (formas estáticas, siguen al grupo de transformación) */
            var bridge = el('path', { fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-linecap': 'round' });
            var armL = el('path', { fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-linecap': 'round' });
            var armR = el('path', { fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-linecap': 'round' });
            g.appendChild(bridge);
            g.appendChild(armL);
            g.appendChild(armR);

            var slide = 0;   /* Estado elástico de deslizamiento al parpadear */

            return {
               node: g,
               layer: 'front',
               update: function (pose, sketch, yaw, now) {
                  var f = pose.face || {};
                  var openMin = Math.min(pose.left.open != null ? pose.left.open : 1,
                                         pose.right.open != null ? pose.right.open : 1);
                  /* Deslizamiento al parpadear: el grado de cierre impulsa el desplazamiento objetivo,
                     suavizado exponencialmente con rebote */
                  var slideT = clamp(1 - openMin, 0, 1) * 1.8;
                  slide += (slideT - slide) * 0.25;

                  /* Seguimiento de la mirada 75% + leve flotación */
                  var mv = microVal(acc.micro || { type: 'float', amp: 0.7, period: 3400 }, now, 1.3);
                  var lookX = (pose.left.lookX || 0) * 0.75;
                  var lookY = (pose.left.lookY || 0) * 0.75;
                  var byv = (aL.y + aR.y) / 2 + lookY + slide + mv.dy;

                  var pL = project(aL.ox + lookX, byv, yaw);
                  var pR = project(aR.ox + lookX, byv, yaw);
                  if (!pL && !pR) { g.style.display = 'none'; return; }
                  g.style.display = '';
                  g.setAttribute('opacity', sketch > 0.5 ? '0.55' : '1');

                  var scl = face.eye;
                  [pL, pR].forEach(function (p, idx) {
                     var lg = lensG[idx];
                     if (!p) { lg.style.display = 'none'; return; }
                     lg.style.display = '';
                     lg.setAttribute('transform',
                        'translate(' + r2(p.x) + ' ' + r2(byv) + ') scale(' + r2(p.cn * scl) + ' ' + r2(scl) + ')');
                  });

                  /* Barrido de luz: cada glintPeriod, barre de izquierda a derecha en 0.5s */
                  var per = acc.glintPeriod || 5200;
                  var gp = (now % per) / per;
                  var sweep = gp < 0.1 ? gp / 0.1 : -1;
                  for (var gi = 0; gi < glintNodes.length; gi++) {
                     if (sweep < 0) { glintNodes[gi].setAttribute('opacity', '0'); continue; }
                     glintNodes[gi].setAttribute('opacity', (0.5 * Math.sin(Math.PI * sweep)).toFixed(3));
                     glintNodes[gi].setAttribute('transform',
                        'translate(' + r2((sweep * 2 - 1) * rr * 1.3) + ' 0) rotate(24)');
                  }

                  /* Puente: arco superior entre los bordes internos de las monturas;
                     brazos: líneas cortas hacia fuera y arriba */
                  if (pL && pR) {
                     var x1 = pL.x + rr * pL.cn * scl, x2 = pR.x - rr * pR.cn * scl;
                     bridge.style.display = '';
                     bridge.setAttribute('d',
                        'M' + r2(x1) + ' ' + r2(byv) +
                        ' Q' + r2((x1 + x2) / 2) + ' ' + r2(byv - rr * 0.55) + ' ' + r2(x2) + ' ' + r2(byv));
                  } else {
                     bridge.style.display = 'none';
                  }
                  if (pL) {
                     var xa = pL.x - rr * pL.cn * scl;
                     armL.style.display = '';
                     armL.setAttribute('d', 'M' + r2(xa) + ' ' + r2(byv) + ' L' + r2(xa - 7 * pL.cn) + ' ' + r2(byv - 3));
                  } else armL.style.display = 'none';
                  if (pR) {
                     var xb = pR.x + rr * pR.cn * scl;
                     armR.style.display = '';
                     armR.setAttribute('d', 'M' + r2(xb) + ' ' + r2(byv) + ' L' + r2(xb + 7 * pR.cn) + ' ' + r2(byv - 3));
                  } else armR.style.display = 'none';
               }
            };
         },

         /* ---- Path personalizado: anclaje 'abs' (coordenadas del cuerpo, defecto) / 'face' (proyección contra el rostro) ---- */
         path: function (acc) {
            var node = el('path', {
               d: acc.d,
               fill: acc.fill || 'none',
               stroke: acc.stroke || 'none',
               'stroke-width': acc.strokeWidth != null ? acc.strokeWidth : 0,
               'stroke-linecap': 'round',
               'stroke-linejoin': 'round',
               opacity: acc.opacity != null ? acc.opacity : 1
            });
            var seed = acc.seed != null ? acc.seed : Math.random() * TAU;

            return {
               node: node,
               layer: acc.layer || 'front',
               update: function (pose, sketch, yaw, now) {
                  var mv = microVal(acc.micro, now, seed);
                  if (acc.anchor === 'face') {
                     var byv = C + face.y + (acc.dy || 0) * face.sy + mv.dy;
                     var p = project((acc.dx || 0) * face.sx, byv, yaw);
                     if (!p) { node.style.display = 'none'; return; }
                     node.style.display = '';
                     node.setAttribute('transform',
                        'translate(' + r2(p.x) + ' ' + r2(byv) + ')' +
                        (mv.rot ? ' rotate(' + r2(mv.rot) + ')' : '') +
                        ' scale(' + r2(p.cn) + ' 1)');
                  } else if (acc.micro) {
                     node.setAttribute('transform',
                        'translate(' + r2(acc.dx || 0) + ' ' + r2((acc.dy || 0) + mv.dy) + ')' +
                        (mv.rot ? ' rotate(' + r2(mv.rot) + ' ' + r2(acc.pivotX || C) + ' ' + r2(acc.pivotY || C) + ')' : ''));
                  } else if (acc.transform) {
                     node.setAttribute('transform', acc.transform);
                  }
               }
            };
         }
      };

      (feats.accessories || []).forEach(function (acc) {
         var kind = acc.kind || 'path';
         var builder = ACC_BUILDERS[kind];
         if (!builder) { console.warn('[MoodMates] Tipo de accesorio desconocido: ' + kind); return; }
         var built = builder(acc);
         var target = (acc.layer || built.layer) === 'back' ? ensureBack() : front;
         target.appendChild(built.node);
         if (built.update) updaters.push(built.update);
      });

      /* ---------------- Rubor ---------------- */
      var blushL = null, blushR = null, blushCfg = null;
      if (feats.blush !== false) {
         blushCfg = Object.assign(
            { dx: 34, dy: 26, rx: 11, ry: 6.5, color: palette.blush || '#F2A9A0', max: 0.85 },
            feats.blush === true ? {} : (feats.blush || {})
         );
         mid = el('g', { 'pointer-events': 'none' });
         blushL = el('ellipse', { rx: blushCfg.rx, ry: blushCfg.ry, fill: blushCfg.color, opacity: '0' });
         blushR = el('ellipse', { rx: blushCfg.rx, ry: blushCfg.ry, fill: blushCfg.color, opacity: '0' });
         mid.appendChild(blushL);
         mid.appendChild(blushR);
      }

      /* ---------------- Cejas ---------------- */
      var browL = null, browR = null, browCfg = null, browRing = null;
      if (feats.brows) {
         browCfg = Object.assign(
            { w: 16, h: 3.4, gap: 10, color: palette.eye, always: false, bend: 0.35 },
            feats.brows === true ? {} : feats.brows
         );
         browRing = MM.geo.lens(0, 0, { w: browCfg.w, h: browCfg.h, bend: browCfg.bend, taper: 0.7 });
         browL = el('path', { d: ringPath(browRing), fill: browCfg.color });
         browR = el('path', { d: ringPath(browRing), fill: browCfg.color });
         front.appendChild(browL);
         front.appendChild(browR);
      }

      /* ---------------- Boca ---------------- */
      var mouthNode = null, mouthCfg = null, lastMouthRing = null;
      if (feats.mouth) {
         mouthCfg = Object.assign(
            { dy: 36, color: palette.mouth || palette.eye },
            feats.mouth === true ? {} : feats.mouth
         );
         mouthNode = el('path', { fill: mouthCfg.color, stroke: 'none' });
         front.appendChild(mouthNode);
      }

      /* ---------------- Por fotograma ---------------- */
      function apply(pose, sketch, yaw, now) {
         var f = pose.face || {};

         /* Rubor: simetría horizontal según posición de los ojos;
            opacidad = valor blush × límite */
         if (blushL) {
            var bv = clamp(f.blush || 0, 0, 1) * blushCfg.max * (sketch > 0.5 ? 0.4 : 1);
            if (bv < 0.01) {
               blushL.setAttribute('opacity', '0');
               blushR.setAttribute('opacity', '0');
            } else {
               /* El rubor se pega en las mejillas, sigue la mirada 25% (menos que los ojos, capas de profundidad) */
               var blshX = (pose.left.lookX || 0) * 0.25;
               var by = C + face.y + blushCfg.dy * face.sy + (pose.left.lookY || 0) * 0.25;
               var pL = project(-blushCfg.dx * face.sx + blshX, by, yaw);
               var pR = project(blushCfg.dx * face.sx + blshX, by, yaw);
               blushL.setAttribute('opacity', pL ? bv.toFixed(3) : '0');
               blushR.setAttribute('opacity', pR ? bv.toFixed(3) : '0');
               if (pL) blushL.setAttribute('transform', 'translate(' + r2(pL.x) + ' ' + r2(by) + ') scale(' + r2(pL.cn) + ' 1)');
               if (pR) blushR.setAttribute('transform', 'translate(' + r2(pR.x) + ' ' + r2(by) + ') scale(' + r2(pR.cn) + ' 1)');
            }
         }

         /* Cejas: colocadas encima de los ojos; tilt inverso interno/externo (furiosidad);
          * raise elevación (sorpresa);
          * enlace: siguen la mirada 80% (mismo sentido de desplazamiento que la bola ocular),
          *         al parpadear se relajan y caen */
         if (browL) {
            var vis = clamp(Math.max(f.browVis || 0, browCfg.always ? 1 : 0), 0, 1);
            if (vis < 0.02) {
               browL.setAttribute('opacity', '0');
               browR.setAttribute('opacity', '0');
            } else {
               var bx = browCfg.dx != null ? browCfg.dx : 26;
               var openB = Math.min(pose.left.open != null ? pose.left.open : 1,
                                    pose.right.open != null ? pose.right.open : 1);
               var relax = clamp(1 - openB, 0, 1) * 2.6;   /* Al parpadear, relajación y caída */
               var blkX = (pose.left.lookX || 0) * 0.8;
               var blkY = (pose.left.lookY || 0) * 0.8;
               var byv = C + face.y + ((browCfg.dyTop != null ? browCfg.dyTop : -30) - (f.browRaise || 0)) * face.sy + blkY + relax;
               var tilt = f.browTilt || 0;
               var qL = project(-bx * face.sx + blkX, byv, yaw);
               var qR = project(bx * face.sx + blkX, byv, yaw);
               browL.setAttribute('opacity', qL ? vis.toFixed(3) : '0');
               browR.setAttribute('opacity', qR ? vis.toFixed(3) : '0');
               if (qL) browL.setAttribute('transform',
                  'translate(' + r2(qL.x) + ' ' + r2(byv) + ') rotate(' + r2(-tilt) + ') scale(' + r2(qL.cn * face.eye) + ' ' + r2(face.eye) + ')');
               if (qR) browR.setAttribute('transform',
                  'translate(' + r2(qR.x) + ' ' + r2(byv) + ') rotate(' + r2(tilt) + ') scale(' + r2(qR.cn * face.eye) + ' ' + r2(face.eye) + ')');
            }
         }

         /* Boca: engine pasa el anillo de la boca deformado (coordenadas locales, centrado en 0,0).
          * En modo boceto no se dibuja la boca —— deja solo el contorno y las líneas de los párpados,
          * la imagen se asemeja más a un boceto a mano */
         if (mouthNode) {
            var ring = f.mouthRing;
            if (ring && ring !== lastMouthRing) {
               lastMouthRing = ring;
               mouthNode.setAttribute('d', ringPath(ring));
            }
            var my = C + face.y + (mouthCfg.dy + (f.mouthY || 0)) * face.sy;
            var pm = project((f.mouthX || 0) * face.sx, my, yaw);
            if (!pm || sketch > 0.5) {
               mouthNode.style.display = 'none';
            } else {
               mouthNode.style.display = '';
               mouthNode.setAttribute('transform',
                  'translate(' + r2(pm.x) + ' ' + r2(my) + ')' +
                  ' scale(' + r2((f.mouthSX || 1) * pm.cn * face.eye) + ' ' + r2((f.mouthSY || 1) * face.eye) + ')');
            }
         }

         /* Actualización de accesorios enlazados */
         for (var ui = 0; ui < updaters.length; ui++) {
            updaters[ui](pose, sketch, yaw, now);
         }
      }

      return { back: back, mid: mid, front: front, apply: apply };
   }

   MM.createFeatures = createFeatures;
})();
