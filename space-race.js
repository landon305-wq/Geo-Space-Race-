// ==========================================
// GEO-SPACERACE: SPACE RACE
// A typing race to the Moon. The map lights up a place, you type its name.
// 12 right answers land your rocket. You race bots plus "ghost" rockets that
// replay real players' runs from today (saved in Supabase).
// ==========================================
(function () {
    'use strict';
    const A = window.SRAnswers;

    // ---------- settings ----------
    const DAILY_TARGET = 12;           // right answers needed to land (daily race)
    let TARGET = DAILY_TARGET;         // rooms can choose 12 or 20
    const STALL_MS = 2500;             // asteroid stall after a miss
    const REVEAL_MS = 1300;            // how long the right answer shows after a miss
    const LANES = 5;                   // you + 4 others
    const SUPABASE_URL = 'https://ccjlpsapefnnikbschpj.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_q1GbjeHYP7X3Z3DTz4Eftg_0L2toKwO';
    const TABLE = 'space_race_runs';
    const NAME_KEY = 'astro_geo_player_callsign';
    const SOUND_KEY = 'sr_sound_on';
    const OFFICIAL_KEY = 'sr_official_';     // + day -> my first run today (counts on the leaderboard)

    const $ = id => document.getElementById(id);
    const now = () => performance.now();
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function fmtTime(ms) {
        if (!isFinite(ms)) return '—';
        const s = ms / 1000, m = Math.floor(s / 60);
        return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
    }

    // ---------- today + seeded randomness ----------
    function localDay(d = new Date()) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    const DAY = localDay();
    function hashStr(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return h >>> 0; }
    function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

    // ---------- sound (tiny synth, no files) ----------
    let audio = null, soundOn = true;
    try { soundOn = localStorage.getItem(SOUND_KEY) !== '0'; } catch (e) {}
    function ac() { if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (audio && audio.state === 'suspended') audio.resume(); return audio; }
    function tone(freq, dur, type = 'sine', vol = 0.15, slide = 0, delay = 0) {
        if (!soundOn) return; const c = ac(); if (!c) return;
        const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(dur, vol = 0.2, from = 800, to = 120, delay = 0) {
        if (!soundOn) return; const c = ac(); if (!c) return;
        const t = c.currentTime + delay, len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        src.buffer = buf; f.type = 'lowpass'; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f).connect(g).connect(c.destination); src.start(t);
    }
    const SFX = {
        beep: () => tone(660, 0.18, 'square', 0.09),
        go: () => { tone(990, 0.35, 'square', 0.1); noise(1.6, 0.28, 1400, 90); },
        correct: (streak) => { const b = 660 + Math.min(streak, 8) * 40; tone(b, 0.12, 'triangle', 0.14); tone(b * 1.5, 0.18, 'triangle', 0.12, 0, 0.07); noise(0.35, 0.06, 2500, 300); },
        boost: () => { tone(440, 0.5, 'sawtooth', 0.06, 900); noise(0.6, 0.12, 3000, 200); },
        wrong: () => { tone(160, 0.35, 'sawtooth', 0.13, -90); noise(0.45, 0.25, 600, 60); },
        key: () => tone(1800 + Math.random() * 400, 0.02, 'square', 0.015),
        land: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, 'triangle', 0.12, 0, i * 0.12)); noise(0.8, 0.15, 900, 80, 0.1); },
        rival: () => tone(330, 0.25, 'sine', 0.07, -60)
    };

    // ---------- map data ----------
    const GEO = { states: null, world: null };
    function prepFeatures(fc) {
        return fc.features.map(f => {
            const rings = [];
            const g = f.geometry; if (!g) return null;
            const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
            polys.forEach(p => p.forEach(r => rings.push(r)));
            const ringInfo = rings.map(r => {
                let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
                for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
                return { r, x0, x1, y0, y1, area: (x1 - x0) * (y1 - y0) };
            });
            const big = ringInfo.slice().sort((a, b) => b.area - a.area)[0];
            const p = f.properties || {};
            const label = p.label ? [p.label[1], p.label[0]] : big ? [(big.x0 + big.x1) / 2, (big.y0 + big.y1) / 2] : [0, 0];
            return { name: p.name, rings: ringInfo, label, box: p.box || null };
        }).filter(Boolean);
    }
    async function loadMaps() {
        const [us, world] = await Promise.all([
            fetch('us-states.geojson').then(r => r.json()),
            fetch('world-countries.geojson?v=7').then(r => r.json())
        ]);
        GEO.states = prepFeatures(us);
        GEO.world = prepFeatures(world);
        GEO.stateBy = Object.fromEntries(GEO.states.map(f => [f.name, f]));
        GEO.worldBy = Object.fromEntries(GEO.world.map(f => [f.name, f]));
    }

    // ---------- question deck ----------
    const EASY_STATES = ['California', 'Texas', 'Florida', 'New York', 'Alaska', 'Hawaii', 'Washington', 'Arizona', 'Nevada', 'Colorado',
        'Michigan', 'Maine', 'Louisiana', 'Oklahoma', 'Utah', 'Montana', 'Oregon', 'Idaho', 'Tennessee', 'Ohio', 'Pennsylvania', 'Georgia', 'Illinois', 'New Mexico', 'Minnesota'];
    const EASY_COUNTRIES = ['United States', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Peru', 'Colombia', 'United Kingdom', 'France',
        'Spain', 'Italy', 'Germany', 'Russia', 'China', 'India', 'Japan', 'Australia', 'Egypt', 'South Africa', 'Saudi Arabia', 'Turkey',
        'Norway', 'Sweden', 'Indonesia', 'Mongolia', 'Madagascar', 'New Zealand', 'Ukraine', 'Greece', 'Portugal', 'Cuba', 'Ireland', 'Iceland', 'Iran', 'Kazakhstan'];
    const MEDIUM_COUNTRIES = ['Poland', 'Finland', 'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Denmark', 'Romania', 'Hungary', 'Czechia',
        'Morocco', 'Algeria', 'Libya', 'Nigeria', 'Kenya', 'Ethiopia', 'Somalia', 'Sudan', 'Chad', 'Niger', 'Mali', 'Angola', 'Namibia', 'Botswana',
        'Zimbabwe', 'Tanzania', 'Democratic Republic of the Congo', 'Pakistan', 'Afghanistan', 'Iraq', 'Syria', 'Thailand', 'Vietnam', 'Philippines',
        'Malaysia', 'South Korea', 'North Korea', 'Myanmar', 'Nepal', 'Bangladesh', 'Sri Lanka', 'Venezuela', 'Bolivia', 'Ecuador', 'Paraguay',
        'Uruguay', 'Panama', 'Guatemala', 'Jamaica', 'Haiti', 'Israel', 'Jordan', 'Yemen', 'Oman', 'United Arab Emirates', 'Croatia', 'Serbia',
        'Bulgaria', 'Belarus', 'Papua New Guinea', 'Cambodia', 'Laos', 'Uzbekistan', 'Ghana', 'Cameroon', 'Mozambique', 'Zambia', 'Tunisia'];
    const EASY_STATE_CAPS = ['Texas', 'Georgia', 'Massachusetts', 'Colorado', 'Hawaii', 'Arizona', 'Utah', 'Tennessee', 'Indiana', 'Ohio',
        'Oklahoma', 'Virginia', 'North Carolina', 'Rhode Island', 'Wisconsin', 'Idaho', 'Iowa'];
    const EASY_COUNTRY_CAPS = ['France', 'United Kingdom', 'Japan', 'Italy', 'Spain', 'Germany', 'Russia', 'China', 'Egypt', 'Greece', 'Mexico',
        'Ireland', 'Portugal', 'Norway', 'South Korea', 'Thailand', 'Argentina', 'Peru', 'Cuba', 'Austria', 'Kenya', 'Sweden', 'Denmark', 'Canada', 'Australia'];

    // A capital that is basically the same word as its country makes no question (Kuwait City, Singapore...)
    function capIsGiveaway(country, cap) {
        const a = A.norm(country), b = A.norm(cap);
        return b.includes(a) || a.includes(b.split(' ')[0]);
    }

    // The deck: easy first, harder later. Enough questions for misses.
    function buildDeck(seedStr, set = 'mixed') {
        const r = rng(hashStr(seedStr));
        const allStates = A.STATES.filter(s => GEO.stateBy[s]);
        const hardStates = allStates.filter(s => !EASY_STATES.includes(s));
        const allCountries = A.COUNTRIES.filter(c => GEO.worldBy[c]);
        const hardCountries = allCountries.filter(c => !EASY_COUNTRIES.includes(c) && !MEDIUM_COUNTRIES.includes(c));
        const stateCapStates = Object.keys(A.US_CAPITALS);
        const capCountries = allCountries.filter(c => A.WORLD_CAPITALS[c] && !capIsGiveaway(c, A.WORLD_CAPITALS[c]));

        const mk = {
            state: n => ({ type: 'state', target: n, answer: n, pool: 'states', map: 'us', prompt: 'Name this <b>state</b>', tag: 'USA · STATE' }),
            country: n => ({ type: 'country', target: n, answer: n, pool: 'countries', map: 'world', prompt: 'Name this <b>country</b>', tag: 'WORLD · COUNTRY' }),
            stateCap: n => ({ type: 'stateCap', target: n, answer: A.US_CAPITALS[n], pool: 'stateCapitals', map: 'us', prompt: `What is the capital of <b>${esc(n)}</b>?`, tag: 'USA · CAPITAL' }),
            countryCap: n => ({ type: 'countryCap', target: n, answer: A.WORLD_CAPITALS[n], pool: 'countryCapitals', map: 'world', prompt: `What is the capital of <b>${esc(n)}</b>?`, tag: 'WORLD · CAPITAL' }),
            capState: n => ({ type: 'capState', target: null, hint: n, answer: n, pool: 'states', map: 'us', prompt: `<b>${esc(A.US_CAPITALS[n])}</b> is the capital of which state?`, tag: 'USA · CAPITAL' })
        };
        const tiers = [
            { count: 5, pick: [['state', EASY_STATES], ['country', EASY_COUNTRIES], ['stateCap', EASY_STATE_CAPS], ['countryCap', EASY_COUNTRY_CAPS]] },
            { count: 8, pick: [['state', allStates], ['country', MEDIUM_COUNTRIES], ['stateCap', stateCapStates], ['countryCap', capCountries.filter(c => EASY_COUNTRIES.includes(c) || MEDIUM_COUNTRIES.includes(c))], ['capState', stateCapStates]] },
            { count: 27, pick: [['state', hardStates], ['country', MEDIUM_COUNTRIES.concat(hardCountries.slice())], ['stateCap', stateCapStates], ['countryCap', capCountries], ['capState', stateCapStates]] }
        ];
        // USA-only or World-only rooms keep just those question types
        const keep = set === 'usa' ? ['state', 'stateCap', 'capState'] : set === 'world' ? ['country', 'countryCap'] : null;
        if (keep) tiers.forEach(tr => { tr.pick = tr.pick.filter(([type]) => keep.includes(type)); });
        tiers[2].count += Math.max(0, TARGET - DAILY_TARGET) * 2;
        const used = new Set(), deck = [];
        let lastType = '';
        for (const tier of tiers) {
            for (let i = 0; i < tier.count; i++) {
                for (let tries = 0; tries < 60; tries++) {
                    const [type, list] = tier.pick[Math.floor(r() * tier.pick.length)];
                    if (type === lastType && tries < 40) continue;
                    const name = list[Math.floor(r() * list.length)];
                    const key = type.startsWith('state') || type === 'capState' ? 'US:' + name : 'W:' + name;
                    if (!name || used.has(key)) continue;
                    used.add(key); deck.push(mk[type](name)); lastType = type;
                    break;
                }
            }
        }
        return deck;
    }

    // ---------- racers ----------
    const BOT_NAMES = ['NOVA-7', 'ORBITRON', 'LUNA-X', 'COMET-3', 'ASTRO-BOT', 'SPUTNIK-9', 'PULSAR', 'QUASAR-2', 'ZENITH', 'VEGA-5', 'APOLLO-B', 'IONIS'];
    const BOT_SKILLS = [
        { label: 'ACE', mean: 5.2, acc: 0.93 },
        { label: 'PILOT', mean: 7.0, acc: 0.86 },
        { label: 'CADET', mean: 9.2, acc: 0.79 },
        { label: 'ROOKIE', mean: 11.5, acc: 0.71 }
    ];
    const COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#fb7185', '#c084fc'];
    const GHOST_COLOR = '#a78bfa';

    function botRun(seedStr, skill) {
        const r = rng(hashStr(seedStr));
        const splits = [], misses = [];
        let t = 1200 + r() * 600;
        while (splits.length < TARGET) {
            const think = clamp(skill.mean * Math.exp(gauss(r) * 0.33), 1.8, skill.mean * 3) * 1000;
            t += think;
            if (r() < skill.acc) splits.push(Math.round(t));
            else { misses.push(Math.round(t)); t += STALL_MS + REVEAL_MS * 0.4; }
        }
        return { splits, misses, finish: splits[TARGET - 1] };
    }

    // ---------- Supabase: ghosts + leaderboard ----------
    let sb = null, userId = null, authReady = null;
    if (window.supabase) {
        try {
            sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storageKey: 'sb-spacerace-auth' } });
            authReady = (async () => {
                try {
                    const { data: { session } } = await sb.auth.getSession();
                    if (session) userId = session.user.id;
                    else { const { data } = await sb.auth.signInAnonymously(); userId = data && data.user ? data.user.id : null; }
                } catch (e) { console.warn('[SpaceRace] auth', e); }
            })();
        } catch (e) { console.warn('[SpaceRace] supabase', e); }
    }
    async function fetchTodayRuns(limit = 50) {
        if (!sb) return [];
        try {
            const { data, error } = await sb.from(TABLE).select('user_id,name,finish_ms,splits,misses').eq('day', DAY).order('finish_ms', { ascending: true }).limit(limit);
            if (error) throw error;
            return (data || []).filter(d => Array.isArray(d.splits) && d.splits.length === DAILY_TARGET);
        } catch (e) { console.warn('[SpaceRace] fetch runs', e); return []; }
    }
    async function saveRun(run) {
        if (!sb) return false;
        try {
            await authReady;
            if (!userId) return false;
            const { error } = await sb.from(TABLE).insert({ user_id: userId, day: DAY, name: run.name, finish_ms: Math.round(run.finish), splits: run.splits, misses: run.misses });
            if (error && !String(error.message || '').includes('duplicate')) throw error;
            return true;
        } catch (e) { console.warn('[SpaceRace] save', e); return false; }
    }

    // ---------- callsign ----------
    function storedName() { try { const n = (localStorage.getItem(NAME_KEY) || '').trim(); return n.toLowerCase() === 'commander cadet' ? '' : n; } catch (e) { return ''; } }
    function askName(msg) {
        return new Promise(resolve => {
            const wrap = document.createElement('div');
            wrap.className = 'sr-overlay';
            wrap.innerHTML = `<div class="sr-res-card sr-name-box"><div class="sr-res-title">🧑‍🚀 CALLSIGN</div>
                <div class="sr-res-sub">${esc(msg)}</div><input maxlength="20" placeholder="Your name" value="${esc(storedName())}">
                <div class="sr-name-err"></div><div class="sr-res-btns"><button class="sr-btn sr-btn-main">SAVE NAME</button>
                <button class="sr-btn sr-btn-ghost">Skip</button></div></div>`;
            document.body.appendChild(wrap);
            const inp = wrap.querySelector('input'), err = wrap.querySelector('.sr-name-err');
            const [save, skip] = wrap.querySelectorAll('button');
            setTimeout(() => inp.focus(), 60);
            const done = n => { wrap.remove(); resolve(n); };
            save.onclick = () => {
                const n = inp.value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
                if (n.length < 2) { err.textContent = 'Please enter at least 2 characters.'; return; }
                try { localStorage.setItem(NAME_KEY, n); } catch (e) {}
                done(n);
            };
            skip.onclick = () => done('');
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') save.onclick(); });
        });
    }
    function renderCallsign() {
        const n = storedName();
        $('sr-callsign').innerHTML = n ? `Racing as <b>${esc(n)}</b> · <a id="sr-rename">change</a>` : `<a id="sr-rename">Set your callsign</a> to show up on the leaderboard`;
        $('sr-rename').onclick = async () => { await askName('Your name on the Space Race leaderboard.'); renderCallsign(); buildLineup(); };
    }

    // ==========================================
    // RACE STATE
    // ==========================================
    let deck = [], qIndex = 0, q = null;
    let racers = [];             // [{name, kind:'you'|'bot'|'ghost', color, splits, misses, finish, p, dp, knock, ...}]
    let me = null;
    let state = 'lobby';         // lobby | countdown | racing | finale | done
    let raceStart = 0, stalledUntil = 0, streak = 0, bestStreak = 0, attempts = 0;
    let lineupData = null, isOfficial = true, raceSeed = DAY;
    let suggestions = [], hiIdx = 0;

    async function buildLineup() {
        const box = $('sr-lineup');
        const name = storedName() || 'You';
        const runs = await fetchTodayRuns(50);
        await authReady;
        const others = runs.filter(r => r.user_id !== userId);
        // ghosts: the fastest player today + up to 2 more picked at random, so the field is mixed
        const ghosts = [];
        if (others.length) ghosts.push(others[0]);
        const rest = shuffle(others.slice(1), rng(hashStr(DAY + 'g' + Math.random())));
        while (ghosts.length < 3 && rest.length) ghosts.push(rest.shift());
        const r = rng(hashStr(DAY + 'bots'));
        const botNames = shuffle(BOT_NAMES, r);
        const field = [{ name, kind: 'you', color: COLORS[0] }];
        ghosts.forEach(g => field.push({ name: g.name, kind: 'ghost', color: GHOST_COLOR, splits: g.splits, misses: g.misses || [], finish: g.finish_ms }));
        let bi = 0;
        // bots fill the empty lanes; skills spread from ACE to ROOKIE
        const skillOrder = shuffle(BOT_SKILLS, r);
        while (field.length < LANES) {
            const skill = skillOrder[bi % skillOrder.length];
            const run = botRun(DAY + raceSeed + botNames[bi], skill);
            field.push({ name: botNames[bi], kind: 'bot', skill: skill.label, color: COLORS[(field.length) % COLORS.length], ...run });
            bi++;
        }
        lineupData = field;
        box.innerHTML = field.map((f, i) => `<div class="sr-lane-chip" style="animation-delay:${i * 70}ms">
            <span class="dot" style="background:${f.color};color:${f.color}"></span>
            <span class="nm">${esc(f.name)}</span>
            <span class="tag ${f.kind === 'you' ? 'tag-you' : f.kind === 'ghost' ? 'tag-ghost' : 'tag-bot'}">${f.kind === 'you' ? 'YOU' : f.kind === 'ghost' ? '👻 GHOST · ' + fmtTime(f.finish) : '🤖 BOT · ' + f.skill}</span>
        </div>`).join('');
    }

    let raceMode = 'daily';      // daily | practice | room
    function startRace(roomRace) {
        ac();
        let field;
        if (roomRace) {
            raceMode = 'room'; isOfficial = false;
            TARGET = roomRace.target; raceSeed = roomRace.seed;
            deck = buildDeck(raceSeed, roomRace.set);
            field = roomRace.field;
        } else {
            TARGET = DAILY_TARGET;
            const official = (() => { try { return localStorage.getItem(OFFICIAL_KEY + DAY); } catch (e) { return null; } })();
            isOfficial = !official;
            raceMode = isOfficial ? 'daily' : 'practice';
            raceSeed = isOfficial ? DAY : DAY + ':practice:' + Date.now();
            deck = buildDeck(raceSeed);
            field = lineupData;
        }
        qIndex = 0; streak = 0; bestStreak = 0; attempts = 0; stalledUntil = 0;
        FX.finaleStart = 0; FX.landedDust = false; FX.flagAt = 0; FX.confetti = [];
        racers = field.map((f, i) => ({
            ...f, lane: i, p: 0, dp: 0, knock: 0, count: 0, finished: false, place: 0,
            splits: f.kind === 'you' || f.kind === 'friend' ? [] : (f.kind === 'bot' && !isOfficial ? botRun(raceSeed + f.name, BOT_SKILLS.find(s => s.label === f.skill)).splits : f.splits),
            misses: f.kind === 'you' || f.kind === 'friend' ? [] : (f.kind === 'bot' && !isOfficial ? botRun(raceSeed + f.name, BOT_SKILLS.find(s => s.label === f.skill)).misses : f.misses),
            missIdx: 0, landedAt: null, wobble: Math.random() * 6, left: false
        }));
        racers.forEach(rc => { if (rc.kind === 'bot' || rc.kind === 'ghost') rc.finish = rc.splits[TARGET - 1]; else if (rc.kind === 'friend') rc.finish = Infinity; });
        me = racers.find(rc => rc.kind === 'you');
        // your rocket races in the middle lane
        const mid = Math.floor(racers.length / 2);
        const order = racers.filter(rc => rc !== me);
        order.splice(mid, 0, me);
        order.forEach((rc, i) => { rc.lane = i; });
        showScreen('sr-race');
        document.querySelector('.sr-hud').classList.remove('fade');
        resize();
        $('sr-prompt').innerHTML = raceMode === 'room' ? `Room <b>${esc(Room.code || '')}</b> race. Get ready…` : isOfficial ? "Today's official race. Get ready…" : 'Practice race (new questions). Get ready…';
        $('sr-count').textContent = `0 / ${TARGET}`; $('sr-streak').textContent = '0'; $('sr-clock').textContent = '0:00.0';
        setMapView(null);
        countdown();
    }

    function countdown() {
        state = 'countdown';
        const steps = ['3', '2', '1'];
        steps.forEach((s, i) => setTimeout(() => { callout(s); SFX.beep(); FX.shake = 4 + i * 2; }, 400 + i * 900));
        setTimeout(() => {
            callout('LIFTOFF!', 'small gold'); SFX.go(); FX.shake = 14; FX.liftoff = now();
            state = 'racing'; raceStart = now();
            racers.forEach(rc => burst(rc, 'smoke', 26));
            nextQuestion(true);
        }, 400 + steps.length * 900);
    }

    function raceTime() { return state === 'countdown' || state === 'lobby' ? 0 : now() - raceStart; }

    function nextQuestion(first) {
        q = deck[qIndex++] || deck[(qIndex++) % deck.length];
        $('sr-prompt').innerHTML = q.prompt;
        $('sr-prompt').classList.remove('pop'); void $('sr-prompt').offsetWidth; $('sr-prompt').classList.add('pop');
        $('sr-map-tag').textContent = q.tag;
        $('sr-feedback').classList.remove('show');
        setMapView(q);
        const inp = $('sr-input');
        inp.value = ''; inp.disabled = false; inp.className = '';
        $('sr-go-btn').disabled = false; $('sr-skip-btn').disabled = false;
        inp.focus({ preventScroll: true });
        renderSuggest();
    }

    // ---------- typing ----------
    function renderSuggest() {
        const inp = $('sr-input');
        const typedSkip = SKIP_WORDS.includes(A.norm(inp.value));
        suggestions = q && state === 'racing' && !typedSkip ? A.suggest(inp.value, q.pool, 5) : [];
        hiIdx = 0;
        const exact = q ? A.match(inp.value, q.pool) : null;
        if (exact) { suggestions = [exact].concat(suggestions.filter(s => s !== exact)).slice(0, 5); }
        if (typedSkip) { $('sr-suggest').innerHTML = '<span class="sr-skip-hint">⏭ Press Enter to skip</span>'; return; }
        $('sr-suggest').innerHTML = suggestions.map((s, i) => `<button type="button" class="sr-chip${i === hiIdx ? ' hi' : ''}" data-i="${i}" role="option">${esc(s)}</button>`).join('');
    }
    function moveHi(d) {
        if (!suggestions.length) return;
        hiIdx = (hiIdx + d + suggestions.length) % suggestions.length;
        [...$('sr-suggest').children].forEach((c, i) => c.classList.toggle('hi', i === hiIdx));
    }
    // typing one of these skips the question (same as the SKIP button)
    const SKIP_WORDS = ['idk', 'i dk', 'skip', 'pass', 'i dont know', 'dont know', 'dunno', 'no idea', 'next'];
    function submit(chosen) {
        if (state !== 'racing' || !q || now() < stalledUntil) return;
        const inp = $('sr-input');
        if (!chosen && SKIP_WORDS.includes(A.norm(inp.value))) return skip();
        let pick = chosen || A.match(inp.value, q.pool) || (suggestions.length && A.norm(inp.value).length >= 2 ? suggestions[hiIdx] : null);
        if (!pick) {
            inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
            return;
        }
        attempts++;
        if (pick === q.answer) onCorrect(pick); else onWrong(pick);
    }
    function skip() {
        if (state !== 'racing' || !q || now() < stalledUntil) return;
        attempts++;
        onWrong(null);
    }

    function onCorrect(pick) {
        const t = raceTime();
        me.splits.push(Math.round(t)); me.count++; me.p = me.count / TARGET;
        Room.send('prog', { n: me.count });
        streak++; bestStreak = Math.max(bestStreak, streak);
        $('sr-input').className = 'good';
        feedback(`✓ ${pick}`, 'good');
        SFX.correct(streak);
        burst(me, 'thrust', 40);
        FX.flashGood = 1;
        if (streak >= 3) { me.boostUntil = now() + 1600; if (streak === 3 || streak % 5 === 0) { callout(streak >= 5 ? `${streak} STREAK!` : 'BOOST!', 'small gold'); SFX.boost(); } }
        $('sr-count').textContent = `${me.count} / ${TARGET}`;
        $('sr-streak').textContent = streak; $('sr-streak').classList.toggle('hot', streak >= 3);
        if (me.count >= TARGET) return finishRace();
        setTimeout(() => { if (state === 'racing') nextQuestion(); }, 380);
        lockInput(380);
    }
    function onWrong(pick) {
        me.misses.push(Math.round(raceTime()));
        Room.send('miss', {});
        streak = 0; $('sr-streak').textContent = '0'; $('sr-streak').classList.remove('hot');
        $('sr-input').className = 'bad';
        feedback(pick ? `✗ It was ${q.answer}` : `⏭ It was ${q.answer}`, 'bad');
        SFX.wrong();
        asteroidHit(me);
        stalledUntil = now() + STALL_MS;
        lockInput(STALL_MS);
        revealOnMap();
        setTimeout(() => { if (state === 'racing') nextQuestion(); }, STALL_MS);
    }
    function lockInput(ms) {
        $('sr-input').disabled = true; $('sr-go-btn').disabled = true; $('sr-skip-btn').disabled = true;
        $('sr-suggest').innerHTML = '';
        setTimeout(() => { if (state === 'racing') { $('sr-input').disabled = false; $('sr-go-btn').disabled = false; $('sr-skip-btn').disabled = false; $('sr-input').focus({ preventScroll: true }); } }, ms);
    }
    let fbTimer = 0;
    function feedback(text, kind) {
        const el = $('sr-feedback');
        el.textContent = text; el.className = `sr-feedback ${kind} show`;
        clearTimeout(fbTimer); fbTimer = setTimeout(() => el.classList.remove('show'), kind === 'bad' ? REVEAL_MS + 600 : 700);
    }
    let calloutTimer = 0;
    function callout(text, extra = '') {
        const el = $('sr-callout');
        el.className = 'sr-callout'; void el.offsetWidth;
        el.textContent = text; el.className = `sr-callout go ${extra}`;
        clearTimeout(calloutTimer); calloutTimer = setTimeout(() => { el.className = 'sr-callout'; }, 950);
    }

    // ---------- finish ----------
    function finishRace() {
        const t = raceTime();
        me.finish = t; me.finished = true;
        Room.send('fin', { t: Math.round(t) });
        state = 'finale';
        FX.finaleStart = now(); FX.landedDust = false; FX.flagAt = 0;
        $('sr-input').disabled = true; $('sr-go-btn').disabled = true; $('sr-skip-btn').disabled = true;
        $('sr-suggest').innerHTML = '';
        $('sr-prompt').innerHTML = '🌕 <b>TOUCHDOWN!</b>';
        document.querySelector('.sr-hud').classList.add('fade');
        SFX.land();
        callout('TOUCHDOWN!', 'small gold');
        setTimeout(showResults, 3300);
    }
    function abortRace() {
        if (state !== 'racing' && state !== 'countdown') return;
        if (raceMode === 'room') {
            if (!confirm('Leave this room race?')) return;
            Room.leave(); return;
        }
        if (!confirm('Abort this mission? This race will not count.')) return;
        state = 'lobby'; showScreen('sr-lobby');
    }

    function renderStandings() {
        const order = racers.map(rc => ({ rc, t: rc.kind === 'you' ? me.finish : rc.finish })).sort((a, b) => a.t - b.t);
        $('sr-standings').innerHTML = order.map((o, i) => {
            const nm = o.rc === me ? (raceMode === 'room' ? me.name : storedName() || 'You') : o.rc.name;
            const icon = o.rc.kind === 'bot' ? '🤖' : o.rc.kind === 'ghost' ? '👻' : o.rc.kind === 'friend' ? '🧑‍🚀' : '';
            const tm = isFinite(o.t) ? fmtTime(o.t) : o.rc.left ? 'left' : 'racing…';
            return `<li class="${o.rc === me ? 'me' : ''}"><span class="pl">${isFinite(o.t) ? i + 1 : '–'}</span><span class="nm">${esc(nm)} ${icon}</span><span class="tm">${tm}</span></li>`;
        }).join('');
        return order;
    }
    async function showResults() {
        state = 'done';
        const order = racers.map(rc => ({ rc, t: rc.kind === 'you' ? me.finish : rc.finish })).sort((a, b) => a.t - b.t);
        const place = order.findIndex(o => o.rc === me) + 1;
        const medals = ['🥇', '🥈', '🥉', '🚀', '🛰️'];
        const names = ['1ST PLACE!', '2ND PLACE!', '3RD PLACE!', '4TH PLACE', '5TH PLACE'];
        $('sr-res-medal').textContent = medals[place - 1] || '🚀';
        $('sr-res-title').textContent = names[place - 1] || `${place}TH PLACE`;
        $('sr-res-time').textContent = fmtTime(me.finish);
        $('sr-res-acc').textContent = `${Math.round(TARGET / Math.max(attempts, TARGET) * 100)}%`;
        $('sr-res-streak').textContent = bestStreak;
        renderStandings();
        const inRoom = raceMode === 'room';
        $('sr-res-lb-title').classList.toggle('hidden', inRoom); $('sr-res-lb').classList.toggle('hidden', inRoom);
        $('sr-again-btn').classList.toggle('hidden', inRoom); $('sr-home-btn').classList.toggle('hidden', inRoom);
        $('sr-room-btns').classList.toggle('hidden', !inRoom);
        $('sr-results').classList.remove('hidden');
        if (place === 1) confettiRain();

        let sub = '';
        if (inRoom) {
            $('sr-res-sub').textContent = Room.quick ? 'Quick match · online races don\'t count for the daily leaderboard.' : `Room ${Room.code} · private races don't count for the daily leaderboard.`;
            Room.renderResultButtons();
            return;
        }
        if (isOfficial) {
            try { localStorage.setItem(OFFICIAL_KEY + DAY, String(Math.round(me.finish))); } catch (e) {}
            let name = storedName();
            if (!name) name = await askName('Save your time to today\'s Space Race leaderboard!');
            if (name) {
                const ok = await saveRun({ name, finish: me.finish, splits: me.splits, misses: me.misses });
                sub = ok ? 'Official time saved. Your rocket is now a ghost other players will race today!' : 'Could not reach the leaderboard. Your time is saved on this device.';
            } else sub = 'Set a callsign next time to appear on the leaderboard.';
        } else {
            let off = null; try { off = localStorage.getItem(OFFICIAL_KEY + DAY); } catch (e) {}
            sub = `Practice race. Your official time today is ${fmtTime(Number(off))}. A new official race starts tomorrow!`;
        }
        $('sr-res-sub').textContent = sub;
        fillLeaderboard($('sr-res-lb'));
    }
    async function fillLeaderboard(list) {
        list.innerHTML = '<li class="sr-muted">Loading…</li>';
        await authReady;
        const runs = await fetchTodayRuns(10);
        if (!runs.length) { list.innerHTML = '<li class="sr-muted">No times yet today. Be the first!</li>'; return; }
        list.innerHTML = runs.map((r, i) => `<li class="${r.user_id === userId ? 'me' : ''}"><span class="pl">${i + 1}</span><span class="nm">${esc(r.name)}</span><span class="tm">${fmtTime(r.finish_ms)}</span></li>`).join('');
    }

    function showScreen(id) {
        document.querySelectorAll('.sr-screen').forEach(s => s.classList.toggle('active', s.id === id));
        $('sr-results').classList.add('hidden');
        if (id === 'sr-race') requestAnimationFrame(resize);
    }

    // ==========================================
    // MAP VIEW (the place that lights up)
    // ==========================================
    const mapCv = $('sr-map'), mapCtx = mapCv.getContext('2d');
    let view = null;   // {features, target, cam:{from,to,start}, k, cx, cy, reveal}
    function wrapLon(l, c) { return ((l - c + 540) % 360) - 180 + c; }
    function setMapView(question) {
        if (!GEO.states) return;
        const isUS = !question || question.map === 'us';
        const feats = isUS ? GEO.states : GEO.world;
        let target = null, frame;
        if (question && question.target) target = (isUS ? GEO.stateBy : GEO.worldBy)[question.target];
        let cLon, cLat;
        if (target) { cLon = target.label[0]; cLat = target.label[1]; }
        else if (isUS) { cLon = -97; cLat = 38.5; }
        else { cLon = 10; cLat = 20; }
        const k = Math.max(0.3, Math.cos(cLat * Math.PI / 180));
        const P = (lon, lat) => [(wrapLon(lon, cLon) - cLon) * k, -(lat - cLat)];
        if (target) {
            // frame the rings near the label (skips far-away islands and territories)
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
            for (const ri of target.rings) {
                const [mx, my] = P((ri.x0 + ri.x1) / 2, (ri.y0 + ri.y1) / 2);
                if (Math.hypot(mx, my) > 22) continue;
                for (const [lon, lat] of ri.r) { const [x, y] = P(lon, lat); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            }
            if (!isFinite(x0)) { x0 = -1; x1 = 1; y0 = -1; y1 = 1; }
            const minSpan = isUS ? 9 : 16;
            let w = Math.max(x1 - x0, minSpan * k), h = Math.max(y1 - y0, minSpan * 0.62);
            frame = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: w * 1.7, h: h * 1.7 };
        } else {
            frame = isUS ? { cx: 0, cy: 0, w: 62 * k, h: 30 } : { cx: 0, cy: 8, w: 360 * k, h: 150 };
        }
        // paths for everything near the frame (wider for the zoom-in animation)
        const reach = Math.max(frame.w, frame.h) * 3.2;
        const paths = [];
        let targetPath = null;
        for (const f of feats) {
            const path = new Path2D(); let any = false;
            for (const ri of f.rings) {
                const [mx, my] = P((ri.x0 + ri.x1) / 2, (ri.y0 + ri.y1) / 2);
                if (Math.abs(mx - frame.cx) > reach && f !== target) continue;
                if (Math.abs(my - frame.cy) > reach && f !== target) continue;
                ri.r.forEach(([lon, lat], i) => { const [x, y] = P(lon, lat); i ? path.lineTo(x, y) : path.moveTo(x, y); });
                path.closePath(); any = true;
            }
            if (!any) continue;
            if (f === target) targetPath = path; else paths.push({ path, name: f.name });
        }
        const labelXY = target ? P(target.label[0], target.label[1]) : null;
        const prev = view && view.frame;
        view = {
            paths, targetPath, labelXY, frame, isUS, reveal: null, isTarget: !!target,
            camFrom: { cx: frame.cx, cy: frame.cy, w: frame.w * 3.4, h: frame.h * 3.4 },
            camStart: now(), P
        };
        if (!question) view.camFrom = frame;
        // capital-to-state questions: hide the answer, just show the whole map dimmed
        if (question && question.type === 'capState') view.dim = true;
        void prev;
    }
    function revealOnMap() {
        if (!view || !q) return;
        // after a miss, light up the right place (for capital-to-state questions too)
        if (q.type === 'capState' && GEO.stateBy[q.answer]) {
            const f = GEO.stateBy[q.answer];
            const path = new Path2D();
            f.rings.forEach(ri => { ri.r.forEach(([lon, lat], i) => { const [x, y] = view.P(lon, lat); i ? path.lineTo(x, y) : path.moveTo(x, y); }); path.closePath(); });
            view.reveal = path;
        } else view.reveal = view.targetPath;
        view.revealAt = now();
    }

    function drawMap(t) {
        const W = mapCv.clientWidth, H = mapCv.clientHeight, dpr = mapCv._dpr || 1;
        const c = mapCtx;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        // ocean
        const g = c.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.75);
        g.addColorStop(0, '#0b2540'); g.addColorStop(1, '#030a18');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        if (!view) return;
        // camera
        const ct = easeOut(clamp((t - view.camStart) / 900, 0, 1));
        const f = view.frame, fr = view.camFrom;
        const cam = { cx: lerp(fr.cx, f.cx, ct), cy: lerp(fr.cy, f.cy, ct), w: lerp(fr.w, f.w, ct), h: lerp(fr.h, f.h, ct) };
        const s = Math.min(W / cam.w, H / cam.h);
        c.save();
        c.translate(W / 2, H / 2); c.scale(s, s); c.translate(-cam.cx, -cam.cy);
        // grid
        c.strokeStyle = 'rgba(56,189,248,0.07)'; c.lineWidth = 1 / s;
        const step = cam.w > 120 ? 20 : cam.w > 40 ? 10 : 5;
        const gx0 = Math.floor((cam.cx - cam.w) / step) * step, gy0 = Math.floor((cam.cy - cam.h) / step) * step;
        c.beginPath();
        for (let x = gx0; x < cam.cx + cam.w; x += step) { c.moveTo(x, cam.cy - cam.h); c.lineTo(x, cam.cy + cam.h); }
        for (let y = gy0; y < cam.cy + cam.h; y += step) { c.moveTo(cam.cx - cam.w, y); c.lineTo(cam.cx + cam.w, y); }
        c.stroke();
        // land
        c.fillStyle = view.dim ? '#16283f' : '#14243b';
        c.strokeStyle = view.dim ? 'rgba(125,211,252,0.35)' : 'rgba(94,140,190,0.55)';
        c.lineWidth = 1 / s; c.lineJoin = 'round';
        for (const p of view.paths) { c.fill(p.path, 'evenodd'); c.stroke(p.path); }
        // target glow
        const pulse = 0.5 + 0.5 * Math.sin(t / 260);
        const lit = view.targetPath && !view.dim ? view.targetPath : null;
        if (lit) {
            c.save();
            c.shadowColor = 'rgba(56,189,248,0.95)'; c.shadowBlur = 18 + pulse * 18;
            c.fillStyle = `rgba(56,189,248,${0.55 + pulse * 0.3})`;
            c.fill(lit, 'evenodd');
            c.shadowBlur = 0;
            c.strokeStyle = '#e0f2fe'; c.lineWidth = 2 / s; c.stroke(lit);
            c.restore();
        } else if (view.targetPath && view.dim) {
            c.fill(view.targetPath, 'evenodd'); c.stroke(view.targetPath);
        }
        if (view.reveal) {
            const rt = clamp((t - view.revealAt) / 300, 0, 1);
            c.save(); c.globalAlpha = rt;
            c.shadowColor = 'rgba(251,191,36,0.95)'; c.shadowBlur = 24;
            c.fillStyle = 'rgba(251,191,36,0.7)'; c.fill(view.reveal, 'evenodd');
            c.strokeStyle = '#fef3c7'; c.lineWidth = 2 / s; c.stroke(view.reveal);
            c.restore();
        }
        c.restore();
        // small places get a pulsing target ring so they're never invisible
        if (view.labelXY && !view.dim) {
            const sx = W / 2 + (view.labelXY[0] - cam.cx) * s, sy = H / 2 + (view.labelXY[1] - cam.cy) * s;
            const ringR = 16 + pulse * 10;
            c.strokeStyle = `rgba(125,211,252,${0.9 - pulse * 0.5})`; c.lineWidth = 2;
            c.beginPath(); c.arc(sx, sy, ringR, 0, Math.PI * 2); c.stroke();
            c.strokeStyle = 'rgba(125,211,252,0.35)';
            c.beginPath(); c.arc(sx, sy, ringR + 12 + pulse * 6, 0, Math.PI * 2); c.stroke();
            // crosshair ticks
            c.strokeStyle = 'rgba(224,242,254,0.8)'; c.lineWidth = 1.5;
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { c.beginPath(); c.moveTo(sx + dx * (ringR + 4), sy + dy * (ringR + 4)); c.lineTo(sx + dx * (ringR + 12), sy + dy * (ringR + 12)); c.stroke(); });
        }
        // radar sweep line
        const sweepY = ((t / 2600) % 1) * (H + 80) - 40;
        const sg = c.createLinearGradient(0, sweepY - 40, 0, sweepY + 4);
        sg.addColorStop(0, 'rgba(56,189,248,0)'); sg.addColorStop(1, 'rgba(56,189,248,0.10)');
        c.fillStyle = sg; c.fillRect(0, sweepY - 40, W, 44);
        // flash on a right answer
        if (FX.flashGood > 0) { c.fillStyle = `rgba(34,197,94,${FX.flashGood * 0.22})`; c.fillRect(0, 0, W, H); }
        if (now() < stalledUntil) {
            const a = 0.10 + 0.06 * Math.sin(t / 60);
            c.fillStyle = `rgba(239,68,68,${a})`; c.fillRect(0, 0, W, H);
        }
    }

    // ==========================================
    // RACE TRACK (rockets, flames, stars, asteroids, the Moon)
    // ==========================================
    const trackCv = $('sr-track'), tc = trackCv.getContext('2d');
    const FX = { shake: 0, flashGood: 0, liftoff: 0, finaleStart: 0, particles: [], asteroids: [], stars: [], confetti: [] };
    function makeStars() {
        FX.stars = [];
        for (let i = 0; i < 160; i++) FX.stars.push({ x: Math.random(), y: Math.random(), z: Math.random() * 0.9 + 0.1, tw: Math.random() * 6 });
    }
    makeStars();

    function geometry() {
        const W = trackCv.clientWidth, H = trackCv.clientHeight;
        const earthR = Math.min(H * 0.9, 150), moonR = Math.min(H * 0.42, 90);
        const startX = Math.max(52, earthR * 0.55 + 26), endX = W - moonR * 0.9 - 34;
        const top = Math.max(84, H * 0.3), bottom = H - 16;
        const laneY = i => top + (bottom - top) * (racers.length > 1 ? i / (racers.length - 1) : 0.5);
        return { W, H, earthR, moonR, startX, endX, laneY };
    }
    function rocketPos(rc, G) {
        const x = lerp(G.startX, G.endX, rc.dp) - rc.knock;
        const y = G.laneY(rc.lane) + Math.sin(now() / 400 + rc.wobble) * 1.6;
        return [x, y];
    }
    function burst(rc, kind, n) {
        if (!trackCv.clientWidth) return;
        const G = geometry(); const [x, y] = rocketPos(rc, G);
        for (let i = 0; i < n; i++) {
            if (kind === 'smoke') FX.particles.push({ x: x - 10, y: y + (Math.random() - 0.5) * 8, vx: -40 - Math.random() * 90, vy: (Math.random() - 0.5) * 60, life: 0, max: 0.9 + Math.random() * 0.8, size: 6 + Math.random() * 10, kind: 'smoke' });
            if (kind === 'thrust') FX.particles.push({ x: x - 14, y, vx: -160 - Math.random() * 220, vy: (Math.random() - 0.5) * 70, life: 0, max: 0.35 + Math.random() * 0.35, size: 3 + Math.random() * 5, kind: 'fire', hue: rc.kind === 'ghost' ? 'ghost' : 'fire' });
            if (kind === 'spark') FX.particles.push({ x, y, vx: (Math.random() - 0.5) * 380, vy: (Math.random() - 0.5) * 380, life: 0, max: 0.4 + Math.random() * 0.5, size: 1.5 + Math.random() * 2.5, kind: 'spark' });
            if (kind === 'dust') FX.particles.push({ x: x + (Math.random() - 0.5) * 20, y: y + 8, vx: (Math.random() - 0.5) * 140, vy: -Math.random() * 90, life: 0, max: 0.8 + Math.random() * 0.8, size: 3 + Math.random() * 6, kind: 'dust' });
        }
    }
    function asteroidHit(rc) {
        const G = geometry(); const [x, y] = rocketPos(rc, G);
        FX.asteroids.push({ rc, sx: x + 140 + Math.random() * 60, sy: -30, tx: x + 6, ty: y, t0: now(), dur: 420, rot: Math.random() * 6, size: rc === me ? 13 : 8, hit: false });
    }

    function drawRocket(c, x, y, scale, color, opts = {}) {
        const { ghost = false, flame = 1, boost = false, t = 0 } = opts;
        c.save();
        c.translate(x, y); c.scale(scale, scale);
        if (ghost) { c.globalAlpha = 0.78 + 0.14 * Math.sin(t / 90); c.shadowColor = 'rgba(167,139,250,0.9)'; c.shadowBlur = 12; }
        // flame
        const fl = (boost ? 1.8 : 1) * flame * (0.85 + 0.25 * Math.sin(t / 30) + Math.random() * 0.12);
        const fg = c.createLinearGradient(-16, 0, -16 - 30 * fl, 0);
        if (ghost) { fg.addColorStop(0, 'rgba(196,181,253,0.95)'); fg.addColorStop(1, 'rgba(129,140,248,0)'); }
        else { fg.addColorStop(0, '#fff7ed'); fg.addColorStop(0.25, '#fde047'); fg.addColorStop(0.6, '#f97316'); fg.addColorStop(1, 'rgba(239,68,68,0)'); }
        c.fillStyle = fg;
        c.beginPath(); c.moveTo(-15, -5); c.quadraticCurveTo(-16 - 34 * fl, 0, -15, 5); c.closePath(); c.fill();
        if (boost && !ghost) {
            c.fillStyle = 'rgba(125,211,252,0.85)';
            c.beginPath(); c.moveTo(-15, -2.5); c.quadraticCurveTo(-16 - 50 * fl, 0, -15, 2.5); c.closePath(); c.fill();
        }
        // fins
        c.fillStyle = ghost ? 'rgba(167,139,250,0.7)' : color;
        c.beginPath(); c.moveTo(-12, -6); c.lineTo(-19, -13); c.lineTo(-6, -6); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(-12, 6); c.lineTo(-19, 13); c.lineTo(-6, 6); c.closePath(); c.fill();
        // body
        const bg = c.createLinearGradient(0, -7, 0, 7);
        if (ghost) { bg.addColorStop(0, 'rgba(237,233,254,0.9)'); bg.addColorStop(1, 'rgba(139,92,246,0.6)'); }
        else { bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.55, '#cbd5e1'); bg.addColorStop(1, '#64748b'); }
        c.fillStyle = bg;
        c.beginPath();
        c.moveTo(-15, -6); c.lineTo(8, -6.5); c.quadraticCurveTo(22, -5, 26, 0); c.quadraticCurveTo(22, 5, 8, 6.5); c.lineTo(-15, 6); c.closePath(); c.fill();
        // nose + stripe in racer color
        c.fillStyle = ghost ? 'rgba(196,181,253,0.9)' : color;
        c.beginPath(); c.moveTo(14, -5.6); c.quadraticCurveTo(22, -5, 26, 0); c.quadraticCurveTo(22, 5, 14, 5.6); c.closePath(); c.fill();
        c.fillRect(-9, -6.2, 3, 12.4);
        // window
        c.fillStyle = ghost ? 'rgba(221,214,254,0.9)' : '#0ea5e9';
        c.beginPath(); c.arc(3, 0, 3.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(2, -1, 1.1, 0, Math.PI * 2); c.fill();
        // hologram scanlines on ghosts
        if (ghost) { c.globalAlpha *= 0.5; c.fillStyle = '#c4b5fd'; for (let yy = -6; yy < 7; yy += 2.5) c.fillRect(-15, yy, 41, 0.6); }
        c.restore();
    }

    function drawEarth(c, G, t) {
        const ex = -G.earthR * 0.45, ey = G.H * 0.55, r = G.earthR;
        const atm = c.createRadialGradient(ex, ey, r * 0.9, ex, ey, r * 1.35);
        atm.addColorStop(0, 'rgba(56,189,248,0.45)'); atm.addColorStop(1, 'rgba(56,189,248,0)');
        c.fillStyle = atm; c.beginPath(); c.arc(ex, ey, r * 1.35, 0, Math.PI * 2); c.fill();
        const eg = c.createRadialGradient(ex + r * 0.35, ey - r * 0.35, r * 0.1, ex, ey, r);
        eg.addColorStop(0, '#60a5fa'); eg.addColorStop(0.6, '#1d4ed8'); eg.addColorStop(1, '#0c1e4a');
        c.fillStyle = eg; c.beginPath(); c.arc(ex, ey, r, 0, Math.PI * 2); c.fill();
        // drifting continents
        c.save(); c.beginPath(); c.arc(ex, ey, r, 0, Math.PI * 2); c.clip();
        c.fillStyle = 'rgba(74,222,128,0.55)';
        const off = (t / 120) % (r * 4);
        for (let i = 0; i < 5; i++) {
            const bx = ex - r * 2 + ((i * r * 0.9 + off) % (r * 4)), by = ey - r * 0.5 + (i % 3) * r * 0.35;
            c.beginPath(); c.ellipse(bx, by, r * 0.28, r * 0.16, i, 0, Math.PI * 2); c.fill();
        }
        c.fillStyle = 'rgba(255,255,255,0.18)';
        for (let i = 0; i < 4; i++) { const bx = ex - r + ((i * r * 0.7 + off * 1.6) % (r * 3)); c.beginPath(); c.ellipse(bx, ey - r * 0.2 + i * r * 0.2, r * 0.3, r * 0.05, 0.2, 0, Math.PI * 2); c.fill(); }
        c.restore();
    }
    function drawMoon(c, G, t, zoom) {
        const mx = G.W + G.moonR * 0.1, my = G.H * 0.5, r = G.moonR;
        const glow = c.createRadialGradient(mx, my, r * 0.8, mx, my, r * 1.8);
        glow.addColorStop(0, 'rgba(254,243,199,0.35)'); glow.addColorStop(1, 'rgba(254,243,199,0)');
        c.fillStyle = glow; c.beginPath(); c.arc(mx, my, r * 1.8, 0, Math.PI * 2); c.fill();
        const mg = c.createRadialGradient(mx - r * 0.4, my - r * 0.4, r * 0.1, mx, my, r);
        mg.addColorStop(0, '#f8fafc'); mg.addColorStop(0.7, '#cbd5e1'); mg.addColorStop(1, '#64748b');
        c.fillStyle = mg; c.beginPath(); c.arc(mx, my, r, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(100,116,139,0.45)';
        [[-0.4, -0.3, 0.18], [-0.1, 0.35, 0.13], [-0.55, 0.25, 0.1], [0.05, -0.5, 0.09], [-0.7, -0.05, 0.07]].forEach(([dx, dy, rr]) => {
            c.beginPath(); c.arc(mx + dx * r, my + dy * r, rr * r, 0, Math.PI * 2); c.fill();
        });
        // landing beacons
        c.fillStyle = `rgba(251,191,36,${(0.5 + 0.5 * Math.sin(t / 200)) * (1 - zoom)})`;
        racers.forEach((rc, i) => { const y = G.laneY(i); c.beginPath(); c.arc(G.endX + 18, y, 2.5, 0, Math.PI * 2); c.fill(); });
    }

    let lastT = now();
    function frame() {
        const t = now(), dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
        if (state !== 'lobby') {
            updateRace(t, dt);
            drawTrack(t, dt);
            drawMap(t);
            if (state === 'racing') $('sr-clock').textContent = fmtTime(raceTime());
        }
        FX.flashGood = Math.max(0, FX.flashGood - dt * 2.5);
        requestAnimationFrame(frame);
    }

    function updateRace(t, dt) {
        const rt = raceTime();
        for (const rc of racers) {
            if (rc.kind !== 'you' && (state === 'racing' || state === 'finale' || state === 'done')) {
                // replay the bot/ghost's saved run
                let n = 0; while (n < rc.splits.length && rc.splits[n] <= rt) n++;
                if (n > rc.count) {
                    rc.count = n; rc.p = n / TARGET; burst(rc, 'thrust', 14);
                    if (n === TARGET && !rc.finished) {
                        rc.finished = true; burst(rc, 'dust', 20);
                        if (state === 'racing') { feedbackRival(`${rc.name} landed!`); SFX.rival(); }
                    }
                }
                while (rc.missIdx < rc.misses.length && rc.misses[rc.missIdx] <= rt) { rc.missIdx++; asteroidHit(rc); }
            }
            rc.dp += (rc.p - rc.dp) * Math.min(1, dt * 5);
            rc.knock *= Math.pow(0.02, dt);
        }
        FX.shake *= Math.pow(0.004, dt);
    }
    let rivalTimer = 0;
    function feedbackRival(text) {
        const el = $('sr-map-tag');
        const old = q ? q.tag : '';
        el.textContent = '🚀 ' + text; el.style.color = '#fcd34d';
        clearTimeout(rivalTimer); rivalTimer = setTimeout(() => { el.textContent = q ? q.tag : old; el.style.color = ''; }, 1800);
    }

    function drawTrack(t, dt) {
        const G = geometry(), c = tc, dpr = trackCv._dpr || 1;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        // finale camera: zoom toward the Moon
        const fin = FX.finaleStart && (state === 'finale' || state === 'done');
        const ft = fin ? easeInOut(clamp((t - FX.finaleStart) / 1900, 0, 1)) : 0;
        const moonX = G.W + G.moonR * 0.1, moonY = G.H * 0.5;
        const camZ = 1 + ft * 0.55;
        const camX = lerp(G.W / 2, moonX - G.moonR * 0.15, ft), camY = lerp(G.H * 0.5, moonY - G.moonR * 1.0, ft);
        // background
        const bg = c.createLinearGradient(0, 0, G.W, 0);
        bg.addColorStop(0, '#071228'); bg.addColorStop(0.5, '#0a0f2c'); bg.addColorStop(1, '#170d33');
        c.fillStyle = bg; c.fillRect(0, 0, G.W, G.H);
        // stars (parallax; speed up with your rocket)
        const speed = (state === 'racing' ? 40 : 10) + (me && me.boostUntil > t ? 260 : 0) + (me ? Math.abs(me.p - me.dp) * 1400 : 0);
        for (const s of FX.stars) {
            s.x -= (speed * s.z * dt) / G.W; if (s.x < 0) { s.x += 1; s.y = Math.random(); }
            const a = 0.35 + 0.65 * Math.abs(Math.sin(t / 700 + s.tw));
            c.fillStyle = `rgba(226,232,240,${a * s.z})`;
            const len = me && me.boostUntil > t ? 10 * s.z : 0;
            c.fillRect(s.x * G.W - len, s.y * G.H, 1.2 * s.z + len, 1.2 * s.z);
        }
        c.save();
        const sh = FX.shake;
        c.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
        if (fin) { c.translate(G.W / 2, G.H * 0.5); c.scale(camZ, camZ); c.translate(-camX, -camY); }
        drawEarth(c, G, t);
        drawMoon(c, G, t, ft);
        // lanes
        c.save(); c.globalAlpha = 1 - ft;
        racers.forEach((rc) => {
            const i = rc.lane, y = G.laneY(i);
            c.strokeStyle = rc === me ? 'rgba(56,189,248,0.28)' : 'rgba(148,163,184,0.12)';
            c.setLineDash([6, 10]); c.lineDashOffset = -t / 30; c.lineWidth = 1;
            c.beginPath(); c.moveTo(G.startX, y); c.lineTo(G.endX, y); c.stroke();
            c.setLineDash([]);
            // progress ticks
            for (let k = 1; k < TARGET; k++) {
                const x = lerp(G.startX, G.endX, k / TARGET);
                c.fillStyle = k <= rc.count ? (rc === me ? 'rgba(56,189,248,0.7)' : 'rgba(148,163,184,0.35)') : 'rgba(148,163,184,0.12)';
                c.fillRect(x - 0.5, y - 3, 1, 6);
            }
        });
        c.restore();
        // particles behind rockets
        updateParticles(c, dt);
        // rockets
        const scale = clamp(G.H / 230, 0.7, 1.25);
        racers.forEach(rc => {
            if (fin && rc === me) return;            // you get the landing animation instead
            const [x, y] = rocketPos(rc, G);
            c.save(); if (fin) c.globalAlpha = 1 - ft; if (rc.left && !rc.finished) c.globalAlpha *= 0.3;
            const moving = Math.abs(rc.p - rc.dp) > 0.002;
            if (state === 'racing' && Math.random() < (moving ? 0.9 : 0.25)) {
                FX.particles.push({ x: x - 16 * scale, y: y + (Math.random() - 0.5) * 3, vx: -60 - Math.random() * 80 - (moving ? 200 : 0), vy: (Math.random() - 0.5) * 20, life: 0, max: 0.3 + Math.random() * 0.3, size: 2 + Math.random() * 3, kind: 'fire', hue: rc.kind === 'ghost' ? 'ghost' : 'fire' });
            }
            if (rc === me) {
                const halo = c.createRadialGradient(x, y, 2, x, y, 34 * scale);
                halo.addColorStop(0, 'rgba(56,189,248,0.25)'); halo.addColorStop(1, 'rgba(56,189,248,0)');
                c.fillStyle = halo; c.beginPath(); c.arc(x, y, 34 * scale, 0, Math.PI * 2); c.fill();
            }
            drawRocket(c, x, y, scale * (rc === me ? 1.15 : 1), rc.color, { ghost: rc.kind === 'ghost', flame: state === 'countdown' ? 0.4 : moving ? 1.5 : 0.8, boost: rc.boostUntil > t, t: t + rc.wobble * 100 });
            // name tag
            c.font = `700 ${Math.round(11 * scale)}px Rajdhani, sans-serif`;
            c.textAlign = 'center';
            const label = rc === me ? (raceMode === 'room' ? me.name : storedName() || 'YOU') : rc.name;
            c.fillStyle = rc === me ? '#7dd3fc' : rc.kind === 'ghost' ? '#c4b5fd' : 'rgba(226,232,240,0.75)';
            c.fillText((rc.kind === 'ghost' ? '👻 ' : rc.kind === 'bot' ? '🤖 ' : rc.kind === 'friend' ? '🧑‍🚀 ' : '') + label + (rc.left && !rc.finished ? ' (left)' : ''), x, y - 15 * scale);
            if (rc.finished && rc.kind !== 'you') { c.fillStyle = '#fbbf24'; c.fillText('🚩', x + 30 * scale, y + 4); }
            c.restore();
        });
        // asteroids
        for (let i = FX.asteroids.length - 1; i >= 0; i--) {
            const a = FX.asteroids[i], p = clamp((t - a.t0) / a.dur, 0, 1);
            const ax = lerp(a.sx, a.tx, p), ay = lerp(a.sy, a.ty, easeOut(p));
            if (p < 1) {
                c.save(); c.translate(ax, ay); c.rotate(a.rot + p * 8);
                const ag = c.createRadialGradient(-a.size * 0.3, -a.size * 0.3, 1, 0, 0, a.size);
                ag.addColorStop(0, '#a8a29e'); ag.addColorStop(1, '#44403c');
                c.fillStyle = ag; c.beginPath();
                for (let k = 0; k < 9; k++) { const ang = k / 9 * Math.PI * 2, rr = a.size * (0.75 + 0.25 * Math.sin(k * 2.3)); k ? c.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : c.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
                c.closePath(); c.fill();
                c.restore();
                // fiery trail
                FX.particles.push({ x: ax, y: ay, vx: 40, vy: -60, life: 0, max: 0.35, size: a.size * 0.6, kind: 'fire', hue: 'fire' });
            } else if (!a.hit) {
                a.hit = true;
                a.rc.knock = Math.min(60, a.rc.knock + (a.rc === me ? 46 : 26));
                burst(a.rc, 'spark', a.rc === me ? 36 : 14);
                if (a.rc === me) FX.shake = 16;
            }
            if (p >= 1 && t - a.t0 > a.dur + 50) FX.asteroids.splice(i, 1);
        }
        // finale: your rocket arcs over, flips upright and lands on top of the Moon
        if (fin && me) drawLanding(c, G, t, scale, moonX, moonY);
        c.restore();
        drawConfetti(c, G, dt);
        // vignette
        const vg = c.createRadialGradient(G.W / 2, G.H / 2, G.H * 0.3, G.W / 2, G.H / 2, G.W * 0.7);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
        c.fillStyle = vg; c.fillRect(0, 0, G.W, G.H);
    }

    function drawLanding(c, G, t, scale, moonX, moonY) {
        const lt = clamp((t - FX.finaleStart) / 1900, 0, 1);
        const s = scale * 1.25;
        const [sx, sy] = [lerp(G.startX, G.endX, me.dp), G.laneY(me.lane)];
        const padX = moonX - G.moonR * 0.2, padY = moonY - Math.sqrt(G.moonR * G.moonR - Math.pow(G.moonR * 0.2, 2)) - 19 * s;
        // curved approach: up and over, then straight down
        const ctrlX = lerp(sx, padX, 0.7), ctrlY = Math.min(sy, padY) - G.H * 0.35;
        const e = easeInOut(lt);
        const x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * ctrlX + e * e * padX;
        const y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * ctrlY + e * e * padY;
        const rot = -Math.PI / 2 * easeInOut(clamp((lt - 0.35) / 0.55, 0, 1));
        const landed = lt >= 1;
        if (landed && !FX.landedDust) {
            FX.landedDust = true;
            for (let i = 0; i < 70; i++) FX.particles.push({ x: padX + (Math.random() - 0.5) * 30, y: padY + 16 * s, vx: (Math.random() - 0.5) * 240, vy: -Math.random() * 70, life: 0, max: 0.9 + Math.random() * 1.1, size: 2 + Math.random() * 4, kind: 'dust' });
            FX.shake = 10; FX.flagAt = t;
        }
        // retro-flame while descending
        if (!landed && lt > 0.6 && Math.random() < 0.9) FX.particles.push({ x: x, y: y + 18 * s, vx: (Math.random() - 0.5) * 50, vy: 160 + Math.random() * 120, life: 0, max: 0.25, size: 3 + Math.random() * 3, kind: 'fire', hue: 'fire' });
        c.save(); c.translate(x, y); c.rotate(rot);
        drawRocket(c, 0, 0, s, me.color, { flame: landed ? 0 : 1.4, t });
        c.restore();
        // planted flag, waving
        if (FX.flagAt) {
            const ft2 = clamp((t - FX.flagAt) / 500, 0, 1);
            const fx = padX + 26 * s, baseY = padY + 18 * s, poleH = 30 * s * easeOut(ft2);
            c.strokeStyle = '#e2e8f0'; c.lineWidth = 1.6;
            c.beginPath(); c.moveTo(fx, baseY); c.lineTo(fx, baseY - poleH); c.stroke();
            if (ft2 >= 1) {
                c.fillStyle = me.color;
                c.beginPath(); c.moveTo(fx, baseY - poleH);
                for (let i = 0; i <= 10; i++) { const px = fx + i * 1.8 * s, py = baseY - poleH + Math.sin(t / 140 + i * 0.7) * 1.5; c.lineTo(px, py); }
                for (let i = 10; i >= 0; i--) { const px = fx + i * 1.8 * s, py = baseY - poleH + 11 * s + Math.sin(t / 140 + i * 0.7) * 1.5; c.lineTo(px, py); }
                c.closePath(); c.fill();
            }
            c.font = `900 ${Math.round(12 * s)}px Orbitron, sans-serif`; c.textAlign = 'center';
            c.fillStyle = `rgba(253,230,138,${ft2})`;
            c.fillText((raceMode === 'room' ? me.name : storedName()) || 'YOU', padX, padY - 30 * s);
        }
    }

    function updateParticles(c, dt) {
        const ps = FX.particles;
        if (ps.length > 900) ps.splice(0, ps.length - 900);
        for (let i = ps.length - 1; i >= 0; i--) {
            const p = ps[i];
            p.life += dt; if (p.life >= p.max) { ps.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt;
            const k = p.life / p.max;
            if (p.kind === 'fire') {
                p.vx *= 0.96;
                const a = 1 - k;
                c.fillStyle = p.hue === 'ghost' ? `rgba(196,181,253,${a * 0.8})` : k < 0.25 ? `rgba(254,240,138,${a})` : k < 0.55 ? `rgba(251,146,60,${a})` : `rgba(239,68,68,${a * 0.7})`;
                c.beginPath(); c.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2); c.fill();
            } else if (p.kind === 'smoke') {
                p.vx *= 0.97; p.vy *= 0.97;
                c.fillStyle = `rgba(203,213,225,${(1 - k) * 0.35})`;
                c.beginPath(); c.arc(p.x, p.y, p.size * (1 + k * 1.8), 0, Math.PI * 2); c.fill();
            } else if (p.kind === 'spark') {
                c.fillStyle = `rgba(253,224,71,${1 - k})`;
                c.fillRect(p.x, p.y, p.size, p.size);
            } else if (p.kind === 'dust') {
                p.vy += 60 * dt;
                p.vx *= 0.97;
                c.fillStyle = `rgba(148,163,184,${(1 - k) * 0.45})`;
                c.beginPath(); c.arc(p.x, p.y, p.size * (0.6 + k * 0.8), 0, Math.PI * 2); c.fill();
            }
        }
    }
    function confettiRain() {
        const W = trackCv.clientWidth;
        const colors = ['#38bdf8', '#fbbf24', '#f472b6', '#a3e635', '#c084fc', '#fb7185'];
        for (let i = 0; i < 140; i++) FX.confetti.push({ x: Math.random() * W, y: -10 - Math.random() * 200, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 120, r: Math.random() * 6, vr: (Math.random() - 0.5) * 10, c: colors[i % colors.length], life: 0 });
    }
    function drawConfetti(c, G, dt) {
        for (let i = FX.confetti.length - 1; i >= 0; i--) {
            const p = FX.confetti[i]; p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
            if (p.y > G.H + 20) { FX.confetti.splice(i, 1); continue; }
            c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.c; c.fillRect(-3, -1.5, 6, 3); c.restore();
        }
    }

    // ---------- canvas sizing ----------
    function sizeCanvas(cv) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = cv.clientWidth, h = cv.clientHeight;
        if (!w || !h) return;
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv._dpr = dpr;
    }
    function resize() { sizeCanvas(trackCv); sizeCanvas(mapCv); }
    window.addEventListener('resize', resize);


    // ==========================================
    // ROOMS: private rooms + quick match (Supabase Realtime)
    // Presence = who is in the room (and the host's settings).
    // Broadcast = start, each right answer, misses, finishes, rematch.
    // ==========================================
    const CLIENT_ID = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)) ;
    const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O, so codes are easy to read out loud
    const MAX_PLAYERS = 6;
    const QUICK_WAIT_MS = 15000;
    const Room = {
        code: null, ch: null, quick: false, joinedAt: 0, players: [], hostId: null,
        settings: { set: 'mixed', target: 12, bots: true }, racing: false, roster: null,
        lobbyCh: null, quickCreated: 0, quickTimer: 0, tickTimer: 0, startedRace: false,

        get isHost() { return this.hostId === CLIENT_ID; },
        newCode() { let c = ''; for (let i = 0; i < 4; i++) c += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]; return c; },

        async ensureName() {
            let n = storedName();
            if (!n) n = await askName('Pick a name so the other racers know who you are.');
            if (!n) n = 'Racer-' + CLIENT_ID.slice(0, 4).toUpperCase();
            renderCallsign();
            return n;
        },

        async open(code, opts = {}) {
            if (!sb) { alert('Online play needs an internet connection. Please try again.'); return; }
            await this.leave(true);
            this.code = code.toUpperCase(); this.quick = !!opts.quick; this.joinedAt = Date.now();
            this.settings = opts.quick ? { set: 'mixed', target: 12, bots: true } : { set: 'mixed', target: 12, bots: true };
            this.players = []; this.hostId = null; this.racing = false; this.roster = null; this.startedRace = false; this._sig = null;
            this.myName = await this.ensureName();
            showScreen('sr-room');
            this.render();
            try { history.replaceState(null, '', opts.quick ? 'space-race.html' : `space-race.html?room=${this.code}`); } catch (e) {}
            const ch = sb.channel('sr-room-' + this.code, { config: { broadcast: { self: false }, presence: { key: CLIENT_ID } } });
            this.ch = ch;
            ch.on('presence', { event: 'sync' }, () => this.onPresence());
            ch.on('broadcast', { event: 'start' }, ({ payload }) => this.onStart(payload));
            ch.on('broadcast', { event: 'prog' }, ({ payload }) => this.onProg(payload));
            ch.on('broadcast', { event: 'miss' }, ({ payload }) => this.onMiss(payload));
            ch.on('broadcast', { event: 'fin' }, ({ payload }) => this.onFin(payload));
            ch.on('broadcast', { event: 'lobby' }, () => this.backToRoom());
            ch.subscribe(async status => {
                if (status === 'SUBSCRIBED') { await this.track(); }
                else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { $('sr-room-status').textContent = 'Connection problem. Trying again…'; }
            });
            // nobody here after a few seconds? tell them (they are now hosting this code)
            setTimeout(() => { if (this.ch === ch && this.players.length <= 1 && !this.quick) $('sr-room-status').innerHTML = `Nobody else is in room <b>${esc(this.code)}</b> yet. Share the code or link with your friends!`; }, 3500);
        },
        track() {
            if (!this.ch) return;
            const meta = { name: this.myName, joinedAt: this.joinedAt };
            if (this.isHost) { meta.settings = this.settings; meta.racing = this.racing; meta.quick = this.quick; meta.created = this.quickCreated; }
            return this.ch.track(meta);
        },
        onPresence() {
            if (!this.ch) return;
            const st = this.ch.presenceState();
            const list = Object.entries(st).map(([id, metas]) => ({ id, ...(metas[metas.length - 1] || {}) }));
            list.sort((a, b) => (a.joinedAt - b.joinedAt) || a.id.localeCompare(b.id));
            const prevHost = this.hostId;
            this.players = list;
            this.hostId = list.length ? list[0].id : CLIENT_ID;
            const host = list[0];
            if (host && host.id !== CLIENT_ID) {
                if (host.settings) this.settings = host.settings;
                this.racing = !!host.racing;
                if (host.quick) this.quick = true;
                if (host.created) this.quickCreated = host.created;
            }
            if (this.isHost && list[0] && list[0].id === CLIENT_ID && !list[0].settings) this.track();   // I'm host: publish settings
            // full room: the late arrivals leave
            const myIdx = list.findIndex(p => p.id === CLIENT_ID);
            if (myIdx >= MAX_PLAYERS) { alert(`Room ${this.code} is full (${MAX_PLAYERS} racers).`); this.leave(); return; }
            // racers who left mid-race
            if (racers.length && raceMode === 'room') {
                const here = new Set(list.map(p => p.id));
                racers.forEach(rc => { if (rc.kind === 'friend' && !here.has(rc.id) && !rc.left) { rc.left = true; if (!rc.finished) feedbackRival(`${rc.name} left the race`); } });
                if (!$('sr-results').classList.contains('hidden')) { renderStandings(); this.renderResultButtons(); }
            }
            if (this.quick) this.quickHostCheck();
            this.render();
        },

        // ---------- room screen ----------
        render() {
            if (!this.code) return;
            $('sr-room-title').textContent = this.quick ? '⚡ QUICK MATCH' : '🔒 PRIVATE ROOM';
            $('sr-room-code').textContent = this.quick ? 'ONLINE' : this.code;
            document.querySelector('.sr-room-code-label').textContent = this.quick ? 'PUBLIC RACE' : 'ROOM CODE';
            $('sr-room-share').classList.toggle('hidden', this.quick);
            $('sr-room-link').textContent = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}space-race.html?room=${this.code}`;
            const humans = this.players.slice(0, MAX_PLAYERS);
            const sig = humans.map(p => p.id + p.name).join('|') + this.hostId;
            if (sig !== this._sig) $('sr-room-players').innerHTML = humans.map((p, i) => `<div class="sr-lane-chip"><span class="dot" style="background:${COLORS[i % COLORS.length]};color:${COLORS[i % COLORS.length]}"></span>
                <span class="nm">${esc(p.name || 'Racer')}${p.id === CLIENT_ID ? ' (you)' : ''}</span>
                <span class="tag ${i === 0 ? 'tag-ghost' : 'tag-you'}">${i === 0 ? '👑 HOST' : 'READY'}</span></div>`).join('') || '<div class="sr-muted">Connecting…</div>';
            this._sig = sig;
            // settings: host can change them, everyone else sees them
            const st = this.settings;
            document.querySelectorAll('#sr-room-settings [data-set]').forEach(b => { b.classList.toggle('active', b.dataset.set === st.set); b.disabled = !this.isHost; });
            document.querySelectorAll('#sr-room-settings [data-target]').forEach(b => { b.classList.toggle('active', +b.dataset.target === st.target); b.disabled = !this.isHost; });
            document.querySelectorAll('#sr-room-settings [data-bots]').forEach(b => { b.classList.toggle('active', (b.dataset.bots === 'on') === st.bots); b.disabled = !this.isHost; });
            $('sr-room-settings').classList.toggle('hidden', this.quick);
            const startBtn = $('sr-room-start');
            startBtn.classList.toggle('hidden', !this.isHost);
            startBtn.disabled = this.racing;
            startBtn.textContent = this.quick ? '🚀 LAUNCH NOW' : humans.length < 2 && !st.bots ? '🚀 START (add a friend or turn bots on)' : '🚀 START RACE';
            if (this.isHost && !this.quick && humans.length < 2 && !st.bots) startBtn.disabled = true;
            let status = '';
            if (this.racing && !this.startedRace) status = 'A race is in progress. You\'ll join the next one!';
            else if (this.quick) status = '';
            else if (this.isHost) status = humans.length > 1 ? `${humans.length} racers in the room. Press start when everyone is here!` : 'Share the code with your friends, then press start.';
            else status = 'Waiting for the host to start the race…';
            if (status) $('sr-room-status').textContent = status;
        },
        changeSetting(key, val) {
            if (!this.isHost) return;
            this.settings = { ...this.settings, [key]: val };
            this.track(); this.render();
        },

        // ---------- starting a race ----------
        hostStart() {
            if (!this.isHost || this.racing) return;
            const humans = this.players.slice(0, MAX_PLAYERS).map(p => ({ id: p.id, name: p.name || 'Racer' }));
            const st = this.settings;
            const nBots = st.bots ? Math.max(0, LANES - humans.length) : 0;
            const payload = { seed: this.code + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7), set: st.set, target: st.target, roster: humans, bots: nBots };
            this.racing = true; this.track();
            if (this.lobbyCh) { this.lobbyCh.untrack(); }
            clearInterval(this.tickTimer);
            this.ch.send({ type: 'broadcast', event: 'start', payload });
            this.onStart(payload);
        },
        onStart(payload) {
            this.racing = true;
            if (!payload.roster.some(r => r.id === CLIENT_ID)) { this.startedRace = false; this.render(); return; }   // joined too late: watch the next one
            clearInterval(this.tickTimer);
            this.startedRace = true;
            const r = rng(hashStr(payload.seed + 'bots'));
            const botNames = shuffle(BOT_NAMES, r), skills = shuffle(BOT_SKILLS, r);
            const field = payload.roster.map((p, i) => ({ id: p.id, name: p.id === CLIENT_ID ? this.myName : p.name, kind: p.id === CLIENT_ID ? 'you' : 'friend', color: COLORS[i % COLORS.length] }));
            for (let i = 0; i < payload.bots; i++) field.push({ name: botNames[i], kind: 'bot', skill: skills[i % skills.length].label, color: COLORS[(field.length) % COLORS.length] });
            TARGET = payload.target;
            startRace({ seed: payload.seed, set: payload.set, target: payload.target, field });
        },
        send(event, payload) {
            if (raceMode !== 'room' || !this.ch) return;
            this.ch.send({ type: 'broadcast', event, payload: { id: CLIENT_ID, ...payload } });
        },
        friend(id) { return racers.find(rc => rc.kind === 'friend' && rc.id === id); },
        onProg({ id, n }) {
            const rc = this.friend(id); if (!rc || n <= rc.count) return;
            rc.count = n; rc.p = n / TARGET; burst(rc, 'thrust', 14);
        },
        onMiss({ id }) { const rc = this.friend(id); if (rc) asteroidHit(rc); },
        onFin({ id, t }) {
            const rc = this.friend(id); if (!rc) return;
            rc.count = TARGET; rc.p = 1; rc.finished = true; rc.finish = t; burst(rc, 'dust', 20);
            if (state === 'racing') { feedbackRival(`${rc.name} landed!`); SFX.rival(); }
            if (!$('sr-results').classList.contains('hidden')) { renderStandings(); this.renderResultButtons(); }
        },

        // ---------- after the race ----------
        renderResultButtons() {
            const racing = racers.filter(rc => rc.kind === 'friend' && !rc.finished && !rc.left).length;
            const again = $('sr-room-again');
            if (this.quick) { again.textContent = '⚡ FIND ANOTHER MATCH'; again.disabled = false; }
            else if (this.isHost) { again.textContent = racing ? `🔁 REMATCH (${racing} still racing)` : '🔁 REMATCH'; again.disabled = false; }
            else { again.textContent = 'Waiting for the host to start a rematch…'; again.disabled = true; }
        },
        rematch() {
            if (this.quick) { this.leave(true).then(() => quickMatch()); return; }
            if (!this.isHost) return;
            this.racing = false; this.track();
            this.ch.send({ type: 'broadcast', event: 'lobby', payload: {} });
            this.backToRoom();
        },
        backToRoom() {
            if (!this.code) return;
            this.racing = false; this.startedRace = false;
            state = 'lobby'; raceMode = 'daily'; racers = [];
            $('sr-results').classList.add('hidden');
            showScreen('sr-room'); this.render();
        },
        async leave(silent) {
            clearInterval(this.tickTimer); clearTimeout(this.quickTimer);
            if (this.ch) { try { await this.ch.untrack(); sb.removeChannel(this.ch); } catch (e) {} }
            if (this.lobbyCh) { try { await this.lobbyCh.untrack(); sb.removeChannel(this.lobbyCh); } catch (e) {} }
            this.ch = null; this.lobbyCh = null; this.code = null; this.quick = false; this.players = []; this.racing = false; this.startedRace = false;
            try { history.replaceState(null, '', 'space-race.html'); } catch (e) {}
            if (silent) return;
            state = 'lobby'; raceMode = 'daily'; racers = [];
            $('sr-results').classList.add('hidden');
            showScreen('sr-lobby'); updateStartBtn(); buildLineup();
        },

        // ---------- quick match: the host launches after 15s (or when full), bots fill the rest ----------
        quickHostCheck() {
            if (this.racing || !this.quickCreated) return;
            const humans = this.players.length;
            if (humans >= LANES && this.isHost) { this.hostStart(); return; }
            clearInterval(this.tickTimer);
            const tick = () => {
                const left = Math.max(0, Math.ceil((this.quickCreated + QUICK_WAIT_MS - Date.now()) / 1000));
                $('sr-room-status').innerHTML = `🔎 Searching for racers… <b>${this.players.length}</b> found. Launching in <b>${left}s</b> (bots fill empty lanes)`;
                if (left <= 0 && this.isHost && !this.racing) this.hostStart();
            };
            tick(); this.tickTimer = setInterval(tick, 500);
        }
    };

    async function quickMatch() {
        if (!sb) { alert('Online play needs an internet connection. Please try again.'); return; }
        $('sr-quick-btn').disabled = true;
        try {
            await authReady;
            const lobby = sb.channel('sr-quick-lobby', { config: { presence: { key: CLIENT_ID } } });
            const open = await new Promise(resolve => {
                let done = false;
                const finish = v => { if (!done) { done = true; resolve(v); } };
                lobby.on('presence', { event: 'sync' }, () => {
                    const rooms = Object.values(lobby.presenceState()).map(m => m[m.length - 1]).filter(m => m && m.room && m.open && Date.now() - m.created < QUICK_WAIT_MS - 3000);
                    rooms.sort((a, b) => a.created - b.created);
                    finish(rooms[0] || null);
                });
                lobby.subscribe(st => { if (st === 'SUBSCRIBED') setTimeout(() => finish(null), 1500); });
                setTimeout(() => finish(null), 4000);
            });
            if (open) {
                sb.removeChannel(lobby);
                await Room.open(open.room, { quick: true });
            } else {
                const code = 'Q' + Room.newCode().slice(1);
                await Room.open(code, { quick: true });
                Room.lobbyCh = lobby;
                Room.quickCreated = Date.now();
                await lobby.track({ room: code, open: true, created: Room.quickCreated });
                Room.track();
                Room.quickHostCheck();
            }
        } finally { $('sr-quick-btn').disabled = false; }
    }

    // ---------- wiring ----------
    function setSoundBtn() { const b = $('sr-sound-btn'); b.textContent = soundOn ? '🔊 Sound: On' : '🔇 Sound: Off'; b.setAttribute('aria-pressed', soundOn); }
    $('sr-sound-btn').onclick = () => { soundOn = !soundOn; try { localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0'); } catch (e) {} setSoundBtn(); if (soundOn) SFX.beep(); };
    $('sr-start-btn').onclick = () => { if (lineupData) startRace(); };
    $('sr-quick-btn').onclick = () => { ac(); quickMatch(); };
    $('sr-create-btn').onclick = () => { ac(); Room.open(Room.newCode()); };
    const joinFromBox = () => {
        const code = $('sr-join-code').value.toUpperCase().replace(/[^A-Z]/g, '');
        if (code.length !== 4) { $('sr-join-code').classList.remove('shake'); void $('sr-join-code').offsetWidth; $('sr-join-code').classList.add('shake'); return; }
        ac(); Room.open(code);
    };
    $('sr-join-btn').onclick = joinFromBox;
    $('sr-join-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinFromBox(); });
    $('sr-join-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); });
    $('sr-room-start').onclick = () => { ac(); Room.hostStart(); };
    $('sr-room-leave').onclick = () => Room.leave();
    $('sr-room-again').onclick = () => Room.rematch();
    $('sr-room-exit').onclick = () => Room.leave();
    $('sr-room-copy').onclick = async () => {
        const link = $('sr-room-link').textContent;
        try { await navigator.clipboard.writeText(link); $('sr-room-copy').textContent = '✓ Copied!'; }
        catch (e) { $('sr-room-copy').textContent = 'Select the link to copy'; }
        setTimeout(() => { $('sr-room-copy').textContent = '📋 Copy link'; }, 1800);
    };
    document.querySelectorAll('#sr-room-settings [data-set]').forEach(b => b.onclick = () => Room.changeSetting('set', b.dataset.set));
    document.querySelectorAll('#sr-room-settings [data-target]').forEach(b => b.onclick = () => Room.changeSetting('target', +b.dataset.target));
    document.querySelectorAll('#sr-room-settings [data-bots]').forEach(b => b.onclick = () => Room.changeSetting('bots', b.dataset.bots === 'on'));
    window.addEventListener('pagehide', () => { if (Room.ch) Room.ch.untrack(); });
    $('sr-again-btn').onclick = async () => { $('sr-results').classList.add('hidden'); FX.finaleStart = 0; FX.landedDust = false; FX.flagAt = 0; FX.confetti = []; state = 'lobby'; showScreen('sr-lobby'); updateStartBtn(); await buildLineup(); };
    $('sr-abort-btn').onclick = abortRace;
    $('sr-lb-btn').onclick = () => { $('sr-lb').classList.remove('hidden'); fillLeaderboard($('sr-lb-list')); };
    $('sr-lb-close').onclick = () => $('sr-lb').classList.add('hidden');
    $('sr-go-btn').onclick = () => submit();
    $('sr-skip-btn').onclick = skip;
    $('sr-suggest').addEventListener('click', e => { const b = e.target.closest('.sr-chip'); if (b) submit(suggestions[+b.dataset.i]); });
    $('sr-input').addEventListener('input', () => { SFX.key(); renderSuggest(); });
    $('sr-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); moveHi(1); }
        else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); moveHi(-1); }
    });

    function updateStartBtn() {
        let off = null; try { off = localStorage.getItem(OFFICIAL_KEY + DAY); } catch (e) {}
        $('sr-start-btn').textContent = off ? '🚀 PRACTICE RACE' : "🚀 START TODAY'S RACE";
        $('sr-start-btn').disabled = !GEO.states;
    }

    (async function init() {
        $('sr-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
        setSoundBtn(); renderCallsign();
        try { await loadMaps(); } catch (e) { $('sr-start-btn').textContent = 'MAPS FAILED TO LOAD'; console.error(e); return; }
        await buildLineup();
        updateStartBtn();
        requestAnimationFrame(frame);
        const linkCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z]/g, '');
        if (linkCode.length === 4) Room.open(linkCode);
    })();

    // test hook (used by automated tests only)
    window.__spaceRace = { Room, CLIENT_ID, get raceMode() { return raceMode; }, get state() { return state; }, get q() { return q; }, get me() { return me; }, get racers() { return racers; }, submit, skip, DAY };
})();
