for #1

## Summary

Follow-up batch after #11: the duel sub-flows join the sitewide hero grammar, and the emoji-icon design decree becomes a lint.

```diff
 duel (Strategy Ring)
+  build: serif head, preview as main action, submit as lone big primary, back/detail as text links
+  final: tea #N badges replace medals, legend dots sync to line colors, gold first-place highlight -> tea
 tooling
+  ui_check E10: color emoji inside <button> text or on button-bound i18n keys = hard error
+  sweep: 37 i18n button values + all index.html buttons cleaned; emoji-only buttons
+         (item bar, header gift, speaker toggle) redrawn as monoline SVGs
```

## Evidence

- **Before:** duel build/final used left-aligned sans heads, medal emoji in the final table, echarts default legend colors, gold first-place row; 70+ buttons sitewide still carried color-pictograph icons.
  **After:** real-click flows verified in both themes - submit -> preview backtest renders curve+mono stats (t24-duel-build.png), settle -> final board with tea badges (t24b-duel-final.png); header icons monoline (t25-header-icons.png).
- ci_local pass, ui_check 0 (E10 active), buttons 0, smoke 9/9 on every commit.

## Merge Danger

**Door:** two-way (frontend + lint only; backend untouched)

**Blast Radius:** duel-view visual + button iconography sitewide

E10 will fail any future PR that puts a color emoji on a button - intended teeth, not a side effect.
