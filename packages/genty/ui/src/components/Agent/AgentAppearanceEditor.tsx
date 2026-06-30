import React from 'react';

export interface AgentAvatarSpec {
  type?: string;
  url?: string;
  fallbackInitials?: string;
  fallbackColor?: string;
}

export interface AgentBadgeSpec {
  text?: string;
}

export interface AgentThemeSpec {
  primaryColor?: string;
}

export type AgentAppearanceRenderer = 'talkinghead' | 'live2d';
export type AgentAppearanceVisemeSet = 'oculus' | 'arkit';

export interface AgentAppearanceSpec {
  avatar?: AgentAvatarSpec;
  emoji?: string;
  badge?: AgentBadgeSpec;
  theme?: AgentThemeSpec;
  // Realtime avatar fields (G11), flat on spec — consumed by the sidecar renderer
  // via jitsi-agent-bridge.js / adapters-client.js. See resource-model.js L36.
  renderer?: AgentAppearanceRenderer;
  avatarModelUrl?: string;
  visemeSet?: AgentAppearanceVisemeSet;
  defaultMood?: string;
  defaultView?: string;
}

/**
 * Flat form shape for the appearance editor. Existing profile fields plus the five
 * realtime avatar fields. All optional — unset fields are OMITTED from the built spec
 * (correct emptiness; the passthrough route stores only set fields).
 */
export interface AgentAppearanceForm {
  avatar?: AgentAvatarSpec;
  emoji?: string;
  badge?: AgentBadgeSpec;
  theme?: AgentThemeSpec;
  renderer?: AgentAppearanceRenderer;
  avatarModelUrl?: string;
  visemeSet?: AgentAppearanceVisemeSet;
  defaultMood?: string;
  defaultView?: string;
}

function hasAvatarFields(avatar?: AgentAvatarSpec): boolean {
  if (!avatar) return false;
  return Boolean(avatar.type || avatar.url || avatar.fallbackInitials || avatar.fallbackColor);
}

/**
 * Pure: form -> AgentAppearanceSpec. Preserves avatar/emoji/badge/theme; emits the five
 * flat realtime fields. OMITS unset fields (no '' / null writes) so the appearances
 * passthrough route stores only set fields. No fallback / no placeholder values.
 */
export function buildAppearanceSpec(form: AgentAppearanceForm = {}): AgentAppearanceSpec {
  const spec: AgentAppearanceSpec = {};
  if (hasAvatarFields(form.avatar)) spec.avatar = { ...form.avatar };
  if (form.emoji) spec.emoji = form.emoji;
  if (form.badge?.text) spec.badge = { ...form.badge };
  if (form.theme?.primaryColor) spec.theme = { ...form.theme };
  if (form.renderer) spec.renderer = form.renderer;
  if (form.avatarModelUrl) spec.avatarModelUrl = form.avatarModelUrl;
  if (form.visemeSet) spec.visemeSet = form.visemeSet;
  if (form.defaultMood) spec.defaultMood = form.defaultMood;
  if (form.defaultView) spec.defaultView = form.defaultView;
  return spec;
}

/**
 * Pure inverse: AgentAppearanceSpec -> form. Reads set spec fields back into form state.
 * Only set fields are copied — unset spec fields stay unset so a round-trip
 * buildAppearanceSpec(parseAppearanceSpec(spec)) reproduces the same realtime subset.
 */
export function parseAppearanceSpec(spec: AgentAppearanceSpec = {}): AgentAppearanceForm {
  const form: AgentAppearanceForm = {};
  if (spec.avatar) form.avatar = { ...spec.avatar };
  if (spec.emoji) form.emoji = spec.emoji;
  if (spec.badge) form.badge = { ...spec.badge };
  if (spec.theme) form.theme = { ...spec.theme };
  if (spec.renderer) form.renderer = spec.renderer;
  if (spec.avatarModelUrl) form.avatarModelUrl = spec.avatarModelUrl;
  if (spec.visemeSet) form.visemeSet = spec.visemeSet;
  if (spec.defaultMood) form.defaultMood = spec.defaultMood;
  if (spec.defaultView) form.defaultView = spec.defaultView;
  return form;
}

export interface AgentAppearanceEditorProps {
  value?: AgentAppearanceSpec;
  onChange?: (value: AgentAppearanceSpec) => void;
}

export function AgentAppearanceEditor({ value = {}, onChange = () => {} }: AgentAppearanceEditorProps) {
  const avatar = value.avatar || {};
  const theme = value.theme || {};
  const update = (patch: Partial<AgentAppearanceSpec>) => onChange({ ...value, ...patch });
  const updateAvatar = (patch: Partial<AgentAvatarSpec>) => update({ avatar: { ...avatar, ...patch } });
  const updateTheme = (patch: Partial<AgentThemeSpec>) => update({ theme: { ...theme, ...patch } });
  return (
    <form onSubmit={(event) => event.preventDefault()} className="stack" aria-label="Agent appearance editor">
      <label>
        Avatar URL
        <input
          aria-label="Avatar URL"
          value={avatar.url || ''}
          onChange={(event) => updateAvatar({ type: 'url', url: event.target.value })}
        />
      </label>
      <label>
        Emoji
        <input
          aria-label="Emoji"
          value={value.emoji || ''}
          onChange={(event) => update({ emoji: event.target.value })}
        />
      </label>
      <label>
        Primary color
        <input
          type="color"
          aria-label="Primary color"
          value={theme.primaryColor || '#2563eb'}
          onChange={(event) => updateTheme({ primaryColor: event.target.value })}
        />
      </label>
      <label>
        Badge
        <input
          aria-label="Badge text"
          value={value.badge?.text || ''}
          onChange={(event) => update({ badge: { ...(value.badge || {}), text: event.target.value } })}
        />
      </label>
      <label>
        Avatar renderer
        <select
          aria-label="Avatar renderer"
          value={value.renderer || ''}
          onChange={(event) =>
            update({ renderer: (event.target.value || undefined) as AgentAppearanceRenderer | undefined })
          }
        >
          <option value="">(none)</option>
          <option value="talkinghead">talkinghead</option>
          <option value="live2d">live2d</option>
        </select>
      </label>
      <label>
        Avatar model URL
        <input
          aria-label="Avatar model URL"
          value={value.avatarModelUrl || ''}
          onChange={(event) => update({ avatarModelUrl: event.target.value })}
        />
      </label>
      <label>
        Viseme set
        <select
          aria-label="Viseme set"
          value={value.visemeSet || ''}
          onChange={(event) =>
            update({ visemeSet: (event.target.value || undefined) as AgentAppearanceVisemeSet | undefined })
          }
        >
          <option value="">(none)</option>
          <option value="oculus">oculus</option>
          <option value="arkit">arkit</option>
        </select>
      </label>
      <label>
        Default mood
        <input
          aria-label="Default mood"
          value={value.defaultMood || ''}
          onChange={(event) => update({ defaultMood: event.target.value })}
        />
      </label>
      <label>
        Default view
        <input
          aria-label="Default view"
          value={value.defaultView || ''}
          onChange={(event) => update({ defaultView: event.target.value })}
        />
      </label>
      <button
        type="button"
        aria-label="Generate avatar placeholder"
        onClick={() => updateAvatar({ type: 'generated', fallbackInitials: avatar.fallbackInitials || 'AI' })}
      >
        Generate placeholder
      </button>
      <button type="submit" aria-label="Keep appearance">
        Keep appearance
      </button>
    </form>
  );
}
