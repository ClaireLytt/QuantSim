# 架构评审⑤ 边界修正: (1) 排行榜加载/渲染回迁 app.js (ranking.js 跨文件依赖 + app.js 启动即调);
# (2) loadIndustries() 启动调用随对局业务迁 play.js; (3) askReview 按名绑定改惰性引用。
import io, re

play = io.open('frontend/play.js', encoding='utf-8').read()
app = io.open('frontend/app.js', encoding='utf-8').read()

# --- (1) 从 play.js 摘出 loadLeaderboard + renderLeaderboard 两个完整函数 ---
def cut_fn(src, header):
    i = src.index(header)
    # 函数体以行首 "}" 结束 (本仓顶层函数风格)
    j = src.index('\n}\n', i) + 3
    return src[:i] + src[j:], src[i:j]

play, lb_load = cut_fn(play, 'async function loadLeaderboard()')
play, lb_render = cut_fn(play, 'function renderLeaderboard()')

marker = '\nloadLeaderboard();'
assert marker in app
app = app.replace(marker,
    '\n// 排行榜加载/渲染 (共享层: ranking.js 复用, 启动即调) —— ⑤拆分时曾误入 play.js, 回迁\n'
    + lb_load + '\n' + lb_render + marker)

# --- (2) loadIndustries() 启动调用迁 play.js ---
assert '\nloadIndustries();\n' in app
app = app.replace('\nloadIndustries();\n', '\n// loadIndustries() 启动调用随对局业务在 play.js 执行 (架构评审⑤)\n')
play += '\n// 开局表单行业下拉的启动加载 (原 app.js 启动序列, 随对局业务迁入)\nloadIndustries();\n'

# --- (3) askReview 按名绑定 -> 惰性 ---
app = app.replace('$("btn-review").addEventListener("click", askReview);',
                  '$("btn-review").addEventListener("click", () => askReview()); // 惰性引用: askReview 定义在后加载的 play.js')

io.open('frontend/play.js', 'w', encoding='utf-8', newline='\n').write(play)
io.open('frontend/app.js', 'w', encoding='utf-8', newline='\n').write(app)
print('boundaries fixed')
