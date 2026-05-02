// Hand-rolled localStorage shim. Vitest's environment is "node" — no `window`
// or `localStorage` by default. Modules under test guard SSR via `typeof
// window` checks AND read/write `window.localStorage`, so we install both so
// the production code path is exercised end-to-end.

export class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  get length(): number {
    return this.store.size;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
}

export function installFakeLocalStorage(): FakeStorage {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.window) g.window = globalThis;
  const storage = new FakeStorage();
  (globalThis as unknown as { localStorage: FakeStorage }).localStorage = storage;
  return storage;
}
