// 개발용 가짜 Firestore: 메모리에 저장하고 실시간 구독을 흉내 내요.
// 시작 데이터는 ./seed.js, 브라우저 콘솔에서 window.__mockDb 로 볼 수 있어요.
import { seed } from './seed.js';

const store = new Map(Object.entries(seed()));
const listeners = new Set();
const DELETE = Symbol('deleteField');
if (typeof window !== 'undefined') window.__mockDb = store;

export const getFirestore = () => ({ mock: true });
export const doc = (db, ...segs) => ({ type: 'doc', path: segs.join('/'), id: segs[segs.length - 1] });
export const collection = (db, ...segs) => ({ type: 'col', path: segs.join('/') });
export const deleteField = () => DELETE;

const clone = (v) => JSON.parse(JSON.stringify(v ?? null));
const docSnap = (path) => ({ id: path.split('/').pop(), exists: () => store.has(path), data: () => (store.has(path) ? clone(store.get(path)) : undefined) });
const colSnap = (path) => {
  const docs = [...store.keys()].filter((k) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/')).map(docSnap);
  return { docs, size: docs.length, forEach: (fn) => docs.forEach(fn) };
};
const fire = () => queueMicrotask(() => listeners.forEach((l) => l()));

function write(path, data, merge) {
  const base = merge && store.has(path) ? { ...store.get(path) } : {};
  Object.entries(data).forEach(([k, v]) => { if (v === DELETE) delete base[k]; else base[k] = clone(v); });
  store.set(path, base);
}
export const setDoc = async (ref, data, opts) => { write(ref.path, data, !!(opts && opts.merge)); fire(); };
export const getDoc = async (ref) => docSnap(ref.path);
export const getDocs = async (ref) => colSnap(ref.path);
export const deleteDoc = async (ref) => { store.delete(ref.path); fire(); };
export const writeBatch = () => {
  const ops = [];
  return {
    set: (ref, data, opts) => { ops.push([ref, data, opts]); },
    commit: async () => { ops.forEach(([r, d, o]) => write(r.path, d, !!(o && o.merge))); fire(); },
  };
};
export const onSnapshot = (ref, cb) => {
  const run = () => cb(ref.type === 'col' ? colSnap(ref.path) : docSnap(ref.path));
  listeners.add(run);
  queueMicrotask(run);
  return () => listeners.delete(run);
};
