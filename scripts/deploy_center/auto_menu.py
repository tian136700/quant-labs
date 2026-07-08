from __future__ import annotations


def render_auto_menu() -> str:
    return """
    <section id="view-auto" class="view active">
      <div class="card">
        <h2>自动部署</h2>
        <p class="sub">24 小时无人值守监控：检测自动任务是否在线、当前是否有部署任务。</p>
        <div id="auto-summary" class="kv"></div>
        <button id="refresh-auto" class="btn-ghost">刷新自动部署状态</button>
      </div>
      <div class="card">
        <h3>当前部署监控</h3>
        <div id="auto-runtime" class="kv"></div>
      </div>
      <div class="card">
        <div class="progress-track"><div id="auto-bar" class="progress-bar"></div></div>
        <div id="auto-steps" class="steps"></div>
        <div id="auto-status" class="status-line">待命</div>
      </div>
      <div class="card">
        <div class="log-toolbar">
          <h3>自动部署日志</h3>
          <button id="auto-copy-log" class="btn-ghost">复制日志</button>
        </div>
        <pre id="auto-log" class="log-box" tabindex="0"></pre>
      </div>
    </section>
    """

