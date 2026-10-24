# 架构评审 2026-10-25: 五个新属主登记进领域词汇表
import io

rows = """| **茶室皮肤 (Tearoom Skin)** | `frontend/theme.css` | 全站皮肤唯一事实源: 两主题变量 + --tr-* 材质 + .tearoom 结构层 + 字体支柱, 必须第一个加载。换色/调氛围只开它; 域文件只许 var() 引用 (2026-10-25 自 style/widgets 收口)。 |
| **冒烟基座 (Smoke Harness)** | `tools/ui_smoke/enter_app.mjs` | 四个 runner 共用的 进应用/过门禁/运行时监听/真路径切主题 (setTheme)。直设 dataset.theme 是反面教材: 曾制造骗过设计评审的假 bug。 |
| **资源指纹 (Asset Fingerprint)** | `tools/bump_assets.py` | ?v= 缓存失效的唯一机制: 内容 md5 指纹自动盖 (hook 内先跑), 人不手改 ?v=; ui_check W3 兜底。 |
| **双语对 (i18n Pair)** | `frontend/i18n.js PAIRS` | 一键一行 [zh, en] 双语对齐, 运行时展开为 I18N。"EN 漏翻"结构上不可能; ui_check E4b 校验行内双语字面量完整。 |
| **对局视图层 (Play View)** | `frontend/play.js` | 对局页的图表/交易/挂单/组合/结算/听盘逻辑, 紧随共享层 app.js 加载。app.js 退为 $ / api / state / qsChart / qsModal / 导航 / 主题 等基础设施。 |
"""
with io.open('GLOSSARY.md', 'a', encoding='utf-8', newline='\n') as f:
    f.write(rows)
print('glossary updated')
