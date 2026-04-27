import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'Electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: [
                'better-sqlite3',
                '@langchain/google-genai',
                '@langchain/openai',
                '@langchain/core',
                'langchain',
                '@modelcontextprotocol/sdk',
              ],
            },
          },
        },
      },
      preload: {
        input: 'Electron/preload.ts',
      },
    }),
  ],
})
