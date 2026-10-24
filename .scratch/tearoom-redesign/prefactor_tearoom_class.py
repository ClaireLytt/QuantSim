# 一次性脚本: 皮肤作用域选择器从枚举 id 收敛为 .tearoom 类 (ticket 02 prefactor)
import io

p = 'frontend/widgets.css'
s = io.open(p, encoding='utf-8').read()
reps = [
    ('#view-home,\n#view-game {\n  /* —— 深夜雨屋（暗色默认） —— */',
     '.tearoom {\n  /* —— 深夜雨屋（暗色默认） —— */'),
    (':root[data-theme="light"] #view-home,\n:root[data-theme="light"] #view-game {',
     ':root[data-theme="light"] .tearoom {'),
    ('#view-home,\n#view-game {\n  box-shadow: inset 0 0 140px', '.tearoom {\n  box-shadow: inset 0 0 140px'),
    (':root:not([data-theme="light"]) #view-home,\n:root:not([data-theme="light"]) #view-game {\n  box-shadow: inset 0 0 160px',
     ':root:not([data-theme="light"]) .tearoom {\n  box-shadow: inset 0 0 160px'),
    ('#view-home button.primary,\n#view-game button.primary {', '.tearoom button.primary {'),
    ('#view-home button.primary:hover:not(:disabled),\n#view-game button.primary:hover:not(:disabled) {',
     '.tearoom button.primary:hover:not(:disabled) {'),
    (':root:not([data-theme="light"]) #view-home button.primary,\n:root:not([data-theme="light"]) #view-game button.primary {',
     ':root:not([data-theme="light"]) .tearoom button.primary {'),
    ('#view-home .home-group-grid .home-card,\n#view-home .card,\n#view-game .card {',
     '#view-home .home-group-grid .home-card,\n.tearoom .card {'),
]
for a, b in reps:
    assert a in s, 'MISS: ' + a[:60]
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

p2 = 'frontend/index.html'
h = io.open(p2, encoding='utf-8').read()
h = h.replace('<div id="view-game">', '<div id="view-game" class="tearoom">')
h = h.replace('<div id="view-home" hidden>', '<div id="view-home" class="tearoom" hidden>')
for v in ['daily', 'event', 'rooms', 'arena', 'duel', 'ranking']:
    old = '<div id="view-%s" hidden>' % v
    assert old in h, 'MISS view ' + v
    h = h.replace(old, '<div id="view-%s" class="tearoom" hidden>' % v)
io.open(p2, 'w', encoding='utf-8', newline='\n').write(h)
print('prefactor done')
