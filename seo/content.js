/**
 * The pages, and the questions people (and the AI assistants answering them)
 * actually ask about this project. One list, rendered three ways by
 * vite-plugin-site.js: as HTML on the About page, as FAQPage structured data,
 * and as Markdown in llms-full.txt.
 */

export const PAGES = [
  {
    file: 'index.html',
    path: '/',
    title: 'Fly Lab: experiments with a real fruit fly brain',
    description:
      'One CT-scanned fruit fly, 60,000 real neurons from the MaleCNS connectome, and a different place '
      + 'to put it each time: a slot machine, a bar, a trading desk, a phone, a gaming PC, a laptop at 3 am. Nobody controls it — you watch what the wiring does.',
    changefreq: 'monthly',
    priority: '1.0',
  },
  {
    file: 'casino/index.html',
    path: '/casino/',
    title: 'Fruit Fly Slot Machine: a real fly brain that gambles | Fly Lab',
    description:
      'A real fruit fly CT scan plays a slot machine while 60,000 neurons from the MaleCNS '
      + 'connectome light up. It picks its own stakes, learns the machine is bad, and plays on.',
    changefreq: 'monthly',
    priority: '0.9',
  },
  {
    file: 'bar/index.html',
    path: '/bar/',
    title: 'Fruit Fly at the Bar: a real fly brain on beer and nicotine | Fly Lab',
    description:
      'A real fruit fly CT scan drinks beer through a straw and takes nicotine pouches while both drugs act '
      + 'on the MaleCNS connectome. It decides how much, when to stop, and wakes up with the hangover.',
    changefreq: 'monthly',
    priority: '0.9',
  },
  {
    file: 'trade/index.html',
    path: '/trade/',
    title: 'Fruit Fly Trading Desk: a real fly brain paper-trades | Fly Lab',
    description:
      'A real fruit fly CT scan paper-trades banana futures: the chart drives its own motion detectors, '
      + 'the MaleCNS connectome decides which way it leans, and a crash fires its escape reflex.',
    changefreq: 'monthly',
    priority: '0.9',
  },
  {
    file: 'scroll/index.html',
    path: '/scroll/',
    title: 'Two Flies Doomscrolling: real fly brains on a feed | Fly Lab',
    description:
      'Two real fruit fly brains, simulated on the MaleCNS connectome, scroll reels at night and send each other '
      + 'the ones that hit. The algorithm only measures watch time, and drifts them towards doom.',
    changefreq: 'monthly',
    priority: '0.9',
  },
  {
    file: 'game/index.html',
    path: '/game/',
    title: 'Fruit Fly Gamer: a real fly brain plays League, Minecraft, CS2, Siege and God of War | Fly Lab',
    description:
      'A real fruit fly CT scan games on a curved monitor with a headset on: the MaleCNS connectome aims with its motion '
      + 'detectors, flinches at creepers through its giant fibre, learns which game hurts it, opens CS2 cases — and rage-quits.',
    changefreq: 'monthly',
    priority: '0.9',
  },
  {
    file: 'code/index.html',
    path: '/code/',
    title: 'Fruit Fly Codes POKYH: a real fly brain on caffeine ships code all night | Fly Lab',
    description:
      'A real fruit fly CT scan codes through the night on a MacBook in a cozy room, drinking coffee: caffeine against the '
      + 'sleep drive of its dorsal fan-shaped body, on the MaleCNS connectome, until it deploys — or falls asleep on the keys.',
    changefreq: 'monthly',
    priority: '0.9',
  },
  {
    file: 'swat/index.html',
    path: '/swat/',
    title: 'Fruit Fly vs. the Swatter: a real fly brain escapes on its giant fibre | Fly Lab',
    description:
      'A real fruit fly CT scan drinks spilled beer on a pub table while a swatter comes down. The swatter head growing in its '
      + 'eyes drives LPLC2 and LC4 on the MaleCNS connectome, the giant fibre DNp01 decides when it jumps — and ethanol slows it.',
    changefreq: 'monthly',
    priority: '0.9',
  },
  {
    file: 'about.html',
    path: '/about.html',
    title: 'How it works: a fruit fly connectome simulation | Fly Lab',
    description:
      'How the Fly Lab experiments work: the MaleCNS connectome, a rate model over 151.9 million measured '
      + 'synapses, mushroom-body learning from dopamine, drugs acting on transmitters, and what is real.',
    changefreq: 'monthly',
    priority: '0.8',
  },
  {
    file: 'legal.html',
    path: '/legal.html',
    title: 'Legal notice and privacy | Fly Lab',
    description: 'Legal notice, privacy policy and licences for Fly Lab.',
    changefreq: 'yearly',
    priority: '0.2',
    noindex: false,
  },
];

export const FAQ = [
  {
    q: 'Is the fruit fly brain in the Fruit Fly Slot Machine real?',
    a: 'Yes. The anatomy is real: 60,000 neurons are drawn at their measured positions from MaleCNS v1.0, '
      + 'the complete connectome of a male fruit fly mapped by HHMI Janelia\'s FlyEM team with Google Research, '
      + 'the University of Cambridge and the MRC LMB. The wiring the simulation runs on comes from 151.9 million '
      + 'measured synapses. The activity itself is a model, because no one has recorded a fly playing a slot machine.',
  },
  {
    q: 'What is a connectome?',
    a: 'A connectome is a complete wiring diagram of a nervous system: every neuron and every synapse between them. '
      + 'The fruit fly (Drosophila melanogaster) is the most complex animal whose whole central nervous system has been mapped.',
  },
  {
    q: 'How does the fly decide how much to bet?',
    a: 'Nothing hard-codes the stake. It comes from the fly\'s state at the moment it pulls: low neuropeptide F pushes it '
      + 'to chase losses, recent reward dopamine makes it bolder, the defensive state makes it careful, and what its '
      + 'mushroom body has learned about the machine pushes either way. It bets between 1 and 5 credits.',
  },
  {
    q: 'Does the fruit fly actually learn?',
    a: 'Yes. Its mushroom body learns on the measured wiring: dopamine arriving while Kenyon cells are active weakens '
      + 'the Kenyon cell to MBON synapses in that compartment. Punishment (PPL1) weakens the MBONs that drive approach, '
      + 'reward (PAM) weakens the ones that drive avoidance. On these odds it learns the machine is bad, and keeps playing.',
  },
  {
    q: 'What happens when the fly runs out of credit?',
    a: 'It panics, then gives up: its heart slows almost to a stop, its satisfaction signal drains and it slumps on the '
      + 'stool, behaving as if it were dying. After a while someone feeds the machine and it comes round, warier than before.',
  },
  {
    q: 'Is this a gambling website?',
    a: 'No. There is no money, no betting and nothing to buy. The fly plays alone; you watch.',
  },
  {
    q: 'What is the Fruit Fly Slot Machine built with?',
    a: 'React, three.js and React Three Fiber in the browser. The connectome simulation, the mushroom-body learning and '
      + 'the synthesised sound all run client-side in JavaScript, with no server and no tracking.',
  },
  {
    q: 'Who made the Fruit Fly Slot Machine?',
    a: 'It was made by ryhox, Nexor and peramanu. The source code is open on GitHub.',
  },
];
