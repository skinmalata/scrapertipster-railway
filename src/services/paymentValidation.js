// Shared validation for payment entitlements.
//
// Before an account is upgraded every provider has to prove three things:
// the payment reached a collected state, it was made in the currency the
// plans are priced in, and the amount collected covers the plan that was
// bought. The plan is derived from the provider's own product/variant
// identifier wherever the provider exposes one, so the entitlement can never
// be claimed for a more expensive plan than the one that was paid for.

var PLAN_PRICES = {
  monthly: 20,
  yearly: 100
};

var CURRENCY = 'USD';

// Provider totals are rounded to two decimals, so half a cent of slack is
// allowed on the comparison to absorb float noise. A full cent underpayment
// is a real underpayment and is rejected.
var TOLERANCE = 0.005;

function planPrice(planType) {
  if (!planType) return null;
  var price = PLAN_PRICES[planType];
  return typeof price === 'number' ? price : null;
}

function computeExpiry(planType, fromDate) {
  var d = fromDate ? new Date(fromDate) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  if (planType === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else if (planType === 'lifetime') d.setFullYear(d.getFullYear() + 99);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

// Amounts arrive as numbers ("20"), numeric strings ("20.00") or currency
// formatted strings ("$20.00") depending on the provider. Returns null when
// there is no usable number so callers can fail closed instead of guessing.
function parseAmount(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  var raw = String(value).trim();
  if (!raw) return null;

  var negative = /^\(.*\)$/.test(raw) || raw.charAt(0) === '-';
  var cleaned = raw.replace(/[^0-9.,]/g, '');
  if (!cleaned) return null;

  // The last separator is the decimal one: "1,234.56" (en-US) versus
  // "1.234,56" (de-DE).
  var lastComma = cleaned.lastIndexOf(',');
  var lastDot = cleaned.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    else cleaned = cleaned.replace(/,/g, '');
  } else if (lastComma > -1) {
    cleaned = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  }

  var num = parseFloat(cleaned);
  if (!isFinite(num)) return null;
  return negative ? -num : num;
}

// Validates a collected payment against the plan it is supposed to unlock.
// `amount` must be the amount that was actually charged, never the price
// that was expected.
function validatePayment(_a) {
  var planType = _a.planType, amount = _a.amount, currency = _a.currency;

  var expected = planPrice(planType);
  if (expected === null) {
    return { valid: false, reason: 'Unknown plan "' + planType + '"' };
  }

  if (currency !== null && currency !== undefined && currency !== '') {
    if (String(currency).toUpperCase() !== CURRENCY) {
      return { valid: false, reason: 'Currency mismatch: ' + currency + ' (expected ' + CURRENCY + ')' };
    }
  }

  var paid = parseAmount(amount);
  if (paid === null) return { valid: false, reason: 'Payment amount missing' };
  if (paid <= 0) return { valid: false, reason: 'Payment amount is not positive: ' + paid };
  if (paid < expected - TOLERANCE) {
    return {
      valid: false,
      reason: 'Amount mismatch: collected ' + paid + ' ' + CURRENCY +
        ', plan "' + planType + '" requires ' + expected + ' ' + CURRENCY
    };
  }

  return { valid: true, amount: Number(paid.toFixed(2)), expected: expected, planType: planType };
}

// Keeps the later of two expiry dates. Two events usually describe the same
// purchase (the order webhook and the subscription webhook), and a renewal
// can arrive before the current period ends. Neither may shorten an
// entitlement that was already granted.
function latestExpiry(a, b) {
  var ta = a ? new Date(a).getTime() : 0;
  var tb = b ? new Date(b).getTime() : 0;
  if (!isFinite(ta)) ta = 0;
  if (!isFinite(tb)) tb = 0;
  return new Date(Math.max(ta, tb));
}

module.exports = {
  PLAN_PRICES: PLAN_PRICES,
  CURRENCY: CURRENCY,
  TOLERANCE: TOLERANCE,
  planPrice: planPrice,
  computeExpiry: computeExpiry,
  parseAmount: parseAmount,
  validatePayment: validatePayment,
  latestExpiry: latestExpiry
};
