#!/usr/bin/env node
/* ============================================================
 * seed-to-json.js — Migración única del catálogo de emociones
 *
 *   node tools/seed-to-json.js            → genera data/emotions.json
 *   node tools/seed-to-json.js --check    → valida sin escribir (exit 1 si hay errores)
 *
 * Lee src/data/emotions.js (datos puros: window.EMOTION_SEED / EMOTION_GROUPS),
 * lo evalúa en un sandbox mínimo y emite el catálogo externo que consume
 * MM.config.loadFromUrl() en el sitio. El formato es { $schema, version,
 * presets, emotions } según data/emotions.schema.json.
 *
 * Sin dependencias externas.
 * ============================================================ */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var SEED_FILE = path.join(ROOT, 'src', 'data', 'emotions.js');
var OUT_FILE = path.join(ROOT, 'data', 'emotions.json');
var CHECK_ONLY = process.argv.indexOf('--check') >= 0;

/* Presets exportados: espejo de la tabla PRESETS de src/core/engine.js.
 * registerPreset los fusiona al importar, por lo que mantener esta copia
 * actualizada es opcional (el motor ya los conoce); se incluyen para que
 * el JSON sea autocontenido y editable sin tocar código. */
var PRESETS = {
  steady:   { poolMs: [9000, 16000], blinkMs: [6000, 14000], breathe: 0.010 },
  calm:     { poolMs: [7000, 12000], blinkMs: [5000, 11000], breathe: 0.010 },
  slow:     { poolMs: [12000, 20000], blinkMs: [8000, 16000], breathe: 0.006, blinkS: 'heavy' },
  lively:   { poolMs: [2500, 4500], blinkMs: [2500, 5000], breathe: 0.014, antics: true },
  jumpy:    { poolMs: [1400, 2600], blinkMs: [1600, 3500], breathe: 0.008, poolSpeed: 9 },
  nervous:  { poolMs: [900, 1800], blinkMs: [1200, 2600], breathe: 0.006, blinkS: 'nervous' },
  focused:  { poolMs: [1800, 3200], blinkMs: [2800, 5500], breathe: 0.004 },
  sleepy:   { poolMs: [4000, 8000], blinkMs: null, breathe: 0.005, blinkS: 'heavy' },
  thinking: { poolMs: [2000, 3600], blinkMs: [3500, 7000], breathe: 0.010, blinkS: 'thinking' }
};

/* ---------------- Cargar el seed (datos puros sobre window) ---------------- */

var sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SEED_FILE, 'utf8'), sandbox, { filename: 'emotions.js' });

var seed = sandbox.window.EMOTION_SEED;
if (!Array.isArray(seed)) {
  console.error('✗ src/data/emotions.js no define window.EMOTION_SEED como array');
  process.exit(1);
}

/* ---------------- Validación ligera (la fuerte la hace el motor al importar) ---------------- */

var errors = [];
var seen = {};
var ID_RE = /^(0[0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|[5-9][0-9])$/;
var GROUPS = ['life', 'emotion', 'agent', 'custom'];
var MOUTHS = ['smile', 'grin', 'o', 'flat', 'frown', 'wavy', 'pout', 'open', 'dot'];
var ANIM_TYPES = ['sine', 'pulse', 'jitter', 'scan', 'glance', 'blink'];

seed.forEach(function (raw, i) {
  var tag = '[' + (raw && raw.id ? raw.id : '#' + i) + ']';
  if (!raw || typeof raw !== 'object') { errors.push(tag + ' entrada no-objeto'); return; }
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) errors.push(tag + ' id fuera del patrón NN');
  if (seen[raw.id]) errors.push(tag + ' id duplicado');
  seen[raw.id] = true;
  if (GROUPS.indexOf(raw.group) < 0) errors.push(tag + ' group inválido: ' + raw.group);
  if (raw.mouth != null && MOUTHS.indexOf(raw.mouth) < 0) errors.push(tag + ' mouth desconocido: ' + raw.mouth);
  if (raw.anims != null) {
    if (!Array.isArray(raw.anims)) errors.push(tag + ' anims no es array');
    else raw.anims.forEach(function (a, j) {
      if (!a || ANIM_TYPES.indexOf(a.type) < 0) errors.push(tag + ' anims[' + j + '] tipo desconocido');
    });
  }
  if (raw.sequence != null) {
    if (!Array.isArray(raw.sequence.frames)) errors.push(tag + ' sequence.frames no es array');
    else raw.sequence.frames.forEach(function (f, j) {
      if (!f || typeof f.at !== 'number' || f.at < 0) errors.push(tag + ' sequence.frames[' + j + '].at inválido');
    });
  }
});

if (errors.length) {
  console.error('✗ Errores de validación en el seed:\n  ' + errors.join('\n  '));
  process.exit(1);
}

/* ---------------- Emitir ---------------- */

var out = {
  $schema: './emotions.schema.json',
  version: new Date().toISOString().slice(0, 10),
  generatedBy: 'tools/seed-to-json.js',
  presets: PRESETS,
  emotions: seed
};

var json = JSON.stringify(out, null, 2) + '\n';

if (CHECK_ONLY) {
  console.log('✓ seed válido: ' + seed.length + ' emociones, ids únicos, grupos y slots correctos (--check, no se escribió nada)');
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, json);
console.log('✓ data/emotions.json generado: ' + seed.length + ' emociones (' + (json.length / 1024).toFixed(1) + ' KB)');
