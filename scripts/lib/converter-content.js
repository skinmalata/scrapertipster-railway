'use strict';

// Authored content model for the programmatic code-converter pages
// (/convert/<from>-to-<to>/). The editorial blocks below are hand-written per
// pair on purpose: pages that only differ by bookmaker name are a doorway
// cluster risk, so each pair carries unique intro, how-to steps and FAQs.
// validateContent() fails the build if any page would be thin.

const BOOKMAKERS = {
  sportybet: {
    name: 'SportyBet',
    codeType: 'share code',
    findSteps: [
      'Open the SportyBet app and open the slip you want to convert (My Bets or the winning slip).',
      'Tap the Share option on the slip and copy the share code it displays.'
    ],
    redeemHint: 'Open the SportyBet app, paste the code into the code entry field and load the slip.',
    marketNote: 'SportyBet code creation is not limited to 1X2 — any selection SportyBet still offers can be re-encoded.'
  },
  msport: {
    name: 'MSport',
    codeType: 'share code',
    findSteps: [
      'Open the MSport app and open the slip you want to convert.',
      'Tap Share on the slip and copy the share code it displays.'
    ],
    redeemHint: 'Open the MSport app, paste the code into the code entry field and load the slip.',
    marketNote: 'MSport code creation is not limited to 1X2 — any selection MSport still offers can be re-encoded.'
  },
  betway: {
    name: 'Betway',
    codeType: 'Book-A-Bet code',
    findSteps: [
      'Open Betway and go to the Book A Bet section.',
      'Create or open the Book-A-Bet slip and copy the booking code it shows.'
    ],
    redeemHint: 'In Betway, open Book A Bet, paste the code and load the slip.',
    marketNote: 'Betway code creation is not limited to 1X2 — any selection Betway still offers can be re-encoded.'
  },
  bet9ja: {
    name: 'Bet9ja',
    codeType: 'Book-A-Bet code',
    findSteps: [
      'Copy the Book-A-Bet code from your Bet9ja coupon, email or SMS.',
      'It is the long alphanumeric string shown alongside the slip on the coupon.'
    ],
    redeemHint: 'Open coupon.bet9ja.com or the Bet9ja app, enter the code in the Book-A-Bet coupon and load it.',
    marketNote: 'Bet9ja code creation currently supports 1X2 selections only. SportyBet, MSport and Betway conversions are unaffected.'
  }
};

// FAQ answers must mention the target bookmaker so no answer survives being
// copied onto a sibling page unchanged.
const FACTUAL_TOKENS = ['1X2', '30', 'valid', 'odds', 'markets', 'selections', 'Book-A-Bet', 'share code'];

const PAIRS = [
  {
    from: 'sportybet',
    to: 'msport',
    blurb: 'Move a SportyBet slip to MSport in seconds — both run on the same code format, so the conversion is the smoothest on the site.',
    intro:
      'SportyBet and MSport both run on the same share-code betting platform, which makes SportyBet to MSport the cleanest conversion this tool offers. If you built a slip on SportyBet but want to play it on MSport — for its prices on African leagues or to use an MSport bonus — paste your SportyBet share code here and get a fresh MSport code in seconds. Every selection, market and odds line carries over unchanged, with no sign-in and no fee.',
    howTo: [
      { title: 'Copy your SportyBet share code', body: 'Open the slip in the SportyBet app, tap Share, and copy the share code it displays.' },
      { title: 'Paste it here', body: 'Paste the code into the converter and confirm the From bookmaker is set to SportyBet.' },
      { title: 'Choose MSport and convert', body: 'Set the To bookmaker to MSport and tap Convert Code. The slip is decoded and re-encoded.' },
      { title: 'Load it on MSport', body: 'Copy the new MSport code, open the MSport app, paste it into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Is converting a SportyBet code to MSport free?', a: 'Yes. Converting a SportyBet code to MSport is completely free on WinFulltime — there is no charge for decoding, previewing or generating the new MSport code.' },
      { q: 'Do all markets convert from SportyBet to MSport?', a: 'Yes. SportyBet and MSport share the same code format, so 1X2, goals and other markets convert cleanly as long as the selection is still available on MSport.' },
      { q: 'How many legs can a SportyBet to MSport slip have?', a: 'Codes with up to 30 selections are supported. A SportyBet slip with more than 30 legs is rejected by the MSport converter with a clear message.' },
      { q: 'How long is the converted MSport code valid?', a: 'The converted MSport code stays valid until the first match on the slip kicks off, so play it before the earliest kick-off.' },
      { q: 'Will the odds stay the same on MSport?', a: 'The selections and odds carry over exactly. If MSport prices a selection differently, the new MSport code reflects MSport\'s current price for that market.' }
    ]
  },
  {
    from: 'msport',
    to: 'sportybet',
    blurb: 'Turn an MSport share code into a fresh SportyBet code with the identical selections and odds — no manual slip rebuilding.',
    intro:
      'If you received an MSport share code but you play on SportyBet — one of the largest betting apps in Nigeria — you do not need to rebuild the slip by hand. Paste the MSport code below and get a fresh SportyBet code with the identical selections and odds. Because the two platforms share the same code format, this is the fastest way to move a winning slip between them.',
    howTo: [
      { title: 'Copy your MSport share code', body: 'Open the slip in the MSport app, tap Share, and copy the share code it displays.' },
      { title: 'Paste it here', body: 'Paste the code into the converter and confirm the From bookmaker is set to MSport.' },
      { title: 'Choose SportyBet and convert', body: 'Set the To bookmaker to SportyBet and tap Convert Code.' },
      { title: 'Load it on SportyBet', body: 'Copy the generated code, open SportyBet, paste it into the code entry screen and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Why would I convert an MSport code to SportyBet?', a: 'SportyBet has one of the largest active betting communities in Nigeria, so converting an MSport code to SportyBet makes it easy to share a slip with friends who only use SportyBet.' },
      { q: 'Does conversion change the selections?', a: 'No. The exact selections, markets and odds from your MSport code are preserved in the new SportyBet code as long as each market is still available on SportyBet.' },
      { q: 'What is the maximum number of legs?', a: 'Up to 30 legs are supported for MSport to SportyBet conversion. Larger codes are rejected to keep the slip playable.' },
      { q: 'Is converting to SportyBet free?', a: 'Yes. Generating the SportyBet code is free — you only pay a stake if you place the bet on SportyBet.' },
      { q: 'How fast does the converter work?', a: 'Decoding and conversion usually complete in a few seconds because SportyBet and MSport use the same code format.' }
    ]
  },
  {
    from: 'sportybet',
    to: 'bet9ja',
    blurb: 'Re-issue a SportyBet slip as a Bet9ja Book-A-Bet code anyone with a Bet9ja account can open.',
    intro:
      'Bet9ja is the most widely used betting site in Nigeria, so a SportyBet to Bet9ja code converter is one of the most requested tools we have. It takes a SportyBet slip and re-issues it as a Bet9ja Book-A-Bet code that anyone with a Bet9ja account can open and stake. Note that Bet9ja code creation currently supports 1X2 (home, draw, away) selections.',
    howTo: [
      { title: 'Copy your SportyBet share code', body: 'Open the slip in the SportyBet app, tap Share, and copy the share code.' },
      { title: 'Paste it here', body: 'Paste the code with the From bookmaker set to SportyBet.' },
      { title: 'Choose Bet9ja and convert', body: 'Set the To bookmaker to Bet9ja and tap Convert Code.' },
      { title: 'Load it on Bet9ja', body: 'Open coupon.bet9ja.com or the Bet9ja app, enter the new Book-A-Bet code and load the slip.' }
    ],
    faq: [
      { q: 'Does the SportyBet to Bet9ja converter support all markets?', a: 'Not yet. Bet9ja codes can currently only be created from 1X2 selections. If a SportyBet leg uses another market, the conversion is blocked until we extend Bet9ja support.' },
      { q: 'Where do I enter the new code on Bet9ja?', a: 'Open the Bet9ja Book-A-Bet coupon on coupon.bet9ja.com or in the Bet9ja app and type the generated code. The slip loads with its selections ready to stake.' },
      { q: 'How many legs can a SportyBet to Bet9ja conversion carry?', a: 'Up to 30 selections, matching the Bet9ja coupon limit.' },
      { q: 'How long does the Bet9ja code remain valid?', a: 'The Bet9ja code is valid until the first match in the slip kicks off, so place it before the earliest kick-off.' },
      { q: 'Is the SportyBet to Bet9ja conversion free?', a: 'Yes. Generating the Bet9ja Book-A-Bet code is free; you only stake when you place the bet on Bet9ja.' }
    ]
  },
  {
    from: 'bet9ja',
    to: 'sportybet',
    blurb: 'Turn a Bet9ja Book-A-Bet code into a SportyBet share code with the same 1X2 selections.',
    intro:
      'Got a Bet9ja Book-A-Bet code but want to play the slip on SportyBet? Paste the Bet9ja code below and we rebuild it as a SportyBet share code with the same 1X2 selections. This is handy when a friend shares a Bet9ja slip and you do not use Bet9ja — you get a playable SportyBet code without retyping each leg.',
    howTo: [
      { title: 'Copy your Bet9ja Book-A-Bet code', body: 'Copy the Book-A-Bet code from the Bet9ja coupon, email or SMS that delivered it.' },
      { title: 'Paste it here', body: 'Paste the code with the From bookmaker set to Bet9ja.' },
      { title: 'Choose SportyBet and convert', body: 'Set the To bookmaker to SportyBet and tap Convert Code.' },
      { title: 'Load it on SportyBet', body: 'Open SportyBet, paste the code into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Can every Bet9ja code be converted to SportyBet?', a: 'Codes built from 1X2 selections convert cleanly to SportyBet. Bet9ja slips using other market types cannot be re-issued to SportyBet yet.' },
      { q: 'Do I need a Bet9ja account to use the converter?', a: 'No — you only need the Bet9ja Book-A-Bet code. Paste it and get a SportyBet share code without logging in.' },
      { q: 'What happens to the odds on the new SportyBet code?', a: 'The selections carry over at SportyBet\'s current prices, so the total odds on the new SportyBet code may differ slightly from the Bet9ja original.' },
      { q: 'How many legs can a Bet9ja slip have when converted?', a: 'Up to 30 legs are supported for Bet9ja to SportyBet conversion.' }
    ]
  },
  {
    from: 'sportybet',
    to: 'betway',
    blurb: 'Convert a SportyBet code into a fresh Betway Book-A-Bet code for Betway users.',
    intro:
      'Betway Book-A-Bet codes work across the Betway app and its retail shops, so converting a SportyBet code to Betway is useful when you want to play a slip on Betway or share it with a Betway user. Paste your SportyBet share code and get a fresh Betway booking code with the same selections, with no sign-in required.',
    howTo: [
      { title: 'Copy your SportyBet share code', body: 'Open the slip in the SportyBet app, tap Share, and copy the share code.' },
      { title: 'Paste it here', body: 'Paste the code with the From bookmaker set to SportyBet.' },
      { title: 'Choose Betway and convert', body: 'Set the To bookmaker to Betway and tap Convert Code.' },
      { title: 'Load it on Betway', body: 'Open Betway, go to Book A Bet and enter the generated code to load the slip.' }
    ],
    faq: [
      { q: 'Does SportyBet to Betway conversion support every market?', a: 'Yes. Betway code creation is not limited to 1X2, so most SportyBet markets convert as long as Betway offers the same selection.' },
      { q: 'Where do I load the new Betway code?', a: 'In Betway\'s Book A Bet section on the app or website — paste the code and the slip loads ready to stake.' },
      { q: 'How many legs are allowed on a SportyBet to Betway code?', a: 'The site-wide maximum of 30 legs applies to SportyBet to Betway conversions.' },
      { q: 'Is converting to Betway free?', a: 'Yes, generating the Betway booking code is free. You only stake if you place the bet on Betway.' }
    ]
  },
  {
    from: 'betway',
    to: 'sportybet',
    blurb: 'Re-issue a Betway Book-A-Bet code as a SportyBet share code you can load in seconds.',
    intro:
      'Someone sent you a Betway Book-A-Bet code but you play on SportyBet? Paste it below and we convert it into a SportyBet share code you can load in seconds. No manual rebuilding of the slip — the selections are matched and re-encoded automatically.',
    howTo: [
      { title: 'Copy your Betway Book-A-Bet code', body: 'Copy the booking code from your Betway Book A Bet slip.' },
      { title: 'Paste it here', body: 'Paste the code with the From bookmaker set to Betway.' },
      { title: 'Choose SportyBet and convert', body: 'Set the To bookmaker to SportyBet and tap Convert Code.' },
      { title: 'Load it on SportyBet', body: 'Open SportyBet and enter the new code in the code field to load the slip.' }
    ],
    faq: [
      { q: 'Do all Betway Book-A-Bet codes convert to SportyBet?', a: 'Selections that SportyBet also offers convert cleanly. Markets unavailable on SportyBet are flagged during conversion.' },
      { q: 'Will the slip odds change on SportyBet?', a: 'The selections are re-priced at SportyBet\'s current odds, so the combined odds can differ from the Betway original.' },
      { q: 'How many legs can I convert from Betway to SportyBet?', a: 'Up to 30 legs, matching the platform limit for Betway to SportyBet conversion.' }
    ]
  },
  {
    from: 'msport',
    to: 'bet9ja',
    blurb: 'Rebuild your MSport share code as a Bet9ja Book-A-Bet code (1X2 selections).',
    intro:
      'MSport users frequently want to move a slip to Bet9ja because Bet9ja has the largest user base in Nigeria for sharing and playing coupons. This MSport to Bet9ja converter rebuilds your MSport share code as a Bet9ja Book-A-Bet code. Bet9ja code creation currently supports 1X2 selections, so check the slip before converting.',
    howTo: [
      { title: 'Copy your MSport share code', body: 'Open the slip in the MSport app, tap Share, and copy the share code.' },
      { title: 'Paste it here', body: 'Paste the code with the From bookmaker set to MSport.' },
      { title: 'Choose Bet9ja and convert', body: 'Set the To bookmaker to Bet9ja and tap Convert Code.' },
      { title: 'Load it on Bet9ja', body: 'Open coupon.bet9ja.com or the Bet9ja app and enter the code in the Book-A-Bet coupon.' }
    ],
    faq: [
      { q: 'Which markets convert from MSport to Bet9ja?', a: 'Only 1X2 selections are supported for Bet9ja codes at the moment. MSport slips with other markets cannot be converted to Bet9ja yet.' },
      { q: 'Where do I enter the new Bet9ja code?', a: 'Use the Bet9ja Book-A-Bet coupon on coupon.bet9ja.com or in the Bet9ja app.' },
      { q: 'How long is the generated Bet9ja code valid?', a: 'The Bet9ja code is valid until the first match on the slip kicks off.' },
      { q: 'How many legs are supported on MSport to Bet9ja codes?', a: 'Up to 30 legs, matching the Bet9ja coupon limit for MSport to Bet9ja conversion.' }
    ]
  },
  {
    from: 'bet9ja',
    to: 'msport',
    blurb: 'Play a Bet9ja Book-A-Bet slip on MSport without adding each leg by hand.',
    intro:
      'Convert a Bet9ja Book-A-Bet code into an MSport share code with the same 1X2 selections, so you can play a Bet9ja slip on MSport without re-adding each leg by hand. Just paste the Bet9ja code and the MSport code comes back ready to load.',
    howTo: [
      { title: 'Copy your Bet9ja Book-A-Bet code', body: 'Copy the Book-A-Bet code from your Bet9ja coupon, email or SMS.' },
      { title: 'Paste it here', body: 'Paste the code with the From bookmaker set to Bet9ja.' },
      { title: 'Choose MSport and convert', body: 'Set the To bookmaker to MSport and tap Convert Code.' },
      { title: 'Load it on MSport', body: 'Open MSport, paste the code into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Which Bet9ja codes can be converted to MSport?', a: 'Bet9ja slips built from 1X2 selections convert cleanly to MSport. Other market types are not yet supported.' },
      { q: 'Do I need a Bet9ja account to convert a code?', a: 'No — just the Bet9ja Book-A-Bet code. You do not need to log in to generate the MSport code.' },
      { q: 'Will the odds match the original MSport code?', a: 'Selections are re-priced at MSport\'s current odds, so the total can differ slightly from the Bet9ja original.' },
      { q: 'How many legs can I convert from Bet9ja to MSport?', a: 'Up to 30 legs are supported for Bet9ja to MSport conversion.' }
    ]
  },
  {
    from: 'msport',
    to: 'betway',
    blurb: 'Move an MSport share code to Betway\'s Book-A-Bet system.',
    intro:
      'Move an MSport share code to Betway\'s Book-A-Bet system. This is useful when you want to place the slip on Betway or hand it to someone who only uses Betway. The selections are matched and a fresh Betway booking code is generated automatically.',
    howTo: [
      { title: 'Copy your MSport share code', body: 'Open the slip in the MSport app, tap Share, and copy the share code.' },
      { title: 'Paste it here', body: 'Paste the code with the From bookmaker set to MSport.' },
      { title: 'Choose Betway and convert', body: 'Set the To bookmaker to Betway and tap Convert Code.' },
      { title: 'Load it on Betway', body: 'Open Betway, go to Book A Bet and enter the generated code.' }
    ],
    faq: [
      { q: 'Do all markets convert from MSport to Betway?', a: 'Yes. Betway code creation is not limited to 1X2, so any selection Betway still offers converts.' },
      { q: 'Where do I load the converted Betway code?', a: 'In the Betway Book A Bet section on the app or website — paste the code and the slip loads ready to stake.' },
      { q: 'What is the leg limit for MSport to Betway?', a: 'The site-wide maximum of 30 legs applies to MSport to Betway conversions.' },
      { q: 'Is the MSport to Betway conversion free?', a: 'Yes, generating the Betway booking code is free.' }
    ]
  },
  {
    from: 'betway',
    to: 'msport',
    blurb: 'Turn a Betway Book-A-Bet code into an MSport share code.',
    intro:
      'Turn a Betway Book-A-Bet code into an MSport share code. This is for MSport users who receive Betway slips from friends, or who want to take advantage of Betway promos and play the slip on their own MSport account.',
    howTo: [
      { title: 'Copy your Betway Book-A-Bet code', body: 'Copy the booking code from your Betway Book A Bet slip.' },
      { title: 'Paste it here', body: 'Paste the code with the From bookmaker set to Betway.' },
      { title: 'Choose MSport and convert', body: 'Set the To bookmaker to MSport and tap Convert Code.' },
      { title: 'Load it on MSport', body: 'Open MSport and paste the code into the code field to load the slip.' }
    ],
    faq: [
      { q: 'Do all Betway Book-A-Bet codes convert to MSport?', a: 'Selections that MSport also offers convert cleanly. Markets unavailable on MSport are flagged during conversion.' },
      { q: 'Will the odds change on the MSport code?', a: 'The selections are re-priced at MSport\'s current odds, so the combined total can differ from the Betway original.' },
      { q: 'How many legs can I convert from Betway to MSport?', a: 'Up to 30 legs, matching the platform limit for Betway to MSport conversion.' }
    ]
  },
  {
    from: 'bet9ja',
    to: 'betway',
    blurb: 'Convert a Bet9ja Book-A-Bet code into a Betway booking code.',
    intro:
      'Convert a Bet9ja Book-A-Bet code into a Betway booking code. Betway code creation supports more than 1X2, and the Bet9ja source slip is converted selection-by-selection wherever Betway offers the same market, so the result is a fresh Betway code you can stake or share.',
    howTo: [
      { title: 'Copy your Bet9ja Book-A-Bet code', body: 'Copy the Book-A-Bet code from your Bet9ja coupon, email or SMS.' },
      { title: 'Paste it here', body: 'Paste the code with the From bookmaker set to Bet9ja.' },
      { title: 'Choose Betway and convert', body: 'Set the To bookmaker to Betway and tap Convert Code.' },
      { title: 'Load it on Betway', body: 'Open Betway Book A Bet and enter the new code to load the slip.' }
    ],
    faq: [
      { q: 'Which Bet9ja codes can be converted to Betway?', a: 'Bet9ja slips convert selection-by-selection wherever Betway offers the same market. Selections Betway no longer prices are skipped and reported.' },
      { q: 'Where do I redeem the new Betway code?', a: 'In Betway\'s Book A Bet section on the app or website — paste the code and the slip loads ready to stake.' },
      { q: 'How many legs can a Bet9ja to Betway code have?', a: 'Up to 30 legs are supported for Bet9ja to Betway conversion.' },
      { q: 'Is the Bet9ja to Betway conversion free?', a: 'Yes, generating the Betway booking code is free.' }
    ]
  },
  {
    from: 'betway',
    to: 'bet9ja',
    blurb: 'Re-issue a Betway booking code as a Bet9ja Book-A-Bet code (1X2 selections).',
    intro:
      'Convert a Betway booking code to a Bet9ja Book-A-Bet code so Bet9ja users can play your slip. Bet9ja code creation currently supports 1X2 selections, so the converted code is built from the 1X2 legs of your Betway slip and can be loaded straight into the Bet9ja coupon.',
    howTo: [
      { title: 'Copy your Betway Book-A-Bet code', body: 'Copy the booking code from your Betway Book A Bet slip.' },
      { title: 'Paste it here', body: 'Paste the code with the From bookmaker set to Betway.' },
      { title: 'Choose Bet9ja and convert', body: 'Set the To bookmaker to Bet9ja and tap Convert Code.' },
      { title: 'Load it on Bet9ja', body: 'Open coupon.bet9ja.com or the Bet9ja app and enter the code in the Book-A-Bet coupon.' }
    ],
    faq: [
      { q: 'Does the Betway to Bet9ja converter support all markets?', a: 'No — Bet9ja codes can currently only be created from 1X2 selections. Non-1X2 legs from the Betway slip are reported so you can remove them and retry.' },
      { q: 'Where do I load the converted Bet9ja code?', a: 'In the Bet9ja Book-A-Bet coupon on coupon.bet9ja.com or in the Bet9ja app.' },
      { q: 'How long does a Betway to Bet9ja code last?', a: 'The Bet9ja code is valid until the first match in the slip kicks off.' },
      { q: 'How many legs can I convert from Betway to Bet9ja?', a: 'Up to 30 legs, matching the Bet9ja coupon limit for Betway to Bet9ja conversion.' }
    ]
  }
];

const HUB = {
  intro:
    'Pick a conversion below or open the full tool. Paste a SportyBet, MSport, Bet9ja or Betway code, preview every selection and odds, then get a fresh playable code for the bookmaker you use. Free, no sign-in, up to 30 selections.',
  faq: [
    { q: 'Is converting booking codes free?', a: 'Yes. WinFulltime never charges for decoding, previewing or generating a booking code. You only stake money if you place the converted bet on your bookmaker.' },
    { q: 'Which bookmakers can I convert between?', a: 'SportyBet, MSport, Betway and Bet9ja codes can be decoded, and 1X2 selections can be converted between any two of them. Codes are validated by the target bookmaker before they are returned.' },
    { q: 'Why is Bet9ja conversion limited?', a: 'Bet9ja code creation currently supports 1X2 selections only, and Bet9ja conversion is experiencing issues at the moment. Our technical team is working on it. SportyBet, MSport and Betway conversions are unaffected.' },
    { q: 'How many selections can a code have?', a: 'The maximum is 30 selections per code. Codes above that limit are rejected with a clear message.' },
    { q: 'How long does a converted code stay valid?', a: 'A converted code is valid until the first match on the slip kicks off, so load and stake it before the earliest kick-off.' }
  ]
};

function slugFor(from, to) {
  return from + '-to-' + to;
}

function pairKey(pair) {
  return pair.from + '-' + pair.to;
}

function validateContent() {
  const errors = [];

  const known = Object.keys(BOOKMAKERS);
  const qSeen = new Set();
  const introSeen = new Set();

  for (const pair of PAIRS) {
    const key = pairKey(pair);
    if (!known.includes(pair.from) || !known.includes(pair.to)) {
      errors.push(key + ': from/to must be one of ' + known.join(', '));
      continue;
    }
    if (pair.from === pair.to) {
      errors.push(key + ': from and to must differ');
      continue;
    }

    const target = BOOKMAKERS[pair.to].name;
    const source = BOOKMAKERS[pair.from].name;

    if (!pair.intro || pair.intro.trim().length < 80) {
      errors.push(key + ': intro missing or too short (min 80 chars)');
    }
    const introNorm = pair.intro.trim().toLowerCase();
    if (introSeen.has(introNorm)) errors.push(key + ': intro duplicates another pair (doorway risk)');
    introSeen.add(introNorm);

    if (!pair.blurb || pair.blurb.trim().length < 40) {
      errors.push(key + ': blurb missing or too short (min 40 chars)');
    }

    if (!Array.isArray(pair.howTo) || pair.howTo.length < 3) {
      errors.push(key + ': howTo needs at least 3 steps');
    } else {
      pair.howTo.forEach((s, i) => {
        if (!s.title || !s.body || s.body.trim().length < 30) {
          errors.push(key + ': howTo step ' + (i + 1) + ' missing title/body or too short');
        } else if (!s.body.toLowerCase().includes(source.toLowerCase()) && !s.body.toLowerCase().includes(target.toLowerCase())) {
          errors.push(key + ': howTo step ' + (i + 1) + ' must reference the source or target bookmaker');
        }
      });
    }

    if (!Array.isArray(pair.faq) || pair.faq.length < 3) {
      errors.push(key + ': faq needs at least 3 items');
    } else {
      let hasFactualToken = false;
      pair.faq.forEach((f, i) => {
        if (!f.q || !f.a || f.a.trim().length < 30) {
          errors.push(key + ': faq ' + (i + 1) + ' missing question/answer or too short');
          return;
        }
        const qNorm = f.q.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
        if (qSeen.has(qNorm)) {
          errors.push(key + ': faq question "' + f.q + '" duplicates another pair (doorway risk)');
        }
        qSeen.add(qNorm);
        if (!f.a.toLowerCase().includes(target.toLowerCase())) {
          errors.push(key + ': faq answer ' + (i + 1) + ' must mention the target bookmaker ' + target);
        }
        if (FACTUAL_TOKENS.some(t => f.a.toLowerCase().includes(t.toLowerCase()))) {
          hasFactualToken = true;
        }
      });
      if (!hasFactualToken) {
        errors.push(key + ': at least one faq answer must contain a factual token (' + FACTUAL_TOKENS.join(', ') + ')');
      }
    }
  }

  if (errors.length > 0) {
    throw new Error('Converter content validation failed (doorway/thin-content guard):\n  - ' + errors.join('\n  - '));
  }
  return true;
}

module.exports = {
  BOOKMAKERS,
  PAIRS,
  HUB,
  FACTUAL_TOKENS,
  slugFor,
  pairKey,
  validateContent
};
