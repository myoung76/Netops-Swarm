# Changelog

All notable changes to this project will be documented here.

---

## [1.0.0] -- June 2026

### Added

- Central orchestrator with severity-gated routing (P1/P2/P3)
- Monitor Agent: device scanning, real-time metrics, incident flagging
- Diagnostic Agent: topology analysis, config diff, 24hr event correlation
- Response Agent: guardrailed remediation (requires valid diagnosis in shared context)
- Shared context store with typed tool schemas across all agents
- Deterministic fallback logic for LLM non-determinism
- Live incident walkthrough: core switch packet loss scenario (end-to-end in browser)
- React UI with real-time agent status and incident report output
- Product spec documenting design decisions, tradeoffs, and what was cut

### Architecture decisions

- Orchestrator-mediated routing chosen over agent-to-agent calls for auditability and policy enforcement
- In-memory context store (swappable for Redis/DynamoDB in v2)
- Simulated tool responses (swappable for live API calls in v2)

---

## [Unreleased] -- v2 Planned

### Planned

- Live API integration -- swap simulated tools for real Domotz/SNMP/REST calls
- Agent eval harness -- run agents against known incident scenarios, score output quality
- Persistent context store -- Redis-backed shared state for multi-session workflows
- Per-agent permission scopes -- action whitelists enforced at the orchestrator layer
- Streaming agent reasoning tokens to the UI
- Change Management agent for pre-incident config audit workflows

---

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
