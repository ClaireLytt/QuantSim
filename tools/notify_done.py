# -*- coding: utf-8 -*-
"""Stop hook 用的 ntfy 节流通知: 10 分钟内只发一次。

ntfy.sh 免费版按 IP 有每日消息配额, Stop 事件每轮回复都触发,
裸 curl 会把配额烧光 (之后全部 429 被静默丢弃, 手机就再也收不到了)。
节流状态存在系统临时目录, 不入库。
"""
import os
import sys
import time
import tempfile
import urllib.request

TOPIC = "claire-time-tool"
THROTTLE_SECONDS = 600  # 10 分钟

stamp = os.path.join(tempfile.gettempdir(), "qs_ntfy_last_sent")
now = time.time()
try:
    if now - os.path.getmtime(stamp) < THROTTLE_SECONDS:
        sys.exit(0)  # 节流窗口内, 跳过
except OSError:
    pass  # 首次发送

try:
    req = urllib.request.Request(
        "https://ntfy.sh/" + TOPIC,
        data="Claude Code: done".encode("utf-8"),
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()
    with open(stamp, "w"):
        pass
    os.utime(stamp, (now, now))
except Exception:
    sys.exit(0)  # 通知失败不阻塞会话
