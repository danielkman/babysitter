import { renderTemplate, resolveTemplatePath } from '../templateRenderer';
import type { PromptContext } from '../types';

export function renderIssueLinking(ctx: PromptContext): string {
  if (!ctx.hasIssueLinking) return '';
  return renderTemplate(resolveTemplatePath('issue-linking.md'), ctx);
}
