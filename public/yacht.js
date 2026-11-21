const params = new URLSearchParams(location.search);
const status = document.querySelector('#yacht-status');
const yacht = document.querySelector('#yacht');
const filters = new URLSearchParams();
for (const field of ['location', 'type', 'guests']) {
  if (params.has(field)) filters.set(field, params.get(field));
}
if (filters.size) document.querySelector('#back-to-results').href = `/charters.html?${filters}`;

async function loadYacht() {
  const id = params.get('id');
  if (!id) {
    status.textContent = 'Choose a yacht from the search results to view its details.';
    return;
  }

  try {
    const response = await fetch(`/api/charters?${new URLSearchParams({ id })}`);
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
      const booking = document.querySelector('#yacht-booking');
      booking.href = boat.url;
      booking.hidden = false;
    }

    status.textContent = '';
    yacht.hidden = false;
  } catch (error) {
    status.textContent = error instanceof SyntaxError || error instanceof TypeError
      ? 'Yacht details are temporarily unavailable. Please try again.'
      : error.message;
  }
}

loadYacht();
