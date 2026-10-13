# Petlibro Management — UI Concept, Page Layouts & Reference Briefs

**Planning baseline:** October 13, 2026  
**Status:** Proposed visual and interaction direction; not implemented UI, not an override of the architecture  
**Companion references:**
- [System Coverage, Interaction & Authority Map](petlibro-management-architecture-coverage-map.md)
- [Migration & Implementation Sequence](petlibro-management-migration-implementation-sequence.md)
- [Implementation Guide & Subsystem Specification](petlibro-management-implementation-guide.md)

> **Purpose.** Give the Codex implementation team a cohesive, concrete visual target for the management application while preserving the established contracts, existing system authorities, and flexibility in component implementation. The concepts below specify information hierarchy, composition, and important interactions. They are not pixel-perfect specifications, exhaustive wireframes, or permission to fabricate runtime state.

## 1. Sources, certainty, and scope

### 1.1 Established requirements from the existing documents

The Implementation Guide (§2) defines the page inventory, content sources, interactions, shared components, and frontend state policy. The Coverage Map defines who owns intent, execution, observations and persistent state. The Migration Sequence specifies that reusable shell and operation UX can be created as the execution foundation matures. These are the normative sources for functional behavior.

The following requirements come directly from those sources:

- **React + TypeScript**, with planned **TanStack Start (SPA mode), Router, Query, Tailwind CSS, shadcn/ui, RJSF/shadcn**, and Lucide icons; tables/virtualized logs via TanStack Table/Virtual. The exact charting and schema-conversion choices remain candidates, not settled APIs.
- **Distinct pages:** Overview, Devices, Device Details, Setup, Actions/Maintenance, Operations (list/detail), Diagnostics, Logs, Events/History, Settings.
- **Persistent, responsive navigation**, a clear global context, deep links, theme consistency, light and dark modes, and Ingress-compatible constrained-width layouts.
- **Source-aware state:** feeder, AppDaemon, broker, State Agent, go2rtc and management service connectivity are distinct. Unknown/stale/indeterminate cannot be shown as healthy or complete.
- **Long-running operations survive navigation/browser loss.** Progress is evidence-backed; expandable detail logs are not a controller of work. Durable checkpoints and interruptions require explicit presentation.
- **Read-only operational projections initially.** Routine feeder controls remain with AppDaemon; camera streaming remains with go2rtc; add-on options remain Supervisor-owned.
- The current guided **production installation supports one feeder per add-on deployment**; list-oriented UI does not establish broader installation support.

### 1.2 Proposed visual design decisions in this document

The prior specifications deliberately do not settle exact colors, spacing, navigation dimensions, or page composition. The choices below are **concept preferences for visual coherence** and can be refined after reviewing generated reference images and testing actual Home Assistant Ingress viewport behavior:

- A polished **operational control-center** aesthetic: practical, calm, precise, approachable to Home Assistant users without becoming a raw infrastructure dashboard.
- Dark-theme visual references first, with equal-quality light-theme token support. Dark is a **concept illustration choice**, not a settled default user preference.
- Slate/charcoal neutrals, gentle teal/cyan accent for active navigation and neutral selection, restrained amber for warnings and red for failures, natural green for verified success. Status uses text + icon as well as color.
- Softly separated panels, thin borders, modest corner radii, readable hierarchy, generous whitespace in major sections, and denser detail views only where data volume warrants it.
- Device/feeder visual identity can use restrained line iconography, not large stock photography or decorative hero art. Real camera thumbnails belong only where the authorized media stream provides them.
- Clear functional labels. Avoid invented arbitrary metrics, decorative gauges, excessive gradients/glow, fake telemetry, and pseudo-terminal text that suggests real evidence.

### 1.3 How to use generated references

- The rendered images are **concept illustrations**. Their depicted names, timestamps, IDs, percentages, device outcomes and values are illustrative only. Never hardcode them or mistake them for actual Petlibro test results.
- Prefer hierarchy, composition, component relationships, density, interaction affordances, empty/degraded states, and responsive behavior over literal text or tiny icon placement.
- Screens should clearly distinguish **operation status** from **device state**, and **observed evidence** from **derived interpretation**.
- Images must never override the three architecture documents, device safety invariants, or accessibility requirements.
- Reference visual names below are stable IDs for coordination, review and eventual design assets.

## 2. Whole-application information architecture

### 2.1 Desktop navigation shell (proposed)

Primary sidebar, ordered by user intent:

1. **Overview** — system-wide readiness and activity
2. **Devices** — known device records and details
3. **Setup** — guided bootstrap or supported setup continuation
4. **Actions** — action catalog / maintenance
5. **Operations** — active and historical jobs
6. **Diagnostics** — targeted health checks and reports
7. **Logs** — live/historical technical log explorer
8. **History** — significant events and changes
9. **Settings** — app preferences and authorized integration configuration

Conceptual frame at ~1440×900 (not exact pixels):

```text
┌───────────────────┬────────────────────────────────────────────────────────────────────────────┐
│ Petlibro Local    │ Top bar: location/breadcrumb       Server • Jobs(1)  Notifications  Theme │
│ MANAGEMENT        ├────────────────────────────────────────────────────────────────────────────┤
│                   │ Page header: heading + short purpose                         Primary action │
│ ▣ Overview        │ ────────────────────────────────────────────────────────────────────────── │
│ ◇ Devices         │                                                                            │
│ ◈ Setup           │ ┌─────────────────────────────────┐ ┌────────────────────────────────────┐ │
│ ⬡ Actions         │ │ Primary content / major insight │ │ Supporting status / details        │ │
│ ▤ Operations  1   │ └─────────────────────────────────┘ └────────────────────────────────────┘ │
│ ◉ Diagnostics     │                                                                            │
│ ≡ Logs            │ ┌────────────────────────────────────────────────────────────────────────┐ │
│ ◷ History         │ │ Secondary content, lists, timelines, contextual tools                   │ │
│ ⚙ Settings        │ └────────────────────────────────────────────────────────────────────────┘ │
│                   │                                                                            │
│ Version / Status  │ Contextual empty/degraded/permission states                               │
└───────────────────┴────────────────────────────────────────────────────────────────────────────┘
```

**Top bar:** compact breadcrumb/page location, backend connection indicator, active jobs entry, actionable notifications, theme and user/access entry where the authentication mode supports it. Connection to the web backend is distinct from feeder connectivity.

**Page header:** title, one-sentence orientation/context, relevant device selector when needed, one clearly dominant action at most. Health/warning summaries are in consistent positions and linked to details.

**Sidebar:** compact icons + labels, active destination indication; group destinations visually without obscuring them. On narrow windows use collapsible drawer/rail, never assume Home Assistant Ingress provides desktop width.

**Utility rails:** optional contextual right rail for job details, evidence, or quick status. Do not enforce a right rail where it would crowd primary content.

### 2.2 Narrow and embedded behavior

- Break from two/three-column content to one column progressively; collapse sidebar to accessible navigation drawer with persistent page title and active-job affordance.
- Tabular data becomes scrollable/compact rows or deliberately designed summary cards. No impossible horizontal overflow for the core workflow.
- During setup, steps move from a side navigator to a progress dropdown/compact stage list; the primary required action stays visible and execution detail becomes an expandable section.
- Log filtering collapses behind a toolbar; the live log pane remains readable and keyboard accessible.
- Forms retain readable labels, useful validation and secret masking. Confirmation dialogs must fit smaller Ingress windows without truncating consequences.
- Maintain consistent back/deep-link behavior without assuming access to Home Assistant's outer navigation.

## 3. Reusable page composition and interaction patterns

### 3.1 Status presentation

Use a consistent `StatusSummary` / `ServiceHealth` language:

| Semantic state | Visual concept | Must mean |
|---|---|---|
| Healthy/verified | muted green icon + explicit label | The source actually verified its stated condition |
| Active/running | teal/blue indicator + time/step | A real operation or service state is active |
| Warning/degraded | restrained amber banner/row | Partial or actionable issue; linked to evidence |
| Failed | red icon/label + recovery link | A supported failure conclusion, not absence of response |
| Unknown/unavailable | neutral outlined icon + source/freshness note | Missing or unverified information |
| Interrupted/indeterminate | distinct amber/neutral treatment with explanation | A critical operation outcome cannot yet be established |
| Stale | timestamp/age and source, not merely a grey dot | Last observation is no longer within validity policy |

Don't merge the **management WebSocket**, **broker**, **feeder**, **AppDaemon**, **State Agent**, and **camera** into a single unqualified green `Connected` badge. The aggregate status can summarize with drill-down.

### 3.2 Operation experience, reused everywhere

An action starts from a page card, contextual device menu, or the catalog, but creates the same backend job. It opens an operation view (full page, optional side-panel shortcut) with:

- **Outcome-oriented title** and device target; operation ID is in expandable metadata.
- Current phase, verified prerequisites, start time/duration, clear terminal/uncertain state.
- Determinate progress only when the capability supplies a genuine measurable denominator; otherwise step timeline/spinner.
- **Collapsible execution details** streaming redacted stdout/stderr and semantic events with search/severity/time and follow/pause controls.
- Durable `awaiting_user` checkpoint with precise consequence, choices and confirmation. Leaving the page does not cancel the job.
- Action buttons reflect actual supported controls: `View details`, `Respond`, `Request stop` only if safe and allowed, `Export redacted report`.

### 3.3 Action forms and confirmations

Action catalog, Setup, and contextual Device Details all use the same canonical action metadata. RJSF provides validated fields but the surrounding user experience is intentionally designed: grouped sections, inline explanations, contextual warnings, credential treatment, and risk confirmation. Do not generate a generic wall of unlabeled inputs.

### 3.4 Visual data truth

- **Server snapshot** supplies current job/device projected view; **WebSocket** supplies updates; frontend cache invalidation does not grant authority.
- Timestamp and source when they help explain a status or ambiguous state.
- Reports separate `Observed` from `Interpretation`, with exact relevant checks accessible.
- Historical activity is not live actuator status.
- Settings show `Configured`, `Applied` and `Verified adopted` as different states where relevant.

## 4. Page layout concept cards

These are deliberate page-by-page references. Their routes and behavior follow the Implementation Guide §2.3. Illustrative examples below must be grounded in a mock/storybook fixture when rendered, not hidden fake production data.

### UI-01 — Overview, configured and functioning

**User question:** “Is my feeder system working, and is there anything I should act on?”

**Desktop composition:**

```text
[Overview]  Local feeder system                              [Run diagnostics]
[One-line system summary: 5 sources • 4 verified • 1 warning; details]
┌────────────────────────────────────┐ ┌──────────────────────────────────────┐
│ Primary feeder                     │ │ Service health                       │
│ Device identity / last observed    │ │ Broker       Online  • observed 1m │
│ Connectivity and setup state       │ │ Controller   Ready   • verified    │
│ [View device] [View camera]         │ │ State Agent  Ready   • verified    │
│                                    │ │ Camera       Idle    • observed    │
└────────────────────────────────────┘ └──────────────────────────────────────┘
┌────────────────────────────────────┐ ┌──────────────────────────────────────┐
│ Active operations                  │ │ Attention / next actions             │
│ Phase, duration, real status       │ │ Only actionable warnings/checks      │
│ [Open details]                     │ │ [Inspect diagnostics]                │
└────────────────────────────────────┘ └──────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────────┐
│ Recent meaningful activity: timeline with source, time, links             │
└────────────────────────────────────────────────────────────────────────────┘
```

**Focus:** readable condition summaries before charts. Avoid invented feeding quantities or sensor gauges. Surface recent user-impacting activity, not every heartbeat. `View camera` is a link to an authorized stream, not evidence of camera readiness.

**Alternate states:** unconfigured first-run (one primary `Start setup` action and factual preflight), degraded components (partial unknown/warning, remaining accessible), management backend offline (distinct reconnection banner).

### UI-02 — Devices and device details

**User question:** “Which feeder is this, and what do we reliably know about it?”

**Devices list:** searchable/compact listing of known records, linking to detail; identity, current observed location, readiness, discovery source/last seen, camera mapping and setup state. Currently supported guided setup is one feeder per deployment; do not advertise unsupported `Add another feeder` semantics.

**Device detail desktop layout:**

```text
[Devices / PLAF203] Product • serial (partially masked)      [Diagnostics] [Actions]
[Connection: observed] [Persistent state: verified] [Last seen: time + source]
┌──────────────────────────────────────┐ ┌─────────────────────────────────────┐
│ Feeder snapshot                      │ │ Readiness & identity                 │
│ Read-only settings/plan summaries    │ │ Firmware, MQTT, State Agent, IP      │
│ Verification time and source         │ │ Source/age for individual fields    │
└──────────────────────────────────────┘ └─────────────────────────────────────┘
[Tabs: Overview | Feeding & Plans | Camera | Connectivity | Activity]
┌────────────────────────────────────────────────────────────────────────────┐
│ Selected tab: relevant detail / unavailable-state explanation              │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Focus:** emphasize source-aware, read-only operation. `Feeding & Plans` summarizes verified plans but does not bypass the AppDaemon write coordinator. `Camera` can show stream metadata and playback when authorized. Show offline/stale states per source, not one fused state.

### UI-03 — Setup, guided bootstrap

**User question:** “What do I need to do next, what is the device doing, and what is safe?”

**Stage narrative (concept grouping; not a frozen execution state machine):**
1. Preflight / Home Assistant & network readiness
2. Feeder target and broker configuration
3. Recovery key and bootstrap artifacts
4. Temporary broker and feeder identity capture
5. Final broker account/credential checkpoint
6. Guarded OTA and feeder restart
7. Broker handoff, State Agent, add-on integration verification
8. Completion / retained recovery information

The exact broker stop/start/checkpoint ordering remains **subject to real same-host handoff validation**. Do not draw a permanently hardcoded stepper implying a tested physical sequence.

**Desktop composition:**

```text
[Setup]  Install Petlibro Local on your feeder             [View prior operation]
┌────────────────────┬────────────────────────────────────┬────────────────────────┐
│ Stage navigator    │ CURRENT STAGE                      │ Operation activity     │
│ ✓ Preflight        │ Step name and plain explanation    │ Phase timeline         │
│ ✓ Target           │ Prerequisites & verified results   │ Running / waiting      │
│ ● Broker identity  │ Required user action or live work  │ Expandable logs        │
│ ○ Credential check │ Schema-driven fields / checkpoint  │ Evidence links         │
│ ○ Bootstrap OTA    │ Safety and disruption warnings     │                        │
│ ○ Verification     │ [Primary next action] [Safe back]  │                        │
│ ○ Complete         │                                    │                        │
└────────────────────┴────────────────────────────────────┴────────────────────────┘
```

**Focus:** high legibility of the current decision and safety consequences; never compete with live logs for space. Explicitly label a broker account checkpoint as user action. Show device-altering boundary before OTA. Keep recovery SSH key backup status prominent without displaying secrets. Show operations surviving refresh/reconnect. When blocked/indeterminate, replace an invented progress bar with evidence and supported next actions.

**On mobile/Ingress:** single main column, condensed stage indication, sticky or clearly accessible primary action, collapsible operations panel.

### UI-04 — Operations, live detail and historical list

**User question:** “What is the job actually doing and what happened?”

**List:** filterable table/cards for running, awaiting user, completed, failed, interrupted/indeterminate jobs with timestamps and linked device. No optimistic completion.

**Detail composition:**

```text
[Operations / Bootstrap #...]                                 [Export redacted]
[Running]  Stage: broker capture      Elapsed: 02:14   [Feeder target]
┌───────────────────────────────────┐ ┌─────────────────────────────────────┐
│ Verified phase timeline           │ │ Operation summary                   │
│  ✓ Prerequisites                  │ │ Owner and active resource           │
│  ✓ Artifact verified              │ │ Last confirmed evidence             │
│  ● Capture identity               │ │ Safe/available next action          │
│  ○ Broker credential check        │ │ Warning or checkpoint, if present   │
│  ○ OTA + verification             │ └─────────────────────────────────────┘
└───────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────────┐
│ Execution details  [Expanded ▾]  Search  Severity  Source  [Follow] [Pause] │
│ 12:02:14 [worker] Listener acquired ...                                   │
│ 12:02:18 [worker] Feeder CONNECT observed ...                             │
│ … redacted, virtualized, correlated                                       │
└────────────────────────────────────────────────────────────────────────────┘
```

**Focus:** evidence-first progress, collapsible log details, stable operation ID/deep link, apparent control ownership. `Pause` pauses **log follow only**, not device work. Indeterminate outcomes must have their own distinct full-page result with what is known/unknown and permitted recovery.

### UI-05 — Diagnostics, observability and logs

**User question:** “Which subsystem is failing, how confident are we, and what can I check?”

**Diagnostic page:**

```text
[Diagnostics] Target: PLAF203 / system        [Run selected checks] [Export report]
[Overall: 4 passes, 1 warning, 1 unavailable — sample only]
┌──────────────────────────────┐ ┌──────────────────────────────────────┐
│ Categories / selected tests  │ │ Selected check detail                │
│ □ Feeder identity            │ │ Observation + status                │
│ □ Broker connectivity        │ │ Source, timestamp, expected value   │
│ □ Controller reconciliation  │ │ What this means / limitations       │
│ □ State Agent                │ │ Expand raw/redacted evidence        │
│ □ Camera transport           │ │ Link related logs/operation         │
│ □ Platform/configuration     │ └──────────────────────────────────────┘
└──────────────────────────────┘
[Recent diagnostic runs, retained results, unresolved warnings]
```

**Log page:** filter toolbar (source, severity, operation/device, time, search); large virtualized, monospaced stream; auto-follow/pause display, redacted export and copy. No device command box. `History` is a separate meaningful-event timeline, not a duplicate log viewer.

**Focus:** source and time visible, observed fact separate from interpretation, a failure to query source not interpreted as device failure, no invented commands.

### UI-06 — Actions/Maintenance

**User question:** “What operations are available for this device, and is it safe to run one now?”

**Composition:** outcome-based categories (`Install & recover`, `Inspect & verify`, `Maintenance & updates` subject to real supported capability inventory), compact cards listing purpose, target, applicability, risk, availability reason and `Open` action. The actual action form is a contextual side panel or dedicated page, with RJSF field grouping and a distinct explicit confirmation for disruptive operations. Unimplemented capabilities are omitted, not rendered as active buttons.

### UI-07 — History

**User question:** “What meaningful events and changes occurred?”

**Composition:** time-range controls, device/source/type filters, chronological event groups with source, time, result classification and links to related operations/diagnostic evidence. Separate historical observations from live statuses.

### UI-08 — Settings

**User question:** “What can I configure, what does it affect, and has it actually taken effect?”

**Composition:** restrained grouped tabs/sections: Management preferences, Integrations, Credentials & Recovery, Diagnostics/Logging, About/Versions. Settings cards distinguish values owned by management from Home Assistant add-on options. Supported settings changes show whether they are saved, applied to service configuration, and verified adopted. Secret values are never echoed after entry; recovery key custody uses an explicit protected workflow.

## 5. Shared states and key design variants

Codex should implement components with explicit stories/test cases for these states, not just an all-green fictional happy path:

| Variant ID | Where | Key treatment |
|---|---|---|
| STATE-01 | Overview, first launch | No discovered feeder; first-run `Start setup`; management backend may be healthy while controller is not ready |
| STATE-02 | Overview, degraded | Broker/device/agent disconnected independently; diagnostic link and last source timestamp |
| STATE-03 | Setup, awaiting operator | Clear broker-account or service handoff checkpoint; durable job ID; unaffected by refresh |
| STATE-04 | Setup/operation, running | Real stage and live logs; evidence-based progress only; no false percentage |
| STATE-05 | Operation, indeterminate | Prominent uncertainty; last verified evidence; no blind `Retry OTA` |
| STATE-06 | Device detail, stale | Retained historical snapshot labeled stale; no persistent-write controls based on it |
| STATE-07 | Diagnostics, partial | Individual check failures and missing sources separately labeled |
| STATE-08 | Small/Ingress viewport | Usable navigation, forms, log panel and safe checkpoints without horizontal page clipping |

## 6. Design tokens and density guidelines (proposed)

These are **starting visual parameters**, not architecture constraints or exact implementation CSS:

- **Dark palette concept:** background near slate `#0B1220`, slightly raised surfaces `#121D2B`/`#182637`, subtle cool border `#2A3A4B`, primary text `#EBF2F5`, secondary text `#98A8B5`.
- **Accent:** cyan-teal around `#34B8B0`; visually distinct from verified-success green. Warnings amber `#E9AE57`; failures muted coral/red `#E27776`.
- **Light theme:** warm/cool off-white background, white surfaced panels, slate text, related muted accent; evaluate contrast separately. Do not use an automatic inverted screenshot.
- **Typography:** legible contemporary sans, restrained headings; monospaced only for IDs, timestamps, log entries, hashes and structured evidence.
- **Spacing:** approximately 8px base rhythm; comfortable controls; 16–24px content/card padding where useful; more compact in log lines and dense tables.
- **Shape:** modest rounded cards ~8–12px, thinner dividers and understated shadows; avoid large floating glass panels.
- **Layout:** desktop sidebar about 220–250px; content can use a 12-column grid; avoid treating these dimensions as hardcoded Ingress assumptions.
- **Charts:** only when genuine data exists and assists interpretation; no generic doughnut gauges for connectivity. If telemetry is absent, show a useful empty-state or missing-source explanation.
- **Illustrated fixtures:** use plainly identified sample data in Storybook/design screenshots. Production UI must not synthesize `online`, success, percentages, timestamps or sensor values.

## 7. Reference image set for visual exploration

Reference image generation should prioritize **6 cohesive views**, all with the same shell, typography, color tokens, component styling, icon language and behavior semantics. Images are visual references for Codex, not live screenshots or pixel-exact acceptance criteria.

| ID | Image target | Key features | Why this reference matters |
|---|---|---|---|
| **REF-01** | Overview, configured (desktop 16:9) | Sidebar, top bar, device condition, service health, active job and recent activity | Establishes global hierarchy and density |
| **REF-02** | Setup with operator checkpoint (desktop 16:9) | Stage rail, guided form/checkpoint, risk notice, real-looking but *illustrative* operation log | Establishes most complex user workflow |
| **REF-03** | Live operation detail (desktop 16:9) | Phase timeline, result/evidence panel, expanded virtualized log area and controls | Establishes shared operation behavior |
| **REF-04** | Device detail (desktop 16:9) | Source-aware device state, read-only plans, camera area, tabs | Establishes authority-safe device projection |
| **REF-05** | Diagnostics (desktop 16:9) | Test groups, source-aware results, evidence and interpretations | Establishes expert detail and failure transparency |
| **REF-06** | Responsive management view (mobile/Ingress narrow) | Drawer nav, compact health summary, clear next action and expandable logs | Proves the shell is not desktop-only |

**Consistency requirements for the reference set:**

- Share `Petlibro Local` management identity across screens.
- Use the same left navigation and status styling for desktop views; use a consistent adapted navigation pattern for narrow screens.
- Prioritize readable hierarchy. Small mock text may not be exact; copy must be corrected when implemented from schemas and real backend data.
- Avoid giving mockups an implausibly production-ready full-device data state. The six examples illustrate distinct UI states, including caution/unknown status and user checkpoints.
- No fabricated functionality (e.g. `Factory reset now`, generic shell runner, unsupported multi-feeder installer).
- Meaningful errors and user warnings have a visible place in the composition.

### 7.1 Concise art-direction brief for concept image generation

> Design high-fidelity **desktop application UI concepts** for **Petlibro Local Management**, a technical yet approachable Home Assistant feeder management web app. Use an elegant dark slate interface, restrained teal accent, subtle borders, flat operational cards, readable typography, small line icons, left navigation with Overview / Devices / Setup / Actions / Operations / Diagnostics / Logs / History / Settings, compact top utility bar, and dense-but-spacious information hierarchy. Show genuine-looking interface structure but treat all textual values as **illustrative mockup fixtures**, not real device telemetry. No futuristic neon, gaudy gradients, speculative sensor readings, redundant green indicators or decorative gauges. Use the page-specific layouts in REF-01 through REF-06. Make each concept a coherent member of the same design system, preserving correct distinction between healthy, warning, unknown, running, and awaiting-user states.

## 8. Codex implementation translation and review guidance

1. Begin by establishing the **shared application shell, design tokens, navigation, typography, basic buttons/cards/badges/alerts, and responsive layout**, not by reproducing an image's fake data values.
2. Implement page shells with **real capability availability and source-aware empty/initializing/offline states** if runtime data is not yet supported. Mock data belongs only in tests, a dedicated fixture/preview route, or explicit design tooling.
3. Build **reusable** `StatusSummary`, `ServiceHealth`, `OperationProgress`, `OperationDetails`, `OperationCheckpoint`, `ActionForm`, `LogViewer`, and `DiagnosticResults` as their real contracts become available.
4. Use the same `ActionCatalog` contract across Setup, Actions, and contextual device views. Do not fork independent form validation or capability availability rules.
5. Use the same job snapshot/event model for Overview active-job cards and Operations detail. A browser or accordion cannot own or cancel worker operations by accident.
6. Preserve accessibility and keyboard behavior, particularly multi-step Setup, dialogs, dense logs and status labeling.
7. Treat generated screenshots as design-review input. Reconcile any visual idea against the actual implementation guide and architecture map before building it.
8. Keep this document's visual choices easy to revise through shared tokens and components; avoid rigid page-specific CSS variants until justified by real interaction differences.

## 9. Open design questions for later visual review

- Should device-specific pages adopt a persistent device-context selector or rely mostly on route identity and breadcrumbs? The architecture supports future multiple records but current installer supports one deployed feeder.
- Should Setup use a fixed left stage rail, a collapsible timeline, or a hybrid responsive pattern after real broker-handoff stages are validated?
- Should an active operation appear as a global minimized activity strip/drawer as well as the full detail route?
- When does authorized camera preview belong in a device page versus an explicit camera-focused section, given stream startup and browser/Ingress limitations?
- Which status terms and user-facing copy best distinguish feeder connectivity, controller reconciliation readiness, and State Agent health without overwhelming non-expert users?
- What authenticated direct-access entry experience is appropriate once the platform security contract is implemented?

**Design invariant:** The web application presents user intent, safe actions, operations and source-aware observations. It never becomes the independent authority over feeder persistent state or the lifecycle of a worker-owned technical transaction merely because an interaction is visible on a page.
