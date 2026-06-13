---
title: Speci — AI-powered Copilot workflow orchestrator
description: Automate plan → task → implement → review loops with GitHub Copilot and quality gate validation.
---

<section class="hero">
  <div class="container">
    <h1 class="hero-title">Orchestrate your Copilot workflows</h1>
    <p class="hero-subtitle">
      Speci drives GitHub Copilot through a full <strong>plan → task → implement → review</strong> loop,
      running lint, typecheck, and tests between every step — hands-free.
    </p>
    <div class="hero-actions">
      <a href="/getting-started/" class="btn btn-primary">Get Started</a>
      <a href="/commands/" class="btn btn-secondary">Command Reference</a>
    </div>
    <pre class="hero-code"><code>npx speci init
npx speci plan -p "Add user authentication with JWT"
npx speci task --plan docs/plan.md
npx speci run</code></pre>
  </div>
</section>

<section class="features">
  <div class="container">
    <h2>How it works</h2>
    <div class="feature-grid">
      <div class="feature-card">
        <h3>1. Plan</h3>
        <p>Dispatch the plan agent with a prompt or spec document. It outputs a structured implementation plan.</p>
        <a href="/commands/plan/">speci plan →</a>
      </div>
      <div class="feature-card">
        <h3>2. Task</h3>
        <p>Break the plan into trackable tasks and generate a <code>PROGRESS.md</code> file.</p>
        <a href="/commands/task/">speci task →</a>
      </div>
      <div class="feature-card">
        <h3>3. Run</h3>
        <p>Enter the autonomous loop: implement → gate → fix → review, until all tasks are done.</p>
        <a href="/commands/run/">speci run →</a>
      </div>
      <div class="feature-card">
        <h3>Or YOLO</h3>
        <p>Run the full pipeline in a single command: <code>speci yolo</code>.</p>
        <a href="/commands/yolo/">speci yolo →</a>
      </div>
    </div>
  </div>
</section>

<section class="agents">
  <div class="container">
    <h2>Agent summary</h2>
    <table>
      <thead>
        <tr><th>Agent</th><th>Triggered by</th><th>Purpose</th></tr>
      </thead>
      <tbody>
        <tr><td><code>plan</code></td><td><code>speci plan</code></td><td>Generate a structured implementation plan</td></tr>
        <tr><td><code>task</code></td><td><code>speci task</code></td><td>Break plan into tasks and create PROGRESS.md</td></tr>
        <tr><td><code>refactor</code></td><td><code>speci refactor</code></td><td>Analyse the codebase for refactoring opportunities</td></tr>
        <tr><td><code>impl</code></td><td>WORK_LEFT state</td><td>Implement the next task</td></tr>
        <tr><td><code>review</code></td><td>IN_REVIEW state</td><td>Review completed work for correctness</td></tr>
        <tr><td><code>fix</code></td><td>Gate failure</td><td>Repair lint, typecheck, or test failures</td></tr>
        <tr><td><code>tidy</code></td><td>BLOCKED state</td><td>Clean up or unblock dependencies</td></tr>
      </tbody>
    </table>
  </div>
</section>
