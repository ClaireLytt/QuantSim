# /correct 错误类 C: 次级文字链收口为 qs-textlink —— 给 10 个按钮挂类, 删三处重复规则。
import io
import re

IDS = ["btn-help", "btn-tour", "btn-tune", "btn-code-copy", "btn-code-import",
       "btn-duel-final", "btn-duel-history", "btn-duel-final-detail",
       "btn-duel-final-back", "btn-duel-back"]

h = io.open('frontend/index.html', encoding='utf-8').read()
for bid in IDS:
    m = re.search(r'<button id="%s" class="([^"]*)"' % bid, h)
    assert m, bid
    if "qs-textlink" not in m.group(1):
        h = h.replace(m.group(0), '<button id="%s" class="%s qs-textlink"' % (bid, m.group(1)))
io.open('frontend/index.html', 'w', encoding='utf-8', newline='\n').write(h)

def drop_block(path, start_marker, n_blocks):
    """从 start_marker 行起删除 n_blocks 个 { } 规则块。"""
    s = io.open(path, encoding='utf-8').read()
    i = s.index(start_marker)
    j = i
    for _ in range(n_blocks):
        j = s.index('}', j) + 1
    io.open(path, 'w', encoding='utf-8', newline='\n').write(s[:i] + s[j:].lstrip('\n'))

# style.css: 删 start-links 的两个 button.ghost 块 (保留容器 gap 行)
drop_block('frontend/style.css', '/* 双类选择器压过后文的 button.ghost', 2)
# game.css: 删 arena-ops 的 ghost 三块 (保留容器 justify/gap 行)
drop_block('frontend/game.css', '#view-arena .arena-ops button.ghost {', 3)
# lab-games.css: 删 duel qd-actions 的链接两块 (保留 primary 与容器规则)
drop_block('frontend/lab-games.css', '/* 返回擂台榜/查看详情: 降为文字链', 2)
print('textlink migrated')
