# GENESIS roadmap

Version 1 covers the whole loop: procedural worlds, autonomous nations, economy, diplomacy, war, politics, collapse and rebirth, God Mode, a full inspector and chronicle, saves, and deterministic replay. This file lists what is known to be missing or rough, and where the project could go next. Nothing here is implemented yet.

## Known limitations

- **Cross-browser replays.** Replays are bit-identical within one JavaScript engine. `Math.exp`, `Math.pow` and similar functions may round differently in other engines, so a seed can drift between Chrome and Firefox after many centuries.
- **The simulation runs on the main thread.** It is time-sliced within a 14 ms frame budget, which keeps the interface smooth on desktop hardware, but very fast speeds on slow devices lower the frame rate.
- **Borders are raster.** Borders are painted into a texture at 8–12 pixels per tile, depending on map size, so they soften at maximum zoom.
- **Rebellion balance.** Civil wars succeed often. Independence wars by small regions are usually crushed unless a rival intervenes.
- **Late-game federations.** Large multicultural nations in the Modern era and later tend to federate, so many late worlds end with several federations.
- **Abstract trade and navies.** Trade agreements affect output, research and opinion but aren't drawn on the map. Naval warfare is an abstract front across the sea, not fleets.
- **Mobile layout.** Phones get a simplified layout. The inspector and panels are built for desktop.
- **GPU performance has only been measured with software rendering.** Simulation timing was measured in Chromium, about 2–4 ms per year on average, but frame rates were only measured with a software WebGL renderer.

## Next

1. **Simulation in a Web Worker.** Move the engine into a worker and share typed arrays (or transfer snapshots) with the renderer, so 80 years per second stays smooth on any device.
2. **Rewind and time-lapse.** Seed plus command log already reproduce any history. Keyframe snapshots every 50 years would let you scrub back through time, play history as a time-lapse, and branch an alternate history from any year.
3. **Shareable worlds.** Put the seed, settings and compressed command log in the URL so anyone can watch the same history unfold.
4. **Vector borders.** Trace borders with marching squares into smoothed polylines, or render them with a distance-field shader, so they stay crisp at any zoom.
5. **Deterministic math.** Use a small deterministic library for `exp`, `log` and `pow` so replays match across engines.
6. **Compressed saves.** Gzip save files with `CompressionStream`.

## Deeper simulation

- **Religion and ideology.** Faiths that spread along trade and conquest, schisms, holy wars, and ideologies that shape governments in later eras.
- **Culture and language drift.** Cultures that split over distance and time, and place names that evolve with them.
- **Characters and dynasties.** Family trees, marriages between houses, succession wars and personal unions.
- **Vassals and tributaries.** Peace deals that create subjects instead of only annexing land, and vassals that later break free.
- **Trade routes and goods.** Explicit routes between cities, goods with prices, and blockades as a war goal.
- **Fleets.** Naval power as its own force, overseas invasions, and colonial empires.
- **Migration.** Refugees fleeing war and famine across borders, carrying their culture with them.
- **Climate.** Ice ages, volcanic winters and long droughts that shift biomes and food yields over centuries.
- **Wonders and great works.** Projects that cost generations of output and give lasting prestige.
- **Richer peace treaties.** Partitions, buffer states and demilitarised zones.

## Interface

- A genealogy of nations: a tree showing which nations split from, conquered or restored which.
- Side-by-side comparison charts for any set of nations.
- Minimap, map bookmarks, and high-resolution map export.
- Exporting the chronicle as Markdown, like a history book.
- Accessibility: colour-blind palettes, reduced motion, and better screen-reader support for the chronicle and inspector.
- Localisation.
- A dedicated mobile layout.

## Tooling

- **Scenario editor.** Paint terrain, place nations, and set their traits, then let history run.
- **Data-driven rules.** Eras, governments and personalities loaded from JSON, so the community can mod them.
- **Maps larger than 200×125.** Requires the worker and vector-border work above.
- **Visual regression tests.** Run the Playwright screenshot checks in CI.
- **Offline install.** Package the app as a Progressive Web App.
