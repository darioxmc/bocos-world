# Boco's World: Skybound

A separate pixel-art platformer inspired by Boco's original assembly project.
The original browser revival is available at the repository root.

[Play Skybound](https://darioxmc.github.io/bocos-world/skybound/).

## Play locally

Run `npm start`, then open http://127.0.0.1:8770/ . Phaser 3.90.0 is vendored,
so no dependency installation or internet access is needed to play. A static
web host can serve these same files. ES modules require HTTP rather than
opening index.html directly.

## Adventure

Three handcrafted areas, six ordinary enemy types, an area boss in each, and
an unlockable fourth area and final encounter. Jump, peck, stomp, glide, ride
moving platforms, collect flower emblems, and restore the gardens. Flowers
heal without granting invulnerability. Damage turns Boco's white center red.
Checkpoints and unlimited retries keep the game approachable.

Keyboard: arrows/WASD move; Space/W/Up jump; Z/J attack; X/K glide;
Down crouches and Down+Jump drops through marked platforms; Escape/Enter pause.
Bindings can be changed in Settings. Touch supports simultaneous d-pad/action
input, sliding directions, size adjustments, left-handed placement, and optional
swipe gestures. Gamepads support standard buttons, analog movement, remapping,
menus, and disconnect pausing. Hardware support depends on browser recognition.

## Saves

Three separate browser-local slots autosave at checkpoints, boss victories,
collectibles, and every 15 seconds of active play. Export/import JSON in the
save selector provides backups and transfers. Browser clearing removes local
saves. Blocked storage falls back to the current session and displays a notice.
Completed areas can be replayed without reducing unlocked progression.

## Source

- `game.js`: Phaser Arcade simulation, combat, enemies, bosses, progression.
- `mechanics.js`: collision rules and movement constants.
- `levels.js`: independent map and encounter data, in world pixels.
- `art.js`: original, deterministic raster pixel textures and parallax layers.
- `input.js`, `shell.js`, `style.css`: input aggregation, menus, responsive shell.
- `saves.js`, `audio.js`: validated persistence and bounded Web Audio synthesis.
- `assets/art-preview.html`: independently inspect generated artwork.
- `qa/sprite-atlas.png`: exported raster art atlas from browser verification.

Phaser is MIT licensed; see `vendor/PHASER-LICENSE.txt`. Game artwork is newly
drawn from the user's Boco references. Music is original synthesized material.

## Verification

`npm test` runs collision-rule, save-validation, isolation, and persistence tests.
`node tools/verify.mjs` runs browser checks against the local server using
Playwright and installed Edge. Set `SKYBOUND_DEPENDENCIES` to the directory
containing Playwright when not using the bundled desktop runtime. It writes
desktop/phone screenshots and an art atlas under `qa/`.
`node tools/traverse.mjs` walks all four mandatory paths with actual Arcade
collision bodies and combat disabled, checking for blocked routes and falls.
`node tools/verify-playtest.mjs` checks boss-charge jump clearance with combat
enabled, boss contact between attacks, keyboard Settings navigation, and
simultaneous browser touch contacts with independent release.

Browser checks cover keyboard movement, gliding, combat, boss vulnerability
and gates, menu transitions, simulated gamepad inputs/disconnection, simultaneous
touches, sliding d-pad, canvas pixels, and iPhone-sized portrait/landscape layouts.
Real iPhone Safari and physical-controller tests remain distinct from emulation.
The 30-45-minute pacing target needs human playtesting; it is not a measured result.
