import { renderTemplate, resolveTemplatePath } from '../templateRenderer';
import type { PromptContext } from '../types';

export function renderBranchPolicies(ctx: PromptContext): string {
  if (!ctx.hasBranchPolicies) return '';
  return renderTemplate(resolveTemplatePath('branch-policies.md'), ctx);
}
