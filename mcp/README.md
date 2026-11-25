# SEO360 MCP Server

Import or paste SEO360 JSON preset packs—or supply an exact DataForSEO endpoint with concrete parameters—then edit parameters, check your DataForSEO account balance, and execute API requests with explicit confirmation and USD cost tracking.

## Components

1. **SEO360 Chrome Extension (Preset Exporter)**: A third-party Chrome extension for selecting DataForSEO endpoints, configuring parameters visually, inspecting responses, and exporting single or multi-endpoint JSON preset packs (`[{"note", "api", "payload"}]`).
2. **SEO360 MCP Server (Controlled Execution)**: A local MCP server for AI clients (Claude Desktop, Cursor, Cherry Studio, Windsurf, Cline). It only accepts user-imported/pasted preset packs or tasks where the user explicitly provides both the exact endpoint and concrete parameters, preventing AI-generated endpoints or payloads.

## Features

* **User-Supplied Input Only**: Requires importing/pasting a valid SEO360 JSON preset pack or explicitly providing an exact DataForSEO v3 endpoint and concrete parameters—the AI cannot invent tasks on its own.
* **Explicit Execution Confirmation**: Never sends a live paid API request unless `user_agreed` is explicitly confirmed.
* **Account Balance & Spend Tracking**: Check real-time DataForSEO account balance via the free `v3/appendix/user_data` endpoint, and log per-request and cumulative USD costs in memory.
* **Task & Parameter Editing**: Update parameter values, delete specific parameter keys, remove individual tasks, or clear all loaded tasks.

## Quick Start

Add the following configuration to your MCP client:

```json
{
  "mcpServers": {
    "seo360-mcp": {
      "command": "npx",
      "args": ["-y", "seo360-mcp"],
      "env": {
        "DATAFORSEO_LOGIN": "your_dataforseo_email",
        "DATAFORSEO_PASSWORD": "your_dataforseo_api_password"
      }
    }
  }
}
```

## Available Tools

1. `import_seo360_preset` — Import from file or paste a single/compound SEO360 JSON preset pack (`[{"note", "api", "payload"}]`).
2. `create_user_task` — Register a task only when the user explicitly provides both an exact DataForSEO v3 endpoint and concrete parameter key-values.
3. `update_seo360_preset` — Update or add parameter values on a loaded task in memory ($0 cost).
4. `delete_seo360_preset` — Delete specific parameter keys from a task, delete a single task, or clear all loaded tasks.
5. `list_seo360_presets` — List all currently loaded tasks and their parameter values.
6. `execute_seo360_preset` — Execute a specific loaded task against the live DataForSEO API after explicit user agreement, logging request count and USD cost.
7. `get_usage_and_cost` — View session request count, success/failure count, cumulative USD cost, and recent request history.
8. `get_account_balance` — Query your live DataForSEO account balance, total deposited, and total spent via the free `v3/appendix/user_data` endpoint.
9. `lookup_seo360_param` — Return the SEO360 Chrome Extension link and direct endpoint/parameter questions to DataForSEO Official AI.

## Workflow

1. **Provide Input**: Either export a JSON preset pack from the SEO360 Chrome Extension (import file or paste JSON) or explicitly specify an exact DataForSEO endpoint and concrete parameters.
2. **Adjust Parameters**: Ask the AI to update or remove parameter values on the loaded task without spending credits.
3. **Confirm & Execute**: Review the parameters, confirm execution, and inspect the returned data along with request cost and account balance.

## Links

* **SEO360 Chrome Extension**: [Chrome Web Store](https://chromewebstore.google.com/detail/seo360-dataforseo-free-no/mpphhakiifalmlkphalklimjfkhkpbmp)
* **Official DataForSEO AI**: <https://chat.dataforseo.com/>