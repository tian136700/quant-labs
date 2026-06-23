#!/usr/bin/env python3
"""本地开发入口：默认稳定模式（端口 3002，不热更新、不自动重启）。"""

from scripts.dev import run_dev_server

if __name__ == "__main__":
    run_dev_server()
