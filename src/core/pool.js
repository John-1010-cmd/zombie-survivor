export function createPool(factory, reset) {
  const free = [];
  return {
    obtain(...args) {
      const obj = free.length ? free.pop() : factory();
      reset(obj, ...args);
      return obj;
    },
    release(obj) { free.push(obj); },
    get size() { return free.length; },
  };
}
