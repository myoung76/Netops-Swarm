import { useState, useRef, useEffect } from "react";

const NETWORKS = [
  { id: "hq",  name: "HQ Campus",        location: "San Francisco, CA", collector: "col-hq-01",  collectorStatus: "online",   scanPolicy: "Every 5 min", ipRange: "10.10.0.0/16",   deviceCount: 7 },
  { id: "sea", name: "Seattle Branch",   location: "Seattle, WA",       collector: "col-sea-01", collectorStatus: "online",   scanPolicy: "Every 5 min", ipRange: "10.20.0.0/24",   deviceCount: 5 },
  { id: "dmz", name: "DMZ / Cloud Edge", location: "AWS us-west-2",     collector: "col-dmz-01", collectorStatus: "degraded", scanPolicy: "Every 1 min", ipRange: "172.16.0.0/20",  deviceCount: 4 },
];

const DEVICES = [
  // HQ
  { id:"hq-gw-core-01", network:"hq", name:"HQ Core Router", type:"Router", vendor:"Cisco", model:"ASR 1001-X", status:"critical", ip:"10.10.0.1",
    metrics:{latency:312,packetLoss:18,uptime:99.1,cpu:94,mem:87,bandwidth:98},
    ports:[{name:"Gi0/0/0",status:"up"},{name:"Gi0/0/1",status:"up"},{name:"Gi0/0/2",status:"down"},{name:"Gi0/0/3",status:"down"}],
    snmp:[{name:"bgpPeerState",value:"Idle",status:"critical"},{name:"cpmCPUTotal5min",value:"94%",status:"critical"},{name:"ifInOctets",value:"9.8 Gbps",status:"critical"}],
    alerts:["BGP peer down","CPU threshold exceeded","Interface Gi0/0/2 down"],
    tags:["core","critical-infrastructure","bgp"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:true,changedKeys:["ip route 0.0.0.0","router bgp 64512"]},
    rtdHistory:[42,55,78,120,210,280,312],
    sim:{
      severity:"P1-Critical",
      reason:"BGP peer flap causing routing table overflow; CPU 94%, packet loss 18% confirm P1.",
      monReasoning:"SNMP bgpPeerState reports Idle — BGP session has dropped. ifInOctets at 9.8Gbps is near link saturation. cpmCPUTotal5min at 94% breaches P1 threshold. RTD history shows rapid climb from 42ms to 312ms over 30 min. Three independent P1 indicators confirm critical severity.",
      findings:"HQ Core Router is suffering a BGP peer failure (AS64512 Idle), causing routing table churn that saturated CPU to 94% and drove packet loss to 18%. Two downstream interfaces are dark. Config drift detected on BGP and static route tables.",
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
    ports:[{name:"Gi1/0/1",status:"up"},{name:"Gi1/0/2",status:"up"},{name:"Gi1/0/3",status:"down"},{name:"Gi1/0/24",status:"up"}],
    snmp:[{name:"dot3StatsCollisions",value:"1,842/min",status:"warning"},{name:"stpRootPort",value:"Gi1/0/24",status:"ok"},{name:"ifOperStatus",value:"3/4 up",status:"warning"}],
    alerts:["Port Gi1/0/3 down","Collision rate elevated"],
    tags:["distribution","stp","campus"], powerState:"on", poeEnabled:true,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[18,21,24,31,40,45,48],
    sim:{
      severity:"P2-High",
      reason:"Elevated collision rate and downed port Gi1/0/3 from upstream BGP event.",
      monReasoning:"Packet loss at 3% exceeds P2 threshold. SNMP dot3StatsCollisions spiking to 1,842/min vs baseline <50/min. Gi1/0/3 down correlates with core router Gi0/0/2 failure. CPU at 71% elevated from STP reconvergence.",
      findings:"HQ Distribution Switch shows elevated collisions, a downed uplink (Gi1/0/3), and CPU elevation from STP reconvergence triggered by the upstream core router failure.",
      rootCause:"Upstream BGP failure on HQ Core Router caused STP topology change, forcing the distribution switch to reconverge and increasing collision domain pressure on remaining uplinks.",
      confidence:"high",
      diagReasoning:"domotz_network confirms Gi1/0/3 is the secondary uplink to Core Router Gi0/0/2 — both went down simultaneously. STP root port Gi1/0/24 (primary uplink) intact so Layer 2 is functional. Collision counters confirm traffic redistribution artifact, not hardware fault. No config drift.",
      autoAct:"NOC alerted. JIRA ticket HQ-4471 linked to core router incident. Polling reduced to 30s via domotz_alerts. Gi1/0/3 flagged pending upstream recovery.",
      summary:"P2-High: HQ Distribution Switch degraded as downstream symptom of core router BGP failure. Layer 2 intact via primary uplink.",
      nextSteps:"1) Monitor Gi1/0/3 recovery after core BGP restores. 2) If still down after 15 min, inspect SFP. 3) Review STP timers to reduce reconvergence time.",
      respReasoning:"Downstream casualty of the core router P1. Link these incidents in the NOC report with a hard escalation trigger if Gi1/0/3 does not recover.",
      domotzTools:["domotz_monitoring: get_snmp_sensors","domotz_network: get_network_topology","domotz_configuration: get_config_backup","domotz_alerts: bind_alert_profile"]
    }
  },
  { id:"hq-fw-edge-01", network:"hq", name:"HQ Edge Firewall", type:"Firewall", vendor:"Palo Alto", model:"PA-3220", status:"warning", ip:"10.10.0.3",
    metrics:{latency:88,packetLoss:5,uptime:98.4,cpu:78,mem:69,bandwidth:74},
    ports:[{name:"ethernet1/1",status:"up"},{name:"ethernet1/2",status:"up"},{name:"ethernet1/3 (DMZ)",status:"down"}],
    snmp:[{name:"panSessionUtilization",value:"87%",status:"critical"},{name:"panThreatTotal",value:"14,220/hr",status:"warning"},{name:"panGPGatewayUtil",value:"62%",status:"ok"}],
    alerts:["Session table near capacity","DMZ interface down","Threat volume elevated"],
    tags:["security","perimeter","dmz","critical-infrastructure"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-05 02:00",driftDetected:true,changedKeys:["security-policy DMZ-in","nat-policy WAN-out"]},
    rtdHistory:[22,28,35,52,71,80,88],
    sim:{
      severity:"P1-Critical",
      reason:"Session table 87% with 14,220 threats/hr and DMZ down indicates active attack.",
      monReasoning:"panSessionUtilization at 87% is near saturation. panThreatTotal at 14,220/hr is 28x the baseline of ~500/hr. DMZ interface down removes isolation layer. Config drift on DMZ security policy is suspicious given timing.",
      findings:"HQ Edge Firewall session table near capacity (87%) due to sustained inbound threat campaign (14,220 threats/hr), DMZ interface down, and config drift detected on security and NAT policies.",
      rootCause:"Active SYN flood from external threat actors is exhausting the firewall session table, causing DMZ isolation and degrading WAN throughput.",
      confidence:"high",
      diagReasoning:"domotz_configuration shows policy drift on 'security-policy DMZ-in' — an unauthorized rule may have been added. domotz_monitoring threat sensor history shows spike began at 03:10 UTC — 4 minutes before the BGP failure on the core router. Potentially coordinated attack.",
      autoAct:"Rate-limiting ACL applied via domotz_configuration rollback. DMZ traffic rerouted to secondary path. Security team paged. ISP blackhole route requested. domotz_alerts SECURITY-P1 profile activated.",
      summary:"P1-Critical: HQ Edge Firewall under active SYN flood. Session table near exhaustion, DMZ isolated, config drift detected. Automated mitigations applied.",
      nextSteps:"1) Confirm ISP blackhole route active within 10 min. 2) Audit the drifted DMZ-in rule. 3) If panThreatTotal sustained, escalate to MSSP.",
      respReasoning:"Both a security and network incident. Config drift must be escalated to security separately from NOC. Two parallel tracks: DDoS mitigation and unauthorized config change investigation.",
      domotzTools:["domotz_monitoring: get_snmp_sensors","domotz_monitoring: get_sensor_history","domotz_configuration: get_config_backup","domotz_alerts: list_alert_profiles","domotz_network: get_network_interfaces"]
    }
  },
  { id:"hq-ap-floor2-01", network:"hq", name:"Floor 2 AP", type:"Access Point", vendor:"Ubiquiti", model:"UniFi U6 Pro", status:"ok", ip:"10.10.1.10",
    metrics:{latency:11,packetLoss:0.1,uptime:100,cpu:18,mem:34,bandwidth:22},
    ports:[{name:"eth0",status:"up"},{name:"wlan0 (5GHz)",status:"up"},{name:"wlan1 (2.4GHz)",status:"up"}],
    snmp:[{name:"dot11ClientCount",value:"24 clients",status:"ok"},{name:"dot11ChannelUtil",value:"31%",status:"ok"}],
    alerts:[], tags:["wifi","floor-2","corporate"], powerState:"on", poeEnabled:true,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[10,10,11,11,11,11,11],
    sim:{
      severity:"P3-Low", reason:"All metrics nominal. 24 clients, 31% channel utilization.",
      monReasoning:"All metrics well within baseline. 24 active clients with 31% channel utilization — healthy. No alerts. RTD flat at 11ms.",
      findings:"Floor 2 AP fully operational with 24 active clients and healthy RF utilization.",
      rootCause:"No fault condition.",confidence:"high",
      diagReasoning:"domotz_inventory confirms 'corporate' and 'floor-2' tags. Channel utilization 31% is well below the 70% saturation threshold. No config drift.",
      autoAct:"Incident logged. Standard 5-min monitoring continues.",
      summary:"P3-Low: Floor 2 AP operating nominally.",
      nextSteps:"1) No action required.",respReasoning:"Clean status. Close for audit log.",
      domotzTools:["domotz_monitoring: get_snmp_sensors","domotz_inventory: get_device_tags","domotz_devices: get_device_status"]
    }
  },
  { id:"hq-ups-server-01", network:"hq", name:"Server Room UPS", type:"UPS", vendor:"APC", model:"Smart-UPS 3000", status:"warning", ip:"10.10.2.5",
    metrics:{latency:14,packetLoss:0,uptime:100,cpu:12,mem:22,bandwidth:1},
    ports:[{name:"mgmt0",status:"up"}],
    snmp:[{name:"upsOutputLoad",value:"78%",status:"warning"},{name:"upsBatteryCapacity",value:"91%",status:"ok"},{name:"upsRuntimeRemaining",value:"24 min",status:"warning"}],
    alerts:["Output load elevated","Runtime below 30 min threshold"],
    tags:["power","server-room","critical-infrastructure"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[13,13,14,14,14,14,14],
    sim:{
      severity:"P2-High", reason:"UPS output load 78% with only 24 min estimated runtime.",
      monReasoning:"upsOutputLoad at 78% exceeds P2 alert threshold of 75%. upsRuntimeRemaining at 24 min is below the 30 min safety floor. Battery capacity is fine at 91% but load is consuming runtime faster than expected.",
      findings:"Server Room UPS under elevated load (78%) with runtime reduced to 24 min, correlating with increased server power draw from the network incident.",
      rootCause:"Elevated server CPU activity from network incident processing increased aggregate power draw, pushing UPS output load above warning threshold.",
      confidence:"medium",
      diagReasoning:"domotz_power SNMP history shows load climbed from 61% to 78% over 45 min — correlating with the BGP incident onset. Battery healthy. This is a load management issue, not hardware fault.",
      autoAct:"Facilities team alerted via domotz_alerts. Non-critical workloads flagged for potential shedding if load exceeds 85%. Generator warm-up check initiated.",
      summary:"P2-High: Server Room UPS under elevated load (78%) with reduced runtime (24 min). Facilities alerted.",
      nextSteps:"1) Escalate to P1 if load exceeds 85%. 2) Defer non-critical server workloads. 3) Verify generator readiness.",
      respReasoning:"Secondary effect of the network incident. Flag as linked risk in NOC report with a clear escalation threshold.",
      domotzTools:["domotz_power: get_power_status","domotz_monitoring: get_snmp_sensors","domotz_monitoring: get_sensor_history","domotz_alerts: bind_alert_profile"]
    }
  },
  { id:"hq-sw-access-03", network:"hq", name:"Floor 3 Access SW", type:"Switch", vendor:"Cisco", model:"Catalyst 9200", status:"ok", ip:"10.10.1.30",
    metrics:{latency:9,packetLoss:0.1,uptime:100,cpu:22,mem:38,bandwidth:18},
    ports:[{name:"Gi1/0/1",status:"up"},{name:"Gi1/0/2",status:"up"},{name:"Gi1/0/3",status:"up"},{name:"Gi1/0/48",status:"up"}],
    snmp:[{name:"dot3StatsFCSErrors",value:"0",status:"ok"},{name:"ifHighSpeed",value:"1 Gbps",status:"ok"}],
    alerts:[], tags:["access","floor-3","poe"], powerState:"on", poeEnabled:true,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[9,9,9,9,9,9,9],
    sim:{
      severity:"P3-Low", reason:"All metrics nominal. Zero FCS errors, all ports up.",
      monReasoning:"Zero packet loss, 9ms latency, 22% CPU. SNMP FCS error count is zero. All ports up. No alerts.",
      findings:"Floor 3 Access Switch fully operational with zero errors.",rootCause:"No fault condition.",confidence:"high",
      diagReasoning:"domotz_devices shows 100% uptime for 90 days. domotz_inventory confirms PoE budget 68% utilized. No config drift.",
      autoAct:"Incident logged.",summary:"P3-Low: Floor 3 Access Switch nominal.",nextSteps:"1) No action required.",
      respReasoning:"Clean status.",
      domotzTools:["domotz_devices: get_device_status","domotz_monitoring: get_snmp_sensors","domotz_inventory: get_custom_fields"]
    }
  },
  { id:"hq-cam-lobby-01", network:"hq", name:"Lobby IP Camera", type:"IP Camera", vendor:"Axis", model:"P3245-V", status:"ok", ip:"10.10.3.11",
    metrics:{latency:8,packetLoss:0,uptime:100,cpu:14,mem:28,bandwidth:8},
    ports:[{name:"eth0",status:"up"}],
    snmp:[{name:"videoStreamBitrate",value:"4.2 Mbps",status:"ok"}],
    alerts:[], tags:["camera","security","lobby"], powerState:"on", poeEnabled:true,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[8,8,8,8,8,8,8],
    sim:{
      severity:"P3-Low", reason:"All metrics nominal. Video stream healthy.",
      monReasoning:"Zero packet loss, 8ms latency, video bitrate stable at 4.2 Mbps. No anomalies.",
      findings:"Lobby IP Camera streaming normally.",rootCause:"No fault condition.",confidence:"high",
      diagReasoning:"domotz_devices confirms continuous online status. PoE draw 12.5W within spec.",
      autoAct:"Incident logged.",summary:"P3-Low: Lobby IP Camera nominal.",nextSteps:"1) No action required.",
      respReasoning:"Clean status.",
      domotzTools:["domotz_devices: get_device_status","domotz_monitoring: get_tcp_sensor","domotz_inventory: get_device_tags"]
    }
  },

  // Seattle
  { id:"sea-gw-01", network:"sea", name:"Seattle Gateway", type:"Router", vendor:"Meraki", model:"MX85", status:"ok", ip:"10.20.0.1",
    metrics:{latency:22,packetLoss:0.3,uptime:99.9,cpu:31,mem:44,bandwidth:29},
    ports:[{name:"WAN1",status:"up"},{name:"WAN2",status:"up"},{name:"LAN",status:"up"}],
    snmp:[{name:"meraki.wan1Latency",value:"22ms",status:"ok"},{name:"meraki.vpnStatus",value:"Connected",status:"ok"},{name:"meraki.uplinkUtil",value:"29%",status:"ok"}],
    alerts:[], tags:["gateway","meraki","branch"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[20,21,21,22,22,22,22],
    sim:{
      severity:"P3-Low", reason:"Dual WAN healthy, VPN connected to HQ, all metrics nominal.",
      monReasoning:"Latency 22ms, packet loss 0.3%, CPU 31%, mem 44%. VPN tunnel to HQ connected. Both WAN uplinks active. Uplink utilization 29% — healthy headroom.",
      findings:"Seattle Gateway fully operational with dual WAN and active VPN to HQ.",rootCause:"No fault condition.",confidence:"high",
      diagReasoning:"domotz_agents VPN status confirms tunnel active. domotz_network both WAN interfaces healthy. Dual-WAN failover policy configured correctly.",
      autoAct:"Incident logged.",summary:"P3-Low: Seattle Gateway nominal.",nextSteps:"1) No action required.",
      respReasoning:"Clean status.",
      domotzTools:["domotz_agents: get_agent_vpn_status","domotz_network: get_network_interfaces","domotz_monitoring: get_snmp_sensors"]
    }
  },
  { id:"sea-sw-01", network:"sea", name:"Seattle Core SW", type:"Switch", vendor:"HP", model:"Aruba 2930F", status:"ok", ip:"10.20.0.2",
    metrics:{latency:7,packetLoss:0,uptime:100,cpu:19,mem:31,bandwidth:14},
    ports:[{name:"1",status:"up"},{name:"2",status:"up"},{name:"3",status:"up"},{name:"24",status:"up"}],
    snmp:[{name:"ifOperStatus",value:"24/24 up",status:"ok"},{name:"dot3StatsCollisions",value:"0",status:"ok"}],
    alerts:[], tags:["core-switch","branch"], powerState:"on", poeEnabled:true,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[7,7,7,7,7,7,7],
    sim:{
      severity:"P3-Low", reason:"All 24 ports up, zero collisions, metrics nominal.",
      monReasoning:"All metrics well within baseline. Zero packet loss. All 24 ports active.",
      findings:"Seattle Core Switch operating nominally.",rootCause:"No fault condition.",confidence:"high",
      diagReasoning:"domotz_devices shows 100% uptime for 60 days. No config drift.",
      autoAct:"Incident logged.",summary:"P3-Low: Seattle Core Switch nominal.",nextSteps:"1) No action required.",
      respReasoning:"Clean status.",
      domotzTools:["domotz_devices: get_device_status","domotz_monitoring: get_snmp_sensors"]
    }
  },
  { id:"sea-ap-01", network:"sea", name:"Seattle Office AP", type:"Access Point", vendor:"Cisco", model:"Aironet 4800", status:"warning", ip:"10.20.1.5",
    metrics:{latency:34,packetLoss:2.1,uptime:99.6,cpu:67,mem:58,bandwidth:71},
    ports:[{name:"eth0",status:"up"},{name:"wlan0 (5GHz)",status:"up"},{name:"wlan1 (2.4GHz)",status:"up"}],
    snmp:[{name:"dot11ClientCount",value:"51 clients",status:"warning"},{name:"dot11ChannelUtil",value:"74%",status:"warning"},{name:"dot11RetryCount",value:"12%",status:"warning"}],
    alerts:["Channel utilization above 70%","Client count high","Retry rate elevated"],
    tags:["wifi","branch","capacity-warning"], powerState:"on", poeEnabled:true,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[18,22,26,29,31,33,34],
    sim:{
      severity:"P2-High", reason:"Channel utilization 74% with 51 clients and 12% retry rate — RF saturation.",
      monReasoning:"dot11ChannelUtil at 74% exceeds 70% saturation threshold. 51 clients near device capacity of ~60. Retry rate 12% is double healthy baseline of <5%. Packet loss 2.1% crosses P2 threshold.",
      findings:"Seattle Office AP is RF-saturated with 51 clients, 74% channel utilization, and 12% retry rate causing elevated packet loss.",
      rootCause:"Client density exceeds AP capacity for current channel plan, exacerbated by 5GHz interference from neighboring networks.",
      confidence:"medium",
      diagReasoning:"domotz_monitoring retry rate history shows degradation began Monday — consistent with return-to-office load. domotz_inventory shows no second AP deployed in Seattle. This is the only wireless device in 10.20.1.0/24. Capacity expansion needed.",
      autoAct:"domotz_alerts capacity warning profile activated. IT ticket SEA-891 created. Band steering policy reviewed — 2.4GHz offload attempted.",
      summary:"P2-High: Seattle Office AP RF-saturated with 51 clients. Capacity expansion required. Band steering applied as interim mitigation.",
      nextSteps:"1) Deploy second AP to split client load. 2) Audit channel plan for interference. 3) Enable 802.11r fast roaming.",
      respReasoning:"Capacity problem, not a fault. Frame as a growth issue with a clear hardware procurement recommendation.",
      domotzTools:["domotz_monitoring: get_snmp_sensors","domotz_monitoring: get_sensor_history","domotz_inventory: get_device_profile","domotz_alerts: bind_alert_profile","domotz_network: get_routed_networks"]
    }
  },
  { id:"sea-print-01", network:"sea", name:"Seattle MFP Printer", type:"Printer", vendor:"HP", model:"LaserJet M607", status:"ok", ip:"10.20.2.10",
    metrics:{latency:6,packetLoss:0,uptime:99.9,cpu:8,mem:19,bandwidth:1},
    ports:[{name:"eth0",status:"up"}],
    snmp:[{name:"hrPrinterStatus",value:"Running",status:"ok"},{name:"prtMarkerLifeCount",value:"142,800 pages",status:"ok"}],
    alerts:[], tags:["printer","branch","facilities"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-04 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[6,6,6,6,6,6,6],
    sim:{
      severity:"P3-Low", reason:"All metrics nominal.",
      monReasoning:"Zero packet loss, 6ms latency, printer Running. No anomalies.",
      findings:"Seattle MFP Printer operating normally.",rootCause:"No fault condition.",confidence:"high",
      diagReasoning:"hrPrinterStatus is Running. Toner levels above threshold.",
      autoAct:"Incident logged.",summary:"P3-Low: Seattle MFP nominal.",nextSteps:"1) No action required.",
      respReasoning:"Clean status.",
      domotzTools:["domotz_devices: get_device_status","domotz_monitoring: get_snmp_sensors"]
    }
  },
  { id:"sea-nas-01", network:"sea", name:"Seattle NAS", type:"NAS", vendor:"Synology", model:"DS1821+", status:"critical", ip:"10.20.2.20",
    metrics:{latency:19,packetLoss:0.2,uptime:97.1,cpu:91,mem:88,bandwidth:92},
    ports:[{name:"eth0",status:"up"},{name:"eth1 (bond)",status:"down"}],
    snmp:[{name:"diskHealthStatus",value:"DEGRADED (rebuild)",status:"critical"},{name:"volumeUsage",value:"94%",status:"critical"},{name:"synoBondingStatus",value:"eth1 link down",status:"critical"}],
    alerts:["RAID array degraded","Volume 94% full","Bonding interface down","CPU critical"],
    tags:["storage","backup","branch","critical-infrastructure"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-05 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[14,16,18,61,78,88,91],
    sim:{
      severity:"P1-Critical", reason:"RAID degraded during rebuild, volume 94%, bonding down, CPU 91%.",
      monReasoning:"diskHealthStatus DEGRADED — drive failed, RAID rebuild in progress. Array vulnerable to second failure. Volume at 94% means rebuild could abort for insufficient space. CPU at 91% from rebuild I/O saturation. eth1 bond down halved I/O bandwidth. Three simultaneous P1 indicators.",
      findings:"Seattle NAS in critical degraded state: RAID rebuilding after disk failure, volume 94% full, bonding interface eth1 down, CPU saturated at 91% from rebuild I/O.",
      rootCause:"Physical disk failure initiated RAID6 rebuild. Rebuild consuming all CPU/memory, volume space critically low, bonding failure halved I/O bandwidth, further stressing the array.",
      confidence:"high",
      diagReasoning:"domotz_monitoring diskHealthStatus history shows degraded state began 6 hours ago. domotz_inventory custom field 'last-disk-replacement' was 3 years ago — likely end-of-life drive. Volume at 94% means less than 6% free — rebuild may abort. This is a data-at-risk incident.",
      autoAct:"Data-at-risk P1 escalated. Storage team paged via domotz_alerts. Backup jobs suspended to free I/O. Non-critical writes paused. Replacement drive procurement ticket SEA-STOR-112 opened.",
      summary:"P1-Critical: Seattle NAS RAID degraded after disk failure. Volume critically full (94%), bonding down, CPU saturated. Data at risk until rebuild completes.",
      nextSteps:"1) Procure replacement drive immediately. 2) Monitor rebuild — abort if volume hits 97%. 3) Clear 200GB before rebuild resumes. 4) Repair eth1 bond to restore full I/O bandwidth.",
      respReasoning:"Data-at-risk incidents require immediate hardware action. Report must state array is vulnerable to a second failure during the rebuild window. Time-to-replacement is the critical SLA.",
      domotzTools:["domotz_monitoring: get_snmp_sensors","domotz_monitoring: get_sensor_history","domotz_inventory: get_custom_fields","domotz_alerts: bind_alert_profile","domotz_devices: get_device_history"]
    }
  },

  // DMZ
  { id:"dmz-lb-01", network:"dmz", name:"DMZ Load Balancer", type:"Load Balancer", vendor:"F5", model:"BIG-IP 2000s", status:"warning", ip:"172.16.0.1",
    metrics:{latency:41,packetLoss:1.8,uptime:99.7,cpu:68,mem:71,bandwidth:83},
    ports:[{name:"1.1 (external)",status:"up"},{name:"1.2 (internal)",status:"up"},{name:"mgmt",status:"up"}],
    snmp:[{name:"ltmPoolMemberCnt",value:"6/8 active",status:"warning"},{name:"ltmConnTotal",value:"42,100 conn",status:"warning"},{name:"sysStatClientBytesIn",value:"8.3 Gbps",status:"warning"}],
    alerts:["Pool member count degraded (6/8)","Connection count elevated"],
    tags:["dmz","load-balancer","critical-infrastructure","cloud-edge"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:true,changedKeys:["ltmPool webfarm-prod members","ltmVirtualServer vs-https-443"]},
    rtdHistory:[24,27,31,35,38,40,41],
    sim:{
      severity:"P2-High", reason:"2/8 pool members offline, 42,100 connections (2.1x baseline), config drift on pool member list.",
      monReasoning:"ltmPoolMemberCnt 6/8 means 2 backend servers removed from pool — traffic on 75% capacity. Connection count 42,100 is 2.1x the 20,000 baseline. CPU 68% and bandwidth 83% confirm remaining members under pressure. Config drift on pool member list is unexplained.",
      findings:"DMZ Load Balancer has 2/8 pool members offline, handling 42,100 active connections (2.1x baseline), with unexplained config drift on production pool member list.",
      rootCause:"Two backend app servers failed health checks and were removed from the production pool. Concurrent connection surge may be related to the upstream HQ firewall DDoS event.",
      confidence:"medium",
      diagReasoning:"domotz_configuration shows pool member drift — two IPs (172.16.1.15, 172.16.1.16) removed from ltmPool webfarm-prod at 03:22 UTC. This matches the HQ firewall incident timing. Config drift may be automated response or unauthorized change.",
      autoAct:"NOC alerted. Pool member health check logs pulled. domotz_alerts P2 profile activated. Config drift investigation ticket DMZ-441 opened.",
      summary:"P2-High: DMZ Load Balancer at 75% pool capacity with elevated connection load. Config drift requires investigation — possible link to HQ DDoS event.",
      nextSteps:"1) Check app servers at 172.16.1.15 and .16 for health check failures. 2) Audit pool member config drift for unauthorized changes. 3) Enable connection rate limiting if count continues rising.",
      respReasoning:"Timing correlation with HQ firewall incident makes this potentially part of a coordinated attack. Flag in both NOC and security reports.",
      domotzTools:["domotz_monitoring: get_snmp_sensors","domotz_configuration: get_config_backup","domotz_alerts: bind_alert_profile","domotz_network: get_network_topology","domotz_devices: get_device_history"]
    }
  },
  { id:"dmz-waf-01", network:"dmz", name:"Web Application Firewall", type:"WAF", vendor:"Cloudflare", model:"Magic Firewall", status:"ok", ip:"172.16.0.2",
    metrics:{latency:15,packetLoss:0.1,uptime:100,cpu:29,mem:41,bandwidth:31},
    ports:[{name:"wan0",status:"up"},{name:"lan0",status:"up"}],
    snmp:[{name:"wafBlockedRequests",value:"8,441/hr",status:"ok"},{name:"wafPassedRequests",value:"24,100/hr",status:"ok"}],
    alerts:[], tags:["dmz","waf","security","cloud-edge"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[14,14,15,15,15,15,15],
    sim:{
      severity:"P3-Low", reason:"WAF blocking 8,441 requests/hr normally. All metrics nominal.",
      monReasoning:"Latency 15ms, near-zero packet loss, CPU 29%. WAF blocking 8,441/hr within normal range (baseline 5,000-10,000/hr). Passed rate 24,100/hr healthy.",
      findings:"Web Application Firewall operating normally.",rootCause:"No fault condition.",confidence:"high",
      diagReasoning:"domotz_monitoring wafBlockedRequests history within normal range. No config drift.",
      autoAct:"Incident logged.",summary:"P3-Low: WAF operating normally.",nextSteps:"1) No action required.",
      respReasoning:"Clean status.",
      domotzTools:["domotz_devices: get_device_status","domotz_monitoring: get_snmp_sensors"]
    }
  },
  { id:"dmz-vpn-gw-01", network:"dmz", name:"VPN Gateway", type:"VPN Gateway", vendor:"Cisco", model:"ASA 5525-X", status:"ok", ip:"172.16.0.10",
    metrics:{latency:18,packetLoss:0.2,uptime:99.9,cpu:37,mem:52,bandwidth:44},
    ports:[{name:"GigabitEthernet0/0",status:"up"},{name:"GigabitEthernet0/1",status:"up"}],
    snmp:[{name:"crasNumSessions",value:"142 sessions",status:"ok"},{name:"ikeTunnels",value:"8 active",status:"ok"},{name:"crasNumFailed",value:"2 failed/hr",status:"ok"}],
    alerts:[], tags:["vpn","dmz","remote-access"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-06 02:00",driftDetected:false,changedKeys:[]},
    rtdHistory:[17,17,18,18,18,18,18],
    sim:{
      severity:"P3-Low", reason:"142 sessions, 8 IKE tunnels active, minimal failures.",
      monReasoning:"142 concurrent sessions within capacity (max 750). IKE tunnels all active. Failure rate 2/hr negligible.",
      findings:"VPN Gateway handling 142 remote-access sessions and 8 site-to-site IKE tunnels with no issues.",rootCause:"No fault condition.",confidence:"high",
      diagReasoning:"domotz_agents VPN tunnel status confirms all 8 tunnels active including HQ-Seattle and HQ-DMZ.",
      autoAct:"Incident logged.",summary:"P3-Low: VPN Gateway nominal.",nextSteps:"1) No action required.",
      respReasoning:"Clean status.",
      domotzTools:["domotz_agents: get_agent_vpn_status","domotz_monitoring: get_snmp_sensors","domotz_network: get_network_topology"]
    }
  },
  { id:"dmz-proxy-01", network:"dmz", name:"Egress Proxy", type:"Proxy", vendor:"Squid", model:"Squid 6.x (Linux)", status:"critical", ip:"172.16.1.5",
    metrics:{latency:280,packetLoss:14,uptime:96.2,cpu:97,mem:93,bandwidth:99},
    ports:[{name:"eth0",status:"up"},{name:"eth1",status:"down"}],
    snmp:[{name:"squidCacheHitRate",value:"12%",status:"critical"},{name:"squidCacheClients",value:"1,840",status:"critical"},{name:"squidMemUsage",value:"93%",status:"critical"}],
    alerts:["Cache hit rate critically low","Memory exhaustion imminent","Client count overload","Interface eth1 down"],
    tags:["dmz","proxy","egress","critical-infrastructure"], powerState:"on", poeEnabled:false,
    configBackup:{lastBackup:"2025-05-05 02:00",driftDetected:true,changedKeys:["cache_mem","maximum_object_size","acl BYPASS src"]},
    rtdHistory:[35,52,89,140,201,248,280],
    sim:{
      severity:"P1-Critical", reason:"CPU 97%, memory 93%, 1,840 clients, cache hit rate 12%, eth1 down.",
      monReasoning:"CPU at 97% — near-total saturation. Memory 93% — OOM kill imminent. Cache hit rate 12% vs 60%+ baseline means all 1,840 clients fetching from origin, massively amplifying upstream traffic. Packet loss 14%. Config drift on 'acl BYPASS src' is suspicious — unauthorized bypass rule may be routing all traffic through origin.",
      findings:"Egress Proxy critically overloaded: CPU 97%, memory 93% (OOM imminent), 1,840 concurrent clients, cache hit rate collapsed to 12%, eth1 down, suspicious config drift on ACL bypass rules.",
      rootCause:"A config change to 'acl BYPASS src' bypassed cache for a large source range, forcing all affected clients to fetch from origin — causing a 10x surge that exhausted CPU and memory.",
      confidence:"high",
      diagReasoning:"domotz_configuration drift on 'acl BYPASS src' is the smoking gun — an unauthorized bypass ACL routes a wide source range directly to origin, bypassing cache lookup. domotz_monitoring client count history shows the surge started exactly when this config was applied at 03:45 UTC. Rolling back the ACL should restore cache efficiency.",
      autoAct:"domotz_configuration rollback of 'acl BYPASS src' change initiated. eth1 restart attempted. Memory limits tuned. Squid cache flush and rebuild started. P1 alert escalated to platform team.",
      summary:"P1-Critical: Egress Proxy overloaded due to unauthorized ACL bypass config change. All client traffic hitting origin. Config rollback initiated. OOM risk until memory stabilizes.",
      nextSteps:"1) Confirm rollback applied and cache hit rate recovers above 40% within 10 min. 2) Identify who applied the ACL bypass and audit change records. 3) Repair eth1. 4) Increase cache memory allocation once load normalizes.",
      respReasoning:"Configuration management incident as much as performance incident. The unauthorized ACL change must trigger a change management audit. Report should identify the specific config diff and request a post-incident review.",
      domotzTools:["domotz_monitoring: get_snmp_sensors","domotz_monitoring: get_sensor_history","domotz_configuration: get_config_backup","domotz_configuration: rollback_config","domotz_alerts: bind_alert_profile","domotz_devices: get_device_history"]
    }
  },
];

const AC = {
  orchestrator:{accent:"#94A3B8",dim:"rgba(148,163,184,0.12)",label:"Orchestrator"},
  monitor:     {accent:"#38BDF8",dim:"rgba(56,189,248,0.1)",  label:"Monitor"},
  diagnostic:  {accent:"#A78BFA",dim:"rgba(167,139,250,0.1)",label:"Diagnostic"},
  response:    {accent:"#34D399",dim:"rgba(52,211,153,0.1)", label:"Response"},
};
const SEV_COLOR={  "P1-Critical":"#F87171","P2-High":"#FBBF24","P3-Low":"#34D399" };
const SEV_DIM={    "P1-Critical":"rgba(248,113,113,0.1)","P2-High":"rgba(251,191,36,0.1)","P3-Low":"rgba(52,211,153,0.08)" };
const STATUS_COLOR={critical:"#F87171",warning:"#FBBF24",ok:"#34D399"};
const STATUS_BG=   {critical:"rgba(248,113,113,0.1)",warning:"rgba(251,191,36,0.1)",ok:"rgba(52,211,153,0.1)"};
const NET_ACCENT=  {hq:"#38BDF8",sea:"#A78BFA",dmz:"#FB923C"};

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function mColor(key,val){
  if(key==="latency")    return val>200?"#F87171":val>50?"#FBBF24":"#34D399";
  if(key==="packetLoss") return val>10?"#F87171":val>2?"#FBBF24":"#34D399";
  if(key==="bandwidth")  return val>90?"#F87171":val>70?"#FBBF24":"#34D399";
  if(key==="cpu"||key==="mem") return val>85?"#F87171":val>65?"#FBBF24":"#34D399";
  return"#475569";
}

function Badge({agent}){
  const m=AC[agent?.toLowerCase()]||AC.orchestrator;
  return <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",padding:"2px 7px",borderRadius:3,background:m.dim,color:m.accent,border:`1px solid ${m.accent}33`,fontFamily:"'JetBrains Mono',monospace"}}>{m.label}</span>;
}
function Bar({val,max,color}){
  return <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden",marginTop:5}}><div style={{height:"100%",width:`${Math.min(100,(val/max)*100)}%`,background:color,borderRadius:2,transition:"width 0.5s ease"}}/></div>;
}
function Spinner(){
  return <span style={{width:10,height:10,border:"1.5px solid rgba(56,189,248,0.2)",borderTopColor:"#38BDF8",borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite",flexShrink:0}}/>;
}
function TypedText({text,color="#475569",onDone}){
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

export default function App(){
  const [activeNetwork,setActiveNetwork]=useState("hq");
  const [selected,setSelected]=useState(null);
  const [running,setRunning]=useState(false);
  const [logs,setLogs]=useState([]);
  const [activeStep,setActiveStep]=useState(-1);
  const [complete,setComplete]=useState(false);
  const [statusMsg,setStatusMsg]=useState("");
  const [typingEntry,setTypingEntry]=useState(null);
  const [detailTab,setDetailTab]=useState("metrics");
  const startRef=useRef(null);
  const bottomRef=useRef(null);

  const networkDevices=DEVICES.filter(d=>d.network===activeNetwork);
  const net=NETWORKS.find(n=>n.id===activeNetwork);

  useEffect(()=>{setSelected(null);setLogs([]);setComplete(false);setActiveStep(-1);},[activeNetwork]);
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

  async function run(){
    if(running||!selected)return;
    setRunning(true);setLogs([]);setActiveStep(0);setComplete(false);setStatusMsg("");setTypingEntry(null);
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
      `<strong>Summary:</strong> ${s.summary}<br/><strong>Actions taken:</strong> ${s.autoAct}<br/><strong>Next steps:</strong> ${s.nextSteps}<br/><strong style="color:#A78BFA;font-size:10px">Domotz MCP tools:</strong> <span style="color:#A78BFA;font-size:10px">${s.domotzTools.join(" · ")}</span>`,
      s.respReasoning);
    await sleep(400);

    setActiveStep(-1);setComplete(true);setStatusMsg("");
    addLog("orchestrator",null,`<span style="color:#34D399;font-weight:700">✓ Workflow complete</span> in ${t()}. Report filed. All agents returned to standby.`);
    setRunning(false);
  }

  const pipeline=[
    {step:0,key:"orchestrator",label:"Orchestrator"},
    {step:1,key:"monitor",label:"Monitor"},
    {step:2,key:"diagnostic",label:"Diagnostic"},
    {step:3,key:"response",label:"Response"},
  ];

  const networkCounts=nid=>({
    total:DEVICES.filter(d=>d.network===nid).length,
    critical:DEVICES.filter(d=>d.network===nid&&d.status==="critical").length,
    warning:DEVICES.filter(d=>d.network===nid&&d.status==="warning").length,
  });

  return (
    <div style={{background:"#070C13",minHeight:"100vh",color:"#94A3B8",fontFamily:"'IBM Plex Sans',system-ui,sans-serif",padding:"16px",maxWidth:720,margin:"0 auto"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;700&display=swap');
        @keyframes spin   {to{transform:rotate(360deg)}}
        @keyframes pulse  {0%,100%{opacity:1}50%{opacity:0.25}}
        @keyframes blink  {0%,100%{opacity:1}50%{opacity:0}}
        @keyframes fadeUp {from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}
        button{font-family:inherit;cursor:pointer}
      `}</style>

      {/* Header */}
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
          <span style={{width:7,height:7,borderRadius:"50%",display:"inline-block",flexShrink:0,
            background:running?"#38BDF8":complete?"#34D399":"#334155",
            boxShadow:running?"0 0 10px #38BDF8":complete?"0 0 8px #34D399":"none",
            animation:running?"pulse 1.6s ease infinite":"none",transition:"all 0.4s"}}/>
          <span style={{fontSize:16,fontWeight:600,color:"#F1F5F9",letterSpacing:"-0.02em"}}>NetOps Agent Swarm</span>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",padding:"2px 7px",borderRadius:3,background:"rgba(56,189,248,0.08)",color:"#38BDF8",border:"1px solid rgba(56,189,248,0.18)"}}>demo</span>
        </div>
        <div style={{fontSize:11,color:"#334155"}}>Monitor → Diagnostic → Response · Domotz MCP · {DEVICES.length} devices · {NETWORKS.length} networks</div>
      </div>

      {/* Pipeline bar */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:1,marginBottom:12,border:"1px solid rgba(255,255,255,0.05)",borderRadius:7,overflow:"hidden"}}>
        {pipeline.map((n,i)=>{
          const c=AC[n.key],isA=activeStep===n.step,isDone=complete||(activeStep>n.step&&activeStep!==-1);
          return <div key={n.key} style={{padding:"8px 4px",textAlign:"center",background:isA?c.dim:isDone?"rgba(52,211,153,0.04)":"rgba(255,255,255,0.01)",borderRight:i<3?"1px solid rgba(255,255,255,0.04)":"none",boxShadow:isA?`inset 0 -2px 0 ${c.accent}`:"none",transition:"all 0.4s ease"}}>
            <div style={{fontSize:10,fontWeight:600,color:isA?"#F1F5F9":isDone?"#34D399":"#334155"}}>{n.label}</div>
            <div style={{fontSize:8,color:isA?c.accent:isDone?"#166834":"#1E293B",marginTop:1}}>{isA?"● active":isDone?"✓":"—"}</div>
          </div>;
        })}
      </div>

      {/* Status / typing block */}
      {running&&(statusMsg||typingEntry)&&(
        <div style={{padding:"10px",background:"rgba(56,189,248,0.04)",border:"1px solid rgba(56,189,248,0.1)",borderRadius:6,marginBottom:10}}>
          {typingEntry
            ?<div>
               <div style={{fontSize:9,color:"#38BDF8",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:5,display:"flex",alignItems:"center",gap:6}}><Spinner/>Agent reasoning</div>
               <TypedText text={typingEntry.text} color="#475569" onDone={onTypingDone}/>
             </div>
            :<div style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:"#38BDF8"}}><Spinner/>{statusMsg}</div>
          }
        </div>
      )}

      {/* Network selector */}
      <div style={{marginBottom:10}}>
        <div style={{fontSize:9,fontWeight:700,color:"#334155",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Networks — {NETWORKS.length} collectors</div>
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          {NETWORKS.map(n=>{
            const counts=networkCounts(n.id),isActive=activeNetwork===n.id,ac=NET_ACCENT[n.id];
            return <div key={n.id} onClick={()=>!running&&setActiveNetwork(n.id)}
              style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:`1px solid ${isActive?ac+"55":"rgba(255,255,255,0.05)"}`,borderRadius:7,cursor:running?"default":"pointer",background:isActive?`${ac}09`:"rgba(255,255,255,0.01)",transition:"all 0.15s"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:n.collectorStatus==="online"?"#34D399":"#FBBF24",boxShadow:`0 0 6px ${n.collectorStatus==="online"?"#34D399":"#FBBF24"}77`,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:600,color:isActive?"#F1F5F9":"#64748B"}}>{n.name}</div>
                <div style={{fontSize:9,color:"#334155",marginTop:1}}>{n.location} · {n.collector} · {n.ipRange}</div>
              </div>
              <div style={{display:"flex",gap:5,alignItems:"center"}}>
                {counts.critical>0&&<span style={{fontSize:8,fontWeight:700,padding:"1px 6px",borderRadius:99,background:"rgba(248,113,113,0.12)",color:"#F87171"}}>{counts.critical} P1</span>}
                {counts.warning>0&&<span style={{fontSize:8,fontWeight:700,padding:"1px 6px",borderRadius:99,background:"rgba(251,191,36,0.12)",color:"#FBBF24"}}>{counts.warning} P2</span>}
                <span style={{fontSize:9,color:"#334155"}}>{counts.total} devices</span>
              </div>
            </div>;
          })}
        </div>
      </div>

      {/* Device list */}
      <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:8,padding:"10px",marginBottom:8}}>
        <div style={{fontSize:9,fontWeight:700,color:"#334155",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>{net.name} — {networkDevices.length} devices</div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {networkDevices.map(d=>{
            const sel=selected?.id===d.id,sev=d.sim.severity;
            return <div key={d.id} onClick={()=>!running&&setSelected(sel?null:d)}
              style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",border:`1px solid ${sel?NET_ACCENT[activeNetwork]+"55":"rgba(255,255,255,0.05)"}`,borderRadius:6,cursor:running?"default":"pointer",background:sel?`${NET_ACCENT[activeNetwork]}08`:"rgba(255,255,255,0.01)",transition:"all 0.15s"}}>
              <span style={{width:7,height:7,borderRadius:"50%",background:STATUS_COLOR[d.status],boxShadow:`0 0 5px ${STATUS_COLOR[d.status]}66`,display:"inline-block",flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:500,color:sel?"#F1F5F9":"#64748B",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.name}</div>
                <div style={{fontSize:9,color:"#334155",marginTop:1}}>{d.vendor} {d.model} · {d.ip}</div>
              </div>
              <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                <span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:99,background:SEV_DIM[sev],color:SEV_COLOR[sev]}}>{sev}</span>
                <span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:99,background:STATUS_BG[d.status],color:STATUS_COLOR[d.status]}}>{d.status}</span>
              </div>
            </div>;
          })}
        </div>
      </div>

      {/* Device detail panel */}
      {selected&&(
        <div style={{background:"rgba(255,255,255,0.02)",border:`1px solid ${NET_ACCENT[activeNetwork]}22`,borderRadius:8,marginBottom:8,overflow:"hidden",animation:"fadeUp 0.2s ease"}}>
          <div style={{padding:"10px 12px",borderBottom:"1px solid rgba(255,255,255,0.04)",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:"#F1F5F9"}}>{selected.name}</div>
              <div style={{fontSize:9,color:"#334155",marginTop:1}}>{selected.vendor} {selected.model} · {selected.ip} · {selected.type}</div>
            </div>
            <button onClick={()=>setSelected(null)} style={{background:"none",border:"none",color:"#475569",fontSize:13,padding:0,marginLeft:8}}>✕</button>
          </div>

          {/* Tabs */}
          <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
            {["metrics","snmp","ports","inventory"].map(tab=>(
              <button key={tab} onClick={()=>setDetailTab(tab)} style={{flex:1,padding:"7px 4px",fontSize:9,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",border:"none",background:detailTab===tab?"rgba(255,255,255,0.04)":"transparent",color:detailTab===tab?"#F1F5F9":"#334155",borderBottom:detailTab===tab?`2px solid ${NET_ACCENT[activeNetwork]}`:"2px solid transparent",transition:"all 0.15s"}}>{tab}</button>
            ))}
          </div>

          <div style={{padding:"10px 12px"}}>
            {detailTab==="metrics"&&(
              <div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                  {[{label:"Latency",key:"latency",val:selected.metrics.latency,unit:"ms",max:400},
                    {label:"Packet Loss",key:"packetLoss",val:selected.metrics.packetLoss,unit:"%",max:30},
                    {label:"CPU",key:"cpu",val:selected.metrics.cpu,unit:"%",max:100},
                    {label:"Memory",key:"mem",val:selected.metrics.mem,unit:"%",max:100},
                    {label:"Bandwidth",key:"bandwidth",val:selected.metrics.bandwidth,unit:"%",max:100},
                    {label:"Uptime",key:"uptime",val:selected.metrics.uptime,unit:"%",max:100},
                  ].map(m=>{
                    const c=m.key==="uptime"?(m.val>99.5?"#34D399":m.val>99?"#FBBF24":"#F87171"):mColor(m.key,m.val);
                    return <div key={m.key} style={{background:"rgba(255,255,255,0.02)",borderRadius:6,padding:"8px 10px",border:"1px solid rgba(255,255,255,0.04)"}}>
                      <div style={{fontSize:8,color:"#334155",textTransform:"uppercase",letterSpacing:"0.08em"}}>{m.label}</div>
                      <div style={{fontSize:18,fontWeight:600,color:c,letterSpacing:"-0.02em"}}>{m.val}<span style={{fontSize:9,fontWeight:400,color:"#475569",marginLeft:1}}>{m.unit}</span></div>
                      <Bar val={m.val} max={m.max} color={c}/>
                    </div>;
                  })}
                </div>
                {/* RTD Sparkline */}
                <div style={{background:"rgba(255,255,255,0.02)",borderRadius:6,padding:"8px 10px",border:"1px solid rgba(255,255,255,0.04)"}}>
                  <div style={{fontSize:8,color:"#334155",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>RTD History (7 samples)</div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:3,height:28}}>
                    {selected.rtdHistory.map((v,i)=>{
                      const maxV=Math.max(...selected.rtdHistory);
                      const hPct=Math.max(3,(v/maxV)*28);
                      const c=mColor("latency",v);
                      return <div key={i} style={{flex:1,height:hPct,background:c,borderRadius:2,opacity:i===selected.rtdHistory.length-1?1:0.35+(i/selected.rtdHistory.length)*0.5}}/>;
                    })}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#334155",marginTop:3}}>
                    <span>{selected.rtdHistory[0]}ms</span><span>now: {selected.rtdHistory[selected.rtdHistory.length-1]}ms</span>
                  </div>
                </div>
              </div>
            )}

            {detailTab==="snmp"&&(
              <div>
                <div style={{border:"1px solid rgba(255,255,255,0.04)",borderRadius:6,overflow:"hidden",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:8,fontWeight:700,color:"#334155",padding:"4px 8px",background:"rgba(255,255,255,0.02)",letterSpacing:"0.08em",textTransform:"uppercase"}}>
                    <span>SNMP OID / Sensor</span><span>Value</span>
                  </div>
                  {selected.snmp.map((s,i)=>{
                    const c=s.status==="critical"?"#F87171":s.status==="warning"?"#FBBF24":"#34D399";
                    return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",borderTop:"1px solid rgba(255,255,255,0.03)",fontSize:10}}>
                      <span style={{fontFamily:"monospace",color:"#475569"}}>{s.name}</span>
                      <span style={{color:c,fontWeight:600,fontSize:9}}>{s.value}</span>
                    </div>;
                  })}
                </div>
                {selected.alerts.length>0
                  ?<div style={{background:"rgba(248,113,113,0.05)",border:"1px solid rgba(248,113,113,0.15)",borderRadius:6,padding:"8px 10px"}}>
                     <div style={{fontSize:8,color:"#F87171",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>Active alerts</div>
                     {selected.alerts.map((a,i)=><div key={i} style={{fontSize:10,color:"#F87171",marginBottom:2}}>⚠ {a}</div>)}
                   </div>
                  :<div style={{fontSize:11,color:"#34D399",textAlign:"center",padding:"8px 0"}}>✓ No active alerts</div>
                }
              </div>
            )}

            {detailTab==="ports"&&(
              <div style={{border:"1px solid rgba(255,255,255,0.04)",borderRadius:6,overflow:"hidden"}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:8,fontWeight:700,color:"#334155",padding:"4px 8px",background:"rgba(255,255,255,0.02)",letterSpacing:"0.08em",textTransform:"uppercase"}}>
                  <span>Interface</span><span>Status</span>
                </div>
                {selected.ports.map(p=>(
                  <div key={p.name} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"5px 8px",borderTop:"1px solid rgba(255,255,255,0.03)"}}>
                    <span style={{fontFamily:"monospace",color:"#475569"}}>{p.name}</span>
                    <span style={{fontWeight:600,fontSize:9,color:p.status==="up"?"#34D399":"#F87171"}}>{p.status==="up"?"▲ up":"▼ down"}</span>
                  </div>
                ))}
              </div>
            )}

            {detailTab==="inventory"&&(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <div style={{background:"rgba(255,255,255,0.02)",borderRadius:6,padding:"8px 10px",border:"1px solid rgba(255,255,255,0.04)"}}>
                  <div style={{fontSize:8,color:"#334155",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>domotz_inventory tags</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {selected.tags.map(tag=><span key={tag} style={{fontSize:9,padding:"2px 7px",borderRadius:99,background:"rgba(167,139,250,0.1)",color:"#A78BFA",border:"1px solid rgba(167,139,250,0.2)"}}>{tag}</span>)}
                  </div>
                </div>
                <div style={{background:"rgba(255,255,255,0.02)",borderRadius:6,padding:"8px 10px",border:"1px solid rgba(255,255,255,0.04)"}}>
                  <div style={{fontSize:8,color:"#334155",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>domotz_configuration backup</div>
                  <div style={{fontSize:10,color:"#64748B"}}>Last backup: {selected.configBackup.lastBackup}</div>
                  <div style={{fontSize:10,color:selected.configBackup.driftDetected?"#F87171":"#34D399",marginTop:2}}>
                    {selected.configBackup.driftDetected?`⚠ Drift: ${selected.configBackup.changedKeys.join(", ")}`:"✓ No drift — baseline match"}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  <div style={{background:"rgba(255,255,255,0.02)",borderRadius:6,padding:"8px 10px",border:"1px solid rgba(255,255,255,0.04)"}}>
                    <div style={{fontSize:8,color:"#334155",textTransform:"uppercase",letterSpacing:"0.08em"}}>domotz_power state</div>
                    <div style={{fontSize:12,fontWeight:600,color:selected.powerState==="on"?"#34D399":"#F87171",marginTop:3}}>{selected.powerState}</div>
                  </div>
                  <div style={{background:"rgba(255,255,255,0.02)",borderRadius:6,padding:"8px 10px",border:"1px solid rgba(255,255,255,0.04)"}}>
                    <div style={{fontSize:8,color:"#334155",textTransform:"uppercase",letterSpacing:"0.08em"}}>PoE</div>
                    <div style={{fontSize:12,fontWeight:600,color:selected.poeEnabled?"#38BDF8":"#334155",marginTop:3}}>{selected.poeEnabled?"enabled":"disabled"}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Run button */}
      <button disabled={!selected||running} onClick={run} style={{width:"100%",padding:"11px",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",border:`1px solid ${running?"rgba(56,189,248,0.3)":!selected?"rgba(255,255,255,0.05)":"rgba(255,255,255,0.12)"}`,borderRadius:7,background:running?"rgba(56,189,248,0.06)":"rgba(255,255,255,0.025)",color:running?"#38BDF8":!selected?"#334155":"#64748B",cursor:!selected||running?"not-allowed":"pointer",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.2s"}}>
        {running&&<Spinner/>}
        {running?"Swarm executing…":logs.length>0?"↺  Run again":selected?`▶  Run swarm on ${selected.name}`:"▶  Select a device"}
      </button>

      {/* Execution log */}
      {logs.length>0&&(
        <div style={{background:"rgba(255,255,255,0.015)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:8,overflow:"hidden"}}>
          <div style={{padding:"8px 10px",borderBottom:"1px solid rgba(255,255,255,0.04)",display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:9,fontWeight:700,color:"#334155",letterSpacing:"0.1em",textTransform:"uppercase"}}>Execution log</span>
            {!running&&<span style={{fontSize:9,color:"#334155",marginLeft:"auto"}}>{logs.length} events · {logs[logs.length-1]?.time}</span>}
          </div>
          <div style={{padding:"8px 10px"}}>
            {logs.map((log,i)=>{
              const c=AC[log.agent]?.accent||"#94A3B8";
              return <div key={i} style={{padding:"8px 0",borderBottom:i<logs.length-1?"1px solid rgba(255,255,255,0.03)":"none",animation:"fadeUp 0.2s ease"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                  <Badge agent={log.agent}/>
                  {log.tool&&<span style={{fontSize:8,fontFamily:"monospace",color:"#334155",background:"rgba(255,255,255,0.025)",padding:"1px 6px",borderRadius:3,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{log.tool}</span>}
                  <span style={{fontSize:9,color:"#1E293B",marginLeft:"auto"}}>{log.time}</span>
                </div>
                <div style={{fontSize:12,color:"#64748B",lineHeight:1.7}} dangerouslySetInnerHTML={{__html:log.html}}/>
                {log.reasoning&&<div style={{marginTop:6,padding:"6px 8px",background:"rgba(255,255,255,0.012)",borderLeft:`2px solid ${c}33`}}>
                  <div style={{fontSize:8,color:"#334155",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:2}}>Agent reasoning</div>
                  <div style={{fontSize:10,color:"#334155",lineHeight:1.7,fontFamily:"'JetBrains Mono',monospace",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{log.reasoning}</div>
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
