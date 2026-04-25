# public/ — static assets

Served verbatim by Vercel. No build processing. Directory layout:

```
public/
  sprites/
    player/         — ship.png + ship.json (atlas)
    enemies/        — basic.png, zigzag.png, kamikaze.png, boss.png
    bullets/        — player-laser.png, enemy-bullet.png
    powerups/       — weapon.png, shield.png, credit.png, invuln.png
    explosions/     — small.png, large.png
  audio/
    sfx/            — laser.wav, explosion.wav, pickup.wav, menu.wav
    music/          — galaxy-theme.ogg, combat-*.ogg, boss-*.ogg
  textures/
    planets/        — <missionId>.jpg diffuse maps
    starfield.jpg
```

Reference from code with root-relative URLs, e.g. `"/sprites/player/ship.png"`.

Naming conventions: lowercase, dash-separated. Atlas JSON shares the base name of its PNG. Mission music tracks are `combat-<missionId>.ogg`. Planet textures share the missionId as filename.
