import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const githubPages = loadEnv(mode, '.', '').GITHUB_PAGES === 'true';
  return {
    base: githubPages ? '/jizhuzhang-cloud/' : '/',
    plugins: [react()],
  };
});
