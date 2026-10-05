/* ============================================================
 * Twinkle Brillo (general) — Estrella redondeada
 *   Concepto definitivo: assets/concepts/concept-twinkle.png alternativa A (oro miel + gafas de montura dorada)
 *   Silueta: estrella de 5 puntas redondeada
 *   Ojos: ojo con pupilas (sclerófita blanca + iris marrón cálido), con gafas circulares auto-ajustables ——
 *        El marco se calcula automáticamente según la posición y forma real de los ojos, sigue la mirada,
 *        baja al parpadear, la lente pasa un haz de luz periódicamente
 *   Acción de firma: estrellas que estallan en espiral; en órbita de pensamiento se mezcla un lápiz giratorio
 *   Registro de parámetros de diseño: docs/DESIGN-PROVENANCE.md
 * ============================================================ */
window.MoodMates.characters.register({
  id: 'twinkle',
  name: 'Brillo',
  en: { name: 'Twinkle', desc: 'A honey-gold rounded star in tiny auto-fit glasses — the classroom cheerleader' },
  industry: 'general',
  desc: 'Estrella de cinco puntas redondeada en dorado miel, con unos gafas circulares pequeños que siguen los ojos, la animada maestra del aula',

  body: { type: 'star', r: 1.02, points: 5, inner: 0.74, sharp: 0.5 },
  face: { x: 0, y: 6, sx: 0.82, sy: 0.82, eye: 0.85 },

  palette: {
    body: '#F5B93F',
    eye: '#4A3316',
    blush: '#F0966E',
    mouth: '#6B4A2E',
    zzz: '#D9A85F',
    gloss: 0.3,
    states: {
      base: '#F5B93F',
      dim: '#D6A139',
      soft: '#F8CC66',
      blush: '#F2AE7E',
      angry: '#E8734F',
      alert: '#E25B5B',
      off: '#C2A265'
    }
  },

  eyeStyle: {
    dx: 27, cy: 102, w: 26, h: 34,
    taper: 0.38, tilt: 0, bend: 0,
    pupil: {
      irisR: 10, pupilR: 4.8,
      irisColor: '#7A4E2A',
      socket: '#FFFFFF',
      highlights: [
        { dx: -3.2, dy: -3.8, r: 3 },
        { dx: 3.8, dy: 2.4, r: 1.3, opacity: 0.6 }
      ]
    }
  },

  features: {
    mouth: { w: 36, dy: 34 },
    blush: { dx: 40, dy: 24, rx: 10, ry: 6, max: 0.85 },
    /* Sin cejas: ojo con pupilas + gafas ya aportan suficiente información;
     * la emoción se expresa mediante apertura de párpados / mirada / forma de la boca */
    accessories: [
      /* Gafas circulares auto-ajustables: posición y radio calculados automáticamente según los ojos del personaje */
      { kind: 'glasses', color: '#C9973F', fit: 1.3, strokeWidth: 2.6, glintPeriod: 5200 }
    ]
  },

  fxSkin: 'stardust',
  /* Variantes completas (v1.9): paleta + iris + rasgos + parches de emoción */
  variants: {
    lunar: {
      name: 'Lunar', en: { name: 'Lunar' },
      palette: { body: '#C9D3E8', eye: '#2E3A55', zzz: '#9AA8C8', fx: ['#C9D3E8', '#E8EEF8', '#9FB3D6', '#F5E6A8'] },
      eyeStyle: { pupil: { irisColor: '#3E4F7A' } },
      features: { accessories: [{ kind: 'glasses', color: '#8A97B8', fit: 1.3, strokeWidth: 2.6, glintPeriod: 5200 }] }
    },
    coral: {
      name: 'Coral', en: { name: 'Coral' },
      palette: { body: '#F28F7A', eye: '#4A2A22', zzz: '#D9806C' },
      eyeStyle: { pupil: { irisColor: '#6B3A2A' } }
    },
    jade: {
      name: 'Jade', en: { name: 'Jade' },
      palette: { body: '#7FD1A8', eye: '#1F3D33', zzz: '#6BB38F' },
      eyeStyle: { pupil: { irisColor: '#2F6B55' } },
      emotions: { '02': { poolMs: [14000, 22000] } }
    }
  },

  /* El profesor entusiasta se emociona más cuando aciertas */
  emotions: {
    '33': { body: { spinFx: 1, confetti: 1 } }
  }
});
