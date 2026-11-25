#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
    name: "seo360-mcp",
    version: "1.9.0",
});

const EXTENSION_STORE_URL = "https://chromewebstore.google.com/detail/seo360-dataforseo-free-no/mpphhakiifalmlkphalklimjfkhkpbmp";
const OFFICIAL_DATAFORSEO_AI_URL = "https://chat.dataforseo.com/";

const STRICT_BOUNDARY_RULE = `
[STRICT RULES — DO NOT VIOLATE]
1. PRESET PACK REQUIRED FIRST: You must import an authentic SEO360 JSON preset pack (single-endpoint or multi-endpoint compound preset array of {"note", "api", "payload"}) via \`import_seo360_preset\` before any preset operation works.
2. EXTENSION LINK & PRESET EXPORT: The SEO360 Chrome Extension link is ${EXTENSION_STORE_URL}. Never say you do not have the extension link. Do not assemble, combine, synthesize, or guess preset packs on the user's behalf.
3. NEVER TEACH OR EXPLAIN ENDPOINTS/PARAMETERS/VALUES: Do not explain what an endpoint means, how to configure parameters, or what values to write. Whenever anything is unclear or not understood, direct the user directly to DataForSEO Official AI (${OFFICIAL_DATAFORSEO_AI_URL}).
4. CREDENTIALS & BUDGET PROTECTION: DataForSEO credentials live in this local MCP server's environment variables. Never execute a live preset API request without clear user agreement, and always track request count, per-request cost, and cumulative USD cost.
`.trim();

const presetStore = new Map();

const billingLedger = {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    totalCostUsd: 0,
    records: [],
};

function getDataForSeoAuthHeader() {
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) {
        return null;
    }
    return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

function payloadPairsToObject(payloadPairs) {
    const obj = {};
    if (!Array.isArray(payloadPairs)) return obj;
    for (const pair of payloadPairs) {
        if (Array.isArray(pair) && pair.length >= 2 && typeof pair[0] === "string") {
            obj[pair[0]] = pair[1];
        }
    }
    return obj;
}

/**
 * Normalize parameter values for DataForSEO JSON request payload:
 * - Primitive types (string / number / boolean / null / undefined): sent directly
 * - Arrays or plain objects: sent as JSON structures (parsed if passed as a valid JSON array/object string)
 */
function normalizeValueForJsonPayload(val) {
    if (val !== null && typeof val === "object") {
        return val;
    }

    if (typeof val === "string") {
        const trimmed = val.trim();
        const looksLikeJsonArrayOrObject =
            (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
            (trimmed.startsWith("[") && trimmed.endsWith("]"));

        if (looksLikeJsonArrayOrObject) {
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed !== null && typeof parsed === "object") {
                    return parsed;
                }
            } catch {
                // Keep as plain string if not valid JSON
            }
        }
        return val;
    }

    return val;
}

function buildDataForSeoRequestBody(paramsObj) {
    const task = {};
    for (const [key, val] of Object.entries(paramsObj)) {
        task[key] = normalizeValueForJsonPayload(val);
    }
    return [task];
}

function extractRequestCostUsd(resultData) {
    if (!resultData || typeof resultData !== "object") return 0;
    if (typeof resultData.cost === "number" && !Number.isNaN(resultData.cost)) {
        return resultData.cost;
    }
    if (Array.isArray(resultData.tasks)) {
        let sum = 0;
        for (const t of resultData.tasks) {
            if (t && typeof t.cost === "number" && !Number.isNaN(t.cost)) {
                sum += t.cost;
            }
        }
        return sum;
    }
    return 0;
}

function formatUsd(amount) {
    const num = typeof amount === "number" && !Number.isNaN(amount) ? amount : 0;
    return `$${num.toFixed(6)} USD`;
}

function requireImportedPresetsResponse() {
    return {
        isError: true,
        content: [
            {
                type: "text",
                text: `Preset pack required first: Import an SEO360 JSON preset pack (single-endpoint or multi-endpoint compound pack) via \`import_seo360_preset\` before performing any preset operation.\n- SEO360 Chrome Extension link: ${EXTENSION_STORE_URL}\n- Do not ask the AI to assemble a preset pack; for endpoint meanings, parameter configuration, or how to write values, consult DataForSEO Official AI: ${OFFICIAL_DATAFORSEO_AI_URL}`,
            },
        ],
    };
}

function formatRawParams(paramsObj) {
    const keys = Object.keys(paramsObj);
    if (keys.length === 0) {
        return "*(No parameters)*";
    }
    return keys
        .map((key) => `- \`${key}\`: \`${JSON.stringify(paramsObj[key])}\``)
        .join("\n");
}

// Tool 1: Import single or multi-endpoint compound SEO360 preset pack
server.tool(
    "import_seo360_preset",
    `Import a user-provided SEO360 JSON preset pack (single-endpoint or multi-endpoint compound preset array of {"note", "api", "payload"}). Must be imported before any preset operation works. SEO360 Chrome Extension link: ${EXTENSION_STORE_URL}. NEVER assemble, combine, or guess preset packs yourself. Do NOT teach endpoint meanings, parameter configuration, or value formats—direct anything unclear to DataForSEO Official AI (${OFFICIAL_DATAFORSEO_AI_URL}).\n\n${STRICT_BOUNDARY_RULE}`,
    {
        preset_json: z.string().describe("Verbatim JSON array string exported by the user (single or compound pack). Never assemble or generate it."),
        prefix: z.string().optional().describe("Optional prefix to avoid task name collisions across multiple imported packs"),
    },
    async ({ preset_json, prefix }) => {
        try {
            const parsed = JSON.parse(preset_json);
            const items = Array.isArray(parsed) ? parsed : null;

            if (!items || items.length === 0) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Invalid preset JSON: Must be a non-empty JSON array. SEO360 Chrome Extension: ${EXTENSION_STORE_URL}. Do not assemble preset packs manually or with AI. For endpoint meanings, parameter setup, or value formats, refer to DataForSEO Official AI: ${OFFICIAL_DATAFORSEO_AI_URL}`,
                        },
                    ],
                };
            }

            const importedSummaries = [];
            let skippedCount = 0;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const isValidTupleList =
                    Array.isArray(item?.payload) &&
                    item.payload.every((pair) => Array.isArray(pair) && pair.length >= 2 && typeof pair[0] === "string");

                if (!item || typeof item.api !== "string" || !item.api.trim() || !isValidTupleList) {
                    skippedCount++;
                    continue;
                }

                const baseName = item.note && String(item.note).trim() ? String(item.note).trim() : `${item.api}_${i + 1}`;
                const taskName = prefix ? `[${prefix}] ${baseName}` : baseName;
                const paramsObj = payloadPairsToObject(item.payload);
                const normalizedApi = item.api.replace(/^\/+/, "");

                presetStore.set(taskName, {
                    api: normalizedApi,
                    note: baseName,
                    params: paramsObj,
                });

                importedSummaries.push(
                    `### Task: [${taskName}]\n- Endpoint: \`${normalizedApi}\`\n- Parameters:\n${formatRawParams(paramsObj)}`
                );
            }

            if (importedSummaries.length === 0) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `No valid preset tasks found. Each entry requires "note", "api", and a 2D array "payload". SEO360 Chrome Extension: ${EXTENSION_STORE_URL}. Do not assemble presets yourself. For endpoint meanings, parameter setup, or value formats, consult DataForSEO Official AI: ${OFFICIAL_DATAFORSEO_AI_URL}`,
                        },
                    ],
                };
            }

            const packType =
                importedSummaries.length > 1
                    ? `compound preset pack (${importedSummaries.length} tasks)`
                    : "single-endpoint preset pack (1 task)";
            const skippedNote = skippedCount > 0 ? `\n*(Skipped ${skippedCount} invalid item(s).)*` : "";

            return {
                content: [
                    {
                        type: "text",
                        text: `Imported ${packType}. Total loaded tasks: ${presetStore.size}.${skippedNote}\n\n${importedSummaries.join("\n\n---\n\n")}\n\nSEO360 Chrome Extension: ${EXTENSION_STORE_URL}\nFor questions on endpoints, parameters, or values, refer to DataForSEO Official AI: ${OFFICIAL_DATAFORSEO_AI_URL}`,
                    },
                ],
            };
        } catch (err) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Failed to parse preset JSON: ${err.message}. SEO360 Chrome Extension: ${EXTENSION_STORE_URL}. Do not assemble preset packs yourself. For endpoint meanings, parameter setup, or value formats, consult DataForSEO Official AI: ${OFFICIAL_DATAFORSEO_AI_URL}`,
                    },
                ],
            };
        }
    }
);

// Tool 2: Update parameters on an already-imported preset task
server.tool(
    "update_seo360_preset",
    `Update or add parameter values on an ALREADY IMPORTED preset task. Requires a preset pack to be imported first. Primitive values are sent directly; arrays and objects are sent as JSON. Do NOT teach how to configure parameters or write values—direct anything unclear to DataForSEO Official AI (${OFFICIAL_DATAFORSEO_AI_URL}).\n\n${STRICT_BOUNDARY_RULE}`,
    {
        task_name: z.string().describe("Exact task name (`note`) of an already-imported preset task"),
        updates_json: z.string().describe('JSON object of parameter updates, e.g. {"keyword": "test", "filters": {"field": "value"}}'),
    },
    async ({ task_name, updates_json }) => {
        if (presetStore.size === 0) {
            return requireImportedPresetsResponse();
        }

        const target = presetStore.get(task_name);
        if (!target) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Task [${task_name}] not found.\nLoaded tasks:\n${Array.from(presetStore.keys()).map((k) => `- ${k}`).join("\n")}`,
                    },
                ],
            };
        }

        try {
            const updates = JSON.parse(updates_json);
            if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Invalid updates_json: Must be a JSON object. For help on parameter configuration or values, consult DataForSEO Official AI: ${OFFICIAL_DATAFORSEO_AI_URL}`,
                        },
                    ],
                };
            }

            for (const [key, newVal] of Object.entries(updates)) {
                target.params[key] = newVal;
            }

            return {
                content: [
                    {
                        type: "text",
                        text: `Updated task [${task_name}] (\`${target.api}\`) in memory (no request sent, $0.000000 USD spent):\n\n${formatRawParams(target.params)}`,
                    },
                ],
            };
        } catch (err) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Failed to update parameters: ${err.message}. For help on parameter configuration or values, consult DataForSEO Official AI: ${OFFICIAL_DATAFORSEO_AI_URL}`,
                    },
                ],
            };
        }
    }
);

// Tool 3: Delete a preset task, specific parameter keys inside a task, or all imported presets
server.tool(
    "delete_seo360_preset",
    `Delete an imported preset task, delete specific parameter key(s) inside an imported preset task, or clear all imported presets. Requires a preset pack to be imported first.\n\n${STRICT_BOUNDARY_RULE}`,
    {
        delete_scope: z.enum(["params", "task", "all"]).describe('Deletion scope: "params" to remove specific parameter keys from a task, "task" to delete a task, or "all" to clear all imported presets'),
        task_name: z.string().optional().describe('Target task name (`note`), required when delete_scope is "params" or "task"'),
        param_keys: z.array(z.string()).optional().describe('Parameter keys to delete when delete_scope is "params"'),
    },
    async ({ delete_scope, task_name, param_keys }) => {
        if (presetStore.size === 0) {
            return requireImportedPresetsResponse();
        }

        if (delete_scope === "all") {
            const count = presetStore.size;
            presetStore.clear();
            return {
                content: [
                    {
                        type: "text",
                        text: `Cleared all ${count} imported preset task(s). Import a preset pack first before performing other preset operations. SEO360 Chrome Extension: ${EXTENSION_STORE_URL}`,
                    },
                ],
            };
        }

        if (!task_name || !presetStore.has(task_name)) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Invalid or missing \`task_name\`. Loaded tasks:\n${Array.from(presetStore.keys()).map((k) => `- ${k}`).join("\n") || "(None)"}`,
                    },
                ],
            };
        }

        if (delete_scope === "task") {
            presetStore.delete(task_name);
            return {
                content: [
                    {
                        type: "text",
                        text: `Deleted task [${task_name}]. Remaining loaded tasks: ${presetStore.size}.`,
                    },
                ],
            };
        }

        if (!Array.isArray(param_keys) || param_keys.length === 0) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Provide a non-empty \`param_keys\` array when \`delete_scope\` is "params".`,
                    },
                ],
            };
        }

        const target = presetStore.get(task_name);
        const deleted = [];
        const missing = [];

        for (const rawKey of param_keys) {
            const key = String(rawKey).trim();
            if (Object.prototype.hasOwnProperty.call(target.params, key)) {
                delete target.params[key];
                deleted.push(key);
            } else {
                missing.push(key);
            }
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Task [${task_name}] parameter deletion:\n- Deleted: ${deleted.length ? deleted.map((k) => `\`${k}\``).join(", ") : "None"}\n- Not found: ${missing.length ? missing.map((k) => `\`${k}\``).join(", ") : "None"}\n\nRemaining parameters:\n${formatRawParams(target.params)}`,
                },
            ],
        };
    }
);

// Tool 4: List imported preset tasks
server.tool(
    "list_seo360_presets",
    `List currently imported SEO360 preset tasks and their parameters. Requires a preset pack to be imported first.\n\n${STRICT_BOUNDARY_RULE}`,
    {},
    async () => {
        if (presetStore.size === 0) {
            return requireImportedPresetsResponse();
        }

        const list = [];
        for (const [name, data] of presetStore.entries()) {
            list.push({
                task_name: name,
                note: data.note,
                api: data.api,
                current_params: data.params,
            });
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(list, null, 2),
                },
            ],
        };
    }
);

// Tool 5: Execute a specific imported preset task ONLY after clear user agreement
server.tool(
    "execute_seo360_preset",
    `Execute a specific ALREADY IMPORTED preset task against DataForSEO. Primitive values are sent directly; arrays and objects are sent as JSON. Requires a preset pack to be imported first and clear user agreement (\`user_agreed: true\`) before sending the live request. Records request count and cost in USD.\n\n${STRICT_BOUNDARY_RULE}`,
    {
        task_name: z.string().describe("Exact task name (`note`) of an already-imported preset task to execute"),
        user_agreed: z.boolean().describe("Set to true only when the user has clearly agreed to run this live request"),
    },
    async ({ task_name, user_agreed }) => {
        if (presetStore.size === 0) {
            return requireImportedPresetsResponse();
        }

        if (!user_agreed) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Execution skipped: Clear user agreement is required before running task [${task_name}] to avoid unnecessary spend.`,
                    },
                ],
            };
        }

        const target = presetStore.get(task_name);
        if (!target) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Task [${task_name}] not found.\nLoaded tasks:\n${Array.from(presetStore.keys()).map((k) => `- ${k}`).join("\n")}`,
                    },
                ],
            };
        }

        const authHeader = getDataForSeoAuthHeader();
        if (!authHeader) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD is not set in the server environment.`,
                    },
                ],
            };
        }

        const url = `https://api.dataforseo.com/v3/${target.api}`;
        const requestBody = buildDataForSeoRequestBody(target.params);
        const startedAt = new Date().toISOString();

        billingLedger.totalRequests += 1;
        const requestSeq = billingLedger.totalRequests;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: authHeader,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            const resultData = await response.json();
            const requestCostUsd = extractRequestCostUsd(resultData);
            const isOk = response.ok && (!resultData?.status_code || resultData.status_code === 20000);

            if (isOk) {
                billingLedger.successRequests += 1;
            } else {
                billingLedger.failedRequests += 1;
            }
            billingLedger.totalCostUsd += requestCostUsd;

            billingLedger.records.push({
                seq: requestSeq,
                time: startedAt,
                task_name,
                api: target.api,
                http_status: response.status,
                api_status_code: resultData?.status_code ?? null,
                cost_usd: requestCostUsd,
                ok: isOk,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: `Request #${requestSeq} completed.\n- **Cost for this request**: **${formatUsd(requestCostUsd)}**\n- **Cumulative cost**: **${formatUsd(billingLedger.totalCostUsd)}** (${billingLedger.totalRequests} total request(s))\n- **Endpoint**: \`${url}\`\n- **Payload sent**: \`${JSON.stringify(requestBody)}\`\n\n### API Response:\n${JSON.stringify(resultData, null, 2)}`,
                    },
                ],
            };
        } catch (err) {
            billingLedger.failedRequests += 1;
            billingLedger.records.push({
                seq: requestSeq,
                time: startedAt,
                task_name,
                api: target.api,
                http_status: null,
                api_status_code: null,
                cost_usd: 0,
                ok: false,
                error: err.message,
            });

            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Request #${requestSeq} failed: ${err.message}\n- **Cost for this request**: $0.000000 USD\n- **Cumulative cost**: ${formatUsd(billingLedger.totalCostUsd)} (${billingLedger.totalRequests} total request(s))`,
                    },
                ],
            };
        }
    }
);

// Tool 6: Query request count, cost per request, and cumulative cost
server.tool(
    "get_usage_and_cost",
    `Query total API request count, success/failure count, cumulative cost in USD, and per-request cost history.\n\n${STRICT_BOUNDARY_RULE}`,
    {
        recent_limit: z.number().int().min(1).max(100).optional().describe("Number of recent request records to display (default 20)"),
    },
    async ({ recent_limit = 20 }) => {
        const recent = billingLedger.records.slice(-recent_limit);
        const lines = recent.map((r) => {
            const statusText = r.ok ? `OK (${r.http_status})` : `Failed (${r.error || r.api_status_code || r.http_status || "ERR"})`;
            return `- **#${r.seq}** [${r.time}] \`${r.api}\` (Task: [${r.task_name}]) — Cost: **${formatUsd(r.cost_usd)}** | Status: ${statusText}`;
        });

        return {
            content: [
                {
                    type: "text",
                    text: `### Request Count & Cost Summary\n- **Total requests**: ${billingLedger.totalRequests} (${billingLedger.successRequests} succeeded / ${billingLedger.failedRequests} failed or errored)\n- **Cumulative cost**: **${formatUsd(billingLedger.totalCostUsd)}**\n- **Loaded preset tasks**: ${presetStore.size}\n\n### Recent ${lines.length} Request(s):\n${lines.length ? lines.join("\n") : "*(No API requests executed yet)*"}`,
                },
            ],
        };
    }
);

// Tool 7: Check live DataForSEO account balance via free appendix/user_data endpoint
server.tool(
    "get_account_balance",
    `Check the current DataForSEO account balance, total deposited, and total spent in USD using the free \`v3/appendix/user_data\` endpoint ($0.000000 cost). Does not require importing a preset pack first.\n\n${STRICT_BOUNDARY_RULE}`,
    {},
    async () => {
        const authHeader = getDataForSeoAuthHeader();
        if (!authHeader) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD is not set in the server environment.`,
                    },
                ],
            };
        }

        const url = "https://api.dataforseo.com/v3/appendix/user_data";
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    Authorization: authHeader,
                    "Content-Type": "application/json",
                },
            });

            const resultData = await response.json();
            const isOk = response.ok && resultData?.status_code === 20000;
            const userInfo = resultData?.tasks?.[0]?.result?.[0];

            if (!isOk || !userInfo) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Failed to retrieve account balance (HTTP ${response.status}, API status ${resultData?.status_code ?? "N/A"}): ${resultData?.status_message || "Unknown error"}`,
                        },
                    ],
                };
            }

            const money = userInfo.money || {};
            const balance = typeof money.balance === "number" ? formatUsd(money.balance) : "N/A";
            const total = typeof money.total === "number" ? formatUsd(money.total) : "N/A";
            const spent = typeof money.spent === "number" ? formatUsd(money.spent) : "N/A";
            const loginName = userInfo.login || process.env.DATAFORSEO_LOGIN;

            return {
                content: [
                    {
                        type: "text",
                        text: `### DataForSEO Account Balance\n- **Account**: \`${loginName}\`\n- **Current Balance**: **${balance}**\n- **Total Deposited**: ${total}\n- **Total Spent**: ${spent}\n- **Query Cost**: $0.000000 USD (free endpoint)`,
                    },
                ],
            };
        } catch (err) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Failed to check DataForSEO account balance: ${err.message}`,
                    },
                ],
            };
        }
    }
);

// Tool 8: Direct users to DataForSEO Official AI for endpoint/parameter/value guidance (or return extension link when asked)
server.tool(
    "lookup_seo360_param",
    `Requires an imported preset pack first. Provides the SEO360 Chrome Extension link (${EXTENSION_STORE_URL}) when requested, and does NOT explain endpoints, parameter configuration, or value formats—directs users directly to DataForSEO Official AI (${OFFICIAL_DATAFORSEO_AI_URL}).\n\n${STRICT_BOUNDARY_RULE}`,
    {
        param_names: z.array(z.string()).describe("Parameter or endpoint names the user is asking about"),
    },
    async ({ param_names }) => {
        if (presetStore.size === 0) {
            return requireImportedPresetsResponse();
        }

        const keys = param_names.map((k) => `\`${String(k).trim()}\``).join(", ");
        return {
            content: [
                {
                    type: "text",
                    text: `SEO360 Chrome Extension link: ${EXTENSION_STORE_URL}\nFor questions about ${keys || "endpoints, parameters, or how to write values"}, please consult DataForSEO Official AI directly: ${OFFICIAL_DATAFORSEO_AI_URL}`,
                },
            ],
        };
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);