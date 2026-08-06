# Collective Codex Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a Vercel-ready vertical slice with all 21 divisions, 54 sheet manifests, 1,134 registry slots and a functional three-lane battlefield prototype.

**Architecture:** Browser-native JavaScript renders the overview, Codex browser and battlefield. Pure modules own canonical data and deterministic match state so rendering can later move to Three.js without rewriting rules.

**Tech Stack:** Modern JavaScript modules, HTML, CSS, Node test runner.

## Global Constraints

- Preserve all 21 locked divisional icons.
- Do not expose personal ownership or developer favoritism.
- Keep ranked-facing mechanics normalized.
- Mark untranscribed generated-card metadata as provisional.
- Deploy to Vercel.

### Task 1: Scaffold and registry
- Create static project files.
- Add 21 divisions and 54 sheets.
- Generate and validate 1,134 unique registry entries.
- Verify with `npm run test`.

### Task 2: Product UI
- Build overview, doctrine grid and Codex browser.
- Add division, family and text filters.
- Implement responsive Collective AI visual system.
- Verify with `npm run build`.

### Task 3: Battlefield prototype
- Add deterministic match state.
- Add three lanes, resources, hand selection, deploy and end-turn actions.
- Verify with unit tests and production build.

### Task 4: Repository and Vercel
- Commit on a feature branch.
- Open a draft pull request.
- Deploy preview to Vercel.
- Verify the deployment URL.
