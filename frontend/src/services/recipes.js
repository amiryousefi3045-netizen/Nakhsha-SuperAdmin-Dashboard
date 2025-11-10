// Compatibility wrapper (DEPRECATED): re-export canonical `crafts` APIs under the old `recipes` names
// Note: Use `src/services/crafts` and `Craft*` components going forward. These
// wrappers are kept only for backward compatibility.
// The recipes compatibility wrapper has been removed as a breaking change.
// Please update imports to use `src/services/crafts` directly.
throw new Error(
  "The legacy `services/recipes` module has been removed. Import from 'src/services/crafts' instead."
);
