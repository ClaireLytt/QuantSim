# ticket 06 contract: widgets.css 作用域变量块删除 (值已升入 style.css :root),
# 保留 .tearoom 的结构部分 (房间背景渐变/圆角/定位)。
import io, re

p = 'frontend/widgets.css'
s = io.open(p, encoding='utf-8').read()

# 暗色块: 从 ".tearoom {\n  /* —— 深夜雨屋" 到 "border-radius: 0 0 var(--radius) var(--radius);\n}"
dark_new = (
    '.tearoom {\n'
    '  /* 房间背景 (暗色 = 深夜雨屋); 色板变量已全部升入 style.css :root (ticket 06) */\n'
    '  position: relative;\n'
    '  background:\n'
    '    radial-gradient(ellipse 54% 38% at 78% 0%, hsla(80, 25%, 55%, .12), transparent 60%),\n'
    '    linear-gradient(170deg, hsl(168, 14%, 13%), hsl(170, 16%, 8%) 70%);\n'
    '  border-radius: 0 0 var(--radius) var(--radius);\n'
    '}\n'
)
light_new = (
    ':root[data-theme="light"] .tearoom {\n'
    '  background:\n'
    '    radial-gradient(ellipse 60% 48% at 22% 0%, hsl(40, 18%, 95%), transparent 65%),\n'
    '    linear-gradient(172deg, hsl(38, 14%, 91%), hsl(36, 10%, 85%) 70%);\n'
    '}\n'
)

m = re.search(r'\.tearoom \{\n  /\* —— 深夜雨屋.*?border-radius: 0 0 var\(--radius\) var\(--radius\);\n\}\n', s, re.S)
assert m, 'dark block not found'
s = s[:m.start()] + dark_new + s[m.end():]

m = re.search(r':root\[data-theme="light"\] \.tearoom \{\n  /\* —— 雨声茶室.*?\n\}\n', s, re.S)
assert m, 'light block not found'
s = s[:m.start()] + light_new + s[m.end():]

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('widgets contract done')
