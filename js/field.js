// The little SVG football field on each card.

// Field is 120 units wide: away end zone at 0–10, home end zone at 110–120.
export function field(g) {
  const W = 120, H = 30;
  let s = `<svg class="field" viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i < 10; i++) s += `<rect x="${10 + i * 10}" y="0" width="10" height="${H}" fill="var(--grass${i % 2 ? "-alt" : ""})"/>`;
  s += `<rect x="0" y="0" width="10" height="${H}" fill="${g.away.color}"/>`;
  s += `<rect x="110" y="0" width="10" height="${H}" fill="${g.home.color}"/>`;
  s += endZoneText(5, g.away.abbr) + endZoneText(115, g.home.abbr);
  for (let yd = 10; yd <= 90; yd += 10) {
    s += `<line x1="${10 + yd}" y1="0" x2="${10 + yd}" y2="${H}" stroke="#fff" stroke-opacity=".35" stroke-width=".3"/>`;
    s += `<text x="${10 + yd}" y="${H - 2}" font-size="3" fill="#fff" fill-opacity=".6" text-anchor="middle">${yd <= 50 ? yd : 100 - yd}</text>`;
  }

  if (g.state === "in" && g.yardLine != null) {
    const ball = 10 + (100 - g.yardLine);  // yards from away goal, in field coords
    if (g.possession && g.distance > 0) {
      const dir = g.possession === g.home.id ? -1 : 1;  // home attacks left, away attacks right
      const ltg = Math.min(110, Math.max(10, ball + dir * g.distance));
      s += `<rect x="${Math.min(ball, ltg)}" y="0" width="${Math.abs(ltg - ball)}" height="${H}" fill="var(--ltg)" fill-opacity=".12"/>`;
      s += `<line x1="${ltg}" y1="0" x2="${ltg}" y2="${H}" stroke="var(--ltg)" stroke-width=".8"/>`;
    }
    s += `<line x1="${ball}" y1="0" x2="${ball}" y2="${H}" stroke="var(--los)" stroke-width=".8"/>`;
    s += football(ball, H / 2);
    if (g.possession) {
      const dir = g.possession === g.home.id ? -1 : 1;
      const tip = ball + dir * 6, base = ball + dir * 3.5;
      s += `<polygon points="${tip},${H / 2} ${base},${H / 2 - 1.8} ${base},${H / 2 + 1.8}" fill="#fff"/>`;
    }
  }
  return s + "</svg>";
}

// A football centered on (x, y): pointed tips, a dark outline and white laces. Field units, so about 5 yards long.
function football(x, y) {
  return `<g class="ball" data-x="${x}" transform="translate(${x} ${y})">
    <path d="M-2.6 0 C-1.4 -1.8 1.4 -1.8 2.6 0 C1.4 1.8 -1.4 1.8 -2.6 0 Z" fill="#8b4513" stroke="#3b1d08" stroke-width=".25" stroke-linejoin="round"/>
    <path d="M-.9 0 H.9 M-.55 -.4 V.4 M0 -.4 V.4 M.55 -.4 V.4" stroke="#fff" stroke-width=".22" stroke-linecap="round"/>
  </g>`;
}

function endZoneText(x, text) {
  return `<text x="${x}" y="15" font-size="3.4" font-weight="700" fill="#fff" text-anchor="middle"
    dominant-baseline="middle" transform="rotate(${x < 60 ? -90 : 90} ${x} 15)">${text}</text>`;
}
