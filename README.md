# ChatOps Agent Hub

Extensible ChatOps control plane for IM-driven agent execution.

Current focus:

- domain models
- runner abstraction
- responses-api and codex-cli runner modes
- app-layer command routing
- session service
- minimal HTTP API
- Feishu webhook integration
- task execution and task status lookup

Runtime configuration:

- `RUNNER_MODE=auto|cli|responses`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `HOST`
- `PORT`
- `STATE_PATH`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_ENCRYPT_KEY`

Quick start:

1. Copy `.env.example` to `.env`
2. Set `OPENAI_API_KEY`
3. Run `npm run dev`
