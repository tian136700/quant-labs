from __future__ import annotations


def render_manual_menu() -> str:
    return """
    <section id="view-manual" class="view">
      <div class="card">
        <h2>手动部署</h2>
        <p class="sub">提交备注后手动触发：备份 -> commit -> push -> deploy。</p>
        <label for="msg">部署备注</label>
        <input id="msg" type="text" placeholder="例如：修复 RSI 数据接口" />
        <div class="btn-row">
          <button id="publish" class="btn-primary">开始手动部署</button>
          <button id="refresh" class="btn-ghost">刷新状态</button>
        </div>
      </div>
      <div class="card">
        <div class="progress-track"><div id="manual-bar" class="progress-bar"></div></div>
        <div id="manual-steps" class="steps"></div>
        <div id="manual-status" class="status-line">待命</div>
      </div>
      <div class="card">
        <div class="log-toolbar">
          <h3>实时日志</h3>
          <button id="manual-copy-log" class="btn-ghost">复制日志</button>
        </div>
        <pre id="manual-log" class="log-box" tabindex="0"></pre>
      </div>
    </section>
    """

