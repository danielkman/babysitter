/**
 * Capability profiles for the Cursor adapter.
 *
 * Cursor's hook surface evolves rapidly. This module allows
 * overriding the default capability assumptions when the
 * adapter's built-in profile doesn't match the actual Cursor
 * version/mode being used.
 *
 * Spec section 17.5: "allow adapter version/profile overrides
 * if Cursor behavior changes rapidly."
 */

/**
 * Describes what the current Cursor version/mode supports.
 */
export interface CursorCapabilityProfile {
  /** Profile name for diagnostics. */
  name: string;
  /** Cursor version range this profile applies to (informational). */
  cursorVersion?: string;
  /** Whether Cursor is running as IDE or CLI. */
  mode: 'ide' | 'cli' | 'unknown';
  /** Which native hook events are known to fire reliably. */
  reliableEvents: string[];
  /** Which native hook events exist but are unreliable or undocumented. */
  unreliableEvents: string[];
  /** Whether stop hook can actually continue the session. */
  stopCanContinue: boolean;
  /** Whether tool-level hooks are available at all. */
  toolHooksAvailable: boolean;
  /** Free-form notes about this profile's known limitations. */
  notes: string[];
}

/**
 * The default profile: conservative assumptions based on the
 * documented/stable Cursor hook surface as of early 2026.
 * Only sessionStart and stop are considered reliable.
 */
export const DEFAULT_PROFILE: CursorCapabilityProfile = {
  name: 'default-conservative',
  mode: 'unknown',
  reliableEvents: ['sessionStart', 'stop'],
  unreliableEvents: ['preToolUse', 'postToolUse'],
  stopCanContinue: true,
  toolHooksAvailable: false,
  notes: [
    'Only sessionStart and stop are documented as stable',
    'Tool hooks may exist in some Cursor versions but are not reliable',
    'IDE and CLI may have different event surfaces',
  ],
};

/**
 * A more permissive profile for Cursor CLI environments where
 * tool hooks have been observed to work.
 */
export const CLI_PERMISSIVE_PROFILE: CursorCapabilityProfile = {
  name: 'cli-permissive',
  mode: 'cli',
  reliableEvents: ['sessionStart', 'stop'],
  unreliableEvents: ['preToolUse', 'postToolUse', 'sessionEnd'],
  stopCanContinue: true,
  toolHooksAvailable: true,
  notes: [
    'Assumes CLI mode with tool hooks enabled',
    'Tool hooks may not fire for all tool types',
    'Behavior not guaranteed across Cursor versions',
  ],
};

/** Active profile — defaults to conservative. */
let activeProfile: CursorCapabilityProfile = { ...DEFAULT_PROFILE };

/**
 * Get the currently active capability profile.
 */
export function getActiveProfile(): CursorCapabilityProfile {
  return activeProfile;
}

/**
 * Override the active capability profile.
 * Use this when deploying against a known Cursor version/mode
 * that differs from the default conservative assumptions.
 *
 * @param profile - The profile to activate.
 */
export function setActiveProfile(profile: CursorCapabilityProfile): void {
  activeProfile = { ...profile };
}

/**
 * Reset to the default conservative profile.
 */
export function resetProfile(): void {
  activeProfile = { ...DEFAULT_PROFILE };
}

/**
 * Check whether a given native event name is considered reliable
 * under the current profile.
 */
export function isEventReliable(nativeEventName: string): boolean {
  return activeProfile.reliableEvents.includes(nativeEventName);
}

/**
 * Check whether a given native event name is known at all
 * (reliable or unreliable) under the current profile.
 */
export function isEventKnown(nativeEventName: string): boolean {
  return (
    activeProfile.reliableEvents.includes(nativeEventName) ||
    activeProfile.unreliableEvents.includes(nativeEventName)
  );
}

/**
 * Build a diagnostics summary of profile-related uncertainty
 * for a given event. Used by the normalizer to annotate events.
 */
export function getEventDiagnostics(nativeEventName: string): {
  isReliable: boolean;
  isKnown: boolean;
  profileName: string;
  mode: string;
  warnings: string[];
} {
  const isReliable = activeProfile.reliableEvents.includes(nativeEventName);
  const isKnown =
    isReliable || activeProfile.unreliableEvents.includes(nativeEventName);

  const warnings: string[] = [];

  if (!isKnown) {
    warnings.push(
      `Event '${nativeEventName}' is not recognized by the '${activeProfile.name}' capability profile`,
    );
  } else if (!isReliable) {
    warnings.push(
      `Event '${nativeEventName}' is known but unreliable under the '${activeProfile.name}' profile`,
    );
  }

  if (activeProfile.mode === 'unknown') {
    warnings.push(
      'Cursor mode (IDE vs CLI) is unknown; event behavior may vary',
    );
  }

  return {
    isReliable,
    isKnown,
    profileName: activeProfile.name,
    mode: activeProfile.mode,
    warnings,
  };
}
