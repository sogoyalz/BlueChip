import { startStack, Stack } from "./stack";

declare global {
  // eslint-disable-next-line no-var
  var __bluechipStack: Stack | undefined;
}

export default async function globalSetup() {
  const stack = await startStack();
  // globalTeardown runs in a separate module scope but the same process.
  globalThis.__bluechipStack = stack;
  process.stdout.write("[e2e] stack ready\n");
}
