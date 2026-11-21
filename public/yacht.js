const params = new URLSearchParams(location.search);
const status = document.querySelector('#yacht-status');
const yacht = document.querySelector('#yacht');
const filters = new URLSearchParams();
for (const field of ['location', 'type', 'guests', 'date_from', 'date_to']) {
  if (params.has(field)) filters.set(field, params.get(field));
}
if (filters.size) document.querySelector('#back-to-results').href = `/charters.html?${filters}`;

function renderAvailability(slots, currency) {
  const filter = document.querySelector('#availability-filter');
  const month = document.querySelector('#availability-month');
  const message = document.querySelector('#availability-status');
  const list = document.querySelector('#availability-slots');
  if (!Array.isArray(slots)) {
    message.textContent = 'Availability is temporarily unavailable for this yacht.';
    return;
  }

  const parseDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
    ? new Date(`${value.slice(0, 10)}T00:00:00Z`)
    : new Date(NaN);
  const dates = slots.map((slot) => ({ ...slot, start: parseDate(slot.checkin), end: parseDate(slot.checkout) }))
    .filter(({ start, end }) => Number.isFinite(+start) && Number.isFinite(+end));
  if (!dates.length) {
    message.textContent = 'There are no upcoming dates listed for this yacht.';
    return;
  }

  const format = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
  const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const monthly = new Map();
  for (const slot of dates) {
    const key = slot.checkin.slice(0, 7);
    if (!monthly.has(key)) monthly.set(key, []);
    monthly.get(key).push(slot);
  }
  const money = ['EUR', 'USD'].includes(currency)
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency })
    : null;

  for (const [key, entries] of monthly) month.add(new Option(monthFormat.format(entries[0].start), key));
  filter.hidden = false;

  function showMonth() {
    const entries = monthly.get(month.value) || [];
    list.replaceChildren(...entries.map(({ start, end, product, total }) => {
      const row = document.createElement('li');
      const stay = document.createElement('span');
      stay.textContent = format.formatRange(start, end);
      if (product) stay.append(` · ${product}`);
      const price = document.createElement('strong');
      price.textContent = money && Number.isFinite(total) ? `${money.format(total)} total` : 'Price unavailable';
      row.append(stay, price);
      return row;
    }));
  }

  month.addEventListener('change', showMonth);
  showMonth();
}

async function loadYacht() {
  const id = params.get('id');
  if (!id) {
    status.textContent = 'Choose a yacht from the search results to view its details.';
    return;
  }

  try {
    const response = await fetch(`/api/charters?${new URLSearchParams([...filters, ["id", id]])}`);
    const boat = await response.json();
    if (!response.ok) throw new Error(boat.error || 'Yacht details are temporarily unavailable.');

    const title = boat.title || 'Charter yacht';
    document.title = `${title} | Hull Reserve`;
    document.querySelector('#yacht-name').textContent = title;
    document.querySelector('#yacht-location').textContent = boat.location || '';
    document.querySelector('#yacht-description').textContent = boat.description || '';
    document.querySelector('#yacht-schedule').textContent = boat.schedule || '';

    const details = [
      ['Type', boat.type], ['Builder', boat.manufacturer], ['Guests', boat.capacity],
      ['Cabins', boat.cabins], ['Year', boat.year], ['Length', boat.length ? `${boat.length} ft` : null],
    ];
    const facts = document.querySelector('#yacht-facts');
    for (const [label, value] of details) {
      if (value == null || value === '') continue;
      const item = document.createElement('div');
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      item.append(term, description);
      facts.append(item);
    }

    const photoUrl = URL.canParse(params.get('photo')) ? new URL(params.get('photo')) : null;
    if (photoUrl?.origin === 'https://media.charter.boats' && photoUrl.pathname.startsWith(`/boats/${id}/`)) {
      const photo = document.querySelector('#yacht-photo');
      photo.src = photoUrl.href;
      photo.alt = title;
      photo.hidden = false;
    }
    if (boat.url) {
      const booking = document.querySelector('#booking');
      booking.href = boat.url;
      booking.hidden = false;
    } else {
      document.querySelector('#booking-status').textContent = 'A booking link is currently unavailable for this yacht.';
    }
    renderAvailability(boat.availability, boat.currency);

    status.textContent = '';
    yacht.hidden = false;
  } catch (error) {
    status.textContent = error instanceof SyntaxError || error instanceof TypeError
      ? 'Yacht details are temporarily unavailable. Please try again.'
      : error.message;
  }
}

loadYacht();
