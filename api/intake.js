const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 8;
const requests = new Map();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 25_000) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function clean(value, max = 500) {
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f<>]/g, '').slice(0, max) : '';
}

function allowedOrigin(origin) {
  const configured = (process.env.AIRE_ALLOWED_ORIGINS || '')
    .split(',').map((item) => item.trim()).filter(Boolean);
  return !origin || configured.length === 0 || configured.includes(origin);
}

function rateLimit(ip) {
  const now = Date.now();
  const record = requests.get(ip) || { started: now, count: 0 };
  if (now - record.started > WINDOW_MS) {
    record.started = now;
    record.count = 0;
  }
  record.count += 1;
  requests.set(ip, record);
  return record.count <= MAX_REQUESTS;
}

function nameParts(name) {
  const parts = name.split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || 'Website', lastName: parts.join(' ') || 'Lead' };
}

function inquirySummary(data) {
  const fields = [
    ['Inquiry type', data.inquiryType],
    ['Business', data.businessName],
    ['Timing', data.timing],
    ['Focus', data.focus],
    ['Revenue range', data.revenueRange],
    ['Investment range', data.investmentRange],
    ['Industry', data.industry],
    ['Landing page', data.page],
    ['UTM source', data.utmSource],
    ['UTM campaign', data.utmCampaign]
  ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  return `AIRE Business Brokerage website intake\n${fields.join('\n')}`;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (!allowedOrigin(origin)) return json(res, 403, { ok: false, error: 'Origin not allowed' });
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
  if (!rateLimit(ip)) return json(res, 429, { ok: false, error: 'Please wait before submitting again.' });

  let raw;
  try { raw = await readBody(req); }
  catch (error) { return json(res, error.message === 'Payload too large' ? 413 : 400, { ok: false, error: error.message }); }

  // Honeypot field: bots fill it, real visitors never see it.
  if (clean(raw.website, 120)) return json(res, 200, { ok: true });

  const data = {
    name: clean(raw.name, 120),
    email: clean(raw.email, 180).toLowerCase(),
    phone: clean(raw.phone, 40),
    businessName: clean(raw.businessName, 180),
    inquiryType: clean(raw.inquiryType, 80) || 'Private inquiry',
    timing: clean(raw.timing, 80),
    focus: clean(raw.focus, 120),
    revenueRange: clean(raw.revenueRange, 80),
    investmentRange: clean(raw.investmentRange, 80),
    industry: clean(raw.industry, 120),
    page: clean(raw.page, 400),
    utmSource: clean(raw.utmSource, 120),
    utmCampaign: clean(raw.utmCampaign, 160)
  };

  if (!data.name || (!data.phone && !data.email)) {
    return json(res, 422, { ok: false, error: 'Please provide your name and a phone number or email address.' });
  }

  const apiKey = process.env.LOFTY_API_KEY;
  if (!apiKey) return json(res, 503, { ok: false, error: 'Intake is not configured yet.' });

  const { firstName, lastName } = nameParts(data.name);
  const isBuyer = data.inquiryType.toLowerCase().includes('buy');
  const assignedUserId = Number(process.env.LOFTY_ASSIGNED_USER_ID || 0);
  const lead = {
    firstName,
    lastName,
    source: 'AIRE Business Brokerage Website',
    leadTypes: [isBuyer ? 2 : 1],
    ...(assignedUserId ? { assignedUserId } : {}),
    ...(data.email ? { emails: [data.email] } : {}),
    ...(data.phone ? { phones: [data.phone] } : {}),
    tagsAdd: ['AIRE Business Brokerage', data.inquiryType].map((value) => value.slice(0, 64)),
    leadAlert: true,
    welcomeEmail: false
  };

  try {
    const lofty = await fetch('https://api.lofty.com/v1.0/leads', {
      method: 'POST',
      headers: {
        Authorization: `token ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(lead)
    });
    if (!lofty.ok) {
      const detail = await lofty.text();
      console.error('Lofty intake failure', lofty.status, detail.slice(0, 500));
      return json(res, 502, { ok: false, error: 'We could not submit your request. Please call (801) 433-7974.' });
    }
    const result = await lofty.json().catch(() => ({}));
    const leadId = result.leadId || result.id || null;
    if (leadId) {
      await fetch('https://api.lofty.com/v1.0/notes', {
        method: 'POST',
        headers: { Authorization: `token ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, content: inquirySummary(data), isPin: true })
      }).catch(() => null);
    }
    return json(res, 201, { ok: true, leadId });
  } catch (error) {
    console.error('Lofty intake network error', error.message);
    return json(res, 502, { ok: false, error: 'We could not submit your request. Please call (801) 433-7974.' });
  }
}
