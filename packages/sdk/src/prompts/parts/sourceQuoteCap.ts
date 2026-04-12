import { renderTemplate, resolveTemplatePath } from '../templateRenderer';
import type { PromptContext } from '../types';

export function renderSourceQuoteCap(ctx: PromptContext): string {
  if (!ctx.hasSourceQuoteCap) return '';
  return renderTemplate(resolveTemplatePath('source-quote-cap.md'), ctx);
}
