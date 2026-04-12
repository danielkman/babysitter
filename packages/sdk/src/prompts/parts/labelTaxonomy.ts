import { renderTemplate, resolveTemplatePath } from '../templateRenderer';
import type { PromptContext } from '../types';

export function renderLabelTaxonomy(ctx: PromptContext): string {
  if (!ctx.hasLabelTaxonomy) return '';
  return renderTemplate(resolveTemplatePath('label-taxonomy.md'), ctx);
}
