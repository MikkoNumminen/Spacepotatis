---
name: new-weapon
description: Superseded by /equipment. This stub redirects.
---

# Superseded — use `/equipment` instead

This skill used to scaffold a new weapon. It has been folded into [/equipment](../equipment/SKILL.md), which covers the same CREATE-weapon path PLUS modify, remove, augments, reactor / shield / armor, visual changes (bullet sprites, UI tints, HUD bars, particles), and all the hard-coded reference cleanup that REMOVE needs.

**Action:** invoke `/equipment` for any weapon work — adding, removing, balancing, recoloring, or anything else.

It carries forward the ready-to-fill templates, the distribution-channel choices, and the `/balance-review` step the old skill recommended.

## Freshness check

Redirect stub — the checks keep the promise honest: `/equipment` must exist and still own the CREATE path, and `/balance-review` must still be installed.

```toml
[[check]]
kind = "path_exists"
path = ".claude/skills/equipment/SKILL.md"
root = "scope_root"

[[check]]
kind = "file_contains"
path = "SKILL.md"
pattern = "use `/equipment`"
root = "skill_dir"

[[check]]
kind = "file_contains"
path = ".claude/skills/equipment/SKILL.md"
pattern = "Operation: CREATE"
root = "scope_root"

[[check]]
kind = "path_exists"
path = ".claude/skills/balance-review/SKILL.md"
root = "scope_root"

[[check]]
kind = "no_broken_md_links"
```
