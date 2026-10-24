// Before the first season (the launch, Task 275; docs/live.md §6): anyone who comes early sees when it starts and how
// long until, on the loading card, and the channel starts by itself at that moment. Pure but for showPreseason.

/**
 * The card's words.
 * @param {number} start  Season 1's start (epoch ms). @param {number} now @param {string} timeZone  The league's (IANA).
 * @returns {{ title: string, when: string, countdown: string }}
 */
export function preseasonText(start, now, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(start).map((p) => [p.type, p.value]));
  const city = (timeZone.split('/').at(-1) ?? timeZone).replace(/_/g, ' ');
  const when = `${parts.weekday} ${parts.day} ${parts.month} · ${parts.hour}:${parts.minute} ${city} TIME`.toUpperCase();
  const left = Math.max(0, Math.ceil((start - now) / 1000));
  const days = Math.floor(left / 86_400);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const clock = `${pad(Math.floor((left % 86_400) / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`;
  const countdown = `IN ${days > 0 ? `${days} DAY${days === 1 ? '' : 'S'} ` : ''}${clock}`;
  return { title: 'SEASON 1 KICKS OFF', when, countdown };
}

/**
 * Show the card on the loading screen until season 1 starts, then resolve (the channel carries on loading).
 * @param {HTMLElement} card  #loading. @param {number} start @param {() => number} now @param {string} timeZone
 * @returns {Promise<void>}
 */
export function showPreseason(card, start, now, timeZone) {
  const msg = /** @type {HTMLElement} */ (card.querySelector('.msg'));
  const when = card.ownerDocument.createElement('div');
  when.className = 'when';
  const countdown = card.ownerDocument.createElement('div');
  countdown.className = 'when';
  card.append(when, countdown);
  card.hidden = false;
  return new Promise((resolve) => {
    const tick = () => {
      const t = now();
      if (t >= start) {
        when.remove();
        countdown.remove();
        msg.textContent = 'TUNING IN…';
        resolve();
        return;
      }
      const text = preseasonText(start, t, timeZone);
      msg.textContent = text.title;
      when.textContent = text.when;
      countdown.textContent = text.countdown;
      setTimeout(tick, 1000 - (t % 1000));
    };
    tick();
  });
}
