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
Healing flowers remain available when health is full. The separately labeled
Emblems counter tracks collectible flower emblems, not another health slot.
Attacks animate Boco's whole head; actual enemy damage uses Canvas-compatible
sprite flashes, including on bosses, without adding particles or changing reach.
Checkpoints and unlimited retries keep the game approachable.

The main campaign includes eighteen additional named chapters, assembled from
authored terrain and optional upper-route rooms with varied encounter sequences.
Each chapter has three checkpoints; existing checkpoint IDs and saves remain
valid. The required route measures **21.04 minutes** at normal simulation speed
with combat disabled, before bosses, detours, or retries. Human completion time
will vary; this is a movement benchmark, not a timed lock or a speed reduction.

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
- `levels.js`, `campaign.js`: map data and authored chapter sequences, in world pixels.
- `enemy-navigation.js`: terrain-aware patrol, hop, and flight constraints.
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
It also verifies that the main-route movement exceeds twenty minutes.
`node tools/play-campaign.mjs` attempts the expanded main routes with ordinary
health, active enemies, checkpoint respawns, jumping, pecking, and gliding.
`node tools/verify-campaign.mjs` checks every checkpoint, save/Continue flows,
chapter transitions, phone/desktop layouts, canvas rendering, and frame timing.
`node tools/verify-enemies.mjs` stress-tests map enemy spawns and targeted
wall, ledge, patrol-boundary, and offscreen suspension cases in Arcade physics.
`node tools/verify-playtest.mjs` checks boss-charge jump clearance with combat
enabled, boss contact between attacks, keyboard Settings navigation, and
simultaneous browser touch contacts with independent release.
`node tools/verify-mobile-pause.mjs` checks that visible mobile focus changes do
not pause or cancel held touch controls, while backgrounding, page departure,
manual Pause and desktop focus loss still pause safely.
`node tools/verify-touch-zoom.mjs` checks rapid taps on controls and surrounding
gaps in phone landscape/portrait, viewport scale, independent multi-touch
release, and preservation of native menu gestures.
`node tools/verify-combat-feedback.mjs` checks actual damage versus armor blocks,
hit/death/boss flashes, attack poses and collision dimensions, flower pickup
rules, and the separated health/emblem HUD on phone viewports.

Browser checks cover keyboard movement, gliding, combat, boss vulnerability
and gates, menu transitions, simulated gamepad inputs/disconnection, simultaneous
touches, sliding d-pad, canvas pixels, and iPhone-sized portrait/landscape layouts.
Real iPhone Safari and physical-controller tests remain distinct from emulation.
The new route meets the twenty-minute movement target. Difficulty and enjoyment
over a full human playthrough still benefit from real-device playtesting.
