// neo-blessed ships no type definitions; the TUI uses it through a thin,
// loosely-typed surface. Treat the module as `any` rather than pulling in the
// (separate, partial) @types/blessed.
declare module "neo-blessed" {
  const blessed: any;
  export default blessed;
}
