export default async function globalTeardown() {
  await globalThis.__bluechipStack?.stop();
}
