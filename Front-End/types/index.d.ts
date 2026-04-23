declare global {
  interface Window {
    katex: typeof import("katex");
  }
}

export * from "./search";