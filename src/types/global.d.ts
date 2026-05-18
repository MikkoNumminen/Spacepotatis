// Ambient module declarations for non-TS asset imports.
// TS 6 tightened side-effect imports; the `import "./globals.css"` in
// src/app/layout.tsx needs a matching ambient module or the typecheck fails.
declare module "*.css";
