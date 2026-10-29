var RESEND_API = 'https://api.resend.com/emails';
var DEFAULT_RECIPIENT = 'officialwinfulltime@gmail.com';
var DEFAULT_FROM = 'WinFulltime Payments <payments@winfulltime.com>';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendSiteEnquiry(options) {
  var apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return Promise.resolve({ sent: false, status: 503, error: 'Email service is not configured. Please try again later.' });

  var fields = options.fields || [];
  var rows = fields.map(function (field) {
    return '<tr><th align="left" style="padding:8px 12px 8px 0;vertical-align:top;">'
      + escapeHtml(field.label) + '</th><td style="padding:8px 0;white-space:pre-wrap;">'
      + escapeHtml(field.value || 'Not provided') + '</td></tr>';
  }).join('');
  var html = '<!doctype html><html><body><h2>' + escapeHtml(options.title)
    + '</h2><table>' + rows + '</table></body></html>';
  var payload = {
    from: process.env.ADMIN_NOTIFICATION_FROM || DEFAULT_FROM,
    to: [process.env.SITE_ENQUIRY_EMAIL || DEFAULT_RECIPIENT],
    subject: String(options.subject || 'WinFulltime enquiry').replace(/[\r\n]+/g, ' ').slice(0, 180),
    html: html
  };
  if (options.replyTo) payload.reply_to = options.replyTo;

  return fetch(RESEND_API, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function (response) {
    if (response.ok) return { sent: true };
    return response.text().then(function (message) {
      console.error('[site-enquiry] Resend rejected email:', response.status, message.slice(0, 300));
      return { sent: false, status: 502, error: 'We could not send your message right now. Please try again later.' };
    });
  }).catch(function (error) {
    console.error('[site-enquiry] Resend request failed:', error.message);
    return { sent: false, status: 502, error: 'We could not send your message right now. Please try again later.' };
  });
}

module.exports = { sendSiteEnquiry: sendSiteEnquiry };
