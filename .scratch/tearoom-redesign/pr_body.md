for #1

## Summary

Tearoom redesign rollout (13 UI tickets), quality-gate infrastructure, and an architecture pass giving five hot-spot concerns a single owner each.

```diff
 frontend/
+|-- theme.css        # single owner of the tearoom skin (palette, paper material, type pillars) - loads first
 |-- style.css        # demoted to layout/framework layer
+|-- play.js          # game view (charts/trading/orders/settle/sonify) split out of app.js
 |-- app.js           # shared infra only: $/api/state/qsChart/qsModal/nav/theme
+|-- vendor/echarts.min.js   # self-hosted (CDN outage broke charts and smoke twice)
 `-- i18n.js          # PAIRS: one key = one [zh, en] line (1798 keys, zero loss)
 tools/
+|-- bump_assets.py   # content-fingerprint ?v= automation (hooked, EOL-invariant)
+|-- floor_guard.mjs  # diff-scoped bar-lowering guard (CONSTRAINTS.md floor)
+`-- coverage_guard.py # changed-line coverage from JaCoCo + git diff
+CONSTRAINTS.md       # quality bar: numbers, commands, block/warn stages
```

## Evidence

- **Before:** Apple-indigo theme, emoji icon system, 4-level light backgrounds, gold duel styling; manual ?v= bumps made index.html the hottest file (23 of last 40 commits); design-critic score 4.5/10 with six structural gaps.
  **After:** warm-paper tearoom across both themes (23-glyph monoline SVG icon set, two-level backgrounds, tea accents); all six critic findings addressed; before/after screenshots under tools/ui_smoke/ (t01-t20 series).
- Every ticket closed with ui_check 0 / buttons 0 / smoke 9/9; final click-crawl 0 errors.
- Mutation experiments prove the nets catch regressions: deleting an EN literal trips E4b; changing asset content without a bump trips `bump_assets --check`.
- Three real bugs caught and fixed inside the review loops: hyphenated filenames skipped by the bump regex, EOL-sensitive fingerprints, and browse `--theme` bypassing the real toggle path.

## Merge Danger

**Door:** two-way (pure frontend + tooling; backend untouched; revert is a clean `git revert` range)

**Blast Radius:** sitewide-visual

Every view changes appearance; game/competitive logic, APIs and schema are untouched. New CI jobs (floor-guard, gitleaks block; osv/coverage warn) gate this and future PRs.
