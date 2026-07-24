const axios = require('axios');

const BREVO_API_URL = 'https://api.brevo.com/v3';

function getConfig() {
  const listId = Number(process.env.BREVO_DAILY_TIPS_LIST_ID);
  const config = {
    apiKey: process.env.BREVO_API_KEY,
    listId,
    senderEmail: process.env.BREVO_SENDER_EMAIL,
    senderName: process.env.BREVO_SENDER_NAME || 'WinFulltime',
    baseUrl: (process.env.BASE_URL || 'https://winfulltime.com').replace(/\/$/, '')
  };
  if (!config.apiKey || !Number.isInteger(config.listId) || config.listId < 1 || !config.senderEmail) {
    throw new Error('Brevo daily tips is not configured.');
  }
  return config;
}

async function request(config, method, url, data) {
  try {
    return await axios({
      method,
      url: `${BREVO_API_URL}${url}`,
      data,
      headers: { 'api-key': config.apiKey, 'content-type': 'application/json' },
      timeout: 15000
    });
  } catch (error) {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;
    throw new Error(`Brevo request failed${status ? ` (${status})` : ''}: ${message}`);
  }
}

async function subscribeDailyTips(email) {
  const config = getConfig();
  await request(config, 'post', '/contacts', { email, listIds: [config.listId], updateEnabled: true });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function buildDailyTicketEmail(ticket, config) {
  const ticketUrl = `${config.baseUrl}/ticket-builder.html?utm_source=brevo&utm_medium=email&utm_campaign=daily_ticket_${ticket.date}`;
  const rows = ticket.selections.map((selection) => `<tr><td style="padding:12px;border-bottom:1px solid #e5e7eb"><strong>${escapeHtml(selection.match)}</strong><br><span style="color:#6b7280;font-size:13px">${escapeHtml(selection.league)}</span></td><td style="padding:12px;border-bottom:1px solid #e5e7eb">${escapeHtml(selection.pick)}</td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right">${selection.odds.toFixed(2)}</td></tr>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827"><div style="max-width:620px;margin:0 auto;padding:24px"><div style="background:#111827;color:#fff;padding:28px;border-radius:14px 14px 0 0"><div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#a7f3d0">WinFulltime daily ticket</div><h1 style="margin:8px 0 0;font-size:27px">Today's selections</h1><p style="margin:8px 0 0;color:#d1d5db">${escapeHtml(ticket.date)} | Combined estimated odds: <strong>${ticket.totalOdds.toFixed(2)}</strong></p></div><div style="background:#fff;padding:24px;border-radius:0 0 14px 14px"><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="text-align:left;color:#6b7280"><th style="padding:0 12px 10px">Match</th><th style="padding:0 12px 10px">Pick</th><th style="padding:0 12px 10px;text-align:right">Odds</th></tr></thead><tbody>${rows}</tbody></table><p style="margin:24px 0 0"><a href="${ticketUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:bold">Build this ticket</a></p><p style="margin:22px 0 0;color:#6b7280;font-size:12px;line-height:1.5">Predictions are informational only, not financial advice or a guarantee. Only bet what you can afford to lose. You can unsubscribe at any time using the link in this email.</p></div></div></body></html>`;
}

async function createAndSendDailyTicketCampaign(ticket) {
  const config = getConfig();
  const created = await request(config, 'post', '/emailCampaigns', {
    name: `Daily Ticket ${ticket.date}`,
    subject: `Today's football ticket - ${ticket.date}`,
    previewText: `Today's ${ticket.selections.length}-selection ticket at estimated odds of ${ticket.totalOdds.toFixed(2)}.`,
    sender: { name: config.senderName, email: config.senderEmail },
    replyTo: config.senderEmail,
    recipients: { listIds: [config.listId] },
    htmlContent: buildDailyTicketEmail(ticket, config),
    tag: 'daily-ticket',
    utmCampaign: `daily_ticket_${ticket.date}`
  });
  const campaignId = created.data.id;
  await request(config, 'post', `/emailCampaigns/${campaignId}/sendNow`, {});
  return { campaignId };
}

module.exports = { subscribeDailyTips, createAndSendDailyTicketCampaign, buildDailyTicketEmail };
