# ticket 25: 全站按钮 emoji 功能图标清剿。
# 口径: 只清按钮上的彩色 pictograph (U+1F000-1FAFF + 常见彩色 26xx/27xx + VS16);
# 单色字形 (✕ ➜ ♪ ＋ ↩ ▶) 不在设计禁令内; 文案内容/桌宠/向导狐的 emoji 保留。
import io
import re

BAN = re.compile(u'[\U0001F000-\U0001FAFF⚔⚖➖⭐⚠-⛿]️?\\s*')

# 1) index.html: 按钮字面文本去 emoji; 同时收集按钮上挂的 data-i18n 键 (含子 span)
h = io.open('frontend/index.html', encoding='utf-8').read()
btn_keys = set()
def clean_btn(m):
    inner = m.group(2)
    for k in re.findall(r'data-i18n="([^"]+)"', m.group(0)):
        btn_keys.add(k)
    # 只清标签间的文本节点, 不碰属性与子标签
    def txt(mm):
        return BAN.sub('', mm.group(0))
    inner2 = re.sub(r'>[^<]+<', txt, '>' + inner + '<')[1:-1]
    return m.group(1) + inner2 + '</button>'
h2 = re.sub(r'(<button[^>]*>)(.*?)</button>', clean_btn, h, flags=re.S)
io.open('frontend/index.html', 'w', encoding='utf-8', newline='').write(h2)
print('index buttons cleaned; i18n keys on buttons:', len(btn_keys))

# 2) i18n.js: 按钮键的双语值去 emoji (只动收集到的键, 文案键不碰)
s = io.open('frontend/i18n.js', encoding='utf-8').read()
changed = 0
out = []
for line in s.split('\n'):
    m = re.match(r'(\s*)"((?:[^"\\]|\\.)+)"(:\s*\[.*)$', line)
    if m and m.group(2) in btn_keys and BAN.search(line):
        line = m.group(1) + '"' + m.group(2) + '"' + BAN.sub('', m.group(3))
        changed += 1
    out.append(line)
io.open('frontend/i18n.js', 'w', encoding='utf-8', newline='').write('\n'.join(out))
print('i18n button values cleaned:', changed)
