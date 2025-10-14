// Simple event bus for cross-module communication
// Usage:
// import { subscribe, publish } from './EventBus';
// const unsub = subscribe('event', (payload) => {});
// publish('event', { ... })
// unsub();

const listeners = new Map();

export function subscribe(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  const set = listeners.get(event);
  set.add(cb);
  return () => {
    set.delete(cb);
  };
}

export function publish(event, payload) {
  const set = listeners.get(event);
  if (!set || set.size === 0) return;
  [...set].forEach((cb) => {
    try { cb(payload); } catch (e) { /* noop */ }
  });
}
