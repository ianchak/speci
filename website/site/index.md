---
title: Speci — AI-powered Copilot workflow orchestrator
description: Automate plan → task → implement → review loops with GitHub Copilot and quality gate validation.
---

<section class="hero">
  <div class="container hero-inner">
    <div class="hero-copy reveal">
      <span class="kicker hero-eyebrow">// autonomous copilot loop</span>
      <h1 class="hero-title">Ship features<br />while the <span class="grad">loop runs.</span></h1>
      <p class="hero-subtitle">
        Speci drives GitHub Copilot through a complete <strong>plan → task → implement → review</strong>
        cycle, running <span class="mark">lint, typecheck, and tests</span> between every step — so the
        agent keeps itself honest.
      </p>
      <div class="hero-actions">
        <a href="/getting-started/" class="btn btn-primary">Get Started <span class="arrow">→</span></a>
        <a href="/commands/" class="btn btn-secondary">Command Reference</a>
      </div>
      <div class="hero-meta">
        <span class="hero-meta-item">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          quality gates built in
        </span>
        <span class="hero-meta-item">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          hands-free iteration
        </span>
        <span class="hero-meta-item">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/></svg>
          node ≥ 22, zero config
        </span>
      </div>
    </div>
    <div class="hero-diagram reveal">
      <div class="console" id="boot-console" data-boot="pending">
        <div class="console-bar">
          <span class="console-dots" aria-hidden="true"><span></span><span></span><span></span></span>
          <span class="console-title">speci — orchestrator</span>
        </div>
        <div class="console-body" aria-label="Example speci run">
          <span class="cl"><span class="prompt">$</span><span class="cmd">speci yolo</span> <span class="flag">-p</span> <span class="str">"Add JWT auth"</span></span>
          <span class="cl"><span class="dim">[plan]</span>  generating implementation plan… <span class="ok">ok</span></span>
          <span class="cl"><span class="dim">[task]</span>  6 tasks → docs/PROGRESS.md</span>
          <span class="cl"><span class="dim">[run]</span>   entering autonomous loop</span>
          <span class="cl is-indent">→ <span class="cmd">impl</span>    gate: lint·typecheck·test</span>
          <span class="cl is-indent">→ <span class="cmd">gate</span>    <span class="warn">1 failing</span> — dispatching fix</span>
          <span class="cl is-indent">→ <span class="cmd">fix</span>     re-running gate… <span class="ok">passed</span></span>
          <span class="cl is-indent">→ <span class="cmd">review</span>  task complete <span class="ok">✓</span></span>
          <span class="cl"><span class="ok">loop:</span> 6/6 tasks done — ready to ship<span class="caret" aria-hidden="true"></span></span>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section section--ruled">
  <div class="container">
    <div class="section-head reveal">
      <span class="kicker">// the pipeline</span>
      <h2 class="section-title">Four commands,<br />one autonomous flow.</h2>
      <p class="section-sub">Each stage hands off cleanly to the next. Start manual, then let the loop run unattended.</p>
    </div>
    <div class="steps">
      <div class="step-card reveal" data-index="01">
        <span class="step-index">01</span>
        <h3>Plan</h3>
        <p>Dispatch the plan agent with a prompt or spec document. It returns a structured implementation plan.</p>
        <a href="/commands/plan/" class="step-link">speci plan <span class="arrow">→</span></a>
      </div>
      <div class="step-card reveal" data-index="02">
        <span class="step-index">02</span>
        <h3>Task</h3>
        <p>Break the plan into trackable tasks and generate a <code>PROGRESS.md</code> state file.</p>
        <a href="/commands/task/" class="step-link">speci task <span class="arrow">→</span></a>
      </div>
      <div class="step-card reveal" data-index="03">
        <span class="step-index">03</span>
        <h3>Run</h3>
        <p>Enter the autonomous loop: implement → gate → fix → review, until every task is done.</p>
        <a href="/commands/run/" class="step-link">speci run <span class="arrow">→</span></a>
      </div>
      <div class="step-card is-alt reveal" data-index="→">
        <span class="step-index">→</span>
        <h3>Or YOLO</h3>
        <p>Run the entire pipeline end-to-end in a single command: <code>speci yolo</code>.</p>
        <a href="/commands/yolo/" class="step-link">speci yolo <span class="arrow">→</span></a>
      </div>
    </div>
  </div>
</section>

<section class="section section--ruled">
  <div class="container">
    <div class="section-head is-centered reveal">
      <span class="kicker">// under the hood</span>
      <h2 class="section-title">A self-correcting iteration loop</h2>
      <p class="section-sub">Speci reads <code>PROGRESS.md</code>, dispatches the right agent, and only advances when the gates pass.</p>
    </div>
    <div class="loop-wrap reveal">
      <div class="loop">
        <span class="loop-node" style="--i:0"><span class="nd"></span>implement</span>
        <span class="loop-arrow">→</span>
        <span class="loop-node" style="--i:1"><span class="nd"></span>gate</span>
        <span class="loop-arrow">→</span>
        <span class="loop-node alt" style="--i:2"><span class="nd"></span>fix</span>
        <span class="loop-arrow">→</span>
        <span class="loop-node" style="--i:3"><span class="nd"></span>review</span>
        <span class="loop-arrow">↻</span>
        <span class="loop-node" style="--i:4"><span class="nd"></span>next task</span>
      </div>
    </div>
  </div>
</section>

<section class="cta">
  <div class="container">
    <div class="cta-inner reveal">
      <div class="cta-prompt"><span class="prompt">$</span> npx speci init</div>
      <h2>Put your Copilot on autopilot</h2>
      <p>Run instantly with <code>npx speci</code> - no install required</p>
      <div class="hero-actions" style="justify-content:center">
        <a href="/getting-started/" class="btn btn-primary">Get Started <span class="arrow">→</span></a>
        <a href="https://github.com/ianchak/speci" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">View on GitHub</a>
      </div>
    </div>
  </div>
</section>
