import { describe, expect, it } from 'vitest';
import {
  buildAppearanceSpec,
  parseAppearanceSpec,
} from '../AgentAppearanceEditor.js';
import type { AgentAppearanceForm, AgentAppearanceSpec } from '../AgentAppearanceEditor.js';

const fullSpec: AgentAppearanceSpec = {
  avatar: { type: 'url', url: 'https://cdn/a.png' },
  emoji: '🤖',
  badge: { text: 'beta' },
  theme: { primaryColor: '#2563eb' },
  renderer: 'talkinghead',
  avatarModelUrl: 'https://cdn/avatar.glb',
  visemeSet: 'oculus',
  defaultMood: 'neutral',
  defaultView: 'upper',
};

describe('buildAppearanceSpec', () => {
  it('maps the five realtime fields onto spec and preserves avatar/theme/badge/emoji', () => {
    const form: AgentAppearanceForm = {
      avatar: { type: 'url', url: 'https://cdn/a.png' },
      emoji: '🤖',
      badge: { text: 'beta' },
      theme: { primaryColor: '#2563eb' },
      renderer: 'live2d',
      avatarModelUrl: 'https://cdn/model.json',
      visemeSet: 'arkit',
      defaultMood: 'happy',
      defaultView: 'full',
    };
    const spec = buildAppearanceSpec(form);
    expect(spec.renderer).toBe('live2d');
    expect(spec.avatarModelUrl).toBe('https://cdn/model.json');
    expect(spec.visemeSet).toBe('arkit');
    expect(spec.defaultMood).toBe('happy');
    expect(spec.defaultView).toBe('full');
    expect(spec.avatar).toEqual({ type: 'url', url: 'https://cdn/a.png' });
    expect(spec.theme).toEqual({ primaryColor: '#2563eb' });
    expect(spec.badge).toEqual({ text: 'beta' });
    expect(spec.emoji).toBe('🤖');
  });

  it('omits unset fields — correct emptiness, no empty-string/null writes', () => {
    const spec = buildAppearanceSpec({ renderer: 'talkinghead' });
    expect(spec).toEqual({ renderer: 'talkinghead' });
    expect('avatarModelUrl' in spec).toBe(false);
    expect('visemeSet' in spec).toBe(false);
    expect('defaultMood' in spec).toBe(false);
    expect('defaultView' in spec).toBe(false);
    expect('avatar' in spec).toBe(false);
    expect('emoji' in spec).toBe(false);
    expect('badge' in spec).toBe(false);
    expect('theme' in spec).toBe(false);
  });

  it('empty form → empty spec (no realtime keys)', () => {
    expect(buildAppearanceSpec({})).toEqual({});
    expect(buildAppearanceSpec()).toEqual({});
  });

  it('does not emit avatar when avatar object carries no fields', () => {
    const spec = buildAppearanceSpec({ avatar: {}, badge: {}, theme: {} });
    expect(spec).toEqual({});
  });
});

describe('parseAppearanceSpec', () => {
  it('reads the realtime fields back into the form', () => {
    const form = parseAppearanceSpec(fullSpec);
    expect(form.renderer).toBe('talkinghead');
    expect(form.avatarModelUrl).toBe('https://cdn/avatar.glb');
    expect(form.visemeSet).toBe('oculus');
    expect(form.defaultMood).toBe('neutral');
    expect(form.defaultView).toBe('upper');
    expect(form.avatar).toEqual({ type: 'url', url: 'https://cdn/a.png' });
  });

  it('empty spec → empty form (no fabricated values written back through build)', () => {
    const form = parseAppearanceSpec({});
    expect(form).toEqual({});
    expect(buildAppearanceSpec(form)).toEqual({});
  });
});

describe('round-trip', () => {
  it('buildAppearanceSpec(parseAppearanceSpec(spec)) deep-equals the original spec', () => {
    expect(buildAppearanceSpec(parseAppearanceSpec(fullSpec))).toEqual(fullSpec);
  });

  it('round-trips a realtime-only spec', () => {
    const spec: AgentAppearanceSpec = {
      renderer: 'live2d',
      avatarModelUrl: 'https://cdn/x.json',
      visemeSet: 'arkit',
      defaultMood: 'calm',
      defaultView: 'upper',
    };
    expect(buildAppearanceSpec(parseAppearanceSpec(spec))).toEqual(spec);
  });
});
