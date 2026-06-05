import { useState, useRef, useEffect } from "react";

// ── NetOps data (unchanged) ──────────────────────────────────────────────────
const NETWORKS = [
  { id:"hq",  name:"HQ Campus",        location:"San Francisco, CA", collector:"col-hq-01",  collectorStatus:"online"   },
  { id:"sea", name:"Seattle Branch",   location:"Seattle, WA",       collector:"col-sea-01", collectorStatus:"online"   },
  { id:"dmz", name:"DMZ / Cloud Edge", location:"AWS us-west-2",     collector:"col-dmz-01", collectorStatus:"degraded" },
];
const TOPOLOGY = {
  hq:  [["hq-gw-core-01","hq-fw-edge-01"],["hq-gw-core-01","hq-sw-dist-01"],["hq-sw-dist-01","hq-sw-access-03"],["hq-sw-dist-01","hq-ap-floor2-01"],["hq-sw-access-03","hq-cam-lobby-01"],["hq-sw-dist-01","hq-ups-server-01"]],
  sea: [["sea-gw-01","sea-sw-01"],["sea-sw-01","sea-ap-01"],["sea-sw-01","sea-print-01"],["sea-sw-01","sea-nas-01"]],
  dmz: [["dmz-vpn-gw-01","dmz-lb-01"],["dmz-vpn-gw-01","dmz-waf-01"],["dmz-lb-01","dmz-proxy-01"]],
};
const TOPO_POS = {
  hq:  {"hq-gw-core-01":[1,0],"hq-fw-edge-01":[0,1],"hq-sw-dist-01":[2,1],"hq-sw-access-03":[1,2],"hq-ap-floor2-01":[3,2],"hq-ups-server-01":[2,2],"hq-cam-lobby-01":[1,3]},
  sea: {"sea-gw-01":[1,0],"sea-sw-01":[1,1],"sea-ap-01":[0,2],"sea-print-01":[1,2],"sea-nas-01":[2,2]},
  dmz: {"dmz-vpn-gw-01":[1,0],"dmz-waf-01":[0,1],"dmz-lb-01":[2,1],"dmz-proxy-01":[2,2]},
};
const INCIDENT_HISTORY = [
  { id:"INC-2041", ts:"03:14 UTC", device:"HQ Core Router",      network:"HQ Campus",        severity:"P1-Critical", status:"auto-resolved",   mttr:18, affectedUsers:342, estRevenueLoss:9100,  estDowntimeMin:18, rootCause:"BGP peer flap — upstream ISP AS64512 keepalive timeout. CPU 94%, packet loss 18%.", action:"Config rollback via config_api. Static default route injected via VPN. BGP re-established in 11 min. All 4 ports restored.", requiresApproval:false, swarmLog:[{agent:"monitor",text:"BGP peer down. CPU 94%, packet loss 18%. SNMP bgpPeerState=Idle. P1-Critical flagged."},{agent:"diagnostic",text:"Config drift on 'router bgp 64512' confirmed. Root cause: ISP keepalive timeout. Blast radius: 2 downstream segments. No hardware fault."},{agent:"response",text:"Config rolled back. Static route injected. BGP re-established. All interfaces restored. INC-2041 closed."}] },
  { id:"INC-2042", ts:"03:22 UTC", device:"HQ Edge Firewall",    network:"HQ Campus",        severity:"P1-Critical", status:"pending-approval", mttr:null, affectedUsers:342, estRevenueLoss:null, estDowntimeMin:null, rootCause:"SYN flood attack — session table at 87%, DMZ isolated, unauthorized config drift detected on security-policy DMZ-in.", action:"Rate-limiting ACL applied. ISP blackhole requested. Security team paged. DMZ traffic rerouted. PENDING: permanent policy change requires NOC sign-off.", requiresApproval:true, approvalAction:"Approve permanent removal of unauthorized rule from security-policy DMZ-in and restore baseline DMZ-in policy.", swarmLog:[{agent:"monitor",text:"panSessionUtilization 87%. panThreatTotal 14,220/hr — 28x baseline. SYN flood signature. DMZ interface down. P1-Critical."},{agent:"diagnostic",text:"Unauthorized rule detected in 'security-policy DMZ-in'. Timing correlates with INC-2041 — possible coordinated attack. Config drift flagged."},{agent:"response",text:"Rate-limiting ACL applied. ISP blackhole requested. Awaiting NOC approval to permanently remove unauthorized firewall rule and restore baseline policy."}] },
  { id:"INC-2043", ts:"03:45 UTC", device:"Egress Proxy",        network:"DMZ / Cloud Edge", severity:"P1-Critical", status:"auto-resolved",   mttr:22, affectedUsers:189, estRevenueLoss:4400,  estDowntimeMin:22, rootCause:"Unauthorized 'acl BYPASS src' config change — cache bypassed, 10x origin traffic surge. CPU 97%, memory 93%.", action:"Config rollback via config_api. eth1 restarted. Cache hit rate recovered from 12% to 67%. Change management audit ticket raised.", requiresApproval:false, swarmLog:[{agent:"monitor",text:"CPU 97%, memory 93%, cache hit rate 12%. 1,840 clients hitting origin directly. P1-Critical."},{agent:"diagnostic",text:"'acl BYPASS src' config drift — applied at 03:45 UTC without change ticket. Root cause confirmed. Data exfil risk: low."},{agent:"response",text:"ACL rollback applied. eth1 restarted. Cache hit rate 67% within 8 min. Audit ticket raised. INC-2043 closed."}] },
  { id:"INC-2044", ts:"04:12 UTC", device:"Seattle NAS",         network:"Seattle Branch",   severity:"P1-Critical", status:"pending-approval", mttr:null, affectedUsers:28,  estRevenueLoss:null, estDowntimeMin:null, rootCause:"RAID6 array degraded after disk failure. Volume at 94%, bonding interface down. Data at risk during rebuild window.", action:"Backup jobs suspended. Non-critical writes paused. I/O freed. PENDING: hardware procurement and rebuild approval required.", requiresApproval:true, approvalAction:"Approve emergency procurement of replacement drive (Synology HAT5310-8T, ~$280) and authorize maintenance window for RAID rebuild.", swarmLog:[{agent:"monitor",text:"diskHealthStatus DEGRADED. Volume 94%, CPU 91%, eth1 bond down. Array vulnerable to second failure. Data-at-risk P1."},{agent:"diagnostic",text:"Drive failure confirmed. Last replacement 3 years ago — EOL. Rebuild may abort if volume hits 97%. This is a data-at-risk incident."},{agent:"response",text:"Backup suspended. I/O freed. Procurement ticket SEA-STOR-112 raised. Awaiting NOC approval for hardware replacement and rebuild window."}] },
  { id:"INC-2045", ts:"04:38 UTC", device:"Seattle Office AP",   network:"Seattle Branch",   severity:"P2-High",     status:"auto-resolved",   mttr:9,  affectedUsers:51,  estRevenueLoss:380,   estDowntimeMin:9,  rootCause:"RF saturation — 51 clients, 74% channel utilization, 12% retry rate. Return-to-office load spike.", action:"Band steering applied. 2.4GHz offload activated. Retry rate recovered to 3%. Capacity expansion ticket SEA-891 raised.", requiresApproval:false, swarmLog:[{agent:"monitor",text:"dot11ChannelUtil 74%, retry rate 12%, packet loss 2.1%. 51 clients near device capacity. P2-High."},{agent:"diagnostic",text:"Return-to-office load spike. No second AP in Seattle. Capacity problem, not a fault."},{agent:"response",text:"Band steering applied. Retry rate recovered to 3%. Capacity expansion ticket SEA-891 raised. INC-2045 closed."}] },
  { id:"INC-2046", ts:"04:51 UTC", device:"DMZ Load Balancer",   network:"DMZ / Cloud Edge", severity:"P2-High",     status:"pending-approval", mttr:null, affectedUsers:null, estRevenueLoss:null, estDowntimeMin:null, rootCause:"2/8 pool members removed — unauthorized config drift on ltmPool webfarm-prod. Connection count 2.1x baseline.", action:"Health check logs pulled. NOC notification sent. PENDING: authorization check required before pool members can be restored.", requiresApproval:true, approvalAction:"Confirm whether removal of pool members at 172.16.1.15 and 172.16.1.16 was authorized. If unauthorized: approve config rollback to restore 8/8 pool members.", swarmLog:[{agent:"monitor",text:"ltmPoolMemberCnt 6/8. Connections 42,100 — 2.1x baseline. CPU 68%, BW 83%."},{agent:"diagnostic",text:"Pool member drift at 03:22 UTC — same timestamp as INC-2042. Possible coordinated event. Cannot auto-restore without authorization check."},{agent:"response",text:"NOC notified. Health check logs pulled. Pool restoration blocked pending your authorization."}] },
  { id:"INC-2047", ts:"05:04 UTC", device:"Server Room UPS",     network:"HQ Campus",        severity:"P2-High",     status:"auto-resolved",   mttr:14, affectedUsers:0,   estRevenueLoss:0,    estDowntimeMin:0,  rootCause:"UPS output load elevated to 78% from server CPU surge during INC-2041 response. Runtime reduced to 24 min.", action:"Non-critical workloads deferred. Generator warm-up confirmed. Load returned to 61% after core router recovery.", requiresApproval:false, swarmLog:[{agent:"monitor",text:"upsOutputLoad 78%, runtime 24 min. Correlated with server CPU surge from INC-2041."},{agent:"diagnostic",text:"Secondary effect of INC-2041 — not a hardware fault. Battery healthy at 91%."},{agent:"response",text:"Non-critical workloads deferred. Generator confirmed. Load returned to 61%. INC-2047 closed."}] },
];
const RESOLVED = INCIDENT_HISTORY.filter(i=>i.status==="auto-resolved");
const KPI = {
  totalIncidents: INCIDENT_HISTORY.length,
  autoResolved:   RESOLVED.length,
  pendingApproval:INCIDENT_HISTORY.filter(i=>i.status==="pending-approval").length,
  avgMttr:        Math.round(RESOLVED.filter(i=>i.mttr).reduce((a,b)=>a+b.mttr,0)/RESOLVED.filter(i=>i.mttr).length),
  totalRevenueSaved:       RESOLVED.reduce((a,b)=>a+(b.estRevenueLoss||0),0),
  totalDowntimePrevented:  RESOLVED.filter(i=>i.estDowntimeMin>0).reduce((a,b)=>a+(b.estDowntimeMin||0),0),
  slaTarget: 99.95, currentUptime: 99.91, alertsSuppressed: 84,
};
const ACTIVE_INCIDENT = {
  id:"INC-2048", ts:"05:17 UTC", device:"HQ Distribution SW", deviceId:"hq-sw-dist-01", network:"HQ Campus", severity:"P2-High",
  alertMsg:"monitoring_api detected at 05:17 UTC: Port Gi1/0/3 down + collision rate 1,842/min on hq-sw-dist-01. Agent swarm dispatched automatically.",
  metrics:{latency:48,packetLoss:3,cpu:71,mem:62,bandwidth:61},
  healed: {latency:8, packetLoss:0.1,cpu:24,mem:38,bandwidth:22},
  snmp:[{name:"dot3StatsCollisions",value:"1,842/min",status:"warning"},{name:"stpRootPort",value:"Gi1/0/24",status:"ok"},{name:"ifOperStatus",value:"3/4 up",status:"warning"}],
  sim:{
    monReasoning:"Packet loss 3% exceeds P2 threshold. dot3StatsCollisions spiking to 1,842/min vs baseline <50/min — 36x normal. Gi1/0/3 down. CPU 71% elevated from STP reconvergence. Cross-referencing INC-2041 timeline: BGP failure on core router at 03:14 UTC. Classified P2-High — device functional but degraded.",
    diagReasoning:"Topology data confirms Gi1/0/3 is the secondary uplink to HQ Core Router Gi0/0/2 — both went down simultaneously during INC-2041 at 03:14 UTC. STP root port Gi1/0/24 (primary uplink) intact — Layer 2 is functional. Collision counters confirm traffic redistribution artifact from the BGP event, not a hardware fault. Config backup shows no drift. This is a downstream casualty of INC-2041, now in recovery following core router remediation.",
    respReasoning:"P2-High downstream effect of INC-2041. Since the core router has recovered, Gi1/0/3 should auto-restore. Polling set to 30s for verification. If Gi1/0/3 does not recover within 15 min, escalation path: P1 + SFP hardware inspection. No NOC approval needed — auto-remediation is safe here.",
    autoAct:"Polling interval set to 30s via alerting_api. Gi1/0/3 flagged for auto-recovery monitoring. INC-2041 cross-reference logged in shared context store. JIRA ticket HQ-4471 created and linked to INC-2041.",
  }
};
const DEVICES = [
  {id:"hq-gw-core-01",  network:"hq",  name:"HQ Core Router",     type:"Router",       status:"ok",       ip:"10.10.0.1"},
  {id:"hq-sw-dist-01",  network:"hq",  name:"HQ Distribution SW", type:"Switch",       status:"warning",  ip:"10.10.0.2"},
  {id:"hq-fw-edge-01",  network:"hq",  name:"HQ Edge Firewall",   type:"Firewall",     status:"warning",  ip:"10.10.0.3"},
  {id:"hq-ap-floor2-01",network:"hq",  name:"Floor 2 AP",         type:"Access Point", status:"ok",       ip:"10.10.1.10"},
  {id:"hq-ups-server-01",network:"hq", name:"Server Room UPS",    type:"UPS",          status:"ok",       ip:"10.10.2.5"},
  {id:"hq-sw-access-03",network:"hq",  name:"Floor 3 Access SW",  type:"Switch",       status:"ok",       ip:"10.10.1.30"},
  {id:"hq-cam-lobby-01",network:"hq",  name:"Lobby IP Camera",    type:"IP Camera",    status:"ok",       ip:"10.10.3.11"},
  {id:"sea-gw-01",      network:"sea", name:"Seattle Gateway",    type:"Router",       status:"ok",       ip:"10.20.0.1"},
  {id:"sea-sw-01",      network:"sea", name:"Seattle Core SW",    type:"Switch",       status:"ok",       ip:"10.20.0.2"},
  {id:"sea-ap-01",      network:"sea", name:"Seattle Office AP",  type:"Access Point", status:"ok",       ip:"10.20.1.5"},
  {id:"sea-print-01",   network:"sea", name:"Seattle MFP",        type:"Printer",      status:"ok",       ip:"10.20.2.10"},
  {id:"sea-nas-01",     network:"sea", name:"Seattle NAS",        type:"NAS",          status:"critical", ip:"10.20.2.20"},
  {id:"dmz-vpn-gw-01",  network:"dmz", name:"VPN Gateway",        type:"VPN Gateway",  status:"ok",       ip:"172.16.0.10"},
  {id:"dmz-waf-01",     network:"dmz", name:"WAF",                type:"WAF",          status:"ok",       ip:"172.16.0.2"},
  {id:"dmz-lb-01",      network:"dmz", name:"DMZ Load Balancer",  type:"Load Balancer",status:"warning",  ip:"172.16.0.1"},
  {id:"dmz-proxy-01",   network:"dmz", name:"Egress Proxy",       type:"Proxy",        status:"ok",       ip:"172.16.1.5"},
];

// ── GPU Insights data ────────────────────────────────────────────────────────
const AC_GPU = {
  orchestrator:{accent:"#94A3B8",dim:"rgba(148,163,184,0.12)",label:"Insights Orchestrator"},
  monitor:     {accent:"#38BDF8",dim:"rgba(56,189,248,0.1)",  label:"GPU Telemetry Monitor"},
  diagnostic:  {accent:"#A78BFA",dim:"rgba(167,139,250,0.1)", label:"Root Cause Agent"},
  response:    {accent:"#34D399",dim:"rgba(52,211,153,0.1)",  label:"Action Agent"},
};

const GPU_SCENARIOS = {
  thermal: {
    id:"GPU-001", ts:"14:23 UTC", severity:"P2-High",
    title:"Thermal Throttling Detected",
    subtitle:"16-node A100 Training Cluster · Job: gpt-finetune-7b",
    alertMsg:"gpu_telemetry fired at 14:23 UTC: Nodes 3 and 7 exceeding 83°C thermal threshold. Compute throughput dropped 18% on active training job. Distributed sync degraded.",
    affectedNodes:[3,7], totalNodes:16,
    requiresApproval:true,
    approvalAction:"Authorize isolation of nodes 3 & 7 from cluster and job resubmission on 14 healthy nodes. Checkpoint saved at step 8,420 — training resumes from that point. Estimated interruption: 8 minutes.",
    costLabel:"Est. savings vs. running degraded",  costSaved:3200,
    additionalCostLabel:null,                        additionalCost:null,
    metrics:[
      {l:"GPU Temp",   k:"gpuTemp",   v:87,  hv:71,  u:"°C",       max:100},
      {l:"Throughput", k:"throughput",v:82,  hv:100, u:"%",         max:100},
      {l:"Clock Speed",k:"clockSpeed",v:79,  hv:100, u:"% nominal", max:100},
      {l:"Power Draw", k:"powerDraw", v:94,  hv:76,  u:"% TDP",     max:100},
      {l:"Throttled",  k:"affected",  v:2,   hv:0,   u:"nodes",     max:16},
    ],
    sim:{
      monReasoning:"GPU core temperature on nodes 3 and 7 registering 87°C — 4°C above thermal throttle threshold of 83°C. DCGM metrics confirm clock speed reduction: nodes 3/7 running at 1,230 MHz vs cluster baseline of 1,560 MHz. Compute throughput telemetry shows 18% degradation on affected nodes. Distributed training sync degraded — barrier wait time elevated 340ms above P50. Classifying P2-High: active job impact, no immediate hardware risk.",
      diagReasoning:"Thermal throttling confirmed as root cause. Nodes 3 and 7 clock governors have engaged thermal protection, reducing GPU frequency to prevent hardware damage. Thermal history shows sustained temps above 80°C for 22 minutes — cooling system underperforming. Job impact: 18% throughput reduction on 2/16 nodes cascades to global training slowdown via distributed sync barrier. Projected job extension: +2.1 hours at current trajectory. No hardware fault — thermal event only. Confidence: 94%.",
      respReasoning:"Checkpoint job at current step, isolate nodes 3 and 7 from the training pool, and resubmit on 14 healthy nodes to restore full throughput. Estimated cost impact of catching early vs. running degraded: $3,200 saved. Flag nodes 3 and 7 for proactive thermal inspection before next job assignment. Post-remediation: verify clock speeds return to baseline on healthy nodes within 3 minutes of resubmit.",
      autoAct:"Job checkpointed at step 8,420. Nodes 3 & 7 quarantined. Job resubmitted on nodes 1–2, 4–6, 8–16 (14 nodes). ETA to resume: 8 minutes. Hardware inspection ticket GPU-HW-0391 created for nodes 3 & 7.",
      monTools:[
        ["gpu_telemetry: get_cluster_status()","16-node A100 cluster · collector gpu-col-01 online · training job gpt-finetune-7b active at step 8,420."],
        ["dcgm_metrics: get_node_metrics('node-03','node-07')","Node-03: <span style='color:#F87171;font-weight:600'>87°C</span> · 1,230 MHz · throughput <span style='color:#F87171;font-weight:600'>82%</span><br>Node-07: <span style='color:#F87171;font-weight:600'>85°C</span> · 1,280 MHz · throughput <span style='color:#FBBF24;font-weight:600'>86%</span>"],
        ["gpu_telemetry: get_thermal_sensors('node-03','node-07')","<span style='color:#F87171'>NVML thermal throttle flag ACTIVE on both nodes.</span> Fan speed at 98% max. Ambient temp: 24°C."],
      ],
      monFlag:"<span style='color:#FBBF24;font-weight:700'>P2-High</span> — Thermal throttle on nodes 3 & 7. Throughput −18%. Distributed sync degraded.",
      diagTools:[
        ["dcgm_metrics: get_clock_history('node-03','node-07')","Clock stepped down at 14:01 UTC: 1,560 → 1,230 MHz. Consistent with sustained thermal event, not a transient spike."],
        ["gpu_insights: get_job_impact_analysis('gpt-finetune-7b')","Barrier wait time +340ms/step. 18% throughput loss on 2 nodes cascades to cluster-wide slowdown. Projected extension: <span style='color:#F87171;font-weight:600'>+2.1 hours</span>."],
        ["gpu_telemetry: get_thermal_history('node-03','node-07')","Sustained temp >80°C for 22 minutes. Cooling system underperforming — not a transient spike."],
      ],
      diagFlag:"<strong>Root cause:</strong> Thermal throttling. <strong>Confidence:</strong> 94%. No hardware fault. Job extension: +2.1 hours.",
      respTools:[
        ["job_manager: checkpoint_job('gpt-finetune-7b')","<span style='color:#34D399'>✓ Checkpoint saved</span> at step 8,420."],
        ["cluster_manager: isolate_nodes(['node-03','node-07'])","<span style='color:#34D399'>✓ Nodes 3 & 7 quarantined.</span> Inspection ticket GPU-HW-0391 created."],
      ],
      reportMsg:"<strong>GPU-001 filed.</strong> P2-High thermal throttle on nodes 3 & 7. Job checkpointed and resubmitted on healthy pool. <span style='color:#34D399;font-weight:700'>Est. $3,200 saved</span> vs. running degraded to completion.<br><span style='color:#A78BFA;font-size:10px'>Tools: gpu_telemetry · dcgm_metrics · gpu_insights · job_manager · cluster_manager</span>",
      healMsg:"<span style='color:#34D399;font-weight:700'>✓ Job healthy.</span> Training resumed on 14-node pool. Clock speeds nominal. Throughput restored to 100%.",
    },
  },

  idle: {
    id:"GPU-002", ts:"09:41 UTC", severity:"P1-Critical",
    title:"Idle GPU Cost Alert",
    subtitle:"32-GPU Reserved Cluster · Customer: Meridian AI",
    alertMsg:"gpu_telemetry fired at 09:41 UTC: 32-GPU reserved cluster below 15% utilization for 38 consecutive minutes. Reserved billing window active — $2,847 accrued and climbing at ~$75/min.",
    affectedNodes:Array.from({length:32},(_,i)=>i+1), totalNodes:32,
    requiresApproval:false,
    approvalAction:null,
    costLabel:"Accrued idle GPU cost (so far)",         costSaved:2847,
    additionalCostLabel:"Additional cost if no action in 30 min", additionalCost:2240,
    metrics:[
      {l:"GPU Util",    k:"gpuUtil",  v:8,    hv:94,  u:"%",     max:100},
      {l:"Idle Time",   k:"idleTime", v:38,   hv:0,   u:"min",   max:60},
      {l:"Cost Accrued",k:"cost",     v:2847, hv:2847,u:"$",     max:5000},
      {l:"Power Draw",  k:"powerDraw",v:12,   hv:88,  u:"% TDP", max:100},
      {l:"Active Jobs", k:"jobs",     v:0,    hv:1,   u:"",      max:4},
    ],
    sim:{
      monReasoning:"GPU utilization across all 32 nodes has been below 15% for 38 consecutive minutes. Reserved cluster billing is active — customer Meridian AI is paying for this capacity. Utilization pattern inconsistent with intentional idle: no job-submitted signal in the last 45 minutes, no data loader processes running. Cost accrued: $2,847. Classifying P1-Critical: active financial bleed with no productive workload.",
      diagReasoning:"Root cause: training job failed silently 38 minutes ago with an OOM error on node 14. No automatic restart configured. Ruling out alternatives: data loading bottleneck ruled out — loader process not running; intentional idle ruled out — no manual idle signal, no job queued. Job exit code 137 (OOM kill) logged at 09:03 UTC. All 32 GPUs idle since. Cost trajectory: $2,847 accrued, $2,240 additional if no action in 30 minutes. Confidence: 97%.",
      respReasoning:"Alert customer Meridian AI immediately with cost figure, root cause (OOM on node 14), and two action options: restart the failed job with increased memory allocation, or release the reservation if the job is no longer needed. One-click restart workflow pre-staged with fixed memory config. If no customer response in 15 minutes, escalate to account team. Every minute of inaction accrues ~$75.",
      autoAct:"Customer alert sent with $2,847 cost figure and OOM root cause. One-click restart staged with increased memory limit on node 14. Account team notified. Utilization threshold adjusted to 10% for faster future detection on this cluster.",
      monTools:[
        ["gpu_telemetry: get_cluster_status()","32-GPU reserved cluster · collector gpu-col-meridian online · customer: Meridian AI · reserved window active."],
        ["dcgm_metrics: get_utilization_history('cluster-meridian','38min')","GPU util: <span style='color:#F87171;font-weight:600'>8%</span> avg across 32 nodes · 38 consecutive minutes below 15% threshold. No utilization spikes detected."],
        ["billing_api: get_accrued_cost('cluster-meridian')","<span style='color:#F87171;font-weight:700'>$2,847 accrued</span> in idle time. Billing rate: ~$75/min. Reserved window: 4 hours remaining."],
      ],
      monFlag:"<span style='color:#F87171;font-weight:700'>P1-Critical</span> — 32 GPUs idle 38 min. $2,847 accrued. No active workload detected.",
      diagTools:[
        ["job_manager: get_last_job_status('cluster-meridian')","<span style='color:#F87171'>Exit code 137 (OOM kill)</span> on node 14 at 09:03 UTC. No restart policy configured."],
        ["job_manager: get_process_list('cluster-meridian')","No data loader process running. No job process running. GPUs at idle power state."],
        ["cluster_manager: check_idle_signal('cluster-meridian')","<span style='color:#34D399'>No manual idle signal found.</span> No job queued. Unintentional idle confirmed."],
      ],
      diagFlag:"<strong>Root cause:</strong> Silent OOM failure — no auto-restart. <strong>Confidence:</strong> 97%. Cost trajectory: +$2,240 if no action in 30 min.",
      respTools:[
        ["notification_api: alert_customer('meridian-ai')","<span style='color:#34D399'>✓ Alert sent</span> to Meridian AI: $2,847 cost figure, OOM root cause, two action options included."],
        ["job_manager: stage_restart_workflow('cluster-meridian')","<span style='color:#34D399'>✓ One-click restart staged</span> with increased memory limit on node 14."],
      ],
      reportMsg:"<strong>GPU-002 filed.</strong> P1-Critical idle cluster. $2,847 accrued. Customer alerted. Restart workflow staged. <span style='color:#FBBF24;font-weight:700'>+$2,240 at risk if no response in 30 min.</span><br><span style='color:#A78BFA;font-size:10px'>Tools: gpu_telemetry · dcgm_metrics · billing_api · job_manager · cluster_manager · notification_api</span>",
      healMsg:"<span style='color:#34D399;font-weight:700'>✓ Cluster active.</span> Meridian AI restarted job. GPU utilization 94%. Financial bleed stopped.",
    },
  },

  straggler: {
    id:"GPU-003", ts:"22:07 UTC", severity:"P2-High",
    title:"Training Straggler Detected",
    subtitle:"64-node H100 Cluster · LLM Pre-training Job",
    alertMsg:"gpu_telemetry fired at 22:07 UTC: Node 12 of 64 consistently 22% slower than cluster median for 47 minutes across 340 training steps. Entire cluster stalling at sync barrier.",
    affectedNodes:[12], totalNodes:64,
    requiresApproval:true,
    approvalAction:"Authorize eviction of node 12 and provisioning of warm-pool replacement node 47. Checkpoint saved at step 8,921 — job resumes automatically. Estimated swap time: 12 minutes.",
    costLabel:"Net savings vs. continuing degraded",    costSaved:5400,
    additionalCostLabel:"Projected cost if unresolved", additionalCost:6100,
    metrics:[
      {l:"Step Lag",  k:"stepLag", v:22,   hv:0,   u:"%",        max:50},
      {l:"Duration",  k:"duration",v:47,   hv:0,   u:"min",      max:60},
      {l:"Straggler", k:"affected",v:1,    hv:0,   u:"/64 nodes",max:64},
      {l:"Job ETA",   k:"jobEta",  v:3.8,  hv:0.2, u:"h added",  max:5},
      {l:"Cost Risk", k:"costRisk",v:6100, hv:0,   u:"$",        max:10000},
    ],
    sim:{
      monReasoning:"Node 12 step completion time: 1.47s vs cluster P50 of 1.20s — consistently 22% above median for 47 minutes and 340 training steps. This is not noise: coefficient of variation across 340 steps is 2.3%, indicating a persistent bottleneck rather than transient spikes. All other 63 nodes are within ±4% of P50. The entire 64-node cluster stalls at each synchronization barrier waiting for node 12. Global throughput impact: 22% job slowdown. Classifying P2-High.",
      diagReasoning:"Root cause: CPU bottleneck on node 12 starving the GPU data pipeline. CPU utilization on node 12: 98% vs cluster median 34%. I/O wait: 41% — data loader is CPU-bound and cannot pre-fetch fast enough to keep the GPU fed. GPU utilization on node 12 is 67% vs cluster median 94% — GPU is waiting for data, not the reverse. This is a CPU/data-loader bottleneck, not a GPU hardware fault. Whole-cluster impact: every step, 63 healthy nodes complete and wait at the barrier for node 12. Projected extension: +3.8 hours, estimated cost: +$6,100. Confidence: 89%.",
      respReasoning:"Checkpoint job now. Replace node 12 with a healthy node from the warm pool — estimated swap time: 12 minutes. Resume from checkpoint. Net savings vs. continuing degraded for the remaining job duration: $5,400. Alternative considered: increasing CPU allocation on node 12 — rejected, requires node restart and loses current progress. Longer-term: flag node 12 for CPU hardware inspection and adjust data-loader pinning config.",
      autoAct:"Job checkpointed at step 8,921. Node 12 evicted and flagged for CPU inspection. Replacement node 47 (warm pool) provisioned and joining cluster. Estimated time to resume: 12 minutes. Hardware ticket GPU-HW-0392 created.",
      monTools:[
        ["gpu_telemetry: get_cluster_status()","64-node H100 cluster · collector gpu-col-01 online · LLM pre-training job active · step 8,921 of ~15,000."],
        ["dcgm_metrics: get_step_timing_distribution('llm-pretrain-job')","Node-12: <span style='color:#F87171;font-weight:600'>1.47s/step</span> vs cluster P50 <span style='color:#34D399'>1.20s</span>. Lag: 22% · 340 consecutive steps · CV: 2.3% (persistent pattern)."],
        ["gpu_telemetry: get_barrier_wait_times('llm-pretrain-job')","63 nodes waiting at sync barrier each step for node 12. Barrier wait: <span style='color:#F87171;font-weight:600'>+270ms avg</span>. Global throughput: −22%."],
      ],
      monFlag:"<span style='color:#FBBF24;font-weight:700'>P2-High</span> — Node 12 straggler across 340 steps · entire 64-node cluster impacted · +3.8h projected.",
      diagTools:[
        ["dcgm_metrics: get_cpu_utilization('node-12')","Node-12 CPU: <span style='color:#F87171;font-weight:600'>98%</span> vs cluster median <span style='color:#34D399'>34%</span>. I/O wait: 41%. Data loader is CPU-bound."],
        ["dcgm_metrics: get_gpu_utilization('node-12')","Node-12 GPU: <span style='color:#FBBF24;font-weight:600'>67%</span> vs cluster median <span style='color:#34D399'>94%</span>. GPU starved for data — not a hardware fault."],
        ["gpu_insights: rule_out_gpu_fault('node-12')","<span style='color:#34D399'>GPU hardware healthy.</span> Error memory: 0. Thermal: 72°C nominal. Root cause confirmed: CPU/data-loader bottleneck."],
      ],
      diagFlag:"<strong>Root cause:</strong> CPU bottleneck starving GPU data feed. <strong>Confidence:</strong> 89%. Not a GPU fault. Cluster-wide impact: 22% slowdown.",
      respTools:[
        ["job_manager: checkpoint_job('llm-pretrain-job')","<span style='color:#34D399'>✓ Checkpoint saved</span> at step 8,921."],
        ["cluster_manager: evict_node('node-12')","<span style='color:#34D399'>✓ Node 12 evicted.</span> CPU inspection ticket GPU-HW-0392 created."],
      ],
      reportMsg:"<strong>GPU-003 filed.</strong> P2-High straggler on node 12. Job checkpointed. Replacement provisioning. <span style='color:#34D399;font-weight:700'>Net savings: $5,400</span> vs. running degraded.<br><span style='color:#A78BFA;font-size:10px'>Tools: gpu_telemetry · dcgm_metrics · gpu_insights · job_manager · cluster_manager</span>",
      healMsg:"<span style='color:#34D399;font-weight:700'>✓ Job resumed.</span> Node 47 joined cluster. All 64 nodes within 4% of P50. Throughput fully restored.",
    },
  },
};

// ── Shared constants ─────────────────────────────────────────────────────────
const THEMES = {
  dark: {bg:"#070C13",card:"rgba(255,255,255,0.025)",border:"rgba(255,255,255,0.06)",borderHi:"rgba(255,255,255,0.12)",text:"#94A3B8",textHi:"#F1F5F9",textDim:"#334155",textMid:"#64748B",inset:"rgba(255,255,255,0.015)",barBg:"rgba(255,255,255,0.06)"},
  light:{bg:"#F0F4F8",card:"#FFFFFF",              border:"rgba(0,0,0,0.08)",       borderHi:"rgba(0,0,0,0.15)",       text:"#475569",textHi:"#0F172A",textDim:"#94A3B8",textMid:"#64748B",inset:"rgba(0,0,0,0.03)",       barBg:"rgba(0,0,0,0.06)"},
};
const AC={orchestrator:{accent:"#94A3B8",dim:"rgba(148,163,184,0.12)",label:"Orchestrator"},monitor:{accent:"#38BDF8",dim:"rgba(56,189,248,0.1)",label:"Monitor"},diagnostic:{accent:"#A78BFA",dim:"rgba(167,139,250,0.1)",label:"Diagnostic"},response:{accent:"#34D399",dim:"rgba(52,211,153,0.1)",label:"Response"}};
const SEV_COLOR={"P1-Critical":"#F87171","P2-High":"#FBBF24","P3-Low":"#34D399"};
const SEV_BG={"P1-Critical":"rgba(248,113,113,0.12)","P2-High":"rgba(251,191,36,0.12)","P3-Low":"rgba(52,211,153,0.1)"};
const STATUS_COLOR={critical:"#F87171",warning:"#FBBF24",ok:"#34D399"};
const NET_ACCENT={hq:"#38BDF8",sea:"#A78BFA",dmz:"#FB923C"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function mColor(k,v){if(k==="latency")return v>200?"#F87171":v>50?"#FBBF24":"#34D399";if(k==="packetLoss")return v>10?"#F87171":v>2?"#FBBF24":"#34D399";if(k==="bandwidth")return v>90?"#F87171":v>70?"#FBBF24":"#34D399";if(k==="cpu"||k==="mem")return v>85?"#F87171":v>65?"#FBBF24":"#34D399";return"#475569";}
function gpuMColor(k,v){if(k==="gpuTemp")return v>85?"#F87171":v>80?"#FBBF24":"#34D399";if(k==="throughput"||k==="clockSpeed")return v<70?"#F87171":v<90?"#FBBF24":"#34D399";if(k==="powerDraw")return v>95?"#F87171":v>85?"#FBBF24":"#34D399";if(k==="affected")return v>0?"#F87171":"#34D399";if(k==="gpuUtil")return v<10?"#F87171":v<40?"#FBBF24":"#34D399";if(k==="idleTime")return v>30?"#F87171":v>10?"#FBBF24":"#34D399";if(k==="cost")return v>0?"#F87171":"#34D399";if(k==="jobs")return v===0?"#F87171":"#34D399";if(k==="stepLag")return v>15?"#F87171":v>5?"#FBBF24":"#34D399";if(k==="duration")return v>30?"#F87171":v>10?"#FBBF24":"#34D399";if(k==="jobEta")return v>3?"#F87171":v>1?"#FBBF24":"#34D399";if(k==="costRisk")return v>4000?"#F87171":v>1000?"#FBBF24":"#34D399";return"#94A3B8";}
function fmt$(n){return n>=1000?"$"+Math.round(n/1000)+"k":"$"+n;}

// ── Shared components ────────────────────────────────────────────────────────
function Spinner(){return <span style={{width:10,height:10,border:"1.5px solid rgba(56,189,248,0.2)",borderTopColor:"#38BDF8",borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite",flexShrink:0}}/>;}
function Badge({agent}){const m=AC[agent?.toLowerCase()]||AC.orchestrator;return <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",padding:"2px 7px",borderRadius:3,background:m.dim,color:m.accent,border:`1px solid ${m.accent}33`,fontFamily:"'JetBrains Mono',monospace"}}>{m.label}</span>;}
function GpuBadge({agent}){const m=AC_GPU[agent?.toLowerCase()]||AC_GPU.orchestrator;return <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",padding:"2px 7px",borderRadius:3,background:m.dim,color:m.accent,border:`1px solid ${m.accent}33`,fontFamily:"'JetBrains Mono',monospace"}}>{m.label}</span>;}
function SevBadge({sev}){return <span style={{fontSize:8,fontWeight:700,letterSpacing:"0.05em",padding:"2px 7px",borderRadius:99,background:SEV_BG[sev]||"rgba(148,163,184,0.1)",color:SEV_COLOR[sev]||"#94A3B8"}}>{sev}</span>;}
function MiniBar({val,max,color,T}){return <div style={{height:2,background:T.barBg,borderRadius:1,overflow:"hidden",marginTop:3}}><div style={{height:"100%",width:`${Math.min(100,(val/max)*100)}%`,background:color,borderRadius:1,transition:"width 0.8s ease"}}/></div>;}

function TypedText({text,color,onDone}){
  const [shown,setShown]=useState(""); const iRef=useRef(0);
  useEffect(()=>{iRef.current=0;setShown("");const iv=setInterval(()=>{if(iRef.current>=text.length){clearInterval(iv);onDone&&onDone();return;}setShown(text.slice(0,++iRef.current));},11);return()=>clearInterval(iv);},[text]);
  return <div style={{fontSize:11,color,lineHeight:1.75,fontFamily:"'JetBrains Mono',monospace",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{shown}{shown.length<text.length&&<span style={{display:"inline-block",width:2,height:11,background:color,marginLeft:1,animation:"blink 0.8s step-end infinite",verticalAlign:"text-bottom"}}/>}</div>;
}

// ── NetOps components (unchanged) ────────────────────────────────────────────
function TopologyMap({networkId,devices,activeDeviceId,T,theme}){
  const edges=TOPOLOGY[networkId]||[],pos=TOPO_POS[networkId]||{};
  const cols=Math.max(...Object.values(pos).map(p=>p[0]))+1,rows=Math.max(...Object.values(pos).map(p=>p[1]))+1;
  const cW=140,cH=90,pX=20,pY=16,W=cols*cW+pX*2,H=rows*cH+pY*2;
  function xy(id){const p=pos[id]||[0,0];return[pX+p[0]*cW+cW/2,pY+p[1]*cH+cH/2];}
  return(
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:"block"}}>
      {edges.map(([a,b],i)=>{
        const[ax,ay]=xy(a),[bx,by]=xy(b);
        const aD=devices.find(d=>d.id===a),bD=devices.find(d=>d.id===b);
        const worst=[aD?.status,bD?.status].includes("critical")?"critical":[aD?.status,bD?.status].includes("warning")?"warning":"ok";
        const ec=STATUS_COLOR[worst],ang=Math.atan2(by-ay,bx-ax),nr=26,al=9;
        const ex=bx-Math.cos(ang)*nr,ey=by-Math.sin(ang)*nr;
        return<g key={i}><line x1={ax} y1={ay} x2={ex} y2={ey} stroke={ec} strokeWidth={worst==="ok"?1.2:2} strokeOpacity={worst==="ok"?0.25:0.65} strokeDasharray={worst==="critical"?"6,3":undefined}/><polygon points={`${ex},${ey} ${ex-al*Math.cos(ang-0.4)},${ey-al*Math.sin(ang-0.4)} ${ex-al*Math.cos(ang+0.4)},${ey-al*Math.sin(ang+0.4)}`} fill={ec} opacity={worst==="ok"?0.25:0.65}/></g>;
      })}
      {devices.map(d=>{
        if(!pos[d.id])return null;
        const[x,y]=xy(d.id),sc=STATUS_COLOR[d.status],isA=d.id===activeDeviceId;
        const abbr=d.type==="Router"?"RTR":d.type==="Switch"?"SW":d.type==="Firewall"?"FW":d.type==="Access Point"?"AP":d.type==="UPS"?"UPS":d.type==="NAS"?"NAS":d.type==="Load Balancer"?"LB":d.type==="WAF"?"WAF":d.type==="VPN Gateway"?"VPN":d.type==="Proxy"?"PX":d.type==="IP Camera"?"CAM":"DEV";
        const short=d.name.replace(/HQ |Seattle |DMZ /g,"").replace(/Distribution/g,"Dist");
        return<g key={d.id}>
          {isA&&<circle cx={x} cy={y} r={32} fill="none" stroke="#FBBF24" strokeWidth={2} strokeDasharray="4,2" opacity={0.9}/>}
          {d.status!=="ok"&&<circle cx={x} cy={y} r={26} fill="none" stroke={sc} strokeWidth={10} opacity={0.1}/>}
          <circle cx={x} cy={y} r={24} fill={theme==="dark"?"#0F1A24":"#E2E8F0"} stroke={sc} strokeWidth={isA?2.5:1.5}/>
          <text x={x} y={y+1} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill={sc} fontWeight={700} fontFamily="'JetBrains Mono',monospace">{abbr}</text>
          <circle cx={x+17} cy={y-17} r={5} fill={sc}/>
          <text x={x} y={y+36} textAnchor="middle" fontSize={8} fill={T.textMid} fontFamily="system-ui">{short.length>14?short.slice(0,13)+"…":short}</text>
          <text x={x} y={y+47} textAnchor="middle" fontSize={7} fill={T.textDim} fontFamily="monospace">{d.ip}</text>
        </g>;
      })}
    </svg>
  );
}

function KPIStrip({T}){
  const kpis=[
    {label:"Total Incidents",  value:11,       sub:"network + compute",         color:T.textHi},
    {label:"Auto-Resolved",    value:4,        sub:"no human intervention",     color:"#34D399"},
    {label:"Pending Approval", value:KPI.pendingApproval, sub:"awaiting NOC sign-off", color:"#FBBF24"},
    {label:"Avg MTTR",         value:KPI.avgMttr+"m",     sub:"network auto-resolved", color:"#38BDF8"},
    {label:"Cost Protected",   value:"$25k",   sub:"network + compute surfaces",color:"#34D399"},
    {label:"Uptime",           value:KPI.currentUptime+"%", sub:`SLA ${KPI.slaTarget}%`, color:KPI.currentUptime>=KPI.slaTarget?"#34D399":"#F87171"},
  ];
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6,marginBottom:14}}>
      {kpis.map(k=>(
        <div key={k.label} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:8,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>{k.label}</div>
          <div style={{fontSize:18,fontWeight:700,color:k.color,letterSpacing:"-0.02em",lineHeight:1}}>{k.value}</div>
          <div style={{fontSize:8,color:T.textDim,marginTop:3}}>{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

function IncidentQueue({incidents,selectedId,onSelect,approvedIds,T}){
  return(
    <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div><div style={{fontSize:11,fontWeight:600,color:T.textHi}}>Incident Queue</div><div style={{fontSize:9,color:T.textDim,marginTop:1}}>Live and historical · select to investigate</div></div>
        <span style={{fontSize:9,color:T.textDim}}>{incidents.length}</span>
      </div>
      {incidents.length===0&&(
        <div style={{padding:"24px 14px",textAlign:"center",fontSize:10,color:T.textDim}}>No incidents for this filter.</div>
      )}
      {incidents.map((inc,i)=>{
        const isSel=selectedId===inc.id;
        const isLive=inc.live;
        const needsApproval=!isLive&&inc.requiresApproval&&!approvedIds.has(inc.id);
        const surfaceClr=inc.surface==="compute"?"#A78BFA":"#38BDF8";
        const displayTitle=inc.title||inc.device;
        const displaySub=inc.surface==="compute"?(inc.subtitle||inc.id):(inc.network||inc.id);
        return(
          <div key={inc.id} onClick={()=>onSelect(inc.id)}
            style={{padding:"10px 14px",borderBottom:i<incidents.length-1?`1px solid ${T.border}`:"none",cursor:"pointer",background:isSel?T.inset:"transparent",transition:"background 0.15s"}}>
            <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4,flexWrap:"wrap"}}>
              <span style={{fontSize:9,fontWeight:700,color:T.textDim,fontFamily:"monospace",flexShrink:0}}>{inc.ts}</span>
              <span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:99,background:`${surfaceClr}18`,color:surfaceClr,flexShrink:0,textTransform:"uppercase",letterSpacing:"0.05em"}}>
                {inc.surface==="compute"?"Compute":"Network"}
              </span>
              <SevBadge sev={inc.severity}/>
              <span style={{marginLeft:"auto",flexShrink:0}}>
                {isLive
                  ?<span style={{fontSize:8,fontWeight:700,color:"#38BDF8",animation:"pulse 2s ease infinite"}}>● live</span>
                  :needsApproval
                    ?<span style={{fontSize:8,fontWeight:700,color:"#FBBF24"}}>⚠ approval</span>
                    :<span style={{fontSize:8,color:"#34D399"}}>✓</span>
                }
              </span>
            </div>
            <div style={{fontSize:11,fontWeight:500,color:isSel?T.textHi:T.text,lineHeight:1.3,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{displayTitle}</div>
            <div style={{fontSize:9,color:T.textDim,lineHeight:1.4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inc.id} · {displaySub}</div>
          </div>
        );
      })}
    </div>
  );
}

function IncidentDetail({inc,T,onApprove,onDismiss,approved}){
  return(
    <div style={{background:T.card,border:`1px solid ${inc.requiresApproval&&!approved?"rgba(251,191,36,0.3)":T.border}`,borderRadius:10,overflow:"hidden",animation:"fadeUp 0.2s ease",marginBottom:10}}>
      <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
            <span style={{fontSize:10,fontWeight:700,color:T.textDim,fontFamily:"monospace"}}>{inc.id}</span>
            <SevBadge sev={inc.severity}/>
            {inc.requiresApproval&&!approved&&<span style={{fontSize:9,fontWeight:700,color:"#FBBF24",padding:"2px 7px",borderRadius:99,background:"rgba(251,191,36,0.1)",border:"1px solid rgba(251,191,36,0.3)"}}>⚠ NOC Action Required</span>}
            {approved&&<span style={{fontSize:9,fontWeight:700,color:"#34D399",padding:"2px 7px",borderRadius:99,background:"rgba(52,211,153,0.1)"}}>✓ Approved</span>}
          </div>
          <div style={{fontSize:13,fontWeight:600,color:T.textHi}}>{inc.device} <span style={{fontSize:10,fontWeight:400,color:T.textDim}}>· {inc.network}</span></div>
          <div style={{fontSize:9,color:T.textDim,marginTop:2}}>{inc.ts}</div>
        </div>
        <button onClick={onDismiss} style={{background:"none",border:"none",color:T.textDim,fontSize:14,padding:0,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{padding:"12px 14px"}}>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:8,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>Root Cause</div>
          <div style={{fontSize:11,color:T.text,lineHeight:1.6}}>{inc.rootCause}</div>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:8,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Agent Swarm Execution</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {inc.swarmLog.map((entry,i)=>{
              const c=AC[entry.agent]?.accent||"#94A3B8";
              return<div key={i} style={{padding:"7px 10px",background:T.inset,borderRadius:5,borderLeft:`2px solid ${c}44`}}>
                <Badge agent={entry.agent}/>
                <div style={{fontSize:11,color:T.textMid,lineHeight:1.6,marginTop:4}}>{entry.text}</div>
              </div>;
            })}
          </div>
        </div>
        <div style={{marginBottom:inc.requiresApproval&&!approved?12:0}}>
          <div style={{fontSize:8,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>Actions Taken</div>
          <div style={{fontSize:11,color:T.text,lineHeight:1.6}}>{inc.action}</div>
        </div>
        {inc.status==="auto-resolved"&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border}`}}>
            {[["MTTR",inc.mttr+" min"],["Users Affected",inc.affectedUsers>0?inc.affectedUsers:"None"],["Impact Avoided",inc.estRevenueLoss>0?fmt$(inc.estRevenueLoss):"Operational"]].map(([l,v])=>(
              <div key={l} style={{background:T.inset,borderRadius:6,padding:"6px 8px"}}>
                <div style={{fontSize:8,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.08em"}}>{l}</div>
                <div style={{fontSize:13,fontWeight:600,color:"#34D399",marginTop:2}}>{v}</div>
              </div>
            ))}
          </div>
        )}
        {inc.requiresApproval&&!approved&&(
          <div style={{marginTop:12,padding:"12px",background:"rgba(251,191,36,0.05)",border:"1px solid rgba(251,191,36,0.25)",borderRadius:8}}>
            <div style={{fontSize:9,color:"#FBBF24",textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:6}}>⚠ NOC Approval Required</div>
            <div style={{fontSize:11,color:T.text,lineHeight:1.6,marginBottom:10}}>{inc.approvalAction}</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={onApprove} style={{flex:1,padding:"9px",fontSize:11,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",border:"none",borderRadius:6,background:"#34D399",color:"#0F172A",cursor:"pointer"}}>✓ Approve & Execute</button>
              <button onClick={onDismiss} style={{padding:"9px 16px",fontSize:11,fontWeight:700,border:`1px solid ${T.border}`,borderRadius:6,background:"transparent",color:T.textMid,cursor:"pointer"}}>Defer</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveIncidentPanel({T,theme}){
  const inc=ACTIVE_INCIDENT;
  const[phase,setPhase]=useState("idle");
  const[logs,setLogs]=useState([]);
  const[typingEntry,setTypingEntry]=useState(null);
  const[statusMsg,setStatusMsg]=useState("");
  const[healed,setHealed]=useState(false);
  const[topoNet,setTopoNet]=useState("hq");
  const bottomRef=useRef(null);
  const startRef=useRef(null);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[logs,typingEntry]);
  const t=()=>((Date.now()-startRef.current)/1000).toFixed(1)+"s";
  function addLog(agent,tool,html){setLogs(prev=>[...prev,{agent,tool,html,time:t()}]);}
  function typeText(text){return new Promise(resolve=>setTypingEntry({text,resolve}));}
  function onTypingDone(){if(typingEntry){typingEntry.resolve();setTypingEntry(null);}}

  async function runSwarm(){
    if(phase!=="idle")return;
    startRef.current=Date.now();
    setLogs([]);setHealed(false);
    const s=inc.sim,m=inc.metrics;
    setPhase("running");setStatusMsg("Orchestrator dispatching swarm…");
    addLog("orchestrator",null,`Alert received: <strong>${inc.alertMsg}</strong>`);
    await sleep(600);
    setStatusMsg("Monitor scanning…");
    addLog("monitor","telemetry_api: get_collector_status()","Collector col-hq-01 online · 7 registered devices in HQ Campus.");
    await sleep(500);
    addLog("monitor",`monitoring_api: get_device_status("${inc.deviceId}")`,
      `<strong>${inc.device}</strong> · 10.10.0.2<br/>`+
      `Latency <span style="color:${mColor("latency",m.latency)};font-weight:600">${m.latency}ms</span> · `+
      `Loss <span style="color:${mColor("packetLoss",m.packetLoss)};font-weight:600">${m.packetLoss}%</span> · `+
      `CPU <span style="color:${mColor("cpu",m.cpu)};font-weight:600">${m.cpu}%</span> · `+
      `BW <span style="color:${mColor("bandwidth",m.bandwidth)};font-weight:600">${m.bandwidth}%</span>`);
    await sleep(500);
    addLog("monitor",`monitoring_api: get_snmp_sensors("${inc.deviceId}")`,
      inc.snmp.map(s=>`<span style="color:${s.status==="warning"?"#FBBF24":"#34D399"}">${s.name}: ${s.value}</span>`).join(" · "));
    await sleep(400);
    setStatusMsg("Monitor reasoning…");
    await typeText(s.monReasoning);
    await sleep(200);
    addLog("monitor","alerting_api: flag_incident()",`<span style="color:#FBBF24;font-weight:700">P2-High</span> — Port Gi1/0/3 down. Collision rate 36x baseline. Downstream of INC-2041.`);
    await sleep(400);
    addLog("orchestrator",null,"P2-High written to context store. Guardrail check passed. Routing to Diagnostic agent.");
    await sleep(500);
    setStatusMsg("Diagnostic investigating…");
    addLog("diagnostic",`topology_api: get_topology("${inc.deviceId}")`,`Mapping dependencies. Cross-referencing INC-2041 blast radius.`);
    await sleep(600);
    addLog("diagnostic",`config_api: get_config_backup("${inc.deviceId}")`,`<span style="color:#34D399">No config drift.</span> Baseline match confirmed.`);
    await sleep(500);
    addLog("diagnostic",`monitoring_api: get_device_history("${inc.deviceId}")`,`Gi1/0/3 down at 03:14 UTC — correlates with INC-2041 BGP failure.`);
    await sleep(400);
    setStatusMsg("Diagnostic reasoning…");
    await typeText(s.diagReasoning);
    await sleep(200);
    addLog("diagnostic","monitoring_api: submit_diagnosis()",`<strong>Root cause:</strong> Downstream STP reconvergence from INC-2041 BGP failure.<br/><strong>Confidence:</strong> high. No hardware fault. Recovery expected post-INC-2041 resolution.`);
    await sleep(400);
    addLog("orchestrator",null,"Diagnosis confirmed (high confidence). Guardrail satisfied. Routing to Response agent.");
    await sleep(500);
    setStatusMsg("Response applying actions…");
    addLog("response","monitoring_api: get_diagnosis()","Diagnosis retrieved. Guardrail check: PASSED.");
    await sleep(400);
    addLog("response",`telemetry_api: apply_remediation("${inc.deviceId}")`,s.autoAct);
    await sleep(500);
    setStatusMsg("Response reasoning…");
    await typeText(s.respReasoning);
    await sleep(200);
    addLog("response","telemetry_api: create_incident_report()",`<strong>INC-2048 filed.</strong> P2-High downstream effect of INC-2041. Polling at 30s. Escalation trigger: Gi1/0/3 not recovered in 15 min → P1 + SFP inspection. No human approval needed.<br/><span style="color:#A78BFA;font-size:10px">Tools: telemetry_api · monitoring_api · topology_api · config_api · alerting_api</span>`);
    await sleep(400);
    setPhase("done");setStatusMsg("");
    addLog("orchestrator",null,`<span style="color:#34D399;font-weight:700">✓ INC-2048 complete</span> in ${t()}. Swarm returned to standby. Monitoring active.`);
    await sleep(1500);
    addLog("orchestrator","monitoring_api: poll_device_status()",`<span style="color:#38BDF8">Post-remediation verification scan on ${inc.device}…</span>`);
    await sleep(2000);
    setHealed(true);
    addLog("orchestrator",null,`<span style="color:#34D399;font-weight:700">✓ Device healed.</span> Gi1/0/3 restored. Collision rate at baseline. ${inc.device} → <span style="color:#34D399;font-weight:700">OK</span>. Topology updated.`);
    setPhase("healed");
  }

  const pStep=phase==="idle"?-1:phase==="healed"||phase==="done"?4:logs.length<5?1:logs.length<9?2:3;
  const netDevices=DEVICES.filter(d=>d.network===topoNet).map(d=>d.id===inc.deviceId&&healed?{...d,status:"ok"}:d);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:"rgba(251,191,36,0.06)",border:"1px solid rgba(251,191,36,0.25)",borderRadius:10,padding:"12px 14px"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#FBBF24",boxShadow:"0 0 10px rgba(251,191,36,0.8)",flexShrink:0,marginTop:3,animation:phase==="idle"?"pulse 1.5s ease infinite":"none"}}/>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
              <span style={{fontSize:11,fontWeight:700,color:"#FBBF24"}}>LIVE — INC-2048 · {inc.ts}</span>
              <SevBadge sev={inc.severity}/>
              <span style={{fontSize:9,color:T.textDim,marginLeft:"auto"}}>{inc.network}</span>
            </div>
            <div style={{fontSize:12,fontWeight:600,color:T.textHi,marginBottom:3}}>{inc.device}</div>
            <div style={{fontSize:10,color:T.textDim,lineHeight:1.5}}>{inc.alertMsg}</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5}}>
          {[{l:"Latency",k:"latency",v:healed?inc.healed.latency:inc.metrics.latency,u:"ms",max:200},{l:"Pkt Loss",k:"packetLoss",v:healed?inc.healed.packetLoss:inc.metrics.packetLoss,u:"%",max:20},{l:"CPU",k:"cpu",v:healed?inc.healed.cpu:inc.metrics.cpu,u:"%",max:100},{l:"Memory",k:"mem",v:healed?inc.healed.mem:inc.metrics.mem,u:"%",max:100},{l:"Bandwidth",k:"bandwidth",v:healed?inc.healed.bandwidth:inc.metrics.bandwidth,u:"%",max:100}].map(m=>{
            const c=mColor(m.k,m.v);
            return<div key={m.l} style={{background:T.inset,borderRadius:5,padding:"6px 8px",border:`1px solid ${T.border}`}}>
              <div style={{fontSize:8,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.07em"}}>{m.l}</div>
              <div style={{fontSize:14,fontWeight:600,color:c,letterSpacing:"-0.02em",transition:"color 0.8s"}}>{m.v}<span style={{fontSize:8,color:T.textDim,marginLeft:1}}>{m.u}</span></div>
              <MiniBar val={m.v} max={m.max} color={c} T={T}/>
            </div>;
          })}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:1,border:`1px solid ${T.border}`,borderRadius:7,overflow:"hidden"}}>
        {[{step:1,key:"monitor",label:"Monitor"},{step:2,key:"diagnostic",label:"Diagnostic"},{step:3,key:"response",label:"Response"},{step:4,key:"orchestrator",label:"Complete"}].map((n,i)=>{
          const c=AC[n.key],isA=pStep===n.step,isDone=pStep>n.step||phase==="healed";
          return<div key={n.key} style={{padding:"8px 4px",textAlign:"center",background:isA?c.dim:isDone?"rgba(52,211,153,0.04)":"transparent",borderRight:i<3?`1px solid ${T.border}`:"none",boxShadow:isA?`inset 0 -2px 0 ${c.accent}`:"none",transition:"all 0.4s"}}>
            <div style={{fontSize:10,fontWeight:600,color:isA?T.textHi:isDone?"#34D399":T.textDim}}>{n.label}</div>
            <div style={{fontSize:8,color:isA?c.accent:isDone?"#166834":T.textDim,marginTop:1}}>{isA?"● active":isDone?"✓":"—"}</div>
          </div>;
        })}
      </div>

      {typingEntry&&(
        <div style={{padding:"10px",background:"rgba(56,189,248,0.04)",border:"1px solid rgba(56,189,248,0.1)",borderRadius:6}}>
          <div style={{fontSize:9,color:"#38BDF8",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:5,display:"flex",alignItems:"center",gap:6}}><Spinner/>Agent reasoning</div>
          <TypedText text={typingEntry.text} color={T.textMid} onDone={onTypingDone}/>
        </div>
      )}
      {statusMsg&&!typingEntry&&phase==="running"&&(
        <div style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:"#38BDF8",padding:"8px 10px",background:"rgba(56,189,248,0.04)",border:"1px solid rgba(56,189,248,0.1)",borderRadius:6}}><Spinner/>{statusMsg}</div>
      )}

      {phase==="idle"&&(
        <button onClick={runSwarm} style={{width:"100%",padding:"12px",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",border:"1px solid rgba(251,191,36,0.4)",borderRadius:7,background:"rgba(251,191,36,0.06)",color:"#FBBF24",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:"#FBBF24",display:"inline-block",animation:"pulse 1.2s ease infinite"}}/>
          Alert active — watch swarm respond to INC-2048 in real time
        </button>
      )}
      {phase==="healed"&&(
        <div style={{padding:"10px 14px",background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.25)",borderRadius:7,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>✓</span>
          <div><div style={{fontSize:11,fontWeight:600,color:"#34D399"}}>INC-2048 resolved · MTTR {logs[logs.length-1]?.time||"—"}</div><div style={{fontSize:9,color:T.textDim}}>Device healed. Topology updated. Swarm returned to standby.</div></div>
        </div>
      )}

      {logs.length>0&&(
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden"}}>
          <div style={{padding:"8px 12px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center"}}>
            <span style={{fontSize:9,fontWeight:700,color:T.textDim,letterSpacing:"0.1em",textTransform:"uppercase"}}>Agent Execution Log — INC-2048</span>
            <span style={{fontSize:9,color:T.textDim,marginLeft:"auto"}}>{logs.length} events</span>
          </div>
          <div style={{padding:"8px 12px",maxHeight:320,overflowY:"auto"}}>
            {logs.map((log,i)=>{
              const c=AC[log.agent]?.accent||"#94A3B8";
              return<div key={i} style={{padding:"7px 0",borderBottom:i<logs.length-1?`1px solid ${T.border}`:"none",animation:"fadeUp 0.2s ease"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                  <Badge agent={log.agent}/>
                  {log.tool&&<span style={{fontSize:8,fontFamily:"monospace",color:T.textDim,background:T.inset,padding:"1px 6px",borderRadius:3,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{log.tool}</span>}
                  <span style={{fontSize:9,color:T.textDim,marginLeft:"auto"}}>{log.time}</span>
                </div>
                <div style={{fontSize:11,color:T.textMid,lineHeight:1.65}} dangerouslySetInnerHTML={{__html:log.html}}/>
              </div>;
            })}
            <div ref={bottomRef}/>
          </div>
        </div>
      )}

      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><div style={{fontSize:11,fontWeight:600,color:T.textHi}}>Network Topology</div><div style={{fontSize:9,color:T.textDim,marginTop:1}}>Active incident highlighted · updates on remediation</div></div>
          <div style={{display:"flex",gap:1,background:T.inset,borderRadius:5,border:`1px solid ${T.border}`,overflow:"hidden"}}>
            {["hq","sea","dmz"].map(n=>(
              <button key={n} onClick={()=>setTopoNet(n)} style={{padding:"4px 10px",fontSize:9,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",border:"none",background:topoNet===n?NET_ACCENT[n]+"22":"transparent",color:topoNet===n?NET_ACCENT[n]:T.textDim,cursor:"pointer",transition:"all 0.15s"}}>{n.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div style={{padding:"10px",overflowX:"auto"}}>
          <TopologyMap networkId={topoNet} devices={netDevices} activeDeviceId={topoNet==="hq"?inc.deviceId:null} T={T} theme={theme}/>
          <div style={{display:"flex",gap:12,marginTop:6,flexWrap:"wrap"}}>
            {[["#F87171","Critical"],["#FBBF24","Warning / Active"],["#34D399","Healthy / Resolved"]].map(([c,l])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:c,display:"inline-block"}}/>
                <span style={{fontSize:8,color:T.textDim}}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── GPU Insights components ──────────────────────────────────────────────────
function ClusterMap({totalNodes,affectedNodes,healed,T,theme}){
  const cols=8,rows=Math.ceil(totalNodes/cols);
  const sz=20,gap=5,px=10,py=10;
  const W=cols*(sz+gap)-gap+px*2, H=rows*(sz+gap)-gap+py*2;
  return(
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:"block"}}>
      {Array.from({length:totalNodes},(_,i)=>{
        const n=i+1,isA=affectedNodes.includes(n);
        const cx=px+(i%cols)*(sz+gap)+sz/2, cy=py+Math.floor(i/cols)*(sz+gap)+sz/2;
        const sc=isA?(healed?"#34D399":"#F87171"):"#34D399";
        const op=isA?1:0.28;
        return(
          <g key={n}>
            {isA&&!healed&&<circle cx={cx} cy={cy} r={sz/2+4} fill="none" stroke="#F87171" strokeWidth={1.5} strokeDasharray="3,2" opacity={0.75}/>}
            <circle cx={cx} cy={cy} r={sz/2} fill={theme==="dark"?"#0F1A24":"#E2E8F0"} stroke={sc} strokeWidth={isA?1.5:0.5} opacity={op}/>
            <text x={cx} y={cy+0.5} textAnchor="middle" dominantBaseline="middle" fontSize={6} fill={sc} fontWeight={isA?700:400} fontFamily="'JetBrains Mono',monospace" opacity={op}>{n}</text>
            {isA&&<circle cx={cx+sz/2-3} cy={cy-sz/2+3} r={3} fill={healed?"#34D399":"#F87171"}/>}
          </g>
        );
      })}
    </svg>
  );
}

function GpuInsightsPanel({scenarioKey,T,theme}){
  const scenario=GPU_SCENARIOS[scenarioKey];
  const[phase,setPhase]=useState("idle");
  const[logs,setLogs]=useState([]);
  const[typingEntry,setTypingEntry]=useState(null);
  const[statusMsg,setStatusMsg]=useState("");
  const[healed,setHealed]=useState(false);
  const bottomRef=useRef(null);
  const startRef=useRef(null);
  const approvalRef=useRef(null);

  useEffect(()=>{setPhase("idle");setLogs([]);setTypingEntry(null);setStatusMsg("");setHealed(false);},[scenarioKey]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[logs,typingEntry]);

  const t=()=>((Date.now()-startRef.current)/1000).toFixed(1)+"s";
  function addLog(agent,tool,html){setLogs(prev=>[...prev,{agent,tool,html,time:t()}]);}
  function typeText(text){return new Promise(resolve=>setTypingEntry({text,resolve}));}
  function onTypingDone(){if(typingEntry){typingEntry.resolve();setTypingEntry(null);}}

  async function runSwarm(){
    if(phase!=="idle")return;
    startRef.current=Date.now();
    setLogs([]);setHealed(false);
    const s=scenario.sim;
    setPhase("running");setStatusMsg("Insights Orchestrator dispatching swarm…");
    addLog("orchestrator",null,`Alert received: <strong>${scenario.alertMsg}</strong>`);
    await sleep(600);

    setStatusMsg("GPU Telemetry Monitor scanning…");
    addLog("monitor",s.monTools[0][0],s.monTools[0][1]);
    await sleep(500);
    addLog("monitor",s.monTools[1][0],s.monTools[1][1]);
    await sleep(500);
    addLog("monitor",s.monTools[2][0],s.monTools[2][1]);
    await sleep(400);
    setStatusMsg("GPU Telemetry Monitor reasoning…");
    await typeText(s.monReasoning);
    await sleep(200);
    addLog("monitor","gpu_telemetry: flag_incident()",s.monFlag);
    await sleep(400);
    addLog("orchestrator",null,"Signal validated. Guardrail check passed. Routing to Root Cause Agent.");
    await sleep(500);

    setStatusMsg("Root Cause Agent investigating…");
    addLog("diagnostic",s.diagTools[0][0],s.diagTools[0][1]);
    await sleep(600);
    addLog("diagnostic",s.diagTools[1][0],s.diagTools[1][1]);
    await sleep(500);
    addLog("diagnostic",s.diagTools[2][0],s.diagTools[2][1]);
    await sleep(400);
    setStatusMsg("Root Cause Agent reasoning…");
    await typeText(s.diagReasoning);
    await sleep(200);
    addLog("diagnostic","gpu_insights: submit_diagnosis()",s.diagFlag);
    await sleep(400);
    addLog("orchestrator",null,"Diagnosis confirmed. Guardrail satisfied. Routing to Action Agent.");
    await sleep(500);

    setStatusMsg("Action Agent executing…");
    addLog("response","gpu_insights: get_diagnosis()","Diagnosis retrieved. Guardrail check: PASSED.");
    await sleep(400);
    addLog("response",s.respTools[0][0],s.respTools[0][1]);
    await sleep(500);
    addLog("response",s.respTools[1][0],s.respTools[1][1]);
    await sleep(500);

    if(scenario.requiresApproval){
      addLog("response","gpu_insights: queue_for_approval()",`<span style='color:#FBBF24'>⚠ High-risk action queued for NOC authorization.</span> Diagnostic context pre-populated for instant sign-off.`);
      await sleep(400);
      addLog("orchestrator",null,"Guardrail enforced — action written to approval queue. Awaiting NOC authorization.");
      setPhase("awaiting-approval");
      await new Promise(resolve=>{approvalRef.current=resolve;});
      setPhase("running");
      addLog("orchestrator",null,`<span style="color:#34D399;font-weight:700">✓ Authorization received.</span> Executing queued remediation.`);
      await sleep(400);
    }

    addLog("response",`cluster_manager: apply_remediation("${scenario.id}")`,s.autoAct);
    await sleep(500);
    setStatusMsg("Action Agent reasoning…");
    await typeText(s.respReasoning);
    await sleep(200);
    addLog("response","gpu_insights: create_incident_report()",s.reportMsg);
    await sleep(400);

    setPhase("done");setStatusMsg("");
    addLog("orchestrator",null,`<span style="color:#34D399;font-weight:700">✓ ${scenario.id} complete</span> in ${t()}. Swarm returned to standby. Monitoring active.`);
    await sleep(1500);
    addLog("orchestrator","gpu_telemetry: poll_cluster_status()",`<span style="color:#38BDF8">Post-remediation verification on ${scenario.title}…</span>`);
    await sleep(2000);
    setHealed(true);
    addLog("orchestrator",null,s.healMsg+` Total elapsed: ${t()}.`);
    setPhase("healed");
  }

  const pStep=phase==="idle"?-1:phase==="healed"||phase==="done"?4:phase==="awaiting-approval"?3:logs.length<5?1:logs.length<9?2:3;
  const sc=SEV_COLOR[scenario.severity]||"#FBBF24";
  const sbg=scenario.severity==="P1-Critical"?"rgba(248,113,113,0.06)":"rgba(251,191,36,0.06)";
  const sbd=scenario.severity==="P1-Critical"?"rgba(248,113,113,0.25)":"rgba(251,191,36,0.25)";

  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:sbg,border:`1px solid ${sbd}`,borderRadius:10,padding:"12px 14px"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:sc,boxShadow:`0 0 10px ${sc}cc`,flexShrink:0,marginTop:3,animation:phase==="idle"?"pulse 1.5s ease infinite":"none"}}/>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}}>
              <span style={{fontSize:11,fontWeight:700,color:sc}}>LIVE — {scenario.id} · {scenario.ts}</span>
              <SevBadge sev={scenario.severity}/>
              <span style={{fontSize:9,color:T.textDim,marginLeft:"auto"}}>{scenario.subtitle}</span>
            </div>
            <div style={{fontSize:12,fontWeight:600,color:T.textHi,marginBottom:3}}>{scenario.title}</div>
            <div style={{fontSize:10,color:T.textDim,lineHeight:1.5}}>{scenario.alertMsg}</div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5,marginBottom:8}}>
          {scenario.metrics.map(m=>{
            const val=healed?m.hv:m.v;
            const c=gpuMColor(m.k,val);
            const disp=m.k==="cost"?"$"+val.toLocaleString():m.k==="costRisk"?val>0?"$"+val.toLocaleString():"$0":val;
            return<div key={m.l} style={{background:T.inset,borderRadius:5,padding:"6px 8px",border:`1px solid ${T.border}`}}>
              <div style={{fontSize:8,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.07em"}}>{m.l}</div>
              <div style={{fontSize:13,fontWeight:600,color:c,letterSpacing:"-0.02em",transition:"color 0.8s"}}>{disp}<span style={{fontSize:8,color:T.textDim,marginLeft:1}}>{m.u}</span></div>
              <MiniBar val={val} max={m.max} color={c} T={T}/>
            </div>;
          })}
        </div>

        <div style={{display:"grid",gridTemplateColumns:scenario.additionalCost?"1fr 1fr":"1fr",gap:6}}>
          <div style={{padding:"8px 12px",background:"rgba(52,211,153,0.07)",border:"1px solid rgba(52,211,153,0.3)",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.08em"}}>{scenario.costLabel}</span>
            <span style={{fontSize:18,fontWeight:700,color:"#34D399",letterSpacing:"-0.02em"}}>${scenario.costSaved.toLocaleString()}</span>
          </div>
          {scenario.additionalCost&&(
            <div style={{padding:"8px 12px",background:"rgba(248,113,113,0.07)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.08em"}}>{scenario.additionalCostLabel}</span>
              <span style={{fontSize:18,fontWeight:700,color:"#F87171",letterSpacing:"-0.02em"}}>${scenario.additionalCost.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:1,border:`1px solid ${T.border}`,borderRadius:7,overflow:"hidden"}}>
        {[
          {step:1,key:"monitor",   label:"GPU Telemetry Monitor"},
          {step:2,key:"diagnostic",label:"Root Cause Agent"},
          {step:3,key:"response",  label:"Action Agent"},
          {step:4,key:"orchestrator",label:"Complete"},
        ].map((n,i)=>{
          const c=AC[n.key],isA=pStep===n.step,isDone=pStep>n.step||phase==="healed";
          const isWaiting=isA&&phase==="awaiting-approval"&&n.step===3;
          return<div key={n.key} style={{padding:"8px 4px",textAlign:"center",background:isWaiting?"rgba(251,191,36,0.08)":isA?c.dim:isDone?"rgba(52,211,153,0.04)":"transparent",borderRight:i<3?`1px solid ${T.border}`:"none",boxShadow:isWaiting?`inset 0 -2px 0 #FBBF24`:isA?`inset 0 -2px 0 ${c.accent}`:"none",transition:"all 0.4s"}}>
            <div style={{fontSize:9,fontWeight:600,color:isA?T.textHi:isDone?"#34D399":T.textDim,lineHeight:1.3}}>{n.label}</div>
            <div style={{fontSize:8,color:isWaiting?"#FBBF24":isA?c.accent:isDone?"#166834":T.textDim,marginTop:2}}>{isWaiting?"⚠ awaiting":isA?"● active":isDone?"✓":"—"}</div>
          </div>;
        })}
      </div>

      {typingEntry&&(
        <div style={{padding:"10px",background:"rgba(56,189,248,0.04)",border:"1px solid rgba(56,189,248,0.1)",borderRadius:6}}>
          <div style={{fontSize:9,color:"#38BDF8",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:5,display:"flex",alignItems:"center",gap:6}}><Spinner/>Agent reasoning</div>
          <TypedText text={typingEntry.text} color={T.textMid} onDone={onTypingDone}/>
        </div>
      )}
      {statusMsg&&!typingEntry&&phase==="running"&&(
        <div style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:"#38BDF8",padding:"8px 10px",background:"rgba(56,189,248,0.04)",border:"1px solid rgba(56,189,248,0.1)",borderRadius:6}}><Spinner/>{statusMsg}</div>
      )}

      {phase==="awaiting-approval"&&(
        <div style={{padding:"12px 14px",background:"rgba(251,191,36,0.05)",border:"1px solid rgba(251,191,36,0.3)",borderRadius:8}}>
          <div style={{fontSize:9,color:"#FBBF24",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.08em",marginBottom:2}}>⚠ NOC Authorization Required</div>
          <div style={{fontSize:9,color:T.textDim,marginBottom:8}}>All diagnostic context pre-loaded — high-risk action queued for instant sign-off.</div>
          <div style={{padding:"8px 10px",background:T.inset,borderRadius:5,border:`1px solid ${T.border}`,marginBottom:6}}>
            <div style={{fontSize:8,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>Proposed Action</div>
            <div style={{fontSize:11,color:T.textHi,lineHeight:1.6}}>{scenario.approvalAction}</div>
          </div>
          <div style={{padding:"6px 10px",background:"rgba(52,211,153,0.07)",border:"1px solid rgba(52,211,153,0.2)",borderRadius:5,display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:9,color:T.textDim}}>Est. savings on authorization</span>
            <span style={{fontSize:14,fontWeight:700,color:"#34D399",letterSpacing:"-0.02em"}}>${scenario.costSaved.toLocaleString()}</span>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>approvalRef.current?.()} style={{flex:1,padding:"9px",fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",border:"1px solid rgba(52,211,153,0.4)",borderRadius:6,background:"rgba(52,211,153,0.1)",color:"#34D399",cursor:"pointer"}}>✓ Authorize & Execute</button>
            <button style={{padding:"9px 14px",fontSize:10,fontWeight:600,border:`1px solid ${T.border}`,borderRadius:6,background:"transparent",color:T.textDim,cursor:"pointer"}}>Defer</button>
          </div>
        </div>
      )}

      {phase==="idle"&&(
        <button onClick={runSwarm} style={{width:"100%",padding:"12px",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",border:`1px solid ${sbd}`,borderRadius:7,background:sbg,color:sc,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:sc,display:"inline-block",animation:"pulse 1.2s ease infinite"}}/>
          Alert active — watch swarm respond to {scenario.id} in real time
        </button>
      )}
      {phase==="healed"&&(
        <div style={{padding:"10px 14px",background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.25)",borderRadius:7,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>✓</span>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:"#34D399"}}>{scenario.id} resolved · {logs[logs.length-1]?.time||"—"}</div>
            <div style={{fontSize:9,color:T.textDim}}>Cluster state updated. Swarm returned to standby.</div>
          </div>
        </div>
      )}

      {logs.length>0&&(
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden"}}>
          <div style={{padding:"8px 12px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center"}}>
            <span style={{fontSize:9,fontWeight:700,color:T.textDim,letterSpacing:"0.1em",textTransform:"uppercase"}}>Agent Execution Log — {scenario.id}</span>
            <span style={{fontSize:9,color:T.textDim,marginLeft:"auto"}}>{logs.length} events</span>
          </div>
          <div style={{padding:"8px 12px",maxHeight:320,overflowY:"auto"}}>
            {logs.map((log,i)=>(
              <div key={i} style={{padding:"7px 0",borderBottom:i<logs.length-1?`1px solid ${T.border}`:"none",animation:"fadeUp 0.2s ease"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                  <GpuBadge agent={log.agent}/>
                  {log.tool&&<span style={{fontSize:8,fontFamily:"monospace",color:T.textDim,background:T.inset,padding:"1px 6px",borderRadius:3,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{log.tool}</span>}
                  <span style={{fontSize:9,color:T.textDim,marginLeft:"auto"}}>{log.time}</span>
                </div>
                <div style={{fontSize:11,color:T.textMid,lineHeight:1.65}} dangerouslySetInnerHTML={{__html:log.html}}/>
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>
        </div>
      )}

      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:T.textHi}}>Cluster Topology</div>
            <div style={{fontSize:9,color:T.textDim,marginTop:1}}>{scenario.affectedNodes.length} of {scenario.totalNodes} nodes affected · updates on remediation</div>
          </div>
          <div style={{display:"flex",gap:12}}>
            {[["#F87171","Affected"],["#34D399","Healthy"]].map(([c,l])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:c,display:"inline-block"}}/>
                <span style={{fontSize:8,color:T.textDim}}>{l}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{padding:"10px",overflowX:"auto"}}>
          <ClusterMap totalNodes={scenario.totalNodes} affectedNodes={scenario.affectedNodes} healed={healed} T={T} theme={theme}/>
        </div>
      </div>
    </div>
  );
}

// ── Unified incident data ────────────────────────────────────────────────────
const GPU_KEY_MAP={"GPU-001":"thermal","GPU-002":"idle","GPU-003":"straggler"};
const UNIFIED_INCIDENTS=[
  {...GPU_SCENARIOS.straggler,surface:"compute",live:true,status:"live"},
  {...GPU_SCENARIOS.thermal,  surface:"compute",live:true,status:"live"},
  {...GPU_SCENARIOS.idle,     surface:"compute",live:true,status:"live"},
  {...ACTIVE_INCIDENT,title:ACTIVE_INCIDENT.device,surface:"network",live:true,status:"live"},
  ...[...INCIDENT_HISTORY].reverse().map(i=>({...i,title:i.device,surface:"network",live:false})),
];

function EmptyState({T}){
  return(
    <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"40px 24px",textAlign:"center"}}>
      <div style={{width:10,height:10,borderRadius:"50%",background:"#34D399",boxShadow:"0 0 14px rgba(52,211,153,0.6)",margin:"0 auto 16px",animation:"pulse 2s ease infinite"}}/>
      <div style={{fontSize:13,fontWeight:600,color:T.textHi,marginBottom:6}}>Swarm Active · Monitoring All Surfaces</div>
      <div style={{fontSize:11,color:T.textDim,lineHeight:1.75,maxWidth:340,margin:"0 auto 20px"}}>
        Select any incident from the queue to view agent reasoning, diagnostic context, and authorize or observe remediation in real time.
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
        {[["#38BDF8","Network","1 live · INC-2048"],["#A78BFA","Compute","3 live · GPU-001 · GPU-002 · GPU-003"]].map(([c,label,sub])=>(
          <div key={label} style={{padding:"8px 14px",background:`${c}10`,border:`1px solid ${c}28`,borderRadius:6,textAlign:"left"}}>
            <div style={{fontSize:9,color:c,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</div>
            <div style={{fontSize:9,color:T.textDim,marginTop:2}}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App(){
  const[theme,setTheme]=useState("dark");
  const[surfaceFilter,setSurfaceFilter]=useState("all");
  const[selectedId,setSelectedId]=useState(null);
  const[approvedIds,setApprovedIds]=useState(new Set());
  const T=THEMES[theme];

  const filtered=surfaceFilter==="all"?UNIFIED_INCIDENTS
    :UNIFIED_INCIDENTS.filter(i=>i.surface===surfaceFilter);
  const selected=UNIFIED_INCIDENTS.find(i=>i.id===selectedId)||null;
  const pendingCount=INCIDENT_HISTORY.filter(i=>i.requiresApproval&&!approvedIds.has(i.id)).length;

  function handleSelect(id){setSelectedId(prev=>prev===id?null:id);}

  return(
    <div style={{background:T.bg,minHeight:"100vh",color:T.text,fontFamily:"'IBM Plex Sans',system-ui,sans-serif",transition:"background 0.3s,color 0.3s"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;700&display=swap');
        @keyframes spin  {to{transform:rotate(360deg)}}
        @keyframes pulse {0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes blink {0%,100%{opacity:1}50%{opacity:0}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:${theme==="dark"?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.12)"};border-radius:2px}
        button{font-family:inherit;cursor:pointer}
      `}</style>

      <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:"0 20px",display:"flex",alignItems:"center",height:48,position:"sticky",top:0,zIndex:100,gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginRight:8,flexShrink:0}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"#34D399",boxShadow:"0 0 8px rgba(52,211,153,0.7)"}}/>
          <span style={{fontSize:13,fontWeight:700,color:T.textHi,letterSpacing:"-0.02em"}}>Insights</span>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",padding:"1px 6px",borderRadius:3,background:"rgba(52,211,153,0.08)",color:"#34D399",border:"1px solid rgba(52,211,153,0.18)"}}>Agent Swarm</span>
        </div>

        <div style={{display:"flex",flex:1}}>
          {[["all","All Surfaces"],["network","Network"],["compute","Compute"]].map(([f,label])=>(
            <button key={f} onClick={()=>{setSurfaceFilter(f);setSelectedId(null);}}
              style={{padding:"0 16px",height:48,fontSize:11,fontWeight:600,border:"none",background:"transparent",color:surfaceFilter===f?T.textHi:T.textDim,borderBottom:surfaceFilter===f?"2px solid #38BDF8":"2px solid transparent",transition:"all 0.15s",cursor:"pointer"}}>
              {label}
              {f==="all"&&<span style={{marginLeft:5,fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:99,background:T.inset,color:T.textDim}}>{UNIFIED_INCIDENTS.length}</span>}
            </button>
          ))}
        </div>

        {pendingCount>0&&<span style={{fontSize:10,fontWeight:700,color:"#FBBF24",padding:"3px 10px",borderRadius:99,background:"rgba(251,191,36,0.12)",border:"1px solid rgba(251,191,36,0.3)",flexShrink:0,whiteSpace:"nowrap"}}>{pendingCount} pending</span>}
        <span style={{fontSize:10,color:T.textDim,fontFamily:"monospace",flexShrink:0}}>05:17 UTC · May 07 2025</span>
        <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} style={{background:T.inset,border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 10px",fontSize:10,color:T.textMid,transition:"all 0.2s"}}>{theme==="dark"?"☀ Light":"☾ Dark"}</button>
      </div>

      <div style={{padding:"16px 20px",maxWidth:1000,margin:"0 auto"}}>
        <KPIStrip T={T}/>
        <div style={{display:"grid",gridTemplateColumns:"320px 1fr",gap:12,alignItems:"start"}}>
          <div style={{position:"sticky",top:64,maxHeight:"calc(100vh - 80px)",overflowY:"auto"}}>
            <IncidentQueue incidents={filtered} selectedId={selectedId} onSelect={handleSelect} approvedIds={approvedIds} T={T}/>
          </div>
          <div>
            {!selected&&<EmptyState T={T}/>}
            {selected&&selected.live&&selected.surface==="network"&&<LiveIncidentPanel T={T} theme={theme}/>}
            {selected&&selected.live&&selected.surface==="compute"&&<GpuInsightsPanel key={selected.id} scenarioKey={GPU_KEY_MAP[selected.id]} T={T} theme={theme}/>}
            {selected&&!selected.live&&(
              <IncidentDetail inc={selected} T={T}
                onApprove={()=>setApprovedIds(prev=>new Set([...prev,selected.id]))}
                onDismiss={()=>setSelectedId(null)}
                approved={approvedIds.has(selected.id)}/>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
