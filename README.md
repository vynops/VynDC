<div align="center">

# VynDC

### AI-Powered DataCenter Operations Platform

**Self-hosted · Open Source · Enterprise Ready**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Groq AI](https://img.shields.io/badge/AI-Groq_Llama--4-f97316?logo=groq&logoColor=white)](https://groq.com)
[![Prometheus](https://img.shields.io/badge/Metrics-Prometheus-E6522C?logo=prometheus&logoColor=white)](https://prometheus.io)
[![Live Demo](https://img.shields.io/badge/Live_Demo-dc.vynops.online-6366f1)](https://dc.vynops.online)

*Predict failures before they happen. Track every asset. Sleep through the night.*

</div>

---

## Overview

VynDC is a production-grade, self-hosted AIOps platform for on-premises and hybrid datacenters. It unifies real-time infrastructure monitoring, AI-powered predictive failure detection, incident management, on-call scheduling, SLA tracking, and power/cooling analytics into a single intelligent dashboard — eliminating the need to jump between IPMI consoles, Grafana, spreadsheets, and Slack when a server starts degrading.

Built on **Next.js 15 App Router**, VynDC connects directly to your Prometheus stack, IPMI/BMC interfaces, and SNMP-capable network devices — with no agents required for metrics collection.

> **Design philosophy:** VynDC does not replace your monitoring stack. It sits on top of it, adds AI intelligence, and makes your team actually act on what it sees.

---

## Screenshots

|  |  |
|---|---|
| <a href="screenshots/Screenshot%202026-09-01%20151101.png"><img src="screenshots/Screenshot%202026-09-01%20151101.png" width="100%" alt="01 · Secure Login" /></a><br /><strong>01 · Secure Login</strong> | <a href="screenshots/Screenshot%202026-09-01%20151143.png"><img src="screenshots/Screenshot%202026-09-01%20151143.png" width="100%" alt="02 · Data Center Overview" /></a><br /><strong>02 · Data Center Overview</strong> |
| <a href="screenshots/Screenshot%202026-09-01%20151217.png"><img src="screenshots/Screenshot%202026-09-01%20151217.png" width="100%" alt="03 · Server Inventory" /></a><br /><strong>03 · Server Inventory</strong> | <a href="screenshots/Screenshot%202026-09-01%20151243.png"><img src="screenshots/Screenshot%202026-09-01%20151243.png" width="100%" alt="04 · Rack Topology" /></a><br /><strong>04 · Rack Topology</strong> |
| <a href="screenshots/Screenshot%202026-09-01%20151308.png"><img src="screenshots/Screenshot%202026-09-01%20151308.png" width="100%" alt="05 · Asset And Disk Inventory" /></a><br /><strong>05 · Asset And Disk Inventory</strong> | <a href="screenshots/Screenshot%202026-09-01%20151327.png"><img src="screenshots/Screenshot%202026-09-01%20151327.png" width="100%" alt="06 · Power And Cooling" /></a><br /><strong>06 · Power And Cooling</strong> |
| <a href="screenshots/Screenshot%202026-09-01%20151344.png"><img src="screenshots/Screenshot%202026-09-01%20151344.png" width="100%" alt="07 · Storage Health" /></a><br /><strong>07 · Storage Health</strong> | <a href="screenshots/Screenshot%202026-09-01%20151358.png"><img src="screenshots/Screenshot%202026-09-01%20151358.png" width="100%" alt="08 · Network Interfaces" /></a><br /><strong>08 · Network Interfaces</strong> |
| <a href="screenshots/Screenshot%202026-09-01%20151418.png"><img src="screenshots/Screenshot%202026-09-01%20151418.png" width="100%" alt="09 · Failure Predictions" /></a><br /><strong>09 · Failure Predictions</strong> | <a href="screenshots/Screenshot%202026-09-01%20151443.png"><img src="screenshots/Screenshot%202026-09-01%20151443.png" width="100%" alt="10 · AI Copilot" /></a><br /><strong>10 · AI Copilot</strong> |
| <a href="screenshots/Screenshot%202026-09-01%20151507.png"><img src="screenshots/Screenshot%202026-09-01%20151507.png" width="100%" alt="11 · Runbook Automation" /></a><br /><strong>11 · Runbook Automation</strong> | <a href="screenshots/Screenshot%202026-09-01%20151529.png"><img src="screenshots/Screenshot%202026-09-01%20151529.png" width="100%" alt="12 · Runbook Editor" /></a><br /><strong>12 · Runbook Editor</strong> |
| <a href="screenshots/Screenshot%202026-09-01%20151606.png"><img src="screenshots/Screenshot%202026-09-01%20151606.png" width="100%" alt="13 · Autonomous Ops Policy" /></a><br /><strong>13 · Autonomous Ops Policy</strong> | <a href="screenshots/Screenshot%202026-09-01%20151728.png"><img src="screenshots/Screenshot%202026-09-01%20151728.png" width="100%" alt="14 · Incident Management" /></a><br /><strong>14 · Incident Management</strong> |
| <a href="screenshots/Screenshot%202026-09-01%20151751.png"><img src="screenshots/Screenshot%202026-09-01%20151751.png" width="100%" alt="15 · Maintenance Windows" /></a><br /><strong>15 · Maintenance Windows</strong> | <a href="screenshots/Screenshot%202026-09-01%20151813.png"><img src="screenshots/Screenshot%202026-09-01%20151813.png" width="100%" alt="16 · On-Call Schedule" /></a><br /><strong>16 · On-Call Schedule</strong> |
| <a href="screenshots/Screenshot%202026-09-01%20151832.png"><img src="screenshots/Screenshot%202026-09-01%20151832.png" width="100%" alt="17 · Routing And Escalations" /></a><br /><strong>17 · Routing And Escalations</strong> | <a href="screenshots/Screenshot%202026-09-01%20151848.png"><img src="screenshots/Screenshot%202026-09-01%20151848.png" width="100%" alt="18 · SLA Tracker" /></a><br /><strong>18 · SLA Tracker</strong> |
| <a href="screenshots/Screenshot%202026-09-01%20152001.png"><img src="screenshots/Screenshot%202026-09-01%20152001.png" width="100%" alt="19 · Team Management" /></a><br /><strong>19 · Team Management</strong> | <a href="screenshots/Screenshot%202026-09-01%20152046.png"><img src="screenshots/Screenshot%202026-09-01%20152046.png" width="100%" alt="20 · Infrastructure Settings" /></a><br /><strong>20 · Infrastructure Settings</strong> |
| <a href="screenshots/Screenshot%202026-09-01%20152108.png"><img src="screenshots/Screenshot%202026-09-01%20152108.png" width="100%" alt="21 · Alerting Settings" /></a><br /><strong>21 · Alerting Settings</strong> | <a href="screenshots/Screenshot%202026-09-01%20152129.png"><img src="screenshots/Screenshot%202026-09-01%20152129.png" width="100%" alt="22 · AI And Audit Settings" /></a><br /><strong>22 · AI And Audit Settings</strong> |

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
  - [Local Development](#local-development)
  - [Production with PM2](#production-with-pm2)
- [Configuration](#configuration)
- [Supported Hardware & Integrations](#supported-hardware--integrations)
- [Incident Management](#incident-management)
- [On-Call & Escalations](#on-call--escalations)
- [AI Copilot](#ai-copilot)
- [Notifications](#notifications)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### 🔭 Real-Time Infrastructure Visibility
- **Unified server dashboard** — CPU, memory, disk I/O, NIC throughput, and temperature per server
- **Rack-level view** — U-space utilisation, power draw per rack, and airflow status
- **Network topology map** — Switch port utilisation, interface errors, and uplink health at a glance
- **VMware, Proxmox, and bare-metal** — Hypervisor integration via Prometheus exporters
- **IPMI/BMC monitoring** — Out-of-band health data from iDRAC, iLO, and Supermicro IPMI

### 🤖 AI Predictive Failure Detection
- **Disk failure prediction** — SMART attribute analysis with 92% accuracy; flags disks before they fail
- **Thermal anomaly detection** — Identifies servers trending toward thermal shutdown hours in advance
- **Memory error rate analysis** — Pinpoints DIMMs approaching failure threshold before data loss
- **Power supply redundancy alerts** — Warns when the backup PSU is degraded before the primary fails too
- **Estimated time-to-failure** — Predictive alerts include replacement priority and time estimates
- **Powered by Groq Llama-4** — Sub-second AI inference, free tier covers most deployments

### ⚡ Power & Cooling Analytics
- **PUE tracking** — Power Usage Effectiveness in real time, not just monthly averages
- **Per-rack power trends** — Historical consumption per rack and per server
- **Cooling efficiency** — Hot aisle / cold aisle differential monitoring
- **UPS health** — Battery health, runtime remaining, and load percentage from SNMP
- **Cost attribution** — Power cost broken down by rack, team, and workload

### 💾 Storage & Asset Management
- **Disk inventory** — SMART status, age, and replacement schedule for every drive
- **Storage pool utilisation** — Growth rate projections and capacity planning reports
- **SAN/NAS integration** — NetApp, Pure Storage, Ceph, ZFS visibility
- **Asset lifecycle tracking** — Warranty expiry, EOL status, and age per device
- **Capacity forecasting** — Projected time to full storage across pools

### 🌐 Network Infrastructure Monitoring
- **SNMP polling** — Switches, routers, and PDUs via SNMP v2c/v3
- **Interface error trending** — Packet loss, error rates, and utilisation over time
- **BGP/OSPF session health** — Edge and core routing session state monitoring
- **VLAN drift detection** — Configuration drift across bonded and teamed interfaces
- **Bandwidth anomaly detection** — AI-assisted identification of unexpected traffic spikes

### 🚨 Incident Management & Escalation
- **Auto-generated incidents** — Created automatically from Prometheus Alertmanager alerts
- **Full context escalation** — On-call engineer receives server location, rack position, and remediation steps
- **Severity-based routing** — Critical, warning, and info alerts routed to the right person
- **Maintenance windows** — Suppress alerts during planned work with schedule management
- **Post-incident reports** — Timeline, root cause, and prevention recommendations
- **Notes & assignee tracking** — Rich incident history with team collaboration

### 📟 On-Call Scheduling
- **Shift management** — Create, edit, and delete on-call shifts with start/end times
- **Currently on-call indicator** — Real-time display of who is covering right now
- **Multi-engineer support** — Assign multiple engineers to overlapping shifts
- **Email-based alerting** — Notifications routed directly to on-call engineers' email addresses

### 🔀 Routing Rules & Escalation Policies
- **Severity + category routing** — Route incidents to specific teams based on severity and type
- **Multi-step escalation policies** — Define escalation chains with delay intervals per step
- **Fallback recipients** — Configurable alert recipients when no routing rule matches
- **Visual policy editor** — Add, view, and delete routing rules and escalation policies from the UI

### 📊 SLA Tracking
- **Per-incident SLA bars** — Visual progress bars showing time consumed vs SLA threshold
- **Breach detection** — Automatic notification when an incident exceeds its SLA
- **Configurable thresholds** — Set warning and critical SLA durations per severity level
- **SLA summary dashboard** — Count of healthy, warning, and breached incidents at a glance

### 🔔 Smart Notifications
- **Slack webhooks** — Rich messages on new incidents, SLA breaches, and escalation steps
- **SMTP email** — HTML alert emails to on-call engineers and fallback recipients
- **Flood prevention** — 55-second dispatch lock prevents duplicate notifications in concurrent polls
- **Catch-up suppression** — First-seen historical alerts have all flags pre-set; no notification floods on startup
- **Escalation caps** — Escalation steps are bounded to policy length; no infinite re-firing

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      Browser (React 19)                          │
│  Overview · Servers · Incidents · On-Call · SLA · Routing · AI   │
└─────────────────────────┬────────────────────────────────────────┘
                          │ HTTPS
┌─────────────────────────▼────────────────────────────────────────┐
│                  Next.js 15 App Router                           │
│                  (Port 3040, PM2-managed)                        │
│                                                                  │
│  /api/servers      → Prometheus node_exporter metrics           │
│  /api/incidents    → Alertmanager + dispatchAlerts()            │
│  /api/oncall       → data/oncall.json                           │
│  /api/routing      → data/routing.json                          │
│  /api/escalations  → data/escalations.json                      │
│  /api/sla          → data/sla-config.json + live calculation    │
│  /api/network      → SNMP / Prometheus network exporters        │
│  /api/storage      → Prometheus / SMART data                    │
│  /api/power        → Prometheus PDU/UPS exporters               │
│  /api/predictions  → Groq Llama-4 AI inference                  │
│  /api/copilot      → Groq Llama-4 conversational AI             │
│  /api/settings     → data/settings.json                         │
└───┬──────────┬──────────┬──────────┬─────────────┬──────────────┘
    │          │          │          │             │
Prometheus  Alertmanager  Groq API  IPMI/BMC    data/*.json
(metrics)   (alerts)     (AI)      (out-of-band) (on-disk store)
    │
SNMP exporters / node_exporter / custom exporters
```

---

## Requirements

| Component | Version |
|---|---|
| Node.js | 20+ |
| npm | 10+ |
| Prometheus | Any (for metrics) |
| Alertmanager | Any (for incidents) |
| Groq API key | Free at [console.groq.com](https://console.groq.com) |
| SMTP server | Any (for email alerts — optional) |
| SNMP access | v2c or v3 (for network/PDU — optional) |
| IPMI/BMC access | IPMI 2.0+ (for server OOB — optional) |

---

## Installation

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/vynops/VynDC
cd VynDC

# 2. Install dependencies
npm install

# 3. First-run configuration
# npm install creates .env.local with a random session secret and bootstrap admin

# 4. Start development server
npm run dev
# Dashboard: http://localhost:3040
```

`npm install` creates `.env.local` only when it is missing, generates a random session secret, and sets the bootstrap admin to `admin@vyndc.local` / `changeme`. On the first server startup, VynDC creates that admin account. The first sign-in must set a new password before accessing the dashboard. Existing `.env.local` files are preserved. Configure Prometheus, AI, and notification integrations later in Settings.

### Production with PM2

```bash
# 1. Install dependencies and create first-run configuration if needed
npm install

# 2. Build for production
npm run build

# 3. Start with PM2
pm2 start npm --name vyndc -- start -- -p 3040
pm2 save
pm2 startup   # enable auto-start on reboot
```

---

## Configuration

Bootstrap variables generated in `.env.local`:

| Variable | Description | Required |
|---|---|---|
| `VYNDC_SECRET` | Random session-signing secret, generated automatically when `.env.local` is first created | generated automatically |
| `VYNDC_ADMIN_EMAIL` | Bootstrap administrator email; defaults to `admin@vyndc.local` | generated automatically |
| `VYNDC_ADMIN_PASSWORD` | Temporary bootstrap password; defaults to `changeme` and must be changed on first login | generated automatically |
| `GROQ_API_KEY` | Optional Groq API key fallback; AI can also be configured in Settings | optional |
| `VYNDC_INCIDENT_WORKER_ENABLED` | Set to `true` to enable the background incident worker; disabled by default | optional, not generated |

Prometheus, AI, SNMP, IPMI, and notification settings are configured from the dashboard rather than required environment variables.

---

## Supported Hardware & Integrations

### Server Platforms
| Platform | Interface | Notes |
|---|---|---|
| Dell PowerEdge | iDRAC 9/10 | IPMI 2.0 + Redfish |
| HPE ProLiant | iLO 5/6 | IPMI 2.0 + REST |
| Supermicro | IPMI | Native IPMI 2.0 |
| Any x86 server | Generic IPMI 2.0 | Full telemetry support |
| AMD / Intel bare-metal | node_exporter | CPU, memory, disk, NIC |

### Storage
| Platform | Protocol |
|---|---|
| Ceph clusters | Prometheus exporter |
| ZFS zpools | node_exporter ZFS module |
| NetApp ONTAP | ONTAP exporter / REST |
| Pure Storage FlashArray | Pure exporter |
| Dell PowerStore | REST API |

### Network & Power
| Device | Protocol |
|---|---|
| Cisco IOS / NX-OS | SNMP v2c/v3 |
| Arista EOS | SNMP + eAPI |
| APC UPS | SNMP v2c |
| Eaton PDUs | SNMP v2c |
| Vertiv infrastructure | SNMP v2c |

---

## Incident Management

VynDC connects to Prometheus Alertmanager and automatically converts firing alerts into structured incidents with severity classification, owner assignment, SLA tracking, and escalation routing.

**Incident lifecycle:**

```
Alertmanager
  |
Node worker (every 60 seconds) / dashboard incident polling
  |
Episode-aware reconciliation and dispatch safety guards
  |
Durable notification queue -> per-channel delivery and retries
  |
Incident history + action/delivery audit journal
```

**Built-in flood prevention:**
- **55-second dispatch lock** — `data/dispatch-lock.json` prevents concurrent poll floods
- **Catch-up suppression** — First-seen old alerts are pre-marked; no historical notification floods on startup
- **Escalation cap** — Escalation steps are bounded to the policy length

### Background Processing And History

Set `VYNDC_INCIDENT_WORKER_ENABLED=true` in the application environment and restart
the long-running Next.js Node server to enable independent processing. This is
opt-in: without the flag, incident polling still creates queue jobs but delivery
does not run. The worker is not started during builds and does not require a
browser session. Do not enable it until notification destinations are approved.
This deployment model requires a persistent Node process, not serverless hosting.

An episode is identified by its alert fingerprint and source start time. Operator
overrides apply only to that episode. Manual resolution is archived immediately;
alerts missing from two successful dispatch reads are archived as source-cleared.
Source outages never count as successful missing-alert reads. Silenced/inhibited
source alerts and maintenance windows suppress lifecycle notifications.

Editor/admin actions validate incident IDs, episode timestamps and state transitions.
During a source outage, a live snapshot permits actions for at most five minutes;
older snapshots fail closed. Simulation data remains available, but simulation
notifications are marked skipped rather than sent. Legacy overrides are reused
only when their episode can be established from seen-alert state; legacy alerts
are not replayed as notifications during migration.

Recent audit entries remain in `data/audit-log.json`. The append-only
`data/audit-history.jsonl` journal preserves existing recent records on first use
and retains subsequent action/delivery events beyond the 1,000-entry recent cap.
Actions include actor, incident/episode IDs, timestamps, before/after values, notes,
and requested/succeeded outcomes. Writes are flushed and JSON replacement is atomic;
cross-process store locks protect read/modify/write operations.

Back up `data/` and restrict access to the application account. Incident history,
queue results and the audit journal are not automatically pruned. Define and
operate a retention/archival policy; do not delete pending/processing queue jobs
or live lock files. These local files are not a tamper-proof compliance archive.

Monitor `data/incident-worker.json` for last-run, last-success and error state, and
the notification inspection endpoint below for failed deliveries. Full production
acceptance requires an approved test incident, authenticated editor/viewer checks,
verified receipt at controlled destinations, and recorded history. Automated tests
mock providers; they do not prove real Slack/email receipt.

---

## On-Call & Escalations

Configure on-call shifts and escalation policies from the **On-Call** and **Routing** pages in the dashboard.

**On-call shifts** define who is responsible and when. Notification routing uses the active shift to determine who receives alerts.

**Escalation policies** define multi-step escalation chains:

```json
{
  "id": "hardware-critical",
  "name": "Hardware Critical",
  "steps": [
    { "delayMinutes": 0,  "notifyEmails": ["oncall@example.com"] },
    { "delayMinutes": 15, "notifyEmails": ["lead@example.com"] },
    { "delayMinutes": 30, "notifyEmails": ["director@example.com"] }
  ]
}
```

---

## AI Copilot

VynDC includes a conversational AI copilot powered by **Groq Llama-4** for real-time infrastructure queries.

```
"Why is rack A03 running hot?"
"Which servers have disks likely to fail in the next 48 hours?"
"Show me the network path between srv-prod-01 and the core switch"
"What caused the memory alert on srv-db-02 last night?"
```

The copilot has access to live server metrics, alert history, rack topology, and asset inventory — giving it full context for every question.

---

## Notifications

| Channel | Trigger | Setup |
|---|---|---|
| Slack | Incident lifecycle, SLA breach, escalation | Slack webhook in Settings -> Alerting |
| Teams | Incident lifecycle, SLA breach, escalation | Teams webhook in Settings -> Alerting |
| Custom webhook | Incident lifecycle, SLA breach, escalation | Custom webhook in Settings -> Alerting |
| Email (SMTP) | Incident lifecycle, SLA breach, escalation | Enable email; configure SMTP and routing/on-call/default recipients |

All notification channels are configurable from the **Settings → Alerting** page in the dashboard without editing environment files.

Incident notification jobs are persisted per channel in `data/notification-queue.json`.
Successful channels are not repeated when another channel fails. Delivery uses
timeouts, up to six attempts, exponential backoff, and recoverable processing leases.
Each batch handles at most 20 jobs with four concurrent deliveries. Missing channel
configuration produces an explicit failure rather than a successful send. SMTP
certificate verification is enabled; internal SMTP certificates must have a trusted
CA chain (for example, via `NODE_EXTRA_CA_CERTS`).

Delivery is at-least-once: a crash or uncertain provider response can still cause a
duplicate. A `delivered` result means provider acceptance, not a human read receipt.
Maintenance, resolved/replaced episodes and acknowledgement are rechecked before
pending lifecycle jobs send. Source outages defer lifecycle jobs without consuming
attempts; explicit operator action messages remain deliverable.

Authenticated editors/admins can use `GET /api/incidents/notifications` to inspect
counts and the latest 100 results without message bodies or recipients. After fixing
a failed channel, `POST /api/incidents/notifications` with `{"id":"<job-id>"}` resets
that failed job for another bounded attempt sequence and records the actor. Already
delivered or skipped jobs cannot be retried through this endpoint. Retried jobs run
only when the worker is enabled; retrying does not send synchronously.

Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` before release.

After building, run `npm run test:incident-e2e` for isolated runtime acceptance.
It starts a temporary production-mode app with generated users/secrets, a local
Alertmanager fixture, HTTP webhook receivers and an SMTP receiver. It checks
authentication, role enforcement, lifecycle/history, scheduled retries, explicit
retry audit, SLA/escalation dispatch, maintenance, outages and restart recovery.
Real production data and destinations are not used. The temporary app and data
are removed on completion; a sanitized report remains in the ignored
`.incident-e2e-results.json`. Scheduled checks normally take about two minutes.

SLA accounting excludes pause time observed by dispatch cycles. A pause-only
window does not permanently consume breach eligibility; normal breach evaluation
resumes afterward. Observation precision follows the worker/poll interval.

---

## Project Structure

```
VynDC/
├── src/
│   ├── app/
│   │   ├── (dashboard)/          # All authenticated dashboard pages
│   │   │   ├── overview/         # Main overview with KPI cards
│   │   │   ├── servers/          # Server list and per-server detail
│   │   │   ├── incidents/        # Incident list with ack/resolve/reopen
│   │   │   ├── oncall/           # On-call shift management
│   │   │   ├── routing/          # Routing rules and escalation policies
│   │   │   ├── sla/              # SLA status per incident
│   │   │   ├── network/          # Network topology and interface health
│   │   │   ├── storage/          # Storage arrays and disk inventory
│   │   │   ├── power/            # PUE, UPS, and PDU analytics
│   │   │   ├── rack/             # Rack-level physical view
│   │   │   ├── assets/           # Asset lifecycle and inventory
│   │   │   ├── predictions/      # AI predictive failure dashboard
│   │   │   ├── copilot/          # AI conversational copilot
│   │   │   ├── team/             # Team and user management
│   │   │   └── settings/         # Platform configuration
│   │   ├── api/                  # All API route handlers
│   │   │   ├── incidents/        # Incident CRUD + alert dispatch
│   │   │   ├── oncall/           # On-call shift management
│   │   │   ├── routing/          # Routing rule CRUD
│   │   │   ├── escalations/      # Escalation policy CRUD
│   │   │   ├── sla/              # SLA status calculation
│   │   │   ├── servers/          # Server metrics from Prometheus
│   │   │   ├── network/          # Network metrics from SNMP/Prometheus
│   │   │   ├── storage/          # Storage metrics
│   │   │   ├── power/            # Power/UPS metrics
│   │   │   ├── predictions/      # Groq AI predictions
│   │   │   ├── copilot/          # Groq AI chat
│   │   │   └── settings/         # Platform settings CRUD
│   │   ├── login/                # Login page
│   │   └── globals.css           # Global styles (Tailwind CSS v4)
│   ├── components/
│   │   └── layout/               # Sidebar, Header, DashboardLayout
│   ├── lib/
│   │   ├── alert-dispatcher.ts   # Core notification engine
│   │   ├── oncall-store.ts       # All data types and JSON store helpers
│   │   ├── notifier.ts           # Slack webhook + SMTP email delivery
│   │   ├── settings-store.ts     # Platform settings persistence
│   │   ├── prometheus.ts         # Prometheus query helpers
│   │   ├── auth.ts               # Session auth middleware
│   │   └── user-store.ts         # User management
│   └── middleware.ts             # Route auth protection
├── data/                         # Runtime JSON data store (gitignored)
│   ├── settings.json             # Platform configuration (contains secrets)
│   ├── users.json                # User accounts
│   ├── inventory.json            # Server/asset inventory
│   └── rack-topology.json        # Rack layout configuration
├── public/                       # Static assets
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org) App Router (Turbopack) |
| Language | [TypeScript 5](https://www.typescriptlang.org) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| AI Inference | [Groq](https://groq.com) — Llama-4 (sub-second responses) |
| Metrics | [Prometheus](https://prometheus.io) + custom exporters |
| Network | SNMP v2c/v3 polling |
| Server OOB | IPMI 2.0 / BMC (iDRAC, iLO, Supermicro) |
| Notifications | Slack Webhooks + Nodemailer SMTP |
| Data store | JSON files on disk (no external database required) |
| Auth | Custom session middleware with signed cookies |
| Process manager | [PM2](https://pm2.keymetrics.io) |
| Reverse proxy | nginx + Let's Encrypt (production) |

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/VynDC
cd VynDC

# Create a feature branch
git checkout -b feature/my-new-feature

# Make your changes, then open a PR against main
```

Please follow the existing code style (TypeScript strict, Tailwind utility classes, no external state libraries).

---

## Part of the VynOps Suite

| Product | Purpose | Repo |
|---|---|---|
| **VynOps** | Kubernetes operations platform | [vynops/VynOps](https://github.com/vynops/VynOps) |
| **VynAI** | Ollama fleet manager and AI gateway | [vynops/VynAI](https://github.com/vynops/VynAI) |
| **VynCost** | Cloud cost visibility | [vynops/VynCost](https://github.com/vynops/VynCost) |
| **VynDB** | Database operations | [vynops/VynDB](https://github.com/vynops/VynDB) |
| **VynDC** | Data center management | [vynops/VynDC](https://github.com/vynops/VynDC) |
| **VynCICD** | CI/CD pipeline management | [vynops/VynCICD](https://github.com/vynops/VynCICD) |
| **VynHana** | SAP HANA Database management | [vynops/VynHana](https://github.com/vynops/VynHana) |
| **VynSAP** | SAP ERP management | [vynops/VynSAP](https://github.com/vynops/VynSAP) |


---

## License

MIT — see [LICENSE](LICENSE)

---

