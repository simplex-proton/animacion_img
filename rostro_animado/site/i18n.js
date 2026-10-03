// rostro_animado/site/i18n.js
/* ============================================================
 * i18n.js —— Diccionario de textos de interfaz (datos puros + función de obtención)
 *   MM_I18N.t(key, params)  Obtiene el texto en el idioma actual, interpola con marcador {x}
 *   MM_I18N.lang            Idioma actual 'es' | 'en'
 *   MM_I18N.set(lang)       Cambia de idioma (solo actualiza el puntero del diccionario;
 *                            la actualización del DOM la gestiona la capa de interacción)
 * ============================================================ */
window.MM_I18N = (function () {
  'use strict';

  var STRINGS = {
    es: {
      docTitle: 'Mood Mates · Galería de personajes',
      brandName: 'Mood Mates',
      navWall: 'Muro',
      navAlbum: 'Álbum',
      langBtn: 'EN',
      themeToDark: 'Cambiar a modo oscuro',
      themeToLight: 'Cambiar a modo claro',
      settingsBtn: 'Ajustes',

      heroEyebrow: 'MOOD MATES',
      heroTitle: 'Un elenco original que muestra sus emociones',
      heroSub: '2 personajes originales × 32 estados expresivos · SVG en tiempo real · Conecta tu IA con un solo emotionId',
      heroCta: 'Entrar a la galería',
      heroHint: 'Mueve el ratón y te observará · Haz clic para ver su movimiento estrella',

      tabAll: 'Todo',
      galleryHint: 'Haz clic en una tarjeta de personaje para cambiar · Haz clic en una miniatura para cambiar emoción · ← / → para navegar',
      prevEmotion: 'Emoción anterior',
      nextEmotion: 'Emoción siguiente',
      stageClose: 'Cerrar vista previa',
      stageLabel: 'Escenario principal de emociones',
      thumbSuffix: 'vista previa miniatura',
      castClick: 'haz clic para cambiar a este personaje',

      industry_general: 'General',

      drawerTitle: 'Ajustes',
      drawerClose: 'Cerrar ajustes',
      secAppearance: 'Apariencia',
      lblCharacter: 'Personaje actual',
      lblVariant: 'Variante',
      variantDefault: 'Predeterminado',
      lblSketch: 'Modo boceto',
      secDemo: 'Demostración',
      lblTour: 'Reproducción automática',
      lblInterval: 'Intervalo de reproducción',
      secAI: 'Simulación de conexión AI',
      aiPlaceholder: '{"emotionId":"30","tips":"Pensando en la pregunta del usuario"}',
      btnSend: 'Enviar',
      btnSampleErr: 'Ejemplo: error',
      btnSampleBad: 'Ejemplo: ID desconocido',
      secConfig: 'Configuración',
      btnExport: 'Exportar configuración',
      btnImport: 'Importar configuración',

      footNote: 'Todos los personajes de Mood Mates son diseños originales. Uso gratuito para aprendizaje personal; para uso comercial consulta LICENSE-COMMERCIAL.md en el repositorio.',

      toastTourOn: 'Reproducción automática activada: "{name}" con {n} emociones',
      toastTourOff: 'Reproducción automática desactivada',
      toastSketchOn: 'Cambiado a modo boceto (solo contornos)',
      toastSketchOff: 'Vuelta al relleno sólido',
      toastCharacter: 'Cambiado a {name}',
      toastVariant: 'Variante cambiada: {name}',
      toastAiSent: 'Mensaje AI enviado',
      toastExported: 'Exportadas {n} configuraciones de emoción',
      toastImportOk: 'Importadas {n} configuraciones de emoción',
      toastImportFail: 'Importados {n}, falló: {err}',
      toastThemeDark: 'Cambiado a modo oscuro',
      toastThemeLight: 'Cambiado a modo claro'
    },

    en: {
      docTitle: 'Mood Mates Gallery',
      brandName: 'Mood Mates',
      navWall: 'Wall',
      navAlbum: 'Album',
      langBtn: 'ES',
      themeToDark: 'Switch to dark mode',
      themeToLight: 'Switch to light mode',
      settingsBtn: 'Settings',

      heroEyebrow: 'MOOD MATES',
      heroTitle: 'An original cast that wears its feelings',
      heroSub: '2 original characters × 32 expressive states · Real-time SVG · Hook up your AI with a single emotionId',
      heroCta: 'Enter the gallery',
      heroHint: 'Move your mouse and it watches · Click for its signature move',

      tabAll: 'All',
      galleryHint: 'Click a cast card to switch characters · Click a thumbnail to switch emotions · ← / → to flip',
      prevEmotion: 'Previous emotion',
      nextEmotion: 'Next emotion',
      stageClose: 'Close preview',
      stageLabel: 'Main emotion stage',
      thumbSuffix: 'thumbnail preview',
      castClick: 'click to switch to this character',

      industry_general: 'General',

      drawerTitle: 'Settings',
      drawerClose: 'Close settings',
      secAppearance: 'Appearance',
      lblCharacter: 'Character',
      lblVariant: 'Variant',
      variantDefault: 'Default',
      lblSketch: 'Sketch mode',
      secDemo: 'Showcase',
      lblTour: 'Autoplay',
      lblInterval: 'Interval',
      secAI: 'AI simulation',
      aiPlaceholder: '{"emotionId":"30","tips":"thinking"}',
      btnSend: 'Send',
      btnSampleErr: 'Sample: error',
      btnSampleBad: 'Sample: unknown ID',
      secConfig: 'Config',
      btnExport: 'Export',
      btnImport: 'Import',

      footNote: 'All Mood Mates characters are original designs. Free for personal learning; for commercial use see LICENSE-COMMERCIAL.md in the repository.',

      toastTourOn: 'Autoplay on: {n} emotions in "{name}"',
      toastTourOff: 'Autoplay off',
      toastSketchOn: 'Sketch mode on (outline only)',
      toastSketchOff: 'Back to solid fill',
      toastCharacter: 'Switched to {name}',
      toastVariant: 'Variant switched: {name}',
      toastAiSent: 'AI message dispatched',
      toastExported: 'Exported {n} emotion configs',
      toastImportOk: 'Imported {n} emotion configs',
      toastImportFail: 'Imported {n}, failed: {err}',
      toastThemeDark: 'Dark mode on',
      toastThemeLight: 'Light mode on'
    }
  };

  var api = {
    lang: 'es',
    set: function (lang) {
      api.lang = STRINGS[lang] ? lang : 'es';
      return api.lang;
    },
    t: function (key, params) {
      var s = (STRINGS[api.lang] && STRINGS[api.lang][key]) || STRINGS.es[key] || key;
      if (params) {
        for (var k in params) s = s.split('{' + k + '}').join(String(params[k]));
      }
      return s;
    }
  };
  return api;
})();
