import { renderTemplate, resolveTemplatePath } from '../templateRenderer';
import type { PromptContext } from '../types';

export function renderSingleChannelRule(ctx: PromptContext): string {
  if (!ctx.hasSingleChannelRule) return '';
  return renderTemplate(resolveTemplatePath('single-channel-rule.md'), ctx);
}
