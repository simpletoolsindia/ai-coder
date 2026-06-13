# Providers

AI By ships with an OpenAI-compatible provider by default. Any endpoint that follows the OpenAI Chat Completions API can be used.

## Built-in

- `openai` – OpenAI
- `anthropic` – Anthropic (OpenAI-compatible gateway)
- `gemini` – Google Gemini (OpenAI-compatible gateway)
- `ollama` – local Ollama server
- `openai-compatible` – any custom endpoint
- `custom` – custom transport

## `/login` examples

```text
/login openai openai https://api.openai.com/v1 sk-xxx gpt-4o
/login local ollama
/login anthropic openai-compatible https://api.anthropic.com sk-xxx claude-3-5-sonnet
/login lmstudio openai-compatible http://localhost:1234/v1
/login gemini openai-compatible https://generativelanguage.googleapis.com/v1beta ${GEMINI_API_KEY} gemini-1.5-pro
```

## Environment variables

The provider manager will fall back to environment variables if no value is supplied:

| Variable                | Used by                       |
|-------------------------|-------------------------------|
| `OPENAI_API_KEY`        | `openai` kind                 |
| `ANTHROPIC_API_KEY`     | `anthropic` kind              |
| `GEMINI_API_KEY`        | `gemini` kind                 |
| `OLLAMA_BASE_URL`       | `ollama` kind                 |
| `OPENAI_BASE_URL`       | `openai` kind                 |
| `SEARXNG_URL`           | `web-search` plugin           |
| `<id>_API_KEY`          | any provider with that id     |
| `<id>_BASE_URL`         | any provider with that id     |
