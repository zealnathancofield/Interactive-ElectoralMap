/* Electoral College Explorer — 1948–2024 results with county-level what-if (2000–2024). */
const STFIPS = {AL:"01",AK:"02",AZ:"04",AR:"05",CA:"06",CO:"08",CT:"09",DE:"10",DC:"11",FL:"12",GA:"13",HI:"15",ID:"16",IL:"17",IN:"18",IA:"19",KS:"20",KY:"21",LA:"22",ME:"23",MD:"24",MA:"25",MI:"26",MN:"27",MS:"28",MO:"29",MT:"30",NE:"31",NV:"32",NH:"33",NJ:"34",NM:"35",NY:"36",NC:"37",ND:"38",OH:"39",OK:"40",OR:"41",PA:"42",RI:"44",SC:"45",SD:"46",TN:"47",TX:"48",UT:"49",VT:"50",VA:"51",WA:"53",WV:"54",WI:"55",WY:"56"};
const FIPS2ST = Object.fromEntries(Object.entries(STFIPS).map(([k, v]) => [v, k]));
const NAMES = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
  "ME-1":"Maine 1st District","ME-2":"Maine 2nd District","NE-1":"Nebraska 1st District","NE-2":"Nebraska 2nd District","NE-3":"Nebraska 3rd District"};
const SMALL = ["NH","VT","MA","RI","CT","NJ","DE","MD","DC"];
const PAL = { D: ["var(--d0)","var(--d1)","var(--d2)"], R: ["var(--r0)","var(--r1)","var(--r2)"], O: ["var(--o0)","var(--o1)","var(--o2)"] };
const PARTY = { D: "Democratic", R: "Republican" };

let DB, YEAR, MODE = "results", CLICK = "open", VIEW = null /* state code when zoomed */, SEL = null /* selected county fips */;
let statesTopo, stateFeats, countyFeats, ctFeats;
const countyData = {};      // year -> {ST: {c: {fips: [D,R,T]}, res: [D,R,T]}}
const WI = {};              // year -> what-if edits
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString("en-US");
const pct = (n, t) => t ? (n / t * 100).toFixed(1) + "%" : "–";
const tip = $("tip");

/* ---------- data helpers ---------- */
const cur = () => DB.e[YEAR];
const U = k => { const a = cur().units[k]; return a && { ev: a[0], D: a[1], R: a[2], O: a[3], T: a[4], eD: a[5], eR: a[6], eO: a[7] }; };
const wi = () => WI[YEAR] ||= { ovr: {}, swing: {}, cshift: {}, cflip: {} };
const hasCounties = st => cur().counties && st !== "AK";
const lastName = n => n ? n.replace(/\s*\(.*\)/, "").split(" ").pop() : "Other";
const candName = p => p === "O" ? (cur().O || "Other") : cur()[p];
const districtsOf = st => Object.keys(cur().units).filter(k => k.startsWith(st + "-"));
const stateEV = st => U(st) ? U(st).ev + districtsOf(st).reduce((s, k) => s + U(k).ev, 0) : 0;

function shift(D, R, s) {           // move the D–R margin by s points (positive = toward D), keeping D+R fixed
  if (!s) return [D, R];
  const nD = Math.min(D + R, Math.max(0, D + s / 100 * (D + R) / 2));
  return [nD, D + R - nD];
}
function countyVotes(f, v, st) {
  const w = wi(); let D = v[0], R = v[1];
  if (w.cflip[f]) [D, R] = [R, D];
  return shift(D, R, (w.swing[st] || 0) + (w.cshift[f] || 0)).concat(v[2]);
}
function stateHasCountyEdits(st) {
  const w = wi(), p = STFIPS[st];
  return Object.keys(w.cshift).some(f => f.startsWith(p) && w.cshift[f]) || Object.keys(w.cflip).some(f => f.startsWith(p) && w.cflip[f]);
}
function votes(k) {                 // current (possibly adjusted) votes for a unit
  const u = U(k);
  if (MODE === "results" || k.includes("-")) return { D: u.D, R: u.R, O: u.O, T: u.T };
  const sw = wi().swing[k] || 0, cd = countyData[YEAR]?.[k];
  if (!cd || !stateHasCountyEdits(k)) { const [D, R] = shift(u.D, u.R, sw); return { D, R, O: u.O, T: u.T }; }
  let D = 0, R = 0;
  for (const [f, v] of Object.entries(cd.c)) { const [d, r] = countyVotes(f, v, k); D += d; R += r; }
  const [rd, rr] = cd.res, rs = sw / 100 * (rd + rr) / 2;   // remainder shifts linearly with the statewide swing
  return { D: D + rd + rs, R: R + rr - rs, O: u.O, T: u.T };
}
function leader(v) { return v.O > v.D && v.O > v.R ? "O" : v.D >= v.R ? "D" : "R"; }
function margin(v) {
  const s = [v.D, v.R, v.O].sort((a, b) => b - a);
  return v.T ? (s[0] - s[1]) / v.T * 100 : 0;
}
function winner(k) {                // who gets this unit's electors (what-if) or who led the vote (results)
  const u = U(k);
  if (MODE === "whatif" && wi().ovr[k]) return wi().ovr[k];
  if (k.includes("-")) return u.eD ? "D" : u.eR ? "R" : u.eO ? "O" : leader(u);
  return leader(votes(k));
}
function fill(k) {
  if (!U(k)) return "var(--na)";
  const w = winner(k);
  if (w === "T") return "var(--toss)";
  if (MODE === "whatif" && wi().ovr[k]) return PAL[w][0];
  const m = margin(votes(k));
  return PAL[w][m >= 15 ? 0 : m >= 5 ? 1 : 2];
}
const textOn = bg => /2\)|toss|na\)/.test(bg) ? "#1c1c1e" : "#fff";   // dark text on pale fills
function countyFill(f, st) {
  const v = countyData[YEAR]?.[st]?.c[f];
  if (!v) return "var(--na)";
  const [D, R, T] = MODE === "whatif" ? countyVotes(f, v, st) : v;
  const m = Math.abs(D - R) / (T || 1) * 100, w = D >= R ? "D" : "R";
  return PAL[w][m >= 30 ? 0 : m >= 10 ? 1 : 2];
}
function totals() {
  const t = { D: 0, R: 0, O: 0, T: 0 }, pv = { D: 0, R: 0, O: 0, T: 0 };
  for (const k in cur().units) {
    const u = U(k);
    if (MODE === "results") { t.D += u.eD; t.R += u.eR; t.O += u.eO; }
    else t[winner(k)] += u.ev;
    if (!k.includes("-")) { const v = votes(k); for (const p in pv) pv[p] += v[p]; }
  }
  return { t, pv };
}

/* ---------- loading ---------- */
async function loadCounties(year) {
  if (!countyFeats) {
    const [topo, ct] = await Promise.all([d3.json("data/counties-albers-10m.json"), d3.json("data/ct-regions-2024.json")]);
    countyFeats = topojson.feature(topo, topo.objects.counties).features;
    ctFeats = ct.features;
  }
  if (DB.e[year].counties && !countyData[year]) countyData[year] = await d3.json(`data/counties/${year}.json`);
}

/* ---------- national map ---------- */
const path = d3.geoPath();
let stPaths, stLabels;
function drawNation() {
  const svg = d3.select("#usmap");
  stPaths = svg.append("g").selectAll("path").data(stateFeats).join("path")
    .attr("class", "st").attr("d", path).attr("tabindex", 0)
    .on("mousemove", (e, f) => showTip(e, stateTip(f.st)))
    .on("mouseleave", hideTip)
    .on("click", (e, f) => clickState(f.st))
    .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); clickState(f.st); } });
  const nudge = { FL: [14, 0], LA: [-10, 0], MI: [10, 16], KY: [0, 3], HI: [4, 6], ID: [0, 12] };
  stLabels = svg.append("g").selectAll("text")
    .data(stateFeats.filter(f => !SMALL.includes(f.st) && path.area(f) > 900)).join("text").attr("class", "lbl")
    .attr("transform", f => { const [x, y] = path.centroid(f), [dx, dy] = nudge[f.st] || [0, 0]; return `translate(${x + dx},${y + dy})`; });
  stLabels.append("tspan").attr("x", 0).text(f => f.st);
  stLabels.append("tspan").attr("class", "n").attr("x", 0).attr("dy", "1.1em");
}
function stateTip(st) {
  const u = U(st);
  if (!u) return `<b>${NAMES[st]}</b><br>${st === "DC" ? "No electoral votes until 1964 (23rd Amendment)" : "Not yet a state (admitted 1959)"}`;
  const v = votes(st);
  let h = `<b>${NAMES[st]}</b> · ${stateEV(st)} EV<br>`;
  for (const p of ["D", "R", "O"]) if (v[p] > 0 && (p !== "O" || cur().O)) h += `${lastName(candName(p))} ${pct(v[p], v.T)}<br>`;
  if (MODE === "whatif" && wi().ovr[st]) h += `<i>Set by you: ${wi().ovr[st] === "T" ? "Toss-up" : lastName(candName(wi().ovr[st]))}</i>`;
  return h;
}
function clickState(st) {
  if (!U(st)) return;
  if (MODE === "whatif" && CLICK === "flip") { cycle(st); return; }
  openState(st);
}
function cycle(k) {
  const order = cur().O && Object.values(cur().units).some(a => a[3] > 0) ? ["D", "R", "O", "T"] : ["D", "R", "T"];
  const now = winner(k);
  wi().ovr[k] = order[(order.indexOf(now) + 1) % order.length];
  render();
}

/* ---------- state / county view ---------- */
function showMap(nation) {         // SVG elements have no .hidden property, so toggle the attribute
  $("usmap").toggleAttribute("hidden", !nation); $("stmap").toggleAttribute("hidden", nation); $("maphead").hidden = nation;
}
async function openState(st) {
  VIEW = st; SEL = null;
  showMap(false);
  $("stateTitle").textContent = `${NAMES[st]} · ${YEAR}`;
  const svg = d3.select("#stmap"); svg.selectAll("*").remove();
  const outline = stateFeats.find(f => f.st === st);
  let feats = [];
  if (hasCounties(st)) {
    svg.append("text").attr("x", 10).attr("y", 20).attr("fill", "currentColor").text("Loading counties…");
    await loadCounties(YEAR);
    if (VIEW !== st) return;
    svg.selectAll("*").remove();
    feats = st === "CT" && YEAR === 2024 ? ctFeats : countyFeats.filter(f => f.id.slice(0, 2) === STFIPS[st]);
  }
  const [[x0, y0], [x1, y1]] = path.bounds(outline), pad = Math.max(x1 - x0, y1 - y0) * .04;
  svg.attr("viewBox", `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`);
  if (feats.length) {
    svg.append("g").selectAll("path").data(feats).join("path")
      .attr("class", "co").attr("d", path).attr("tabindex", 0)
      .attr("aria-label", f => f.properties.name)
      .on("mousemove", (e, f) => showTip(e, countyTip(f)))
      .on("mouseleave", hideTip)
      .on("click", (e, f) => selectCounty(f.id))
      .on("keydown", (e, f) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectCounty(f.id); } });
  } else {
    svg.append("path").datum(outline).attr("class", "st whole").attr("d", path);
  }
  svg.append("path").datum(outline).attr("class", "outline").attr("d", path);
  render();
  $("back").focus({ preventScroll: true });
}
function closeState() {
  VIEW = SEL = null; hideTip();
  showMap(true);
  render();
}
function countyName(f) {
  const n = f.properties.name;
  if (f.id.startsWith("11")) return "District of Columbia";
  if (f.id.startsWith("22")) return n + " Parish";
  if (f.id.startsWith("51") && +f.id.slice(2) >= 500) return n + " (city)";
  return /Region$/.test(n) ? n : n + (f.id.startsWith("09") && YEAR === 2024 ? " Region" : " County");
}
function countyTip(f) {
  const v = countyData[YEAR]?.[VIEW]?.c[f.id];
  if (!v) return `<b>${countyName(f)}</b><br>No data`;
  const [D, R, T] = MODE === "whatif" ? countyVotes(f.id, v, VIEW) : v;
  return `<b>${countyName(f)}</b><br>${lastName(cur().D)} ${pct(D, T)} · ${fmt(D)}<br>${lastName(cur().R)} ${pct(R, T)} · ${fmt(R)}`;
}
function selectCounty(f) { SEL = SEL === f ? null : f; render(); }

/* ---------- panel ---------- */
function resultRows(v, win) {
  const ps = ["D", "R"].concat(cur().O && v.O > 0 ? ["O"] : []);
  return `<div class="rows">` + ps.map(p => `<div class="row${p === win ? " win" : ""}"><span class="who"><i style="background:${PAL[p][0]}"></i><span>${candName(p)}</span></span>${v[p] || p === "O" ? `<span>${fmt(v[p])}</span><span class="pct">${pct(v[p], v.T)}</span>` : `<span class="muted">not on ballot</span><span></span>`}</div>`).join("") + `</div>`;
}
function slider(id, label, value, min, max) {
  const D = lastName(cur().D), R = lastName(cur().R);
  return `<div class="slider"><label for="${id}" class="muted">${label}</label>
    <input type="range" id="${id}" min="${min}" max="${max}" step="0.5" value="${value}">
    <div class="ends"><span>← ${R}</span><span class="val" id="${id}Val">${swingText(value)}</span><span>${D} →</span></div></div>`;
}
function swingText(s) { s = +s; return !s ? "No change" : `${Math.abs(s)} pts toward ${lastName(s > 0 ? cur().D : cur().R)}`; }

function panelNation() {
  const e = cur(), { t } = totals();
  let h = `<h2>${YEAR} election</h2>`;
  const win = t.D >= need() ? "D" : t.R >= need() ? "R" : null;
  if (MODE === "results") {
    const w = t.D > t.R ? "D" : "R";
    h += `<p><b style="color:${PAL[w][0]}">${e[w]}</b> (${PARTY[w]}) defeated ${e[w === "D" ? "R" : "D"]}, ${t[w]}–${t[w === "D" ? "R" : "D"]}.</p>`;
    if (e.note) h += `<div class="note">${e.note}</div>`;
    h += `<p class="muted" style="margin-top:10px">Click any state to see its results${e.counties ? " county by county" : ""}. Shading shows the margin of victory.</p>`;
    if (!e.counties) h += `<p class="muted">County maps are available for 2000–2024.</p>`;
  } else {
    h += `<p>${win ? `<b style="color:${PAL[win][0]}">${e[win]}</b> wins in your scenario.` : "No one has reached " + need() + " yet."}</p>`;
    h += `<p class="muted">${CLICK === "flip" ? "Click a state to cycle it: " + lastName(e.D) + " → " + lastName(e.R) + (e.O ? " → " + lastName(e.O) : "") + " → Toss-up." : "Click a state to adjust its vote or its counties."}</p>`;
    h += `<div class="note">What-If gives all of a state's electors to whoever wins its popular vote, so faithless electors and split slates aren't counted.</div>`;
  }
  return h;
}
function panelDistrict(k) {
  const u = U(k), w = winner(k);
  let h = `<h2>${NAMES[k]}</h2><p class="muted">1 electoral vote, awarded to the district's winner.</p>` + resultRows(u, w);
  if (MODE === "whatif") h += `<div class="btnrow"><button class="btn" data-cycle="${k}">Flip district</button></div>`;
  return h;
}
function panelState(st) {
  const u = U(st), v = votes(st), w = winner(st), w8 = wi(), ov = MODE === "whatif" && w8.ovr[st];
  let h = `<h2>${NAMES[st]}</h2><p class="muted">${stateEV(st)} electoral votes${districtsOf(st).length ? ` (${u.ev} statewide + 1 per district)` : ""}</p>`;
  h += resultRows(v, ov ? null : w);
  if (MODE === "results") {
    const ev = [["D", u.eD], ["R", u.eR], ["O", u.eO]].filter(x => x[1]);
    if (ev.length > 1 || (ev[0] && ev[0][0] !== leader(v)))
      h += `<p class="muted">Electors: ${ev.map(([p, n]) => `${n} for ${p === "O" ? "others" : lastName(cur()[p])}`).join(", ")}.</p>`;
    h += `<p>Margin: <b>${margin(v).toFixed(1)} pts</b> for ${lastName(candName(w))}</p>`;
  } else {
    const aw = leader({ D: u.D, R: u.R, O: u.O });
    h += ov ? `<p>You set this state to <b>${ov === "T" ? "Toss-up" : candName(ov)}</b>.</p>`
            : `<p>Leader: <b style="color:${PAL[w][0]}">${candName(w)}</b> by ${margin(v).toFixed(1)} pts${w !== aw ? ` <span class="muted">(actually won by ${lastName(candName(aw))})</span>` : ""}</p>`;
    h += `<h3>Whole state</h3>` + slider("swing", "Shift every county at once", w8.swing[st] || 0, -30, 30);
    h += `<div class="btnrow"><button class="btn${ov === "D" ? " on" : ""}" data-ovr="D">Give to ${lastName(cur().D)}</button><button class="btn${ov === "R" ? " on" : ""}" data-ovr="R">Give to ${lastName(cur().R)}</button><button class="btn${ov === "T" ? " on" : ""}" data-ovr="T">Toss-up</button><button class="btn" data-reset-state>Reset state</button></div>`;
  }
  for (const d of districtsOf(st)) {
    const dw = winner(d);
    h += `<p class="muted" style="margin:8px 0 0">${NAMES[d]}: <b style="color:${PAL[dw]?.[0] || "inherit"}">${dw === "T" ? "Toss-up" : lastName(candName(dw))}</b>${MODE === "whatif" ? ` <button class="btn" data-cycle="${d}" style="padding:2px 7px">flip</button>` : ""}</p>`;
  }
  if (!hasCounties(st)) {
    h += `<div class="note">${st === "AK" ? "Alaska reports results by state legislative district rather than by county, so there's no county map." : "County-level results are available for 2000–2024."}</div>`;
  } else if (SEL) {
    h += panelCounty(st, SEL);
  } else {
    h += `<h3>Counties</h3><p class="muted">${MODE === "whatif" ? "Click a county to shift or flip it." : "Hover or click a county to see its results."}</p>`;
    if (MODE === "whatif" && stateHasCountyEdits(st)) h += `<div class="btnrow"><button class="btn" data-reset-counties>Reset all counties</button></div>`;
  }
  return h;
}
function panelCounty(st, f) {
  const feat = (st === "CT" && YEAR === 2024 ? ctFeats : countyFeats).find(x => x.id === f);
  const raw = countyData[YEAR]?.[st]?.c[f];
  let h = `<h3>${feat ? countyName(feat) : "County"}</h3>`;
  if (!raw) return h + `<p class="muted">No results reported for this county.</p>`;
  const [D, R, T] = MODE === "whatif" ? countyVotes(f, raw, st) : raw;
  h += resultRows({ D, R, O: 0, T }, D >= R ? "D" : "R");
  if (MODE === "whatif") {
    const w8 = wi();
    h += `<p class="muted">Actual: ${lastName(cur().D)} ${pct(raw[0], raw[2])}, ${lastName(cur().R)} ${pct(raw[1], raw[2])}</p>`;
    h += slider("cshift", "Shift this county", w8.cshift[f] || 0, -50, 50);
    h += `<div class="btnrow"><button class="btn${w8.cflip[f] ? " on" : ""}" data-flip>${w8.cflip[f] ? "Flipped ✓" : "Flip county"}</button><button class="btn" data-reset-county>Reset county</button><button class="btn" data-deselect>Done</button></div>`;
    h += `<p class="muted" style="margin-top:6px">Flipping swaps the two candidates' vote totals, so turnout stays the same.</p>`;
  }
  return h;
}
function renderPanel() {
  const p = $("panel");
  if (document.activeElement?.type === "range" && p.contains(document.activeElement)) return updateLiveNumbers();
  p.innerHTML = VIEW ? (VIEW.includes("-") ? panelDistrict(VIEW) : panelState(VIEW)) : panelNation();
}
function updateLiveNumbers() {       // while dragging a slider, refresh text without rebuilding the slider
  const p = $("panel"), st = VIEW;
  const rows = p.querySelectorAll(".rows");
  if (rows[0]) rows[0].outerHTML = resultRows(votes(st), winner(st));
  if (SEL && rows[1]) {
    const raw = countyData[YEAR][st].c[SEL], [D, R, T] = countyVotes(SEL, raw, st);
    p.querySelectorAll(".rows")[1].outerHTML = resultRows({ D, R, O: 0, T }, D >= R ? "D" : "R");
  }
}
$("panel").addEventListener("input", e => {
  const w8 = wi(), s = +e.target.value;
  if (e.target.id === "swing") { w8.swing[VIEW] = s; delete w8.ovr[VIEW]; }
  if (e.target.id === "cshift") { w8.cshift[SEL] = s; delete w8.ovr[VIEW]; }
  $(e.target.id + "Val").textContent = swingText(s);
  render();
});
$("panel").addEventListener("change", () => { document.activeElement.blur(); renderPanel(); });
$("panel").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const w8 = wi(), d = b.dataset;
  if (d.cycle) cycle(d.cycle);
  else if (d.ovr) { w8.ovr[VIEW] = w8.ovr[VIEW] === d.ovr ? undefined : d.ovr; }
  else if ("resetState" in d) { delete w8.ovr[VIEW]; delete w8.swing[VIEW]; clearCounties(VIEW); }
  else if ("resetCounties" in d) clearCounties(VIEW);
  else if ("flip" in d) { w8.cflip[SEL] = !w8.cflip[SEL]; delete w8.ovr[VIEW]; }
  else if ("resetCounty" in d) { delete w8.cflip[SEL]; delete w8.cshift[SEL]; }
  else if ("deselect" in d) SEL = null;
  render();
});
function clearCounties(st) {
  const w8 = wi(), p = STFIPS[st];
  for (const m of [w8.cshift, w8.cflip]) for (const f in m) if (f.startsWith(p)) delete m[f];
}

/* ---------- render ---------- */
const need = () => { const t = Object.values(cur().units).reduce((s, a) => s + a[0], 0); return Math.floor(t / 2) + 1; };
function render() {
  const e = cur(), { t, pv } = totals(), total = Object.values(e.units).reduce((s, a) => s + a[0], 0);
  $("nmD").textContent = e.D; $("nmR").textContent = e.R;
  $("evD").textContent = t.D; $("evR").textContent = t.R;
  $("pvD").textContent = `${pct(pv.D, pv.T)} of the vote`; $("pvR").textContent = `${pct(pv.R, pv.T)} of the vote`;
  $("need").textContent = `${need()} to win · ${total} total`;
  $("evO").textContent = t.O ? `Other: ${t.O}` : "";
  $("verdict").textContent = MODE === "whatif" ? (t.D >= need() ? lastName(e.D) + " wins" : t.R >= need() ? lastName(e.R) + " wins" : t.D === t.R && t.D === total / 2 ? "Tie: House decides" : t.O && (t.D + t.T < need()) && (t.R + t.T < need()) ? "No majority: House decides" : "") : "";
  $("barD").style.width = t.D / total * 100 + "%"; $("barR").style.width = t.R / total * 100 + "%";
  $("barO").style.width = t.O / total * 100 + "%"; $("barLine").style.left = `calc(${need() / total * 100}% - 1px)`;

  stPaths.attr("fill", f => fill(f.st)).classed("na", f => !U(f.st))
    .attr("aria-label", f => U(f.st) ? `${NAMES[f.st]}, ${stateEV(f.st)} electoral votes` : NAMES[f.st]);
  stLabels.style("fill", f => textOn(fill(f.st))).style("opacity", f => U(f.st) ? 1 : .45);
  stLabels.select(".n").text(f => U(f.st) ? stateEV(f.st) : "");

  if (VIEW && !VIEW.includes("-")) {
    d3.select("#stmap").selectAll(".co").attr("fill", f => countyFill(f.id, VIEW)).classed("sel", f => f.id === SEL);
    d3.select("#stmap").selectAll(".whole").attr("fill", fill(VIEW));
  }

  // chips: small states + Maine/Nebraska districts
  const keys = SMALL.filter(k => U(k)).concat(Object.keys(e.units).filter(k => k.includes("-")));
  d3.select("#chips").selectAll("button").data(keys, k => k).join("button").attr("class", "chip")
    .text(k => `${k} ${k.includes("-") ? 1 : stateEV(k)}`)
    .style("background", k => fill(k)).style("color", k => textOn(fill(k)))
    .attr("aria-label", k => `${NAMES[k]}, ${k.includes("-") ? 1 : stateEV(k)} electoral votes`)
    .on("mousemove", (ev, k) => showTip(ev, k.includes("-") ? `<b>${NAMES[k]}</b><br>${winner(k) === "T" ? "Toss-up" : lastName(candName(winner(k)))}` : stateTip(k)))
    .on("mouseleave", hideTip)
    .on("click", (ev, k) => {
      if (k.includes("-")) { if (MODE === "whatif" && CLICK === "flip") cycle(k); else { if (VIEW && !VIEW.includes("-")) closeState(); VIEW = k; render(); } }
      else clickState(k);
    });

  const hasO = Object.values(e.units).some(a => a[3] > Math.max(a[1], a[2]));
  $("legend").innerHTML = (VIEW && !VIEW.includes("-") && hasCounties(VIEW) ? "County margin:" : "Margin:") +
    [["0", VIEW && hasCounties(VIEW) ? "30+ pts" : "15+ pts"], ["1", VIEW && hasCounties(VIEW) ? "10–30" : "5–15"], ["2", VIEW && hasCounties(VIEW) ? "under 10" : "under 5"]]
      .map(([i, l]) => `<span><i style="background:var(--d${i})"></i><i style="background:var(--r${i})"></i>${hasO && !VIEW ? `<i style="background:var(--o${i})"></i>` : ""}${l}</span>`).join("") +
    (MODE === "whatif" ? `<span><i style="background:var(--toss)"></i>Toss-up</span>` : "") +
    (!U("AK") || !U("DC") ? `<span><i style="background:var(--na)"></i>No electoral votes yet</span>` : "");
  renderPanel();
}

/* ---------- controls ---------- */
function setYear(y) {
  YEAR = y; if (VIEW) closeState();
  document.querySelectorAll("#years button").forEach(b => b.setAttribute("aria-current", +b.dataset.y === y));
  document.querySelector(`#years button[data-y="${y}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  history.replaceState(null, "", "#" + y);
  render();
  if (DB.e[y].counties) loadCounties(y).catch(() => {});   // prefetch
}
function setMode(m) {
  MODE = m;
  $("mResults").setAttribute("aria-pressed", m === "results"); $("mWhatIf").setAttribute("aria-pressed", m === "whatif");
  $("clickSeg").hidden = $("resetYear").hidden = $("clearYear").hidden = m !== "whatif";
  render();
}
function setClick(c) { CLICK = c; $("cOpen").setAttribute("aria-pressed", c === "open"); $("cFlip").setAttribute("aria-pressed", c === "flip"); render(); }
$("mResults").onclick = () => setMode("results");
$("mWhatIf").onclick = () => setMode("whatif");
$("cOpen").onclick = () => setClick("open");
$("cFlip").onclick = () => setClick("flip");
$("resetYear").onclick = () => { delete WI[YEAR]; render(); };
$("clearYear").onclick = () => { const w8 = wi(); for (const k in cur().units) w8.ovr[k] = "T"; render(); };
$("back").onclick = closeState;
document.addEventListener("keydown", e => {
  if (e.target.matches("input, textarea")) return;
  const i = DB.years.indexOf(YEAR);
  if (e.key === "ArrowLeft" && i > 0) setYear(DB.years[i - 1]);
  else if (e.key === "ArrowRight" && i < DB.years.length - 1) setYear(DB.years[i + 1]);
  else if (e.key === "Escape" && VIEW) closeState();
});

function showTip(e, html) { tip.innerHTML = html; tip.style.opacity = 1; const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8); tip.style.left = x + "px"; tip.style.top = e.clientY + 14 + "px"; }
function hideTip() { tip.style.opacity = 0; }

/* ---------- start ---------- */
Promise.all([d3.json("data/elections.json"), d3.json("data/states-albers-10m.json")]).then(([db, topo]) => {
  DB = db; DB.years = DB.years.map(Number); DB.e = Object.fromEntries(Object.entries(DB.e).map(([k, v]) => [+k, v]));
  statesTopo = topo;
  stateFeats = topojson.feature(topo, topo.objects.states).features.filter(f => FIPS2ST[f.id]);
  stateFeats.forEach(f => f.st = FIPS2ST[f.id]);
  $("years").innerHTML = DB.years.map(y => `<button data-y="${y}">${y}</button>`).join("");
  $("years").onclick = e => { const b = e.target.closest("button"); if (b) setYear(+b.dataset.y); };
  drawNation();
  const h = +location.hash.slice(1);
  setYear(DB.years.includes(h) ? h : DB.years[DB.years.length - 1]);
}).catch(err => {
  $("panel").innerHTML = `<h2>Couldn't load the map data</h2><p class="muted">This page needs to be served from a web host (like GitHub Pages) rather than opened as a file. ${err.message || ""}</p>`;
});
