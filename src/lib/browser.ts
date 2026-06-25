// A single handle to the browser's extension features that works the same
// in both Chrome and Firefox, so the rest of the code doesn't have to care which.

const browserApi = (globalThis as unknown as {
  browser?: typeof chrome;
  chrome?: typeof chrome;
}).browser ?? (globalThis as unknown as { chrome: typeof chrome }).chrome;

export default browserApi;
