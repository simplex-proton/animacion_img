/* ============================================================
 * fx.js —— Capa de efectos (emisores + acción de firma + partículas orbitales)
 *
 * Tres tipos de partículas:
 *   orbitales orbit: órbitas de bajo ángulo, giro constante ("pensando" habitual) + remolino de lanzamento
 *   explosivas burst: partículas físicas únicas (amortiguación de velocidad + microgravedad, "confeti")
 *   emisoras emit: específicas de la acción de firma —— cada tema tiene su propio anclaje y script de comportamiento
 *
 * Acción de firma (signature, sustituto del genérico "girar y lanzar partículas"):
 *   cloudpuff burbuja de nube: un soplo por sector, distintas distancias; clic continuo cambia de dirección.
 *     Burbuja cercana estalla primero, burbuja lejana después.
 *   stardust estrellas explosivas: las estrellas a su alrededor aparecen una a una parpadeando;
 *     órbitas de pensamiento se mezclan con lápiz de rotación
 *
 * Gestión de profundidad: las partículas orbitales cambian entre las capas front/back según su z,
 * al rodear el cuerpo hacia el reverso se ocultan automáticamente (conservando sensación 3D).
 * ============================================================ */
(function () {
   'use strict';

   var MM = (window.MoodMates = window.MoodMates || {});
   var SVGNS = 'http://www.w3.org/2000/svg';
   var TAU = Math.PI * 2;

   function rand(a, b) { return a + Math.random() * (b - a); }
   function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
   function r2(v) { return Math.round(v * 100) / 100; }

   function ringD(ring) {
      var s = 'M';
      for (var i = 0; i < ring.length; i++) {
         s += (i ? 'L' : '') + r2(ring[i][0]) + ' ' + r2(ring[i][1]);
      }
      return s + 'Z';
   }

   /* Silueta de nube miniatura con el mismo generador principal, centrada en el origen, sin punto de luz */
   function cloudSilhouette() {
      if (!MM.geo || !MM.geo.buildBody) return 'M-1 0.2 A1 0.7 0 1 1 1 0.2 A1 0.7 0 1 1 -1 0.2Z';
      return ringD(MM.geo.buildBody({ type: 'cloud', r: 0.2, lobes: 7, amp: 0.08, flat: 0.12, cx: 0, cy: 0 }));
   }

   function el(tag, attrs) {
      var node = document.createElementNS(SVGNS, tag);
      for (var k in attrs) node.setAttribute(k, attrs[k]);
      return node;
   }

   function shuffle(arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
         var j = (Math.random() * (i + 1)) | 0;
         var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
   }

   /* Un soplo por sector; clic continuo rota entre sectores, los clics rápidos reparten a izquierda/derecha y coronilla */
   var PUFF_SECTORS = [
      { mid: -0.28, spread: 0.50 },
      { mid: -1.05, spread: 0.48 },
      { mid: -1.85, spread: 0.50 },
      { mid:  0.22, spread: 0.36 },
      { mid: -2.45, spread: 0.40 },
      { mid: -1.45, spread: 0.36 }
   ];
   var puffMem = { lastAt: 0, queue: [] };

   /* ---------------- Formas geométricas pequeñas ---------------- */

   /* Estrella de 4 puntas */
   var SPARK_PATH = 'M0 -1 C0.12 -0.22 0.22 -0.12 1 0 C0.22 0.12 0.12 0.22 0 1 C-0.12 0.22 -0.22 0.12 -1 0 C-0.22 -0.12 -0.12 -0.22 0 -1 Z';
   /* Estrella de 5 puntas */
   var STAR_PATH = (function () {
      var pts = [];
      for (var e = 0; e < 10; e++) {
         var a = -Math.PI / 2 + e * Math.PI / 5;
         var r = e % 2 === 0 ? 1 : 0.42;
         pts.push((Math.cos(a) * r).toFixed(3) + ' ' + (Math.sin(a) * r).toFixed(3));
      }
      return 'M' + pts.join('L') + 'Z';
   })();
   /* Lápiz (apuntando a la derecha) */
   var PENCIL_PATH = 'M-1 -0.16 L0.5 -0.16 L1 0 L0.5 0.16 L-1 0.16 Z M-1 -0.16 L-0.78 -0.16 L-0.78 0.16 L-1 0.16 Z';

   /* ---------------- Definiciones de temas ----------------
    * colors        paleta predeterminada (palette.fx puede sobreponerse)
    * makeOrbitNode nodo de partícula orbital (tamaño unitario, escalar con transform)
    * makeBurstNode nodo de partícula explosiva
    * orbitSpecial  opcional: partícula especial mezclada en órbitas de pensamiento (como lápiz), probabilidad chance
    * signature(api, strength)  acción de firma: usar api.emit para lanzar partículas */
   var SKINS = {

      /* ===== Burbuja de nube (nube·genérica)===== */
      cloudpuff: {
         colors: ['#C3D4F2', '#9FB3D6', '#F5D889', '#9A8AE8'],
         orbitSize: [2.8, 4.4],
         burstSize: [3, 5.4],
         makeOrbitNode: function (c) { return el('circle', { r: 1, fill: c, opacity: 0.9, class: 'mm-spark' }); },
         makeBurstNode: function (c) {
            return Math.random() < 0.3
               ? el('path', { d: SPARK_PATH, fill: c, class: 'mm-spark' })
               : el('circle', { r: 1, fill: c, opacity: 0.9, class: 'mm-spark' });
         },
         /* La firma es la escena completa: al celebrar se deja de apilar giro / confeti */
         signatureComplete: true,
         /* Burbuja: un soplo por sector. Salen primero las que están más lejos,
            después las más cercanas; las cercanas estallan primero, las lejanas después.
          * Clics continuos cambian de sector; clics rápidos reparten a izquierda/derecha y coronilla. */
         signature: function (api, strength) {
            var full = strength >= 0.78;
            var C = api.C;
            var cloudD = cloudSilhouette();
            var mouth = api.anchors && api.anchors.mouth;
            var x0 = mouth ? mouth.x + 6 : C + 10;
            var y0 = mouth ? mouth.y : C + 32;
            var halfW = (api.anchors && api.anchors.halfW) || 104;
            var topSpan = api.anchors && api.anchors.top ? (C - api.anchors.top.y) : 104;
            var bodyR = Math.max(halfW, topSpan);
            var now = performance.now();

            function easeOut(t) { return 1 - Math.pow(1 - t, 4); }

            function emitPop(delay, x, y) {
               var ang = rand(-2.2, 0.4);
               api.emit(el('circle', { r: 1, class: 'mm-speck' }), {
                  delay: delay, x: x, y: y, max: 0.24,
                  step: function (p, dt, u) {
                     var e = 1 - Math.pow(1 - u, 3);
                     var px = x + api.state.bodyX + Math.cos(ang) * 8 * e;
                     var py = y + api.state.bodyY + Math.sin(ang) * 8 * e - 6 * u;
                     p.node.setAttribute('opacity', ((1 - u) * 0.55).toFixed(3));
                     p.node.setAttribute('transform',
                        'translate(' + px.toFixed(2) + ' ' + py.toFixed(2) + ') scale(' + (1.6 * (1 - 0.4 * u)).toFixed(2) + ')');
                  }
               });
            }

            function emitBubble(opt) {
               var destX = C + Math.cos(opt.ang) * (bodyR + opt.clear);
               var destY = C + Math.sin(opt.ang) * (bodyR + opt.clear);
               var travel = opt.travel;
               var hang = opt.hang;
               var pop = 0.26;
               var life = travel + hang + pop;
               var drift = opt.drift;
               var wx = opt.wx, wy = opt.wy, wp = opt.wp;
               var g = el('g', {});
               g.appendChild(el('path', { d: cloudD, class: 'mm-bubble' }));
               g.appendChild(el('ellipse', {
                  cx: -5.2, cy: -7.4, rx: 3.1, ry: 2.1, class: 'mm-sheen'
               }));
               api.emit(g, {
                  delay: opt.delay, x: x0, y: y0, max: life,
                  step: function (p, dt, u) {
                     var t = u * life;
                     var x, y, s, op;
                     if (t < travel) {
                        var k = easeOut(t / travel);
                        x = x0 + (destX - x0) * k;
                        y = y0 + (destY - y0) * k;
                        var grow = Math.min(1, t / 0.1);
                        s = 0.18 + 0.82 * grow;
                        op = 0.82 * grow;
                     } else if (t < travel + hang) {
                        var h = (t - travel) / hang;
                        x = destX + Math.sin(t * wx + wp) * 2.4;
                        y = destY - h * drift + Math.sin(t * wy + wp) * 1.6;
                        s = 1 + 0.04 * Math.sin(t * 7 + wp);
                        op = 0.82;
                     } else {
                        var pk = (t - travel - hang) / pop;
                        x = destX + Math.sin((travel + hang) * wx + wp) * 2.4;
                        y = destY - drift + Math.sin((travel + hang) * wy + wp) * 1.6;
                        s = pk < 0.34 ? 1 + 0.4 * (pk / 0.34) : 1.4 * Math.max(0, 1 - (pk - 0.34) / 0.66);
                        op = pk < 0.22 ? 0.82 : 0.82 * Math.max(0, 1 - (pk - 0.22) / 0.78);
                     }
                     x += api.state.bodyX;
                     y += api.state.bodyY;
                     p.node.setAttribute('opacity', op.toFixed(3));
                     p.node.setAttribute('transform',
                        'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ') scale(' + (opt.size * s).toFixed(3) + ')');
                  }
               });
               emitPop(opt.delay + (travel + hang) * 1000, destX, destY - drift * 0.65);
            }

            /* Una exhalación: las que salen primero van más lejos, las que salen después van más cerca;
               las burbujas se rompen al revés, las cercanas primero */
            function emitBreath(sec, n) {
               var slots = n >= 4
                  ? ['far', 'mid', 'far', 'near']
                  : n === 3 ? ['far', 'mid', 'near'] : ['mid', 'near'];
               var delays = n >= 4
                  ? [0, rand(42, 78), rand(105, 160), rand(180, 255)]
                  : n === 3 ? [0, rand(50, 90), rand(130, 200)] : [0, rand(60, 110)];
               for (var i = 0; i < n; i++) {
                  var kind = slots[i];
                  var clear, travel, hang, size;
                  if (kind === 'far') {
                     clear = rand(52, 72);
                     travel = rand(0.48, 0.62);
                     hang = rand(0.68, 0.92);
                     size = rand(0.42, 0.54);
                  } else if (kind === 'mid') {
                     clear = rand(32, 46);
                     travel = rand(0.30, 0.40);
                     hang = rand(0.42, 0.60);
                     size = rand(0.50, 0.62);
                  } else {
                     clear = rand(18, 28);
                     travel = rand(0.18, 0.26);
                     hang = rand(0.22, 0.36);
                     size = rand(0.58, 0.72);
                  }
                  var bias = (i / Math.max(1, n - 1) - 0.5) * 1.15;
                  emitBubble({
                     delay: delays[i],
                     ang: sec.mid + bias * sec.spread + rand(-0.08, 0.08),
                     clear: clear,
                     travel: travel,
                     hang: hang,
                     size: size,
                     drift: kind === 'far' ? rand(10, 18) : kind === 'mid' ? rand(6, 11) : rand(3, 7),
                     wx: rand(4.2, 7.5),
                     wy: rand(3.4, 6.2),
                     wp: rand(0, 6.3)
                  });
               }
            }

            if (!full) {
               emitBreath(PUFF_SECTORS[(Math.random() * 3) | 0], 2);
               return true;
            }

            if (now - puffMem.lastAt > 1200) puffMem.queue = [];
            puffMem.lastAt = now;
            if (!puffMem.queue.length) {
               puffMem.queue = [PUFF_SECTORS[0]].concat(shuffle(PUFF_SECTORS.slice(1)));
            }
            emitBreath(puffMem.queue.shift(), 4);
            return true;
         }
      },

      /* ===== Asteroide (brillante · educativo)===== */
      stardust: {
         colors: ['#F5B840', '#F7D07A', '#F09A4E', '#FBE3A8'],
         orbitSize: [3.4, 5.6],
         burstSize: [3, 6.4],
         makeOrbitNode: function (c) { return el('path', { d: SPARK_PATH, fill: c, class: 'mm-spark' }); },
         makeBurstNode: function (c) {
            return Math.random() < 0.4
               ? el('path', { d: STAR_PATH, fill: c, class: 'mm-spark' })
               : el('path', { d: SPARK_PATH, fill: c, class: 'mm-spark' });
         },
         /* Ocasionalmente se mezcla un lápiz de rotación en las órbitas de pensamiento */
         orbitSpecial: {
            chance: 0.3,
            make: function (c) {
               var g = el('g', {});
               g.appendChild(el('path', { d: PENCIL_PATH, fill: '#E8A64C' }));
               g.appendChild(el('path', { d: 'M0.5 -0.16 L1 0 L0.5 0.16 Z', fill: '#5C4632' }));
               return g;
            },
            size: [5, 6.5]
         },
         signature: function (api, strength) {
            var n = Math.round(10 * strength);
            for (var i = 0; i < n; i++) {
               (function (i) {
                  var ang = TAU * i / n + rand(-0.2, 0.2);
                  var rr = rand(96, 126);
                  var x0 = api.C + api.state.bodyX + Math.cos(ang) * rr;
                  var y0 = api.C + api.state.bodyY + Math.sin(ang) * rr * 0.92;
                  var size = rand(3.4, 6.2);
                  var spin = rand(-140, 140);
                  var big = Math.random() < 0.45;
                  api.emit(el('path', { d: big ? STAR_PATH : SPARK_PATH, fill: api.pick(), class: 'mm-spark' }), {
                     delay: i * 55,
                     x: x0, y: y0,
                     max: rand(0.75, 1.15),
                     step: function (p, dt, u) {
                        p.y -= 14 * dt;
                        /* Rebote de entrada → parpadeo → encoger y desaparecer */
                        var s = u < 0.22 ? size * (u / 0.22) * 1.25 : size * (1 - 0.35 * (u - 0.22) / 0.78);
                        var tw = 0.75 + 0.25 * Math.sin(u * 26 + i);
                        p.node.setAttribute('opacity', ((1 - Math.pow(u, 2.2)) * tw).toFixed(3));
                        p.node.setAttribute('transform',
                           'translate(' + p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ') rotate(' + (spin * u).toFixed(1) + ') scale(' + s.toFixed(3) + ')');
                     }
                  });
               })(i);
            }
            return true;
         }
      }
   };


   function createFx(ctx) {
      var C = ctx.C;
      var skin = SKINS[ctx.skin] || SKINS.cloudpuff;
      var colors = (ctx.palette && ctx.palette.fx) || skin.colors;
      var back = ctx.back, front = ctx.front;
      var anchors = ctx.anchors || {
         mouth: { x: C, y: C + 36 }, top: { x: C, y: C - 104 },
         bottom: { x: C, y: C + 104 }, halfW: 104
      };

      var orbiters = [];    /* Partículas orbitales/rotacionales */
      var pieces = [];      /* Partículas explosivas */
      var emits = [];       /* Partículas de acción de firma */
      var wasFast = false;
      var spawnAt = [];
      var spinPlane = null;
      var orbitNextAt = 0;
      var lastState = { yaw: 0, dYaw: 0, vel: 0, orbitWant: false, bodyX: 0, bodyY: 0 };

      function pick(arr) { return (arr || colors)[(Math.random() * (arr || colors).length) | 0]; }

      function orbitPoint(o, lam) {
         var hx = o.rad * Math.sin(lam);
         var hy = -o.rad * Math.cos(lam) * Math.sin(o.tilt);
         var ca = Math.cos(o.roll), sa = Math.sin(o.roll);
         return {
            x: C + hx * ca - hy * sa,
            y: C + hx * sa + hy * ca,
            z: Math.cos(lam) * Math.cos(o.tilt),
            l: lam
         };
      }

      /** mode: 'spin' (lanzamiento único) | 'orbit' (órbita constante) */
      function spawnOrbiter(mode, cfg) {
         if (orbiters.length > 26) return;
         var special = mode === 'orbit' && skin.orbitSpecial && Math.random() < skin.orbitSpecial.chance;
         var node = special ? skin.orbitSpecial.make(pick()) : skin.makeOrbitNode(pick());
         front.appendChild(node);
         var sz = special ? skin.orbitSpecial.size : skin.orbitSize;
         orbiters.push(Object.assign({
            node: node, inFront: true, mode: mode,
            life: 0, max: mode === 'spin' ? rand(1.1, 2) : Infinity,
            ret: 0,
            size: rand(sz[0], sz[1]),
            rotSpd: special ? rand(40, 80) : rand(-160, 160),
            rot: rand(0, 360)
         }, cfg));
      }

      function spawnSpinGroup(yaw, dir) {
         spinPlane = {
            tilt: rand(0.18, 0.5),
            roll: rand(-0.7, 0.7)
         };
         var n = Math.round(rand(5, 8));
         spawnAt = [];
         for (var q = 0; q < n; q++) spawnAt.push({ at: performance.now() + q * rand(45, 90), dir: dir, yaw: yaw });
      }

      function releaseSpinOne(item, yaw) {
         spawnOrbiter('spin', {
            o: {
               lam: yaw - rand(0, 0.2) * item.dir,
               lamVel: item.dir * rand(2.2, 4.2),
               tilt: spinPlane.tilt + rand(-0.06, 0.06),
               roll: spinPlane.roll + rand(-0.08, 0.08),
               rad: rand(118, 142),
               radVel: rand(14, 40)
            }
         });
      }

      function removeOrbiter(idx) {
         orbiters[idx].node.remove();
         orbiters.splice(idx, 1);
      }

      /* ---- Confeti ---- */
      function burst(count) {
         count = count || 20;
         for (var i = 0; i < count && pieces.length < 56; i++) {
            var ang = (i / count) * TAU + rand(-0.35, 0.35);
            var spd = rand(170, 360);
            var node = skin.makeBurstNode(pick());
            front.appendChild(node);
            pieces.push({
               x: C + Math.cos(ang) * rand(96, 118),
               y: C + Math.sin(ang) * rand(96, 118),
               vx: Math.cos(ang) * spd,
               vy: Math.sin(ang) * spd - rand(20, 75),
               life: 0, max: rand(0.45, 0.9),
               r: rand(skin.burstSize[0], skin.burstSize[1]),
               rot: rand(0, 360), vr: rand(-260, 260),
               el: node
            });
         }
      }

      /* ---- Emisor de acción de firma ---- */
      var emitApi = {
         C: C,
         defs: ctx.defs,
         anchors: anchors,
         state: lastState,
         pick: function () { return pick(); },
         orbitPoint: function (o, lam) { return orbitPoint(o, lam); },
         emit: function (node, cfg) {
            if (emits.length > 80) { return; }
            node.setAttribute('opacity', '0');
            front.appendChild(node);
            emits.push({
               node: node,
               x: cfg.x, y: cfg.y,
               born: performance.now() + (cfg.delay || 0),
               life: 0, max: cfg.max || 1,
               step: cfg.step,
               cleanup: cfg.cleanup
            });
         }
      };

      function signature(strength) {
         if (!skin.signature) return false;
         return skin.signature(emitApi, strength || 1) === true;
      }

      /* ---- Por fotograma ---- */
      function update(dt, now, state) {
         lastState.yaw = state.yaw;
         lastState.dYaw = state.dYaw;
         lastState.vel = state.vel;
         lastState.orbitWant = state.orbitWant;
         lastState.bodyX = state.bodyX || 0;
         lastState.bodyY = state.bodyY || 0;

         var vel = state.vel;
         var fast = Math.abs(vel) >= 0.9;
         var dir = vel >= 0 ? 1 : -1;

         /* Aceleración de giro: lanzar un grupo escalonado de partículas */
         if (fast && !wasFast) spawnSpinGroup(state.yaw, dir);
         if (!fast) spawnAt.length = 0;
         wasFast = fast;
         if (Math.abs(vel) >= 5) {
            while (spawnAt.length && now >= spawnAt[0].at) {
               releaseSpinOne(spawnAt.shift(), state.yaw);
            }
         }

         /* Reposición de órbitas constantes: escalonado de 5 partículas */
         if (state.orbitWant && now >= orbitNextAt) {
            var orbitCount = 0;
            for (var oc = 0; oc < orbiters.length; oc++) if (orbiters[oc].mode === 'orbit') orbitCount++;
            if (orbitCount < 5) {
               spawnOrbiter('orbit', {
                  o: {
                     lam: rand(0, TAU),
                     lamVel: (Math.random() < 0.5 ? -1 : 1) * rand(1.5, 2.2),
                     tilt: rand(0.1, 0.24),
                     roll: rand(-0.12, 0.12),
                     rad: rand(122, 146),
                     radVel: 0
                  }
               });
            }
            orbitNextAt = now + 420;
         }

         /* Avance de partículas orbitales */
         for (var ti = orbiters.length - 1; ti >= 0; ti--) {
            var ob = orbiters[ti];
            ob.life += dt;
            var retreat = ob.mode === 'orbit' ? !state.orbitWant : ob.life > ob.max;
            ob.ret = clamp(ob.ret + (retreat ? dt / 0.4 : -dt / 0.3), 0, 1);
            if (retreat && ob.ret >= 1) { removeOrbiter(ti); continue; }

            var o = ob.o;
            o.lam += o.lamVel * dt + (ob.mode === 'spin' ? state.dYaw * 0.55 : state.dYaw * 0.2);
            if (ob.mode === 'spin') {
               o.lamVel *= Math.exp(-1.1 * dt);
               o.rad += o.radVel * dt;
               o.radVel *= Math.exp(-1.6 * dt);
            }
            ob.rot += ob.rotSpd * dt;

            var p = orbitPoint(o, o.lam);
            /* Cambio de capa por profundidad: z < 0 pasa a la capa trasera y es ocultado por el cuerpo */
            var wantFront = p.z >= 0;
            if (wantFront !== ob.inFront) {
               (wantFront ? front : back).appendChild(ob.node);
               ob.inFront = wantFront;
            }
            var grow = Math.min(ob.life / 0.3, 1);
            grow = grow * grow * (3 - 2 * grow);
            var depth = 0.68 + 0.32 * clamp(p.z, 0, 1);
            var s = ob.size * depth * grow * (1 - 0.8 * ob.ret * ob.ret);
            if (s < 0.25) { ob.node.setAttribute('opacity', '0'); continue; }
            ob.node.setAttribute('opacity', ((1 - ob.ret) * (0.55 + 0.45 * depth)).toFixed(3));
            ob.node.setAttribute('transform',
               'translate(' + p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ')' +
               ' rotate(' + ob.rot.toFixed(1) + ')' +
               ' scale(' + s.toFixed(3) + ')');
         }

         /* Avance de partículas explosivas: amortiguación de velocidad + microgravedad */
         for (var ci = pieces.length - 1; ci >= 0; ci--) {
            var pc = pieces[ci];
            pc.life += dt;
            if (pc.life >= pc.max) {
               pc.el.remove();
               pieces.splice(ci, 1);
               continue;
            }
            pc.x += pc.vx * dt;
            pc.y += pc.vy * dt;
            var drag = Math.pow(0.94, 60 * dt);
            pc.vx *= drag;
            pc.vy = pc.vy * drag + 40 * dt;
            pc.rot += pc.vr * dt;
            var u = pc.life / pc.max;
            var fd = u < 0.1 ? u / 0.1 : Math.pow(1 - (u - 0.1) / 0.9, 1.7);
            var sz = Math.max(pc.r * (1 - 0.4 * u), 0.4);
            pc.el.setAttribute('opacity', fd.toFixed(3));
            pc.el.setAttribute('transform',
               'translate(' + pc.x.toFixed(2) + ' ' + pc.y.toFixed(2) + ') rotate(' + pc.rot.toFixed(1) + ') scale(' + sz.toFixed(3) + ')');
         }

         /* Avance de partículas de acción de firma */
         for (var ei = emits.length - 1; ei >= 0; ei--) {
            var em = emits[ei];
            if (now < em.born) continue;
            em.life += dt;
            if (em.life >= em.max) {
               em.node.remove();
               if (em.cleanup) em.cleanup();
               emits.splice(ei, 1);
               continue;
            }
            em.step(em, dt, em.life / em.max, em.life);
         }
      }

      function destroy() {
         orbiters.forEach(function (o) { o.node.remove(); });
         pieces.forEach(function (p) { p.el.remove(); });
         emits.forEach(function (e) { e.node.remove(); if (e.cleanup) e.cleanup(); });
         orbiters.length = 0;
         pieces.length = 0;
         emits.length = 0;
      }

      return { update: update, burst: burst, signature: signature, destroy: destroy,
         signatureMouth: skin.signatureMouth || null,
         signatureMouthMs: skin.signatureMouthMs || 0,
         signatureComplete: !!skin.signatureComplete };
   }

   createFx.registerSkin = function (name, def) { SKINS[name] = def; };
   createFx.skins = function () { return Object.keys(SKINS); };

   MM.createFx = createFx;
})();
