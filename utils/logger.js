// Thin wrapper around console that no-ops debug logs in production builds.
// console.warn/console.error are kept as-is since they matter in prod too.
export const logger = {
  log: (...args) => {
    if (__DEV__) console.log(...args);
  },
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};
