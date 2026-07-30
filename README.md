# ONETT — a 2.5D homage to EarthBound

A walkable reimagining of EarthBound's first town, rendered in 2.5D: real 3D
geometry for the world, flat pixel sprites for the cast, and a low-resolution
dithered framebuffer that lands the look somewhere between a SNES and an N64.

You wake up, walk out of your house on the hill, wander down into town, and can
go inside seven buildings. No combat, no story beats — just the place.

```bash
npm install
npm run dev      # http://localhost:5173
```

| | |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | static bundle in `dist/` |
| `npm test` | headless playtest — 23 checks (movement, stairs, doors, dialogue, geometry audit) |
| `npm run shot` | screenshot tour of the whole level into `shots/` |
| `npm run perf` | render-cost probe (scene complexity, fps, shadow/fill breakdown) |

## Publishing

The build is a static bundle with no server side and no external requests, and
`vite.config.js` sets `base: './'`, so it runs from any path — including the
project subpath GitHub Pages serves from.

`.github/workflows/pages.yml` builds and deploys on every push to `main`. It
needs one manual step first: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. After that the game is live at
`https://<user>.github.io/<repo>/`.

To publish from this feature branch instead of `main`, add its name to the
workflow's `on.push.branches`, or trigger the workflow by hand from the Actions
tab.

**Controls** — `WASD`/arrows walk, `Shift` runs, `Space` or `Z` talks, `Q`/`E`
turn the camera, `C` recentres, `M` mutes. Walk into a door to go inside.
Touch: left half of the screen is a stick, right half is the action button.

## Every asset is generated from code

There are no image, audio or model files in this repository. Nothing is taken
from the original game.

- **Textures** are painted pixel by pixel into small canvases at load time —
  grass with dithered patches and tiny flowers, asphalt with speckle and faint
  cracks, clapboard siding, shingle courses, brick, wallpaper, carpet weave
  (`src/core/tex.js`).
- **Characters** are assembled from parametric parts — cap, hair style, striped
  or plain top, dress, uniform, apron — into a 4×4 walk-cycle sheet, then given
  a hard 1px outline by an edge pass (`src/entities/sprites.js`). Thirteen
  townsfolk and a dog come out of about a dozen numbers each.
- **Music** is an original chiptune tracker: pulse/triangle/FM voices, six tunes
  in the spirit of the soundtrack's jazzy, slightly-off-kilter chord changes —
  major 7ths, walking basslines, swung 16ths (`src/core/audio.js`). Sound
  effects are synthesised the same way.

## How the look is put together

**Low-res framebuffer.** The scene renders into a ~538×336 target, gets its
colours dithered with a 4×4 Bayer matrix and quantized to 30 steps per channel,
then blows up to the window with nearest-neighbour sampling. The dither happens
in display space (the post pass does the sRGB transfer itself), so the pattern
lands on the values you actually see. Textures use nearest magnification with
mipmapped minification: crunchy up close, stable in the distance.

**2.5D.** A narrow-FOV perspective camera at a fixed 33° pitch approximates the
original's oblique projection while letting buildings have real volume.
Characters are Y-axis billboards — they yaw to face the camera but never pitch,
so they stay bolt-upright in a world of honest geometry. Their shadows are soft
blob decals; the buildings get a real shadow map.

**Terraced ground.** Onett is a hill town. Rather than a heightmap, the walkable
world is a set of rectangular platforms, some sloped. A move is legal only if
some platform covers the destination and the height change is under a step —
which makes cliff edges free, with no extra collision geometry. Stairs are
stepped geometry for the eye and a smooth ramp for the feet, and take priority in
the height query so stepping onto one starts you climbing.

**Interiors as cutaways.** Rooms are a floor plus four *inward-facing* wall
planes. Since a plane only draws from its front, whichever wall stands between
the camera and the room is culled automatically — the classic dollhouse view,
with no wall-fading logic. Doors and windows are single-sided quads on the wall
plane so they vanish with it; a doormat on the floor keeps the exit legible.

**Static bake.** A town assembled from little primitives came to ~1,600 meshes
and 935 shadow casters. Materials are memoized on (texture, colour), and once a
zone is built every static mesh sharing a material is merged into one buffer —
down to ~390 meshes and 140 casters. The camera raycasts against those merged
meshes and leans in when a building would otherwise come between it and the
player.

## Layout

```
                 ▓▓▓ meteorite hill (y 5.6) ▓▓▓
   ── north shelf (y 2.4) ────────────────── dirt stairs ──
      your house · neighbours · two more houses · quiet street
   ══ stone stairs ═══════════════ stone stairs ═══════════
   ── town (y 0) ─────────────────────────────────────────
      drug store · burger shop · ARCADE · hotel      (north side)
      ══════════════ main street ══════════════
      hospital · police · city hall · house          (south side)
                    │ road south
              two houses · TWOSON ▸
```

Enterable: your house (plus your bedroom upstairs), the neighbours', the drug
store, the arcade, the hotel, the hospital. Other doors are locked and say so.

## Source map

```
src/
  main.js              game loop, zone switching, doors, interaction
  core/
    renderer.js        low-res target, dither + quantize post pass, adaptive quality
    camera.js          fixed-pitch follow camera with occlusion pull-in
    input.js           keyboard + touch, presses counted not flagged
    audio.js           chiptune tracker + SFX bank
    tex.js             procedural pixel textures
    palette.js         the colour set everything draws from
  world/
    onett.js           the level: ground, roads, buildings, props, cast
    interiors.js       seven rooms, furniture kit, cutaway shell
    build.js           building/roof/prop kit
    zone.js            scene scaffolding, sky, clouds, lights, terraces, static bake
    collision.js       walkable platforms, solids, movement resolution
  entities/
    sprites.js         parametric character sheets
    actor.js           billboard sprite actor with walk cycle
  ui/
    hud.js             dialogue window, place banner, prompts
    style.css          UI chrome
tools/
  screenshot.mjs       vantage-point tour, doubles as a smoke test
  playtest.mjs         synthetic-input functional tests
  perf.mjs             render-cost probe
```

## Notes

- `npm test` and `npm run shot` need the dev server running (`npm run dev`).
- The playtest waits on game state rather than wall-clock time, because this
  sandbox renders in software at ~10fps while real hardware runs at 60. The perf
  numbers it prints are from that software rasteriser — treat the ratios as
  meaningful and the absolutes as not.
- EarthBound is Nintendo's. This is an original tribute built from scratch; it
  shares no code, art, audio or text with the game.
