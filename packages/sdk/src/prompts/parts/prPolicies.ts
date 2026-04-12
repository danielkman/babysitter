import { renderTemplate, resolveTemplatePath } from '../templateRenderer';
import type { PromptContext } from '../types';

export function renderPrPolicies(ctx: PromptContext): string {
  if (!ctx.hasPrPolicies) return '';
  return renderTemplate(resolveTemplatePath('pr-policies.md'), ctx);
}
