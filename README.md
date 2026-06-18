# ChaoSim

An immersive production incident simulation. You are a senior engineer dropped into a live outage: the payment service is down, the board demo is in 18 minutes, and the CEO is messaging you. You read the real codebase, run a terminal, find the bug, fix it, and ship, while everything you do is tracked and scored.

It is built engine-first, so incidents are data, not wiring. Two ship today: INC-4821 (Payment Service Down, a missing return after a refactor) and INC-5093 (Orders Failing Validation, a zeroed-out limit). You pick one on the welcome screen, and an objectives panel tracks your progress through it.

## Run

```bash
npm install
npm run dev        # play at http://localhost:5174
npm test           # headless scenario tests (node --test)
npm run build      # typecheck + production build
```

Requires Node 22.6+ for the tests, any modern browser for the sim.

## The loop

1. **Welcome.** Enter your name and the incident begins. The clock starts; the CEO sends her first panicked message.
2. **Diagnose.** Read `src/logs/error.log`. The stack trace names the file and line: `index.js:11`, a `TypeError: Cannot read property 'ok' of undefined`.
3. **Find the bug.** Open `payment.js`. After the recent refactor (see `git log` in the terminal, or the KB), `charge()` no longer returns its result on the success path, so the caller gets `undefined`.
4. **Fix it.** Edit `payment.js` (it is editable) to return the result.
5. **Verify.** Run `npm test` in the terminal. It fails before the fix, passes after.
6. **Ship.** Run `restart payment-service`. Once the code is fixed and tests pass, the service comes back and the incident is mitigated.
7. **Communicate.** Throughout, reply to the CEO. Silence is penalized.
8. **Submit for evaluation.** You get a graded breakdown of how you worked.

The timeline at the bottom (Alerted, Diagnosing, Fixing, Testing, Resolved) advances as you actually do these things.

## Save and resume

The incident autosaves continuously to the browser. Click the CHAOS SIM logo to exit to the menu, and a "Resume in progress" option appears showing the incident and how far in you were. Resuming restores everything: the open files, your edits, the objectives, the timeline, and the clock. Submitting clears the save. The persistence layer is in [src/state/persistence.ts](src/state/persistence.ts).

## Incident beats

Each scenario carries timed dramatic events. If you do not resolve fast enough, the incident escalates: a full-screen "PRODUCTION FULLY DOWN" beat that actually worsens the live metrics (error rate pins to 100%, latency climbs), a CEO call that interrupts and must be answered, and a board-is-watching beat near the deadline. Resolve it and you get a green "INCIDENT MITIGATED" beat instead. These are data on the scenario (`events`), so each incident has its own.

## Live observability

A metrics bar sits under the header and updates every second: status (DOWN / HEALTHY), error rate, failed requests, revenue lost, and p95 latency. While the service is down they climb and glow red; the moment you resolve the incident they snap to green. The error log is a live firehose: new alerts stream in and auto-scroll while it is broken, then clear when it recovers. This is the doc's "metrics and observability" plus "firehose", and it is what turns reading a log into watching production bleed. The logic lives in [src/state/metrics.ts](src/state/metrics.ts).

## What is being evaluated

ChaoSim does not grade whether one line of code changed. It grades behavior, and the report is the product. Submitting produces a weighted, defensible breakdown across five dimensions, each scored 0 to 100 with specific notes:

* **Resolution & speed** (30%): did the outage end, and how fast against the deadline.
* **Diagnosis** (22%): read the logs before touching code, opened the actual root-cause file, consulted the docs.
* **Verification** (20%): reproduced the failure with a test first, confirmed the fix, restarted only after green.
* **Communication** (18%): replied to the CEO, how fast, how often, and whether they kept talking after the incident escalated.
* **Discipline** (10%): clean, efficient work versus typos and editing churn.

The engine tracks the underlying signals as you play (first action, what you opened and in what order, tests before and after the fix, reply latency, command errors) and turns them into the scored report. That logic lives in [src/state/evaluation.ts](src/state/evaluation.ts).

## Architecture

```
src/
  scenario/
    types.ts          the Scenario shape (files, CEO script, KB, fix rule)
    paymentOutage.ts  INC-4821 as pure data: the broken codebase, logs, CEO, KB
  state/
    types.ts          the incident state shape
    terminal.ts       the bash command interpreter (ls, cat, npm test, restart, git log)
    evaluation.ts     turns tracked behavior into a graded result
    useIncident.ts    the reducer + live clock + CEO escalation
  components/         Welcome, TopBar, Explorer, Editor, CeoChat, Terminal, Timeline, KbModal, EvaluationModal
  App.tsx, main.tsx
test/
  scenario.test.ts    the fix flow, the terminal, and the evaluation
```

A scenario is data. To add a second incident (a memory leak, a bad deploy, a runaway query), you write another `Scenario` object: its files, its bug, its CEO script, its fix rule. The engine, the IDE shell, the terminal, and the evaluation are all scenario agnostic.

## Adding a scenario

Implement the `Scenario` interface in `src/scenario/`, give it a `bugFile` and an `isFixed` predicate, and point `App.tsx` at it. Everything else works unchanged.
