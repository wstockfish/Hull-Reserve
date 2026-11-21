const endpoint = 'https://charter.boats/api/ai/boats';
const boatTypes = new Set(['sailboat', 'catamaran', 'yacht', 'motorboat', 'gulet', 'rib', 'other']);
const bookingHosts = ['chrtr.me', 'charter.boats', 'www.charter.boats'];
const boatId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

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
  const id = query.get('id');
  if (id !== null && !boatId.test(id)) {
    return res.status(400).json({ error: 'This yacht link is invalid.' });
  }
  const location = (query.get('location') ?? '').trim();
  const type = query.get('type') ?? '';
  const guests = query.get('guests') ?? '';
  if (location.length > 100 || (type && !boatTypes.has(type)) || (guests && !/^[1-9]\d{0,2}$/.test(guests))) {
    return res.status(400).json({ error: 'Check your destination, yacht type, and guest count.' });
  }

  const url = new URL(id ? `${endpoint}/${id.toLowerCase()}` : endpoint);
  url.searchParams.set('api_version', '1.1');
  const start = query.get('date_from');
  const end = query.get('date_to');
  if (start || end) {
    const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().startsWith(v);
    if (!validDate(start) || !validDate(end) || end <= start) {
      return res.status(400).json({ error: 'Choose a check-out date after your check-in date.' });
    }
    url.searchParams.set('date_from', start);
    url.searchParams.set('date_to', end);
  }
  if (guests) url.searchParams.set('guests', guests);
  if (!id) {
    url.searchParams.set('limit', '25');
    if (location) url.searchParams.set('location', location);
    if (type) url.searchParams.set('boat_type', type);
  }

  const headers = { Accept: 'application/json' };
  if (process.env.CHARTER_BOATS_API_KEY) headers['X-API-Key'] = process.env.CHARTER_BOATS_API_KEY;

  try {
    const upstream = await fetch(url, { headers, signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (upstream.status === 429) {
      const retry = upstream.headers.get('Retry-After');
      if (retry && /^\d+$/.test(retry)) res.setHeader('Retry-After', retry);
      return res.status(429).json({ error: 'Charter Boats is receiving too many searches. Try again shortly.' });
    }
    if (id && upstream.status === 404) {
      return res.status(404).json({ error: 'This yacht is no longer listed.' });
    }
    if (!upstream.ok) throw new Error('Inventory service unavailable');

    const data = await upstream.json();
    if (id) {
      const boat = data.boat;
      if (!boat?.id) throw new Error('Unexpected yacht response');
      const slots = data.bookable_slots?.slots;
      const stay = data.stay_price;
      const quote = start && stay?.check_in === start && stay?.check_out === end
        && Number.isFinite(stay.total) && Number.isFinite(stay.due_now) ? {
          total: stay.total, dueNow: stay.due_now, atPickup: stay.paid_at_pickup,
          deposits: Array.isArray(stay.deposits) ? stay.deposits.map(({ label, amount, charged_now }) =>
            ({ label, amount, chargedNow: charged_now })) : [],
        } : null;
      const availability = Array.isArray(slots) ? slots.map((slot) => ({
        checkin: slot.checkin,
        checkout: slot.checkout,
        product: slot.product,
        total: Number.isFinite(slot.total) ? slot.total : null,
      })) : null;
      res.setHeader('Cache-Control', start ? 'no-store' : 'public, max-age=0, s-maxage=300, stale-while-revalidate=300');
      return res.status(200).json({
        title: boat.title,
        description: boat.description,
        manufacturer: boat.manufacturer,
        type: boat.boat_type,
        location: [boat.location?.name, boat.location?.city, boat.location?.country].filter(Boolean).join(', '),
        capacity: boat.capacity,
        cabins: boat.cabins,
        year: boat.year,
        length: boat.length_ft,
        schedule: boat.charter_schedule,
        availability,
        quote,
        currency: data.pricing?.currency,
        url: trustedUrl(data.url, bookingHosts),
      });
    }
    if (!Array.isArray(data.boats)) throw new Error('Unexpected inventory response');
    const boats = data.boats.map((boat) => ({
      id: boatId.test(boat.id) ? boat.id : null,
      title: boat.card?.title || boat.title,
      type: boat.card?.type,
      location: boat.card?.location || boat.location,
      capacity: boat.capacity,
      cabins: boat.cabins,
      price: boat.price_summary,
      image: trustedUrl(boat.hero_image_url, ['media.charter.boats']),
      url: trustedUrl(boat.url, bookingHosts),
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
