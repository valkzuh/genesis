# GENESIS architecture

GENESIS is organised in three layers:

```
┌──────────────────────────── Interface (React + Zustand) ────────────────────────────┐
│ TopBar · NavRail · SidePanel(Overview, Nations, Diplomacy, History, God, Worlds)     │
│ Inspector · Timeline · Dialogs · MapHud              store/: gameStore, controller   │
└───────────────▲─────────────────────────────────────────────▲──────────────────────────┘
                │ reads world, version counter                 │ commands, time control
┌───────────────┴──────────────┐              ┌────────────────┴─────────────────────────┐
│ Rendering (PixiJS)           │◀─ world ─────│ Simulation (pure TypeScript)              │
│ terrainPainter · overlay ·   │   (shared,   │ genesis · engine · economy · expansion ·  │
│ labels · MapRenderer         │   read-only) │ technology · diplomacy · war · politics · │
└──────────────────────────────┘              │ lifecycle · disasters · commands · stats ·│
                                              │ invariants · serialize · queries          │
                                              └───────────────▲───────────────────────────┘
                                                              │ static geography
                                              ┌───────────────┴───────────────┐
                                              │ World generation (world/)     │
                                              └───────────────────────────────┘
```

The simulation (`src/simulation`, `src/world`, `src/utils`) imports nothing from React, PixiJS or the DOM. It runs unchanged in Vitest, in the `npm run simulate` CLI, and in the browser.

## Data model (`src/types`)

- **`WorldMap`** (static): typed arrays over a `width × height` grid (160×100 by default) holding elevation, temperature, moisture, biome, river magnitude and direction, resource deposit, landmass id, coastal flag and distance to shore. It also holds precomputed per-tile yields (food, timber, stone, iron, trade), movement cost, defensive value and settlement appeal.
- **`World`** (dynamic): per-tile `owner`, `pop`, `culture`, `devastation`, `blight` and `cityAt`, plus arrays of `civs`, `cultures`, `cities`, `relations`, `wars`, `events`, global `history` samples, the `commandLog`, the RNG and the name registry.
- **`Civ`**: identity (names, colour, culture, government, personality, leader), aggregates refreshed every year (population, territory, output, revenue, army power), stockpiles (food, timber, stone, iron, wealth), technology points and era, politics (stability, happiness, legitimacy, unrest, war exhaustion), budget shares, needs, effects (booms, golden ages, plague, fervour…), counters, and sampled history for charts. Dead nations stay in `world.civs` with `alive = false`, `extinctYear` and `fate`, so the archive keeps them.
- **`Relation`**: one record per pair that has met, holding opinion (−100..100), alliance (with a bloc name), trade, rivalry, truce, war count, grievance and the shared border length.
- **`War`**: participants with sides, cause, war score, battles, losses, tiles and cities taken, and an outcome and summary once it ends.
- **`HistoryEvent`**: year, type, involved nation ids, text, importance (1–5), map tile and war id.
- **`WorldCache`**: derived data such as relation index, borders, per-civ tile lists, distance-to-city and distance-to-capital fields, and active wars. It is never saved. It is rebuilt from the authoritative state at the end of every year, after every God Mode command, and on load.

## World generation (`src/world/generate.ts`)

1. **Continents.** 2–5 major continents placed by rejection sampling so they stay apart, plus 3–8 island seeds. Each is a rotated ellipse mask with a smooth falloff, combined with a domain-warped fBm simplex field, an edge falloff (the map frame is always ocean), and **mountain belts**: ridged noise gated by a low-frequency "orogeny" field.
2. **Sea level** is set by quantile, so the land fraction matches the setting (archipelago, continents or great lands). Single-tile specks are removed.
3. **Water bodies.** Flood fills separate oceans (touching the frame or large) from enclosed lakes.
4. **Temperature** comes from latitude, an altitude lapse rate and noise. **Moisture** blends noise, a three-cell circulation model (wet equator, dry subtropics, wet mid-latitudes, dry poles), distance from the sea, and **rain shadows** from simulated prevailing winds (trade winds blow east to west in the tropics, westerlies west to east in mid-latitudes) that lose moisture as they climb.
5. **Rivers.** A Priority-Flood depression fill gives every land tile a downhill path to the sea. Flow accumulation weighted by rainfall decides streams, rivers and great rivers. Deep depressions become lakes, and rivers moisten their valleys.
6. **Biomes** follow a Whittaker-style table of temperature and moisture. Hills, mountains and peaks come from land-elevation quantiles, so every world has ranges.
7. **Resources** (iron, gold, marble, timber, fish, horses, spices and fertile soil) are placed by biome rules and clustered with noise.
8. **Yields** combine the biome base with river floodplains (deserts with rivers bloom), coasts, lakes, deposits and a cold penalty, and are summarised into a 0–1 appeal score.

Generation is deterministic per seed and takes about 150 ms for 160×100.

## The yearly tick (`src/simulation/engine.ts`)

```
stepYear(world):
  year += 1
  updateEconomy      production, food, stockpiles, budget, army, research, development
  updatePopulation   urban capacity, migration, logistic growth, famine & plague mortality
  updateTechnology   era advancement
  updateDiplomacy    contact, opinions, trade, alliances, rivalries, war declarations
  updateWars         fronts, battles, captures, exhaustion, eliminations, peace
  updateExpansion    colonisation (land and overseas), city founding, rebuilding ruins
  updatePolitics     assimilation, leaders, happiness, stability, reforms, crises
  updateDisasters    healing, droughts, earthquakes, plagues, golden ages
  finalizeYear       capitals, caches, city populations, peaks, statistics samples
```

All per-tile work happens in a handful of linear passes over the grid using precomputed neighbour tables and typed arrays. A tick costs about 2 ms in Chromium on a 160×100 map with 10–30 nations, so the interface can run at 80 years per second.

### Economy and population (`economy.ts`)

- **Food.** Each tile's food capacity is `yield × 10 × era.food × (1 − blight) × (1 − 0.6·devastation)`, in thousand person-years. Production is `min(pop × labour, capacity)`, where labour productivity rises with the era. Consumption is one unit per thousand people. Nations pool their food. Surpluses fill granaries (about one year of reserves) and the excess is sold. Deficits are covered by limited, priced imports, and the rest is **famine**: mortality proportional to the shortfall, with cities hit hardest, plus unhappiness and instability.
- **Rural population** grows logistically toward `capacity × era.ruralShare`. **Cities** add urban capacity driven by the surrounding countryside, trade, era, capital status and stability, and only grow while the nation has a food surplus. Migration evens out crowding between neighbouring tiles of the same nation, which drives urbanisation.
- **Output** comes from people, trade yields, urban productivity, administrative **control** (distance to the nearest city and to the capital), devastation, the era's productivity, stability, effects, and trade agreements (scaled by both partners' economies). **Revenue** is output times the government's tax efficiency.
- **Budget.** Revenue is split between military, research and development. The split starts from personality traits and shifts with circumstances: war, losing a war, famine and land hunger.
- **Army.** Recruits up to what the military budget can pay for and what manpower allows, which depends on government, aggression and wartime mobilisation. War chests can fund extra levies, unpaid armies desert, and iron shortages weaken troops. **Army power** = soldiers × era × government × leader × iron × horses × stability × exhaustion × fervour.
- **Research** grows with `population^0.55` and the square root of research spending, multiplied by government, leader, personality, stability, peace, effects, and **diffusion** from more advanced trade partners and neighbours. The sub-linear terms stop runaway snowballing, so nations advance at very different speeds.

### Expansion and settlement (`expansion.ts`)

Development spending builds *expansion points*; population pressure adds more. Each year a nation claims the best unclaimed tiles bordering its land. A tile's score combines appeal, the nation's current needs (food, iron, timber, stone), rivers, coasts and compactness, and its cost rises with movement cost and distance from the capital. Nations with a short frontier search overseas with a breadth-first search across the sea, whose reach grows with the era from 2 tiles to 200, and record their landings on new continents. *Development points* found cities at the best site at least five steps from existing cities, and rebuild ruins inside the nation's borders. Running out of land builds **land hunger**, which feeds war motives.

### Technology (`technology.ts`, `constants.ts`)

There are eight eras: Ancient, Classical, Medieval, Renaissance, Industrial, Modern, Information and Future. Each era sets multipliers for agriculture, rural share, urbanisation, production, military, administration, naval reach, upkeep and medicine. The first nation to reach an era gets a world-first event.

### Diplomacy (`diplomacy.ts`)

- **Contact** happens through a shared border or capitals within a reach that grows with the era.
- **Opinion** drifts toward a target built from government similarity, diplomacy and aggression traits, leaders, shared culture, trade (growing with time), alliances, rivalry, current war, memory of recent wars, grievances such as betrayals, border friction, **irredentism** (holding the other's people), common enemies and common rivals.
- **Treaties.** Trade agreements depend on commerce traits and isolation. Alliances need high opinion and usually a **shared threat** (a common enemy or rival, or a neighbouring giant). They form named blocs ("the Eastern Pact"), and blocs merge when members link. Rivalries form between hostile nations of comparable strength. Alliances dissolve when trust collapses.
- **War declarations.** Each nation weighs every reachable target: border disputes, land hunger, food and iron needs, rivalry, hatred, reconquest of its own people, and relative weakness. Coalition strength must favour it. The motives are scaled by aggression, government and leader, and reduced by trade, friendship, isolation, exhaustion and existing wars. The strongest motive becomes the cause written in the chronicle.

### War (`war.ts`)

- Declaring war calls the defender's allies, and refusing betrays the alliance with lasting grievance. The attacker's friends may also join.
- **Fronts** are pairs of opposing nations with a shared border. From the Medieval era on, nations can also fight naval fronts across the sea. Each nation splits its army across all its fronts in proportion to their length.
- **Battles.** Effective power = army power × front share × **supply** (reduced when fighting beyond administrative reach of the capital) × terrain and fortification (defender) × randomness. Casualties follow the power ratio. The winner captures frontline tiles adjacent to its territory. Cities need a decisive advantage or encirclement, and peoples defending their own homeland resist conquest. Soldiers who die are removed from the population, and captured land is devastated.
- **War score, exhaustion and peace.** Score accumulates from battles, provinces and cities (the capital counts most). Exhaustion grows with losses, lost land and adverse score. Peace comes when a side exceeds its tolerance, the score is overwhelming, or the war drags on. A cap of 45 years prevents endless wars. Victors annex extra border provinces and take reparations. Everyone signs a 25-year truce, and grievances linger.
- **Total conquest** ends a nation, and the archive records who conquered it.

### Politics (`politics.ts`, `lifecycle.ts`)

- **Assimilation.** Conquered tiles slowly adopt the ruler's culture. Until they do, foreign populations reduce happiness and stability and fuel separatism.
- **Leaders** age and die (with regnal numbers for dynasties), are elected in republics, and have traits that shift stability, research, military, economy and aggression. Hereditary successions can turn into crises.
- **Happiness** depends on food, prosperity per head, taxes for the army, war, exhaustion, plague, foreign rule and effects. **Stability** depends on government, leader, tradition, happiness, legitimacy, **overextension** (land beyond administrative capacity), war exhaustion, famine, plague, foreign populations, debt, effects and **regime ossification** (old dynasties lose their grip).
- **Crises.** Low stability and low happiness build unrest, which can turn into one of these:
  - **Revolution**: the government changes in a way that fits the era, such as a monarchy becoming a republic, a coup creating a dictatorship, or a strongman proclaiming an empire.
  - **Secession**: the most populous restless region breaks away. Garrisons defect, more so the weaker the parent. If the region's culture belonged to a fallen nation, that nation is **restored**. Rivals may intervene on the rebels' side.
  - **Civil war**: the realm splits between the capital and a distant great city, and the rebel faction takes the opposite style of government.
- **Collapse.** Ten years of deep crisis break a nation into successor states around its great cities, often restorations of older nations. Ungoverned outlying land is abandoned to ruin, and the archive records "collapsed after N years".
- **Reforms.** Stable nations evolve peacefully: tribes unite into kingdoms, conquerors proclaim empires, merchant oligarchies take power, constitutions create republics, and multicultural modern states federate.

### Disasters and fortune (`disasters.ts`)

Droughts strike dry farmland. Earthquakes strike rugged, populated land. **Plagues** break out preferentially in dense, connected nations, spread along trade routes and borders, kill more in cities, are tamed by medicine in later eras, and leave immunity behind. Stable, prosperous nations at peace can enter **golden ages**. Land heals slowly from devastation and blight.

### God Mode (`commands.ts`)

`executeCommand(world, command)` validates and applies an intervention between ticks, logs a `divine` event, and appends `{ year, command }` to `world.commandLog`. Commands: `spawn_civ`, `grant_resources`, `economic_boom`, `famine`, `plague`, `earthquake`, `flood`, `force_war`, `force_peace`, `tech_boost`, `destabilize`, `bless`. `advance(world, years, schedule)` replays a log deterministically.

## Determinism and persistence

- `Rng` (SFC32 seeded by cyrb128) has four 32-bit words of state. World generation uses separate seeded streams, and the simulation uses `world.rng`.
- Iteration order is deterministic everywhere: arrays by id, maps built in id order, and explicit tie-breakers in every sort.
- Module-level scratch buffers are filled from scratch each tick before use, so they carry no hidden state.
- `serialize.ts` writes a versioned JSON `SaveFile`. Typed arrays are stored as base64 of their raw bytes, entities as plain JSON, and the RNG state and used names are included. Loading validates sizes, rebuilds caches and runs the full invariant check before the world is accepted. `migrateSave` is the hook for future schema changes.
- `store/persistence.ts` keeps saves in IndexedDB (separate metadata and file stores) and handles JSON export and import.

## Invariants (`invariants.ts`)

Checked by the tests and when loading:

- Every tile has at most one owner, owners are alive, water is never owned, and unowned tiles have no people.
- Each living nation's tile count and population match the tiles.
- Living nations own land and a valid, intact capital.
- Dead nations own nothing and have an extinction year.
- Cities match `cityAt`, and ruins have no owner.
- Relations are ordered, unique, between living nations, with opinion in range.
- Active wars have living participants on both sides, and no nation fights on both.
- All numeric state is finite.

## Rendering (`src/rendering`)

- **Pixel grid.** The map is painted at about 1.6 megapixels (10 px per tile on the default map). Each pixel belongs to exactly one tile through a smooth domain warp. Coastlines follow a noise-perturbed bilinear iso-line of the land mask, and inland pixels go to the nearest **jittered** tile centre. Square tiles become irregular, organic cells. The same lookup is used for drawing and for mouse picking.
- **Terrain painter** (pure, runs once per world): biome colours blended across cells and tinted by climate, an interpolated elevation field with ridged mountain detail, hillshading, snow, forest stipple, dunes, paper grain, an inked coastline, coastal shallows with old-chart contour lines, sea ice, and smoothed rivers drawn as curves whose width grows downstream.
- **Overlay painter.** Per-tile fill colours for the current map mode, and two-pixel borders wherever the border key changes. Borders are coloured by nation, red on war fronts and gold for the selection. It repaints only when territory, the mode or the selection changes (population mode at most about twice a second) and uploads one texture.
- **Labels.** Each nation's name sits at the pole of inaccessibility of its largest territory, rotated along the principal axis and sized to fit. Labels are measured with real text metrics, collision-checked with nudging and shrinking, and hidden when they would be illegibly small. Cities use a bitmap font and rank-based level of detail. Event pings and God Mode previews are drawn as vector graphics.
- **Camera.** Zoom to cursor, drag and pinch, animated focus, and bounds clamping. Rendering is decoupled from simulation ticks.

## Interface and the loop (`src/store`, `src/components`)

- `controller.ts` owns the simulation loop. Each animation frame converts elapsed time × speed into whole years and runs them within a 14 ms budget (with a capped backlog), then notifies the renderer and publishes a throttled `version` counter (about 5 Hz). New major events become map pings and rate-limited toasts.
- Components read the mutable world directly and re-render when `version` changes. Heavy views (charts, long lists, the relations matrix) key their memos on a slower throttled version, and charts are memoised, so the interface stays responsive at high speed.
- UI state (selection, panels, map mode, God Mode tool, dialogs) lives in a small Zustand store. Keyboard shortcuts, onboarding and confirmation dialogs are handled in `App.tsx` and `Dialogs.tsx`.

## Testing

- `rng.test.ts`: determinism, state restore, distribution.
- `worldgen.test.ts`: deterministic maps, sane geography, 8–14 uniquely named nations on valid land.
- `simulation.test.ts`: a **1000-year smoke test** checking every invariant every 50 years, multi-seed invariant checks, and archive integrity.
- `determinism.test.ts`: identical replays with scripted interventions, command-log replay, divergence when commands differ, and **save → load → continue** matching an uninterrupted run.
- `interventions.test.ts`: every God Mode power has a measurable mechanical effect, invalid targets are rejected, and interventions are logged.
