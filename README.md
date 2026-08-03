# Vector 35 — VTOL Test Range

A mobile- and desktop-friendly Three.js flight demonstrator built around an articulated **three-bearing vectored-thrust nozzle**. It is an original, non-weaponized aircraft visualisation inspired by public VTOL engineering concepts — not an operational aircraft simulator.

## Included

- Flyable stealth-fighter-inspired airframe built from procedural Three.js geometry
- Three sequential bearing pivots that bend the exhaust from aft thrust to near-vertical hover thrust
- Visible turbine, color-coded duct sections, gear rings, actuator housings, conduit runs, bolt rings, and petal exhaust exit
- Inertial forward-flight and hover transition with a stabilized chase camera, cockpit-mounted first-person view, and inspection camera
- Touch-safe twin-stick mobile input and keyboard/mouse desktop input
- Procedural test deck, ocean, sky, cloud field, tracked shadow lighting, material roughness variation, panels, seams, animated control surfaces, cockpit instruments, and independent trim components
- Built-in inspection report exposed in development as `window.__VECTOR35__`

## Controls

| Desktop | Action |
| --- | --- |
| `W` / `S` | Raise / lower throttle |
| `A` / `D` | Yaw |
| Arrow keys | Pitch / roll |
| `V` | Toggle forward / hover vectoring |
| `C` | Cycle stabilized chase, first-person cockpit, and inspection cameras |
| `I` | Open the scene inspection report |
| `R` | Reset the aircraft |
| Drag | Look around in chase or cockpit view |

Mobile uses the left stick for throttle/yaw, the right stick for pitch/roll, and the center controls for vectoring, camera, and reset.

The chase camera follows aircraft heading with damped recovery, ignores roll/pitch coupling, and raycasts against the test deck to avoid clipping. The cockpit camera is fixed to the pilot eye point and supports independent head-look.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The project deploys as a static Vite app on Vercel using `vercel.json`.

## Verification layer

The development handle contains `sceneReport()`, `reportText()`, and deterministic `step(dt)` helpers. The report checks registered asset transforms, static non-uniform scale, and ground-contact tolerances before the scene is treated as clean.
