declare global {
  interface Window {
    katex: typeof import("katex");
  }
}

declare module "*.svg" {
  const content: string;
  export default content;
}

export * from "./search";