// 개발용 가짜 Firebase (npm run dev:mock). 진짜 서버에 닿지 않아요.
export const initializeApp = () => ({ name: 'mock' });
export const getApps = () => [];
export const getApp = () => ({ name: 'mock' });
