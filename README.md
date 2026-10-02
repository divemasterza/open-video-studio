# Open Video Studio

A local-first studio for generating and comparing AI videos through OpenRouter video models.

## What Works

- Save an OpenRouter API key locally.
- Sync video model metadata from OpenRouter.
- Generate text-to-video jobs.
- Generate first-frame and start/end-frame jobs when the selected model supports them.
- Persist jobs, prompts, payloads, model settings, and statuses in SQLite.
- Poll async jobs and save completed videos to a local output directory.
- Browse jobs, gallery items, and compare 2-4 completed local videos.
- Submit controlled batches with up to 3 selected models and up to 3 videos per model.
- Enhance prompts with an LLM (via OpenRouter chat models) before generating — see below.

## Prompt Enhancer

The Generate screen includes a **Prompt enhancer** under the prompt box. It rewrites a rough idea into a production-ready video prompt covering subject, motion, camera, setting, lighting, style, and (when audio is enabled) sound.

- Context-aware: it uses the current mode (text, image-to-video, start + end frame), target model(s), duration, aspect ratio, and audio toggle. In image modes it focuses on motion instead of re-describing the frame.
- Style presets (cinematic, documentary, product ad, social/UGC, anime, 3D, surreal) plus a free-text direction field.
- Generate 1-3 distinct variations, click **Use this** to apply one, and **Undo** to restore your original.
- Light model-specific hints for Veo, Sora, Kling, Wan, Seedance, Hailuo, Runway, and Luma.
- The rewriting model is configurable in Settings (default `anthropic/claude-sonnet-4.5`) and is billed to your OpenRouter key; the cost of each enhancement is shown under the results (typically well under $0.02).

## Run Locally

```bash
npm install
npm run build
npm start
```

Open:

```text
http://127.0.0.1:4317
```

For development with Vite and the local API:

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:5173
```

## Local Data

Runtime data is stored under `.ovstudio/`:

- `studio.sqlite` for settings, model cache, jobs, and assets
- `assets/` for uploaded frame images
- `outputs/` for downloaded videos unless changed in Settings

The app is designed for local use. Do not host it publicly with a saved API key.

## API Surface

The local backend exposes:

- `GET /api/settings`
- `PATCH /api/settings`
- `POST /api/settings/test`
- `GET /api/models/video`
- `POST /api/models/sync`
- `GET /api/prompts/styles`
- `POST /api/prompts/enhance`
- `POST /api/assets/upload`
- `POST /api/jobs`
- `POST /api/batches`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs/:id/poll`
- `POST /api/jobs/:id/download`
- `POST /api/jobs/:id/retry`
- `POST /api/jobs/:id/duplicate`
- `DELETE /api/jobs/:id`
- `GET /api/gallery`

## Notes

Node 22's built-in SQLite module is used to avoid a native SQLite dependency. It may print an experimental warning depending on the installed Node build.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md). This app stores API keys locally and should not be hosted publicly with a saved key.

## License

MIT. See [LICENSE](LICENSE).
