/* ============================================================
 * Nimbo Nubes (general) — Nube esponjosa
 *   Concepto definitivo: assets/concepts/concept-nimbo.png alternativa A (azul niebla / lavanda)
 *   Silueta: onda escallopada de 7 bolsillos, achicada en la base como una nube sentada
 *   Personalidad: compañero relajado de ritmo lento, ideal para acompañar / meditar / escenas climáticas
 *   Celebración al hacer clic (no es emoción del catálogo): sopla burbujas de nube de distintos tamaños;
 *   clic repetido cambia de sector, las cercanas estallan primero, las lejanas después
 *   Registro de parámetros de diseño: docs/DESIGN-PROVENANCE.md
 * ============================================================ */
window.MoodMates.characters.register({
  id: 'nimbo',
  name: 'Nubes',
  en: { name: 'Nimbo', desc: 'A puffy scallop-edged cloud that drifts half a beat behind the world and blows cloud bubbles when pleased' },
  industry: 'general',
  desc: 'Nube esponjosa color niebla lavanda, bordes en forma de concha ondulada, al tocar sopla pequeñas burbujas de nube',

  body: { type: 'cloud', r: 0.94, lobes: 7, amp: 0.08, flat: 0.12 },
  face: { x: 0, y: 2, sx: 1, sy: 1, eye: 1 },

  palette: {
    body: '#B4C6EE',
    eye: '#2B3550',
    eyeHighlight: '#FFFFFF',
    blush: '#EFA9B8',
    zzz: '#9FB3D6',
    gloss: 0.2,
    states: {
      base: '#B4C6EE',
      dim: '#95A5CC',
      soft: '#C6D6F5',
      blush: '#E3B8D8',
      angry: '#D96B70',
      alert: '#E25B5B',
      off: '#9AA6C0'
    }
  },

  eyeStyle: {
    dx: 29, cy: 104, w: 26, h: 30,
    taper: 0.55, tilt: -2, bend: 0.1,
    highlight: { dx: 3.5, dy: -6, r: 3.2 }
  },

  features: {
    mouth: { w: 23, dy: 32 },
    blush: { dx: 41, dy: 20, rx: 12, ry: 7, max: 0.8 }
  },

  fxSkin: 'cloudpuff',

  /* Solo se usa al hacer clic en celebrate(), no entra en el catálogo */
  celebrateBeat: {
    expr: 'happy',
    mouth: 'o',
    fade: 240,
    frames: [
      { at: 0,   eyes: { both: { open: 0.95, lookX: 3, lookY: -2 } }, face: { blush: 0.25, mouthSY: 1.08 }, body: { x: 1, y: 1 } },
      { at: 220, eyes: { both: { lookX: 4, lookY: -5 } }, face: { blush: 0.4, mouthSY: 1.1 }, body: { x: 1, y: -1 } },
      { at: 560, eyes: { both: { lookX: 1, lookY: -3, scaleX: 1.06, scaleY: 0.92, y: -2 } }, face: { blush: 0.45, mouthSY: 1 }, body: { x: 0, y: -2, scale: 1.02, color: '@soft' } }
    ]
  },

  /* La nube es más lenta: rotación de espera y respiración más pausas */
  emotions: {
    '02': { poolMs: [12000, 20000], anims: [
      { target: 'eyes', prop: 'lookX', type: 'glance', amp: 8, period: 6400 },
      { target: 'eyes', prop: 'lookY', type: 'sine', amp: 2, period: 5200, phase: 1.1 }
    ] },
    '10': { anims: [
      { target: 'eyes', prop: 'lookY', type: 'glance', amp: 5, period: 3800 },
      { target: 'body', prop: 'y', type: 'sine', amp: 1.8, period: 2000 }
    ] },
    '33': {
      desc: 'Ojos ligeramente entrecerrados de risa, un rubor sutil asciende',
      en: { name: 'Done', desc: 'A quiet smile and a light blush' },
      pool: ['happy', 'happy2'],
      mouth: 'grin',
      body: { y: -2, spinFx: 0, confetti: 0 },
      eyes: { both: { y: -3 } },
      face: { blush: 0.4 }
    }
  }
});
