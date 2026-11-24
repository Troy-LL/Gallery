`pnpm gallery-eval smoke --manifest evals/gold-manifest.example.json --mock` runs the scorer without a network call.

A real gate is `pnpm gallery-eval smoke --manifest evals/gold-manifest.json` with `TYPESAFE_API_KEY` set and at least 50 owned photos. The command writes `evals/YYYY-MM-DD-<model_version>-<vocab_version>.json` and does not write the API key or image bytes.
