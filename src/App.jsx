import { useState, useRef, useEffect, useCallback } from "react";

// ── Networks ──────────────────────────────────────────────────────────────────
const NETWORKS = [
  { id:"hq",  name:"HQ Campus",        location:"San Francisco, CA", collector:"col-hq-01",  collectorStatus:"online",   scanPolicy:"Every 5 min", ipRange:"10.10.0.0/16" },
  { id:"sea", name:"Seattle Branch",   location:"Seattle, WA",       collector:"col-sea-01", collectorStatus:"online",   scanPolicy:"Every 5 min", ipRange:"10.20.0.0/24" },
  { id:"dmz", name:"DMZ / Cloud Edge", location:"AWS us-west-2",     collector:"col-dmz-01", collectorStatus:"degraded", scanPolicy:"Every 1 min", ipRange:"172.16.0.0/20" },
];

// Topology edges: [upstream, downstream]
const TOPOLOGY = {
  hq: [
    ["hq-gw-core-01","hq-fw-edge-01"],
    ["hq-gw-core-01","hq-sw-dist-01"],
    ["hq-sw-dist-01","hq-sw-access-03"],
    ["hq-sw-dist-01","hq-ap-floor2-01"],
    ["hq-sw-access-03","hq-cam-lobby-01"],
    ["hq-sw-dist-01","hq-ups-server-01"],
  ],
  sea: [
    ["sea-gw-01","sea-sw-01"],
    ["sea-sw-01","sea-ap-01"],
    ["sea-sw-01","sea-print-01"],
    ["sea-sw-01","sea-nas-01"],
  ],
  dmz: [
    ["dmz-vpn-gw-01","dmz-lb-01"],
    ["dmz-vpn-gw-01","dmz-waf-01"],
    ["dmz-lb-01","dmz-proxy-01"],
  ],
};

// Topology layout positions [col, row] (0-indexed)
const TOPO_POS = {
  hq: {
    "hq-gw-core-01":   [1, 0],
    "hq-fw-edge-01":   [0, 1],
    "hq-sw-dist-01":   [2, 1],
    "hq-sw-access-03": [1, 2],
    "hq-ap-floor2-01": [3, 2],
    "hq-ups-server-01":[2, 2],
    "hq-cam-lobby-01": [1, 3],
  },
  sea: {
    "sea-gw-01":    [1, 0],
    "sea-sw-01":    [1, 1],
    "sea-ap-01":    [0, 2],
    "sea-print-01": [1, 2],
    "sea-nas-01":   [2, 2],
  },
  dmz: {
    "dmz-vpn-gw-01": [1, 0],
    "dmz-waf-01":    [0, 1],
    "dmz-lb-01":     [2, 1],
    "dmz-proxy-01":  [2, 2],
  },
};

// ── Devices ───────────────────────────────────────────────────────────────────
const DEVICES = [
  // ── HQ ──
  { id:"hq-gw-core-01", network:"hq", name:"HQ Core Router", type:"Router", vendor:"Cisco", model:"ASR 1001-X", status:"critical", ip:"10.10.0.1",
    metrics:{latency:312,packetLoss:18,uptime:99.1,cpu:94,mem:87,bandwidth:98},
    healed:{latency:18,packetLoss:0.1,uptime:99.9,cpu:34,mem:51,bandwidth:31},
    ports:[{name:"Gi0/0/0",status:"up"},{name:"Gi0/0/1",status:"up"},{name:"Gi0/0/2",status:"down"},{name:"Gi0/0/3",status:"down"}],
    healedPorts:[{name:"Gi0/0/0",status:"up"},{name:"Gi0/0/1",status:"up"},{name:"Gi0/0/2",status:"up"},{name:"Gi0/0/3",status:"up"}],
    snmp:[{name:"bgpPeerState",value:"Idle",status:"critical"},{name:"cpmCPUTotal5min",value:"94%",status:"critical"},{name:"ifInOctets",value:"9.8 Gbps",status:"critical"}],
    healedSnmp:[{name:"bgpPeerState",value:"Established",status:"ok"},{name:"cpmCPUTotal5min",value:"34%",status:"ok"},{name:"ifInOctets",value:"3.1 Gbps",status:"ok"}],
    alerts:["BGP peer down","CPU threshold exceeded","Interface Gi0/0/2 down"],
    tags:["core","critical-infrastructure","bgp"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:true,changedKeys:["ip route 0.0.0.0","router bgp 64512"]},
    rtdHistory:[42,55,78,120,210,280,312],
    healedRtdHistory:[312,280,180,90,42,22,18],
    sim:{
      severity:"P1-Critical",
      reason:"BGP peer flap causing routing table overflow; CPU 94%, packet loss 18% confirm P1.",
      monReasoning:"SNMP bgpPeerState reports Idle — BGP session has dropped. ifInOctets at 9.8Gbps near link saturation. cpmCPUTotal5min at 94% breaches P1 threshold. RTD history shows rapid climb from 42ms to 312ms over 30 min. Three independent P1 indicators confirm critical severity.",
      findings:"HQ Core Router suffering BGP peer failure (AS64512 Idle), causing routing table churn that saturated CPU to 94% and drove packet loss to 18%. Two downstream interfaces dark. Config drift detected on BGP and static route tables.",
      rootCause:"BGP session to upstream ISP AS64512 dropped due to keepalive timeout, triggering recursive route lookup storms that exhausted CPU and caused cascading interface failures.",
      confidence:"high",
      diagReasoning:"domotz_configuration shows drift on 'router bgp 64512' and 'ip route 0.0.0.0' — both modified 4 hours before the incident. domotz_monitoring event log shows BGP adjacency reset at 03:14 UTC. domotz_network topology confirms Gi0/0/2 and Gi0/0/3 serve the HQ distribution layer. This is a control-plane failure, not hardware.",
      autoAct:"BGP session reset attempted. Static default route injected via domotz_agents VPN. Config rolled back via domotz_configuration. On-call NOC paged. Upstream ISP ticket opened.",
      summary:"P1-Critical: HQ Core Router BGP peer failure caused routing overflow, CPU exhaustion, and downstream outages. Config rollback applied, ISP engaged.",
      nextSteps:"1) Confirm BGP re-establishes with AS64512 within 10 min. 2) Validate distribution switch HQ-SW-DIST-01 recovers. 3) Add BGP route dampening before restoring primary path.",
      respReasoning:"BGP control-plane failures require ISP coordination before local remediation is complete. NOC report must include the config drift evidence to support the ISP escalation.",
      domotzTools:["domotz_agents: get_agent_status","domotz_monitoring: get_snmp_sensors","domotz_monitoring: get_sensor_history","domotz_configuration: get_config_backup","domotz_alerts: list_alert_profiles","domotz_network: get_network_topology"]
    }
  },
  { id:"hq-sw-dist-01", network:"hq", name:"HQ Distribution SW", type:"Switch", vendor:"Cisco", model:"Catalyst 9300", status:"warning", ip:"10.10.0.2",
    metrics:{latency:48,packetLoss:3,uptime:99.8,cpu:71,mem:62,bandwidth:61},
    healed:{latency:8,packetLoss:0.1,uptime:99.9,cpu:24,mem:38,bandwidth:22},
    ports:[{name:"Gi1/0/1",status:"up"},{name:"Gi1/0/2",status:"up"},{name:"Gi1/0/3",status:"down"},{name:"Gi1/0/24",status:"up"}],
    healedPorts:[{name:"Gi1/0/1",status:"up"},{name:"Gi1/0/2",status:"up"},{name:"Gi1/0/3",status:"up"},{name:"Gi1/0/24",status:"up"}],
    snmp:[{name:"dot3StatsCollisions",value:"1,842/min",status:"warning"},{name:"stpRootPort",value:"Gi1/0/24",status:"ok"},{name:"ifOperStatus",value:"3/4 up",status:"warning"}],
    healedSnmp:[{name:"dot3StatsCollisions",value:"12/min",status:"ok"},{name:"stpRootPort",value:"Gi1/0/24",status:"ok"},{name:"ifOperStatus",value:"4/4 up",status:"ok"}],
    alerts:["Port Gi1/0/3 down","Collision rate elevated"],
    tags:["distribution","stp","campus"], powerState:"on", poeEnabled:true,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[18,21,24,31,40,45,48],
    healedRtdHistory:[48,38,24,14,9,8,8],
    sim:{
      severity:"P2-High",
      reason:"Elevated collision rate and downed port Gi1/0/3 from upstream BGP event.",
      monReasoning:"Packet loss at 3% exceeds P2 threshold. SNMP dot3StatsCollisions spiking to 1,842/min vs baseline <50/min. Gi1/0/3 down correlates with core router Gi0/0/2 failure. CPU at 71% elevated from STP reconvergence.",
      findings:"HQ Distribution Switch shows elevated collisions, a downed uplink (Gi1/0/3), and CPU elevation from STP reconvergence triggered by the upstream core router failure.",
      rootCause:"Upstream BGP failure on HQ Core Router caused STP topology change, forcing the distribution switch to reconverge and increasing collision domain pressure.",
      confidence:"high",
      diagReasoning:"domotz_network confirms Gi1/0/3 is the secondary uplink to Core Router Gi0/0/2 — both went down simultaneously. STP root port Gi1/0/24 intact so Layer 2 is functional. Collision counters confirm traffic redistribution artifact, not hardware fault. No config drift.",
      autoAct:"NOC alerted. JIRA ticket HQ-4471 linked to core router incident. Polling reduced to 30s. Gi1/0/3 flagged pending upstream recovery.",
      summary:"P2-High: HQ Distribution Switch degraded as downstream symptom of core router BGP failure. Layer 2 intact via primary uplink.",
      nextSteps:"1) Monitor Gi1/0/3 recovery after core BGP restores. 2) If still down after 15 min, inspect SFP. 3) Review STP timers.",
      respReasoning:"Downstream casualty of the core router P1. Link these incidents in the NOC report with a hard escalation trigger.",
      domotzTools:["domotz_monitoring: get_snmp_sensors","domotz_network: get_network_topology","domotz_configuration: get_config_backup","domotz_alerts: bind_alert_profile"]
    }
  },
  { id:"hq-fw-edge-01", network:"hq", name:"HQ Edge Firewall", type:"Firewall", vendor:"Palo Alto", model:"PA-3220", status:"warning", ip:"10.10.0.3",
    metrics:{latency:88,packetLoss:5,uptime:98.4,cpu:78,mem:69,bandwidth:74},
    healed:{latency:21,packetLoss:0.1,uptime:99.8,cpu:41,mem:48,bandwidth:38},
    ports:[{name:"ethernet1/1",status:"up"},{name:"ethernet1/2",status:"up"},{name:"ethernet1/3 (DMZ)",status:"down"}],
    healedPorts:[{name:"ethernet1/1",status:"up"},{name:"ethernet1/2",status:"up"},{name:"ethernet1/3 (DMZ)",status:"up"}],
    snmp:[{name:"panSessionUtilization",value:"87%",status:"critical"},{name:"panThreatTotal",value:"14,220/hr",status:"warning"},{name:"panGPGatewayUtil",value:"62%",status:"ok"}],
    healedSnmp:[{name:"panSessionUtilization",value:"31%",status:"ok"},{name:"panThreatTotal",value:"480/hr",status:"ok"},{name:"panGPGatewayUtil",value:"41%",status:"ok"}],
    alerts:["Session table near capacity","DMZ interface down","Threat volume elevated"],
    tags:["security","perimeter","dmz","critical-infrastructure"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-05 02:00",driftDetected:true,changedKeys:["security-policy DMZ-in","nat-policy WAN-out"]},
    rtdHistory:[22,28,35,52,71,80,88],
    healedRtdHistory:[88,72,51,38,26,22,21],
    sim:{
      severity:"P1-Critical",
      reason:"Session table 87% with 14,220 threats/hr and DMZ down indicates active attack.",
      monReasoning:"panSessionUtilization at 87% near saturation. panThreatTotal at 14,220/hr is 28x the baseline of ~500/hr. DMZ interface down removes isolation layer. Config drift on DMZ security policy suspicious given timing.",
      findings:"HQ Edge Firewall session table near capacity (87%) due to sustained inbound threat campaign (14,220 threats/hr), DMZ interface down, and config drift detected on security and NAT policies.",
      rootCause:"Active SYN flood from external threat actors exhausting firewall session table, causing DMZ isolation and degrading WAN throughput.",
      confidence:"high",
      diagReasoning:"domotz_configuration shows policy drift on 'security-policy DMZ-in' — unauthorized rule may have been added. domotz_monitoring threat sensor history shows spike began at 03:10 UTC — 4 minutes before the BGP failure. Potentially coordinated attack.",
      autoAct:"Rate-limiting ACL applied via domotz_configuration rollback. DMZ traffic rerouted. Security team paged. ISP blackhole route requested. SECURITY-P1 alert profile activated.",
      summary:"P1-Critical: HQ Edge Firewall under active SYN flood. Session table near exhaustion, DMZ isolated, config drift detected. Automated mitigations applied.",
      nextSteps:"1) Confirm ISP blackhole route active within 10 min. 2) Audit the drifted DMZ-in rule. 3) If panThreatTotal sustained, escalate to MSSP.",
      respReasoning:"Both a security and network incident. Config drift must be escalated to security separately from NOC. Two parallel tracks: DDoS mitigation and unauthorized config change investigation.",
      domotzTools:["domotz_monitoring: get_snmp_sensors","domotz_monitoring: get_sensor_history","domotz_configuration: get_config_backup","domotz_alerts: list_alert_profiles","domotz_network: get_network_interfaces"]
    }
  },
  { id:"hq-ap-floor2-01", network:"hq", name:"Floor 2 AP", type:"Access Point", vendor:"Ubiquiti", model:"UniFi U6 Pro", status:"ok", ip:"10.10.1.10",
    metrics:{latency:11,packetLoss:0.1,uptime:100,cpu:18,mem:34,bandwidth:22},
    healed:{latency:11,packetLoss:0.1,uptime:100,cpu:18,mem:34,bandwidth:22},
    ports:[{name:"eth0",status:"up"},{name:"wlan0 (5GHz)",status:"up"},{name:"wlan1 (2.4GHz)",status:"up"}],
    healedPorts:[{name:"eth0",status:"up"},{name:"wlan0 (5GHz)",status:"up"},{name:"wlan1 (2.4GHz)",status:"up"}],
    snmp:[{name:"dot11ClientCount",value:"24 clients",status:"ok"},{name:"dot11ChannelUtil",value:"31%",status:"ok"}],
    healedSnmp:[{name:"dot11ClientCount",value:"24 clients",status:"ok"},{name:"dot11ChannelUtil",value:"31%",status:"ok"}],
    alerts:[], tags:["wifi","floor-2","corporate"], powerState:"on", poeEnabled:true,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[10,10,11,11,11,11,11], healedRtdHistory:[11,11,11,11,11,11,11],
    sim:{severity:"P3-Low",reason:"All metrics nominal. 24 clients, 31% channel utilization.",monReasoning:"All metrics well within baseline. No alerts.",findings:"Floor 2 AP fully operational.",rootCause:"No fault condition.",confidence:"high",diagReasoning:"domotz_inventory confirms tags. Channel utilization 31%. No config drift.",autoAct:"Incident logged.",summary:"P3-Low: Floor 2 AP nominal.",nextSteps:"1) No action required.",respReasoning:"Clean status.",domotzTools:["domotz_monitoring: get_snmp_sensors","domotz_inventory: get_device_tags","domotz_devices: get_device_status"]}
  },
  { id:"hq-ups-server-01", network:"hq", name:"Server Room UPS", type:"UPS", vendor:"APC", model:"Smart-UPS 3000", status:"warning", ip:"10.10.2.5",
    metrics:{latency:14,packetLoss:0,uptime:100,cpu:12,mem:22,bandwidth:1},
    healed:{latency:14,packetLoss:0,uptime:100,cpu:12,mem:22,bandwidth:1},
    ports:[{name:"mgmt0",status:"up"}], healedPorts:[{name:"mgmt0",status:"up"}],
    snmp:[{name:"upsOutputLoad",value:"78%",status:"warning"},{name:"upsBatteryCapacity",value:"91%",status:"ok"},{name:"upsRuntimeRemaining",value:"24 min",status:"warning"}],
    healedSnmp:[{name:"upsOutputLoad",value:"61%",status:"ok"},{name:"upsBatteryCapacity",value:"91%",status:"ok"},{name:"upsRuntimeRemaining",value:"38 min",status:"ok"}],
    alerts:["Output load elevated","Runtime below 30 min threshold"],
    tags:["power","server-room","critical-infrastructure"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[13,13,14,14,14,14,14], healedRtdHistory:[14,14,14,14,14,14,14],
    sim:{severity:"P2-High",reason:"UPS output load 78% with only 24 min estimated runtime.",monReasoning:"upsOutputLoad at 78% exceeds P2 alert threshold of 75%. Runtime 24 min below 30 min safety floor.",findings:"Server Room UPS under elevated load (78%) with runtime reduced to 24 min.",rootCause:"Elevated server CPU activity from network incident processing increased aggregate power draw.",confidence:"medium",diagReasoning:"domotz_power SNMP history shows load climbed from 61% to 78% over 45 min correlating with BGP incident. Battery healthy.",autoAct:"Facilities team alerted. Non-critical workloads flagged. Generator warm-up check initiated.",summary:"P2-High: Server Room UPS under elevated load (78%) with reduced runtime (24 min). Facilities alerted.",nextSteps:"1) Escalate to P1 if load exceeds 85%. 2) Defer non-critical workloads. 3) Verify generator.",respReasoning:"Secondary effect of the network incident. Flag as linked risk.",domotzTools:["domotz_power: get_power_status","domotz_monitoring: get_snmp_sensors","domotz_monitoring: get_sensor_history","domotz_alerts: bind_alert_profile"]}
  },
  { id:"hq-sw-access-03", network:"hq", name:"Floor 3 Access SW", type:"Switch", vendor:"Cisco", model:"Catalyst 9200", status:"ok", ip:"10.10.1.30",
    metrics:{latency:9,packetLoss:0.1,uptime:100,cpu:22,mem:38,bandwidth:18},
    healed:{latency:9,packetLoss:0.1,uptime:100,cpu:22,mem:38,bandwidth:18},
    ports:[{name:"Gi1/0/1",status:"up"},{name:"Gi1/0/2",status:"up"},{name:"Gi1/0/3",status:"up"},{name:"Gi1/0/48",status:"up"}],
    healedPorts:[{name:"Gi1/0/1",status:"up"},{name:"Gi1/0/2",status:"up"},{name:"Gi1/0/3",status:"up"},{name:"Gi1/0/48",status:"up"}],
    snmp:[{name:"dot3StatsFCSErrors",value:"0",status:"ok"},{name:"ifHighSpeed",value:"1 Gbps",status:"ok"}],
    healedSnmp:[{name:"dot3StatsFCSErrors",value:"0",status:"ok"},{name:"ifHighSpeed",value:"1 Gbps",status:"ok"}],
    alerts:[], tags:["access","floor-3","poe"], powerState:"on", poeEnabled:true,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[9,9,9,9,9,9,9], healedRtdHistory:[9,9,9,9,9,9,9],
    sim:{severity:"P3-Low",reason:"All metrics nominal.",monReasoning:"Zero packet loss, 9ms latency. All ports up.",findings:"Floor 3 Access Switch fully operational.",rootCause:"No fault condition.",confidence:"high",diagReasoning:"100% uptime for 90 days. No config drift.",autoAct:"Incident logged.",summary:"P3-Low: Floor 3 Access Switch nominal.",nextSteps:"1) No action required.",respReasoning:"Clean status.",domotzTools:["domotz_devices: get_device_status","domotz_monitoring: get_snmp_sensors"]}
  },
  { id:"hq-cam-lobby-01", network:"hq", name:"Lobby IP Camera", type:"IP Camera", vendor:"Axis", model:"P3245-V", status:"ok", ip:"10.10.3.11",
    metrics:{latency:8,packetLoss:0,uptime:100,cpu:14,mem:28,bandwidth:8},
    healed:{latency:8,packetLoss:0,uptime:100,cpu:14,mem:28,bandwidth:8},
    ports:[{name:"eth0",status:"up"}], healedPorts:[{name:"eth0",status:"up"}],
    snmp:[{name:"videoStreamBitrate",value:"4.2 Mbps",status:"ok"}],
    healedSnmp:[{name:"videoStreamBitrate",value:"4.2 Mbps",status:"ok"}],
    alerts:[], tags:["camera","security","lobby"], powerState:"on", poeEnabled:true,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[8,8,8,8,8,8,8], healedRtdHistory:[8,8,8,8,8,8,8],
    sim:{severity:"P3-Low",reason:"All metrics nominal.",monReasoning:"Zero packet loss, 8ms latency, video stable.",findings:"Lobby IP Camera streaming normally.",rootCause:"No fault condition.",confidence:"high",diagReasoning:"Continuous online status. PoE draw within spec.",autoAct:"Incident logged.",summary:"P3-Low: Lobby IP Camera nominal.",nextSteps:"1) No action required.",respReasoning:"Clean status.",domotzTools:["domotz_devices: get_device_status","domotz_monitoring: get_tcp_sensor"]}
  },

  // ── Seattle ──
  { id:"sea-gw-01", network:"sea", name:"Seattle Gateway", type:"Router", vendor:"Meraki", model:"MX85", status:"ok", ip:"10.20.0.1",
    metrics:{latency:22,packetLoss:0.3,uptime:99.9,cpu:31,mem:44,bandwidth:29},
    healed:{latency:22,packetLoss:0.3,uptime:99.9,cpu:31,mem:44,bandwidth:29},
    ports:[{name:"WAN1",status:"up"},{name:"WAN2",status:"up"},{name:"LAN",status:"up"}],
    healedPorts:[{name:"WAN1",status:"up"},{name:"WAN2",status:"up"},{name:"LAN",status:"up"}],
    snmp:[{name:"meraki.vpnStatus",value:"Connected",status:"ok"},{name:"meraki.uplinkUtil",value:"29%",status:"ok"}],
    healedSnmp:[{name:"meraki.vpnStatus",value:"Connected",status:"ok"},{name:"meraki.uplinkUtil",value:"29%",status:"ok"}],
    alerts:[], tags:["gateway","meraki","branch"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[20,21,21,22,22,22,22], healedRtdHistory:[22,22,22,22,22,22,22],
    sim:{severity:"P3-Low",reason:"Dual WAN healthy, VPN connected to HQ.",monReasoning:"All metrics nominal. VPN connected. Both WAN uplinks active.",findings:"Seattle Gateway fully operational.",rootCause:"No fault condition.",confidence:"high",diagReasoning:"domotz_agents VPN tunnel active. Both WAN interfaces healthy.",autoAct:"Incident logged.",summary:"P3-Low: Seattle Gateway nominal.",nextSteps:"1) No action required.",respReasoning:"Clean status.",domotzTools:["domotz_agents: get_agent_vpn_status","domotz_network: get_network_interfaces"]}
  },
  { id:"sea-sw-01", network:"sea", name:"Seattle Core SW", type:"Switch", vendor:"HP", model:"Aruba 2930F", status:"ok", ip:"10.20.0.2",
    metrics:{latency:7,packetLoss:0,uptime:100,cpu:19,mem:31,bandwidth:14},
    healed:{latency:7,packetLoss:0,uptime:100,cpu:19,mem:31,bandwidth:14},
    ports:[{name:"1",status:"up"},{name:"2",status:"up"},{name:"3",status:"up"},{name:"24",status:"up"}],
    healedPorts:[{name:"1",status:"up"},{name:"2",status:"up"},{name:"3",status:"up"},{name:"24",status:"up"}],
    snmp:[{name:"ifOperStatus",value:"24/24 up",status:"ok"},{name:"dot3StatsCollisions",value:"0",status:"ok"}],
    healedSnmp:[{name:"ifOperStatus",value:"24/24 up",status:"ok"},{name:"dot3StatsCollisions",value:"0",status:"ok"}],
    alerts:[], tags:["core-switch","branch"], powerState:"on", poeEnabled:true,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[7,7,7,7,7,7,7], healedRtdHistory:[7,7,7,7,7,7,7],
    sim:{severity:"P3-Low",reason:"All 24 ports up, zero collisions.",monReasoning:"All metrics nominal.",findings:"Seattle Core Switch operating nominally.",rootCause:"No fault condition.",confidence:"high",diagReasoning:"100% uptime for 60 days. No drift.",autoAct:"Incident logged.",summary:"P3-Low: Seattle Core Switch nominal.",nextSteps:"1) No action required.",respReasoning:"Clean status.",domotzTools:["domotz_devices: get_device_status"]}
  },
  { id:"sea-ap-01", network:"sea", name:"Seattle Office AP", type:"Access Point", vendor:"Cisco", model:"Aironet 4800", status:"warning", ip:"10.20.1.5",
    metrics:{latency:34,packetLoss:2.1,uptime:99.6,cpu:67,mem:58,bandwidth:71},
    healed:{latency:19,packetLoss:0.4,uptime:99.9,cpu:38,mem:42,bandwidth:41},
    ports:[{name:"eth0",status:"up"},{name:"wlan0 (5GHz)",status:"up"},{name:"wlan1 (2.4GHz)",status:"up"}],
    healedPorts:[{name:"eth0",status:"up"},{name:"wlan0 (5GHz)",status:"up"},{name:"wlan1 (2.4GHz)",status:"up"}],
    snmp:[{name:"dot11ClientCount",value:"51 clients",status:"warning"},{name:"dot11ChannelUtil",value:"74%",status:"warning"},{name:"dot11RetryCount",value:"12%",status:"warning"}],
    healedSnmp:[{name:"dot11ClientCount",value:"28 clients",status:"ok"},{name:"dot11ChannelUtil",value:"38%",status:"ok"},{name:"dot11RetryCount",value:"3%",status:"ok"}],
    alerts:["Channel utilization above 70%","Client count high","Retry rate elevated"],
    tags:["wifi","branch","capacity-warning"], powerState:"on", poeEnabled:true,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[18,22,26,29,31,33,34], healedRtdHistory:[34,29,24,21,19,19,19],
    sim:{
      severity:"P2-High",reason:"Channel utilization 74% with 51 clients and 12% retry rate.",
      monReasoning:"dot11ChannelUtil at 74% exceeds 70% saturation threshold. 51 clients near device capacity of ~60. Retry rate 12% is double healthy baseline of <5%. Packet loss 2.1% crosses P2 threshold.",
      findings:"Seattle Office AP RF-saturated with 51 clients, 74% channel utilization, and 12% retry rate causing elevated packet loss.",
      rootCause:"Client density exceeds AP capacity for current channel plan, exacerbated by 5GHz interference.",
      confidence:"medium",
      diagReasoning:"domotz_monitoring retry rate history shows degradation began Monday — return-to-office load. domotz_inventory shows no second AP deployed in Seattle. Capacity expansion needed.",
      autoAct:"Capacity warning profile activated. IT ticket SEA-891 created. Band steering reviewed — 2.4GHz offload attempted.",
      summary:"P2-High: Seattle Office AP RF-saturated with 51 clients. Capacity expansion required. Band steering applied as interim mitigation.",
      nextSteps:"1) Deploy second AP to split client load. 2) Audit channel plan. 3) Enable 802.11r fast roaming.",
      respReasoning:"Capacity problem, not a fault. Frame as growth issue with hardware procurement recommendation.",
      domotzTools:["domotz_monitoring: get_snmp_sensors","domotz_monitoring: get_sensor_history","domotz_inventory: get_device_profile","domotz_alerts: bind_alert_profile"]
    }
  },
  { id:"sea-print-01", network:"sea", name:"Seattle MFP Printer", type:"Printer", vendor:"HP", model:"LaserJet M607", status:"ok", ip:"10.20.2.10",
    metrics:{latency:6,packetLoss:0,uptime:99.9,cpu:8,mem:19,bandwidth:1},
    healed:{latency:6,packetLoss:0,uptime:99.9,cpu:8,mem:19,bandwidth:1},
    ports:[{name:"eth0",status:"up"}], healedPorts:[{name:"eth0",status:"up"}],
    snmp:[{name:"hrPrinterStatus",value:"Running",status:"ok"}],
    healedSnmp:[{name:"hrPrinterStatus",value:"Running",status:"ok"}],
    alerts:[], tags:["printer","branch","facilities"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-04 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[6,6,6,6,6,6,6], healedRtdHistory:[6,6,6,6,6,6,6],
    sim:{severity:"P3-Low",reason:"All metrics nominal.",monReasoning:"Zero packet loss, 6ms latency, Running.",findings:"Seattle MFP Printer operating normally.",rootCause:"No fault condition.",confidence:"high",diagReasoning:"hrPrinterStatus Running. Toner above threshold.",autoAct:"Incident logged.",summary:"P3-Low: Seattle MFP nominal.",nextSteps:"1) No action required.",respReasoning:"Clean status.",domotzTools:["domotz_devices: get_device_status"]}
  },
  { id:"sea-nas-01", network:"sea", name:"Seattle NAS", type:"NAS", vendor:"Synology", model:"DS1821+", status:"critical", ip:"10.20.2.20",
    metrics:{latency:19,packetLoss:0.2,uptime:97.1,cpu:91,mem:88,bandwidth:92},
    healed:{latency:14,packetLoss:0.1,uptime:99.4,cpu:48,mem:61,bandwidth:44},
    ports:[{name:"eth0",status:"up"},{name:"eth1 (bond)",status:"down"}],
    healedPorts:[{name:"eth0",status:"up"},{name:"eth1 (bond)",status:"up"}],
    snmp:[{name:"diskHealthStatus",value:"DEGRADED (rebuild)",status:"critical"},{name:"volumeUsage",value:"94%",status:"critical"},{name:"synoBondingStatus",value:"eth1 link down",status:"critical"}],
    healedSnmp:[{name:"diskHealthStatus",value:"HEALTHY",status:"ok"},{name:"volumeUsage",value:"81%",status:"ok"},{name:"synoBondingStatus",value:"Bond active",status:"ok"}],
    alerts:["RAID array degraded","Volume 94% full","Bonding interface down","CPU critical"],
    tags:["storage","backup","branch","critical-infrastructure"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-05 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[14,16,18,61,78,88,91], healedRtdHistory:[91,72,48,28,18,15,14],
    sim:{
      severity:"P1-Critical",reason:"RAID degraded during rebuild, volume 94%, bonding down, CPU 91%.",
      monReasoning:"diskHealthStatus DEGRADED — drive failed, RAID rebuild in progress. Array vulnerable to second failure. Volume at 94% means rebuild could abort. CPU at 91% from rebuild I/O. eth1 bond down halved I/O bandwidth.",
      findings:"Seattle NAS in critical degraded state: RAID rebuilding after disk failure, volume 94% full, bonding interface eth1 down, CPU saturated at 91%.",
      rootCause:"Physical disk failure initiated RAID6 rebuild. Rebuild consuming all CPU/memory, volume space critically low, bonding failure halved I/O bandwidth.",
      confidence:"high",
      diagReasoning:"domotz_monitoring diskHealthStatus shows degraded state began 6 hours ago. domotz_inventory 'last-disk-replacement' was 3 years ago — likely end-of-life drive. Volume at 94% — rebuild may abort. Data-at-risk incident.",
      autoAct:"Data-at-risk P1 escalated. Storage team paged. Backup jobs suspended. Non-critical writes paused. Replacement drive procurement ticket SEA-STOR-112 opened.",
      summary:"P1-Critical: Seattle NAS RAID degraded after disk failure. Volume critically full (94%), bonding down, CPU saturated. Data at risk.",
      nextSteps:"1) Procure replacement drive immediately. 2) Monitor rebuild — abort if volume hits 97%. 3) Clear 200GB before rebuild resumes. 4) Repair eth1 bond.",
      respReasoning:"Data-at-risk incidents require immediate hardware action. Report must state array is vulnerable to second failure during the rebuild window.",
      domotzTools:["domotz_monitoring: get_snmp_sensors","domotz_monitoring: get_sensor_history","domotz_inventory: get_custom_fields","domotz_alerts: bind_alert_profile","domotz_devices: get_device_history"]
    }
  },

  // ── DMZ ──
  { id:"dmz-vpn-gw-01", network:"dmz", name:"VPN Gateway", type:"VPN Gateway", vendor:"Cisco", model:"ASA 5525-X", status:"ok", ip:"172.16.0.10",
    metrics:{latency:18,packetLoss:0.2,uptime:99.9,cpu:37,mem:52,bandwidth:44},
    healed:{latency:18,packetLoss:0.2,uptime:99.9,cpu:37,mem:52,bandwidth:44},
    ports:[{name:"GigabitEthernet0/0",status:"up"},{name:"GigabitEthernet0/1",status:"up"}],
    healedPorts:[{name:"GigabitEthernet0/0",status:"up"},{name:"GigabitEthernet0/1",status:"up"}],
    snmp:[{name:"crasNumSessions",value:"142 sessions",status:"ok"},{name:"ikeTunnels",value:"8 active",status:"ok"}],
    healedSnmp:[{name:"crasNumSessions",value:"142 sessions",status:"ok"},{name:"ikeTunnels",value:"8 active",status:"ok"}],
    alerts:[], tags:["vpn","dmz","remote-access"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[17,17,18,18,18,18,18], healedRtdHistory:[18,18,18,18,18,18,18],
    sim:{severity:"P3-Low",reason:"142 sessions, 8 IKE tunnels active.",monReasoning:"142 concurrent sessions within capacity. IKE tunnels all active.",findings:"VPN Gateway handling 142 sessions with no issues.",rootCause:"No fault condition.",confidence:"high",diagReasoning:"All 8 tunnels active including HQ-Seattle and HQ-DMZ.",autoAct:"Incident logged.",summary:"P3-Low: VPN Gateway nominal.",nextSteps:"1) No action required.",respReasoning:"Clean status.",domotzTools:["domotz_agents: get_agent_vpn_status","domotz_monitoring: get_snmp_sensors"]}
  },
  { id:"dmz-waf-01", network:"dmz", name:"Web Application Firewall", type:"WAF", vendor:"Cloudflare", model:"Magic Firewall", status:"ok", ip:"172.16.0.2",
    metrics:{latency:15,packetLoss:0.1,uptime:100,cpu:29,mem:41,bandwidth:31},
    healed:{latency:15,packetLoss:0.1,uptime:100,cpu:29,mem:41,bandwidth:31},
    ports:[{name:"wan0",status:"up"},{name:"lan0",status:"up"}],
    healedPorts:[{name:"wan0",status:"up"},{name:"lan0",status:"up"}],
    snmp:[{name:"wafBlockedRequests",value:"8,441/hr",status:"ok"},{name:"wafPassedRequests",value:"24,100/hr",status:"ok"}],
    healedSnmp:[{name:"wafBlockedRequests",value:"8,441/hr",status:"ok"},{name:"wafPassedRequests",value:"24,100/hr",status:"ok"}],
    alerts:[], tags:["dmz","waf","security","cloud-edge"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[14,14,15,15,15,15,15], healedRtdHistory:[15,15,15,15,15,15,15],
    sim:{severity:"P3-Low",reason:"WAF blocking 8,441 requests/hr normally.",monReasoning:"Latency 15ms, near-zero packet loss, CPU 29%. Blocking within normal range.",findings:"Web Application Firewall operating normally.",rootCause:"No fault condition.",confidence:"high",diagReasoning:"wafBlockedRequests history within normal range. No config drift.",autoAct:"Incident logged.",summary:"P3-Low: WAF operating normally.",nextSteps:"1) No action required.",respReasoning:"Clean status.",domotzTools:["domotz_devices: get_device_status","domotz_monitoring: get_snmp_sensors"]}
  },
  { id:"dmz-lb-01", network:"dmz", name:"DMZ Load Balancer", type:"Load Balancer", vendor:"F5", model:"BIG-IP 2000s", status:"warning", ip:"172.16.0.1",
    metrics:{latency:41,packetLoss:1.8,uptime:99.7,cpu:68,mem:71,bandwidth:83},
    healed:{latency:22,packetLoss:0.2,uptime:99.9,cpu:41,mem:48,bandwidth:44},
    ports:[{name:"1.1 (external)",status:"up"},{name:"1.2 (internal)",status:"up"},{name:"mgmt",status:"up"}],
    healedPorts:[{name:"1.1 (external)",status:"up"},{name:"1.2 (internal)",status:"up"},{name:"mgmt",status:"up"}],
    snmp:[{name:"ltmPoolMemberCnt",value:"6/8 active",status:"warning"},{name:"ltmConnTotal",value:"42,100 conn",status:"warning"},{name:"sysStatClientBytesIn",value:"8.3 Gbps",status:"warning"}],
    healedSnmp:[{name:"ltmPoolMemberCnt",value:"8/8 active",status:"ok"},{name:"ltmConnTotal",value:"18,200 conn",status:"ok"},{name:"sysStatClientBytesIn",value:"3.1 Gbps",status:"ok"}],
    alerts:["Pool member count degraded (6/8)","Connection count elevated"],
    tags:["dmz","load-balancer","critical-infrastructure","cloud-edge"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:true,changedKeys:["ltmPool webfarm-prod members","ltmVirtualServer vs-https-443"]},
    rtdHistory:[24,27,31,35,38,40,41], healedRtdHistory:[41,35,28,24,22,22,22],
    sim:{
      severity:"P2-High",reason:"2/8 pool members offline, 42,100 connections (2.1x baseline), config drift on pool member list.",
      monReasoning:"ltmPoolMemberCnt 6/8 means 2 backend servers removed from pool. Connection count 42,100 is 2.1x baseline of 20,000. CPU 68% and bandwidth 83% confirm remaining members under pressure.",
      findings:"DMZ Load Balancer has 2/8 pool members offline, handling 42,100 active connections (2.1x baseline), with unexplained config drift on production pool member list.",
      rootCause:"Two backend app servers failed health checks and were removed from the production pool. Connection surge may be related to the upstream HQ firewall DDoS event.",
      confidence:"medium",
      diagReasoning:"domotz_configuration shows pool member drift — two IPs removed from ltmPool webfarm-prod at 03:22 UTC. Matches HQ firewall incident timing. Config drift may be automated response or unauthorized change.",
      autoAct:"NOC alerted. Pool member health check logs pulled. P2 profile activated. Config drift investigation ticket DMZ-441 opened.",
      summary:"P2-High: DMZ Load Balancer at 75% pool capacity with elevated connection load. Config drift requires investigation.",
      nextSteps:"1) Check app servers at 172.16.1.15 and .16. 2) Audit pool member config drift. 3) Enable connection rate limiting if count continues rising.",
      respReasoning:"Timing correlation with HQ firewall incident makes this potentially part of a coordinated attack. Flag in both NOC and security reports.",
      domotzTools:["domotz_monitoring: get_snmp_sensors","domotz_configuration: get_config_backup","domotz_alerts: bind_alert_profile","domotz_network: get_network_topology"]
    }
  },
  { id:"dmz-proxy-01", network:"dmz", name:"Egress Proxy", type:"Proxy", vendor:"Squid", model:"Squid 6.x (Linux)", status:"critical", ip:"172.16.1.5",
    metrics:{latency:280,packetLoss:14,uptime:96.2,cpu:97,mem:93,bandwidth:99},
    healed:{latency:28,packetLoss:0.2,uptime:99.1,cpu:44,mem:58,bandwidth:41},
    ports:[{name:"eth0",status:"up"},{name:"eth1",status:"down"}],
    healedPorts:[{name:"eth0",status:"up"},{name:"eth1",status:"up"}],
    snmp:[{name:"squidCacheHitRate",value:"12%",status:"critical"},{name:"squidCacheClients",value:"1,840",status:"critical"},{name:"squidMemUsage",value:"93%",status:"critical"}],
    healedSnmp:[{name:"squidCacheHitRate",value:"67%",status:"ok"},{name:"squidCacheClients",value:"284",status:"ok"},{name:"squidMemUsage",value:"58%",status:"ok"}],
    alerts:["Cache hit rate critically low","Memory exhaustion imminent","Client count overload","Interface eth1 down"],
    tags:["dmz","proxy","egress","critical-infrastructure"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-05 02:00",driftDetected:true,changedKeys:["cache_mem","maximum_object_size","acl BYPASS src"]},
    rtdHistory:[35,52,89,140,201,248,280], healedRtdHistory:[280,210,140,80,42,31,28],
    sim:{
      severity:"P1-Critical",reason:"CPU 97%, memory 93%, 1,840 clients, cache hit rate 12%, eth1 down.",
      monReasoning:"CPU at 97% — near-total saturation. Memory 93% — OOM kill imminent. Cache hit rate 12% vs 60%+ baseline means all 1,840 clients fetching from origin. Packet loss 14%. Config drift on 'acl BYPASS src' suspicious.",
      findings:"Egress Proxy critically overloaded: CPU 97%, memory 93% (OOM imminent), 1,840 clients, cache hit rate collapsed to 12%, eth1 down, suspicious config drift on ACL bypass rules.",
      rootCause:"A config change to 'acl BYPASS src' bypassed cache for a large source range, forcing all affected clients to fetch from origin — causing a 10x surge that exhausted CPU and memory.",
      confidence:"high",
      diagReasoning:"domotz_configuration drift on 'acl BYPASS src' is the smoking gun — unauthorized bypass ACL routes a wide source range directly to origin. domotz_monitoring client count history shows the surge started exactly when this config was applied at 03:45 UTC.",
      autoAct:"domotz_configuration rollback of 'acl BYPASS src' initiated. eth1 restart attempted. Memory limits tuned. Squid cache flush and rebuild started. P1 alert escalated.",
      summary:"P1-Critical: Egress Proxy overloaded due to unauthorized ACL bypass config change. Config rollback initiated. OOM risk until memory stabilizes.",
      nextSteps:"1) Confirm rollback applied and cache hit rate recovers above 40% within 10 min. 2) Identify who applied the ACL bypass. 3) Repair eth1. 4) Increase cache memory once load normalizes.",
      respReasoning:"Configuration management incident as much as performance incident. Unauthorized ACL change must trigger a change management audit.",
      domotzTools:["domotz_monitoring: get_snmp_sensors","domotz_monitoring: get_sensor_history","domotz_configuration: get_config_backup","domotz_configuration: rollback_config","domotz_alerts: bind_alert_profile","domotz_devices: get_device_history"]
    }
  },
];

// ── Theme ─────────────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg:"#070C13", surface:"rgba(255,255,255,0.02)", border:"rgba(255,255,255,0.05)",
    borderHi:"rgba(255,255,255,0.1)", text:"#94A3B8", textHi:"#F1F5F9", textDim:"#334155",
    textMid:"#64748B", barBg:"rgba(255,255,255,0.06)", inset:"rgba(255,255,255,0.012)",
    scrollThumb:"rgba(255,255,255,0.08)",
  },
  light: {
    bg:"#F1F5F9", surface:"rgba(0,0,0,0.02)", border:"rgba(0,0,0,0.08)",
    borderHi:"rgba(0,0,0,0.15)", text:"#475569", textHi:"#0F172A", textDim:"#94A3B8",
    textMid:"#64748B", barBg:"rgba(0,0,0,0.06)", inset:"rgba(0,0,0,0.03)",
    scrollThumb:"rgba(0,0,0,0.12)",
  },
};

const AC = {
  orchestrator:{accent:"#94A3B8",dim:"rgba(148,163,184,0.12)",label:"Orchestrator"},
  monitor:     {accent:"#38BDF8",dim:"rgba(56,189,248,0.1)",  label:"Monitor"},
  diagnostic:  {accent:"#A78BFA",dim:"rgba(167,139,250,0.1)",label:"Diagnostic"},
  response:    {accent:"#34D399",dim:"rgba(52,211,153,0.1)", label:"Response"},
};
const SEV_COLOR={"P1-Critical":"#F87171","P2-High":"#FBBF24","P3-Low":"#34D399"};
const SEV_DIM={"P1-Critical":"rgba(248,113,113,0.1)","P2-High":"rgba(251,191,36,0.1)","P3-Low":"rgba(52,211,153,0.08)"};
const STATUS_COLOR={critical:"#F87171",warning:"#FBBF24",ok:"#34D399"};
const STATUS_BG={critical:"rgba(248,113,113,0.1)",warning:"rgba(251,191,36,0.1)",ok:"rgba(52,211,153,0.1)"};
const NET_ACCENT={hq:"#38BDF8",sea:"#A78BFA",dmz:"#FB923C"};

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function mColor(key,val){
  if(key==="latency")    return val>200?"#F87171":val>50?"#FBBF24":"#34D399";
  if(key==="packetLoss") return val>10?"#F87171":val>2?"#FBBF24":"#34D399";
  if(key==="bandwidth")  return val>90?"#F87171":val>70?"#FBBF24":"#34D399";
  if(key==="cpu"||key==="mem") return val>85?"#F87171":val>65?"#FBBF24":"#34D399";
  return"#475569";
}

// ── Topology Map ──────────────────────────────────────────────────────────────
function TopologyMap({networkId, devices, resolvedIds, selectedId, onSelect, theme}){
  const edges = TOPOLOGY[networkId]||[];
  const pos = TOPO_POS[networkId]||{};
  const T = THEMES[theme];

  // compute grid dims
  const cols = Math.max(...Object.values(pos).map(p=>p[0]))+1;
  const rows = Math.max(...Object.values(pos).map(p=>p[1]))+1;
  const cellW = 140, cellH = 90, padX = 20, padY = 20;
  const W = cols*cellW + padX*2, H = rows*cellH + padY*2;

  function nodeXY(id){
    const p = pos[id]||[0,0];
    return [padX + p[0]*cellW + cellW/2, padY + p[1]*cellH + cellH/2];
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:"block",overflow:"visible"}}>
      {/* Edges */}
      {edges.map(([a,b],i)=>{
        const [ax,ay]=nodeXY(a), [bx,by]=nodeXY(b);
        const aDevice=devices.find(d=>d.id===a);
        const bDevice=devices.find(d=>d.id===b);
        const aResolved=resolvedIds.has(a), bResolved=resolvedIds.has(b);
        const aStatus=aResolved?"ok":(aDevice?.status||"ok");
        const bStatus=bResolved?"ok":(bDevice?.status||"ok");
        const edgeStatus=aStatus==="critical"||bStatus==="critical"?"critical":aStatus==="warning"||bStatus==="warning"?"warning":"ok";
        const edgeColor=STATUS_COLOR[edgeStatus];
        const isDashed=edgeStatus==="critical";
        return (
          <g key={i}>
            <line x1={ax} y1={ay} x2={bx} y2={by}
              stroke={edgeColor} strokeWidth={edgeStatus==="ok"?1.5:2}
              strokeOpacity={edgeStatus==="ok"?0.3:0.7}
              strokeDasharray={isDashed?"6,3":undefined}/>
            {/* Arrow head */}
            {(()=>{
              const angle=Math.atan2(by-ay,bx-ax);
              const arrowLen=10, nodeR=28;
              const ex=bx-Math.cos(angle)*nodeR, ey=by-Math.sin(angle)*nodeR;
              const p1x=ex-arrowLen*Math.cos(angle-0.4), p1y=ey-arrowLen*Math.sin(angle-0.4);
              const p2x=ex-arrowLen*Math.cos(angle+0.4), p2y=ey-arrowLen*Math.sin(angle+0.4);
              return <polygon points={`${ex},${ey} ${p1x},${p1y} ${p2x},${p2y}`} fill={edgeColor} opacity={edgeStatus==="ok"?0.3:0.7}/>;
            })()}
          </g>
        );
      })}

      {/* Nodes */}
      {devices.map(d=>{
        if(!pos[d.id])return null;
        const [x,y]=nodeXY(d.id);
        const isResolved=resolvedIds.has(d.id);
        const status=isResolved?"ok":d.status;
        const sc=STATUS_COLOR[status];
        const isSel=selectedId===d.id;
        const shortName=d.name.replace(/HQ |Seattle |DMZ |Floor /g,"").replace(/Distribution/g,"Dist").replace(/Access/g,"Access");
        return (
          <g key={d.id} onClick={()=>onSelect(d)} style={{cursor:"pointer"}}>
            {/* Selection ring */}
            {isSel&&<circle cx={x} cy={y} r={32} fill="none" stroke={NET_ACCENT[networkId]} strokeWidth={2} opacity={0.7}/>}
            {/* Node circle */}
            <circle cx={x} cy={y} r={26}
              fill={theme==="dark"?"#0F1A24":"#E2E8F0"}
              stroke={sc} strokeWidth={isSel?2.5:1.5}
              opacity={1}/>
            {/* Glow for critical/warning */}
            {status!=="ok"&&<circle cx={x} cy={y} r={26} fill="none" stroke={sc} strokeWidth={8} opacity={0.12}/>}
            {/* Status dot */}
            <circle cx={x+18} cy={y-18} r={5} fill={sc}/>
            {/* Resolved checkmark overlay */}
            {isResolved&&(
              <g>
                <circle cx={x+18} cy={y-18} r={6} fill="#34D399"/>
                <text x={x+18} y={y-14} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">✓</text>
              </g>
            )}
            {/* Device type icon (text) */}
            <text x={x} y={y+1} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill={sc} fontWeight={700} fontFamily="'JetBrains Mono',monospace">
              {d.type==="Router"?"RTR":d.type==="Switch"?"SW":d.type==="Firewall"?"FW":d.type==="Access Point"?"AP":d.type==="UPS"?"UPS":d.type==="NAS"?"NAS":d.type==="Load Balancer"?"LB":d.type==="WAF"?"WAF":d.type==="VPN Gateway"?"VPN":d.type==="Proxy"?"PX":d.type==="IP Camera"?"CAM":d.type==="Printer"?"PRT":"DEV"}
            </text>
            {/* Label */}
            <text x={x} y={y+38} textAnchor="middle" fontSize={8.5} fill={theme==="dark"?"#64748B":"#475569"} fontFamily="system-ui">
              {shortName.length>14?shortName.slice(0,13)+"…":shortName}
            </text>
            <text x={x} y={y+50} textAnchor="middle" fontSize={7} fill={theme==="dark"?"#334155":"#94A3B8"} fontFamily="monospace">{d.ip}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Badge({agent}){
  const m=AC[agent?.toLowerCase()]||AC.orchestrator;
  return <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",padding:"2px 7px",borderRadius:3,background:m.dim,color:m.accent,border:`1px solid ${m.accent}33`,fontFamily:"'JetBrains Mono',monospace"}}>{m.label}</span>;
}
function Bar({val,max,color,theme}){
  const T=THEMES[theme];
  return <div style={{height:3,background:T.barBg,borderRadius:2,overflow:"hidden",marginTop:5}}><div style={{height:"100%",width:`${Math.min(100,(val/max)*100)}%`,background:color,borderRadius:2,transition:"width 0.8s ease"}}/></div>;
}
function Spinner(){
  return <span style={{width:10,height:10,border:"1.5px solid rgba(56,189,248,0.2)",borderTopColor:"#38BDF8",borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite",flexShrink:0}}/>;
}
function TypedText({text,color,onDone}){
  const [shown,setShown]=useState("");
  const iRef=useRef(0);
  useEffect(()=>{
    iRef.current=0;setShown("");
    const iv=setInterval(()=>{
      if(iRef.current>=text.length){clearInterval(iv);onDone&&onDone();return;}
      setShown(text.slice(0,++iRef.current));
    },11);
    return()=>clearInterval(iv);
  },[text]);
  return <div style={{fontSize:11,color,lineHeight:1.75,fontFamily:"'JetBrains Mono',monospace",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{shown}{shown.length<text.length&&<span style={{display:"inline-block",width:2,height:11,background:color,marginLeft:1,animation:"blink 0.8s step-end infinite",verticalAlign:"text-bottom"}}/>}</div>;
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App(){
  const [theme,setTheme]=useState("dark");
  const [activeNetwork,setActiveNetwork]=useState("hq");
  const [selected,setSelected]=useState(null);
  const [running,setRunning]=useState(false);
  const [logs,setLogs]=useState([]);
  const [activeStep,setActiveStep]=useState(-1);
  const [complete,setComplete]=useState(false);
  const [statusMsg,setStatusMsg]=useState("");
  const [typingEntry,setTypingEntry]=useState(null);
  const [detailTab,setDetailTab]=useState("metrics");
  const [mainTab,setMainTab]=useState("devices"); // "devices" | "topology"
  const [resolvedIds,setResolvedIds]=useState(new Set());
  const [healingId,setHealingId]=useState(null); // device being healed for animation
  const startRef=useRef(null);
  const bottomRef=useRef(null);
  const T=THEMES[theme];

  const networkDevices=DEVICES.filter(d=>d.network===activeNetwork);
  const net=NETWORKS.find(n=>n.id===activeNetwork);

  useEffect(()=>{setSelected(null);setLogs([]);setComplete(false);setActiveStep(-1);setResolvedIds(new Set());setHealingId(null);},[activeNetwork]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[logs,typingEntry]);

  const t=()=>((Date.now()-startRef.current)/1000).toFixed(1)+"s";

  function addLog(agent,tool,html,reasoning=""){
    setLogs(prev=>[...prev,{agent:agent.toLowerCase(),tool,html,reasoning,time:t()}]);
  }
  function typeReasoning(text){
    return new Promise(resolve=>setTypingEntry({text,resolve}));
  }
  function onTypingDone(){
    if(typingEntry){typingEntry.resolve();setTypingEntry(null);}
  }

  // Get effective device data (healed or original)
  function getDeviceData(d){
    if(resolvedIds.has(d.id)){
      return{
        ...d,
        status:"ok",
        metrics:d.healed,
        ports:d.healedPorts,
        snmp:d.healedSnmp,
        alerts:[],
        rtdHistory:d.healedRtdHistory,
        configBackup:{...d.configBackup,driftDetected:false,changedKeys:[]},
      };
    }
    return d;
  }

  async function run(){
    if(running||!selected)return;
    setRunning(true);setLogs([]);setActiveStep(0);setComplete(false);setStatusMsg("");setTypingEntry(null);setHealingId(null);
    startRef.current=Date.now();
    const d=selected,s=d.sim;

    setActiveStep(0);setStatusMsg("Orchestrator initializing swarm…");
    addLog("orchestrator",null,`Incident detected on <strong>${d.name}</strong> [${net.name} · ${net.collector}]. Initializing agent swarm.`);
    await sleep(600);

    setActiveStep(1);setStatusMsg("Monitor scanning network…");
    addLog("monitor","domotz_agents: get_agent_status()",`Collector <strong>${net.collector}</strong> ${net.collectorStatus} · ${net.scanPolicy} · ${net.ipRange} · ${networkDevices.length} registered devices.`);
    await sleep(600);
    addLog("monitor",`domotz_devices: get_device_status("${d.id}")`,
      `<strong>${d.name}</strong> · ${d.vendor} ${d.model} · ${d.ip}<br/>`+
      `Latency <span style="color:${mColor("latency",d.metrics.latency)};font-weight:600">${d.metrics.latency}ms</span> · `+
      `Loss <span style="color:${mColor("packetLoss",d.metrics.packetLoss)};font-weight:600">${d.metrics.packetLoss}%</span> · `+
      `CPU <span style="color:${mColor("cpu",d.metrics.cpu)};font-weight:600">${d.metrics.cpu}%</span> · `+
      `Mem <span style="color:${mColor("mem",d.metrics.mem)};font-weight:600">${d.metrics.mem}%</span> · `+
      `BW <span style="color:${mColor("bandwidth",d.metrics.bandwidth)};font-weight:600">${d.metrics.bandwidth}%</span>`);
    await sleep(500);
    addLog("monitor",`domotz_monitoring: get_snmp_sensors("${d.id}")`,
      d.snmp.map(s=>`<span style="color:${s.status==="critical"?"#F87171":s.status==="warning"?"#FBBF24":"#34D399"}">${s.name}: ${s.value}</span>`).join(" · "));
    await sleep(500);
    addLog("monitor",`domotz_monitoring: get_sensor_history("${d.id}")`,
      `RTD trend: ${d.rtdHistory.join("ms → ")}ms · `+
      (d.alerts.length>0?`Active alerts: <span style="color:#F87171">${d.alerts.join(", ")}</span>`:`<span style="color:#34D399">No active alerts</span>`));
    await sleep(400);

    setStatusMsg("Monitor agent reasoning…");
    await typeReasoning(s.monReasoning);
    await sleep(300);

    const sc=SEV_COLOR[s.severity]||"#94A3B8";
    addLog("monitor","domotz_alerts: flag_incident()",`<span style="color:${sc};font-weight:700">${s.severity}</span> — ${s.reason}`,s.monReasoning);
    await sleep(400);

    setActiveStep(0);setStatusMsg("Writing to shared context store…");
    addLog("orchestrator",null,`<strong>${s.severity}</strong> written to shared context store. Guardrail: diagnosis required before remediation. Routing to Diagnostic agent.`);
    await sleep(600);

    setActiveStep(2);setStatusMsg("Diagnostic agent mapping topology…");
    addLog("diagnostic",`domotz_network: get_network_topology("${d.id}")`,`Mapping upstream/downstream dependencies in ${net.name}. Blast radius analysis initiated.`);
    await sleep(700);
    addLog("diagnostic",`domotz_configuration: get_config_backup("${d.id}")`,
      d.configBackup.driftDetected
        ?`<span style="color:#FBBF24">Config drift detected.</span> Changed keys: <span style="color:#F87171">${d.configBackup.changedKeys.join(", ")}</span> · Last backup: ${d.configBackup.lastBackup}`
        :`<span style="color:#34D399">No config drift.</span> Last backup: ${d.configBackup.lastBackup} · Baseline match confirmed.`);
    await sleep(700);
    addLog("diagnostic",`domotz_devices: get_device_history("${d.id}")`,`24hr correlated event log retrieved. Uptime: ${d.metrics.uptime}%`);
    await sleep(500);
    addLog("diagnostic",`domotz_inventory: get_custom_fields("${d.id}")`,`Tags: ${d.tags.map(t=>`<span style="color:#A78BFA">${t}</span>`).join(" · ")} · PoE: ${d.poeEnabled?"enabled":"disabled"} · Power: ${d.powerState}`);
    await sleep(400);
    if(s.domotzTools.some(t=>t.includes("domotz_power"))){
      addLog("diagnostic",`domotz_power: get_power_status("${d.id}")`,`Power state: ${d.powerState}. PoE budget reviewed.`);
      await sleep(400);
    }

    setStatusMsg("Diagnostic agent reasoning…");
    await typeReasoning(s.diagReasoning);
    await sleep(300);

    addLog("diagnostic","domotz_monitoring: submit_diagnosis()",
      `<strong>Findings:</strong> ${s.findings}<br/><strong>Root cause:</strong> ${s.rootCause}<br/><strong>Confidence:</strong> ${s.confidence}`,
      s.diagReasoning);
    await sleep(400);

    setActiveStep(0);setStatusMsg("Guardrail check passing…");
    addLog("orchestrator",null,`Diagnosis confirmed (${s.confidence} confidence). Context store updated. Guardrail satisfied. Routing to Response agent.`);
    await sleep(600);

    setActiveStep(3);setStatusMsg("Response agent reading context store…");
    addLog("response","domotz_monitoring: get_diagnosis()","Retrieved diagnostic output from shared context store. Guardrail check: PASSED.");
    await sleep(400);
    addLog("response",`domotz_agents: apply_remediation("${d.id}")`,s.autoAct);
    await sleep(600);
    addLog("response",`domotz_alerts: bind_alert_profile("${d.id}", "${s.severity}")`,`Alert profile <strong>${s.severity}</strong> bound. NOC dashboard updated.`);
    await sleep(400);

    setStatusMsg("Response agent writing incident report…");
    await typeReasoning(s.respReasoning);
    await sleep(300);

    addLog("response","domotz_agents: create_incident_report()",
      `<strong>Summary:</strong> ${s.summary}<br/><strong>Actions taken:</strong> ${s.autoAct}<br/><strong>Next steps:</strong> ${s.nextSteps}<br/><span style="color:#A78BFA;font-size:10px">Domotz MCP: ${s.domotzTools.join(" · ")}</span>`,
      s.respReasoning);
    await sleep(600);

    setActiveStep(-1);setComplete(true);setStatusMsg("");
    addLog("orchestrator",null,`<span style="color:#34D399;font-weight:700">✓ Workflow complete</span> in ${t()}. Report filed. All agents returned to standby.`);
    setRunning(false);

    // Post-remediation: animate heal after a short pause
    await sleep(1200);
    setHealingId(d.id);
    addLog("orchestrator","domotz_monitoring: poll_device_status()",`<span style="color:#38BDF8">Post-remediation verification scan initiated on ${d.name}…</span>`);
    await sleep(1800);
    setResolvedIds(prev=>new Set([...prev,d.id]));
    setHealingId(null);
    addLog("orchestrator",null,`<span style="color:#34D399;font-weight:700">✓ Device healed.</span> ${d.name} metrics returned to baseline. Status updated to <span style="color:#34D399;font-weight:700">OK</span>. Topology map refreshed.`);
  }

  const pipeline=[
    {step:0,key:"orchestrator",label:"Orchestrator"},
    {step:1,key:"monitor",label:"Monitor"},
    {step:2,key:"diagnostic",label:"Diagnostic"},
    {step:3,key:"response",label:"Response"},
  ];

  const networkCounts=nid=>({
    total:DEVICES.filter(d=>d.network===nid).length,
    critical:DEVICES.filter(d=>d.network===nid&&d.status==="critical"&&!resolvedIds.has(d.id)).length,
    warning:DEVICES.filter(d=>d.network===nid&&d.status==="warning"&&!resolvedIds.has(d.id)).length,
  });

  const displayDevice = selected ? getDeviceData(selected) : null;
  const isHealing = healingId === selected?.id;
  const isResolved = selected ? resolvedIds.has(selected.id) : false;

  const cardBg=`${T.surface}`;
  const cardBorder=`1px solid ${T.border}`;

  return (
    <div style={{background:T.bg,minHeight:"100vh",color:T.text,fontFamily:"'IBM Plex Sans',system-ui,sans-serif",padding:"16px",maxWidth:760,margin:"0 auto",transition:"background 0.3s,color 0.3s"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;700&display=swap');
        @keyframes spin   {to{transform:rotate(360deg)}}
        @keyframes pulse  {0%,100%{opacity:1}50%{opacity:0.25}}
        @keyframes blink  {0%,100%{opacity:1}50%{opacity:0}}
        @keyframes fadeUp {from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes healPulse {0%,100%{opacity:1}50%{opacity:0.4}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:${T.scrollThumb};border-radius:2px}
        button{font-family:inherit;cursor:pointer}
      `}</style>

      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
            <span style={{width:7,height:7,borderRadius:"50%",display:"inline-block",flexShrink:0,
              background:running?"#38BDF8":complete?"#34D399":"#334155",
              boxShadow:running?"0 0 10px #38BDF8":complete?"0 0 8px #34D399":"none",
              animation:running?"pulse 1.6s ease infinite":"none",transition:"all 0.4s"}}/>
            <span style={{fontSize:16,fontWeight:600,color:T.textHi,letterSpacing:"-0.02em"}}>NetOps Agent Swarm</span>
            <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",padding:"2px 7px",borderRadius:3,background:"rgba(56,189,248,0.08)",color:"#38BDF8",border:"1px solid rgba(56,189,248,0.18)"}}>demo</span>
          </div>
          <div style={{fontSize:11,color:T.textDim}}>Monitor → Diagnostic → Response · Domotz MCP · {DEVICES.length} devices · {NETWORKS.length} networks</div>
        </div>
        {/* Theme toggle */}
        <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} style={{background:cardBg,border:cardBorder,borderRadius:7,padding:"6px 12px",fontSize:11,color:T.textMid,display:"flex",alignItems:"center",gap:6,transition:"all 0.2s",flexShrink:0}}>
          {theme==="dark"?"☀ Light":"☾ Dark"}
        </button>
      </div>

      {/* Pipeline bar */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:1,marginBottom:12,border:`1px solid ${T.border}`,borderRadius:7,overflow:"hidden"}}>
        {pipeline.map((n,i)=>{
          const c=AC[n.key],isA=activeStep===n.step,isDone=complete||(activeStep>n.step&&activeStep!==-1);
          return <div key={n.key} style={{padding:"8px 4px",textAlign:"center",background:isA?c.dim:isDone?"rgba(52,211,153,0.04)":"transparent",borderRight:i<3?`1px solid ${T.border}`:"none",boxShadow:isA?`inset 0 -2px 0 ${c.accent}`:"none",transition:"all 0.4s ease"}}>
            <div style={{fontSize:10,fontWeight:600,color:isA?T.textHi:isDone?"#34D399":T.textDim}}>{n.label}</div>
            <div style={{fontSize:8,color:isA?c.accent:isDone?"#166834":T.textDim,marginTop:1}}>{isA?"● active":isDone?"✓":"—"}</div>
          </div>;
        })}
      </div>

      {/* Status / typing */}
      {running&&(statusMsg||typingEntry)&&(
        <div style={{padding:"10px",background:"rgba(56,189,248,0.04)",border:"1px solid rgba(56,189,248,0.1)",borderRadius:6,marginBottom:10}}>
          {typingEntry
            ?<div>
               <div style={{fontSize:9,color:"#38BDF8",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:5,display:"flex",alignItems:"center",gap:6}}><Spinner/>Agent reasoning</div>
               <TypedText text={typingEntry.text} color={T.textMid} onDone={onTypingDone}/>
             </div>
            :<div style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:"#38BDF8"}}><Spinner/>{statusMsg}</div>
          }
        </div>
      )}

      {/* Network selector */}
      <div style={{marginBottom:10}}>
        <div style={{fontSize:9,fontWeight:700,color:T.textDim,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Networks — {NETWORKS.length} collectors</div>
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          {NETWORKS.map(n=>{
            const counts=networkCounts(n.id),isActive=activeNetwork===n.id,ac=NET_ACCENT[n.id];
            return <div key={n.id} onClick={()=>!running&&setActiveNetwork(n.id)}
              style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:`1px solid ${isActive?ac+"55":T.border}`,borderRadius:7,cursor:running?"default":"pointer",background:isActive?`${ac}09`:cardBg,transition:"all 0.15s"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:n.collectorStatus==="online"?"#34D399":"#FBBF24",boxShadow:`0 0 6px ${n.collectorStatus==="online"?"#34D399":"#FBBF24"}77`,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:600,color:isActive?T.textHi:T.textMid}}>{n.name}</div>
                <div style={{fontSize:9,color:T.textDim,marginTop:1}}>{n.location} · {n.collector} · {n.ipRange}</div>
              </div>
              <div style={{display:"flex",gap:5,alignItems:"center"}}>
                {counts.critical>0&&<span style={{fontSize:8,fontWeight:700,padding:"1px 6px",borderRadius:99,background:"rgba(248,113,113,0.12)",color:"#F87171"}}>{counts.critical} P1</span>}
                {counts.warning>0&&<span style={{fontSize:8,fontWeight:700,padding:"1px 6px",borderRadius:99,background:"rgba(251,191,36,0.12)",color:"#FBBF24"}}>{counts.warning} P2</span>}
                <span style={{fontSize:9,color:T.textDim}}>{counts.total} devices</span>
              </div>
            </div>;
          })}
        </div>
      </div>

      {/* Main view tabs */}
      <div style={{display:"flex",border:`1px solid ${T.border}`,borderRadius:7,overflow:"hidden",marginBottom:8}}>
        {[["devices","Devices"],["topology","Topology Map"]].map(([v,label],i)=>(
          <button key={v} onClick={()=>setMainTab(v)} style={{flex:1,padding:"8px 4px",fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",border:"none",background:mainTab===v?"rgba(56,189,248,0.06)":"transparent",color:mainTab===v?"#38BDF8":T.textDim,borderBottom:mainTab===v?"2px solid #38BDF8":"2px solid transparent",borderRight:i===0?`1px solid ${T.border}`:"none",transition:"all 0.15s"}}>{label}</button>
        ))}
      </div>

      {/* Devices view */}
      {mainTab==="devices"&&(
        <div style={{background:cardBg,border:cardBorder,borderRadius:8,padding:"10px",marginBottom:8}}>
          <div style={{fontSize:9,fontWeight:700,color:T.textDim,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>{net.name} — {networkDevices.length} devices</div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {networkDevices.map(d=>{
              const dEff=getDeviceData(d);
              const sel=selected?.id===d.id,sev=d.sim.severity;
              const isHeal=healingId===d.id, isRes=resolvedIds.has(d.id);
              return <div key={d.id} onClick={()=>!running&&setSelected(sel?null:d)}
                style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",border:`1px solid ${sel?NET_ACCENT[activeNetwork]+"55":T.border}`,borderRadius:6,cursor:running?"default":"pointer",background:sel?`${NET_ACCENT[activeNetwork]}08`:T.surface,transition:"all 0.15s",animation:isHeal?"healPulse 1s ease infinite":"none"}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:STATUS_COLOR[dEff.status],boxShadow:`0 0 5px ${STATUS_COLOR[dEff.status]}66`,display:"inline-block",flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:500,color:sel?T.textHi:T.textMid,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.name}{isRes&&<span style={{marginLeft:6,fontSize:9,color:"#34D399",fontWeight:700}}>✓ resolved</span>}</div>
                  <div style={{fontSize:9,color:T.textDim,marginTop:1}}>{d.vendor} {d.model} · {d.ip}</div>
                </div>
                <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                  {isRes?<span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:99,background:"rgba(52,211,153,0.1)",color:"#34D399"}}>P3-Low</span>:<span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:99,background:SEV_DIM[sev],color:SEV_COLOR[sev]}}>{sev}</span>}
                  <span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:99,background:STATUS_BG[dEff.status],color:STATUS_COLOR[dEff.status]}}>{dEff.status}</span>
                </div>
              </div>;
            })}
          </div>
        </div>
      )}

      {/* Topology view */}
      {mainTab==="topology"&&(
        <div style={{background:cardBg,border:cardBorder,borderRadius:8,padding:"12px",marginBottom:8,overflowX:"auto"}}>
          <div style={{fontSize:9,fontWeight:700,color:T.textDim,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>{net.name} — network topology · tap node to select</div>
          <TopologyMap
            networkId={activeNetwork}
            devices={networkDevices}
            resolvedIds={resolvedIds}
            selectedId={selected?.id}
            onSelect={d=>!running&&setSelected(selected?.id===d.id?null:d)}
            theme={theme}
          />
          {/* Legend */}
          <div style={{display:"flex",gap:12,marginTop:8,flexWrap:"wrap"}}>
            {[["#F87171","Critical / P1"],["#FBBF24","Warning / P2"],["#34D399","OK / Resolved"]].map(([c,l])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:c,display:"inline-block"}}/>
                <span style={{fontSize:9,color:T.textDim}}>{l}</span>
              </div>
            ))}
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <svg width={20} height={8}><line x1={0} y1={4} x2={20} y2={4} stroke="#F87171" strokeWidth={2} strokeDasharray="4,2"/></svg>
              <span style={{fontSize:9,color:T.textDim}}>Degraded link</span>
            </div>
          </div>
        </div>
      )}

      {/* Device detail panel */}
      {selected&&displayDevice&&(
        <div style={{background:cardBg,border:`1px solid ${NET_ACCENT[activeNetwork]}22`,borderRadius:8,marginBottom:8,overflow:"hidden",animation:"fadeUp 0.2s ease"}}>
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,fontWeight:600,color:T.textHi}}>{selected.name}</span>
                {isResolved&&<span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:99,background:"rgba(52,211,153,0.12)",color:"#34D399",border:"1px solid rgba(52,211,153,0.25)"}}>✓ Remediated — metrics healed</span>}
                {isHealing&&<span style={{fontSize:9,color:"#38BDF8",animation:"healPulse 1s ease infinite"}}>⟳ Verifying remediation…</span>}
              </div>
              <div style={{fontSize:9,color:T.textDim,marginTop:1}}>{selected.vendor} {selected.model} · {selected.ip} · {selected.type}</div>
            </div>
            <button onClick={()=>setSelected(null)} style={{background:"none",border:"none",color:T.textMid,fontSize:13,padding:0,marginLeft:8}}>✕</button>
          </div>

          {/* Tabs */}
          <div style={{display:"flex",borderBottom:`1px solid ${T.border}`}}>
            {["metrics","snmp","ports","inventory"].map(tab=>(
              <button key={tab} onClick={()=>setDetailTab(tab)} style={{flex:1,padding:"7px 4px",fontSize:9,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",border:"none",background:detailTab===tab?T.surface:"transparent",color:detailTab===tab?T.textHi:T.textDim,borderBottom:detailTab===tab?`2px solid ${NET_ACCENT[activeNetwork]}`:"2px solid transparent",transition:"all 0.15s"}}>{tab}</button>
            ))}
          </div>

          <div style={{padding:"10px 12px"}}>
            {detailTab==="metrics"&&(
              <div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                  {[{label:"Latency",key:"latency",val:displayDevice.metrics.latency,unit:"ms",max:400},
                    {label:"Packet Loss",key:"packetLoss",val:displayDevice.metrics.packetLoss,unit:"%",max:30},
                    {label:"CPU",key:"cpu",val:displayDevice.metrics.cpu,unit:"%",max:100},
                    {label:"Memory",key:"mem",val:displayDevice.metrics.mem,unit:"%",max:100},
                    {label:"Bandwidth",key:"bandwidth",val:displayDevice.metrics.bandwidth,unit:"%",max:100},
                    {label:"Uptime",key:"uptime",val:displayDevice.metrics.uptime,unit:"%",max:100},
                  ].map(m=>{
                    const c=m.key==="uptime"?(m.val>99.5?"#34D399":m.val>99?"#FBBF24":"#F87171"):mColor(m.key,m.val);
                    return <div key={m.key} style={{background:T.inset,borderRadius:6,padding:"8px 10px",border:`1px solid ${T.border}`}}>
                      <div style={{fontSize:8,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.08em"}}>{m.label}</div>
                      <div style={{fontSize:18,fontWeight:600,color:c,letterSpacing:"-0.02em",transition:"all 0.8s ease"}}>{m.val}<span style={{fontSize:9,fontWeight:400,color:T.textMid,marginLeft:1}}>{m.unit}</span></div>
                      <Bar val={m.val} max={m.max} color={c} theme={theme}/>
                    </div>;
                  })}
                </div>
                {/* RTD Sparkline */}
                <div style={{background:T.inset,borderRadius:6,padding:"8px 10px",border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:8,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>{isResolved?"Post-remediation RTD trend":"RTD History (7 samples)"}</div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:3,height:28}}>
                    {displayDevice.rtdHistory.map((v,i)=>{
                      const maxV=Math.max(...displayDevice.rtdHistory);
                      const hPct=Math.max(3,(v/maxV)*28);
                      const c=mColor("latency",v);
                      return <div key={i} style={{flex:1,height:hPct,background:c,borderRadius:2,opacity:i===displayDevice.rtdHistory.length-1?1:0.35+(i/displayDevice.rtdHistory.length)*0.5,transition:"all 0.8s ease"}}/>;
                    })}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:T.textDim,marginTop:3}}>
                    <span>{displayDevice.rtdHistory[0]}ms</span><span>now: {displayDevice.rtdHistory[displayDevice.rtdHistory.length-1]}ms</span>
                  </div>
                </div>
              </div>
            )}

            {detailTab==="snmp"&&(
              <div>
                <div style={{border:`1px solid ${T.border}`,borderRadius:6,overflow:"hidden",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:8,fontWeight:700,color:T.textDim,padding:"4px 8px",background:T.inset,letterSpacing:"0.08em",textTransform:"uppercase"}}>
                    <span>SNMP OID / Sensor</span><span>Value</span>
                  </div>
                  {displayDevice.snmp.map((s,i)=>{
                    const c=s.status==="critical"?"#F87171":s.status==="warning"?"#FBBF24":"#34D399";
                    return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",borderTop:`1px solid ${T.border}`,fontSize:10}}>
                      <span style={{fontFamily:"monospace",color:T.textMid}}>{s.name}</span>
                      <span style={{color:c,fontWeight:600,fontSize:9,transition:"color 0.5s"}}>{s.value}</span>
                    </div>;
                  })}
                </div>
                {displayDevice.alerts.length>0
                  ?<div style={{background:"rgba(248,113,113,0.05)",border:"1px solid rgba(248,113,113,0.15)",borderRadius:6,padding:"8px 10px"}}>
                     <div style={{fontSize:8,color:"#F87171",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>Active alerts</div>
                     {displayDevice.alerts.map((a,i)=><div key={i} style={{fontSize:10,color:"#F87171",marginBottom:2}}>⚠ {a}</div>)}
                   </div>
                  :<div style={{fontSize:11,color:"#34D399",textAlign:"center",padding:"8px 0"}}>✓ No active alerts{isResolved?" — all alerts cleared after remediation":""}</div>
                }
              </div>
            )}

            {detailTab==="ports"&&(
              <div style={{border:`1px solid ${T.border}`,borderRadius:6,overflow:"hidden"}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:8,fontWeight:700,color:T.textDim,padding:"4px 8px",background:T.inset,letterSpacing:"0.08em",textTransform:"uppercase"}}>
                  <span>Interface</span><span>Status</span>
                </div>
                {displayDevice.ports.map(p=>(
                  <div key={p.name} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"5px 8px",borderTop:`1px solid ${T.border}`}}>
                    <span style={{fontFamily:"monospace",color:T.textMid}}>{p.name}</span>
                    <span style={{fontWeight:600,fontSize:9,color:p.status==="up"?"#34D399":"#F87171",transition:"color 0.5s"}}>{p.status==="up"?"▲ up":"▼ down"}</span>
                  </div>
                ))}
              </div>
            )}

            {detailTab==="inventory"&&(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <div style={{background:T.inset,borderRadius:6,padding:"8px 10px",border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:8,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>domotz_inventory tags</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {selected.tags.map(tag=><span key={tag} style={{fontSize:9,padding:"2px 7px",borderRadius:99,background:"rgba(167,139,250,0.1)",color:"#A78BFA",border:"1px solid rgba(167,139,250,0.2)"}}>{tag}</span>)}
                  </div>
                </div>
                <div style={{background:T.inset,borderRadius:6,padding:"8px 10px",border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:8,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>domotz_configuration backup</div>
                  <div style={{fontSize:10,color:T.textMid}}>Last backup: {selected.configBackup.lastBackup}</div>
                  <div style={{fontSize:10,color:displayDevice.configBackup.driftDetected?"#F87171":"#34D399",marginTop:2,transition:"color 0.5s"}}>
                    {displayDevice.configBackup.driftDetected?`⚠ Drift: ${displayDevice.configBackup.changedKeys.join(", ")}`:"✓ No drift — baseline match"}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  {[["domotz_power state",selected.powerState,selected.powerState==="on"?"#34D399":"#F87171"],["PoE",selected.poeEnabled?"enabled":"disabled",selected.poeEnabled?"#38BDF8":T.textDim]].map(([label,val,color])=>(
                    <div key={label} style={{background:T.inset,borderRadius:6,padding:"8px 10px",border:`1px solid ${T.border}`}}>
                      <div style={{fontSize:8,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</div>
                      <div style={{fontSize:12,fontWeight:600,color,marginTop:3}}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Run button */}
      <button disabled={!selected||running} onClick={run} style={{width:"100%",padding:"11px",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",border:`1px solid ${running?"rgba(56,189,248,0.3)":!selected?T.border:T.borderHi}`,borderRadius:7,background:running?"rgba(56,189,248,0.06)":T.surface,color:running?"#38BDF8":!selected?T.textDim:T.textMid,cursor:!selected||running?"not-allowed":"pointer",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.2s"}}>
        {running&&<Spinner/>}
        {running?"Swarm executing…":logs.length>0?"↺  Run again":selected?`▶  Run swarm on ${selected.name}`:"▶  Select a device"}
      </button>

      {/* Execution log */}
      {logs.length>0&&(
        <div style={{background:cardBg,border:cardBorder,borderRadius:8,overflow:"hidden"}}>
          <div style={{padding:"8px 10px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:9,fontWeight:700,color:T.textDim,letterSpacing:"0.1em",textTransform:"uppercase"}}>Execution log</span>
            {!running&&<span style={{fontSize:9,color:T.textDim,marginLeft:"auto"}}>{logs.length} events · {logs[logs.length-1]?.time}</span>}
          </div>
          <div style={{padding:"8px 10px"}}>
            {logs.map((log,i)=>{
              const c=AC[log.agent]?.accent||"#94A3B8";
              return <div key={i} style={{padding:"8px 0",borderBottom:i<logs.length-1?`1px solid ${T.border}`:"none",animation:"fadeUp 0.2s ease"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                  <Badge agent={log.agent}/>
                  {log.tool&&<span style={{fontSize:8,fontFamily:"monospace",color:T.textDim,background:T.inset,padding:"1px 6px",borderRadius:3,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{log.tool}</span>}
                  <span style={{fontSize:9,color:T.textDim,marginLeft:"auto"}}>{log.time}</span>
                </div>
                <div style={{fontSize:12,color:T.textMid,lineHeight:1.7}} dangerouslySetInnerHTML={{__html:log.html}}/>
                {log.reasoning&&<div style={{marginTop:6,padding:"6px 8px",background:T.inset,borderLeft:`2px solid ${c}33`}}>
                  <div style={{fontSize:8,color:T.textDim,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:2}}>Agent reasoning</div>
                  <div style={{fontSize:10,color:T.textDim,lineHeight:1.7,fontFamily:"'JetBrains Mono',monospace",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{log.reasoning}</div>
                </div>}
              </div>;
            })}
            <div ref={bottomRef}/>
          </div>
        </div>
      )}
    </div>
  );
}
