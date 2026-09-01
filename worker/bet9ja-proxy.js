export default {
  async fetch(request, env, ctx) {
    return handleRequest(request);
  }
};

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function buildCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Origin, Referer',
    'Access-Control-Max-Age': '86400',
  };
}

function buildBet9jaHeaders() {
  return {
    'User-Agent': BROWSER_UA,
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Connection': 'keep-alive',
    'Referer': 'https://coupon.bet9ja.com/',
    'Origin': 'https://coupon.bet9ja.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'X-Requested-With': 'XMLHttpRequest',
  };
}

async function handleRequest(request) {
  const corsHeaders = buildCorsHeaders();

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const parsedTarget = new URL(targetUrl);
    if (!parsedTarget.hostname.endsWith('bet9ja.com')) {
      return new Response(JSON.stringify({ error: 'Only bet9ja.com URLs are allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bet9jaResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: buildBet9jaHeaders(),
      redirect: 'follow',
    });

    const contentType = bet9jaResponse.headers.get('Content-Type') || 'application/json';
    const body = await bet9jaResponse.text();

    return new Response(body, {
      status: bet9jaResponse.status,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy error: ' + err.message }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
