<div align="center">
  <img src="docs/screenshots/fly-playing.png" alt="An amber Drosophila CT scan on a stool pulling the lever of a purple slot machine" width="820" />

  # Fruit Fly Slot Machine

  **A real fruit-fly connectome, a stubborn little gambler, and a slot machine that never pays.**

  [![Connectome: MaleCNS v1.0](https://img.shields.io/badge/connectome-MaleCNS%20v1.0-DE7A22?style=flat-square)](https://male-cns.janelia.org/)
  [![60,001 neurons](https://img.shields.io/badge/neurons-60%2C001%20drawn-DE7A22?style=flat-square)](#whats-real)
  [![151.9M synapses](https://img.shields.io/badge/synapses-151.9M%20measured-2B241C?style=flat-square)](#whats-real)
  [![Runs client-side](https://img.shields.io/badge/runtime-browser--only-2B241C?style=flat-square)](#run-it-locally)
  [![CC BY 4.0 sources](https://img.shields.io/badge/data%20and%203D%20assets-CC%20BY%204.0-978A75?style=flat-square)](#credits--licenses)

  [The piece](#the-piece) · [Run locally](#run-it-locally) · [How it works](#how-it-works) · [Credits](#credits--licenses)
</div>

---

## Fly Lab

The site is **Fly Lab**: a hub at `/` with one tile per experiment, all built on the same fly and the same connectome.

| Path | Experiment |
| --- | --- |
| `/casino/` | **Fruit Fly Slot Machine**, described below |
| `/bar/` | **Fruit Fly at the Bar**, see [The bar](#the-bar) |
| `/trade/` | **Fruit Fly Trading Desk**, see [The trading desk](#the-trading-desk) |
| `/scroll/` | **Two Flies Doomscrolling**, see [Doomscrolling](#doomscrolling) |
| `/game/` | **Fruit Fly Gamer**, see [The gamer](#the-gamer) |
| `/code/` | **Fruit Fly Codes POKYH**, see [The coder](#the-coder) |

New experiments get a page folder (`<name>/index.html`), an entry in `src/entries/`, a Vite input in `vite.config.js`, a row in `seo/content.js`, and a tile in `index.html`.

## The piece

An adult *Drosophila melanogaster* micro-CT scan sits at a one-armed bandit and plays by itself. Its brain glows beside it: **60,001 neurons at their measured positions**, driven by a compact model over the **MaleCNS v1.0** connectome.

The fly is not controlled by the visitor. It sets its own stake, remembers how little comes back, chases losses when its satisfaction signal is low, becomes defensive as credit runs out, and eventually goes broke. There is no real currency, no purchasing, and no tracking—only a browser-side neuroscience artwork.

| Watch the fly | Inspect the brain | Read its state |
| :---: | :---: | :---: |
| <img src="docs/screenshots/fly-playing.png" alt="Fruit fly operating the slot-machine lever" width="300" /> | <img src="docs/screenshots/connectome.png" alt="Neural scope showing the fruit fly connectome" width="300" /> | <img src="docs/screenshots/feelings-and-statistics.png" alt="Live signals, memory, stress proxy, and session ledger" width="300" /> |
| **A real CT scan works the lever.** | **Measured anatomy lights up.** | **State, memory, and return history alter its choices.** |

## What’s real

| Real, measured material | The model built on top |
| --- | --- |
| **Fly anatomy** — an adult *Drosophila* micro-CT scan. | **Neural activity** — no one has recorded a fly at a slot machine; activity is a rate model. |
| **MaleCNS v1.0** — curated cells, soma positions, cell types, transmitter predictions, and 151.9M synapses. | **The game** — reels, odds, credits, and the translated inner monologue are authored. |
| **Mushroom-body circuit identity** — PAM, PPL1, Kenyon-cell, and MBON relationships come from the connectome. | **Behavioural interpretation** — signals are a legible interpretation of the model, not a clinical measurement. |
| **3D cabinet and fly assets** — credited CC BY 4.0 source models. | **Cortisol meter** — a clearly labelled stress proxy; flies do not produce cortisol. |

The distinction is deliberate: the wiring is evidence; the performance is an interpretation of what that wiring might do in this impossible situation.

## How it works

### A compact live brain model

The original graph is too large to run raw in a browser tab, so measured synapses are collapsed into a **1,600-type signed weight matrix** while the scene still draws 60,001 individual neurons at their measured locations. The model continuously integrates type activity and projects the result back to the visible neurons.

```text
driveᵢ = gain × Σⱼ Wᵢⱼrⱼ + inputᵢ
rateᵢ  ← rateᵢ + (activation(driveᵢ) − rateᵢ) × dt / τ
```

Reel motion, reaching for the lever, reward, loss, arousal, and defensive state inject current into relevant real populations. The visible response is driven by the connectome rather than a scripted light show.

### Learning changes the next stake

The fly’s mushroom body updates its KC→MBON synapses during play:

- **PAM** reward activity weakens avoidance-driving MBON pathways.
- **PPL1** punishment activity weakens approach-driving MBON pathways.
- A separate return-memory signal records whether credits are actually coming back.

The next bet combines pursuit, recent reward, learned value, defensive caution, and return history. After sustained bad returns, the fly protects credit by capping its stake—even though it may still pull the lever.

### A readable live state

The right rail exposes the state instead of hiding it: heart rate, dopamine, octopamine, defensive state, NPF, an expandable colour-coded **stress proxy**, mushroom-body learning, the fly’s thoughts, and a complete credit ledger. The experience is responsive: on a phone, the scene remains touch-safe and the information rail follows beneath it without clipped text or overlapping controls.

## The bar

The second experiment for the same fly, at `/bar/`. Both experiments are reached from the **Fly Lab** hub at `/`, a plain HTML page with a tile for each one. The hub loads no JavaScript, and each experiment page links back to it.

At the bar the fly sits on the same stool at a counter with a beer and a tin of nicotine pouches. Nobody controls it. It decides whether to drink, how many sips (1–5), whether to take a pouch and how strong (3–16 mg), and when to stop. Those choices come from its state: neuropeptide F, dopamine, what its mushroom body has learned, the hangover, nicotine craving, and disinhibition.

| What the drug does to the wiring | What it does to the fly |
| --- | --- |
| **Ethanol** strengthens every GABA synapse (GABA-A/Rdl potentiation) and weakens acetylcholine and glutamate ones. | Rising ethanol drives the PAM reward cluster. The first sips are aversive, and that fades. Past its sedation threshold it passes out. Rapid tolerance raises that threshold night by night. |
| **Nicotine** strengthens every cholinergic synapse. That is 911 of the 1,600 simulated cell types. | It lifts dopamine and builds dependence, and a falling level turns into craving. Too much at once saturates the network, and the fly has a seizure. |
| **Hangover** leaves GABA weaker than normal (rebound) and drives PPL1 while the Kenyon cells still code the bar. | NPF drains and the mushroom body learns the morning after. Drinking masks it, and a fly low on NPF drinks again to feel better. |

The drugs act through a per-transmitter multiplier on the measured synapses (`src/neural/pharmacology.js`), using each cell type's predicted transmitter from MaleCNS. The mechanisms are the literature's. The magnitudes and the human-scale units (‰ blood alcohol, ng/mL nicotine) are the model's, chosen to be legible rather than fitted.

## The trading desk

The third experiment, at `/trade/`. The fly sits at a desk in front of six screens and paper-trades **$BNNA** (banana futures) by pressing a BUY and a SELL button with its right foreleg. It holds anything from five units short to five units long. Nobody controls it.

The six screens are the price chart, the news wire, its P&L race against the market, the order book, the whole session with every fill it made, and its own brain, live. The price chart in the middle of the top row is the one fed to its eyes. Its gaze wanders to the others, to the wire when a headline breaks and to the race after a fill.

What makes it more than a bot is **how the fly reads the chart**:

- **It sees the trend.** The chart drives the real vertical motion detectors of the optic lobe: T4c/T5c for upward motion and T4d/T5d for downward. The trend it trades on is read further downstream, from the cell types its own wiring makes direction-selective. `TraderBrain` finds those types at start-up by probing the connectome. On MaleCNS it picks **LPi34, Tlp14 and LPC2** for upward motion and **VS, LPi43 and LPT100** for downward. VS cells prefer downward motion in real flies too.
- **Momentum is a reflex.** Flies turn with wide-field motion (the optomotor response). The same pull decides which way it leans.
- **A crash is a loom.** A red bar growing fast on screen drives the looming detectors LPLC2 and LC4. Those converge on the giant fibre DNp01, the escape command neuron. When DNp01 crosses threshold in the simulation, the fly panic-sells everything.
- **Its biases emerge.** It sells winners early while dopamine is up (the disposition effect) and holds losers until the loss hurts more than admitting it (loss aversion). After a losing run, low NPF makes it size up. Realised profits drive PAM and losses drive PPL1, so its mushroom body learns the market.
- **It is benchmarked.** Buy-and-hold and a coin-flip trader get the same $10,000, the same fees and the same decision moments.

`node tools/sim-trade.mjs --league 8 8` plays eight seeded markets. In a typical run the fly **wins 60–80% of its closes yet beats buy-and-hold in only about half the markets**, because it keeps selling winners early. It beats the coin in most of them.

The market is synthetic and seeded (`?seed=42` replays one exactly), and the money is paper. Nothing here is a real market or investment advice.

## Doomscrolling

The fourth experiment, at `/scroll/`, has **two** flies, Ryhox and Plattnericus, side by side at night. Each has its **own brain**: two rate models run over the same wiring, with two separate mushroom bodies. They scroll a feed of reels and send each other the ones that hit. Nobody controls either of them.

- **There are ten kinds of reel**, five pleasant and five threatening, all things a fly's nervous system cares about. Each is fed into the pathway it would use:
  - rotting fruit goes into the olfactory receptor neurons
  - sugar goes into the gustatory neurons
  - wing song goes into Johnston's organ (JO-A/B)
  - moving stripes and a swarm go into the T4/T5 motion detectors
  - a bug zapper's UV goes onto the whole visual system
  - spiders, a swatter, a vinegar trap, a parasitoid wasp and the zapper's pull go into the looming detectors LPLC2/LC4, which reach the giant fibre DNp01. When it fires, the fly **flinches at a video**.
- **The algorithm knows nothing about flies.** It measures watch time per kind of reel and serves more of what held attention. Threat reels drive PPL1 and octopamine, and an aroused fly watches longer, so **feeds drift towards doom on their own**. Two flies with different brains end up with different feeds. In a typical run one feed settles near 80% doom while the other stays mostly fruit.
- **Messages are sent between the phones.** A reel that spikes dopamine or arousal gets sent to the other fly. Opening a friend's reel is rewarding. A reply is social reward for the sender, and "seen" with nothing else is a small sting.
- **Brain sync** is inter-subject correlation, the measure hyperscanning studies use: for 13 regions, the six-second time course of activity is correlated between the two brains, then averaged. A sent reel is watched *together* when the other fly is free. In `tools/sim-scroll.mjs` sync averages about 0.2–0.3 and rises to about 0.3–0.45 during joint viewing. The effect is modest, but it is not inflated by the drive both brains share.
- **The night** is set by the phone's light, which holds sleep off, so the battery usually gives out first. The morning brings a screen-time report, and the feed remembers the next night.



### TikTok edits (optional, consent-based)

With TikTok allowed, the doomscroll feed shows only Sabrina Carpenter edits, every one tagged `#sabrinacarpenter`: the 32 posts listed in `src/game/tiktokEdits.js`, plus the pool the refresher keeps finding (below). Each fly has its own shuffled feed, so the order is random on every visit. Videos advance after a short watch (at most 14 seconds), with attention influencing how long they stay; the flies still swipe, send favourites, and watch shared edits together. Without consent, the local animated reels remain available.

- **Adding edits:** paste full post URLs (`https://www.tiktok.com/@creator/video/…`) with the creator's handle, then run `node tools/check-tiktok-edits.mjs`. It asks TikTok's public oEmbed endpoint about each post and flags wrong URLs, mismatched handles and captions without `#sabrinacarpenter`. It also checks that TikTok still knows the hashtag.
- **Auto-refresh:** `tools/refresh-tiktok-edits.mjs` finds new posts tagged `#sabrinacarpenter` through a web search API (Brave Search with `BRAVE_API_KEY`, or Google Programmable Search with `GOOGLE_API_KEY` and `GOOGLE_CSE_ID`); it never searches or scrapes TikTok itself. Every find is checked against TikTok's public oEmbed endpoint and kept only if its caption carries the hashtag and the account is plainly a fan's: her own accounts are left out, and so is any account that could pass for hers (look-alike letters in its name, or her name with nothing saying it is a fan account). Posts already in the pool are checked again on every run and dropped when they fail. The result is published at `/pool/tiktok-edits.json` (`public/pool/` locally, ignored by git). With Docker, the `tiktok-edits` service in `docker-compose.yml` refreshes it once a day: `BRAVE_API_KEY=… docker compose up --build`. Without a key it only re-checks the pool it has.
- **No waiting:** the page starts from the last pool this browser saw (`localStorage`, `flylab.edits`, written only while TikTok is allowed and removed on withdrawal) and merges the fresh file in the background, every 20 minutes on a long visit, without touching the videos on screen. Each phone also loads its next video early, muted and paused just below the one playing, so the swipe pulls up a video that is already there.
- **Playback:** only through TikTok's official embed player (`https://www.tiktok.com/player/v1/{id}`). Videos move vertically with the fly's swipe in both the small and expanded players; finished clips advance through the same sharing decision. At most one phone is audible. Nothing is downloaded or re-hosted. Each video is credited and linked to its creator, and the panel lists every edit with a not-affiliated notice.
- **Live hashtag feed:** the panel also has TikTok's official hashtag embed for `#sabrinacarpenter` (`EDIT_TAG` in `src/game/tiktokEdits.js`), folded away under the flies' vitals and loaded only when opened: whatever TikTok lists under the tag right now, fetched fresh each time, not a fixed list. It is shown at three quarters of its size, scaled rather than cropped, so TikTok's own credits, links and cookie choice stay whole. It is TikTok's own widget, so TikTok picks and orders the posts; the page cannot see which ones, which is why the flies' phones still play the listed edits one by one. It is loaded as TikTok's embed iframe (`https://www.tiktok.com/embed/tag/{tag}`) without TikTok's `embed.js`, and sizes itself from the height the frame reports. An empty `EDIT_TAG` leaves it out.
- **Consent first:** before the visitor chooses *Allow TikTok videos*, the page makes **no request to TikTok at all**, and does not load the pool file either. Rejecting is as easy as accepting, and closing the notice counts as rejecting. The choice is kept in `localStorage` (`flylab.consent`) and can be changed with *Cookie settings* on the page or on the legal page, where the privacy policy has its own TikTok section. Withdrawing removes all players and the hashtag feed at once.
- **Player errors:** a post that TikTok reports as unavailable (error 1001, for example when it was deleted or embedding is off) is dropped for good. Server and playback errors load the video again, quietly, up to twice (the first players of a visit often fail while TikTok's session is still being set up), and skip it only if it keeps failing. A blocked autoplay is retried muted.
- TikTok shows its **own** cookie notice inside the player the first time. That choice belongs to the visitor.

## The gamer

The fifth experiment, at `/game/`. The fly sits in a gaming chair with a headset on and plays **League of Legends, Minecraft, Fortnite, CS2, Red Dead Redemption 2, God of War and God of War Ragnarök** in turn, on a curved monitor, with a vertical one beside it for the team's voice chat and the scoreboard, and a PC full of RGB. Its right foreleg is on the mouse. Nobody controls it. The games are painted procedurally in `src/scene/gamePainters.js` and, one file per game, `src/scene/painters/`; no footage, logo or asset of any of them is used.

- **It aims with its reflexes.** The in-game view turning is wide-field motion on the horizontal motion detectors (T4a/T5a against T4b/T5b). The turn is read back from cells the connectome makes direction-selective, found at start-up by the trading desk's probe, now parametrised.
- **It tracks like it courts.** An enemy drives LC10a and LC11, the small-object cells. What comes back downstream sets how fast the crosshair gets onto the target. The probe finds the anterior optic tubercle (AOTU008, AOTU050) among the readers, which is where LC10 projects in a real fly.
- **A creeper is a loom.** Ganks, creepers, players over the wall and peeks drive LPLC2/LC4 to the giant fibre DNp01. Past threshold the fly flinches, with a panic flick and a wasted shot.
- **It hears the headset.** Gunfire and teammates shouting drive Johnston's organ (JO-A/B).
- **It learns each game.** Each game drives its own sparse set of Kenyon cells. `MushroomBodyMemory` takes a `sparse` option so that only activity above the floor learns. The fly's value for each game is read through that game's own Kenyon cells.
- **It rages.** Tilt is a model state fed by deaths, defeats and flame through PPL1 and octopamine. Past one mark, a death ends on the desk (a foreleg slam, with everything going red). Past another, a lost match ends in a rage-quit: Alt-F4, the desktop, another game. Its choice comes from memory, NPF, novelty, tilt and habituation.

`node tools/sim-game.mjs --league 10 8` plays eight seeded ten-minute sessions. In a typical run the fly slams the desk about once a minute, rage-quits one to four times, switches game five times or so, and ends up hating a different game depending on the seed.

## The coder

The sixth experiment, at `/code/`. The fly spends the night at a wooden desk in a cozy room (rain on the window, fairy lights, a desk lamp, plants) and works on **POKYH**, the team's web app, on a MacBook and an external monitor. It drinks coffee. Nobody controls it.

- **Real code.** `tools/refresh-pokyh-code.mjs` copies a whitelist of UI files from the public `bedchem/pokyh-frontend` into `src/game/pokyhCode.js` at build time. API routes, auth and config are excluded, and lines that look like secrets are scanned out. At runtime nothing is fetched. The fly types that code a character at a time with its right foreleg on the MacBook's real key layout; keys out of its reach are typed on the nearest one it reaches.
- **The work.** Saves, type errors, builds, commits, pushes, merge conflicts and CI all run in `src/game/coder.js`. Red drives PPL1, green drives PAM, and a deploy to pokyh.com is the jackpot.
- **Sleep.** Sleep pressure and the small hours drive the dorsal fan-shaped body (the FB6 types), whose answer is the sleep drive it nods off on (Donlea et al. 2011, 2014). A nod is a loom on LPLC2/LC4. If the giant fibre fires it jerks awake; if not, it sleeps on the keys until sunrise.
- **Caffeine.** Modelled like the bar's drugs: absorption, a half-life, tolerance, jitters and a crash. It cuts the sleep drive, drives PAM and raises dopaminergic gain (Nall et al. 2016). It is bitter, and every sip drives the gustatory neurons and PPL1 (Lee et al. 2009), less as the taste becomes familiar.
- **The room.** Six CC0 Poly Haven props (`tools/fetch-polyhaven.mjs`), compressed to about 2 MB; everything else is procedural.

## Run it locally

### Requirements

- Node.js 18 or newer
- npm
- A browser with WebGL enabled

### Development

```bash
npm install
npm run dev
```

Vite prints the local URL (normally `http://localhost:5173`): the hub, with the experiments at `/casino/` and `/bar/`. The committed browser assets mean the application runs immediately after dependencies are installed.

### Production build

```bash
npm run build
npm run preview
```

### Docker

```bash
docker compose up --build
```

The default host port is `3006`. Choose another with `PORT=8088 docker compose up --build`.

## Verify it

```bash
# Build the static site, metadata, sitemap, and AI-readable summaries
npm run build

# Exercise timing, reel alignment, win distribution, RTP, and return memory
node tools/test-machine.mjs

# Play a deterministic headless session
node tools/sim-session.mjs 3 20260919

# Several nights at the bar, headless: every decision, body level and memory
node tools/sim-bar.mjs 12 1

# Trading, headless: every order and why; --league compares fly, buy-and-hold and a coin
node tools/sim-trade.mjs 8 1
node tools/sim-trade.mjs --league 8 8

# Can the foreleg reach both trading buttons?
node tools/check-trade-reach.mjs

# Two flies doomscrolling, headless: sends, flinches, dead phones, morning reports, brain sync
node tools/sim-scroll.mjs 6 1
node tools/check-scroll-reach.mjs

# The gamer, headless: kills, deaths, flinches, slams, rage-quits and what it learns about each game
node tools/sim-game.mjs 10 1
node tools/sim-game.mjs --league 10 8

# Mouse and desk in reach, the headset fitted to the head, the shot framed
node tools/check-game-reach.mjs
node tools/fit-headset.mjs
node --test tools/test-game-camera.mjs

# The coder, headless: coffee, commits, red builds, CI, nods and sleep, night after night
node tools/sim-code.mjs 10 1
node tools/check-code-reach.mjs
node --test tools/test-code-camera.mjs
```

The game model is deterministic under a seed, which makes behavioural changes reviewable rather than anecdotal.

## Project map

```text
src/
  entries/     one entry per experiment page, mounted through mount.jsx
  hub/         the Fly Lab hub's stylesheet (the hub itself is index.html)
  scene/       Three.js scenes (casino, bar, trading desk, doomscroll, gaming setup, coder's room), fly rig, props, cameras
  game/        deterministic state machines and decision policies: machine.js, bar.js,
               trader.js and the seeded market it trades, market.js, scroll.js, and gamer.js
               with the seven games it plays, games.js, and coder.js with the POKYH
               code it types, pokyhCode.js
  neural/      connectome loading, rate model, learning, drug pharmacology, visual scope
  audio/       synthesized Web Audio feedback; no sampled soundtrack
  ui/          live readouts, stress meter, thoughts, memory, ledger, slips
seo/           titles, canonical URLs, structured data, sitemap, llms files
tools/         asset processing, measurement, rendering, and simulations
public/
  data/        compact browser-ready neuron and graph data
  models/      processed fly and slot-machine models
docs/screenshots/  README visuals
```

## Publishing and discoverability

`site.config.js` is the single source for the public URL, credited authors, repository, operator, and host details. The build generates page titles, descriptions, canonical URLs, Open Graph/Twitter cards, JSON-LD, `sitemap.xml`, `robots.txt`, `site.webmanifest`, `humans.txt`, `llms.txt`, and `llms-full.txt`.

Before deploying, replace the remaining host and privacy-policy placeholders in `site.config.js`. Then submit the generated sitemap to the relevant webmaster tools.

## Credits & licenses

- **Connectome:** [MaleCNS v1.0](https://male-cns.janelia.org/) by FlyEM/HHMI Janelia, University of Cambridge, MRC LMB, and Google Research — CC BY 4.0.
- **Fruit fly model:** [Drosophila adult fruit fly CT scan](https://sketchfab.com/3d-models/drosophila-adult-fruit-fly-ct-scan-ad29b897bd2b4e27bb04ab9d31baa117) by etainproject — CC BY 4.0.
- **Slot-machine model:** [Pillar Slots](https://sketchfab.com/3d-models/pillar-slots-91e255e5a95745f4857607b388421ee1) by local.yany — CC BY 4.0.
- **Games:** League of Legends (Riot Games), Minecraft (Mojang Studios / Microsoft), Fortnite (Epic Games), Counter-Strike 2 (Valve), Red Dead Redemption 2 (Rockstar Games), God of War and God of War Ragnarök (Sony Interactive Entertainment / Santa Monica Studio) are named for what the fly plays. Their screens are drawn procedurally by this project, and Fly Lab is not affiliated with any of them.
- **Energy drink:** [Monster Ultra White](https://sketchfab.com/3d-models/monster-ultra-white-542dc45df0774f41ab67d96bf99b332f) by prajwalk12 — Sketchfab Standard license. Monster Energy is a trademark of Monster Energy Company; no affiliation.
- **Coder's room props:** plants, desk lamp, shelf, books and wall clock from [Poly Haven](https://polyhaven.com), CC0.
- **POKYH code:** from [bedchem/pokyh-frontend](https://github.com/bedchem/pokyh-frontend), by BedChem. The laptop is drawn generically; no affiliation with Apple.
- **Project authors:** [ryhox](https://github.com/ryhox), [Nexor](https://github.com/plattnericus) and [peramanu](https://github.com/peramanu).

The project code is released under the [MIT License](LICENSE). Asset and dataset licenses remain those of their respective creators.
