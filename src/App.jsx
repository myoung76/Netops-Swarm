import { useState, useRef, useEffect } from "react";

const DEVICES = [
  {
    id: "gw-core-01", name: "Core Gateway", type: "Router", status: "critical",
    metrics: { latency: 312, packetLoss: 18, uptime: 99.1, cpu: 94, mem: 87 },
    ports: [{ name: "eth0", status: "up" }, { name: "eth1", status: "up" }, { name: "eth2", status: "down" }, { name: "eth3", status: "down" }],
    sim: {
      severity: "P1-Critical",
      reason: "Latency 312ms and packet loss 18% exceed P1 thresholds; CPU at 94% indicates resource exhaustion.",
      monReasoning: "Latency threshold is >200ms for P1 — device is at 312ms, clear breach. Packet loss at 18% far exceeds the 10% ceiling. CPU at 94% confirms the device is overwhelmed. All three indicators independently qualify as P1-Critical.",
      findings: "Core Gateway is experiencing severe latency (312ms), extreme packet loss (18%), and CPU saturation (94%), with two downstream ports (eth2, eth3) down.",
      rootCause: "CPU exhaustion caused by a routing table overflow event, likely triggered by a BGP route flap in the upstream provider, resulting in cascading port failures.",
      confidence: "high",
      diagReasoning: "The combination of CPU saturation and simultaneous port failures points to a control-plane event, not a data-plane issue. BGP route flap is consistent with the 24hr event log showing upstream adjacency resets. Config baseline shows no local changes, ruling out misconfiguration.",
      autoAct: "Config rollback initiated. Traffic rerouted to secondary path via sw-dist-02. On-call network engineer paged via PagerDuty. BGP session with upstream AS64512 temporarily suspended.",
      summary: "A P1-Critical incident on Core Gateway was triggered by BGP route flap causing CPU exhaustion and cascading port failures. Automated remediation rerouted traffic and suspended the flapping BGP session.",
      nextSteps: "1) Confirm traffic recovery on secondary path within 5 min. 2) Coordinate with upstream provider AS64512 to stabilize BGP session. 3) Review BGP route-dampening policy before restoring primary path.",
      respReasoning: "This is a control-plane failure with a clear upstream cause. The report should prioritize the BGP root cause and give the NOC concrete coordination steps with the upstream provider."
    }
  },
  {
    id: "sw-dist-02", name: "Distribution Switch", type: "Switch", status: "warning",
    metrics: { latency: 48, packetLoss: 3, uptime: 99.8, cpu: 71, mem: 62 },
    ports: [{ name: "gi0/1", status: "up" }, { name: "gi0/2", status: "up" }, { name: "gi0/3", status: "down" }, { name: "gi0/4", status: "up" }],
    sim: {
      severity: "P2-High",
      reason: "Packet loss at 3% and CPU at 71% exceed P2 thresholds; one downstream port (gi0/3) is down.",
      monReasoning: "Latency at 48ms is just under the P1 boundary of 50ms but still triggers P2. Packet loss at 3% exceeds the P2 floor of 2%. CPU at 71% is elevated but below P1. No single metric triggers P1, so this is correctly classified P2-High.",
      findings: "Distribution Switch shows elevated packet loss (3%), borderline latency (48ms), and a downed port gi0/3, suggesting partial connectivity degradation likely inherited from upstream Core Gateway instability.",
      rootCause: "Upstream BGP instability from Core Gateway is causing packet drops and elevated CPU on the distribution layer as the switch recomputes spanning tree and ARP tables.",
      confidence: "medium",
      diagReasoning: "The timing of this switch's degradation correlates with the Core Gateway incident. Port gi0/3 going down is consistent with a upstream link failure triggering STP reconvergence. CPU elevation is within expected range for an STP recalculation event.",
      autoAct: "Alert escalated to NOC. Polling interval reduced to 30s. JIRA ticket SW-4471 auto-created. Port gi0/3 isolated pending upstream recovery.",
      summary: "Distribution Switch is experiencing P2-High degradation symptomatic of upstream Core Gateway instability, with packet loss, borderline latency, and one downed port indicating partial STP reconvergence.",
      nextSteps: "1) Monitor sw-dist-02 metrics for improvement after Core Gateway remediation. 2) If gi0/3 does not recover within 15 min, escalate to P1 and check SFP hardware. 3) Verify downstream Floor 3 AP connectivity is unaffected.",
      respReasoning: "This is a downstream symptom of the Core Gateway incident. The report should link the two incidents and set a clear escalation trigger if the port doesn't recover after upstream remediation."
    }
  },
  {
    id: "ap-floor3-07", name: "Floor 3 AP", type: "Access Point", status: "ok",
    metrics: { latency: 12, packetLoss: 0.2, uptime: 100, cpu: 23, mem: 41 },
    ports: [{ name: "eth0", status: "up" }, { name: "wlan0", status: "up" }],
    sim: {
      severity: "P3-Low",
      reason: "All metrics within normal operating range; no port anomalies detected.",
      monReasoning: "Latency at 12ms is well below any threshold. Packet loss at 0.2% is negligible. CPU at 23% and memory at 41% are healthy. Both ports are up. No evidence of any performance issue.",
      findings: "Floor 3 AP is operating within all normal parameters with healthy latency, minimal packet loss, full uptime, and both ports active.",
      rootCause: "No fault condition detected. Device is operating nominally.",
      confidence: "high",
      diagReasoning: "All four metric categories are well within baseline. The 24hr event log shows no anomalies. Running config matches last-known-good baseline exactly. This is a clean bill of health.",
      autoAct: "Incident logged for audit trail. Standard 5-minute monitoring cycle continues. No remediation required.",
      summary: "Floor 3 AP shows no signs of degradation. All metrics are nominal and both interfaces are healthy. This is a routine P3-Low check with no action required.",
      nextSteps: "1) No immediate action required. 2) Continue standard 5-min monitoring. 3) If upstream issues persist, recheck AP connectivity as a downstream validation step.",
      respReasoning: "Nothing to escalate. The report should confirm the clean status and close the loop for audit purposes."
    }
  },
  {
    id: "fw-edge-01", name: "Edge Firewall", type: "Firewall", status: "warning",
    metrics: { latency: 88, packetLoss: 5, uptime: 98.4, cpu: 78, mem: 69 },
    ports: [{ name: "wan0", status: "up" }, { name: "lan0", status: "up" }, { name: "dmz0", status: "down" }],
    sim: {
      severity: "P1-Critical",
      reason: "Packet loss at 5%, latency 88ms, DMZ port down, and uptime below 99% indicate active instability.",
      monReasoning: "Packet loss at 5% is above the P2 floor of 2% and trending toward P1. Latency at 88ms exceeds the P2 threshold. CPU at 78% and memory at 69% are both elevated. The downed DMZ port and uptime degradation to 98.4% push the overall risk to P1.",
      findings: "Edge Firewall shows elevated latency (88ms), significant packet loss (5%), high CPU (78%) and memory (69%), with the DMZ interface down and uptime degraded to 98.4% — indicating active connection state table pressure.",
      rootCause: "Firewall connection state table near capacity due to a suspected SYN flood attack on the WAN interface, causing DMZ segment isolation and increasing CPU/memory pressure.",
      confidence: "high",
      diagReasoning: "The combination of packet loss, latency, and DMZ port failure is consistent with stateful inspection overload. The 24hr event log shows a spike in inbound SYN packets from multiple source IPs 2 hours ago. Memory at 69% is consistent with connection table growth. This is a DDoS signature.",
      autoAct: "Config rollback initiated. Rate-limiting ACL applied to WAN interface. DMZ traffic rerouted through secondary firewall fw-edge-02. On-call security engineer paged. Upstream blackhole route requested from ISP.",
      summary: "Edge Firewall is under an active suspected SYN flood attack causing connection state table exhaustion, DMZ isolation, and performance degradation. Automated mitigations have been applied and the security team has been engaged.",
      nextSteps: "1) Confirm ISP blackhole route is active within 10 min. 2) Review WAF logs and block top offending source ranges. 3) Verify DMZ services are reachable via fw-edge-02 secondary path.",
      respReasoning: "This is a security incident as well as a network incident. The report must flag both the NOC and the security team, and next steps should prioritize ISP-level mitigation before internal remediation."
    }
  }
];

const AC = {
  orchestrator: { accent: "#94A3B8", dim: "rgba(148,163,184,0.12)", label: "Orchestrator" },
  monitor:      { accent: "#38BDF8", dim: "rgba(56,189,248,0.1)",   label: "Monitor" },
  diagnostic:   { accent: "#A78BFA", dim: "rgba(167,139,250,0.1)",  label: "Diagnostic" },
  response:     { accent: "#34D399", dim: "rgba(52,211,153,0.1)",   label: "Response" },
};
const SEV_COLOR = { "P1-Critical": "#F87171", "P2-High": "#FBBF24", "P3-Low": "#34D399" };
const STATUS_COLOR = { critical: "#F87171", warning: "#FBBF24", ok: "#34D399" };
const STATUS_BG = { critical: "rgba(248,113,113,0.1)", warning: "rgba(251,191,36,0.1)", ok: "rgba(52,211,153,0.1)" };

const sleep = ms => new Promise(r => setTimeout(r, ms));

function mColor(key, val) {
  if (key === "latency")    return val > 200 ? "#F87171" : val > 50  ? "#FBBF24" : "#34D399";
  if (key === "packetLoss") return val > 10  ? "#F87171" : val > 2   ? "#FBBF24" : "#34D399";
  if (key === "cpu" || key === "mem") return val > 85 ? "#F87171" : val > 65 ? "#FBBF24" : "#34D399";
  return "#475569";
}

function Badge({ agent }) {
  const m = AC[agent?.toLowerCase()] || AC.orchestrator;
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 3, background: m.dim, color: m.accent, border: `1px solid ${m.accent}33`, fontFamily: "'JetBrains Mono',monospace" }}>
      {m.label}
    </span>
  );
}

function Bar({ val, max, color }) {
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
      <div style={{ height: "100%", width: `${Math.min(100, (val / max) * 100)}%`, background: color, borderRadius: 2, transition: "width 0.5s ease" }} />
    </div>
  );
}

function Spinner() {
  return <span style={{ width: 10, height: 10, border: "1.5px solid rgba(56,189,248,0.2)", borderTopColor: "#38BDF8", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />;
}

function TypedText({ text, color = "#475569", onDone }) {
  const [shown, setShown] = useState("");
  const i = useRef(0);
  useEffect(() => {
    i.current = 0; setShown("");
    const iv = setInterval(() => {
      if (i.current >= text.length) { clearInterval(iv); onDone && onDone(); return; }
      setShown(text.slice(0, ++i.current));
    }, 14);
    return () => clearInterval(iv);
  }, [text]);
  return (
    <div style={{ fontSize: 11, color, lineHeight: 1.75, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {shown}
      {shown.length < text.length && <span style={{ display: "inline-block", width: 2, height: 11, background: color, marginLeft: 1, animation: "blink 0.8s step-end infinite", verticalAlign: "text-bottom" }} />}
    </div>
  );
}

export default function App() {
  const [selected, setSelected] = useState(null);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [activeStep, setActiveStep] = useState(-1);
  const [complete, setComplete] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [typingEntry, setTypingEntry] = useState(null);
  const startRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs, typingEntry]);

  const t = () => ((Date.now() - startRef.current) / 1000).toFixed(1) + "s";

  function addLog(agent, tool, html, reasoning = "") {
    setLogs(prev => [...prev, { agent: agent.toLowerCase(), tool, html, reasoning, time: t() }]);
  }

  function typeReasoning(text) {
    return new Promise(resolve => { setTypingEntry({ text, resolve }); });
  }

  function onTypingDone() {
    if (typingEntry) { typingEntry.resolve(); setTypingEntry(null); }
  }

  async function run() {
    if (running || !selected) return;
    setRunning(true); setLogs([]); setActiveStep(0); setComplete(false); setStatusMsg(""); setTypingEntry(null);
    startRef.current = Date.now();
    const d = selected;
    const s = d.sim;

    setActiveStep(0); setStatusMsg("Orchestrator initializing…");
    addLog("orchestrator", null, `Incident detected on <strong>${d.name}</strong>. Initializing swarm. Routing to Monitor agent.`);
    await sleep(600);

    setActiveStep(1); setStatusMsg("Monitor scanning devices…");
    addLog("monitor", "get_network_devices()", `Scanning registered topology — ${DEVICES.length} devices found.`);
    await sleep(700);
    addLog("monitor", `get_device_metrics("${d.id}")`,
      `Latency <span style="color:${mColor("latency", d.metrics.latency)};font-weight:600">${d.metrics.latency}ms</span> · ` +
      `Loss <span style="color:${mColor("packetLoss", d.metrics.packetLoss)};font-weight:600">${d.metrics.packetLoss}%</span> · ` +
      `CPU <span style="color:${mColor("cpu", d.metrics.cpu)};font-weight:600">${d.metrics.cpu}%</span> · ` +
      `Mem <span style="color:${mColor("mem", d.metrics.mem)};font-weight:600">${d.metrics.mem}%</span>`);
    await sleep(500);

    setStatusMsg("Monitor agent reasoning…");
    await typeReasoning(s.monReasoning);
    await sleep(300);

    const sc = SEV_COLOR[s.severity] || "#94A3B8";
    addLog("monitor", "flag_incident()", `<span style="color:${sc};font-weight:700">${s.severity}</span> — ${s.reason}`, s.monReasoning);
    await sleep(400);

    setActiveStep(0); setStatusMsg("Writing to shared context store…");
    addLog("orchestrator", null, `<strong>${s.severity}</strong> written to shared context store. Guardrail: diagnosis required before remediation. Routing to Diagnostic agent.`);
    await sleep(600);

    setActiveStep(2); setStatusMsg("Diagnostic agent mapping topology…");
    addLog("diagnostic", `get_network_topology("${d.id}")`, "Mapping upstream/downstream dependencies and blast radius.");
    await sleep(800);
    addLog("diagnostic", `get_device_config("${d.id}")`, "Comparing running config against last-known-good baseline.");
    await sleep(700);
    addLog("diagnostic", `get_recent_events("${d.id}")`, "Pulling 24hr correlated event log.");
    await sleep(600);

    setStatusMsg("Diagnostic agent reasoning…");
    await typeReasoning(s.diagReasoning);
    await sleep(300);

    addLog("diagnostic", "submit_diagnosis()",
      `<strong>Findings:</strong> ${s.findings}<br/><strong>Root cause:</strong> ${s.rootCause}<br/><strong>Confidence:</strong> ${s.confidence}`,
      s.diagReasoning);
    await sleep(400);

    setActiveStep(0); setStatusMsg("Guardrail check passing…");
    addLog("orchestrator", null, `Diagnosis confirmed (${s.confidence} confidence). Context store updated. Guardrail satisfied. Routing to Response agent.`);
    await sleep(600);

    setActiveStep(3); setStatusMsg("Response agent reading context store…");
    addLog("response", "get_diagnosis()", "Retrieved diagnostic output from shared context store. Guardrail check: PASSED.");
    await sleep(500);
    addLog("response", `apply_remediation("${d.id}")`, s.autoAct);
    await sleep(600);

    setStatusMsg("Response agent writing report…");
    await typeReasoning(s.respReasoning);
    await sleep(300);

    addLog("response", "create_incident_report()",
      `<strong>Summary:</strong> ${s.summary}<br/><strong>Actions taken:</strong> ${s.autoAct}<br/><strong>Next steps:</strong> ${s.nextSteps}`,
      s.respReasoning);
    await sleep(400);

    setActiveStep(-1); setComplete(true); setStatusMsg("");
    addLog("orchestrator", null, `<span style="color:#34D399;font-weight:700">✓ Workflow complete</span> in ${t()}. Report filed. All agents returned to standby.`);
    setRunning(false);
  }

  const pipeline = [
    { step: 0, key: "orchestrator", label: "Orchestrator" },
    { step: 1, key: "monitor",      label: "Monitor" },
    { step: 2, key: "diagnostic",   label: "Diagnostic" },
    { step: 3, key: "response",     label: "Response" },
  ];

  return (
    <div style={{ background: "#070C13", minHeight: "100vh", color: "#94A3B8", fontFamily: "'IBM Plex Sans',system-ui,sans-serif", padding: "16px", maxWidth: 680, margin: "0 auto" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;700&display=swap');
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        button { font-family: inherit; cursor: pointer; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", flexShrink: 0, background: running ? "#38BDF8" : complete ? "#34D399" : "#334155", boxShadow: running ? "0 0 10px #38BDF8" : complete ? "0 0 8px #34D399" : "none", animation: running ? "pulse 1.6s ease infinite" : "none", transition: "all 0.4s" }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: "#F1F5F9", letterSpacing: "-0.02em" }}>NetOps Agent Swarm</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 3, background: "rgba(56,189,248,0.08)", color: "#38BDF8", border: "1px solid rgba(56,189,248,0.18)" }}>demo</span>
        </div>
        <div style={{ fontSize: 11, color: "#334155" }}>Monitor → Diagnostic → Response · central orchestrator · simulated agents</div>
      </div>

      {/* Pipeline bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, marginBottom: 12, border: "1px solid rgba(255,255,255,0.05)", borderRadius: 7, overflow: "hidden" }}>
        {pipeline.map((n, i) => {
          const c = AC[n.key];
          const isA = activeStep === n.step;
          const isDone = complete || (activeStep > n.step && activeStep !== -1);
          return (
            <div key={n.key} style={{ padding: "8px 4px", textAlign: "center", background: isA ? c.dim : isDone ? "rgba(52,211,153,0.04)" : "rgba(255,255,255,0.01)", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none", boxShadow: isA ? `inset 0 -2px 0 ${c.accent}` : "none", transition: "all 0.4s ease" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: isA ? "#F1F5F9" : isDone ? "#34D399" : "#334155" }}>{n.label}</div>
              <div style={{ fontSize: 8, color: isA ? c.accent : isDone ? "#166834" : "#1E293B", marginTop: 1 }}>{isA ? "● active" : isDone ? "✓" : "—"}</div>
            </div>
          );
        })}
      </div>

      {/* Status / typing block */}
      {running && (statusMsg || typingEntry) && (
        <div style={{ padding: "10px", background: "rgba(56,189,248,0.04)", border: "1px solid rgba(56,189,248,0.1)", borderRadius: 6, marginBottom: 10 }}>
          {typingEntry
            ? <div>
                <div style={{ fontSize: 9, color: "#38BDF8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
                  <Spinner /> Agent reasoning
                </div>
                <TypedText text={typingEntry.text} color="#475569" onDone={onTypingDone} />
              </div>
            : <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#38BDF8" }}><Spinner />{statusMsg}</div>
          }
        </div>
      )}

      {/* Devices */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, padding: "10px", marginBottom: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#334155", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Network devices</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {DEVICES.map(d => {
            const sel = selected?.id === d.id;
            return (
              <div key={d.id} onClick={() => { if (!running) { setSelected(d); setShowMetrics(true); } }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", border: `1px solid ${sel ? "rgba(56,189,248,0.4)" : "rgba(255,255,255,0.05)"}`, borderRadius: 6, cursor: running ? "default" : "pointer", background: sel ? "rgba(56,189,248,0.06)" : "rgba(255,255,255,0.01)", transition: "all 0.15s" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[d.status], boxShadow: `0 0 5px ${STATUS_COLOR[d.status]}66`, display: "inline-block", flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: sel ? "#F1F5F9" : "#64748B" }}>{d.name}</span>
                <span style={{ fontSize: 10, color: "#1E293B" }}>{d.type}</span>
                <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 99, background: STATUS_BG[d.status], color: STATUS_COLOR[d.status] }}>{d.status}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Metrics */}
      {selected && showMetrics && (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, padding: "10px", marginBottom: 8, animation: "fadeUp 0.2s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#334155", letterSpacing: "0.1em", textTransform: "uppercase" }}>{selected.name}</div>
            <button onClick={() => setShowMetrics(false)} style={{ background: "none", border: "none", color: "#475569", fontSize: 13, padding: 0 }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
            {[{ label: "Latency", key: "latency", val: selected.metrics.latency, unit: "ms", max: 400 },
              { label: "Packet loss", key: "packetLoss", val: selected.metrics.packetLoss, unit: "%", max: 30 },
              { label: "CPU", key: "cpu", val: selected.metrics.cpu, unit: "%", max: 100 },
              { label: "Memory", key: "mem", val: selected.metrics.mem, unit: "%", max: 100 }].map(m => {
              const c = mColor(m.key, m.val);
              return (
                <div key={m.key} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ fontSize: 9, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em" }}>{m.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: c, letterSpacing: "-0.02em" }}>{m.val}<span style={{ fontSize: 10, fontWeight: 400, color: "#475569", marginLeft: 2 }}>{m.unit}</span></div>
                  <Bar val={m.val} max={m.max} color={c} />
                </div>
              );
            })}
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.04)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, fontWeight: 700, color: "#334155", padding: "4px 8px", background: "rgba(255,255,255,0.02)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <span>Port</span><span>Status</span>
            </div>
            {selected.ports.map(p => (
              <div key={p.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 8px", borderTop: "1px solid rgba(255,255,255,0.03)" }}>
                <span style={{ fontFamily: "monospace", color: "#475569" }}>{p.name}</span>
                <span style={{ fontWeight: 600, fontSize: 9, color: p.status === "up" ? "#34D399" : "#F87171" }}>{p.status === "up" ? "▲ up" : "▼ down"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run button */}
      <button disabled={!selected || running} onClick={run} style={{ width: "100%", padding: "11px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", border: `1px solid ${running ? "rgba(56,189,248,0.3)" : !selected ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.12)"}`, borderRadius: 7, background: running ? "rgba(56,189,248,0.06)" : "rgba(255,255,255,0.025)", color: running ? "#38BDF8" : !selected ? "#334155" : "#64748B", cursor: !selected || running ? "not-allowed" : "pointer", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
        {running && <Spinner />}
        {running ? "Swarm executing…" : logs.length > 0 ? "↺  Run again" : "▶  Run agent swarm"}
      </button>

      {/* Log */}
      {logs.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#334155", letterSpacing: "0.1em", textTransform: "uppercase" }}>Execution log</span>
            {!running && <span style={{ fontSize: 9, color: "#334155", marginLeft: "auto" }}>{logs.length} events · {logs[logs.length - 1]?.time}</span>}
          </div>
          <div style={{ padding: "8px 10px" }}>
            {logs.map((log, i) => {
              const c = AC[log.agent]?.accent || "#94A3B8";
              return (
                <div key={i} style={{ padding: "8px 0", borderBottom: i < logs.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none", animation: "fadeUp 0.2s ease" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                    <Badge agent={log.agent} />
                    {log.tool && <span style={{ fontSize: 8, fontFamily: "monospace", color: "#334155", background: "rgba(255,255,255,0.025)", padding: "1px 6px", borderRadius: 3, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.tool}</span>}
                    <span style={{ fontSize: 9, color: "#1E293B", marginLeft: "auto" }}>{log.time}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: log.html }} />
                  {log.reasoning && (
                    <div style={{ marginTop: 6, padding: "6px 8px", background: "rgba(255,255,255,0.012)", borderLeft: `2px solid ${c}33` }}>
                      <div style={{ fontSize: 8, color: "#334155", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Agent reasoning</div>
                      <div style={{ fontSize: 10, color: "#334155", lineHeight: 1.7, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{log.reasoning}</div>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </div>
  );
}
