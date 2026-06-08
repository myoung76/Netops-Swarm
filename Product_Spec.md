# Product Spec: NetOps Agent Swarm

**Author:** Matt Young  
**Status:** v1.0 -- prototype  
**Last updated:** June 2026

---

## Problem Statement

Network operations teams are drowning in alert noise. The median enterprise NOC handles hundreds of alerts per day. Most are duplicates, most resolve themselves, and the ones that don't require the same three diagnostic steps every time: check metrics, compare against last known good config, decide whether to escalate or remediate.

That loop is not judgment. It is labor. And it is where most NOC hours go.

The existing solutions don't solve it cleanly. Static alert routing (PagerDuty, OpsGenie) tells you something is wrong but doesn't investigate. AIOps platforms (Moogsoft, BigPanda) compress alerts but still require a human to act. Runbook automation (Ansible, Puppet) executes playbooks but requires a human to trigger them.

The gap: nothing closes the full loop from detection to diagnosis to remediation without a human in the middle. That's what this system explores.

---

## Target User

**Primary:** Network engineers and SREs at mid-market companies (50-500 employees) who own network reliability but don't have a dedicated NOC. They are on-call, context-switching constantly, and losing hours per week to incidents that follow predictable patterns.

**Secondary:** Platform engineering leads evaluating autonomous agent patterns for infrastructure use cases -- specifically, whether multi-agent orchestration is safe to deploy against production systems.

---

## Goals

1. Demonstrate that autonomous incident response -- detect, diagnose, remediate -- is architecturally achievable with current LLM capabilities.

2. Show the production-correct orchestration pattern: centralized routing, shared state, guardrailed action chains. Most multi-agent demos get this wrong.

3. Serve as a reference implementation for teams building agentic workflows on top of observability APIs.

---

## Non-Goals

This spec covers v1. The following are explicitly out of scope:

- **Real device connectivity.** Tools are simulated. The architecture is designed for swap-out, but wiring to live APIs is v2 work.

- **Multi-tenant or enterprise auth.** No per-org credential management, no RBAC, no audit logging beyond incident reports.

- **Capacity planning or change management workflows.** The swarm handles reactive incidents only. Proactive planning agents are listed as future extensions but are not part of this spec.

- **SLA or compliance reporting.** Incident reports are structured but not formatted for ticketing systems or compliance workflows.

---

## Key Design Decisions

### 1. Orchestrator-mediated routing over agent-to-agent calls

Early exploration involved letting agents call each other directly. It was brittle and unobservable -- debugging a failed workflow meant tracing calls across three independent agent contexts with no shared state.

The central orchestrator pattern solves this. All routing decisions live in one place. The orchestrator reads shared context and decides what runs next. This makes the system auditable, retryable, and policy-enforceable at the routing layer. It is also the pattern used in production agentic runtimes (LangGraph, AWS Agent Core).

Tradeoff: the orchestrator is a single point of failure and a potential bottleneck. Acceptable at this scale; addressed in v2 via orchestrator redundancy.

### 2. Guardrailed action chain: no remediation without diagnosis

The Response Agent cannot invoke `apply_remediation()` without a valid diagnosis in the shared context store. This is enforced at the tool schema level, not just in the prompt.

This was the most important safety decision in the design. LLMs are non-deterministic. Without hard guardrails at the tool layer, an agent can hallucinate a diagnosis and proceed to apply a remediation that wasn't warranted. The guardrail makes that structurally impossible.

Tradeoff: adds latency. A P1-Critical incident cannot skip the diagnostic step even if the Monitor Agent's confidence is high. Acceptable -- correctness over speed for remediation actions.

### 3. Severity-gated routing over uniform treatment

Not all incidents follow the same path. A P3-Low with normal metrics routes differently than a P1-Critical with CPU saturation and packet loss. The orchestrator applies severity rules at the routing layer, which means escalation logic, remediation options, and human handoff thresholds all live in one auditable place.

This is where business policy belongs -- not buried in individual agent prompts.

### 4. Deterministic fallbacks for LLM non-determinism

Each agent includes structured fallback logic. If the LLM returns malformed or low-confidence output, the system applies deterministic rules based on raw metrics. The workflow does not fail -- it degrades gracefully.

This was a non-negotiable for any production-adjacent system. You cannot build autonomous infrastructure tooling that hard-fails on an unexpected LLM response.

---

## What Was Cut

**Streaming agent reasoning to the UI.** Listed as an extension. Removed from v1 because it required backend infrastructure (WebSockets or SSE) that added scope without proving the core architecture. The live walkthrough demo is sufficient.

**Persistent context store.** In-memory for v1. Redis or DynamoDB is the natural swap -- the interface is already abstracted. Cut because operational infra adds complexity without changing the architectural point being made.

**A fourth agent for Change Management.** Drafted as a concept. Removed from v1 because it required a credible model of what "approved changes" looks like, which is org-specific. Left as a documented extension.

---

## Success Metrics

For this prototype, success is not production uptime -- it's whether the system makes the architectural argument clearly:

- A first-time visitor understands the orchestrator pattern within 5 minutes of reading the README
- The live demo runs a full incident cycle without human intervention
- The design principles are specific enough to inform a real implementation decision (not just inspirational)

If this were a production product, the metrics would be:

- Mean time to resolution for P1 incidents (target: under 60 seconds)
- False positive remediation rate (target: under 1%)
- NOC hours reclaimed per week per team

---

## What's Next

v2 priorities, in order:

1. Live API integration -- swap simulated tools for real Domotz/SNMP/REST calls
2. Agent eval harness -- run agents against known incident scenarios, score output quality
3. Persistent context store -- Redis-backed shared state for multi-session workflows
4. Per-agent permission scopes -- action whitelists at the orchestrator layer

---

## Why This Matters

Autonomous infrastructure is not a future problem. NOC teams are already overwhelmed. The question is not whether autonomous incident response will exist -- it is whether the systems that enable it are built with correct orchestration patterns and appropriate guardrails.

This project is an argument that they can be.
