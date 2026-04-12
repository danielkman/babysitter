import { describe, it, expect } from 'vitest';
import { createClaudeCodeContext } from '../context';
import * as parts from '../parts';

const gatedParts: Array<{
  render: (ctx: ReturnType<typeof createClaudeCodeContext>) => string;
  flag: string;
  match: RegExp;
}> = [
  { render: parts.renderPrPolicies, flag: 'hasPrPolicies', match: /Pull Request Policies/ },
  { render: parts.renderBranchPolicies, flag: 'hasBranchPolicies', match: /Branch Policies/ },
  { render: parts.renderIssueLinking, flag: 'hasIssueLinking', match: /Issue Linking/ },
  { render: parts.renderDraftPrProhibition, flag: 'hasDraftPrProhibition', match: /Draft PR Policy/ },
  { render: parts.renderLabelTaxonomy, flag: 'hasLabelTaxonomy', match: /Label Taxonomy/ },
  { render: parts.renderSingleChannelRule, flag: 'hasSingleChannelRule', match: /Single-Channel/ },
  { render: parts.renderSourceQuoteCap, flag: 'hasSourceQuoteCap', match: /Source Quote Discipline/ },
  { render: parts.renderAgentMentionProtocol, flag: 'hasAgentMentionProtocol', match: /Agent Mention Protocol/ },
  { render: parts.renderHandoffConventions, flag: 'hasHandoffConventions', match: /Handoff Conventions/ },
];

describe('GH-gated prompt parts', () => {
  for (const { render, flag, match } of gatedParts) {
    it(`${flag} returns empty by default`, () => {
      expect(render(createClaudeCodeContext())).toBe('');
    });
    it(`${flag} renders when flag enabled`, () => {
      const out = render(createClaudeCodeContext({ [flag]: true }));
      expect(out).toMatch(match);
    });
  }
});
