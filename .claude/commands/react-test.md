Create a React unit test file for the component(s) at: $ARGUMENTS

## Instructions

Read the component source file(s), then generate a test file using the **SIFERS pattern** with Vitest and React Testing Library. Follow every rule below exactly.

---

## SIFERS Pattern

**SIFERS** = **S**imple **I**njectable **F**unctions **E**xplicitly **R**eturning **S**tate

Replace all `beforeEach`/`afterEach` lifecycle hooks with a single `setup()` function per describe block. The `setup()` function:

1. Accepts an **optional** `SetupOptions` interface for per-test configuration (callbacks, feature flags, initial state overrides, etc.)
2. Declares test fixtures and prepares mock implementations
3. Calls `render(...)` to mount the component under test
4. **Explicitly returns** every piece of state a test might need (mock fns, fixture data, query helpers)
5. Is **called at the start of each individual `it()` block** — never once globally

### Minimal example

```tsx
interface SetupOptions {
  onSubmit?: (value: string) => void;
  initialValue?: string;
}

function setup(options: SetupOptions = {}) {
  const onSubmit = options.onSubmit ?? vi.fn();
  const initialValue = options.initialValue ?? '';

  render(<MyForm onSubmit={onSubmit} initialValue={initialValue} />);

  return { onSubmit, initialValue };
}

it('calls onSubmit with the current value', () => {
  // arrange
  const onSubmit = vi.fn();
  const { } = setup({ onSubmit });
  const input = screen.getByRole('textbox');

  // act
  fireEvent.change(input, { target: { value: 'hello' } });
  fireEvent.click(screen.getByRole('button', { name: /submit/i }));

  // assert
  expect(onSubmit).toHaveBeenCalledWith('hello');
});
```

### When teardown is needed

Return a `teardown` function from `setup()` and call it at the end of each test that requires cleanup:

```tsx
function setup(options: SetupOptions = {}) {
  const server = setupServer(...handlers);
  server.listen();

  render(<MyComponent />);

  return {
    teardown: () => server.close(),
  };
}

it('loads data', async () => {
  const { teardown } = setup();
  expect(await screen.findByText('Loaded')).toBeInTheDocument();
  teardown();
});
```

---

## Tooling rules

- **Test runner**: Vitest — import `describe`, `it`, `expect`, `vi` from `'vitest'`
- **DOM**: React Testing Library — import `render`, `screen`, `fireEvent`, `waitFor`, `within` from `'@testing-library/react'`
- **No `beforeEach`/`afterEach`** — consolidate all setup into `setup()`
- **Mocks**: declare `vi.mock()` calls at the **module level** (hoisted). When mock return values must be mutable, declare a `let mockX = vi.fn()` variable above the `vi.mock()` call so the factory closure captures it by reference.
- **React Router**: wrap renders in `<MemoryRouter>` when the component uses routing hooks or `<Link>`
- **Comments**: annotate each test body with `// arrange`, `// act`, `// assert` sections (omit sections that are empty)

---

## Test file conventions

- Location: same directory as the source file (e.g. `src/components/agent/Foo.tsx` → `src/components/agent/Foo.test.tsx`)
- Name: mirrors the source file — `Foo.tsx` → `Foo.test.tsx`
- Import the component **after** all `vi.mock()` calls

---

## What to test

For each component, cover:

1. **Default render** — the component mounts without errors and shows expected content
2. **Prop variations** — meaningful combinations of props that change rendered output
3. **User interactions** — clicks, form submissions, keyboard events that trigger callbacks or state changes
4. **Conditional rendering** — branches that show/hide elements based on props or state
5. **Edge cases** — empty lists, null/undefined props, loading states, error states

Do not test implementation details (internal state variable names, private methods). Query by accessible roles and text rather than CSS classes or `data-testid` unless no semantic alternative exists.

---

## Output

1. Show the full test file content, ready to paste
2. After the file, list any dependencies that must be installed if not already present
3. If the component has patterns that don't fit cleanly into SIFERS (e.g., complex context trees), explain the trade-off briefly
