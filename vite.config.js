import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE || '/';
  return {
    plugins: [react()],
    base,
    build: {
      // 글꼴 조각은 작아도 CSS에 base64로 넣지 않아요(넣으면 모든 조각을 첫 화면에 받게 돼요)
      assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
    },
  };
});
