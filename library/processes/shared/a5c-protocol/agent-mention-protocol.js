/**
 * @process processes/shared/a5c-protocol/agent-mention-protocol
 * @description Implements the a5c @agent-name mention pattern. Scans commits, comments,
 *   and code for mentions (language-specific comment syntax), dispatches to the named
 *   agent via ctx.agent(), then performs mention-cleanup — removing the @agent token
 *   from the source and replacing it with a resolution note.
 * @inputs { source: "commit"|"comment"|"code", content: string, locationRef?: object }
 * @outputs { success: boolean, mentions: Array<object>, cleanup: Array<object> }
 *
 * Source: a5c-ai/action/default-prompt.md (mention protocol + mention-cleanup)
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

// Language-specific in-code comment syntax for @agent mentions.
// Reference table — consumed by the scanner prompt.
const COMMENT_SYNTAX = {
  'js/ts/java/c/cpp/go/rust/swift/kotlin': '// @agent-name: <instruction>',
  'python/ruby/shell/yaml/toml/r': '# @agent-name: <instruction>',
  'css/jsonc/block-style': '/* @agent-name: <instruction> */',
  'html/xml/markdown-html': '<!-- @agent-name: <instruction> -->',
  'sql/haskell/lua': '-- @agent-name: <instruction>',
};

const scanMentionsTask = defineTask(
  'agent-mention-protocol.scan',
  async ({ source, content }, ctx) => {
    return ctx.agent({
      title: `Scan ${source} for @agent mentions`,
      prompt: [
        'You are a mention-scanner. Find every `@agent-name` mention in the supplied content.',
        'Accept mentions from commit messages, PR/issue comments, and in-code comments using these syntaxes:',
        ...Object.entries(COMMENT_SYNTAX).map(([lang, syn]) => `  - ${lang}: ${syn}`),
        '',
        'For each mention, capture: { agent, instruction, line, rawMatch }.',
        `Source type: ${source}`,
        `Content:\n${(content ?? '').slice(0, 40000)}`,
        'Return JSON: { mentions: Array<{ agent, instruction, line, rawMatch }> }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Scan @agent mentions', labels: ['a5c', 'mention-protocol'] },
);

const dispatchAgentTask = defineTask(
  'agent-mention-protocol.dispatch',
  async ({ mention, locationRef }, ctx) => {
    return ctx.agent({
      title: `Dispatch @${mention.agent}`,
      prompt: [
        `You are acting AS @${mention.agent}. A mention was raised at ${JSON.stringify(locationRef ?? {})}.`,
        `Instruction: ${mention.instruction}`,
        'Carry out the instruction following the a5c protocol. When complete, return a short resolution note.',
        'Return JSON: { completed: boolean, resolutionNote: string, followUpUri?: string }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Dispatch mentioned agent', labels: ['a5c', 'mention-protocol'] },
);

const cleanupTask = defineTask(
  'agent-mention-protocol.cleanup',
  async ({ mention, resolution, locationRef }, ctx) => {
    return ctx.agent({
      title: `Mention-cleanup for @${mention.agent}`,
      prompt: [
        'Mention-cleanup phase. Remove the original `@agent` mention from the source and replace it with a',
        'resolution note that preserves surrounding structure (keep the comment syntax intact — only swap the payload).',
        `Original match: ${JSON.stringify(mention.rawMatch)}`,
        `Location: ${JSON.stringify(locationRef ?? {})}`,
        `Resolution note to insert: ${resolution?.resolutionNote ?? 'Handled.'}`,
        'For in-code mentions, commit the cleanup on the working branch with a small dedicated commit.',
        'For PR/issue comment mentions, post a new reply comment describing resolution; do not edit the original.',
        'Return JSON: { cleaned: boolean, commitSha?: string, commentUrl?: string }.',
      ].join('\n'),
    });
  },
  { kind: 'agent', title: 'Mention-cleanup', labels: ['a5c', 'mention-protocol'] },
);

export async function process(inputs, ctx) {
  const { source = 'comment', content = '', locationRef } = inputs ?? {};
  const scan = await ctx.task(scanMentionsTask, { source, content });
  const mentions = Array.isArray(scan?.mentions) ? scan.mentions : [];
  const cleanup = [];
  for (const mention of mentions) {
    const resolution = await ctx.task(dispatchAgentTask, { mention, locationRef });
    const cleaned = await ctx.task(cleanupTask, { mention, resolution, locationRef });
    cleanup.push({ agent: mention.agent, resolution, cleaned });
  }
  return { success: true, mentions, cleanup };
}
