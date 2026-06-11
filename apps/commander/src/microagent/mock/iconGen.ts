/**
 * Procedural icon generation (SPEC §8): hash entity id → friendly geometric
 * avatar (rounded body + two eyes + accent crest). Palette keyed by adapter
 * for units; taskKind glyph badge for tasks. "Tamagotchi war room."
 *
 * Determinism: pure string assembly from FNV-1a hashes of the entity id —
 * same id ⇒ byte-identical SVG (AC12, unit-testable). No <line>/<polyline>
 * elements anywhere (the e2e suite counts those as link-layer shapes).
 */

import { hashString } from '../../backend/mock/prng';
import type { IconContext, IconSpec } from '../types';

/** Faction accents (SPEC §10): cyan / magenta / amber / green families. */
const FACTION_PALETTES: Record<string, [string, string, string]> = {
  'claude-code': ['#2dd4ee', '#0b4f63', '#bdf3ff'],
  codex: ['#e26bf5', '#5b1668', '#f8d4ff'],
  'gemini-cli': ['#f5b62d', '#6b4a08', '#ffe9bd'],
  pi: ['#34d98c', '#0d5938', '#c6f7e0'],
};

const DEFAULT_PALETTE: [string, string, string] = ['#8aa0b8', '#2c3850', '#dbe6f2'];

const TASK_PALETTES: ReadonlyArray<[string, string, string]> = [
  ['#7dd7f0', '#143246', '#d9f4fd'],
  ['#e2a3f0', '#3c1a47', '#f6e3fb'],
  ['#f0cf8a', '#46350f', '#fbf0d4'],
  ['#9be8c3', '#11402a', '#e2f9ed'],
  ['#a8b6f0', '#1d2547', '#e4e9fb'],
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

// ---------------------------------------------------------------------------
// Unit avatars
// ---------------------------------------------------------------------------

function unitIcon(ctx: IconContext): IconSpec {
  const palette = FACTION_PALETTES[ctx.adapter ?? ''] ?? DEFAULT_PALETTE;
  const [accent, body, light] = palette;
  const h = hashString(`unit:${ctx.entityId}`);
  const bodyVariant = h % 4;
  const crestVariant = (h >>> 4) % 3;
  const eyeDy = ((h >>> 8) % 5) - 2; // -2..2 vertical eye offset
  const eyeGap = 7 + ((h >>> 12) % 4); // 7..10
  const cheek = (h >>> 16) % 2 === 0;

  const cx = 32;
  const cy = 36;

  let bodyShape = '';
  switch (bodyVariant) {
    case 0:
      bodyShape = `<circle cx="${cx}" cy="${cy}" r="19" fill="${body}" stroke="${accent}" stroke-width="2.5"/>`;
      break;
    case 1:
      bodyShape = `<rect x="13" y="18" width="38" height="36" rx="13" fill="${body}" stroke="${accent}" stroke-width="2.5"/>`;
      break;
    case 2:
      bodyShape = `<path d="M32 16 L49 26 L49 46 L32 56 L15 46 L15 26 Z" fill="${body}" stroke="${accent}" stroke-width="2.5" stroke-linejoin="round"/>`;
      break;
    default:
      bodyShape = `<path d="M14 40 a18 20 0 1 1 36 0 a18 14 0 1 1 -36 0 Z" fill="${body}" stroke="${accent}" stroke-width="2.5"/>`;
      break;
  }

  let crest = '';
  switch (crestVariant) {
    case 0:
      crest = `<path d="M32 8 L32 17" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="7" r="3" fill="${accent}"/>`;
      break;
    case 1:
      crest = `<path d="M26 17 L32 7 L38 17 Z" fill="${accent}"/>`;
      break;
    default:
      crest = `<path d="M22 12 a12 8 0 0 1 20 0" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>`;
      break;
  }

  const eyeY = cy - 2 + eyeDy;
  const eyes =
    `<circle cx="${cx - eyeGap}" cy="${eyeY}" r="4" fill="${light}"/>` +
    `<circle cx="${cx + eyeGap}" cy="${eyeY}" r="4" fill="${light}"/>` +
    `<circle cx="${cx - eyeGap + 1}" cy="${eyeY - 1}" r="1.5" fill="${body}"/>` +
    `<circle cx="${cx + eyeGap + 1}" cy="${eyeY - 1}" r="1.5" fill="${body}"/>`;

  const cheeks = cheek
    ? `<circle cx="${cx - eyeGap - 1}" cy="${eyeY + 7}" r="1.8" fill="${accent}" opacity="0.55"/>` +
      `<circle cx="${cx + eyeGap + 1}" cy="${eyeY + 7}" r="1.8" fill="${accent}" opacity="0.55"/>`
    : `<path d="M${cx - 4} ${eyeY + 8} a4 3 0 0 0 8 0" fill="none" stroke="${light}" stroke-width="1.8" stroke-linecap="round"/>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">` +
    crest +
    bodyShape +
    eyes +
    cheeks +
    `</svg>`;

  return { svg, palette: [...palette] };
}

// ---------------------------------------------------------------------------
// Task structures
// ---------------------------------------------------------------------------

function taskIcon(ctx: IconContext): IconSpec {
  const kind = ctx.taskKind ?? 'task';
  const palette = TASK_PALETTES[hashString(`kind:${kind}`) % TASK_PALETTES.length] ?? TASK_PALETTES[0]!;
  const [accent, body, light] = palette;
  const h = hashString(`task:${ctx.entityId}`);
  const variant = h % 3;
  const glyph = (kind[0] ?? 't').toUpperCase();

  let structure = '';
  switch (variant) {
    case 0:
      structure = `<path d="M32 10 L54 32 L32 54 L10 32 Z" fill="${body}" stroke="${accent}" stroke-width="2.5" stroke-linejoin="round"/>`;
      break;
    case 1:
      structure = `<path d="M32 9 L52 21 L52 43 L32 55 L12 43 L12 21 Z" fill="${body}" stroke="${accent}" stroke-width="2.5" stroke-linejoin="round"/>`;
      break;
    default:
      structure = `<rect x="13" y="13" width="38" height="38" rx="9" fill="${body}" stroke="${accent}" stroke-width="2.5"/>`;
      break;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">` +
    structure +
    `<circle cx="32" cy="32" r="12.5" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.6"/>` +
    `<text x="32" y="37" text-anchor="middle" font-family="monospace" font-size="15" font-weight="bold" fill="${light}">${glyph}</text>` +
    `</svg>`;

  return { svg, palette: [...palette] };
}

/** Faction accent color for an adapter (HUD chrome, link lines, minimap dots). */
export function factionAccent(adapter: string): string {
  return (FACTION_PALETTES[adapter] ?? DEFAULT_PALETTE)[0];
}
