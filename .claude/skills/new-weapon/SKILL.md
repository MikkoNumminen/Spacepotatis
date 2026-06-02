---
name: new-weapon
description: Superseded by /equipment. Adding a weapon now lives inside the broader CRUD-and-visuals skill. This stub redirects.
---

# Superseded — use `/equipment` instead

This skill used to scaffold a new weapon. It has been folded into [/equipment](../equipment/SKILL.md), which covers the same CREATE-weapon path PLUS modify, remove, augments, reactor / shield / armor, visual changes (bullet sprites, UI tints, HUD bars, particles), and all the hard-coded reference cleanup that REMOVE needs.

**Action:** invoke `/equipment` for any weapon work — adding, removing, balancing, recoloring, or anything else.

The new skill's CREATE-weapon section includes the four ready-to-fill scaffolds, distribution-channel choices (shop catalog / mission drop / mid-mission upgrade ladder / default loadout / boss reward), and the same balance-comparison step (`/balance-review`) the old skill recommended.

## Freshness check

This is a redirect stub. Its load-bearing job is to point at `/equipment` and to keep that promise honest — the redirect target must exist, must still own the CREATE-weapon path the stub claims it absorbed, and the `/balance-review` it name-drops must still be installed. Paths are scope_root-relative (project root) except the markdown-link check, which is anchored at the skill dir.

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
