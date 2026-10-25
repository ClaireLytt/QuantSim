# spot-check: values quoted in DESIGN.md must exist in theme.css
theme = open('frontend/theme.css', encoding='utf-8').read()
design = open('DESIGN.md', encoding='utf-8').read()
checks = ["hsl(30, 12%, 9%)", "hsl(38, 14%, 91%)", "hsl(28, 45%, 66%)", "hsl(22, 38%, 40%)",
          "hsl(18, 62%, 64%)", "hsl(150, 26%, 60%)", "hsl(14, 55%, 40%)", "#d98a52", "#c06a35",
          "cubic-bezier(.25, 1, .5, 1)"]
norm = lambda s: s.replace(' ', '')
dn, tn = norm(design), norm(theme)
bad = [c for c in checks if not (norm(c) in tn and norm(c) in dn)]
print("MISS:", bad if bad else "none")
print("stale indigo mention:", "5e5ce6" in design or "systemIndigo" in design)
