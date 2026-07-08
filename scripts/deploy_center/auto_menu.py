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
    </section>
    """

