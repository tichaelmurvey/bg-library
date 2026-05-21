// Minimal global declarations for runtime APIs used in `src/`. The
// tsconfig deliberately omits the `DOM` / `WebWorker` libs to avoid
// pulling in browser-only types we don't use; this file types only the
// handful of universally available globals we do touch.

declare const console: {
  readonly warn: (message: string) => void;
};

declare const crypto: {
  readonly randomUUID: () => string;
};
