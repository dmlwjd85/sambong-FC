// 개발용 가짜 Firebase 인증: 항상 익명 로그인 성공
const user = { uid: 'mock-user', isAnonymous: true };
const auth = { currentUser: null };
export const getAuth = () => auth;
export const signInAnonymously = async () => { auth.currentUser = user; return { user }; };
export const signInWithCustomToken = signInAnonymously;
export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb(auth.currentUser), 0); return () => {}; };
