// Fills the page from content/site-content.js
(function () {
  const D = window.DIG;
  if (!D) return;

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const link = (text, url) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text));
  const pending = (label) => `<span class="pending">${esc(label)}</span>`;

  const students = D.students || [];
  const board = D.board || [];
  const stats = D.stats || {};

  // Headline figures
  const money = (n) => (n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + " million" : "$" + Math.round(n / 1000) + "K");
  const P = D.portfolio || {};
  const pct = (n, signed) => (n == null ? "" : (signed && n > 0 ? "+" : "") + n.toFixed(1) + "%");
  const oneYear = (P.returns || []).find((r) => r.period === "1 year");
  const values = {
    oneYear: oneYear ? pct(oneYear.fund, true) : "",
    oneYearBench: oneYear ? `${P.benchmark} ${pct(oneYear.bench, true)}` : "",
    benchmark: P.benchmark || "",
    aum: stats.aum ? money(stats.aum) : "",
    students: stats.memberCount ?? students.length,
    board: board.length,
    founded: stats.founded,
    asOf: P.asOf || stats.asOf,
    sectorTeams: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][stats.sectorTeams] || stats.sectorTeams,
  };
  document.querySelectorAll("[data-stat]").forEach((el) => (el.textContent = values[el.dataset.stat] ?? ""));
  const term = document.querySelector("[data-term]");
  if (term && stats.term) term.textContent = stats.term;

  // Members, sorted by last name. Every member gets a headshot frame; it stays blank until a photo is added.
  const lastName = (n) => n.trim().split(/\s+/).slice(-1)[0];
  const members = [...students].sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)));
  const personItem = (p) => {
    const photo = `<div class="photo">${p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">` : ""}</div>`;
    const sub = p.year ? "Class of " + p.year.replace("'", "20") : "";
    return `<li>${photo}<span class="name">${link(p.name, p.linkedin)}</span>${sub ? `<span class="detail">${esc(sub)}</span>` : ""}</li>`;
  };
  $("#roster").innerHTML = `<ul class="people">${members.map(personItem).join("")}</ul>`;

  // Advisory board: headshot, role, education, and an expandable biography
  $("#boardList").innerHTML = board.map((m) => {
    const photo = `<div class="photo">${m.photo ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}" loading="lazy">` : ""}</div>`;
    const bio = (m.bio || []).length
      ? `<details class="bio"><summary>Biography</summary>${m.bio.map((para) => `<p>${esc(para)}</p>`).join("")}</details>`
      : "";
    return `<li>${photo}<span class="name">${link(m.name, m.linkedin)}</span><span class="role">${esc(m.title)}</span><span class="firm">${esc(m.company)}</span><span class="edu">${esc(m.education)}</span>${bio}</li>`;
  }).join("");
  const f = D.faculty;
  if (f) {
    const photo = f.photo ? `<img class="faculty-photo" src="${esc(f.photo)}" alt="${esc(f.name)}">` : "";
    const bio = (f.bio || []).map((para) => `<p>${esc(para)}</p>`).join("");
    $("#faculty").innerHTML = `${photo}<div class="faculty-head"><h3>${esc(f.title)}</h3><p class="name">${link(f.name, f.link)}</p><p class="faculty-sub">${esc(f.subtitle || "")}${f.education ? `<br><span class="note">${esc(f.education)}</span>` : ""}</p></div>${bio ? `<div class="faculty-bio">${bio}</div>` : ""}`;
  }

  // Contact links
  if (D.contactEmail) {
    document.querySelectorAll("[data-contact]").forEach((a) => {
      const subject = a.dataset.contact;
      a.href = "mailto:" + D.contactEmail + (subject ? "?subject=" + encodeURIComponent(subject) : "");
      if (a.dataset.showEmail !== undefined) a.textContent = D.contactEmail;
    });
  }

  // Returns and risk
  $("#returnsTable tbody").innerHTML = (P.returns || []).map((r) =>
    `<tr><td>${esc(r.period)}</td><td class="num strong">${pct(r.fund, true)}</td><td class="num">${pct(r.bench, true)}</td></tr>`
  ).join("");
  $("#riskList").innerHTML = (P.risk || []).map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join("");

  // Sector allocation
  const maxSector = Math.max(...(P.sectors || []).map((x) => x.pct), 1);
  $("#sectorBars").innerHTML = (P.sectors || []).map((x) =>
    `<li><span class="bar-label">${esc(x.name)}</span><span class="bar-track"><span class="bar-fill" style="width:${(x.pct / maxSector) * 100}%"></span></span><span class="bar-value">${x.pct.toFixed(1)}%</span></li>`
  ).join("");

  // Top holdings
  $("#holdings tbody").innerHTML = (P.holdings || []).map((h) =>
    `<tr><td class="ticker">${esc(h.ticker)}</td><td>${esc(h.name)}</td><td class="muted-cell">${esc(h.sector)}</td><td class="num">${h.pct.toFixed(1)}%</td></tr>`
  ).join("");

  // Growth of $10,000 chart (plain SVG)
  function drawGrowth(el, g) {
    if (!el || !g || !g.fund) return;
    const narrow = el.clientWidth < 500;
    const W = 720, H = narrow ? 420 : 300, m = narrow ? { t: 16, r: 110, b: 40, l: 92 } : { t: 16, r: 74, b: 28, l: 56 };
    const all = g.fund.concat(g.bench || []);
    const lo = Math.floor(Math.min(...all) / 500) * 500, hi = Math.ceil(Math.max(...all) / 500) * 500;
    const x = (i) => m.l + (i / (g.fund.length - 1)) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
    const path = (arr) => arr.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
    const money = (v) => "$" + v.toLocaleString("en-US");
    let grid = "";
    for (let v = lo; v <= hi; v += 500) {
      grid += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" class="grid${v === 10000 ? " base" : ""}"/><text x="${m.l - 8}" y="${y(v) + 4}" class="axis" text-anchor="end">${money(v)}</text>`;
    }
    let months = "", seen = new Set();
    g.dates.forEach((d, i) => {
      const dt = new Date(d + "T00:00:00"), key = dt.getFullYear() + "-" + dt.getMonth();
      if (seen.has(key) || dt.getDate() > 10 || i === 0) { seen.add(key); return; }
      seen.add(key);
      if (dt.getMonth() % 2) return;
      months += `<text x="${x(i)}" y="${H - (narrow ? 6 : 8)}" class="axis" text-anchor="middle">${dt.toLocaleString("en-US", { month: "short" })}${dt.getMonth() === 0 ? " " + String(dt.getFullYear()).slice(2) : ""}</text>`;
    });
    const lastF = g.fund[g.fund.length - 1], lastB = g.bench ? g.bench[g.bench.length - 1] : null;
    let fy = y(lastF), by = lastB != null ? y(lastB) : 0;
    const gap = narrow ? 24 : 14;
    if (lastB != null && Math.abs(fy - by) < gap) { const h = (gap - Math.abs(fy - by)) / 2; if (fy < by) { fy -= h; by += h; } else { fy += h; by -= h; } }
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Growth of $10,000: DIG ${money(lastF)}${lastB ? `, ${P.benchmark} ${money(lastB)}` : ""}">
      ${grid}${months}
      ${g.bench ? `<path d="${path(g.bench)}" class="line-bench"/>` : ""}
      <path d="${path(g.fund)}" class="line-fund"/>
      <circle cx="${x(g.fund.length - 1)}" cy="${y(lastF)}" r="3.5" class="dot-fund"/>
      <text x="${W - m.r + 8}" y="${fy + 4}" class="end end-fund">${money(lastF)}</text>
      ${lastB != null ? `<text x="${W - m.r + 8}" y="${by + 4}" class="end end-bench">${money(lastB)}</text>` : ""}
    </svg>`;
  }
  drawGrowth($("#growthChart"), P.growth);

  // Factsheet download
  if (D.factsheet && D.factsheet.file) {
    const wrap = document.querySelector("[data-factsheet-wrap]");
    document.querySelector("[data-factsheet]").href = D.factsheet.file;
    document.querySelector("[data-factsheet-date]").textContent = D.factsheet.asOf || "";
    if (wrap) wrap.hidden = false;
  }

  // IPS link
  document.querySelectorAll("[data-ips]").forEach((a) => {
    const holder = a.closest("p") || a;
    holder.hidden = true;
    if (!D.ipsLink) return;
    a.href = D.ipsLink; a.target = "_blank"; a.rel = "noopener";
    a.textContent = "Read the full statement (PDF)";
    fetch(D.ipsLink, { method: "HEAD" }).then((r) => { if (r.ok) holder.hidden = false; }).catch(() => {});
  });

  // Alumni, grouped by class year (newest first)
  const alumni = D.alumni || [];
  const years = [...new Set(alumni.map((a) => a.classYear))].sort((a, b) => b - a);
  $("#alumniList").innerHTML = years.map((y) => {
    const list = alumni.filter((a) => a.classYear === y).sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)));
    return `<div class="alumni-year"><h3>Class of ${esc(y)}</h3><ul class="alumni">${list.map((a) => {
      const where = [a.role, a.firm].filter(Boolean).join(", ");
      return `<li><span class="name">${link(a.name, a.linkedin)}</span>${where ? `<span class="detail">${esc(where)}</span>` : ""}</li>`;
    }).join("")}</ul></div>`;
  }).join("");

  // Joining
  $("#joinSteps").innerHTML = (D.join || []).map((j) =>
    `<li><strong>${esc(j.what)}.</strong> ${esc(j.detail)}${j.when ? ` <span class="note">(${esc(j.when)})</span>` : ""}</li>`
  ).join("");

  // Mobile menu
  const header = $(".site-header"), btn = $(".menu-button");
  btn?.addEventListener("click", () => btn.setAttribute("aria-expanded", header.classList.toggle("open")));
  document.querySelectorAll(".site-nav a").forEach((a) => a.addEventListener("click", () => {
    header.classList.remove("open");
    btn?.setAttribute("aria-expanded", "false");
  }));
})();
