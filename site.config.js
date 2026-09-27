/**
 * Everything about the site that is not code: its address, its name, who runs
 * it. The build (seo/vite-plugin-site.js) reads this and writes it into every
 * page's meta tags and structured data, the sitemap, robots.txt, llms.txt and
 * the legal page — so it only ever has to be changed here.
 *
 * Before publishing, replace every value in [square brackets].
 */
export default {
  /** The published address, no trailing slash. */
  url: 'https://fly.pokyh.com',

  name: 'Fly Lab',
  shortName: 'Fly Lab',
  tagline: 'Experiments with a real fruit fly brain.',
  description:
    'Experiments with a real fruit fly brain: a CT-scanned fly and 60,000 real neurons from the '
    + 'MaleCNS connectome, put at a slot machine, at a bar, at a trading desk, in front of two phones, at a gaming setup and at a desk all night. It decides everything itself — '
    + 'its stakes, its drinks, when to stop — and its mushroom body learns from what happens.',
  keywords: [
    'fruit fly', 'Drosophila melanogaster', 'connectome', 'MaleCNS', 'FlyEM',
    'neuroscience simulation', 'brain simulation in the browser', 'mushroom body',
    'dopamine', 'reward learning', 'gambling', 'slot machine', 'ethanol', 'nicotine',
    'hangover', 'paper trading', 'motion vision', 'giant fiber', 'doomscrolling', 'recommendation algorithm',
    'gaming', 'rage quit', 'League of Legends', 'Minecraft', 'Fortnite', 'CS2',
    'Red Dead Redemption 2', 'God of War', 'optomotor response',
    'caffeine', 'sleep', 'fan-shaped body', 'coding', 'POKYH', 'three.js', 'WebGL',
  ],
  language: 'en',
  locale: 'en_US',
  themeColor: '#e1d6c1',

  /** Keep every credited person explicit so people and crawlers find both profiles. */
  authors: [
    { name: 'ryhox', url: 'https://github.com/ryhox' },
    { name: 'Nexor', url: 'https://github.com/plattnericus' },
    { name: 'peramanu', url: 'https://github.com/peramanu' },
  ],
  repository: 'https://github.com/bedchem/fruit-fly-slot-machine',

  /**
   * Who is responsible for the site, for the privacy notice: GDPR art. 13 asks
   * for the controller's identity and a way to reach them. A private,
   * non-commercial site in Italy needs no postal address or VAT number — those
   * only come in if it is ever run as an economic activity (D.Lgs. 70/2003,
   * art. 7). The email can be an address used only for this site.
   */
  operator: {
    name: 'Pokyh',
    email: 'contact@pokyh.com',
  },

  /** Who hosts the site: named in the privacy notice as a data processor. */
  host: {
    name: '[Hosting provider, e.g. Netlify, Inc.]',
    privacyUrl: '[https://link-to-their-privacy-policy]',
  },
};
