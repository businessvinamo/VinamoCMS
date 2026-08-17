import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    // Der Isolationstest arbeitet gegen eine echte Datenbank und legt dabei
    // Mandanten an. Parallele Läufe würden sich gegenseitig die Fixtures
    // wegräumen, deshalb strikt nacheinander.
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
