// 개발용: 진짜 Firebase 대신 메모리 가짜 서버로 앱을 띄워요 → npm run dev:mock
// 감독으로 들어가려면 로그인 화면에서 '선생님' → PIN 1234
import { defineConfig, mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import base from './vite.config.js';

const mock = (f) => fileURLToPath(new URL(`./dev/mock-firebase/${f}`, import.meta.url));

export default defineConfig((env) => mergeConfig(base(env), {
  base: '/',
  resolve: {
    alias: {
      'firebase/app': mock('app.js'),
      'firebase/auth': mock('auth.js'),
      'firebase/firestore': mock('firestore.js'),
    },
  },
}));
