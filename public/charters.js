const form = document.querySelector('#charter-search');
const status = document.querySelector('#charter-status');
const results = document.querySelector('#charter-results');
const source = document.querySelector('#charter-source');
const sourceDefault = source.href;
const count = new Intl.NumberFormat();
let activeSearch;

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value) node.textContent = value;
  if (className) node.className = className;
  return node;
}

function card(boat) {
  const article = element('article', '', 'charter-card');
  let content = article;
  if (boat.id) {
    const params = new URLSearchParams(location.search);
    params.set('id', boat.id);
    if (boat.image) params.set('photo', boat.image);
    content = element('a', '', 'charter-card-link');
    content.href = `/yacht.html?${params}`;
    article.append(content);
  }
  if (boat.image) {
    const image = element('img');
    image.src = boat.image;
    image.alt = '';
    image.loading = 'lazy';
    content.append(image);
  }

  const body = element('div', '', 'charter-card-body');
  const facts = [boat.type];
  if (Number.isFinite(boat.capacity)) facts.push(`${boat.capacity} guests`);
  if (Number.isFinite(boat.cabins)) facts.push(`${boat.cabins} ${boat.cabins === 1 ? 'cabin' : 'cabins'}`);
  body.append(element('h2', boat.title || 'Charter yacht'));
  if (boat.location) body.append(element('p', boat.location));
  if (facts.some(Boolean)) body.append(element('p', facts.filter(Boolean).join(' · ')));
  if (boat.price) body.append(element('p', boat.price, 'charter-price'));
  if (boat.id) {
    body.append(element('span', 'View yacht details', 'charter-card-action'));
  } else if (boat.url) {
    const link = element('a', 'View on Charter Boats');
    link.href = boat.url;
    body.append(link);
  }
  content.append(body);
  return article;
}

async function search(query) {
  activeSearch?.abort();
  const controller = new AbortController();
  activeSearch = controller;
  results.replaceChildren();
  results.setAttribute('aria-busy', 'true');
  status.textContent = 'Searching for yachts…';
  source.href = sourceDefault;

  try {
    const response = await fetch(`/api/charters?${query}`, { signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The search is temporarily unavailable.');
    if (controller.signal.aborted) return;

    source.href = data.searchUrl || sourceDefault;
    if (data.boats.length) {
      const total = Math.max(data.total, data.boats.length);
      status.textContent = total > data.boats.length
        ? `Showing ${count.format(data.boats.length)} of ${count.format(total)} matches. Narrow your search to see different yachts.`
        : `${count.format(total)} ${total === 1 ? 'yacht' : 'yachts'} found.`;
      results.replaceChildren(...data.boats.map(card));
    } else {
      status.textContent = data.unresolved
        ? 'Destination not recognized. Try a nearby marina, city, or country.'
        : 'No yachts match these filters. Try a different destination or yacht type.';
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      status.textContent = error instanceof SyntaxError || error instanceof TypeError
        ? 'The search is temporarily unavailable. Try again or browse on Charter Boats.'
        : error.message;
    }
  } finally {
    if (activeSearch === controller) results.removeAttribute('aria-busy');
  }
}

function readAddress() {
  const query = new URLSearchParams(location.search);
  for (const name of ['location', 'type', 'guests']) {
    form.elements.namedItem(name).value = query.get(name) || '';
  }
  search(new URLSearchParams([...new FormData(form)].filter(([, value]) => value.trim())));
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = new URLSearchParams([...new FormData(form)]
    .map(([name, value]) => [name, value.trim()])
    .filter(([, value]) => value));
  const next = query.size ? `${location.pathname}?${query}` : location.pathname;
  if (next !== `${location.pathname}${location.search}`) history.pushState(null, '', next);
  search(query);
});
window.addEventListener('popstate', readAddress);
readAddress();
