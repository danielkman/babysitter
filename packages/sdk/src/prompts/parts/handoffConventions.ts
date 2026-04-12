import { renderTemplate, resolveTemplatePath } from '../templateRenderer';
import type { PromptContext } from '../types';

export function renderHandoffConventions(ctx: PromptContext): string {
  if (!ctx.hasHandoffConventions) return '';
  return renderTemplate(resolveTemplatePath('handoff-conventions.md'), ctx);
}
