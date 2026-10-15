# Inverted Universe: Battle Arena

A browser-based 3D arcade fighting game starring five fighters from the Inverted Universe comics: **Sambhu**, **Simba**, **Maddy**, the **404 Ghost** and **Blackout**. Built with Three.js, plain ES modules and Vite. Combat feel, pacing and presentation are inspired by classic 3D arcade fighters; all characters, stages, art, code and audio are original.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build at http://localhost:4173
```

Requires Node 18+ and a WebGL-capable browser (current Chrome, Edge, Firefox, Safari — desktop or mobile).

## Deploying on the company website

`npm run build` produces a static `dist/` folder with relative paths (`base: './'`), so it can live in any sub-folder, e.g. `https://inverted.example/games/battle-arena/`.

Recommended embed (keeps the game's keyboard handling and full-screen layout isolated from the site):

```html
<iframe src="/games/battle-arena/index.html" title="Inverted Universe: Battle Arena"
        style="width:100%;aspect-ratio:16/9;border:0" allow="fullscreen; autoplay; gamepad"></iframe>
```

The game sizes itself to its container, so a full-page route works as well.

## Controls

| Action  | Player 1        | Player 2 (Versus)            | Touch        | Gamepad |
|---------|-----------------|------------------------------|--------------|---------|
| Move    | A / D           | ← / →                        | Pad          | D-pad / stick |
| Jump    | W (or Space)    | ↑                            | JUMP / pad ▲ | A |
| Crouch  | S               | ↓                            | Pad ▼        | D-pad ↓ |
| Punch   | F               | Numpad 1 (or K)              | P            | X |
| Kick    | G               | Numpad 2 (or L)              | K            | Y |
| Block   | H (S + H = low) | Numpad 3 (or ;)              | BLOCK        | B |
| Special | R               | Numpad 4 (or P)              | SP           | LB / RT |
| Dash    | Left Shift, or double-tap forward/back | Numpad 0 (or Right Shift) | DASH | RB |
| Pause   | Esc             | Esc                          | ❚❚ button    | — |

Laptop-friendly alternates are provided for Player 2 because many keyboards have no numpad. In **Arcade (vs CPU)** both key sets control Player 1. All bindings live in one place: `DEFAULT_KEYMAP` in `src/game/InputManager.js`.

### Fighting basics
- Best of three rounds; configurable timer (30/60/99 s). K.O., time-out decisions, PERFECT rounds.
- Standing block stops high and mid attacks; crouch-block stops lows; crouching ducks under highs.
- Simba's **Energy Shield** (his block) covers every height while standing and halves chip damage.
- Energy fills when you land or take hits. At 50 energy, R fires the character's cinematic special.
- Punch → punch chains into combos. Hits on a reeling opponent count as a combo (with damage scaling). Hitting an opponent during their attack is a **COUNTER** (+20 %).
- Back-dash has brief evasion frames; getting up from a knockdown is invulnerable.

### Fighters and move lists
**Sambhu** (balanced, agile): Quick Punch F · Double-Punch Combo F,F (→ G) · Front Kick G · Jump Kick W+G · Low Jab S+F · Rickshaw Sweep S+G (knockdown) · Auto Rocket Punch Shift+F · **Rickshaw Power Combo** R.

**Simba** (power): Heavy Punch F (→ F Thunder Hammer) · Power Kick G · Ground Slam S+G (radial, knockdown) · Lion Charge Shift+F · Energy Shield H (blocks every height) · Diving Kick W+G · **Simba Thunder Strike** R (sky bolt, lightning beam, leaping thunder slam).

**Maddy** (tricky, technical — from *Maddy: The Ghost of Room 404*): Quick Jab F → Formula Flurry F,F (3 hits) or → Roundhouse G · Roundhouse G · Low Jab S+F · Slide Tackle S+G (knockdown) · Flying Knee W+F/G · Exam-Rush Shoulder Shift+F · **E = mc² Textbook Toss** R (a glowing physics textbook projectile that hits three times).

**404 Ghost** (reach, evasive — the hostel ghost from the same comic): floats instead of walking, floaty jump. Spectral Claw F (→ F Double Rake) · Tail Lash G · Grave Grab S+F · Floor Creep S+G (knockdown) · Phantom Dive W+F/G · Phase Rush Shift+F (passes through attacks) · **Room 404 Haunting** R (shrieks, vanishes, reappears above the opponent and dives with claws).

**Blackout** (grappler, armored — an original villain, see note below): Fuse Hammer F (armored start-up, → F Overload Uppercut) · Transformer Stomp G · Low Hook S+F · Grid Sweep S+G (knockdown) · Power Drop W+F/G · Short-Circuit Charge Shift+F (armored) · **Total Blackout** R (kills the stage lights, radial pulse, drains 30 opponent energy).

> Blackout is a new character created for the game (a power-cut villain to suit Inverted Energy). He lives entirely in `src/characters/Blackout.js`; swap him for another comic character by replacing that file and its entry in `CharacterConfig.js`.

### Animation system
- Every joint channel is driven by a critically damped spring toward its target pose, so transitions between any two states blend smoothly instead of snapping.
- Attack keyframes are interpolated with monotone cubic splines: velocity is continuous through each key, without overshoot.
- Walking advances the gait by distance travelled (no foot sliding); idle has a fighting-stance bounce and breathing; acceleration tips the body (momentum lean); hits add a physical recoil wobble scaled by damage and height.
- Movement eases in and out (walk acceleration, eased dashes and lunges), jumps have a short wind-up, landings compress, and getting up is a keyed sequence.
- Faces blink and change expression (fierce while attacking, hurt when hit, happy on victory). Each fighter has an intro taunt and a victory routine.
- Striking limbs leave a motion-smear trail during their active frames.

## Project structure

```
src/
  main.js                 boot, loading screen, error states
  game/
    Game.js               renderer, scene, screens, main update loop
    GameLoop.js           rAF loop, delta-time clamp, time-scale (slow-mo)
    GameState.js          settings (persisted), difficulty profiles, match setup
    InputManager.js       configurable keymap, touch, gamepad → PlayerInput
    CombatSystem.js       hit detection, block/chip, combos, counters, hit-stop
    CollisionSystem.js    push boxes + arena boundaries
    ProjectileSystem.js   thrown projectiles (block, clash, multi-hit)
    RoundManager.js       best-of-3 flow, timer, K.O./time, announcements
    CameraController.js   fighting camera, shake, special-move close-ups
    AudioManager.js       synthesized SFX + music, optional audio files
  characters/
    CharacterConfig.js    character + arena registry
    Sambhu.js, Simba.js, Maddy.js, Ghost.js, Blackout.js
                          model builder, stats, poses, move data per fighter
    ModelKit.js           rim-lit toy materials, sculpted heads, faces with
                          blinking eyes, limbs, fists, sneakers, boots, hair
    PortraitRenderer.js   renders HUD / select / results art from the 3D model
    MoveData.js           hit/move factories and shared pose library
    Fighter.js            finite-state machine + physics per fighter
    Rig.js                articulated humanoid rig (procedural model base)
    AnimationController.js  spring blending, spline clips, gait, recoil + GLTF AnimationMixer
    AIController.js       CPU opponent (Easy / Normal / Hard)
  arenas/                 Arena base + Fort Courtyard, City Rooftop, Neon Energy
  effects/                hit sparks, comic "POW!" lettering, lightning, shockwaves,
                          motion trails, darkness, ghost shriek, formulas
  ui/                     main menu, character select, HUD, touch, results, panels
  styles/main.css
public/assets/
  portraits/              HUD + select art cropped from the supplied references
  models/manifest.json    optional GLB models per character
  audio/manifest.json     optional audio files per sound
```

### How a fighter works
Each fighter runs a finite-state machine: `intro, idle, walk, dash, prejump, jump, land, crouch, block, blockstun, attack, hit, knockdown, down, getup, victory, defeat`. Moves can also declare projectiles, teleports, hover windows, vanish windows, armor frames and energy drain. Every attack is data: startup → **hit windows** (active) → recovery, defined in seconds. Each hit window can connect once, so held keys and long animations never multi-hit; `cooldown` and `energyCost` stop special spam. Inputs are edge-triggered with a 0.2 s buffer, and OS key-repeat is ignored.

## Adding a new character

1. Copy one of the fighter files (e.g. `src/characters/Maddy.js`) to a new file.
2. Change `id`, `name`, `title`, `style`, `description`, `accent`, `stats`, movement values (`walkSpeed`, `jumpVel`, `dashSpeed`, `weight`) and `proportions`.
3. Rewrite `buildModel()` using the helpers in `ModelKit.js` (`headGeo`, `buildFace`, `limbGeo`, `latheGeo`, `buildFist`, `buildSneaker`, `buildBoot`, `toon` materials) and hang meshes on the rig joints (`rig.j.head`, `torso`, `uaL/laL/uaR/laR` arms, `thL/shL/thR/shR` legs, `rig.handL/R`, `rig.footL/R`). The model faces +Z; its own left is +X.
4. Define `moves` with `move()` / `hit()` from `MoveData.js`, and map buttons in `commands` (punch, kick, crouchPunch, crouchKick, airPunch, airKick, dashPunch, dashKick, special). Animation keyframes are partial poses keyed by time in seconds.
5. Optional: drop portrait art in `public/assets/portraits/` and point `portrait` / `art` at it. Leave them `null` and the game renders portraits from the 3D model at startup.
6. Register the definition in `CHARACTERS` in `src/characters/CharacterConfig.js`.

The menu, character select, HUD, AI and move list pick the new fighter up automatically.

## Adding real 3D models and animations (GLB)

The game ships with stylised procedural models so it runs with no external assets. To use rigged models:

1. Export a GLB per character (Y-up, facing +Z, feet at the origin, about 1.8 units tall, animations embedded).
2. Put it in `public/assets/models/`, e.g. `sambhu.glb`.
3. List it in `public/assets/models/manifest.json`: `{ "sambhu": "sambhu.glb", "simba": "simba.glb" }`.
4. Map your clip names in the character's `gltf.clips` (states: `idle, walk, run, jump, crouch, block, hit, knockdown, down, getup, victory, defeat`, plus any move id such as `jab`, `kick`, `special`). Optional `gltf.scale`.

Attack clips are time-scaled to the move's duration so visuals stay in sync with hit windows. Missing clips fall back to `idle`. If a file fails to load, the game logs a warning, shows a small notice and keeps the procedural model.

## Missing / optional external assets

None are required. These are optional upgrades the code already looks for:

| Asset | Expected file | Where to register |
|-------|---------------|-------------------|
| Rigged models | `public/assets/models/<id>.glb` for `sambhu`, `simba`, `maddy`, `ghost`, `blackout` | `models/manifest.json` |
| Hit sounds | `punch.mp3`, `kick.mp3`, `heavy.mp3`, `block.mp3` | `audio/manifest.json` |
| Movement sounds | `whoosh.mp3`, `jump.mp3`, `land.mp3` | `audio/manifest.json` |
| UI / specials | `click.mp3`, `special.mp3`, `thunder.mp3`, `scream.mp3`, `powerdown.mp3`, `ko.mp3`, `victory.mp3`, `defeat.mp3` | `audio/manifest.json` |
| Background music | `music.mp3` (loops) | `audio/manifest.json` |
| Official logo artwork | replace `public/favicon.svg` and the emblem SVG in `src/ui/dom.js` | — |

Without audio files, every sound is synthesized live with the Web Audio API (including a tabla-style background groove). The round announcer uses the browser's built-in speech voice and can be switched off in Settings.

## Settings
CPU difficulty (Easy/Normal/Hard), round timer, SFX and music on/off + volume, announcer voice, graphics quality (Auto/High/Low — Low drops bloom, antialiasing and resolution for older phones) and screen shake. Settings are saved in `localStorage` when available.

## Known limitations / next steps
- Characters are procedural stand-ins built to match the supplied renders; drop in GLB models for full-fidelity likeness.
- Blackout is an original character; Maddy's friends and the Shambhu-cover supporting cast can be added with the steps above.
- No online multiplayer (local versus and vs CPU only).

## Debugging
Open the game with `?debug` to expose `window.__game`. `__game.simulate(seconds)` fast-forwards the simulation and `__game.debugAutoP1('hard')` hands Player 1 to the CPU (attract mode / balance testing).
