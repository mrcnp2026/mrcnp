import { config } from 'dotenv';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// 검사도 앱과 같은 열쇠 파일(code/.env.local)을 읽는다.
config({ path: path.join(import.meta.dirname, '.env.local'), quiet: true });

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.join(import.meta.dirname, 'src') },
  },
});
