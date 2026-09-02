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
  },
  bangbet: {
    name: 'Bangbet',
    codeType: 'booking code',
    findSteps: [
      'Open the Bangbet app and open the booking you want to convert from your saved bookies.',
      'Tap the share option on the booking and copy the short code it displays.'
    ],
    redeemHint: 'Open the Bangbet app or site, paste the code into the code entry field and load the slip.',
    marketNote: 'Bangbet runs on the same Sportradar platform as SportyBet and MSport, so code creation works from 1X2 selections with their current odds.'
  },
  betpawa: {
    name: 'betPawa',
    codeType: 'booking code',
    findSteps: [
      'Open the betPawa app and open the slip you want to convert from your betslip history.',
      'Copy the booking code shown for that betslip.'
    ],
    redeemHint: 'In the betPawa app, tap Load Code, paste the code and the slip loads ready to stake before kick-off.',
    marketNote: 'betPawa codes are minted live from the match-result (1X2) market on the event feed, so a new code is built from selections that are still on the board.'
  },
  betking: {
    name: 'BetKing',
    codeType: 'book bet code',
    findSteps: [
      'Open your slip on BetKing and choose to book the bet, which gives the slip a bet code.',
      'Copy the book bet code BetKing shows for that slip (it opens at the /book-bet/ share link).'
    ],
    redeemHint: 'BetKing codes currently decode and convert out only — creating a fresh BetKing code needs a signed-in Code Zone session and is not supported yet.',
    marketNote: 'BetKing is decode-only: no new BetKing code creation yet, but most BetKing book bet codes convert cleanly to other supported bookmakers.'
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
  },
  {
    from: 'sportybet',
    to: 'bangbet',
    blurb: 'Re-issue a SportyBet share code as a fresh Bangbet booking code that loads straight in the Bangbet app.',
    intro:
      'Bangbet runs on the same Sportradar betting platform as SportyBet, so moving a slip between the two is very clean. If you built a slip on SportyBet but want to play it on Bangbet — for its mass bundles or local-language deals — paste your SportyBet share code here and get a fresh Bangbet booking code in seconds. The selections carry over at their current odds, with no sign-in and no fee.',
    howTo: [
      { title: 'Copy your SportyBet share code', body: 'Open the slip in the SportyBet app, tap Share, and copy the share code it displays.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to SportyBet.' },
      { title: 'Choose Bangbet and convert', body: 'Set the To bookmaker to Bangbet and tap Convert Code to re-encode the slip.' },
      { title: 'Load it on Bangbet', body: 'Open the Bangbet app, paste the new Bangbet code into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Will my SportyBet slip convert cleanly to Bangbet?', a: 'Yes in most cases. Because SportyBet and Bangbet share the Sportradar platform, 1X2 selections convert cleanly to a fresh Bangbet code whenever the match is still on the board.' },
      { q: 'Does Bangbet code creation support all markets?', a: 'A Bangbet code is built from 1X2 selections with their current odds, matching how SportyBet selections are re-encoded on the shared platform.' },
      { q: 'How many legs can a SportyBet to Bangbet slip have?', a: 'Up to 30 selections are supported for a SportyBet to Bangbet conversion.' },
      { q: 'How long does the converted Bangbet code stay valid?', a: 'The Bangbet code is valid until the first match on the slip kicks off, so load and stake it before the earliest kick-off.' },
      { q: 'Is the SportyBet to Bangbet conversion free?', a: 'Yes. Generating the Bangbet booking code is free — you only stake if you place the bet on Bangbet.' }
    ]
  },
  {
    from: 'msport',
    to: 'bangbet',
    blurb: 'Turn an MSport share code into a Bangbet booking code built from the same selection odds.',
    intro:
      'MSport and Bangbet both sit on the Sportradar platform, and the conversion between them gives you a fresh Bangbet code with the identical selection odds. If you hold an MSport share code but play on Bangbet — or want to pass a slip to a friend who uses it — paste the code below and get a Bangbet booking code ready to load, without rebuilding the slip leg by leg.',
    howTo: [
      { title: 'Copy your MSport share code', body: 'Open the slip in the MSport app, tap Share, and copy the share code it displays.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to MSport.' },
      { title: 'Choose Bangbet and convert', body: 'Set the To bookmaker to Bangbet and tap Convert Code.' },
      { title: 'Load it on Bangbet', body: 'Open the Bangbet app, paste the generated code into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Does the converted Bangbet code keep my odds?', a: 'Yes. The MSport selections are re-encoded for Bangbet with their current odds, so the combined total is the same whenever Bangbet prices the market identically.' },
      { q: 'Which MSport selections can convert to Bangbet?', a: 'MSport 1X2 selections convert cleanly because Bangbet reads the same Sportradar event and outcome ids used by MSport.' },
      { q: 'How many legs can I move from MSport to Bangbet?', a: 'Up to 30 legs are supported for an MSport to Bangbet conversion.' },
      { q: 'Is generating the Bangbet code free?', a: 'Yes, creating the Bangbet booking code is free; you only stake when you place the bet on Bangbet.' }
    ]
  },
  {
    from: 'betway',
    to: 'bangbet',
    blurb: 'Convert a Betway Book-A-Bet code into a Bangbet booking code for Bangbet users.',
    intro:
      'Got a Betway Book-A-Bet slip but want to play it on Bangbet, or pass it to someone who only uses Bangbet? This converter reads the Betway selections, matches them to the Sportradar events Bangbet uses, and returns a fresh Bangbet booking code you can load in seconds. No manual re-entry of each leg and no sign-in required.',
    howTo: [
      { title: 'Copy your Betway Book-A-Bet code', body: 'Copy the booking code from your Betway Book A Bet slip.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to Betway.' },
      { title: 'Choose Bangbet and convert', body: 'Set the To bookmaker to Bangbet and tap Convert Code.' },
      { title: 'Load it on Bangbet', body: 'Open Bangbet, paste the generated code into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Do all Betway Book-A-Bet codes convert to Bangbet?', a: 'Selections that Bangbet also offers on the same match convert cleanly. Markets unavailable on Bangbet are reported so you can drop them and retry the conversion.' },
      { q: 'Will the combined odds change on the Bangbet code?', a: 'Selections are re-priced at Bangbet\'s current odds, so the total can differ slightly from your Betway original.' },
      { q: 'How many legs can a Betway to Bangbet conversion carry?', a: 'Up to 30 legs, matching the platform limit for a Betway to Bangbet conversion.' },
      { q: 'Is converting a Betway code to Bangbet free?', a: 'Yes, building the Bangbet booking code costs nothing; stake only if you place the bet on Bangbet.' }
    ]
  },
  {
    from: 'bet9ja',
    to: 'bangbet',
    blurb: 'Rebuild a Bet9ja Book-A-Bet code as a fresh Bangbet booking code.',
    intro:
      'A Bet9ja Book-A-Bet slip can be rebuilt as a fresh Bangbet booking code when you want to play the same selections on Bangbet. Paste the Bet9ja code below and the converter matches each 1X2 selection to its Bangbet event and re-encodes it with current odds. It is a quick way to move a coupon shared by a Bet9ja friend onto your own Bangbet account.',
    howTo: [
      { title: 'Copy your Bet9ja Book-A-Bet code', body: 'Copy the Book-A-Bet code from your Bet9ja coupon, email or SMS.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to Bet9ja.' },
      { title: 'Choose Bangbet and convert', body: 'Set the To bookmaker to Bangbet and tap Convert Code.' },
      { title: 'Load it on Bangbet', body: 'Open Bangbet, paste the new code into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Do I need a Bet9ja account to convert to Bangbet?', a: 'No — you only need the Bet9ja Book-A-Bet code to generate a fresh Bangbet booking code without logging in.' },
      { q: 'Which Bet9ja selections convert to Bangbet?', a: 'Bet9ja slips built from 1X2 selections convert cleanly, because Bangbet encodes the same match result selections on its Sportradar platform.' },
      { q: 'How long is the generated Bangbet code valid?', a: 'The Bangbet code is valid until the first match on the slip kicks off, so stake it before the earliest kick-off.' },
      { q: 'How many legs are supported on a Bet9ja to Bangbet code?', a: 'Up to 30 legs, matching the coupon limit for a Bet9ja to Bangbet conversion.' }
    ]
  },
  {
    from: 'bangbet',
    to: 'sportybet',
    blurb: 'Turn a Bangbet booking code into a SportyBet share code you can load in seconds.',
    intro:
      'Bangbet and SportyBet share the same Sportradar code style, so converting a Bangbet booking code to SportyBet is one of the smoothest jumps this tool offers. If you hold a Bangbet code but play on SportyBet — the most widely used betting app in Nigeria — paste it below and get a SportyBet share code with the same selections and odds, no manual slip rebuilding required.',
    howTo: [
      { title: 'Copy your Bangbet booking code', body: 'Open the Bangbet booking you want to move and copy the short code it displays.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to Bangbet.' },
      { title: 'Choose SportyBet and convert', body: 'Set the To bookmaker to SportyBet and tap Convert Code.' },
      { title: 'Load it on SportyBet', body: 'Open SportyBet, paste the generated code into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Why convert a Bangbet code to SportyBet?', a: 'SportyBet has one of the largest betting communities in Nigeria, so converting a Bangbet code to SportyBet makes it easy to stake the slip yourself or share it with friends on SportyBet.' },
      { q: 'Does the conversion preserve my selections?', a: 'Yes. The exact Bangbet selections and odds are re-encoded into a SportyBet share code as long as each match is still available on SportyBet.' },
      { q: 'How many legs can a Bangbet to SportyBet slip have?', a: 'Up to 30 legs are supported for a Bangbet to SportyBet conversion.' },
      { q: 'Is converting a Bangbet code to SportyBet free?', a: 'Yes, generating the SportyBet share code is free; you only stake if you place the bet on SportyBet.' }
    ]
  },
  {
    from: 'bangbet',
    to: 'msport',
    blurb: 'Re-encode a Bangbet booking code as an MSport share code with the same selection odds.',
    intro:
      'Bangbet and MSport both use the Sportradar share-code style, which makes Bangbet to MSport a direct conversion. Paste a Bangbet booking code and get an MSport share code carrying the identical selections and odds — handy for MSport users who receive a Bangbet slip, or who prefer an MSport bonus and want to play the same selections there.',
    howTo: [
      { title: 'Copy your Bangbet booking code', body: 'Open the Bangbet booking you want to move and copy the short code it displays.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to Bangbet.' },
      { title: 'Choose MSport and convert', body: 'Set the To bookmaker to MSport and tap Convert Code.' },
      { title: 'Load it on MSport', body: 'Open MSport, paste the generated code into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Is every Bangbet code convertible to MSport?', a: 'Selections still offered on the same match by MSport convert cleanly, because both platforms use identical Sportradar event and outcome ids.' },
      { q: 'Do the odds survive the jump to MSport?', a: 'The Bangbet selections are re-encoded for MSport at their current odds, so the total is the same wherever MSport prices identically.' },
      { q: 'How many legs can a Bangbet to MSport conversion hold?', a: 'Up to 30 legs are supported for a Bangbet to MSport conversion.' },
      { q: 'Does converting to MSport cost anything?', a: 'No, building the MSport share code is free; you stake only if you place the bet on MSport.' }
    ]
  },
  {
    from: 'bangbet',
    to: 'betway',
    blurb: 'Convert a Bangbet booking code into a fresh Betway Book-A-Bet code.',
    intro:
      'Move a Bangbet booking code onto Betway\'s Book-A-Bet system. This is useful when you receive a Bangbet slip but play on Betway, or you want to hand it to someone who only uses Betway. The converter reads the Bangbet selections, matches each to the Betway market, and returns a fresh Betway booking code you can load in the Book A Bet section straight away.',
    howTo: [
      { title: 'Copy your Bangbet booking code', body: 'Open the Bangbet booking you want to move and copy the short code it displays.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to Bangbet.' },
      { title: 'Choose Betway and convert', body: 'Set the To bookmaker to Betway and tap Convert Code.' },
      { title: 'Load it on Betway', body: 'Open Betway, go to Book A Bet and enter the generated code to load the slip.' }
    ],
    faq: [
      { q: 'Can every Bangbet selection become a Betway code?', a: 'Selections that Betway offers on the same match convert cleanly. Markets Betway no longer prices are flagged so you can drop them and retry.' },
      { q: 'Will the Betway slip odds match Bangbet?', a: 'Selections are re-priced at Betway\'s current odds, so the combined total can differ slightly from the Bangbet original.' },
      { q: 'How many legs can a Bangbet to Betway code have?', a: 'Up to 30 legs, matching the platform limit for a Bangbet to Betway conversion.' },
      { q: 'Is the Bangbet to Betway conversion free?', a: 'Yes, generating the Betway booking code is free; you only stake when you place the bet on Betway.' }
    ]
  },
  {
    from: 'bangbet',
    to: 'bet9ja',
    blurb: 'Rebuild a Bangbet booking code as a Bet9ja Book-A-Bet code for Bet9ja users.',
    intro:
      'Bangbet to Bet9ja lets you turn a Bangbet booking code into a Bet9ja Book-A-Bet code so Bet9ja users can play your slip. Bet9ja code creation currently supports 1X2 selections, so the converted code is built from the match-result legs of your Bangbet slip and can be loaded straight into the Bet9ja coupon. If the slip has non-1X2 legs, they are reported so you can drop them.',
    howTo: [
      { title: 'Copy your Bangbet booking code', body: 'Open the Bangbet booking you want to move and copy the short code it displays.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to Bangbet.' },
      { title: 'Choose Bet9ja and convert', body: 'Set the To bookmaker to Bet9ja and tap Convert Code.' },
      { title: 'Load it on Bet9ja', body: 'Open coupon.bet9ja.com or the Bet9ja app and enter the code in the Book-A-Bet coupon.' }
    ],
    faq: [
      { q: 'Which Bangbet selections convert to Bet9ja?', a: 'Only the 1X2 legs of your Bangbet slip convert to a Bet9ja code for now; other markets are skipped and reported so you can remove them.' },
      { q: 'Where do I redeem the new Bet9ja code?', a: 'Enter the generated code in the Bet9ja Book-A-Bet coupon on coupon.bet9ja.com or in the Bet9ja app.' },
      { q: 'How long is the resulting Bet9ja code valid?', a: 'The Bet9ja code is valid until the first match on the slip kicks off, so stake it before the earliest kick-off.' },
      { q: 'How many legs can a Bangbet to Bet9ja code have?', a: 'Up to 30 legs, matching the Bet9ja coupon limit for a Bangbet to Bet9ja conversion.' }
    ]
  },
  {
    from: 'betking',
    to: 'sportybet',
    blurb: 'Decode a BetKing book bet code and re-issue it as a SportyBet share code.',
    intro:
      'BetKing book bet codes open at the /book-bet/ share link, and you can decode one here and re-issue it as a SportyBet share code you can load on your own account. This is handy when a friend shares a BetKing slip but you use SportyBet — you get a fresh SportyBet code with the same selections, matched via the shared Sportradar event id, instead of retyping each leg.',
    howTo: [
      { title: 'Copy your BetKing book bet code', body: 'Open your BetKing slip, book the bet to give it a code, and copy the book bet code it shows.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to BetKing.' },
      { title: 'Choose SportyBet and convert', body: 'Set the To bookmaker to SportyBet and tap Convert Code.' },
      { title: 'Load it on SportyBet', body: 'Open SportyBet, paste the generated code into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Can every BetKing code convert to SportyBet?', a: 'Most can. Each BetKing selection carries the shared Sportradar event id, so it converts to a SportyBet share code whenever SportyBet still offers that match.' },
      { q: 'Why is BetKing decode-only here?', a: 'Creating a fresh BetKing code needs a signed-in BetKing Code Zone session, so a BetKing slip decodes and converts out to SportyBet but a new BetKing code is not issued yet.' },
      { q: 'How many legs can a BetKing to SportyBet slip hold?', a: 'Up to 30 legs are supported for a BetKing to SportyBet conversion.' },
      { q: 'Is BetKing to SportyBet conversion free?', a: 'Yes, generating the SportyBet share code is free; you only stake if you place the bet on SportyBet.' }
    ]
  },
  {
    from: 'betking',
    to: 'msport',
    blurb: 'Turn a BetKing book bet code into an MSport share code for MSport users.',
    intro:
      'If someone shares a BetKing book bet code but you play on MSport, paste it here and get a fresh MSport share code carrying the same selections. BetKing selections resolve to the shared Sportradar event id that MSport also uses, so the re-encoding is reliable. Handy for moving a winning slip onto your own MSport account or sharing it with an MSport-only friend.',
    howTo: [
      { title: 'Copy your BetKing book bet code', body: 'Open your BetKing slip, book the bet to give it a code, and copy the book bet code it shows.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to BetKing.' },
      { title: 'Choose MSport and convert', body: 'Set the To bookmaker to MSport and tap Convert Code.' },
      { title: 'Load it on MSport', body: 'Open MSport, paste the generated code into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Which BetKing selections convert to MSport?', a: 'Selections still offered on the same match by MSport convert, because BetKing and MSport share the same Sportradar event and outcome ids.' },
      { q: 'Do the odds change on the MSport code?', a: 'The BetKing selections are re-encoded for MSport at their current odds, so the total can differ slightly where MSport prices differently.' },
      { q: 'How many legs can a BetKing to MSport code have?', a: 'Up to 30 legs are supported for a BetKing to MSport conversion.' },
      { q: 'Does converting a BetKing code to MSport cost anything?', a: 'No, building the MSport share code is free; you stake only if you place the bet on MSport.' }
    ]
  },
  {
    from: 'betking',
    to: 'betway',
    blurb: 'Convert a BetKing book bet code into a fresh Betway Book-A-Bet code.',
    intro:
      'Move a BetKing book bet code onto Betway\'s Book-A-Bet system. The converter decodes your BetKing selections via the shared Sportradar event id, matches them to the corresponding Betway market, and returns a fresh Betway booking code you can load in the Book A Bet section. No manual slip rebuilding and no sign-in required.',
    howTo: [
      { title: 'Copy your BetKing book bet code', body: 'Open your BetKing slip, book the bet to give it a code, and copy the book bet code it shows.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to BetKing.' },
      { title: 'Choose Betway and convert', body: 'Set the To bookmaker to Betway and tap Convert Code.' },
      { title: 'Load it on Betway', body: 'Open Betway, go to Book A Bet and enter the generated code to load the slip.' }
    ],
    faq: [
      { q: 'Do all BetKing selections become a Betway code?', a: 'Selections that Betway offers on the same match convert cleanly. Markets unavailable on Betway are flagged so you can drop them and retry the conversion.' },
      { q: 'Will the Betway odds match the BetKing original?', a: 'Selections are re-priced at Betway\'s current odds, so the combined total can differ slightly from your BetKing original.' },
      { q: 'How many legs can a BetKing to Betway code hold?', a: 'Up to 30 legs, matching the platform limit for a BetKing to Betway conversion.' },
      { q: 'Is the BetKing to Betway conversion free?', a: 'Yes, generating the Betway booking code is free; you only stake when you place the bet on Betway.' }
    ]
  },
  {
    from: 'betking',
    to: 'bet9ja',
    blurb: 'Re-issue a BetKing book bet code as a Bet9ja Book-A-Bet code (1X2 selections).',
    intro:
      'Turn a BetKing book bet code into a Bet9ja Book-A-Bet code so Bet9ja users can play your slip. BetKing selections resolve to the shared Sportradar event id, and Bet9ja code creation currently supports 1X2 selections, so the converted code is built from the match-result legs of your BetKing slip and loads straight into the Bet9ja coupon. Non-1X2 legs are reported so you can drop them.',
    howTo: [
      { title: 'Copy your BetKing book bet code', body: 'Open your BetKing slip, book the bet to give it a code, and copy the book bet code it shows.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to BetKing.' },
      { title: 'Choose Bet9ja and convert', body: 'Set the To bookmaker to Bet9ja and tap Convert Code.' },
      { title: 'Load it on Bet9ja', body: 'Open coupon.bet9ja.com or the Bet9ja app and enter the code in the Book-A-Bet coupon.' }
    ],
    faq: [
      { q: 'Which BetKing selections convert to a Bet9ja code?', a: 'Only the 1X2 legs of your BetKing slip convert to a Bet9ja code for now; other markets are skipped and reported so you can remove them.' },
      { q: 'Where do I redeem the BetKing to Bet9ja code?', a: 'Enter the generated code in the Bet9ja Book-A-Bet coupon on coupon.bet9ja.com or in the Bet9ja app.' },
      { q: 'How long is the BetKing to Bet9ja code valid?', a: 'The Bet9ja code is valid until the first match on the slip kicks off.' },
      { q: 'How many legs can a BetKing to Bet9ja code have?', a: 'Up to 30 legs, matching the Bet9ja coupon limit for a BetKing to Bet9ja conversion.' }
    ]
  },
  {
    from: 'betking',
    to: 'bangbet',
    blurb: 'Decode a BetKing book bet code and re-issue it as a fresh Bangbet booking code.',
    intro:
      'Convert a BetKing book bet code into a Bangbet booking code. BetKing selections carry the shared Sportradar event id that Bangbet also uses, so the converter can decode your BetKing slip and re-encode it as a fresh Bangbet booking code with current odds. Great for playing a friend\'s BetKing slip on your own Bangbet account without retyping each leg.',
    howTo: [
      { title: 'Copy your BetKing book bet code', body: 'Open your BetKing slip, book the bet to give it a code, and copy the book bet code it shows.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to BetKing.' },
      { title: 'Choose Bangbet and convert', body: 'Set the To bookmaker to Bangbet and tap Convert Code.' },
      { title: 'Load it on Bangbet', body: 'Open the Bangbet app, paste the generated code into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Which BetKing selections convert to Bangbet?', a: 'Selections still offered on the same match by Bangbet convert, because BetKing and Bangbet share the Sportradar event and outcome ids.' },
      { q: 'Will the Bangbet code keep my odds?', a: 'The BetKing selections are re-encoded for Bangbet at their current odds, so the total is the same wherever Bangbet prices identically.' },
      { q: 'How many legs can a BetKing to Bangbet code have?', a: 'Up to 30 legs are supported for a BetKing to Bangbet conversion.' },
      { q: 'Does BetKing to Bangbet cost anything?', a: 'No, building the Bangbet booking code is free; you stake only if you place the bet on Bangbet.' }
    ]
  },
{
    from: 'betpawa',
    to: 'sportybet',
    blurb: 'Turn a betPawa booking code into a SportyBet share code with the same 1X2 selections.',
    intro:
      'betPawa runs its own native booking-code platform, so moving a slip to SportyBet means matching each betPawa match to the shared Sportradar event and re-encoding it. If you built a slip on betPawa but want to play it on SportyBet — the most used betting app in Nigeria — paste your betPawa booking code here and get a fresh SportyBet share code with the same 1X2 selections, no sign-in and no fee.',
    howTo: [
      { title: 'Copy your betPawa booking code', body: 'Open the betPawa app, open the slip you want to move and copy the booking code it shows for that betslip.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to betPawa.' },
      { title: 'Choose SportyBet and convert', body: 'Set the To bookmaker to SportyBet and tap Convert Code to re-encode the slip.' },
      { title: 'Load it on SportyBet', body: 'Open SportyBet, paste the generated code into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Does a betPawa code convert cleanly to SportyBet?', a: 'Yes for 1X2 legs. Each betPawa selection is matched to the shared Sportradar event, so SportyBet receives a fresh share code whenever the match is still on its board.' },
      { q: 'Which betPawa markets convert to SportyBet?', a: 'betPawa slips are built from 1X2 lines and those match-result selections convert to SportyBet exactly — SportyBet code creation is not limited to 1X2, so the carried legs stay playable when re-encoded.' },
      { q: 'How many legs can a betPawa to SportyBet code carry?', a: 'Up to 30 selections are supported for a betPawa to SportyBet conversion, matching the site-wide limit.' },
      { q: 'Is converting a betPawa code to SportyBet free?', a: 'Yes. Generating the SportyBet share code is free; you only stake if you place the bet on SportyBet.' }
    ]
  },
  {
    from: 'sportybet',
    to: 'betpawa',
    blurb: 'Re-encode a SportyBet share code as a betPawa booking code you can load in seconds.',
    intro:
      'Convert a SportyBet share code into a fresh betPawa booking code. The converter reads your SportyBet selections, matches each match to the matching event in the betPawa feed, and mints a betPawa code live with current prices. Great when you have been sent a SportyBet slip but you bet on betPawa, or you want to pass the slip to a betPawa-only friend.',
    howTo: [
      { title: 'Copy your SportyBet share code', body: 'Open the slip in the SportyBet app, tap Share, and copy the share code it displays.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to SportyBet.' },
      { title: 'Choose betPawa and convert', body: 'Set the To bookmaker to betPawa and tap Convert Code.' },
      { title: 'Load it on betPawa', body: 'Open the betPawa app, tap Load Code, paste the generated code and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Can a SportyBet slip convert to a betPawa code?', a: 'The 1X2 legs convert to a betPawa code, because each SportyBet match is matched to the same event in the betPawa feed before a new code is minted.' },
      { q: 'Which SportyBet selections become betPawa codes?', a: 'Only 1X2 legs convert, because a betPawa code is built live from the match-result market on its event feed.' },
      { q: 'Will my odds carry over to betPawa?', a: 'Selections are re-priced at betPawa current odds when the code is minted, so the total can differ from the SportyBet original.' },
      { q: 'How many legs can a SportyBet to betPawa code hold?', a: 'Up to 30 selections are supported for a SportyBet to betPawa conversion.' },
      { q: 'Is converting a SportyBet code to betPawa free?', a: 'Yes, generating the betPawa booking code is free; you only stake if you place the bet on betPawa.' }
    ]
  },
  {
    from: 'betpawa',
    to: 'msport',
    blurb: 'Re-issue a betPawa booking code as a fresh MSport share code for MSport users.',
    intro:
      'If you hold a betPawa booking code but play on MSport — or want to share the slip with an MSport-only friend — paste it here. The converter matches each betPawa match to the shared Sportradar event, then re-encodes your 1X2 selections as an MSport share code with current odds. No manual slip rebuilding and no sign-in required.',
    howTo: [
      { title: 'Copy your betPawa booking code', body: 'Open the betPawa app, open the slip you want to move and copy the booking code it shows for that betslip.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to betPawa.' },
      { title: 'Choose MSport and convert', body: 'Set the To bookmaker to MSport and tap Convert Code.' },
      { title: 'Load it on MSport', body: 'Open MSport, paste the generated code into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Can a betPawa slip become an MSport code?', a: 'Yes for the 1X2 legs, because each betPawa match is mapped to the same Sportradar event MSport uses before the fresh share code is minted.' },
      { q: 'Do the odds carry over to MSport?', a: 'Your betPawa selections are re-priced at MSport current odds when the code is created, so the combined total reflects MSport prices at conversion time.' },
      { q: 'How many selections can a betPawa to MSport code hold?', a: 'Up to 30 selections are supported for a betPawa to MSport conversion.' },
      { q: 'Is betPawa to MSport conversion free?', a: 'Yes, creating the MSport share code costs nothing; you only stake if you place the bet on MSport.' }
    ]
  },
  {
    from: 'msport',
    to: 'betpawa',
    blurb: 'Re-encode an MSport share code as a betPawa booking code for betPawa users.',
    intro:
      'Move an MSport share code onto betPawa. The converter matches each MSport selection to the matching event in the betPawa feed and mints a fresh betPawa booking code with current prices. Useful when you play on betPawa but receive MSport slips, or you want to hand a slip to someone who only uses betPawa.',
    howTo: [
      { title: 'Copy your MSport share code', body: 'Open the slip in the MSport app, tap Share, and copy the share code it displays.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to MSport.' },
      { title: 'Choose betPawa and convert', body: 'Set the To bookmaker to betPawa and tap Convert Code.' },
      { title: 'Load it on betPawa', body: 'Open the betPawa app, tap Load Code, paste the generated code and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Can an MSport 1X2 slip become a betPawa code?', a: 'Yes. Each MSport match is matched to the betPawa event feed and a fresh betPawa code is minted from the 1X2 selections.' },
      { q: 'Do all MSport markets convert to betPawa?', a: 'A betPawa code is built from the match-result market, so the 1X2 legs of your MSport slip convert and any other markets are reported.' },
      { q: 'How many legs can an MSport to betPawa code have?', a: 'Up to 30 legs are supported for an MSport to betPawa conversion.' },
      { q: 'Is converting an MSport code to betPawa free?', a: 'Yes, generating the betPawa booking code is free; you only stake if you place the bet on betPawa.' }
    ]
  },
  {
    from: 'betpawa',
    to: 'betway',
    blurb: 'Move a betPawa booking code onto Betway Book A Bet as a fresh booking code.',
    intro:
      'betPawa 1X2 selections can be matched to the same matches Betway offers, then re-issued as a fresh Betway Book-A-Bet code. This is handy when a friend shares a betPawa slip but you bet on Betway, or you simply prefer Betway promos. Paste the betPawa booking code below and the converter handles the match-matching for you.',
    howTo: [
      { title: 'Copy your betPawa booking code', body: 'Open the betPawa app, open the slip you want to move and copy the booking code it shows for that betslip.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to betPawa.' },
      { title: 'Choose Betway and convert', body: 'Set the To bookmaker to Betway and tap Convert Code.' },
      { title: 'Load it on Betway', body: 'Open Betway, go to Book A Bet and enter the generated code to load the slip.' }
    ],
    faq: [
      { q: 'Does betPawa to Betway conversion need sign-in?', a: 'No. Paste a betPawa booking code and get a fresh Betway Book-A-Bet code without logging in; the conversion is free.' },
      { q: 'Which betPawa selections convert to Betway?', a: 'Selections that Betway offers on the same match convert cleanly. Because betPawa slips are 1X2-based, matched legs become a Betway code whenever the market is still priced.' },
      { q: 'How many legs can a betPawa to Betway code have?', a: 'Up to 30 legs, matching the limit for a betPawa to Betway conversion.' },
      { q: 'Will the Betway odds match the betPawa slip?', a: 'Selections are re-priced at Betway current odds, so the combined total can differ from the betPawa original.' }
    ]
  },
  {
    from: 'betway',
    to: 'betpawa',
    blurb: 'Turn a Betway Book-A-Bet code into a betPawa booking code.',
    intro:
      'Convert a Betway Book-A-Bet code into a betPawa booking code. The converter reads your Betway selections, matches each match against the live betPawa event feed, and mints a fresh betPawa code with current prices. This is for betPawa users who receive Betway slips from friends, or who want to play a Betway-built slip on their betPawa account.',
    howTo: [
      { title: 'Copy your Betway Book-A-Bet code', body: 'Copy the booking code from your Betway Book A Bet slip.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to Betway.' },
      { title: 'Choose betPawa and convert', body: 'Set the To bookmaker to betPawa and tap Convert Code.' },
      { title: 'Load it on betPawa', body: 'Open the betPawa app, tap Load Code, paste the generated code and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Which Betway selections convert to a betPawa code?', a: 'The 1X2 legs convert, because a betPawa code is minted from the match-result market on the live event feed.' },
      { q: 'Do I need a Betway account to convert to betPawa?', a: 'No — just the Betway Book-A-Bet code. You do not need to log in to generate the betPawa booking code.' },
      { q: 'Will the odds match on the betPawa code?', a: 'Selections are re-priced at betPawa current odds, so the combined total can differ from the Betway original.' },
      { q: 'How many legs can a Betway to betPawa code have?', a: 'Up to 30 legs are supported for a Betway to betPawa conversion.' }
    ]
  },
  {
    from: 'betpawa',
    to: 'bet9ja',
    blurb: 'Rebuild a betPawa booking code as a Bet9ja Book-A-Bet code for Bet9ja users.',
    intro:
      'Convert a betPawa booking code into a Bet9ja Book-A-Bet code so Bet9ja users can play your slip. Because both platforms price match results, the 1X2 legs of your betPawa slip map onto the Bet9ja coupon automatically. Paste the code below and get a Bet9ja code you can load into coupon.bet9ja.com or the Bet9ja app.',
    howTo: [
      { title: 'Copy your betPawa booking code', body: 'Open the betPawa app, open the slip you want to move and copy the booking code it shows for that betslip.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to betPawa.' },
      { title: 'Choose Bet9ja and convert', body: 'Set the To bookmaker to Bet9ja and tap Convert Code.' },
      { title: 'Load it on Bet9ja', body: 'Open coupon.bet9ja.com or the Bet9ja app and enter the code in the Book-A-Bet coupon.' }
    ],
    faq: [
      { q: 'Which betPawa selections convert to a Bet9ja code?', a: 'Only the 1X2 legs of a betPawa slip convert to a Bet9ja code right now; other lines are skipped and reported so you can drop them.' },
      { q: 'Where do I load the new Bet9ja code?', a: 'Enter the generated code in the Bet9ja Book-A-Bet coupon on coupon.bet9ja.com or in the Bet9ja app.' },
      { q: 'How long is the betPawa to Bet9ja code valid?', a: 'The Bet9ja code is valid until the first match on the slip kicks off, so stake it before the earliest kick-off.' },
      { q: 'Is converting a betPawa code to Bet9ja free?', a: 'Yes, generating the Bet9ja Book-A-Bet code is free; you only stake if you place the bet on Bet9ja.' }
    ]
  },
  {
    from: 'bet9ja',
    to: 'betpawa',
    blurb: 'Re-issue a Bet9ja Book-A-Bet code as a fresh betPawa booking code.',
    intro:
      'A Bet9ja Book-A-Bet slip can be rebuilt as a betPawa booking code. Paste the Bet9ja code and the converter matches each 1X2 selection to the matching event in the betPawa feed, then mints a fresh betPawa code with current odds. A quick way to move a coupon shared by a Bet9ja friend onto your own betPawa account without retyping each leg.',
    howTo: [
      { title: 'Copy your Bet9ja Book-A-Bet code', body: 'Copy the Book-A-Bet code from your Bet9ja coupon, email or SMS.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to Bet9ja.' },
      { title: 'Choose betPawa and convert', body: 'Set the To bookmaker to betPawa and tap Convert Code.' },
      { title: 'Load it on betPawa', body: 'Open the betPawa app, tap Load Code, paste the generated code and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Do I need a Bet9ja account to convert to betPawa?', a: 'No — you only need the Bet9ja Book-A-Bet code to generate a fresh betPawa booking code without logging in.' },
      { q: 'Which Bet9ja selections convert to a betPawa code?', a: 'Bet9ja slips built from 1X2 selections convert cleanly, because a betPawa code is minted from the match-result market on the event feed.' },
      { q: 'How long is the generated betPawa code valid?', a: 'The betPawa code stays valid until the first match on the slip kicks off, so load and stake it before the earliest kick-off.' },
      { q: 'How many legs can a Bet9ja to betPawa code have?', a: 'Up to 30 legs are supported for a Bet9ja to betPawa conversion.' }
    ]
  },
  {
    from: 'betpawa',
    to: 'bangbet',
    blurb: 'Re-issue a betPawa booking code as a fresh Bangbet booking code.',
    intro:
      'Bangbet accepts bookings re-encoded from the shared Sportradar platform, and betPawa matches map onto those same events before a new code is built. If you hold a betPawa booking code but want to play on Bangbet — for its bundles or local-language promos — paste it here and get a Bangbet booking code carrying the same 1X2 selections at current odds.',
    howTo: [
      { title: 'Copy your betPawa booking code', body: 'Open the betPawa app, open the slip you want to move and copy the booking code it shows for that betslip.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to betPawa.' },
      { title: 'Choose Bangbet and convert', body: 'Set the To bookmaker to Bangbet and tap Convert Code.' },
      { title: 'Load it on Bangbet', body: 'Open the Bangbet app, paste the generated code into the code field and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Can my betPawa slip become a Bangbet code?', a: 'Yes for the 1X2 legs, because the betPawa match is matched to the shared Sportradar event and Bangbet re-encodes it with current odds.' },
      { q: 'Which markets survive the jump to Bangbet?', a: 'betPawa slips are 1X2-based, and those match-result lines re-encode cleanly on Bangbet whenever the match is still on its board.' },
      { q: 'How many selections can a betPawa to Bangbet code carry?', a: 'Up to 30 selections are supported for a betPawa to Bangbet conversion.' },
      { q: 'Is generating a Bangbet code from betPawa free?', a: 'Yes, creating the Bangbet booking code is free; you only stake when you place the bet on Bangbet.' }
    ]
  },
  {
    from: 'bangbet',
    to: 'betpawa',
    blurb: 'Re-encode a Bangbet booking code as a betPawa booking code.',
    intro:
      'Convert a Bangbet booking code into a betPawa booking code. Bangbet runs on the Sportradar platform, and each match maps onto the matching betPawa event before the code is minted with current odds. Great for Bangbet users who also play on betPawa, or for moving a shared Bangbet slip onto your betPawa account.',
    howTo: [
      { title: 'Copy your Bangbet booking code', body: 'Open the Bangbet booking you want to move and copy the short code it displays.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to Bangbet.' },
      { title: 'Choose betPawa and convert', body: 'Set the To bookmaker to betPawa and tap Convert Code.' },
      { title: 'Load it on betPawa', body: 'Open the betPawa app, tap Load Code, paste the generated code and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Can every Bangbet code convert to betPawa?', a: '1X2 selections convert cleanly, because each Bangbet match is matched to the betPawa feed and a new code is minted with current odds.' },
      { q: 'Do the odds survive the move to betPawa?', a: 'Selections are re-priced at betPawa current odds when the code is minted, so the total is whatever betPawa prices at conversion time.' },
      { q: 'How many legs can a Bangbet to betPawa code hold?', a: 'Up to 30 legs are supported for a Bangbet to betPawa conversion.' },
      { q: 'Is converting a Bangbet code to betPawa free?', a: 'Yes, creating the betPawa booking code is free; you only stake if you place the bet on betPawa.' }
    ]
  },
  {
    from: 'betking',
    to: 'betpawa',
    blurb: 'Decode a BetKing book bet code and re-issue it as a betPawa booking code.',
    intro:
      'BetKing book bet codes open at the /book-bet/ share link, and the converter decodes yours, matches each match to the matching betPawa event, and mints a fresh betPawa booking code. Handy when a friend shares a BetKing slip but you bet on betPawa, or you simply want the same selections on your betPawa account.',
    howTo: [
      { title: 'Copy your BetKing book bet code', body: 'Open your BetKing slip, book the bet to give it a code, and copy the book bet code it shows.' },
      { title: 'Paste it here', body: 'Paste the code and confirm the From bookmaker is set to BetKing.' },
      { title: 'Choose betPawa and convert', body: 'Set the To bookmaker to betPawa and tap Convert Code.' },
      { title: 'Load it on betPawa', body: 'Open the betPawa app, tap Load Code, paste the generated code and the slip loads ready to stake.' }
    ],
    faq: [
      { q: 'Can a BetKing code convert to betPawa?', a: 'Most can. Each BetKing selection resolves through the shared Sportradar event id, which is matched to the betPawa feed before a new code is minted from the 1X2 legs.' },
      { q: 'Which BetKing selections become betPawa codes?', a: 'The 1X2 legs convert, because a betPawa code is minted from the match-result market on the live event feed.' },
      { q: 'How many legs can a BetKing to betPawa code have?', a: 'Up to 30 legs are supported for a BetKing to betPawa conversion.' },
      { q: 'Is BetKing to betPawa conversion free?', a: 'Yes, generating the betPawa booking code is free; you only stake if you place the bet on betPawa.' }
    ]
  }
];

const HUB = {
  intro:
    'Pick a conversion below or open the full tool. Paste a SportyBet, MSport, Bet9ja, Betway, BetKing, Bangbet or betPawa code, preview every selection and odds, then get a fresh playable code for the bookmaker you use. Free, no sign-in, up to 30 selections.',
  faq: [
    { q: 'Is converting booking codes free?', a: 'Yes. WinFulltime never charges for decoding, previewing or generating a booking code. You only stake money if you place the converted bet on your bookmaker.' },
    { q: 'Which bookmakers can I convert between?', a: 'SportyBet, MSport, Betway, Bet9ja, BetKing, Bangbet and betPawa codes can be decoded, and 1X2 selections can be converted between any two supported bookmakers. BetKing code creation is not supported yet. Codes are validated by the target bookmaker before they are returned.' },
    { q: 'Why is Bet9ja conversion limited?', a: 'Bet9ja code creation currently supports 1X2 selections only, and Bet9ja conversion is experiencing issues at the moment. Our technical team is working on it. SportyBet, MSport and Betway conversions are unaffected.' },
    { q: 'Can I create a new BetKing code?', a: 'Not yet. BetKing codes decode and convert out to other bookmakers, but creating a fresh BetKing code needs a signed-in BetKing Code Zone session and is not supported yet. Bangbet codes both decode and create.' },
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
