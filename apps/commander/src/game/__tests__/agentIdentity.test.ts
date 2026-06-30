/**
 * SPEC-KRADLE-MODEL — the REAL agent-identity model flowing through the store.
 *
 * The Foundry "Agents" tab and the WarRoom read `views.listDefinitions()` /
 * `views.listPersonas()` (the real `AgentDefinition`/`AgentPersona` model) and
 * the board slice mirrors them per tick. These tests pin:
 *   - the mock path supplies EMPTY personas/definitions (no fixture), and the
 *     store ingests them honestly (empty board slices → honest empty states);
 *   - the real-path `commitTick` payload (mirroring realBoot's commitKradleTick)
 *     lands resolved personas + definitions in the board slice;
 *   - the live mapper → tick → store flow surfaces a definition's resolved
 *     persona identity (displayName + emoji + bound stackRef + roleContext).
 */
import { describe, expect, it } from 'vitest';

import { MockBackend } from '../../backend/mock/mockBackend';
import { mapToTickInput } from '../../backend/kradle/mappers';
import type {
  KradleControllerSnapshot,
  KradleResourceItem,
} from '../../backend/kradle/controllerClient';
import { bindBackendToStore, createCommanderStore, type TickCommitInput } from '../store';

function emptyTick(over: Partial<TickCommitInput>): TickCommitInput {
  return {
    frames: [],
    units: [],
    tasks: [],
    hooks: [],
    cards: [],
    agents: [],
    inquiries: [],
    runStages: {},
    rosterAgents: [],
    personas: [],
    definitions: [],
    nowMs: 1000,
    tickIndex: 1,
    paused: false,
    ...over,
  };
}

function persona(name: string, spec: Record<string, unknown>): KradleResourceItem {
  return { kind: 'AgentPersona', metadata: { name }, spec, status: {} };
}
function appearance(name: string, spec: Record<string, unknown>): KradleResourceItem {
  return { kind: 'AgentAppearance', metadata: { name }, spec, status: {} };
}
function definition(name: string, spec: Record<string, unknown>): KradleResourceItem {
  return { kind: 'AgentDefinition', metadata: { name }, spec, status: {} };
}

describe('agent-identity model flows through the store (SPEC-KRADLE-MODEL)', () => {
  it('mock path: listPersonas/listDefinitions are empty and the board slice stays honestly empty', () => {
    const backend = new MockBackend({ seed: 7, autoStart: false });
    const store = createCommanderStore();
    bindBackendToStore(store, backend);

    // The mock sim seeds no AgentPersona/AgentDefinition fixtures.
    expect(backend.sim.listPersonas()).toEqual([]);
    expect(backend.sim.listDefinitions()).toEqual([]);
    // …and the board slice mirrors that honest empty state.
    expect(store.getState().board.personas).toEqual([]);
    expect(store.getState().board.definitions).toEqual([]);
  });

  it('real path: commitTick lands resolved personas + definitions in the board slice', () => {
    const store = createCommanderStore();
    const view = {
      name: 'atlas-reviewer',
      displayName: 'Atlas Reviewer',
      roleTitle: 'Senior Reviewer',
      tagline: 'Guards the merge gate',
      emoji: '🛡️',
      avatar: null,
      ttsProvider: null,
    };
    store.getState().commitTick(
      emptyTick({
        personas: [view],
        definitions: [
          {
            name: 'reviewer-on-main',
            personaRef: 'atlas-reviewer',
            stackRef: 'commander-verify-stack',
            roleContext: 'reviews PRs to main',
            persona: view,
          },
        ],
      }),
    );

    const board = store.getState().board;
    expect(board.personas).toHaveLength(1);
    expect(board.personas[0].displayName).toBe('Atlas Reviewer');
    expect(board.definitions).toHaveLength(1);
    expect(board.definitions[0].name).toBe('reviewer-on-main');
    expect(board.definitions[0].stackRef).toBe('commander-verify-stack');
    expect(board.definitions[0].persona?.emoji).toBe('🛡️');
  });

  it('live flow: mapToTickInput → commitTick surfaces a definition with its resolved persona identity', () => {
    const snapshot: KradleControllerSnapshot = {
      status: 'ready',
      agents: {
        personas: {
          items: [
            persona('atlas-reviewer', {
              organizationRef: 'kradle-org-commander-verify',
              displayName: 'Atlas Reviewer',
              role: { title: 'Senior Reviewer' },
            }),
          ],
        },
        appearances: {
          items: [
            appearance('atlas-look', { personaRef: 'atlas-reviewer', emoji: '🛡️' }),
          ],
        },
        definitions: {
          items: [
            definition('reviewer-on-main', {
              organizationRef: 'kradle-org-commander-verify',
              personaRef: 'atlas-reviewer',
              stackRef: 'commander-verify-stack',
              roleContext: 'reviews PRs to main',
            }),
          ],
        },
      },
    };

    const tick = mapToTickInput(snapshot, 1000);
    const store = createCommanderStore();
    store.getState().commitTick(emptyTick(tick));

    const board = store.getState().board;
    // A definition row carries the resolved persona identity the AgentsTab renders.
    const def = board.definitions.find((d) => d.name === 'reviewer-on-main');
    expect(def).toBeDefined();
    expect(def!.persona?.displayName).toBe('Atlas Reviewer');
    expect(def!.persona?.emoji).toBe('🛡️');
    expect(def!.stackRef).toBe('commander-verify-stack');
    expect(def!.roleContext).toBe('reviews PRs to main');
    // The personas gallery source is populated too.
    expect(board.personas.map((p) => p.displayName)).toContain('Atlas Reviewer');
  });
});
