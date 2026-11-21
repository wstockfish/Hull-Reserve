const checkIn = document.querySelector('[name=date_from]');
const checkOut = document.querySelector('[name=date_to]');
function syncDates() {
  checkOut.required = Boolean(checkIn.value);
  checkIn.required = Boolean(checkOut.value);
  if (checkIn.value) {
    const next = new Date(checkIn.valueAsNumber + 86400000);
    checkOut.min = next.toISOString().slice(0, 10);
  } else {
    checkOut.removeAttribute('min');
  }
}
checkIn.addEventListener('input', syncDates);
checkOut.addEventListener('input', syncDates);
window.addEventListener('pageshow', syncDates);
window.addEventListener('popstate', () => queueMicrotask(syncDates));
