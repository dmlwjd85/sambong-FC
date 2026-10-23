/** 기록 한 번으로 오른 능력치를 저장하고, 취소 때 그대로 되돌립니다. */

export function diffStatChanges(statKeys, before, updates) {
  const stats = {};
  statKeys.forEach((k) => {
    if (!Object.prototype.hasOwnProperty.call(updates, k)) return;
    const next = Number(updates[k]);
    const prev = Number(before[k]);
    if (!Number.isFinite(next) || !Number.isFinite(prev)) return;
    const delta = next - prev;
    if (delta !== 0) stats[k] = delta;
  });
  return stats;
}

export function pushUndo(stack, entry, cap = 40) {
  const next = Array.isArray(stack) ? stack.slice() : [];
  next.push(entry);
  while (next.length > cap) next.shift();
  return next;
}

export function popUndo(stack, type) {
  const next = Array.isArray(stack) ? stack.slice() : [];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i] && next[i].type === type) {
      const entry = next[i];
      next.splice(i, 1);
      return { entry, stack: next };
    }
  }
  return { entry: null, stack: next };
}

export function revertStatMap(current, deltas, min = 1, max = 99) {
  const out = {};
  Object.entries(deltas || {}).forEach(([k, d]) => {
    const n = Number(d);
    if (!n) return;
    const cur = Number(current[k]);
    const base = Number.isFinite(cur) ? cur : min;
    out[k] = Math.max(min, Math.min(max, base - n));
  });
  return out;
}
