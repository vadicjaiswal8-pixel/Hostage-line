const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const MIN = 60000;
const SOL = { culprit: 'Rohan Mehta', loc: 'Old Textile Mill' }; // server-side only
const FILES = {
  dossier: ["Dr. Anika Sen, 34, pharma compliance auditor. Last seen leaving the office at 9:10 PM.",
    "She was preparing a report on irregular drug-batch approvals.",
    "Magazine interview (2019): \"I grew up with a scruffy terrier called Biscuit. I still tear up thinking of her.\"",
    "Proof of life needs a question only Anika could answer."],
  suspects: ["ROHAN MEHTA: ex-business partner. Their startup ended in 2022 after a bitter money fight. Says he is abroad this week.",
    "DR. KABIR ANAND: her supervisor. Anika was about to report him for falsified audits. Strong motive.",
    "SAMEER: her driver for 3 years. Off duty and at home that night. No known grudge."],
  logs: ["EMAIL Kabir to Anika: \"Dr. Sen, kindly hold the report till Monday.\"",
    "EMAIL Sameer to Anika: \"Ma'am, I will bring the car at 9.\"",
    "CALL LOG: Rohan called Anika 7 times in 3 weeks (all missed).",
    "SMS Rohan to Anika: \"Ani, please just talk to me. We can fix this.\"",
    "EMAIL Rohan (auto-reply): \"I am out of the country this week with limited access.\"",
    "PHONE LOCATION Kabir: at a Delhi pharma conference all night (hotel check-in logged).",
    "BOOKING Rohan Mehta, Mumbai to Dubai: STATUS CANCELLED by passenger, 2 days before departure."],
  map: ["A. Old Textile Mill, Sector 9: abandoned since 2015, beside the railway line.",
    "B. Water Tower: disused, close to the railway line.",
    "C. Abandoned Cinema: city centre, far from the railway."],
  trains: ["Line 1: every 15 min, serves the city centre.", "Line 2: every 20 min, serves the city centre.",
    "Line 3: every 7 min, runs past the Old Textile Mill and the Water Tower."],
  sounds: ["Rumble and shaking floor: heavy rail passing very close.", "Cotton dust smell: textile industry.",
    "Church bell: no church is marked on the map near any site."]
};
const HINTS = ["Check who calls her by a nickname.", "Only one rail line runs every 7 minutes, and a smell matches only one of its two sites.", "Look at the status of Rohan's flight booking."];
const LABEL = { calm: "Take a breath. I'm listening.", stall: "I need time to get what you want.", want: "What exactly do you want?", ill: "You sound unwell. Are you okay?", where: "Where are you?", push: "Release her now or you'll regret it." };

const rooms = {};
const mkCode = () => { let c; do c = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join(''); while (rooms[c]); return c; };
const reset = r => Object.assign(r, { status: 'wait', endAt: 0, calls: [], chat: [], hints: 2, bad: 0, cut: 0, found: {}, said: {}, disp: {}, res: null, bonus: false });
function start(r) {
  reset(r); r.status = 'play'; r.endAt = Date.now() + 20 * MIN;
  r.calls.push({ from: 'caller', txt: "Listen carefully. Anika is alive. For now.", bg: "low hum, a distant metallic clank" });
}
function view(r, role) {
  const o = { role, code: r.code, status: r.status, now: Date.now(), endAt: r.endAt, hints: r.hints, chat: r.chat, cut: r.cut, mine: !!r.disp[role], partner: !!(r.ws.negotiator && r.ws.analyst) };
  if (role === 'negotiator') o.calls = r.calls; else o.files = FILES;
  if (r.res) o.res = r.res;
  return o;
}
function push(r) { for (const k of ['negotiator', 'analyst']) { const w = r.ws[k]; if (w && w.readyState === 1) w.send(JSON.stringify(view(r, k))); } }
function finish(r, kind) {
  r.status = 'end';
  const used = 20 * MIN + (r.bonus ? 3 * MIN : 0) - Math.max(0, r.endAt - Date.now());
  r.res = { kind, sol: SOL, clues: Object.keys(r.found), hintsUsed: 2 - r.hints, secs: Math.round(Math.min(used, 23 * MIN) / 1000) };
  push(r);
}
function say(r, id) {
  const f = r.found, n = r.said[id] = (r.said[id] || 0) + 1; let t, bg;
  if (id === 'calm') { if (!f.ani) { f.ani = 1; t = "Fine. I'm calm. Ani was always the careful one... she'd hate this."; bg = "a faint ticking, like a wall clock"; } else { t = "Talk. Quickly."; bg = "ticking continues"; } }
  else if (id === 'stall') { f.train = 1; if (n > 1) { t = "Seven minutes, like clockwork. Hear that? The floor shakes again."; bg = "train rumble, floor vibrating"; } else { t = "Don't ask where I am. Just know the 6:40 shakes this whole place."; bg = "a deep rumble builds, then fades; the floor vibrates"; } }
  else if (id === 'ill') { f.dust = 1; t = "*coughs* I can smell the old cotton dust in here. It's making me cough."; bg = "coughing, a hollow echo"; }
  else if (id === 'want') { t = "4,70,000. Cash. Don't test me."; bg = "a church bell tolls twice in the distance"; }
  else if (id === 'where') { r.bad++; r.cut = Date.now() + 20000; t = "Nice try. The line goes dead for a while."; bg = "click"; }
  else { r.bad++; t = "You think you can push me?!"; bg = "something metal slams"; }
  r.calls.push({ from: 'you', txt: LABEL[id] }, { from: 'caller', txt: t, bg });
  if (r.bad >= 3 && (id === 'where' || id === 'push')) { r.bad = 0; r.cut = Date.now() + 60 * MIN / 60; r.calls.push({ from: 'sys', txt: "The Caller cuts the line for 60 seconds." }); }
}
function act(ws, d) {
  const r = ws.room, role = ws.role, other = role === 'negotiator' ? 'analyst' : 'negotiator';
  if (d.t === 'again' && r.status === 'end') { start(r); return push(r); }
  if (r.status !== 'play') return;
  if (d.t === 'chat') r.chat.push({ r: role, txt: String(d.txt || '').slice(0, 300) });
  else if (d.t === 'say' && role === 'negotiator' && LABEL[d.id] && Date.now() >= r.cut) say(r, d.id);
  else if (d.t === 'pol' && role === 'negotiator' && Date.now() >= r.cut) {
    const q = String(d.txt || '').slice(0, 200);
    r.calls.push({ from: 'you', txt: "PROOF OF LIFE: " + q });
    if (/dog|pet|puppy/i.test(q)) {
      r.found.dog = 1; r.calls.push({ from: 'caller', txt: "Biscuit... she used to cry about that dog.", bg: "a muffled sob in the background" });
      if (!r.bonus) { r.bonus = true; r.endAt += 3 * MIN; r.calls.push({ from: 'sys', txt: "Proof of life confirmed. +3 minutes." }); }
    } else r.calls.push({ from: 'caller', txt: "Wrong question. Try again, and be quick.", bg: "static" });
  }
  else if (d.t === 'hint' && r.hints > 0) { r.chat.push({ r: 'sys', txt: "HINT: " + HINTS[2 - r.hints] }); r.hints--; r.endAt -= 2 * MIN; }
  else if (d.t === 'disp') {
    r.disp[role] = { c: d.c, l: d.l, at: Date.now() }; const o = r.disp[other], m = r.disp[role];
    if (o && Math.abs(m.at - o.at) <= 10000) {
      if (o.c !== m.c || o.l !== m.l) { r.disp = {}; r.chat.push({ r: 'sys', txt: "You chose different answers. Agree first, then both confirm again." }); }
      else { const lok = m.l === SOL.loc, cok = m.c === SOL.culprit; return finish(r, lok && cok ? 'win' : lok ? 'partial' : 'lose'); }
    }
  }
  push(r);
}
function join(ws, c, pid) {
  const r = rooms[c];
  if (!r) return ws.send(JSON.stringify({ err: 'Room not found' }));
  if (!pid) return;
  let role = r.pids[pid];
  if (!role) {
    const n = Object.keys(r.pids).length;
    if (n >= 2) return ws.send(JSON.stringify({ err: 'Room full' }));
    role = n === 0 ? 'negotiator' : 'analyst'; r.pids[pid] = role;
  }
  r.ws[role] = ws; ws.room = r; ws.role = role;
  if (Object.keys(r.pids).length === 2 && r.status === 'wait') start(r);
  push(r);
}
const TYPES = { '/manifest.json': 'application/json', '/sw.js': 'text/javascript', '/icon-192.png': 'image/png', '/icon-512.png': 'image/png' };
const srv = http.createServer((q, s) => {
  const p = q.url.split('?')[0], f = TYPES[p] ? p.slice(1) : 'index.html';
  fs.readFile(path.join(__dirname, f), (e, d) => { s.writeHead(200, { 'Content-Type': TYPES[p] || 'text/html' }); s.end(d); });
});
const wss = new WebSocketServer({ server: srv });
wss.on('connection', ws => {
  ws.on('message', m => {
    let d; try { d = JSON.parse(m); } catch { return; }
    if (d.t === 'create') { const c = mkCode(); rooms[c] = reset({ code: c, pids: {}, ws: {} }); join(ws, c, d.pid); }
    else if (d.t === 'join') join(ws, String(d.code || '').toUpperCase(), d.pid);
    else if (ws.room) act(ws, d);
  });
  ws.on('close', () => { const r = ws.room; if (r && r.ws[ws.role] === ws) { r.ws[ws.role] = null; push(r); } });
});
setInterval(() => { for (const c in rooms) { const r = rooms[c]; if (r.status === 'play' && Date.now() >= r.endAt) finish(r, 'lose'); } }, 1000);
srv.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('Hostage Line running'));
