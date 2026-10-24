# 补刀: 听盘开关 UI 随听盘模式迁入 play.js (读写 SONIFY, 属对局层)
import io

block = '''
// 听盘开关 (对局页 K 线工具条): 依赖总音效开关, 关着时提示先开声音
function renderSonifyBtn() {
  $("btn-sonify").classList.toggle("active", SONIFY);
  $("btn-sonify").title = t("sonify.title");
}
$("btn-sonify").addEventListener("click", () => {
  if (!SOUND && !SONIFY) { toast(t("sonify.needSound")); return; }
  SONIFY = !SONIFY;
  try { localStorage.setItem("qs_sonify", SONIFY ? "on" : "off"); } catch (e) { /* ignore */ }
  renderSonifyBtn();
  toast(t(SONIFY ? "sonify.on" : "sonify.off"));
  if (SONIFY) sonifyBar({ close: 100 }, { close: 101, high: 102, low: 100 }); // 示例音
});
renderSonifyBtn();
document.addEventListener("qs:lang", renderSonifyBtn);
'''
io.open('frontend/play.js', 'a', encoding='utf-8', newline='\n').write(block)
print('sonify toggle moved')
