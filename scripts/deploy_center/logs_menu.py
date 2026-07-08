from __future__ import annotations


def render_logs_menu() -> str:
    return """
    <section id="view-logs" class="view">
      <div class="card">
        <h2>部署日志</h2>
        <p class="sub">自动部署 + 手动部署都会写入本地 SQLite，可展开看详情。</p>
        <button id="refresh-logs" class="btn-ghost">刷新日志</button>
      </div>
      <div class="card">
        <div id="logs-list" class="logs-list"></div>
      </div>
    </section>
    """

