/**
 * Procedural icon generation (SPEC §8): hash entity id → friendly geometric
 * avatar — "tamagotchi war room". Units get a rounded body silhouette, two
 * expressive eyes, a small crest/antenna and optional side pods/cheeks, all
 * keyed off the entity id; the palette is keyed by adapter faction (SPEC §10:
 * claude-code=cyan, codex=magenta, gemini-cli=amber, pi=green). Tasks get a
 * rounded badge with a taskKind glyph.
 *
 * Determinism: pure string assembly from FNV-1a hashes of the entity id —
 * same id ⇒ byte-identical SVG (AC12, unit-tested). Expressions are static
 * per id; unit STATE is conveyed by the sprite ring, never by the portrait.
 *
 * Shape policy: paths/circles/ellipses/rects only — no <line>/<polyline>
 * (the frozen e2e suite counts those document-wide as link-layer shapes)
 * and no <text> (crispness at 24–64px must not depend on font rendering).
 */

import { hashString } from '../../backend/mock/prng';
import type { IconContext, IconSpec } from '../types';

/**
 * Faction palettes (SPEC §10): [accent, body, light, deep, glow].
 * accent = outline/crest · body = fill · light = eyes/face features ·
 * deep = pupils/shadow · glow = highlights.
 */
const FACTION_PALETTES: Record<string, readonly [string, string, string, string, string]> = {
  'claude-code': ['#3fd9f5', '#0d3b4d', '#d9f7ff', '#072430', '#9ef0ff'],
  codex: ['#e96bf5', '#451051', '#f8ddff', '#2a0833', '#f3aaff'],
  'gemini-cli': ['#f5bb3a', '#4d3608', '#ffefcb', '#2e2004', '#ffd98a'],
  pi: ['#3fe09a', '#0c4530', '#d6fbe9', '#06291c', '#8af2c4'],
};

const DEFAULT_PALETTE: readonly [string, string, string, string, string] = [
  '#93a8c2',
  '#2b3850',
  '#e2eaf4',
  '#1a2233',
  '#c2d2e4',
];

/** Task badge palettes: [accent, body, light]. Keyed by taskKind hash. */
const TASK_PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ['#7dd7f0', '#143246', '#d9f4fd'],
  ['#e2a3f0', '#3c1a47', '#f6e3fb'],
  ['#f0cf8a', '#46350f', '#fbf0d4'],
  ['#9be8c3', '#11402a', '#e2f9ed'],
  ['#a8b6f0', '#1d2547', '#e4e9fb'],
  ['#f0a8a8', '#471a1a', '#fbe4e4'],
];

const iconCache = new Map<string, IconSpec>();

export function generateIcon(ctx: IconContext): IconSpec {
  const cacheKey = `${ctx.kind}|${ctx.entityId}|${ctx.adapter ?? ''}|${ctx.taskKind ?? ''}`;
  const cached = iconCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const spec = ctx.kind === 'unit' ? unitIcon(ctx) : taskIcon(ctx);
  iconCache.set(cacheKey, spec);
  return spec;
}

function svgOpen(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" ` +
    `width="100%" height="100%" aria-hidden="true">`
  );
}

// ---------------------------------------------------------------------------
// Unit avatars
// ---------------------------------------------------------------------------

function unitIcon(ctx: IconContext): IconSpec {
  const palette = FACTION_PALETTES[ctx.adapter ?? ''] ?? DEFAULT_PALETTE;
  const [accent, body, light, deep, glow] = palette;
  const h = hashString(`unit:${ctx.entityId}`);

  // Static per-id trait wheel (expression never changes with state — SPEC §8).
  const bodyVariant = h % 5;
  const crestVariant = (h >>> 3) % 4;
  const eyeVariant = (h >>> 6) % 4;
  const mouthVariant = (h >>> 9) % 3;
  const podVariant = (h >>> 12) % 3;
  const eyeGap = 7 + ((h >>> 15) % 4); // 7..10
  const eyeDy = ((h >>> 18) % 5) - 2; // -2..2
  const cheeks = (h >>> 21) % 2 === 0;
  const emblem = (h >>> 22) % 2 === 0;

  const cx = 32;
  const eyeY = 34 + eyeDy;
  const mouthY = eyeY + 8;

  // Ground shadow keeps the little fellow anchored at any render size.
  const shadow = `<ellipse cx="${cx}" cy="57" rx="13" ry="2.5" fill="${deep}" opacity="0.45"/>`;

  // Side pods render BEFORE the body so the silhouette overlaps them.
  let pods = '';
  if (podVariant === 1) {
    pods =
      `<circle cx="13.5" cy="37" r="4.5" fill="${body}" stroke="${accent}" stroke-width="2"/>` +
      `<circle cx="50.5" cy="37" r="4.5" fill="${body}" stroke="${accent}" stroke-width="2"/>`;
  } else if (podVariant === 2) {
    pods =
      `<path d="M16 31 L9 27.5 L12.5 38 Z" fill="${accent}" opacity="0.85"/>` +
      `<path d="M48 31 L55 27.5 L51.5 38 Z" fill="${accent}" opacity="0.85"/>`;
  }

  let bodyShape = '';
  switch (bodyVariant) {
    case 0: // round bot
      bodyShape = `<circle cx="${cx}" cy="37" r="18" fill="${body}" stroke="${accent}" stroke-width="2.5"/>`;
      break;
    case 1: // squircle bot
      bodyShape = `<rect x="14" y="19" width="36" height="36" rx="14" fill="${body}" stroke="${accent}" stroke-width="2.5"/>`;
      break;
    case 2: // shield blob
      bodyShape =
        `<path d="M32 17 Q47 23 47 37 Q47 50 32 55 Q17 50 17 37 Q17 23 32 17 Z" ` +
        `fill="${body}" stroke="${accent}" stroke-width="2.5" stroke-linejoin="round"/>`;
      break;
    case 3: // jellyfish dome
      bodyShape =
        `<path d="M14 41 a18 21 0 1 1 36 0 a18 13 0 1 1 -36 0 Z" ` +
        `fill="${body}" stroke="${accent}" stroke-width="2.5"/>`;
      break;
    default: // capsule trooper
      bodyShape = `<rect x="17" y="17" width="30" height="39" rx="15" fill="${body}" stroke="${accent}" stroke-width="2.5"/>`;
      break;
  }

  // Soft face plate adds depth without stealing contrast from the eyes.
  const facePlate = `<ellipse cx="${cx}" cy="${eyeY + 2}" rx="12.5" ry="10.5" fill="${light}" opacity="0.12"/>`;

  let crest = '';
  switch (crestVariant) {
    case 0: // antenna with glow-ball
      crest =
        `<path d="M32 18 V10" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>` +
        `<circle cx="32" cy="8" r="2.8" fill="${glow}"/>`;
      break;
    case 1: // fin
      crest = `<path d="M26 19 L32 8 L38 19 Z" fill="${accent}"/>`;
      break;
    case 2: // halo arc
      crest =
        `<path d="M22 13 a10 7 0 0 1 20 0" fill="none" stroke="${accent}" ` +
        `stroke-width="2.5" stroke-linecap="round"/>`;
      break;
    default: // twin nubs
      crest =
        `<path d="M24 19 V15 M40 19 V15" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>` +
        `<circle cx="24" cy="13.5" r="2.4" fill="${accent}"/>` +
        `<circle cx="40" cy="13.5" r="2.4" fill="${accent}"/>`;
      break;
  }

  let eyes = '';
  const lx = cx - eyeGap;
  const rx = cx + eyeGap;
  switch (eyeVariant) {
    case 0: // classic round eyes with pupil + sparkle
      eyes =
        `<circle cx="${lx}" cy="${eyeY}" r="4.2" fill="${light}"/>` +
        `<circle cx="${rx}" cy="${eyeY}" r="4.2" fill="${light}"/>` +
        `<circle cx="${lx + 0.9}" cy="${eyeY + 0.6}" r="1.8" fill="${deep}"/>` +
        `<circle cx="${rx + 0.9}" cy="${eyeY + 0.6}" r="1.8" fill="${deep}"/>` +
        `<circle cx="${lx - 1.2}" cy="${eyeY - 1.4}" r="0.9" fill="${glow}"/>` +
        `<circle cx="${rx - 1.2}" cy="${eyeY - 1.4}" r="0.9" fill="${glow}"/>`;
      break;
    case 1: // big oval anime eyes
      eyes =
        `<ellipse cx="${lx}" cy="${eyeY}" rx="3.6" ry="4.8" fill="${light}"/>` +
        `<ellipse cx="${rx}" cy="${eyeY}" rx="3.6" ry="4.8" fill="${light}"/>` +
        `<circle cx="${lx + 0.7}" cy="${eyeY + 1}" r="1.7" fill="${deep}"/>` +
        `<circle cx="${rx + 0.7}" cy="${eyeY + 1}" r="1.7" fill="${deep}"/>` +
        `<circle cx="${lx - 1}" cy="${eyeY - 1.8}" r="1" fill="${glow}"/>` +
        `<circle cx="${rx - 1}" cy="${eyeY - 1.8}" r="1" fill="${glow}"/>`;
      break;
    case 2: // happy closed arcs (^ ^)
      eyes =
        `<path d="M${lx - 3.6} ${eyeY + 1.6} Q${lx} ${eyeY - 3.4} ${lx + 3.6} ${eyeY + 1.6}" ` +
        `fill="none" stroke="${light}" stroke-width="2.4" stroke-linecap="round"/>` +
        `<path d="M${rx - 3.6} ${eyeY + 1.6} Q${rx} ${eyeY - 3.4} ${rx + 3.6} ${eyeY + 1.6}" ` +
        `fill="none" stroke="${light}" stroke-width="2.4" stroke-linecap="round"/>`;
      break;
    default: // visor band with twin glow dots
      eyes =
        `<rect x="${cx - eyeGap - 4.5}" y="${eyeY - 3.5}" width="${(eyeGap + 4.5) * 2}" height="7" rx="3.5" ` +
        `fill="${deep}" opacity="0.9"/>` +
        `<circle cx="${lx}" cy="${eyeY}" r="1.9" fill="${glow}"/>` +
        `<circle cx="${rx}" cy="${eyeY}" r="1.9" fill="${glow}"/>`;
      break;
  }

  let mouth = '';
  if (eyeVariant !== 3) {
    // Visor bots keep a stoic chin; everyone else emotes.
    switch (mouthVariant) {
      case 0: // smile
        mouth =
          `<path d="M${cx - 3.5} ${mouthY} a3.5 2.8 0 0 0 7 0" fill="none" ` +
          `stroke="${light}" stroke-width="1.8" stroke-linecap="round"/>`;
        break;
      case 1: // tiny "o"
        mouth = `<circle cx="${cx}" cy="${mouthY + 0.5}" r="1.6" fill="${light}" opacity="0.9"/>`;
        break;
      default: // content flat
        mouth =
          `<path d="M${cx - 3} ${mouthY + 0.5} h6" fill="none" ` +
          `stroke="${light}" stroke-width="1.8" stroke-linecap="round"/>`;
        break;
    }
  }

  const cheeksMark = cheeks
    ? `<circle cx="${lx - 2.2}" cy="${eyeY + 5.6}" r="1.9" fill="${accent}" opacity="0.45"/>` +
      `<circle cx="${rx + 2.2}" cy="${eyeY + 5.6}" r="1.9" fill="${accent}" opacity="0.45"/>`
    : '';

  const emblemMark = emblem
    ? `<circle cx="${cx}" cy="${mouthY + 7}" r="1.8" fill="${accent}" opacity="0.7"/>`
    : '';

  const svg =
    svgOpen() + shadow + pods + crest + bodyShape + facePlate + eyes + cheeksMark + mouth + emblemMark + `</svg>`;

  return { svg, palette: [...palette] };
}

// ---------------------------------------------------------------------------
// Task structures: rounded badge + taskKind glyph
// ---------------------------------------------------------------------------

/** Path-only glyphs per taskKind (centered on 32,32 in a ~22px box). */
function taskGlyph(kind: string, accent: string, body: string, light: string): string {
  const stroke = (d: string, w = 2.4): string =>
    `<path d="${d}" fill="none" stroke="${light}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  switch (kind) {
    case 'ci-repair': // gear
      return (
        `<circle cx="32" cy="32" r="5" fill="none" stroke="${light}" stroke-width="2.4"/>` +
        stroke(
          'M32 21.5 V25 M32 39 V42.5 M21.5 32 H25 M39 32 H42.5 M24.6 24.6 L27 27 M37 37 L39.4 39.4 M39.4 24.6 L37 27 M27 37 L24.6 39.4',
          2.2,
        )
      );
    case 'feature-dev': // spark
      return `<path d="M32 21 L34.7 29.3 L43 32 L34.7 34.7 L32 43 L29.3 34.7 L21 32 L29.3 29.3 Z" fill="${light}"/>`;
    case 'code-review': // magnifier
      return (
        `<circle cx="29.5" cy="29.5" r="6.5" fill="none" stroke="${light}" stroke-width="2.4"/>` +
        stroke('M34.5 34.5 L41 41')
      );
    case 'bug-fix': // bug
      return (
        stroke('M25.5 28.5 L21.5 26 M25.5 33.5 H21 M25.5 38.5 L21.5 41 M38.5 28.5 L42.5 26 M38.5 33.5 H43 M38.5 38.5 L42.5 41', 2) +
        `<circle cx="32" cy="24.5" r="3.2" fill="${light}"/>` +
        `<ellipse cx="32" cy="34" rx="6" ry="7.5" fill="${light}"/>` +
        `<path d="M32 27.5 V40.5" fill="none" stroke="${body}" stroke-width="1.6"/>`
      );
    case 'refactor': // cycle arrows
      return (
        stroke('M39.5 26.5 a9.5 9.5 0 0 0 -15.5 3.5') +
        stroke('M22.7 25.7 L23.6 31.3 L29 30') +
        stroke('M24.5 37.5 a9.5 9.5 0 0 0 15.5 -3.5') +
        stroke('M41.3 38.3 L40.4 32.7 L35 34')
      );
    case 'docs': // document with folded corner
      return (
        stroke('M25 20.5 H35 L40 25.5 V43.5 H25 Z', 2.2) +
        stroke('M35 20.5 V25.5 H40', 1.8) +
        stroke('M28.5 31 H36.5 M28.5 36 H36.5', 2)
      );
    case 'test-coverage': // shield + check
      return (
        stroke('M32 20.5 L41.5 24 V32 Q41.5 40.5 32 44.5 Q22.5 40.5 22.5 32 V24 Z', 2.2) +
        stroke('M27.5 32.5 L31 36 L37 27.5')
      );
    case 'perf-tuning': // bolt
      return `<path d="M34.5 20.5 L24.5 34 H31 L29.5 43.5 L39.5 30 H33 Z" fill="${light}"/>`;
    case 'security-audit': // padlock
      return (
        stroke('M27 29 V26.5 a5 5 0 0 1 10 0 V29') +
        `<rect x="24.5" y="29" width="15" height="12.5" rx="3" fill="${light}"/>` +
        `<circle cx="32" cy="34" r="1.8" fill="${body}"/>` +
        `<path d="M32 34 V38" fill="none" stroke="${body}" stroke-width="1.8" stroke-linecap="round"/>`
      );
    case 'release-prep': // rocket
      return (
        `<path d="M32 19.5 Q37.5 25.5 37.5 33 L37.5 38 H26.5 L26.5 33 Q26.5 25.5 32 19.5 Z" fill="${light}"/>` +
        `<circle cx="32" cy="30" r="2.4" fill="${body}"/>` +
        `<path d="M26.5 33.5 L22 40 L26.5 38.7 Z" fill="${light}"/>` +
        `<path d="M37.5 33.5 L42 40 L37.5 38.7 Z" fill="${light}"/>` +
        `<path d="M30 40.5 Q32 44.5 34 40.5" fill="none" stroke="${accent}" stroke-width="2.2" stroke-linecap="round"/>`
      );
    default: // diamond fallback
      return stroke('M32 22 L42 32 L32 42 L22 32 Z', 2.4);
  }
}

function taskIcon(ctx: IconContext): IconSpec {
  const kind = ctx.taskKind ?? 'task';
  const palette = TASK_PALETTES[hashString(`kind:${kind}`) % TASK_PALETTES.length] ?? TASK_PALETTES[0]!;
  const [accent, body, light] = palette;
  const h = hashString(`task:${ctx.entityId}`);
  const rx = 10 + (h % 3) * 4; // 10 | 14 | 18 — per-id badge rounding
  const pipAngle = (h >>> 4) % 4; // per-id accent pip corner

  const pipPositions: ReadonlyArray<readonly [number, number]> = [
    [19, 19],
    [45, 19],
    [45, 45],
    [19, 45],
  ];
  const pip = pipPositions[pipAngle] ?? pipPositions[0]!;

  const svg =
    svgOpen() +
    `<rect x="12" y="12" width="40" height="40" rx="${rx}" fill="${body}" stroke="${accent}" stroke-width="2.5"/>` +
    `<rect x="16.5" y="16.5" width="31" height="31" rx="${Math.max(4, rx - 5)}" fill="none" stroke="${accent}" stroke-width="1" opacity="0.35"/>` +
    `<circle cx="${pip[0]}" cy="${pip[1]}" r="1.6" fill="${accent}" opacity="0.8"/>` +
    taskGlyph(kind, accent, body, light) +
    `</svg>`;

  return { svg, palette: [...palette] };
}

/** Faction accent color for an adapter (HUD chrome, link lines, minimap dots). */
export function factionAccent(adapter: string): string {
  return (FACTION_PALETTES[adapter] ?? DEFAULT_PALETTE)[0];
}
