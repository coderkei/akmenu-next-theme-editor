// Tests run in Node; this is the one Node API they use. Swap for @types/node if more are needed.
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
}
