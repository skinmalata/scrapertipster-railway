'use strict';

const BOOKMAKERS = ['sportybet', 'msport', 'bet9ja'];

function isSportradar(bookmaker) {
  return bookmaker === 'sportybet' || bookmaker === 'msport';
}

function isBet9ja(bookmaker) {
  return bookmaker === 'bet9ja';
}

function requireResolvable(from, to) {
  if (isSportradar(from) && isBet9ja(to)) {
    const err = new Error('Converting SportyBet/MSport codes to Bet9ja is not available yet. Cross-bookmaker matching needs a Bet9ja event feed that is still being built. You can still decode any code, convert between SportyBet and MSport, and recreate a code in the same bookmaker.');
    err.code = 'CROSS_FAMILY_UNAVAILABLE';
    throw err;
  }
  if (isBet9ja(from) && isSportradar(to)) {
    const err = new Error('Converting Bet9ja codes to SportyBet/MSport is not available yet. Cross-bookmaker matching needs a Bet9ja event feed that is still being built. You can still decode any code, convert between SportyBet and MSport, and recreate a code in the same bookmaker.');
    err.code = 'CROSS_FAMILY_UNAVAILABLE';
    throw err;
  }
}

module.exports = { BOOKMAKERS, isSportradar, isBet9ja, requireResolvable };
