import { renderTemplate, resolveTemplatePath } from '../templateRenderer';
import type { PromptContext } from '../types';

export function renderDraftPrProhibition(ctx: PromptContext): string {
  if (!ctx.hasDraftPrProhibition) return '';
  return renderTemplate(resolveTemplatePath('draft-pr-prohibition.md'), ctx);
}
