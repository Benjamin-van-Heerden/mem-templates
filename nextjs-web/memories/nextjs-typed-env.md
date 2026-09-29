Read configuration only through `serverEnv` and `clientEnv` from `src/env/`, never `process.env`. A new variable goes into the zod schema and `.env.example` first.
