# MCP Architecture

The Model Context Protocol (MCP) is an open standard -- originally from Anthropic, now under the Linux Foundation -- that solves the M×N integration problem for AI agents.

Before MCP, every AI application needed a custom connector to every tool or data source. Ten AI apps, ten data sources: a hundred custom integrations to build and maintain. MCP standardizes that interface so any agent can connect to any MCP-compatible server using the same protocol.

The USB-C analogy holds: one plug, any device. One protocol, any tool.

---

## The three primitives

**Tools** -- Executable actions an agent can invoke.

Examples: `create_github_issue`, `query_database`, `send_slack_message`, `restart_device`

Tools are the primary surface where agent capability lives. Tool schema design -- how you name, scope, and describe tools -- directly determines whether an agent uses them correctly. Ambiguous tool names and missing parameter descriptions are the most common reason agent behavior is unreliable.

**Resources** -- Read-only data sources the agent can pull context from.

Examples: files, repos, API responses, documentation

Resources give agents the context they need to make good decisions. The design question is always: what context does the agent need, when does it need it, and how do you retrieve the right subset without blowing out the context window?

**Prompts** -- Reusable templates that shape how the agent formulates requests.

Prompts in MCP are more structured than system prompts -- they're declarative templates with defined inputs. Think of them as parameterized instructions that can be surfaced to users or composed by orchestrators.

---

## How it works technically

MCP runs over JSON-RPC 2.0, transported via either:

- **stdio** -- for local integrations (the agent and server run on the same machine)
- **HTTP + SSE** -- for remote integrations (the server is a hosted endpoint)

The lifecycle for a tool call:

```
Agent --> MCP Client --> [JSON-RPC over stdio/HTTP] --> MCP Server --> Tool Execution --> Response
```

The client handles the protocol; the server handles the capability. Agents don't call tools directly -- they call the MCP client, which manages the connection to the server.

This separation matters for platform PMs: the MCP server is where you define what your product can do for agents. The quality of that server -- reliability, tool schema clarity, error handling -- determines your product's reputation in the agent ecosystem.

---

## Why MCP won

Several competing standards existed before MCP achieved escape velocity. The reasons it won are instructive:

**Anthropic shipped a reference implementation first.** The spec wasn't theoretical -- Claude.ai MCP support launched alongside the spec. Developers could build and test immediately.

**The primitives are simple enough to implement quickly.** A minimal MCP server is ~50 lines of code. Low friction to entry meant fast ecosystem growth.

**GitHub adopted it.** When GitHub announced MCP support for Copilot extensions, the developer tooling ecosystem effectively standardized on MCP. Network effects took over from there.

**The Linux Foundation governance move was smart.** Moving the spec to neutral governance removed the "Anthropic controls the standard" objection from enterprise buyers and competing AI labs. OpenAI, Google, and Microsoft have all shipped MCP-compatible tooling since.

The deeper lesson: open protocols win when the first implementation is high quality, the primitives are learnable in an afternoon, and a platform with distribution adopts it early.

---

## Tool schema design -- where most teams get it wrong

The spec tells you what a tool schema needs to contain. It doesn't tell you how to write one that an agent will use correctly.

Common failure modes:

**Overlapping tool names.** If you have `get_device` and `get_device_details`, agents will guess wrong about which to call. Name tools for the specific action they perform, not for the object they touch.

**Missing parameter descriptions.** Every parameter needs a description. Agents infer intent from descriptions -- a parameter named `id` with no description will be populated incorrectly. A parameter named `id` described as "the device's numeric Domotz ID, not the MAC address" will not.

**Tools that do too much.** A tool named `manage_device` that accepts a `action` parameter with 12 possible values is not a tool -- it's an API endpoint wearing a tool costume. Split it. Agents reason better with narrow, well-named tools.

**No error context in responses.** When a tool fails, the error response needs to tell the agent what went wrong and what to try next. "Error 400" is not useful. "Device ID not found -- use `list_devices` to retrieve valid device IDs" enables recovery.

---

## The ecosystem map (June 2026)

| Layer | What exists |
|-------|------------|
| Spec | MCP 2025-11-25 (latest stable) |
| SDKs | Official: Python, TypeScript. Community: Go, Rust, Java, C# |
| Registry | 5,000+ community servers at github.com/mcp |
| Runtime support | Claude, ChatGPT, GitHub Copilot, Cursor, VS Code, Zed |
| Hosting | Cloudflare Workers MCP, Vercel MCP, self-hosted |
| Observability | Still early -- LangSmith, Langfuse have partial support |

The observability gap is the most significant platform risk right now. When an agent using five MCP tools produces a wrong answer, tracing which tool call caused it is harder than it should be. This is where the next wave of developer tooling investment will go.

---

## Resources

- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25) -- read the primitives and trust model sections closely
- [github.com/modelcontextprotocol](https://github.com/modelcontextprotocol) -- spec, SDKs, reference servers
- [MCP Registry](https://github.com/mcp) -- 5,000+ community-built servers
