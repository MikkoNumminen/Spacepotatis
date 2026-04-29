---
name: new-weapon
description: Superseded by /equipment. Adding a weapon now lives inside the broader CRUD-and-visuals skill. This stub redirects.
---

# Superseded — use `/equipment` instead

This skill used to scaffold a new weapon. It has been folded into [/equipment](../equipment/SKILL.md), which covers the same CREATE-weapon path PLUS modify, remove, augments, reactor / shield / armor, visual changes (bullet sprites, UI tints, HUD bars, particles), and all the hard-coded reference cleanup that REMOVE needs.

**Action:** invoke `/equipment` for any weapon work — adding, removing, balancing, recoloring, or anything else.

The new skill's CREATE-weapon section includes the four ready-to-fill scaffolds, distribution-channel choices (shop catalog / mission drop / mid-mission upgrade ladder / default loadout / boss reward), and the same balance-comparison step (`/balance-review`) the old skill recommended.
