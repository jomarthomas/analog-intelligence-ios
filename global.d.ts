// Ambient declarations for non-code module imports.

// CSS / CSS-module side-effect imports (used on web; no-ops on native).
declare module '*.css';
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
