import type { ReactElement, ComponentType } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Custom render that wraps the component in TestWrapper.
 * Use this instead of importing render directly from @testing-library/react.
 */
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { wrapper?: ComponentType },
) {
  const { wrapper, ...rest } = options ?? {};
  return render(ui, wrapper ? { wrapper, ...rest } : rest);
}

// Re-export everything from testing-library
export * from '@testing-library/react';

// Override render with our custom version
export { customRender as render };

// Export a pre-configured userEvent instance
export function setupUser() {
  return userEvent.setup();
}
