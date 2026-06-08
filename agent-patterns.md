# Agent Patterns

The patterns that separate production agent systems from demos. Most of what gets written about agents focuses on capability -- what agents can do. This is about architecture -- how to build agent systems that are reliable, observable, and safe to operate.

These are the patterns I think about when evaluating agent platforms and designing agent-based products.

---

## 1. Orchestrator-mediated routing

**The pattern:** All inter-agent coordination flows through a central orchestrator. Agents do not call each other directly.

**Why it matters:** Direct agent-to-agent calls create systems that are brittle and unobservable. When Agent A calls Agent B calls Agent C, a failure in Agent C is hard to trace, retry logic is scattered, and there's no single place to enforce policy.

The orchestrator pattern solves all three. The orchestrator reads shared state and decides what runs next. This makes the system:

- **Auditable** -- every routing decision is logged in one place
- **Retryable** -- the orchestrator owns retry logic, not individual agents
- **Policy-enforceable** -- guardrails, escalation thresholds, and permission checks live at the routing layer

**The tradeoff:** The orchestrator is a single point of failure. At scale, you need orchestrator redundancy. At prototype scale, the observability benefits outweigh the risk.

**See it in practice:** [Netops-Swarm](https://github.com/younginseattle/Netops-Swarm) uses this pattern. The orchestrator routes between Monitor, Diagnostic, and Response agents based on severity and shared context state.

---

## 2. Shared context store

**The pattern:** Agent outputs are written to a shared context store. Downstream agents read from that store rather than receiving direct inputs from upstream agents.

**Why it matters:** Agents that pass state directly to each other are tightly coupled. A shared context store decouples them -- each agent only needs to know how to read and write context, not which agent came before it.

More importantly, shared context enables guardrails. You can enforce "no remediation without a valid diagnosis" at the context store level -- the Response agent checks for a diagnosis before it's allowed to act. That check can't be bypassed by an upstream agent passing the wrong state.

**The tradeoff:** Context stores introduce latency and state management complexity. For multi-session workflows, you need persistence (Redis, DynamoDB) rather than in-memory state. Design the interface for swap-out from day one.

**The context window problem:** Shared context stores also address a subtler issue -- agents in long-running workflows can exhaust their context window if they carry full conversation history. Writing structured outputs to a store and retrieving only what's needed keeps context lean.

---

## 3. Agent memory architecture

Agents without persistent memory restart from zero on every invocation. But "does the agent have memory" is the wrong question. The right questions are:

- What retrieval architecture backs the memory?
- What's the latency at p99?
- How do you prevent context poisoning?

**The three memory types:**

**Episodic memory** -- what happened. Specific past events, conversation history, prior actions taken. Useful for continuity across sessions, harmful if stale or incorrect entries contaminate current reasoning.

**Semantic memory** -- what things mean. Embeddings, knowledge graphs, indexed documentation. This is where RAG lives. The quality of retrieval -- precision, recall, and relevance ranking -- directly determines agent answer quality.

**Procedural memory** -- how to do things. Stored workflows, validated action sequences, learned tool usage patterns. The least developed of the three in current platforms, but where the most differentiation will emerge.

**The poisoning risk:** Incorrect entries in memory that the agent retrieves confidently are worse than no memory at all. Production memory systems need staleness detection, confidence scoring, and human-in-the-loop correction pathways.

---

## 4. Tool invocation reliability

An agent is only as reliable as its worst tool call.

Most agent platform discussions focus on model quality. The failure mode in production is almost always tool failure -- a tool that returns an ambiguous error, a tool that times out without a useful fallback, a tool that silently returns stale data.

**The reliability stack for production tool calls:**

**Circuit breakers** -- if a tool fails repeatedly in a window, stop calling it and route to a fallback. Don't let one broken tool cascade into a broken workflow.

**Retry logic with backoff** -- transient failures are common in distributed systems. Retry with exponential backoff before treating a failure as terminal.

**Graceful degradation** -- when a tool fails, the agent should fall back to a deterministic rule rather than hallucinating an answer. "I couldn't retrieve device metrics -- here's what I can infer from last known state" is better than a confident wrong answer.

**Observability at the tool level** -- you need to know which tool calls are slow, which are failing, and what the error distribution looks like. Model-level observability isn't sufficient. This is a gap in most current agent observability tooling.

**The infrastructure parallel:** This is exactly the reliability engineering that any distributed systems team applies to microservice calls. Agent platforms are distributed systems with LLMs in the loop. The same patterns apply.

---

## 5. Guardrailed action chains

**The pattern:** High-consequence actions require validated preconditions before they can execute. The validation is enforced at the tool schema level, not in the prompt.

**Why it matters:** LLMs are non-deterministic. A prompt that says "don't take remediation actions without a confirmed diagnosis" can be violated by an unexpected model output. A tool schema that requires a `diagnosis_id` parameter -- and returns an error if no valid diagnosis exists in context -- cannot be bypassed.

**The design principle:** Move guardrails as close to the action as possible. Prompt-level guardrails are soft. Schema-level guardrails are hard. Infrastructure-level guardrails (permission checks, rate limits, audit logging) are hardest and most important for irreversible actions.

**Severity-gated routing** is a related pattern: not all incidents need the same response. A P1-Critical follows a different path than a P3-Low. Business policy -- escalation thresholds, auto-remediation limits, human handoff rules -- belongs at the routing layer, not buried in individual agent prompts.

---

## 6. Deterministic fallbacks

**The pattern:** Every agent workflow has a deterministic fallback path that activates when LLM output is malformed, low-confidence, or unavailable.

**Why it matters:** Production systems cannot hard-fail on unexpected LLM responses. The fallback doesn't need to be as capable as the full agent workflow -- it needs to be safe and predictable.

**What this looks like in practice:**

- Monitor Agent LLM fails to parse device metrics → fall back to threshold-based severity rules on raw metric values
- Diagnostic Agent returns low-confidence output → escalate to human rather than proceeding to remediation
- Orchestrator receives malformed agent output → log the error, apply the default routing rule, alert

**The mental model:** Design the fallback first. If you can't describe what the system does when the LLM fails, you don't have a production system -- you have a demo.

---

## Pattern summary

| Pattern | What it solves | Key tradeoff |
|---------|---------------|--------------|
| Orchestrator routing | Observability, retries, policy enforcement | Single point of failure |
| Shared context store | Decoupling, guardrails, context management | Latency, state complexity |
| Memory architecture | Continuity, relevance | Poisoning risk, retrieval cost |
| Tool reliability | Production resilience | Engineering overhead |
| Guardrailed actions | Safety for high-consequence actions | Latency, reduced autonomy |
| Deterministic fallbacks | Production stability | Requires pre-designed fallback paths |
