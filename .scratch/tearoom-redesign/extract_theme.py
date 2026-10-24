# 架构评审①: 茶室皮肤收拢为单属主 theme.css ——
# style.css 的两主题变量块 (1..box-sizing 前) + widgets.css 的「雨声茶室」结构层 (1112..EOF)
# 原样搬入 frontend/theme.css, 原文件留指路注释。纯移动, 不改任何规则内容。
import io

style = io.open('frontend/style.css', encoding='utf-8').read().split('\n')
widgets = io.open('frontend/widgets.css', encoding='utf-8').read().split('\n')

# style.css: 行 1..(box-sizing 行-1) 是主题变量区 (含文件头注释)
cut = next(i for i, l in enumerate(style) if 'box-sizing: border-box' in l)
theme_vars = style[:cut]
style_rest = style[cut:]

# widgets.css: 从「雨声茶室」结构层 header 到文件尾
wcut = next(i for i, l in enumerate(widgets) if '「雨声茶室」结构层' in l)
skin_layer = widgets[wcut:]
widgets_rest = widgets[:wcut]

header = [
    '/* ==================== theme.css · 茶室皮肤单属主 (架构评审①, 2026-10-25) ====================',
    '   全站皮肤的唯一事实源: 两主题变量 + --tr-* 材质 + .tearoom 结构层 + 字体支柱。',
    '   必须第一个加载 (变量在前); 其他 css 只许 var() 引用, 不许再定义皮肤选择器。',
    '   换色 / 加变量 / 调氛围层: 只开这一个文件。 */',
    '',
]
io.open('frontend/theme.css', 'w', encoding='utf-8', newline='\n').write(
    '\n'.join(header + theme_vars + [''] + skin_layer) + '\n')

io.open('frontend/style.css', 'w', encoding='utf-8', newline='\n').write(
    '/* 基础布局层: 主题变量与皮肤已全部迁往 theme.css (必须先于本文件加载) */\n'
    + '\n'.join(style_rest) + '\n')

io.open('frontend/widgets.css', 'w', encoding='utf-8', newline='\n').write(
    '\n'.join(widgets_rest).rstrip('\n')
    + '\n\n/* 茶室皮肤结构层已迁往 theme.css (架构评审①) */\n')
print('theme.css extracted:', len(theme_vars), '+', len(skin_layer), 'lines')
