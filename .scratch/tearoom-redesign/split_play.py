# 架构评审⑤: app.js 拆层 —— 对局视图逻辑迁出为 play.js, app.js 退为共享基础设施层。
# 纯移动: [292..1733] (图表/游戏流程/策略导入/复盘按钮/账户/成交/组合/挂单/结算/仪式感)
# + [1794..1859] (听盘模式, 对局专属)。guarded/mainChart/qsChart/音效 等跨文件符号留守。
# 经典脚本共享全局作用域: 被移函数全部是事件回调里的惰性引用, play.js 紧随 app.js 加载即可。
import io

lines = io.open('frontend/app.js', encoding='utf-8').read().split('\n')

def find(marker):
    return next(i for i, l in enumerate(lines) if marker in l)

a = find('// ---------- 图表 ----------')            # 292 区起点
b = find('// ---------- 音效 (WebAudio')              # 1734: 音效留守, 作为游戏区终点
c = find('// ---------- 听盘模式')            # 1794: 听盘起点 (对局专属)
d = find('// ---------- 玩法说明弹窗') # 听盘终点
assert a < b < c < d, (a, b, c, d)

game = lines[a:b] + lines[c:d]
rest = lines[:a] + lines[b:c] + lines[d:]

head = [
    '// 对局视图 (play) 逻辑: 图表/交易/挂单/组合/结算/听盘 (架构评审⑤ 2026-10-25 自 app.js 拆出)。',
    '// 加载序: 紧随 app.js 之后 (用其 $ / api / state / COLORS / qsChart / qsModal / guarded / playSound);',
    '// mainChart 句柄定义在 app.js (导航层也用), 本文件通过全局名引用。',
    '// 本文件内函数全部是事件回调里的惰性引用, 声明在哪不影响运行时解析。',
    '',
]
io.open('frontend/play.js', 'w', encoding='utf-8', newline='\n').write('\n'.join(head + game) + '\n')
io.open('frontend/app.js', 'w', encoding='utf-8', newline='\n').write('\n'.join(rest) + '\n')
print('play.js:', len(game) + len(head), 'lines; app.js:', len(rest), 'lines')
