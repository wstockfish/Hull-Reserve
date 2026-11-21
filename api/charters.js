const endpoint = 'https://charter.boats/api/ai/boats';
const boatTypes = new Set(['sailboat', 'catamaran', 'yacht', 'motorboat', 'gulet', 'rib', 'other']);

function trustedUrl(value, hosts) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && hosts.includes(url.hostname) && !url.username && !url.password) {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Use GET to search for yachts.' });
  }

  const query = new URL(req.url, 'https://hullreserve.com').searchParams;
  const location = (query.get('location') ?? '').trim();
  const type = query.get('type') ?? '';
  const guests = query.get('guests') ?? '';
  if (location.length > 100 || (type && !boatTypes.has(type)) || (guests && !/^[1-9]\d{0,2}$/.test(guests))) {
    return res.status(400).json({ error: 'Check your destination, yacht type, and guest count.' });
  }

  const url = new URL(endpoint);
  url.searchParams.set('api_version', '1.1');
  url.searchParams.set('limit', '25');
  if (location) url.searchParams.set('location', location);
  if (type) url.searchParams.set('boat_type', type);
  if (guests) url.searchParams.set('guests', guests);

  const headers = { Accept: 'application/json' };
  if (process.env.CHARTER_BOATS_API_KEY) headers['X-API-Key'] = process.env.CHARTER_BOATS_API_KEY;

  try {
    const upstream = await fetch(url, { headers, signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (upstream.status === 429) {
      const retry = upstream.headers.get('Retry-After');
      if (retry && /^\d+$/.test(retry)) res.setHeader('Retry-After', retry);
      return res.status(429).json({ error: 'Charter Boats is receiving too many searches. Try again shortly.' });
    }
    if (!upstream.ok) throw new Error('Inventory service unavailable');

    const data = await upstream.json();
    if (!Array.isArray(data.boats)) throw new Error('Unexpected inventory response');
    const boats = data.boats.map((boat) => ({
      title: boat.card?.title || boat.title,
      type: boat.card?.type,
      location: boat.card?.location || boat.location,
      capacity: boat.capacity,
      cabins: boat.cabins,
      price: boat.price_summary,
      image: trustedUrl(boat.hero_image_url, ['media.charter.boats']),
      url: trustedUrl(boat.url, ['chrtr.me', 'charter.boats', 'www.charter.boats']),
    }));

    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=300');
    return res.status(200).json({
      boats,
      total: Number.isSafeInteger(data.total_matching) ? data.total_matching : boats.length,
      unresolved: Boolean(data.location_unresolved),
      searchUrl: trustedUrl(data.search_url, ['charter.boats', 'www.charter.boats']),
    });
  } catch {
    return res.status(502).json({ error: 'Charter Boats listings are temporarily unavailable. Try again shortly.' });
  }
};
