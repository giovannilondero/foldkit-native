import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Writes the Tailwind sheet the app imports, as loading the Metro config does.
    globalSetup: ['./vitest.tailwind.mts'],
  },
})
