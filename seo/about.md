# How Fly Lab works

**Fly Lab** is a set of experiments with one real fruit fly brain, each putting the same CT-scanned fly somewhere new. There are six so far: the [slot machine](/casino/), the [bar](/bar/), the [trading desk](/trade/), [two flies doomscrolling](/scroll/), [the gamer](/game/) and [the coder](/code/). Most of this page is about the first; the others have their own sections further down.

**Fruit Fly Slot Machine** is an interactive neuroscience piece that runs in the browser. A micro-CT scan of a real fruit fly (*Drosophila melanogaster*) sits on a bar stool and plays a one-armed bandit by itself. Beside it, 60,000 real neurons from the MaleCNS connectome are drawn at their measured positions and light up as it plays.

The fly picks its own stakes. Its mushroom body learns, from reward and punishment dopamine, that the machine is bad for it. It keeps playing anyway. When it runs out of credit it panics, gives up, and behaves as if it were dying.

It is a question put to a real brain: what would a fruit fly's nervous system do if the fly were forced to gamble forever?

## What is real

- **The fly.** A micro-CT scan of an adult *Drosophila melanogaster* by etainproject (CC BY 4.0), about 1.5 million triangles, decimated to 330,000 for the browser. Its right foreleg is rigged when the page loads, so it reaches for the lever, pulls it down and lets it spring back.
- **The brain.** [MaleCNS v1.0](https://male-cns.janelia.org/) is the complete wiring diagram of a male fruit fly's central nervous system. It was mapped synapse by synapse from electron microscopy by [HHMI Janelia's FlyEM team](https://www.janelia.org/project-team/flyem) with Google Research, the University of Cambridge and the MRC Laboratory of Molecular Biology. The page uses:
  - 141,781 neurons with curated soma positions, of which 60,000 are drawn
  - their curated cell types and classes
  - 151.9 million measured synapses, collapsed into a weighted graph of 1,600 cell types and 70,128 signed connections
  - each neuron's predicted neurotransmitter, which sets whether a connection excites or inhibits
  - the real reward (PAM) and punishment (PPL1) dopamine clusters, found by their cell-type names
- **The cabinet.** "Pillar Slots" by local.yany (CC BY 4.0).

## What is a model

Nobody has recorded a fruit fly playing a slot machine. The activity on screen is a **rate model** run over the measured wiring:

    drive_i = GAIN · Σ_j W_ij · r_j + I_i
    r_i    += (φ(drive_i) − r_i) · dt / τ

The game only injects current into real populations: visual neurons while the reels turn, mechanosensory and descending neurons while the foreleg works the lever, the PAM cluster on a payout and PPL1 on a loss, the way optogenetic reinforcement experiments drive them. Between spins the fly's standing state keeps driving the network, so the brain is never idle. Which regions light up after that is decided by the connectome, not by a script.

This is a rate model on a type-collapsed graph, not a spiking simulation of every neuron.

## How it learns

The fly learns the way real flies do: in the **mushroom body**. Kenyon cells carry a sparse code for the current context, which here is sitting in front of this machine. They connect to mushroom-body output neurons (MBONs). When dopamine arrives while the Kenyon cells are active, the Kenyon cell → MBON synapses in that compartment weaken.

- **PPL1 compartments** hold MBONs that drive *approach*. Losses weaken them, so the fly learns to avoid the machine.
- **PAM compartments** hold MBONs that drive *avoidance*. Payouts weaken them, so the fly learns to approach.

Which MBON belongs to which dopamine cluster is not written by hand. It is read off the connectome's own synapse counts. For example, MBON01 (γ5β′2a) receives 290 synapses from PAM and 1 from PPL1, while MBON11 (γ1pedc) receives 308 from PPL1. The weakened synapses are written back into the simulation, so the network's output changes with what the fly has been through. On these odds it learns that the machine is bad, and it keeps playing: learned aversion slows its approach but never stops it.

## How it gambles

- **The odds.** One spin in seven pays: 3× the stake for three of a kind, 12× for three sevens. About half of every credit staked comes back.
- **The stake.** The fly bets 1–5 credits, and nothing hard-codes how many. Four pulls decide it at the moment it commits:
  - *chase*: low neuropeptide F. Deprived flies seek reward harder, so a losing run pushes the stake up.
  - *reward*: the PAM cluster still firing after a payout.
  - *memory*: what the mushroom body has learned about this machine.
  - *caution*: the defensive state. A fly in a poor state reads ambiguous odds pessimistically.
- **Out of credit.** It panics, with a burst through PPL1 and the escape pathways, then gives up. Its heart slows almost to a stop, neuropeptide F drains, and it slumps on the stool. It is not dying; it behaves as if it were. After a while someone feeds the machine and it comes round, warier than before.

## Its inner state

The readouts use signals that have actually been measured in this animal, not human feelings with insect names:

- **Dopamine (PAM):** appetitive reinforcement. PPL1 carries the aversive side (Burke et al. 2012; Aso et al. 2014).
- **Octopamine:** the insect counterpart of noradrenaline. It signals arousal and sits upstream of the reward dopamine neurons (Burke et al. 2012).
- **Neuropeptide F (NPF):** the fly's version of NPY, a satisfaction signal. Deprived, low-NPF flies seek reward harder (Shohat-Ophir et al. 2012).
- **Defensive state:** a persistent, scalable state that meets the criteria of an emotion primitive, deliberately not called fear (Gibson et al. 2015).
- **Judgement bias:** flies in a poor state judge ambiguous cues pessimistically (Deakin et al. 2018).
- **Heart rate:** about 270–290 beats per minute in a young adult, rising under octopaminergic arousal.

The fly's thoughts shown in words are ours; a fly has no words. Each line is chosen from its actual state (credits, losing streak, the last outcome, NPF, the defensive state and what it has learned), so the words translate numbers that are already on screen.

## At the bar

The second experiment puts the same fly, on the same stool, at a bar counter with a beer and a tin of nicotine pouches. Nobody controls it. It decides whether to drink, how many sips (1–5), whether to take a pouch and how strong (3–16 mg), and when to stop, from its state at that moment: neuropeptide F, dopamine, what its mushroom body has learned, the hangover, nicotine craving, and disinhibition.

The drugs act on the wiring, not on the behaviour. Each is given a receptor, and the connectome already says which of the 1,600 simulated cell types release the transmitter that receptor answers to:

- **Ethanol** strengthens every GABA synapse (GABA-A / Rdl potentiation) and weakens acetylcholine and glutamate synapses. Rising ethanol drives the PAM reward cluster, because flies find ethanol rewarding. The first sips are aversive through PPL1, and that fades. Past the sedation threshold the fly passes out. Rapid tolerance raises that threshold from night to night.
- **Nicotine** strengthens every cholinergic synapse, which is 911 of the 1,600 types and most fast excitation in an insect brain. It lifts dopamine and builds dependence, and a falling level turns into craving. Too much at once saturates the network, and the fly has a seizure. Nicotine is an insecticide.
- **The hangover** is what the night leaves behind, felt as the ethanol clears. Inhibition rebounds below normal, NPF drains, and PPL1 fires while the Kenyon cells still code the bar, so the mushroom body learns the morning after as well. Drinking again masks it, and a fly low on NPF takes that deal.

The mechanisms come from the literature. The magnitudes and the human-scale units (‰ blood alcohol, ng/mL nicotine) are the model's, chosen to be legible rather than fitted. No fly was served a beer.

## At the trading desk

The third experiment sits the fly at a desk in front of six screens: the price chart, the news wire, its P&L race against the market, the order book, the session with every fill it made, and its own brain, live. It paper-trades one synthetic ticker, $BNNA (banana futures), by pressing BUY and SELL with its rigged foreleg. It holds from five units short to five long. The market is simulated and seeded. The money is paper.

The fly does not get the price as a number; it gets the chart as motion. The newest candle climbing or falling drives the vertical motion detectors of the optic lobe: T4c and T5c for upward motion, and T4d and T5d for downward. The trend it acts on is read downstream of those, from cell types the connectome itself makes direction-selective. None of them are listed by hand. At start-up the model drives the upward detectors and then the downward ones on its own wiring, and keeps the types that answer most differently. On MaleCNS these are lobula-plate cells such as LPi34 and Tlp14 for upward motion, and VS and LPi43 for downward. In a real fly, VS cells also prefer downward motion.

Following that signal is the trading version of the optomotor response, the reflex by which a fly turns with the motion around it. A crash is different. A red bar that grows fast on screen is a looming stimulus, and it drives LPLC2 and LC4. Those converge on the giant fibre, DNp01, the fly's command neuron for escape. If the giant fibre crosses threshold in the simulation, the fly flees the market and sells everything, whatever it had planned.

Realised profit drives the reward cluster PAM and realised loss drives PPL1, so the mushroom body learns what being in this market is worth. On top of that the fly shows biases people have names for: it sells winners early while dopamine is up, holds losers until the loss hurts more than admitting it, and sizes up after a losing run when NPF is low. A buy-and-hold account and a coin-flip trader run alongside it with the same money, fees and moments of decision. The fly usually wins most of its trades and still often lags buy-and-hold.

## Two flies doomscrolling

The fourth experiment puts two flies side by side at night, each with a phone and each with its own brain: two rate models over the same measured wiring, with two mushroom bodies that learn separately. They scroll a feed of reels and send each other the ones that hit.

There are ten kinds of reel, five pleasant and five threatening, all things a fly's nervous system has an opinion on. Each goes in through the pathway a fly would really use. Rotting fruit drives the olfactory receptor neurons, and sugar drives the gustatory neurons. A courtship wing song drives Johnston's organ, the antennal neurons tuned to near-field sound. A field of moving stripes and a wheeling swarm drive the T4 and T5 motion detectors, and a bug zapper's UV glow drives the whole visual system. A spider, a swatter, a vinegar trap, a parasitoid wasp and the zapper's pull are looming stimuli: they drive LPLC2 and LC4, which reach the giant fibre DNp01. When the giant fibre fires, the fly flinches at a video.

The feed's algorithm knows nothing about flies. It measures how long each kind of reel was watched and serves more of whatever held attention. Threat reels drive the punishment cluster and octopamine, and an aroused fly watches longer, so the feeds drift towards doom without anyone deciding they should. Because the two brains differ in state and history, the two feeds drift differently.

A reel that spikes a fly's dopamine or arousal gets sent to the other. Opening a reel from a friend is rewarding in itself. A reply is social reward for the sender, and being left on "seen" is a small sting. Replies make sending more likely.

Brain sync is measured live as inter-subject correlation, the measure hyperscanning studies use between people watching the same film: for a dozen brain regions, the time course of activity over the last six seconds is correlated between the two flies, then averaged. Different reels pull the two apart. A sent reel, watched together while the other fly is free, pulls them into step.

If edits are configured, the feed can also serve real TikTok fan edits, but only after the visitor allows TikTok. They play through TikTok's own embedded player, credited to their creators, and nothing loads from TikTok before that choice. Beside the flies, TikTok's official hashtag embed then shows what TikTok lists under the edits' hashtag right now, fresh on every visit. The privacy policy has the details.

The phone's light holds sleep off, and usually the battery gives out first. In the morning there is a screen-time report, and the next night's feed starts where the last one ended.

## At the gaming setup

The fifth experiment puts the fly in a gaming chair with a headset on, in front of a curved monitor, a vertical one and a PC full of RGB. It plays seven games in turn: League of Legends, Minecraft, Fortnite, Counter-Strike 2, Red Dead Redemption 2, God of War and God of War Ragnarök. The games are drawn by us, procedurally, from their conventions: a lane seen from above, blocks at night, a storm, a sandy corridor, a trail at dusk, snow in a Norse forest. There is no footage, no logo and no asset from any of them, and none of their makers is involved. Nobody controls the fly; its right foreleg is on the mouse.

The game goes in through the fly's own senses. The in-game view swinging left or right is wide-field horizontal motion, the stimulus of the optomotor response, and it drives the horizontal motion detectors T4a/T5a and T4b/T5b. Which way the fly's reflex pulls is read back from the cell types its wiring makes selective for one direction over the other, found at start-up by the same probe the trading desk uses for up and down. An enemy on screen is a small moving target. It drives LC10a and LC11, the lobula columnar cells for small objects. LC10a is what a courting male tracks a female with. What comes back downstream of them sets how fast the crosshair gets onto the enemy. On MaleCNS the probe finds the anterior optic tubercle among those readers, which is where LC10 projects in a real fly. A gank, a creeper or a player jumping the wall is a looming stimulus: it drives LPLC2 and LC4 to the giant fibre, DNp01. Past threshold, the fly flinches, and the escape reflex is wasted on a mouse. Gunfire and teammates shouting through the headset drive Johnston's organ, JO-A and JO-B.

Kills and wins drive PAM; deaths, defeats and flame drive PPL1. Each game drives its own sparse set of Kenyon cells, the way an odour would, so the mushroom body learns what each game does to the fly separately. The sets overlap through the network, so some of what one game teaches spreads to the others. After every match the fly chooses again: the same game, or another one. The choice comes from what it has learned, from NPF (low NPF means "one more"), from novelty, and from tilt. Playing the same game match after match habituates, so it pulls less.

Tilt is the model's name for a persistent, scalable state built from deaths, defeats and flame through PPL1 and octopamine, and bled off by wins. It makes the fly's aim shaky. Fly aggression needs octopamine (Hoyer et al. 2008; Zhou et al. 2008). Tilted far enough, the fly slams the desk with its foreleg. Further still, it rage-quits: Alt-F4, the desktop, another game. Its mushroom body remembers the game that did it, and it queues for something anyway.

## At the desk, coding

The sixth experiment puts the fly at a wooden desk in a cozy room at night. There is rain on the window, a string of fairy lights, a desk lamp, plants and a bookshelf, with a MacBook under its right foreleg and an external monitor behind it. It works on POKYH, its team's web app for the students of LBS Brixen, from half past ten until the sun comes up. What it types, a character at a time, is real code from the public pokyh-frontend repository, snapshotted at build time. Nothing is fetched from GitHub while the page runs. It saves, builds, commits, pushes and waits on CI, and green on main ships to pokyh.com. Type errors, red builds, merge conflicts and CI failures drive PPL1; green builds, commits and deploys drive PAM, and a deploy is the jackpot.

It drinks coffee, and nobody tells it when. Flies sleep, and a population in the dorsal layers of the fan-shaped body promotes it: the longer a fly is awake, the more excitable those neurons become, and driving them puts a fly to sleep (Donlea et al. 2011, 2014). On MaleCNS they are the FB6 types. Sleep pressure, meaning the hours awake plus the small hours, is current into them, and what they answer is the sleep drive the fly nods off on. Caffeine cuts that drive, the way it blocks the adenosine signal of sleep pressure. In flies its wake effect runs through dopamine: it acts on the PAM neurons, and without them it does not keep a fly awake (Nall et al. 2016). Caffeine is modelled like the bar's drugs, as a level in mg that is absorbed and cleared. It builds tolerance, brings jitters at high doses, and a crash as a big dose wears off.

Coffee is also bitter, and flies avoid caffeine: bitter taste neurons detect it (Lee et al. 2009). Every sip drives the gustatory neurons and PPL1, less as the taste becomes familiar, while the caffeine arriving drives PAM. The mushroom body learns which of the two wins. When the fly's head drops towards the keyboard, that is a looming stimulus on LPLC2 and LC4. If the giant fibre fires, it jerks awake. If not, it falls asleep on the keys, and the editor fills with whatever its tarsus rests on until the morning.

## What it is not

- It is not a recording of a real fly. The anatomy is measured; the dynamics are a model.
- It is not a gambling site. There is no money, no betting and nothing to buy; the fly plays alone.
- It is not investment advice. The trading desk uses a simulated market and paper money.
- It is not affiliated with Riot Games, Mojang Studios, Microsoft, Epic Games or Valve. The games on the fly's monitor are drawn by us and named for what they are.
- It is not affiliated with Apple. The coder's laptop is drawn generically.
- It does not promote alcohol or nicotine. The bar shows a fly passing out, poisoning itself and waking up hungover.
- It is not affiliated with, or endorsed by, HHMI Janelia, Google, the University of Cambridge or the MRC LMB.

## Built with

React, three.js and React Three Fiber, with the simulation, the learning and the synthesised sound all running client-side in plain JavaScript. There is no server and no tracking. The source code is on [GitHub](%SITE.repository%).

## Credits and licences

- Fly scan © etainproject, CC BY 4.0
- "Pillar Slots" cabinet © local.yany, CC BY 4.0
- MaleCNS v1.0 © FlyEM/HHMI Janelia, University of Cambridge, MRC LMB and Google Research, CC BY 4.0
- Plants, desk lamp, shelf, books and wall clock in the coder's room from Poly Haven, CC0
- The code on the coder's screens is from POKYH's public frontend, by BedChem
