# NetOps Agent Swarm

An autonomous network operations system powered by coordinated AI agents.

This project demonstrates how real-world network incidents can be detected, diagnosed, and remediated without human intervention, using a swarm of specialized agents coordinated by a central orchestrator.

Instead of static alerts and manual runbooks, this system executes end-to-end incident response workflows automatically.

> Think: SRE incident response, executed by software.

**[Live demo](https://netops-swarm.vercel.app)** -- runs entirely in the browser, no backend required.

---

## Project docs

| Document | What it covers |
|----------|---------------|
| [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) | Problem statement, design decisions, tradeoffs, and what was cut |
| [CHANGELOG.md](./CHANGELOG.md) | Version history and v2 roadmap |

---

## Live incident walkthrough

**Scenario:** Core switch experiencing high packet loss

```
[Monitor Agent]
→ detects packet loss >10%
→ flags P1 incident

[Orchestrator]
→ routes to Diagnostic Agent

[Diagnostic Agent]
→ analyzes topology + recent config changes
→ identifies root cause: interface saturation after config push
→ submits diagnosis (confidence: 92%)

[Orchestrator]
→ validates diagnosis present
→ routes to Response Agent

[Response Agent]
→ applies remediation: rollback config
→ verifies recovery
→ generates incident report
```

**Outcome:** Incident resolved automatically in seconds, without human intervention.

---

## Architecture

```
                   +---------------------+
                   |     Orchestrator     |
                   |   (central router)   |
                   +----------+----------+
                              |
         +--------------------+--------------------+
         v                    v                     v
+----------------+  +-----------------+  +------------------+
|  Monitor Agent |  |Diagnostic Agent |  |  Response Agent  |
|   (Agent 1)    |  |   (Agent 2)     |  |   (Agent 3)      |
+----------------+  +-----------------+  +------------------+
         |                    |                     |
get_network_devices()  get_network_topology()  get_diagnosis()
get_device_metrics()   get_device_config()     apply_remediation()
flag_incident()        get_recent_events()     create_incident_report()
                       submit_diagnosis()
                              |
                   +----------v----------+
                   |   Shared Context    |
                   |       Store         |
                   +---------------------+
```

### Orchestrator

Manages the execution sequence. Reads agent outputs from the shared context store and decides which agent activates next. No agent calls another agent directly -- all routing flows through the orchestrator. This is the production-correct pattern for multi-agent systems at scale.

### Agent 1 -- Monitor

Responsible for detection and triage. Scans registered devices, pulls real-time metrics (latency, packet loss, CPU, memory, port status), and applies severity rules to flag incidents.

**Severity logic:**

| Level | Condition |
|-------|-----------|
| P1-Critical | latency > 200ms OR packet loss > 10% OR CPU > 85% OR mem > 85% |
| P2-High | latency > 50ms OR packet loss > 2% OR CPU > 65% OR mem > 65% |
| P3-Low | all metrics within normal range |

### Agent 2 -- Diagnostic

Receives incident context from the orchestrator. Investigates root cause by examining network topology, running config vs. last known good baseline, and the 24hr event log.

### Agent 3 -- Response

Reads diagnostic output from shared context. Guardrailed -- cannot act without a valid diagnosis in context. Applies automated remediation and generates a structured incident report.

---

## Design principles

**1. Orchestration over agent-to-agent calls**
Direct agent chaining creates brittle, unobservable systems. All coordination flows through a central control plane.

**2. Shared state is mandatory**
Stateless agents cannot support multi-step reasoning workflows. Context persistence enables auditability and guardrails.

**3. Actions must be gated by validated reasoning**
No remediation without diagnosis. This prevents unsafe automation.

**4. Deterministic fallbacks are required**
LLMs are non-deterministic. Production systems cannot be. Each agent falls back to rule-based logic when LLM output is malformed or low-confidence.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Agent runtime | Anthropic Claude API (claude-sonnet-4-6) |
| Orchestration | Custom central router (JavaScript) |
| UI | React |
| Tool execution | Simulated (swappable for real observability APIs) |
| Context store | In-memory shared state (swappable for Redis/DynamoDB) |

---

## Running locally

```bash
# Clone the repo
git clone https://github.com/younginseattle/Netops-Swarm
cd Netops-Swarm

# Install dependencies
npm install

# Set your Anthropic API key
export ANTHROPIC_API_KEY=your_key_here

# Start the dev server
npm run dev
```

The demo runs entirely in the browser. Swap the simulated tool responses in `src/tools/` for real API calls to connect to a live network environment.

---

## Extending this

| Extension | Description |
|-----------|-------------|
| Real device data | Replace simulated tools with Domotz/SNMP/REST API calls |
| Persistent context | Swap in-memory store for Redis or DynamoDB |
| Agent eval harness | Test suite that runs agents against known incident scenarios and scores output quality |
| Additional agents | Capacity Planning agent or Change Management agent |
| Streaming | Stream agent reasoning tokens to the UI in real time |
| Auth and guardrails | Per-agent permission scopes and action whitelists at the orchestrator layer |

---

## Related

**[agentic-platform-notes](https://github.com/younginseattle/agentic-platform-notes)** -- The broader platform thinking behind this project: MCP architecture, agent patterns, and platform strategy.

**[domotz-mcp-server](https://github.com/younginseattle/domotz-mcp-server)** -- Production MCP server connecting Claude to the Domotz network monitoring platform. 130+ API endpoints, compatible with Claude and ChatGPT.

---

Matt Young -- VP Product, Domotz | [LinkedIn](https://www.linkedin.com/in/mattyoung/) | [GitHub](https://github.com/younginseattle)
