# NetOps Agent Swarm

A production-pattern multi-agent orchestration demo for network incident response, built with the Anthropic Claude API. Demonstrates core agentic infrastructure concepts: central orchestration, specialized agents, shared context store, tool schemas, and guardrailed handoffs.

---

## What this is

Most AI demos show a single model answering a question. This demo shows something harder: **multiple specialized agents coordinating autonomously to resolve a network incident**, with a central orchestrator managing state, routing, and shared context across the swarm.

This pattern maps directly to the infrastructure challenges in production agentic systems — the same problems solved by platforms like AWS Agent Core, LangGraph, and Domotz's MCP-based agentic runtime.

---

## Architecture

```
                        ┌─────────────────────┐
                        │     Orchestrator     │
                        │   (central router)   │
                        └──────────┬──────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                     ▼
     ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐
     │  Monitor Agent │  │Diagnostic Agent │  │  Response Agent  │
     │   (Agent 1)    │  │   (Agent 2)     │  │   (Agent 3)      │
     └────────────────┘  └─────────────────┘  └──────────────────┘
              │                    │                     │
     get_network_devices()  get_network_topology()  get_diagnosis()
     get_device_metrics()   get_device_config()     apply_remediation()
     flag_incident()        get_recent_events()     create_incident_report()
                            submit_diagnosis()
                                   │
                        ┌──────────▼──────────┐
                        │  Shared Context     │
                        │      Store          │
                        └─────────────────────┘
```

### Orchestrator (central router)
Manages the execution sequence. Reads agent outputs from the shared context store and decides which agent activates next. No agent calls another agent directly — all routing flows through the orchestrator. This is the production-correct pattern for multi-agent systems at scale.

### Agent 1 — Monitor
Responsible for detection and triage. Scans registered devices, pulls real-time metrics (latency, packet loss, CPU, memory, port status), and applies severity rules to flag incidents. Outputs a structured `flag_incident` payload to the orchestrator.

**Tools:**
- `get_network_devices()` — returns registered devices with current status
- `get_device_metrics(device_id)` — latency, packet loss, uptime, CPU, memory, port status
- `flag_incident(device_id, severity, reason)` — creates incident record, triggers handoff

**Severity logic:**
| Level | Condition |
|-------|-----------|
| P1-Critical | latency > 200ms OR packet loss > 10% OR CPU > 85% OR mem > 85% |
| P2-High | latency > 50ms OR packet loss > 2% OR CPU > 65% OR mem > 65% |
| P3-Low | all metrics within normal range |

### Agent 2 — Diagnostic
Receives incident context from the orchestrator. Investigates root cause by examining network topology, running config vs. last known good baseline, and the 24hr event log. Submits structured findings to the shared context store.

**Tools:**
- `get_network_topology(device_id)` — upstream/downstream dependencies
- `get_device_config(device_id)` — current config vs. baseline diff
- `get_recent_events(device_id)` — 24hr correlated event log
- `submit_diagnosis(findings, root_cause, confidence)` — writes to shared context

### Agent 3 — Response
Reads diagnostic output from shared context (guardrail: cannot act without it). Applies automated remediation appropriate to severity, then generates a structured incident report for the human operator.

**Tools:**
- `get_diagnosis()` — reads Diagnostic Agent output from shared context store
- `apply_remediation(device_id, action)` — restart, isolate, config rollback, or escalate
- `create_incident_report(summary, actions_taken, recommended_next_steps)` — final output

---

## Key infrastructure concepts demonstrated

**Central orchestrator pattern**
All routing decisions live in one place. Agents don't call each other — the orchestrator reads state and decides what runs next. This enables auditability, retries, and policy enforcement at the routing layer.

**Shared context store**
Agent outputs are written to a shared store and read by downstream agents. The Response agent is guardrailed — it cannot invoke remediation without a valid diagnosis in context. This is the same pattern used in production multi-agent pipelines to prevent unsafe action chains.

**Typed tool schemas**
Each agent exposes a defined set of tools with explicit input schemas. This makes agent capabilities composable, testable, and independently deployable — a prerequisite for any production agent SDK.

**Severity-gated routing**
The orchestrator applies business rules at the routing layer. A P3-Low incident follows a different path than a P1-Critical — different agents may activate, different auto-remediation actions apply. This is where guardrails and policy enforcement live in a real agentic runtime.

**Graceful degradation**
Each agent call includes structured fallback logic. If the LLM returns malformed output, the system applies deterministic rules based on raw metrics rather than failing the workflow. Production agentic systems require this.

---

## Real-world grounding

This demo is built on patterns from production agentic infrastructure work at [Domotz](https://www.domotz.com), a network monitoring and AIOps SaaS platform (PE/Bessemer-backed). The MCP-based agentic runtime designed for Domotz solves the same core problems this demo illustrates:

- Tool schema design for network ops agents
- Orchestration of multi-step diagnostic workflows
- Shared memory and context passing between agent stages
- Guardrails preventing remediation without confirmed diagnosis
- Human-in-the-loop escalation for P1 incidents

The patterns here map directly to what AWS Agent Core, LangGraph, CrewAI, and similar platforms provide as managed infrastructure.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Agent runtime | Anthropic Claude API (`claude-sonnet-4-6`) |
| Orchestration | Custom central router (JavaScript) |
| UI | React |
| Tool execution | Simulated (swappable for real Domotz API) |
| Context store | In-memory shared state (swappable for Redis/DynamoDB) |

---

## Running locally

```bash
# Clone the repo
git clone https://github.com/your-handle/netops-agent-swarm
cd netops-agent-swarm

# Install dependencies
npm install

# Set your Anthropic API key
export ANTHROPIC_API_KEY=your_key_here

# Start the dev server
npm run dev
```

The demo runs entirely in the browser. No backend required. Swap the simulated tool responses in `tools/` for real API calls to connect to a live network environment.

---

## Extending this

| Extension | Description |
|-----------|-------------|
| Real device data | Replace simulated tools with Domotz REST API calls |
| Persistent context | Swap in-memory store for Redis or DynamoDB |
| Agent eval harness | Add a test suite that runs agents against known incident scenarios and scores output quality |
| Additional agents | Add a Capacity Planning agent or a Change Management agent to the swarm |
| Streaming | Stream agent reasoning tokens to the UI in real time |
| Auth & guardrails | Add per-agent permission scopes and action whitelists at the orchestrator layer |

---

## About

Built as a portfolio demonstration of agentic infrastructure thinking for senior product and engineering roles focused on AI platform development.

The architecture reflects patterns applicable to any production multi-agent system: advertising campaign optimization agents, customer service automation, code review pipelines, or infrastructure ops.
