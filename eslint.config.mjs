// 前端 JS 的 eslint 配置 (frontend/ 无构建无 npm, eslint 依赖装在 tools/ui_smoke)。
// 放仓库根: eslint v10 只 lint 配置文件所在目录之下的文件。跑法: cd tools/ui_smoke && npm run lint
//
// 架构适配: 前端是经典 script 全局作用域, 每个文件顶层 const/function 都是跨文件全局——
// eslint 单文件视角解析不了这种依赖, 所以:
//   - no-undef 关 (跨文件全局会全线误报; "引用不存在的 id/键" 这类真问题由 ui_check.py 管)
//   - no-unused-vars 只查局部作用域 (顶层函数常被别的文件调用, 查了全是误报)
// 其余 recommended 规则 (语法错误/重复 key/不可达代码/与自身比较等) 全量生效。
// 依赖装在 tools/ui_smoke/node_modules (frontend 保持零 npm), 从那里解析
import { createRequire } from "node:module";
const require = createRequire(new URL("tools/ui_smoke/", import.meta.url));
const js = require("@eslint/js");
const globals = require("globals");

export default [
  {
    files: ["frontend/**/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: {
        ...globals.browser,
        echarts: "readonly", // index.html CDN 引入
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-undef": "off",
      "no-unused-vars": ["error", { vars: "local", args: "none", caughtErrors: "none" }],
      // 本仓库惯用 let 声明后条件赋值, prefer-const 不在 recommended 里, 不额外开
    },
  },
  // 冒烟/体检脚本自身也顺带 lint (node esm)
  {
    files: ["tools/ui_smoke/*.mjs", "tools/ui_smoke/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
        switchView: "readonly", // page.evaluate 回调跑在页面上下文, 这是前端全局
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
