---
title: Speci — AI-powered Copilot workflow orchestrator
description: Automate plan → task → implement → review loops with GitHub Copilot and quality gate validation.
---

<section class="hero">
  <div class="container hero-inner">
    <div class="hero-copy reveal">
      <span class="hero-eyebrow"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 2.5A7 7 0 1 0 14.5 8"/><polyline points="13.5 2.5 13.5 6.5 9.5 6.5"/></svg> Autonomous Copilot loop</span>
      <h1 class="hero-title">Ship features while the<br /><span class="grad">loop does the work.</span></h1>
      <p class="hero-subtitle">
        Speci drives GitHub Copilot through a complete <strong>plan → task → implement → review</strong>
        cycle, running lint, typecheck, and tests between every step — so the agent keeps itself honest.
      </p>
      <div class="hero-actions">
        <a href="/getting-started/" class="btn btn-primary">Get Started <span class="arrow">→</span></a>
        <a href="/commands/" class="btn btn-secondary">Command Reference</a>
      </div>
      <div class="hero-meta">
        <span class="hero-meta-item">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Quality gates built in
        </span>
        <span class="hero-meta-item">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          Hands-free iteration
        </span>
        <span class="hero-meta-item">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/></svg>
          Node ≥ 22, zero config
        </span>
      </div>
    </div>
    <div class="hero-diagram reveal">
      <div class="pipeline">
        <div class="pipeline-step">
          <span class="pipeline-num">01</span>
          <div class="pipeline-info">
            <span class="pipeline-cmd">speci plan</span>
            <span class="pipeline-desc">Generate implementation plan</span>
          </div>
          <svg class="pipeline-check" viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 8 6 11 13 4"/></svg>
        </div>
        <div class="pipeline-step">
          <span class="pipeline-num">02</span>
          <div class="pipeline-info">
            <span class="pipeline-cmd">speci task</span>
            <span class="pipeline-desc">6 tasks → PROGRESS.md</span>
          </div>
          <svg class="pipeline-check" viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 8 6 11 13 4"/></svg>
        </div>
        <div class="pipeline-step pipeline-step--active">
          <span class="pipeline-num pipeline-num--active">03</span>
          <div class="pipeline-info">
            <span class="pipeline-cmd">speci run</span>
            <span class="pipeline-desc">Autonomous loop running…</span>
          </div>
          <svg class="pipeline-spin" viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1"/></svg>
        </div>
        <div class="pipeline-loop">
          <span class="ploop-node">impl</span>
          <span class="ploop-arrow">→</span>
          <span class="ploop-node">gate</span>
          <span class="ploop-arrow">→</span>
          <span class="ploop-node ploop-fix">fix?</span>
          <span class="ploop-arrow">→</span>
          <span class="ploop-node">review</span>
          <span class="ploop-arrow ploop-repeat">↻</span>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head reveal">
      <p class="section-eyebrow">The pipeline</p>
      <h2 class="section-title">Four commands, one autonomous flow</h2>
      <p class="section-sub">Each stage hands off cleanly to the next. Start manual, then let the loop run unattended.</p>
    </div>
    <div class="steps">
      <div class="step-card reveal">
        <span class="step-index">01</span>
        <h3>Plan</h3>
        <p>Dispatch the plan agent with a prompt or spec document. It returns a structured implementation plan.</p>
        <a href="/commands/plan/" class="step-link">speci plan <span class="arrow">→</span></a>
      </div>
      <div class="step-card reveal">
        <span class="step-index">02</span>
        <h3>Task</h3>
        <p>Break the plan into trackable tasks and generate a <code>PROGRESS.md</code> state file.</p>
        <a href="/commands/task/" class="step-link">speci task <span class="arrow">→</span></a>
      </div>
      <div class="step-card reveal">
        <span class="step-index">03</span>
        <h3>Run</h3>
        <p>Enter the autonomous loop: implement → gate → fix → review, until every task is done.</p>
        <a href="/commands/run/" class="step-link">speci run <span class="arrow">→</span></a>
      </div>
      <div class="step-card is-alt reveal">
        <span class="step-index">→</span>
        <h3>Or YOLO</h3>
        <p>Run the entire pipeline end-to-end in a single command: <code>speci yolo</code>.</p>
        <a href="/commands/yolo/" class="step-link">speci yolo <span class="arrow">→</span></a>
      </div>
    </div>
  </div>
</section>

<section class="loop-section">
  <div class="container">
    <div class="section-head reveal">
      <p class="section-eyebrow">Under the hood</p>
      <h2 class="section-title">A self-correcting iteration loop</h2>
      <p class="section-sub">Speci reads <code>PROGRESS.md</code>, dispatches the right agent, and only advances when the gates pass.</p>
    </div>
    <div class="loop reveal">
      <span class="loop-node"><span class="nd"></span>implement</span>
      <span class="loop-arrow">→</span>
      <span class="loop-node"><span class="nd"></span>gate</span>
      <span class="loop-arrow">→</span>
      <span class="loop-node alt"><span class="nd"></span>fix</span>
      <span class="loop-arrow">→</span>
      <span class="loop-node"><span class="nd"></span>review</span>
      <span class="loop-arrow">↻</span>
      <span class="loop-node"><span class="nd"></span>next task</span>
    </div>
  </div>
</section>

<section class="cta">
  <div class="container">
    <div class="cta-inner reveal">
      <h2>Put your Copilot on autopilot</h2>
      <p>Install in seconds and run your first hands-free workflow today.</p>
      <div class="hero-actions" style="justify-content:center">
        <a href="/getting-started/" class="btn btn-primary">Get Started <span class="arrow">→</span></a>
        <a href="https://github.com/ianchak/speci" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">View on GitHub</a>
      </div>
    </div>
  </div>
</section>
