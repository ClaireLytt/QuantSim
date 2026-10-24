# ticket 14: 擂台去 emoji 功能图标 (设计禁止清单) —— 清 i18n 双语 duel/challenge 键与 index.html 默认文案。
# 只删行内 emoji 前后缀, 不动键名与其余文字。
import io, re

EMOJI = re.compile(u'[\U0001F300-\U0001FAFF☀-➿⬀-⯿️↩]')

def strip_line(line):
    # 仅处理 duel./challenge. 键的值部分, 去 emoji 后收敛多余空格
    s = EMOJI.sub('', line)
    s = re.sub(r'": "\s+', '": "', s)
    s = re.sub(r'\s+"(,?)$', '"\\1', s)
    return s

p = 'frontend/i18n.js'
out = []
for line in io.open(p, encoding='utf-8'):
    if re.search(r'"(duel|challenge)\.[\w.]+":', line) and EMOJI.search(line):
        line = strip_line(line)
    out.append(line)
io.open(p, 'w', encoding='utf-8', newline='').writelines(out)

p2 = 'frontend/index.html'
h = io.open(p2, encoding='utf-8').read()
# 只清 view-duel 块与 btn-challenge 行里的 emoji (默认文案, 运行时会被 i18n 覆盖但也要一致)
start = h.index('<div id="view-duel"')
end = h.index('</div>\n\n', start)
block = h[start:end]
block2 = EMOJI.sub('', block)
block2 = re.sub(r'>\s+(\S)', lambda m: '>' + m.group(1), block2, count=0) if False else block2
h = h[:start] + block2 + h[end:]
h = h.replace('>⚔️ 发起同题挑战<', '>发起同题挑战<')
io.open(p2, 'w', encoding='utf-8', newline='').write(h)
print('emoji stripped')
