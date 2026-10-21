import { defineConfig } from 'orval';

/** Typed admin API client generated from ../api/openapi.json — run `pnpm gen:api`. */
export default defineConfig({
  bocardo: {
    input: { target: '../api/openapi.json', filters: { tags: ['admin', 'users', 'health'] } },
    output: {
      mode: 'tags-split',
      target: 'src/core/api/generated',
      schemas: 'src/core/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      override: {
        mutator: { path: 'src/core/api/http-client.ts', name: 'httpClient' },
        fetch: { includeHttpResponseReturnType: false },
        query: { signal: true },
      },
    },
  },
});
