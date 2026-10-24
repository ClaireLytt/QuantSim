# ticket 06 contract: 作用域取色机制回收 —— 全局 :root 即茶室后, 图表回归全局 COLORS/cssVar。
import io, re

def patch(path, reps, regex=None):
    s = io.open(path, encoding='utf-8').read()
    for a, b in reps:
        assert a in s, path + ' MISS: ' + a[:60]
        s = s.replace(a, b)
    if regex:
        for pat, rep in regex:
            s2 = re.sub(pat, rep, s, flags=re.S)
            assert s2 != s, path + ' REGEX MISS: ' + pat[:50]
            s = s2
    io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', path)

patch('frontend/app.js', [
    ('// 可选第二参: 从指定元素读 (已换装视图的图表要读 .tearoom 容器上的作用域变量)\nconst cssVar = (name, el) => getComputedStyle(el || document.documentElement).getPropertyValue(name).trim();',
     'const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();'),
    ('  const COLORS = gameColors(); // 遮蔽全局: 对局图表走茶室作用域色\n  return {\n    dates:', '  return {\n    dates:'),
    ('function buildChartOption() {\n  const COLORS = gameColors(); // 遮蔽全局: 对局图表走茶室作用域色\n', 'function buildChartOption() {\n'),
    ('    fill.style.background = up ? gameColors().up : gameColors().down;', '    fill.style.background = up ? COLORS.up : COLORS.down;'),
    ('  const COLORS = gameColors(); // 遮蔽全局: 组合饼图在对局视图内, 走茶室作用域色\n', ''),
    ('  const COLORS = gameColors(); // 遮蔽全局: 结算曲线在对局视图内, 走茶室作用域色\n', ''),
], regex=[
    (r'\n// 茶室作用域取色: 已换装视图的图表必须读视图容器上的作用域变量\n.*?const gameColors = \(\) => viewColors\("view-game"\);\n', '\n'),
])

patch('frontend/arena.js', [
    ('  const COLORS = viewColors("view-arena"); // 遮蔽全局: 回测曲线走茶室作用域色\n', ''),
])
patch('frontend/replay.js', [
    ('  const COLORS = gameColors(); // 遮蔽全局: 复盘 K 线与对局同一套茶室色 (弹窗本体换装在 ticket 06)\n', ''),
])
patch('frontend/daily.js', [
    ('    const dv = (n) => cssVar(n, $("view-daily")); // 茶室作用域取色 (ticket 02)\n', ''),
    ('dv("--accent")', 'cssVar("--accent")'),
    ('dv("--text-muted")', 'cssVar("--text-muted")'),
    ('dv("--border")', 'cssVar("--border")'),
    ('dv("--panel-raised")', 'cssVar("--panel-raised")'),
    ('dv("--text")', 'cssVar("--text")'),
])
patch('frontend/rooms.js', [
    ('    const rv = (n) => cssVar(n, $("view-rooms")); // 茶室作用域取色 (ticket 02)\n', ''),
    ('rv("--text-muted")', 'cssVar("--text-muted")'),
    ('rv("--border")', 'cssVar("--border")'),
    ('rv("--accent")', 'cssVar("--accent")'),
    ('rv("--up")', 'cssVar("--up")'),
    ('rv("--down")', 'cssVar("--down")'),
])
patch('frontend/duel.js', [
    ('cssVar(FINAL_COLORS[i % FINAL_COLORS.length], $("view-duel"))', 'cssVar(FINAL_COLORS[i % FINAL_COLORS.length])'),
])
print('js contract done')
