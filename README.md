# Agent Platform Notes

A working reference on MCP architecture, agentic workflow design, and developer platform thinking — maintained by Matt Young.

I'm a product leader who has spent the last few years building agent-based platforms, MCP infrastructure, and developer tooling. This repo is where I keep my thinking organized on the protocols, patterns, and platforms that actually matter right now.

It is not a tutorial. It is how I think.

---

## Contents

| File | What it covers |
|------|---------------|
| [mcp-architecture.md](./mcp-architecture.md) | What MCP is, how it works, and why it won |
| [agent-patterns.md](./agent-patterns.md) | The architectural patterns that separate real agent platforms from demos |
| [platform-strategy.md](./platform-strategy.md) | Extensibility vs. reliability, cold start, measuring success |
| [reading-list.md](./reading-list.md) | Annotated resources -- what to read and why it matters |

---

## My work in this space

**[domotz-mcp-server](https://github.com/younginseattle/domotz-mcp-server)** — MCP server connecting Claude to the Domotz network monitoring platform. Exposes 130+ API endpoints as MCP tools for natural language control of infrastructure monitoring, device management, and network diagnostics. I led the product architecture and delivery -- tool schema design, agent orchestration patterns, and go-to-market strategy for MCP-enabled agentic workflows.

**[Netops-Swarm](https://github.com/younginseattle/Netops-Swarm)** — Multi-agent system for autonomous network incident response. Three coordinated agents handle detection, diagnosis, and remediation without human intervention. Built to demonstrate production-correct orchestration patterns: centralized routing, shared state, guardrailed action chains.

---

## What I'm thinking about

A few open questions I'm actively working through:

**Agent identity and authorization** -- When an agent acts on a developer's behalf, whose permissions apply? OAuth scopes were designed for humans. The agent authorization model is still being worked out at the protocol level, and most platforms are punting on it.

**Code search as an agent primitive** -- The jump from "search my codebase" to "understand the architectural intent of this codebase" requires something closer to semantic indexing than keyword search. That distinction is where the real product differentiation lives for developer agent platforms.

**The cold-start problem for enterprise agent platforms** -- Enterprises won't give agents broad permissions on day one. How do you design a platform that's useful with narrow permissions and earns its way to broader access over time? This is a product design problem as much as a trust and safety problem.

**Measuring agent platform success** -- DAU/MAU don't map well to agent usage. What are the right leading indicators for a developer agent platform that's actually delivering value vs. just generating API calls?

---

Matt Young — VP Product, Domotz | [LinkedIn](https://www.linkedin.com/in/mattyoung/) | [GitHub](https://github.com/younginseattle)
