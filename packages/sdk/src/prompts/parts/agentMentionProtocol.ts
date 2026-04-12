import { renderTemplate, resolveTemplatePath } from '../templateRenderer';
import type { PromptContext } from '../types';

export function renderAgentMentionProtocol(ctx: PromptContext): string {
  if (!ctx.hasAgentMentionProtocol) return '';
  return renderTemplate(resolveTemplatePath('agent-mention-protocol.md'), ctx);
}
