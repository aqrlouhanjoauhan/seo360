# SEO360 MCP Server

Import SEO360 Chrome extension preset packs, modify or delete parameters, check your DataForSEO account balance, and execute DataForSEO API requests with explicit confirmation and USD cost tracking.

## Components

1. **SEO360 Chrome Extension (Preset Exporter)**: A third-party Chrome extension for selecting DataForSEO endpoints, configuring parameters visually, inspecting responses, and exporting single or multi-endpoint JSON preset packs (`[{"note", "api", "payload"}]`).

2. **SEO360 MCP Server (Controlled Execution)**: A local MCP server for AI clients (Claude Desktop, Cursor, Cherry Studio, Windsurf, Cline). It locks execution to imported SEO360 preset packs, uses your local environment credentials, and requires explicit user confirmation before sending paid API requests.

## Features

* **Preset-First Gate**: Requires importing a valid SEO360 JSON preset pack before any preset operation works.

* **Explicit Execution Confirmation**: Never sends a live paid API request unless `user_agreed` is explicitly confirmed.

* **Account Balance & Spend Tracking**: Check real-time DataForSEO account balance via the free `v3/appendix/user_data` endpoint, and log per-request and cumulative USD costs in memory.

* **Preset & Parameter Editing**: Update parameter values, delete specific parameter keys, remove individual tasks, or clear all loaded presets.

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

1. `import_seo360_preset` — Import a single or compound SEO360 JSON preset pack (`[{"note", "api", "payload"}]`) exported from the Chrome extension.

2. `update_seo360_preset` — Update or add parameter values on an imported preset task in memory ($0 cost).

3. `delete_seo360_preset` — Delete specific parameter keys from a task, delete a single task, or clear all imported presets.

4. `list_seo360_presets` — List all currently loaded preset tasks and their parameter values.

5. `execute_seo360_preset` — Execute a specific imported preset task against the live DataForSEO API after explicit user agreement, logging request count and USD cost.

6. `get_usage_and_cost` — View session request count, success/failure count, cumulative USD cost, and recent request history.

7. `get_account_balance` — Query your live DataForSEO account balance, total deposited, and total spent via the free `v3/appendix/user_data` endpoint.

8. `lookup_seo360_param` — Return the SEO360 Chrome Extension link and direct endpoint/parameter questions to DataForSEO Official AI.

## Workflow

1. **Export Preset**: In the SEO360 Chrome Extension, configure one or more DataForSEO endpoints and export the JSON preset pack.

2. **Import**: Paste the JSON preset array into your MCP client and run `import_seo360_preset`.

3. **Adjust Parameters**: Ask the AI to update or remove parameter values on the loaded task without spending credits.

4. **Confirm & Execute**: Review the parameters, confirm execution, and inspect the returned data along with request cost and account balance.

## Links

* **SEO360 Chrome Extension**: [Chrome Web Store](https://chromewebstore.google.com/detail/seo360-dataforseo-free-no/mpphhakiifalmlkphalklimjfkhkpbmp)

* **Official DataForSEO AI**: <https://chat.dataforseo.com/>