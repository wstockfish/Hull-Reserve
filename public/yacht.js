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
      const stay = document.createElement('button');
      stay.type = 'button';
      stay.className = 'slot-dates';
      stay.addEventListener('click', () => {
        const form = document.querySelector('#stay-form');
        form.elements.date_from.value = start.toISOString().slice(0, 10);
        form.elements.date_to.value = end.toISOString().slice(0, 10);
        form.dispatchEvent(new Event('input'));
        form.querySelector('button').focus();
        form.requestSubmit();
      });
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

function enableDateChecks(id, initialBoat) {
  const form = document.querySelector('#stay-form');
  const arrival = form.elements.date_from;
  const departure = form.elements.date_to;
  const result = document.querySelector('#stay-result');
  const booking = document.querySelector('#stay-book');
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  arrival.min = today.toISOString().slice(0, 10);
  arrival.value = filters.get('date_from') || '';
  departure.value = filters.get('date_to') || '';
  let pending;

  function reset() {
    pending?.abort();
    result.textContent = '';
    booking.hidden = true;
    booking.removeAttribute('href');
    const firstDay = arrival.value >= arrival.min ? arrival.value : arrival.min;
    const nextDay = new Date(firstDay + 'T00:00:00Z');
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    departure.min = nextDay.toISOString().slice(0, 10);
  }

  function showStay(boat) {
    const quote = boat.quote;
    if (!quote) {
      result.textContent = 'Charter Boats could not confirm this stay. Try another check-in or checkout date.';
      return;
    }
    const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: boat.currency || 'EUR' });
    const amounts = [money.format(quote.total) + ' total', money.format(quote.dueNow) + ' due now'];
    if (Number.isFinite(quote.atPickup)) amounts.push(money.format(quote.atPickup) + ' at pickup');
    result.textContent = 'Charter Boats quoted ' + amounts.join(', ') + ' for these dates.';
    for (const deposit of quote.deposits) {
      if (Number.isFinite(deposit.amount)) result.append(' ' + (deposit.label || 'Refundable deposit') + ' of ' +
        money.format(deposit.amount) + (deposit.chargedNow ? ' charged at booking.' : ' due at pickup.'));
    }
    if (boat.url) {
      booking.href = boat.url;
      booking.hidden = false;
    }
  }

  form.addEventListener('input', reset);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    reset();
    const request = new AbortController();
    pending = request;
    const query = new URLSearchParams({ id, date_from: arrival.value, date_to: departure.value });
    if (filters.has('guests')) query.set('guests', filters.get('guests'));
    result.textContent = 'Checking these dates with Charter Boats…';
    try {
      const response = await fetch('/api/charters?' + query, { signal: request.signal, cache: 'no-store' });
      const boat = await response.json();
      if (!response.ok) throw new Error();
      if (!request.signal.aborted) showStay(boat);
    } catch {
      if (!request.signal.aborted) result.textContent = 'The availability check could not be completed. Please try again.';
    }
  });
  reset();
  if (arrival.value && departure.value) showStay(initialBoat);
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
      const photos = document.querySelector('#provider-photos');
      photos.href = boat.url;
      photos.hidden = false;
    } else {
      document.querySelector('#booking-status').textContent = 'A booking link is currently unavailable for this yacht.';
    }
    enableDateChecks(id, boat);
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
