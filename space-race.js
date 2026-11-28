// ==========================================
// GEO-SPACERACE: SPACE RACE
// A typing race to the Moon. The map lights up a place, you type its name.
// 15 points land your rocket. You race bots plus "ghost" rockets that
// replay real players' runs from today (saved in Supabase).
// ==========================================
(function () {
    'use strict';
    const A = window.SRAnswers;

    // ---------- settings ----------
    const DAILY_TARGET = 15;           // points needed to land (daily race)
    let TARGET = DAILY_TARGET;         // rooms can choose 15 or 25
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
    const fmtDist = n => { const w = Math.floor(n + 1e-9), h = n - w > 0.25; return h ? (w ? w + '½' : '½') : String(w); };
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
    // play a little chiptune: notes like 'C5', 'Bb4' or 0 for a rest, each with a length in steps
    function song(notes, step, type, vol, delay = 0) {
        const N = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        let t = delay;
        for (const [n, len] of notes) {
            if (n) {
                const m = n.match(/^([A-G])(b|#)?(\d)$/);
                const midi = 12 * (+m[3] + 1) + N[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0);
                tone(440 * Math.pow(2, (midi - 69) / 12), len * step * 0.92, type, vol, 0, t);
            }
            t += len * step;
        }
    }
    const SFX = {
        beep: () => tone(660, 0.18, 'square', 0.09),
        // engines spooling up: a low, growing rumble (dur in seconds)
        rumble: dur => {
            if (!soundOn) return; const c = ac(); if (!c) return;
            const t = c.currentTime, end = t + dur;
            const f = c.createBiquadFilter(), g = c.createGain();
            f.type = 'lowpass'; f.frequency.setValueAtTime(140, t); f.frequency.exponentialRampToValueAtTime(900, end);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.5); g.gain.linearRampToValueAtTime(0.13, end - 0.05); g.gain.linearRampToValueAtTime(0.0001, end + 0.25);
            f.connect(g).connect(c.destination);
            [38, 40.5, 57].forEach(fr => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(fr, t); o.frequency.exponentialRampToValueAtTime(fr * 2.1, end); o.connect(f); o.start(t); o.stop(end + 0.3); });
            const len = Math.floor(c.sampleRate * (dur + 0.3)), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
            let last = 0; for (let i = 0; i < len; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 6; }   // rumbly brown noise
            const src = c.createBufferSource(); src.buffer = buf; src.connect(f); src.start(t);
        },
        // original "match starting" jingle (~2 seconds)
        matchStart: () => {
            song([['C5', 1], ['E5', 1], ['G5', 1], ['C6', 2], [0, 1], ['A5', 1], ['C6', 1], ['E6', 3], [0, 1], ['G5', 1], ['B5', 1], ['D6', 1], ['G6', 4]], 0.1, 'square', 0.05);
            song([['C3', 4], ['F3', 4], ['A3', 3], ['G3', 7]], 0.1, 'triangle', 0.13);
            [0, 4, 8, 11].forEach(i => noise(0.1, 0.08, 4000, 600, i * 0.1));
            noise(0.9, 0.06, 7000, 2000, 1.2);
        },
        go: () => { tone(990, 0.35, 'square', 0.1); noise(1.6, 0.28, 1400, 90); },
        correct: (streak) => { const b = 660 + Math.min(streak, 8) * 40; tone(b, 0.12, 'triangle', 0.14); tone(b * 1.5, 0.18, 'triangle', 0.12, 0, 0.07); noise(0.35, 0.06, 2500, 300); },
        boost: () => { tone(440, 0.5, 'sawtooth', 0.06, 900); noise(0.6, 0.12, 3000, 200); },
        wrong: () => { tone(160, 0.35, 'sawtooth', 0.13, -90); noise(0.45, 0.25, 600, 60); },
        key: () => tone(1800 + Math.random() * 400, 0.02, 'square', 0.015),
        land: (first) => { noise(0.8, 0.15, 900, 80); if (first) SFX.firstPlace(0.25); else SFX.victory(0.25); },
        // original "stage clear" fanfare for landing 1st (~7 seconds)
        firstPlace: (d = 0) => {
            const st = 0.1;
            SFX.until = performance.now() + (d + 70 * st) * 1000;
            song([['C5',1],['E5',1],['G5',1],['C6',2],['G5',1], ['A4',1],['C5',1],['E5',1],['A5',2],['E5',1],
                  ['F4',1],['A4',1],['C5',1],['F5',2],['A5',1], ['G4',1],['B4',1],['D5',1],['G5',2],['B5',1],
                  ['C6',2],['B5',1],['C6',1],['E6',2],['D6',1],['C6',1],['A5',2],['G5',2],
                  ['F5',1],['A5',1],['C6',1],['F6',2],['E6',1],['D6',2],['B5',2],['G5',2],
                  ['C6',1],['D6',1],['E6',1],['F6',1],['G6',1],[0,1],['G6',1],['G6',1],
                  ['G5',1],['E5',1],['G5',1],['B5',1],['C6',10]], st, 'square', 0.055, d);
            song([['E4',6],['C4',6],['A4',6],['B4',6], ['E5',6],['A4',6], ['A4',6],['B4',6],
                  ['B4',5],[0,1],['B4',2],['D5',4], ['E5',10]], st, 'triangle', 0.06, d);
            song([['G5',10]], st, 'triangle', 0.05, d + 60 * st);
            song([['C3',3],['G2',3],['A2',3],['E2',3],['F2',3],['C3',3],['G2',3],['D3',3],
                  ['C3',2],['G2',2],['C3',2],['F2',2],['C3',2],['F2',2],
                  ['F2',2],['C3',2],['F2',2],['G2',2],['D3',2],['G2',2],
                  ['G2',1],['G2',1],['G2',1],['G2',1],['G2',1],[0,1],['G2',1],['G2',1],['G2',4],
                  ['C3',10]], st, 'triangle', 0.14, d);
            for (let i = 0; i < 56; i += 2) noise(0.09, i % 4 ? 0.05 : 0.09, i % 4 ? 6000 : 3500, 500, d + i * st);
            [56, 57, 58, 59].forEach(i => noise(0.1, 0.09, 5000, 500, d + i * st));
            noise(1.6, 0.08, 8000, 2000, d + 60 * st);
            [1568, 2093, 2637, 3136, 4186].forEach((f, i) => tone(f, 0.3, 'triangle', 0.035, 0, d + 61 * st + i * 0.08));
        },
        // original touchdown fanfare (~3 seconds)
        victory: (d = 0) => {
            const st = 0.12;
            song([['G4',1],['C5',1],['E5',1],['G5',1],['C6',3],['B5',1],['A5',1],['F5',1],['A5',1],['C6',1],['G5',3],[0,1],
                  ['E5',1],['G5',1],['C6',1],['D6',1],['E6',6]], st, 'square', 0.055, d);
            song([['E4',4],['A4',4],['C5',4],['B4',4],['G4',2],['B4',2],['G5',6]], st, 'triangle', 0.07, d);
            song([['C3',4],['F3',4],['F3',4],['G3',4],['C3',2],['G3',2],['C3',6]], st, 'triangle', 0.14, d);
            [0, 4, 8, 12, 16, 18, 20].forEach(i => noise(0.12, 0.09, 4000, 600, d + i * st));
            noise(1.0, 0.07, 7000, 2000, d + 20 * st);
        },
        // original, bigger fanfare for a new personal best (~5 seconds)
        newBest: (d = 0) => {
            const st = 0.11;
            song([['G4',1],['G4',1],['C5',2],['E5',1],['G5',2],['E5',1],['C6',4],[0,1],
                  ['A4',1],['A4',1],['C5',2],['F5',1],['A5',2],['F5',1],['D6',4],[0,1],
                  ['Bb5',1],['C6',1],['D6',1],['F6',1],['E6',2],['D6',1],['C6',1],['D6',1],['E6',1],['G6',2],
                  ['C6',1],['E6',1],['G6',1],['C7',6]], st, 'square', 0.05, d);
            song([['E4',2],['G4',2],['E4',2],['G4',2],['G4',2],['E4',3],
                  ['F4',2],['A4',2],['F4',2],['A4',2],['F4',2],['B4',3],
                  ['D5',2],['F5',2],['D5',2],['B4',2],['D5',2],['F5',2],
                  ['G5',3],['E5',6]], st, 'triangle', 0.065, d);
            song([['C3',2],['G3',2],['C3',2],['G3',2],['C3',2],['E3',3],
                  ['F2',2],['C3',2],['F2',2],['C3',2],['D3',2],['G3',3],
                  ['Bb2',2],['F3',2],['G2',2],['D3',2],['G2',2],['B2',2],
                  ['C3',3],['C3',6]], st, 'triangle', 0.14, d);
            for (let i = 0; i < 38; i += 2) noise(0.1, i % 4 ? 0.06 : 0.1, 4000, 500, d + i * st);
            [38, 39, 40].forEach(i => noise(0.12, 0.1, 4000, 500, d + i * st));
            noise(1.4, 0.08, 8000, 2000, d + 41 * st);
            [2093, 2637, 3136, 4186].forEach((f, i) => tone(f, 0.25, 'triangle', 0.04, 0, d + 41 * st + i * 0.07));
        },
        rival: () => tone(330, 0.25, 'sine', 0.07, -60),
        // someone touched down on the Moon before you: a whoosh, a thud, and a sad "wah-wah"
        rivalLand: () => {
            noise(0.7, 0.22, 2600, 150);
            tone(90, 0.5, 'sine', 0.22, -40, 0.35);
            noise(0.35, 0.18, 500, 60, 0.35);
            tone(392, 0.32, 'triangle', 0.12, -20, 0.65);
            tone(349, 0.55, 'triangle', 0.12, -70, 0.98);
        },
        // a rare answer: sparkly arpeggio
        rare: () => { [880, 1175, 1568, 2093].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, 0, i * 0.06)); }
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

    // ---------- clue questions (answer is a state or a country, so the forgiving speller still works) ----------
    // [clue, answer, level]  level 1 = easy, 2 = medium, 3 = hard
    const CLUES = {
        usNick: [
            ['the Sunshine State', 'Florida', 1], ['the Lone Star State', 'Texas', 1], ['the Golden State', 'California', 1], ['the Empire State', 'New York', 1],
            ['the Aloha State', 'Hawaii', 1], ['the Last Frontier', 'Alaska', 1], ['the Grand Canyon State', 'Arizona', 1], ['the Peach State', 'Georgia', 1],
            ['the Garden State', 'New Jersey', 2], ['the Show-Me State', 'Missouri', 2], ['the Bluegrass State', 'Kentucky', 2], ['the Evergreen State', 'Washington', 2],
            ['the Volunteer State', 'Tennessee', 2], ['the Keystone State', 'Pennsylvania', 2], ['the Hoosier State', 'Indiana', 2], ['the Buckeye State', 'Ohio', 2],
            ['the Land of Lincoln', 'Illinois', 2], ['the Great Lakes State', 'Michigan', 2], ['the Bay State', 'Massachusetts', 2], ['the Silver State', 'Nevada', 2],
            ['the Beehive State', 'Utah', 2], ['the Centennial State', 'Colorado', 2], ['the Sooner State', 'Oklahoma', 2], ['the Pelican State', 'Louisiana', 2],
            ['the Land of 10,000 Lakes', 'Minnesota', 2], ['the Mount Rushmore State', 'South Dakota', 2], ['the Land of Enchantment', 'New Mexico', 2],
            ['the Magnolia State', 'Mississippi', 3], ['the Pine Tree State', 'Maine', 3], ['the Green Mountain State', 'Vermont', 3], ['the Granite State', 'New Hampshire', 3],
            ['the Ocean State', 'Rhode Island', 3], ['the Constitution State', 'Connecticut', 3], ['the First State', 'Delaware', 3], ['the Old Line State', 'Maryland', 3],
            ['the Mountain State', 'West Virginia', 3], ['the Tar Heel State', 'North Carolina', 3], ['the Palmetto State', 'South Carolina', 3], ['the Natural State', 'Arkansas', 3],
            ['the Treasure State', 'Montana', 3], ['the Equality State', 'Wyoming', 3], ['the Cornhusker State', 'Nebraska', 3], ['the Sunflower State', 'Kansas', 3],
            ['the Hawkeye State', 'Iowa', 3], ['the Badger State', 'Wisconsin', 3], ['the Peace Garden State', 'North Dakota', 3], ['the Beaver State', 'Oregon', 3],
            ['the Gem State', 'Idaho', 3], ['the Yellowhammer State', 'Alabama', 3], ['the Old Dominion', 'Virginia', 3]
        ],
        usCity: [
            ['Chicago', 'Illinois', 1], ['Miami', 'Florida', 1], ['Las Vegas', 'Nevada', 1], ['Los Angeles', 'California', 1], ['Seattle', 'Washington', 1],
            ['Dallas', 'Texas', 1], ['Detroit', 'Michigan', 1], ['New Orleans', 'Louisiana', 1], ['Philadelphia', 'Pennsylvania', 1], ['San Francisco', 'California', 1],
            ['Houston', 'Texas', 1], ['Orlando', 'Florida', 1],
            ['Memphis', 'Tennessee', 2], ['St. Louis', 'Missouri', 2], ['Minneapolis', 'Minnesota', 2], ['Milwaukee', 'Wisconsin', 2], ['Cleveland', 'Ohio', 2],
            ['Baltimore', 'Maryland', 2], ['Charlotte', 'North Carolina', 2], ['Anchorage', 'Alaska', 2], ['Pittsburgh', 'Pennsylvania', 2], ['Tampa', 'Florida', 2],
            ['San Diego', 'California', 2], ['Tucson', 'Arizona', 2], ['Buffalo', 'New York', 2], ['Louisville', 'Kentucky', 2], ['Savannah', 'Georgia', 2],
            ['Albuquerque', 'New Mexico', 3], ['Tulsa', 'Oklahoma', 3], ['Omaha', 'Nebraska', 3], ['Birmingham', 'Alabama', 3], ['Reno', 'Nevada', 3],
            ['Newark', 'New Jersey', 3], ['Spokane', 'Washington', 3], ['Wichita', 'Kansas', 3], ['Fargo', 'North Dakota', 3],
            ['Sioux Falls', 'South Dakota', 3], ['Billings', 'Montana', 3], ['Gulfport', 'Mississippi', 3],
            // more
            ['San Antonio', 'Texas', 1], ['El Paso', 'Texas', 2], ['Fort Worth', 'Texas', 2], ['Galveston', 'Texas', 3], ['Corpus Christi', 'Texas', 3], ['Lubbock', 'Texas', 3], ['Amarillo', 'Texas', 3], ['Laredo', 'Texas', 3], ['Jacksonville', 'Florida', 2], ['Fort Lauderdale', 'Florida', 2], ['Key West', 'Florida', 2], ['Daytona Beach', 'Florida', 2], ['Knoxville', 'Tennessee', 2], ['Chattanooga', 'Tennessee', 2], ['Cincinnati', 'Ohio', 2], ['Toledo', 'Ohio', 3], ['Dayton', 'Ohio', 3], ['Akron', 'Ohio', 3], ['Grand Rapids', 'Michigan', 3], ['Ann Arbor', 'Michigan', 3], ['Green Bay', 'Wisconsin', 2], ['Duluth', 'Minnesota', 3], ['Cedar Rapids', 'Iowa', 3], ['Sioux City', 'Iowa', 3], ['Shreveport', 'Louisiana', 3], ['Mobile', 'Alabama', 3], ['Biloxi', 'Mississippi', 3], ['Myrtle Beach', 'South Carolina', 2], ['Hilton Head', 'South Carolina', 3], ['Asheville', 'North Carolina', 3], ['Virginia Beach', 'Virginia', 2], ['Norfolk', 'Virginia', 3], ['Atlantic City', 'New Jersey', 2], ['Jersey City', 'New Jersey', 2], ['Princeton', 'New Jersey', 3], ['Syracuse', 'New York', 3], ['Scranton', 'Pennsylvania', 3], ['Erie', 'Pennsylvania', 3], ['New Haven', 'Connecticut', 3], ['Worcester', 'Massachusetts', 3], ['Bangor', 'Maine', 3], ['Aspen', 'Colorado', 2], ['Boulder', 'Colorado', 3], ['Park City', 'Utah', 3], ['Provo', 'Utah', 3], ['Jackson Hole', 'Wyoming', 3], ['Rapid City', 'South Dakota', 3], ['Missoula', 'Montana', 3], ['Bozeman', 'Montana', 3], ['Fairbanks', 'Alaska', 3], ['Maui', 'Hawaii', 1], ['Scottsdale', 'Arizona', 2], ['Flagstaff', 'Arizona', 3], ['Sedona', 'Arizona', 3], ['Roswell', 'New Mexico', 3], ['Las Cruces', 'New Mexico', 3], ['San Jose', 'California', 2], ['Oakland', 'California', 2], ['Palm Springs', 'California', 2], ['Malibu', 'California', 2], ['Tacoma', 'Washington', 3], ['Eugene', 'Oregon', 3], ['Bend', 'Oregon', 3], ['South Bend', 'Indiana', 3], ['Branson', 'Missouri', 3], ['Hoboken', 'New Jersey', 3]
        ],
        usLandmark: [
            ['Mount Rushmore', 'South Dakota', 1], ['the Grand Canyon', 'Arizona', 1], ['the Golden Gate Bridge', 'California', 1], ['the Statue of Liberty', 'New York', 1],
            ['the Space Needle', 'Washington', 1], ['the Alamo', 'Texas', 1], ['Pearl Harbor', 'Hawaii', 1], ['the Hollywood Sign', 'California', 1],
            ['the Gateway Arch', 'Missouri', 2], ['Old Faithful', 'Wyoming', 2], ['Kennedy Space Center', 'Florida', 2], ['the Liberty Bell', 'Pennsylvania', 2],
            ['Denali', 'Alaska', 2], ['Graceland', 'Tennessee', 2], ['the Everglades', 'Florida', 2], ['Arches National Park', 'Utah', 2],
            ['Mammoth Cave', 'Kentucky', 3], ['Crater Lake', 'Oregon', 3], ['Glacier National Park', 'Montana', 3], ['Carlsbad Caverns', 'New Mexico', 3],
            ['Acadia National Park', 'Maine', 3], ['the Mall of America', 'Minnesota', 3], ['Plymouth Rock', 'Massachusetts', 3], ['Fort Sumter', 'South Carolina', 3],
            ['Kitty Hawk, where the Wright brothers first flew', 'North Carolina', 3], ['Mount Rainier', 'Washington', 3],
            // more
            ['Yosemite National Park', 'California', 1], ['Alcatraz', 'California', 1], ['Disneyland', 'California', 1], ['Walt Disney World', 'Florida', 1], ['Times Square', 'New York', 1], ['Central Park', 'New York', 1], ['the Las Vegas Strip', 'Nevada', 1], ['Niagara Falls (the American side)', 'New York', 2], ['Zion National Park', 'Utah', 2], ['Bryce Canyon', 'Utah', 2], ['Grand Teton National Park', 'Wyoming', 2], ['Devils Tower', 'Wyoming', 3], ['Mount St. Helens', 'Washington', 2], ['Olympic National Park', 'Washington', 3], ['Redwood National Park', 'California', 2], ['Independence Hall', 'Pennsylvania', 2], ['Mount Washington', 'New Hampshire', 3], ['Johnson Space Center', 'Texas', 2], ['Churchill Downs', 'Kentucky', 2], ['Fenway Park', 'Massachusetts', 2], ['Wrigley Field', 'Illinois', 2], ['Lambeau Field', 'Wisconsin', 2], ['Daytona International Speedway', 'Florida', 2], ['the Grand Ole Opry', 'Tennessee', 2], ['the Rock and Roll Hall of Fame', 'Ohio', 2], ['the Pro Football Hall of Fame', 'Ohio', 3], ['the Baseball Hall of Fame in Cooperstown', 'New York', 3], ['Mesa Verde', 'Colorado', 3], ['Pikes Peak', 'Colorado', 2], ['the Great Salt Lake', 'Utah', 2], ['the Mackinac Bridge', 'Michigan', 3], ['Willis Tower', 'Illinois', 2], ['Cloud Gate ("The Bean")', 'Illinois', 2], ['Mount Hood', 'Oregon', 2], ['Multnomah Falls', 'Oregon', 3], ['the Biltmore Estate', 'North Carolina', 3], ['the Outer Banks', 'North Carolina', 3], ['Monticello', 'Virginia', 3], ["Mount Vernon (George Washington's home)", 'Virginia', 3], ['Jamestown', 'Virginia', 3], ["Martha's Vineyard", 'Massachusetts', 3], ['Cape Cod', 'Massachusetts', 2], ['the French Quarter', 'Louisiana', 1], ['Bourbon Street', 'Louisiana', 2], ['Pike Place Market', 'Washington', 2], ['Antelope Canyon', 'Arizona', 3], ['Petrified Forest National Park', 'Arizona', 3], ['White Sands', 'New Mexico', 3], ['Craters of the Moon', 'Idaho', 3], ['Glacier Bay', 'Alaska', 3], ['Diamond Head', 'Hawaii', 2], ['Waikiki Beach', 'Hawaii', 1], ['Hawaii Volcanoes National Park', 'Hawaii', 1], ['Dollywood', 'Tennessee', 2], ['Lake of the Ozarks', 'Missouri', 3], ['the Kentucky Derby', 'Kentucky', 1], ['the Indianapolis 500', 'Indiana', 1], ['Mardi Gras in New Orleans', 'Louisiana', 1], ['Silicon Valley', 'California', 2], ['Wall Street', 'New York', 1], ["the Hoover Dam's Las Vegas side", 'Nevada', 3], ['Badlands National Park', 'South Dakota', 2]
        ],
        wLandmark: [
            ['the Eiffel Tower', 'France', 1], ['the Colosseum', 'Italy', 1], ['the Great Wall', 'China', 1], ['the Taj Mahal', 'India', 1],
            ['Machu Picchu', 'Peru', 1], ['the Pyramids of Giza', 'Egypt', 1], ['Christ the Redeemer', 'Brazil', 1], ['Big Ben', 'United Kingdom', 1],
            ['the Sydney Opera House', 'Australia', 1], ['Mount Fuji', 'Japan', 1], ['the Leaning Tower of Pisa', 'Italy', 1], ['the Acropolis', 'Greece', 1],
            ['Petra', 'Jordan', 2], ['Angkor Wat', 'Cambodia', 2], ['Chichén Itzá', 'Mexico', 2], ['Stonehenge', 'United Kingdom', 2], ['the Sagrada Família', 'Spain', 2],
            ['the Kremlin', 'Russia', 2], ['the Burj Khalifa', 'United Arab Emirates', 2], ['Mount Kilimanjaro', 'Tanzania', 2], ['Table Mountain', 'South Africa', 2],
            ['the Hagia Sophia', 'Turkey', 2], ['the CN Tower', 'Canada', 2], ['Uluru', 'Australia', 2], ['the Brandenburg Gate', 'Germany', 2], ['the Forbidden City', 'China', 2],
            ['the Moai statues of Easter Island', 'Chile', 3], ['Ha Long Bay', 'Vietnam', 3], ['the Galápagos Islands', 'Ecuador', 3], ['the Alhambra', 'Spain', 3],
            ['Neuschwanstein Castle', 'Germany', 3], ['the Atomium', 'Belgium', 3], ['the Little Mermaid statue', 'Denmark', 3], ['Angel Falls', 'Venezuela', 3],
            ['the Serengeti', 'Tanzania', 3], ['Timbuktu', 'Mali', 3], ['the Blue Lagoon', 'Iceland', 3], ['the Rock-Hewn Churches of Lalibela', 'Ethiopia', 3],
            // more
            ['the Louvre', 'France', 1], ['Notre-Dame Cathedral', 'France', 1], ['Mont Saint-Michel', 'France', 2], ['the Palace of Versailles', 'France', 2], ['the Trevi Fountain', 'Italy', 1], ['Pompeii', 'Italy', 1], ['Mount Vesuvius', 'Italy', 2], ['Santorini', 'Greece', 1], ['Buckingham Palace', 'United Kingdom', 1], ['Tower Bridge', 'United Kingdom', 1], ['the London Eye', 'United Kingdom', 1], ['Loch Ness', 'United Kingdom', 2], ["St. Basil's Cathedral", 'Russia', 2], ['Lake Baikal', 'Russia', 2], ['the Golden Temple', 'India', 2], ['the Terracotta Army', 'China', 1], ['the Potala Palace', 'China', 2], ['Tokyo Tower', 'Japan', 1], ['the Hiroshima Peace Memorial', 'Japan', 2], ['Marina Bay Sands', 'Singapore', 2], ['the Petronas Towers', 'Malaysia', 2], ['Borobudur Temple', 'Indonesia', 2], ['Bondi Beach', 'Australia', 1], ['the Great Barrier Reef', 'Australia', 1], ['Hobbiton', 'New Zealand', 2], ['Milford Sound', 'New Zealand', 2], ['Sugarloaf Mountain', 'Brazil', 2], ['the Perito Moreno Glacier', 'Argentina', 2], ['the Salar de Uyuni salt flats', 'Bolivia', 2], ['the Nazca Lines', 'Peru', 2], ['Tikal', 'Guatemala', 2], ['Teotihuacan', 'Mexico', 2], ['Banff National Park', 'Canada', 1], ["Niagara Falls' Horseshoe Falls (the Canadian side)", 'Canada', 2], ['the Statue of Liberty', 'United States', 1], ['the Grand Canyon', 'United States', 1], ['the Great Sphinx', 'Egypt', 1], ['Abu Simbel', 'Egypt', 2], ['the Valley of the Kings', 'Egypt', 2], ['Robben Island', 'South Africa', 2], ['Kruger National Park', 'South Africa', 2], ['the Okavango Delta', 'Botswana', 2], ['the Maasai Mara', 'Kenya', 2], ['the Great Mosque of Djenné', 'Mali', 2], ['the Hassan II Mosque', 'Morocco', 2], ['the ruins of Carthage', 'Tunisia', 2], ['the Sheikh Zayed Grand Mosque', 'United Arab Emirates', 2], ['Persepolis', 'Iran', 2], ['the Blue Mosque', 'Turkey', 1], ["Cappadocia's hot-air balloons", 'Turkey', 1], ['Plitvice Lakes', 'Croatia', 2], ['the Charles Bridge', 'Czechia', 2], ['the Wieliczka Salt Mine', 'Poland', 2], ['Geirangerfjord', 'Norway', 2], ['the Manneken Pis statue', 'Belgium', 2], ['the windmills of Kinderdijk', 'Netherlands', 2], ['the Cliffs of Moher', 'Ireland', 1], ['the Blarney Stone', 'Ireland', 2], ["the Giant's Causeway", 'United Kingdom', 2], ['Edinburgh Castle', 'United Kingdom', 1], ['Park Güell', 'Spain', 2], ['Belém Tower', 'Portugal', 2], ['Schönbrunn Palace', 'Austria', 2], ["Bran Castle (\"Dracula's Castle\")", 'Romania', 2], ['the Hermitage Museum', 'Russia', 2], ["the Matterhorn's Zermatt ski town", 'Switzerland', 2], ["the Dead Sea's Masada fortress", 'Israel', 2], ['Mount Etna', 'Italy', 2]
        ],
        wCity: [
            ['Barcelona', 'Spain', 1], ['Rio de Janeiro', 'Brazil', 1], ['Sydney', 'Australia', 1], ['Toronto', 'Canada', 1], ['Venice', 'Italy', 1],
            ['Dubai', 'United Arab Emirates', 1], ['Mumbai', 'India', 1], ['Shanghai', 'China', 1], ['Istanbul', 'Turkey', 1], ['Munich', 'Germany', 1],
            ['Milan', 'Italy', 1], ['Vancouver', 'Canada', 1],
            ['Osaka', 'Japan', 2], ['Marrakesh', 'Morocco', 2], ['Cape Town', 'South Africa', 2], ['Auckland', 'New Zealand', 2], ['Saint Petersburg', 'Russia', 2],
            ['Kraków', 'Poland', 2], ['Porto', 'Portugal', 2], ['Geneva', 'Switzerland', 2], ['São Paulo', 'Brazil', 2], ['Melbourne', 'Australia', 2],
            ['Montreal', 'Canada', 2], ['Cancún', 'Mexico', 2], ['Florence', 'Italy', 2], ['Kyoto', 'Japan', 2], ['Manchester', 'United Kingdom', 2],
            ['Casablanca', 'Morocco', 3], ['Rotterdam', 'Netherlands', 3], ['Antwerp', 'Belgium', 3], ['Lagos', 'Nigeria', 3], ['Alexandria', 'Egypt', 3],
            ['Ho Chi Minh City', 'Vietnam', 3], ['Busan', 'South Korea', 3], ['Karachi', 'Pakistan', 3], ['Guadalajara', 'Mexico', 3], ['Seville', 'Spain', 3],
            ['Bangalore', 'India', 3], ['Mecca', 'Saudi Arabia', 3], ['Medellín', 'Colombia', 3], ['Cusco', 'Peru', 3], ['Mombasa', 'Kenya', 3], ['Zanzibar', 'Tanzania', 3],
            ['Valparaíso', 'Chile', 3], ['Glasgow', 'United Kingdom', 3], ['Zurich', 'Switzerland', 3],
            // more
            ['New York City', 'United States', 1], ['Los Angeles', 'United States', 1], ['Chicago', 'United States', 1], ['Hong Kong', 'China', 1], ['Bali', 'Indonesia', 1], ['Liverpool', 'United Kingdom', 1], ['Naples', 'Italy', 1], ['Marseille', 'France', 1], ['Nice', 'France', 1], ['Frankfurt', 'Germany', 1], ['Hamburg', 'Germany', 1], ['Phuket', 'Thailand', 1], ['Tijuana', 'Mexico', 1], ['Acapulco', 'Mexico', 1], ['Quebec City', 'Canada', 1], ['Calgary', 'Canada', 1], ['Ibiza', 'Spain', 1], ['Oxford', 'United Kingdom', 1], ['Kolkata', 'India', 2], ['Lahore', 'Pakistan', 2], ['Hiroshima', 'Japan', 2], ['Guangzhou', 'China', 2], ['Shenzhen', 'China', 2], ['Brisbane', 'Australia', 2], ['Salzburg', 'Austria', 2], ['Mykonos', 'Greece', 2], ['Dubrovnik', 'Croatia', 2], ['Johannesburg', 'South Africa', 2], ['Tel Aviv', 'Israel', 2], ['Lyon', 'France', 2], ['Turin', 'Italy', 2], ['Cologne', 'Germany', 2], ['Málaga', 'Spain', 2], ['Bordeaux', 'France', 2], ['Chiang Mai', 'Thailand', 2], ['Goa', 'India', 2], ['Chennai', 'India', 2], ['Monterrey', 'Mexico', 2], ['Queenstown', 'New Zealand', 2], ['Gothenburg', 'Sweden', 2], ['Bergen', 'Norway', 2], ['Thessaloniki', 'Greece', 2], ['Jeddah', 'Saudi Arabia', 2], ['Cebu', 'Philippines', 2], ['Odesa', 'Ukraine', 2], ['Edinburgh', 'United Kingdom', 1]
        ],
        usFood: [
            ['Philly cheesesteaks', 'Pennsylvania', 1], ['deep-dish pizza', 'Illinois', 1], ['gumbo and beignets', 'Louisiana', 1], ['lobster rolls', 'Maine', 1], ['key lime pie', 'Florida', 1], ['potatoes', 'Idaho', 1], ['cheese curds', 'Wisconsin', 1], ['maple syrup', 'Vermont', 2], ['clam chowder', 'Massachusetts', 2], ['Nashville hot chicken', 'Tennessee', 2], ['green chile', 'New Mexico', 2], ['crab cakes', 'Maryland', 2], ['poke and Spam musubi', 'Hawaii', 1], ['Cincinnati chili', 'Ohio', 2], ['Detroit-style pizza', 'Michigan', 2], ['toasted ravioli', 'Missouri', 3], ['Buffalo wings', 'New York', 2], ['Tex-Mex and brisket', 'Texas', 1], ['Georgia peaches', 'Georgia', 1], ['Hatch chiles', 'New Mexico', 3], ['sourdough bread in San Francisco', 'California', 2], ['Rocky Mountain trout', 'Colorado', 3], ['Vidalia onions', 'Georgia', 3], ['Walla Walla onions', 'Washington', 3]
        ],
        usTeam: [
            ['Green Bay Packers', 'Wisconsin', 1], ['Chicago Bears', 'Illinois', 1], ['Detroit Lions', 'Michigan', 1], ['Dallas Cowboys', 'Texas', 1], ['Pittsburgh Steelers', 'Pennsylvania', 1], ['Philadelphia Eagles', 'Pennsylvania', 1], ['Denver Broncos', 'Colorado', 1], ['Seattle Seahawks', 'Washington', 1], ['San Francisco 49ers', 'California', 1], ['Miami Dolphins', 'Florida', 1], ['New Orleans Saints', 'Louisiana', 1], ['Atlanta Falcons', 'Georgia', 1], ['Baltimore Ravens', 'Maryland', 1], ['Cleveland Browns', 'Ohio', 1], ['Cincinnati Bengals', 'Ohio', 2], ['Indianapolis Colts', 'Indiana', 1], ['Kansas City Chiefs', 'Missouri', 2], ['Las Vegas Raiders', 'Nevada', 1], ['Buffalo Bills', 'New York', 1], ['New England Patriots', 'Massachusetts', 2], ['Tampa Bay Buccaneers', 'Florida', 2], ['Jacksonville Jaguars', 'Florida', 2], ['Houston Texans', 'Texas', 1], ['Los Angeles Rams', 'California', 1], ['Los Angeles Lakers', 'California', 1], ['Boston Celtics', 'Massachusetts', 1], ['Chicago Bulls', 'Illinois', 1], ['Miami Heat', 'Florida', 1], ['New York Knicks', 'New York', 1], ['Golden State Warriors', 'California', 2], ['San Antonio Spurs', 'Texas', 1], ['Phoenix Suns', 'Arizona', 1], ['Denver Nuggets', 'Colorado', 1], ['Oklahoma City Thunder', 'Oklahoma', 1], ['Utah Jazz', 'Utah', 1], ['Portland Trail Blazers', 'Oregon', 2], ['Milwaukee Bucks', 'Wisconsin', 1], ['Cleveland Cavaliers', 'Ohio', 1], ['Memphis Grizzlies', 'Tennessee', 1], ['Orlando Magic', 'Florida', 1], ['Detroit Pistons', 'Michigan', 1], ['New York Yankees', 'New York', 1], ['Boston Red Sox', 'Massachusetts', 1], ['Chicago Cubs', 'Illinois', 1], ['Los Angeles Dodgers', 'California', 1], ['St. Louis Cardinals', 'Missouri', 1], ['Houston Astros', 'Texas', 1], ['Atlanta Braves', 'Georgia', 1], ['Seattle Mariners', 'Washington', 1], ['Baltimore Orioles', 'Maryland', 1], ['Colorado Rockies', 'Colorado', 1], ['Arizona Diamondbacks', 'Arizona', 1], ['Kansas City Royals', 'Missouri', 2]
        ],
        wFood: [
            ['sushi', 'Japan', 1], ['pizza and pasta', 'Italy', 1], ['tacos', 'Mexico', 1], ['croissants', 'France', 1], ['paella', 'Spain', 1], ['kimchi', 'South Korea', 1, ['North Korea']], ['pad thai', 'Thailand', 1], ['pho', 'Vietnam', 1], ['poutine', 'Canada', 1], ['fish and chips', 'United Kingdom', 1], ['goulash', 'Hungary', 2], ['pierogi', 'Poland', 2, ['Ukraine']], ['bratwurst and pretzels', 'Germany', 1], ['moussaka', 'Greece', 2], ['butter chicken', 'India', 1], ['dim sum', 'China', 1], ['Peking duck', 'China', 1], ['ceviche', 'Peru', 2, ['Ecuador', 'Mexico']], ['feijoada', 'Brazil', 2], ['Wiener schnitzel', 'Austria', 2], ['cheese fondue', 'Switzerland', 1], ['Belgian waffles', 'Belgium', 1], ['döner kebab', 'Turkey', 2, ['Germany']], ['tagine', 'Morocco', 2, ['Algeria', 'Tunisia']], ['injera', 'Ethiopia', 2, ['Eritrea']], ['gelato', 'Italy', 1], ['ramen', 'Japan', 1], ['bulgogi', 'South Korea', 2], ['haggis', 'United Kingdom', 2], ['smørrebrød', 'Denmark', 3], ['Swedish meatballs', 'Sweden', 1], ['Irish stew', 'Ireland', 1], ['jerk chicken', 'Jamaica', 2], ['chimichurri', 'Argentina', 2, ['Uruguay']], ['pastel de nata (custard tarts)', 'Portugal', 2], ['tiramisu', 'Italy', 1], ['borscht', 'Ukraine', 3, ['Russia', 'Poland']], ['Vegemite on toast', 'Australia', 1], ['nasi goreng', 'Indonesia', 3], ['adobo', 'Philippines', 3], ['bobotie', 'South Africa', 3], ['biltong', 'South Africa', 3, ['Namibia']], ['churros', 'Spain', 1, ['Mexico']], ['baguettes', 'France', 1], ['tandoori chicken', 'India', 2]
        ],
        wClub: [
            ['Real Madrid', 'Spain', 1], ['FC Barcelona', 'Spain', 1], ['Manchester United', 'United Kingdom', 1], ['Liverpool FC', 'United Kingdom', 1], ['Arsenal', 'United Kingdom', 1], ['Chelsea', 'United Kingdom', 1], ['Bayern Munich', 'Germany', 1], ['Borussia Dortmund', 'Germany', 2], ['Juventus', 'Italy', 1], ['AC Milan', 'Italy', 1], ['Inter Milan', 'Italy', 1], ['Paris Saint-Germain', 'France', 1], ['Ajax', 'Netherlands', 2], ['Benfica', 'Portugal', 2], ['FC Porto', 'Portugal', 2], ['Celtic', 'United Kingdom', 2], ['Galatasaray', 'Turkey', 2], ["Inter Miami (Messi's club)", 'United States', 1], ['Atlético Madrid', 'Spain', 1], ['Napoli', 'Italy', 2], ['AS Roma', 'Italy', 1], ['Olympique de Marseille', 'France', 2]
        ],
        wAnimal: [
            ['kangaroos', 'Australia', 1], ['giant pandas', 'China', 1], ['kiwi birds', 'New Zealand', 1], ['lemurs', 'Madagascar', 1], ['Komodo dragons', 'Indonesia', 1], ['koalas', 'Australia', 1], ['platypuses', 'Australia', 2], ['Galápagos giant tortoises', 'Ecuador', 2], ['Tasmanian devils', 'Australia', 2], ['quokkas', 'Australia', 3]
        ],
        wCompany: [
            ['Toyota', 'Japan', 1], ['Sony', 'Japan', 1], ['Nintendo', 'Japan', 1], ['Honda', 'Japan', 1], ['Canon', 'Japan', 2], ['Samsung', 'South Korea', 1], ['Hyundai', 'South Korea', 1], ['Kia', 'South Korea', 2], ['LG', 'South Korea', 2], ['IKEA', 'Sweden', 1], ['Volvo', 'Sweden', 1], ['H&M', 'Sweden', 2], ['Spotify', 'Sweden', 2], ['Ericsson', 'Sweden', 3], ['LEGO', 'Denmark', 1], ['Carlsberg', 'Denmark', 3], ['Pandora jewelry', 'Denmark', 3], ['Nokia', 'Finland', 2], ['Volkswagen', 'Germany', 1], ['BMW', 'Germany', 1], ['Mercedes-Benz', 'Germany', 1], ['Porsche', 'Germany', 1], ['Audi', 'Germany', 1], ['Adidas', 'Germany', 1], ['Puma', 'Germany', 2], ['Siemens', 'Germany', 2], ['Nivea', 'Germany', 3], ['Lufthansa', 'Germany', 2], ['Ferrari', 'Italy', 1], ['Lamborghini', 'Italy', 1], ['Fiat', 'Italy', 2], ['Gucci', 'Italy', 2], ['Prada', 'Italy', 2], ['Pirelli tires', 'Italy', 3], ['Rolex', 'Switzerland', 1], ['Nestlé', 'Switzerland', 2], ['Lindt chocolate', 'Switzerland', 2], ['Toblerone', 'Switzerland', 2], ['Louis Vuitton', 'France', 2], ['Chanel', 'France', 2], ['Peugeot', 'France', 2], ['Michelin tires', 'France', 2], ['Lacoste', 'France', 3], ['Heineken', 'Netherlands', 2], ['Philips', 'Netherlands', 3], ['Red Bull', 'Austria', 2], ['Guinness', 'Ireland', 2], ['Zara', 'Spain', 2], ['Škoda cars', 'Czechia', 3], ['Huawei', 'China', 2], ['Lenovo', 'China', 2], ['Xiaomi', 'China', 2], ['Alibaba', 'China', 2], ['Tata', 'India', 3], ['Shopify', 'Canada', 3], ['Tim Hortons', 'Canada', 1], ['Qantas airline', 'Australia', 2], ['Emirates airline', 'United Arab Emirates', 2], ['Corona beer', 'Mexico', 2], ['Havaianas flip-flops', 'Brazil', 3], ['Burberry', 'United Kingdom', 3], ['Rolls-Royce', 'United Kingdom', 2], ['Cadbury chocolate', 'United Kingdom', 2]
        ],
        wPeople: [
            ['Napoleon', 'France', 1], ['Gandhi', 'India', 1], ['Cleopatra', 'Egypt', 1], ['William Shakespeare', 'United Kingdom', 1], ['Mozart', 'Austria', 2], ['Beethoven', 'Germany', 2], ['Pablo Picasso', 'Spain', 2], ['Vincent van Gogh', 'Netherlands', 2], ['Nelson Mandela', 'South Africa', 1], ['Frida Kahlo', 'Mexico', 2], ['Pelé', 'Brazil', 1], ['Lionel Messi', 'Argentina', 1], ['Cristiano Ronaldo', 'Portugal', 1], ['Usain Bolt', 'Jamaica', 1], ['Genghis Khan', 'Mongolia', 2], ['Confucius', 'China', 2], ['Leonardo da Vinci', 'Italy', 1], ['Frédéric Chopin', 'Poland', 3], ['Leo Tolstoy', 'Russia', 3], ['Hans Christian Andersen', 'Denmark', 3], ['Shakira', 'Colombia', 1], ['Bob Marley', 'Jamaica', 1], ['the band ABBA', 'Sweden', 2], ['the Beatles', 'United Kingdom', 1], ['Celine Dion', 'Canada', 2], ['Rihanna', 'Barbados', 2], ['Mohamed Salah', 'Egypt', 2], ['Erling Haaland', 'Norway', 2], ['Kylian Mbappé', 'France', 1], ['Neymar', 'Brazil', 1], ['Luka Modrić', 'Croatia', 2], ['Simón Bolívar', 'Venezuela', 3], ['Antoni Gaudí', 'Spain', 3], ['Michelangelo', 'Italy', 2], ['Galileo', 'Italy', 2], ['Vasco da Gama', 'Portugal', 3], ['Captain James Cook', 'United Kingdom', 3], ['Ibn Battuta', 'Morocco', 3], ['Kofi Annan', 'Ghana', 3], ['Jackie Chan', 'China', 1], ['Hayao Miyazaki', 'Japan', 2], ['the K-pop group BTS', 'South Korea', 1], ['Charles Darwin', 'United Kingdom', 2], ['Marco Polo', 'Italy', 2], ['Julius Caesar', 'Italy', 1], ['Tutankhamun', 'Egypt', 2], ['Atatürk', 'Turkey', 3], ['Rembrandt', 'Netherlands', 3], ['Miguel de Cervantes', 'Spain', 3], ['Victor Hugo', 'France', 3], ['Tchaikovsky', 'Russia', 3], ['Bach', 'Germany', 3], ['Vivaldi', 'Italy', 3], ['Ed Sheeran', 'United Kingdom', 1], ['Justin Bieber', 'Canada', 1], ['Novak Djokovic', 'Serbia', 2], ['Rafael Nadal', 'Spain', 1], ['Roger Federer', 'Switzerland', 1], ['Sachin Tendulkar', 'India', 3], ['Wayne Gretzky', 'Canada', 2], ['Yao Ming', 'China', 2], ['Giannis Antetokounmpo', 'Greece', 2], ['Nikola Jokić', 'Serbia', 2], ['Luka Dončić', 'Slovenia', 2], ['Shohei Ohtani', 'Japan', 1], ['Victor Wembanyama', 'France', 2], ['Eliud Kipchoge', 'Kenya', 3]
        ],
        usCompany: [
            ['Microsoft', 'Washington', 1], ['Amazon', 'Washington', 1], ['Starbucks', 'Washington', 1], ['Costco', 'Washington', 2], ['Coca-Cola', 'Georgia', 1], ['Delta Air Lines', 'Georgia', 2], ['Home Depot', 'Georgia', 2], ['Chick-fil-A', 'Georgia', 2], ['UPS', 'Georgia', 3], ['Waffle House', 'Georgia', 3], ['Walmart', 'Arkansas', 2], ['Tyson Foods', 'Arkansas', 3], ['Nike', 'Oregon', 2], ['Apple', 'California', 1], ['Google', 'California', 1], ['Disney', 'California', 1], ['Netflix', 'California', 1], ['Intel', 'California', 2], ['Mattel (Barbie)', 'California', 2], ["Levi's jeans", 'California', 2], ['Ford', 'Michigan', 1], ['General Motors', 'Michigan', 1], ["Kellogg's cereal", 'Michigan', 3], ["Domino's Pizza", 'Michigan', 2], ["Hershey's chocolate", 'Pennsylvania', 1], ['Crayola crayons', 'Pennsylvania', 2], ['Harley-Davidson', 'Wisconsin', 2], ['John Deere', 'Illinois', 3], ["McDonald's", 'Illinois', 2], ['Walgreens', 'Illinois', 3], ['State Farm', 'Illinois', 3], ['Dell', 'Texas', 2], ['ExxonMobil', 'Texas', 2], ['American Airlines', 'Texas', 2], ['Southwest Airlines', 'Texas', 2], ['Whataburger', 'Texas', 2], ['FedEx', 'Tennessee', 2], ["Jack Daniel's whiskey", 'Tennessee', 2], ['Anheuser-Busch (Budweiser)', 'Missouri', 2], ['Hallmark cards', 'Missouri', 3], ["Ben & Jerry's", 'Vermont', 2], ['L.L.Bean', 'Maine', 2], ['Target', 'Minnesota', 2], ['Best Buy', 'Minnesota', 3], ['3M', 'Minnesota', 3], ['Spam (Hormel)', 'Minnesota', 3], ['Procter & Gamble', 'Ohio', 3], ['Goodyear tires', 'Ohio', 3], ["Wendy's", 'Ohio', 3], ["Dunkin'", 'Massachusetts', 2], ['Gillette', 'Massachusetts', 3], ['Tabasco sauce', 'Louisiana', 2], ['Berkshire Hathaway (Warren Buffett)', 'Nebraska', 3], ['Coors beer', 'Colorado', 2]
        ],
        usPeople: [
            ['Abraham Lincoln', 'Kentucky', 2], ['George Washington', 'Virginia', 1], ['Elvis Presley', 'Mississippi', 2], ['Martin Luther King Jr.', 'Georgia', 1], ['Barack Obama', 'Hawaii', 1], ['Dolly Parton', 'Tennessee', 1], ['Taylor Swift', 'Pennsylvania', 2], ['Beyoncé', 'Texas', 1], ['Oprah Winfrey', 'Mississippi', 3], ['Mark Twain', 'Missouri', 2], ['Amelia Earhart', 'Kansas', 3], ['Neil Armstrong', 'Ohio', 2], ['LeBron James', 'Ohio', 1], ['Babe Ruth', 'Maryland', 3], ['Muhammad Ali', 'Kentucky', 2], ['Walt Disney', 'Illinois', 3], ['Steve Jobs', 'California', 1], ['Prince', 'Minnesota', 2], ['Bob Dylan', 'Minnesota', 3], ['Jimi Hendrix', 'Washington', 3], ['Kurt Cobain', 'Washington', 3], ['Louis Armstrong', 'Louisiana', 2], ['Johnny Cash', 'Arkansas', 3], ['Thomas Jefferson', 'Virginia', 2], ['John F. Kennedy', 'Massachusetts', 1], ['Helen Keller', 'Alabama', 3], ['Rosa Parks', 'Alabama', 2], ['Harriet Tubman', 'Maryland', 3], ['Frederick Douglass', 'Maryland', 3], ['Sitting Bull', 'South Dakota', 3], ['Davy Crockett', 'Tennessee', 3], ['Ernest Hemingway', 'Illinois', 3], ['Willie Nelson', 'Texas', 2], ['Jimmy Carter', 'Georgia', 2], ['Ronald Reagan', 'Illinois', 3], ['Bill Clinton', 'Arkansas', 2]
        ],
        wWW2: [
            ['Which country did <b>Adolf Hitler</b> lead?', 'Germany', 1], ['Which country <b>attacked Pearl Harbor</b> in 1941?', 'Japan', 1],
            ['The <b>D-Day</b> landings in 1944 were on the beaches of which country?', 'France', 1], ['<b>Winston Churchill</b> was prime minister of which country?', 'United Kingdom', 1],
            ['<b>Benito Mussolini</b> led which country?', 'Italy', 1], ['Germany\'s invasion of which country in September 1939 <b>started WWII in Europe</b>?', 'Poland', 1],
            ['Anne Frank wrote her famous diary while hiding in which country?', 'Netherlands', 2], ['The <b>Battle of the Bulge</b> was fought mostly in which country?', 'Belgium', 3],
            ['<b>Iwo Jima</b> and <b>Okinawa</b> belong to which country?', 'Japan', 2], ['Which neutral country, famous for banks and the Alps, <b>stayed out of WWII</b>?', 'Switzerland', 2],
            ['Which modern country was the biggest part of the <b>Soviet Union</b>, led by Joseph Stalin?', 'Russia', 2], ['<b>Charles de Gaulle</b> led the Free forces of which country?', 'France', 2],
            ['<b>Emperor Hirohito</b> ruled which country during WWII?', 'Japan', 2], ['The <b>Dunkirk evacuation</b> (1940) rescued troops from beaches in which country?', 'France', 2],
            ['The <b>Battle of Britain</b> was fought in the skies over which country?', 'United Kingdom', 1], ['The <b>Auschwitz</b> camp memorial is in which present-day country?', 'Poland', 2],
            ['Which European country was <b>split into East and West</b> after WWII?', 'Germany', 1], ['Which country built the first atomic bombs in the <b>Manhattan Project</b>?', 'United States', 1],
            ['General MacArthur promised <b>"I shall return"</b> to which country?', 'Philippines', 3], ['Allied code-breakers cracked which country\'s <b>Enigma</b> code?', 'Germany', 2],
            ['WWII code-breakers worked in secret at <b>Bletchley Park</b> in which country?', 'United Kingdom', 3], ['Germany, Italy and which country were the main <b>Axis</b> powers?', 'Japan', 1]
        ],
        usWW2: [
            ['The <b>attack on Pearl Harbor</b> happened in which state?', 'Hawaii', 1], ['The first atomic bomb test (<b>Trinity</b>) was in which state?', 'New Mexico', 2],
            ['<b>Oak Ridge</b>, a secret WWII atomic city, is in which state?', 'Tennessee', 3], ['The <b>Hanford</b> site that made plutonium in WWII is in which state?', 'Washington', 3],
            ['The <b>National WWII Museum</b> is in which state?', 'Louisiana', 2], ['<b>Dwight D. Eisenhower</b>, D-Day\'s commander, grew up in which state?', 'Kansas', 3],
            ['Japanese <b>balloon bombs</b> killed six people in 1945 in which state?', 'Oregon', 3], ['The <b>Pentagon</b>, built during WWII, is in which state?', 'Virginia', 2],
            ['General <b>George S. Patton</b> was born in which state?', 'California', 3], ['President <b>Franklin D. Roosevelt</b> was born in which state?', 'New York', 2],
            ['President <b>Harry Truman</b>, who ended WWII, was from which state?', 'Missouri', 2], ['The huge <b>Willow Run</b> bomber plant ("Rosie the Riveter") was in which state?', 'Michigan', 3],
            ['The <b>Manzanar</b> camp, where Japanese Americans were held, is in which state?', 'California', 3]
        ],
        wOly: [
            ['Which country has won the <b>most Summer Olympic medals</b> of all time?', 'United States', 1], ['The ancient <b>Olympic Games</b> began in which country?', 'Greece', 1],
            ['Which country tops the all-time <b>Winter Olympics</b> medal table?', 'Norway', 2], ['Which country won the <b>most gold medals</b> at the Tokyo 2020 Olympics?', 'United States', 2],
            ['Which country did swimmer <b>Michael Phelps</b> compete for?', 'United States', 1], ['Which country is gymnast <b>Nadia Comăneci</b>, the first to score a perfect 10, from?', 'Romania', 3],
            ['Which country hosted the <b>first Winter Olympics</b> in 1924?', 'France', 3], ['Sprinter <b>Usain Bolt</b> won his 8 Olympic golds for which country?', 'Jamaica', 1],
            ['Which country did gymnast <b>Simone Biles</b> compete for?', 'United States', 1], ['Distance runner <b>Mo Farah</b> won Olympic golds for which country?', 'United Kingdom', 2],
            ['Which country invented <b>judo</b>, now an Olympic sport?', 'Japan', 2], ['<b>Taekwondo</b> comes from which country?', 'South Korea', 2], ['<b>Curling</b> was invented in which present-day country?', 'United Kingdom', 3]
        ]
    };
    const CLUE_INFO = {
        usNick: { map: 'us', pool: 'states', tag: 'USA · NICKNAME', ask: c => `Which state is nicknamed <b>${esc(c)}</b>?` },
        usCity: { map: 'us', pool: 'states', tag: 'USA · CITY', ask: c => `Which state is <b>${esc(c)}</b> in?` },
        usLandmark: { map: 'us', pool: 'states', tag: 'USA · LANDMARK', ask: c => `Which state is home to <b>${esc(c)}</b>?` },
        wLandmark: { map: 'world', pool: 'countries', tag: 'WORLD · LANDMARK', ask: c => `Which country is home to <b>${esc(c)}</b>?` },
        wCity: { map: 'world', pool: 'countries', tag: 'WORLD · CITY', ask: c => `Which country is <b>${esc(c)}</b> in?` },
        usFood: { map: 'us', pool: 'states', tag: 'USA · FOOD', ask: c => `Which state is famous for <b>${esc(c)}</b>?` },
        usTeam: { map: 'us', pool: 'states', tag: 'USA · SPORTS', ask: c => `Which state do the <b>${esc(c)}</b> play in?` },
        wFood: { map: 'world', pool: 'countries', tag: 'WORLD · FOOD', ask: c => `Which country is famous for <b>${esc(c)}</b>?` },
        wClub: { map: 'world', pool: 'countries', tag: 'WORLD · SOCCER', ask: c => `Which country is the soccer club <b>${esc(c)}</b> from?` },
        wAnimal: { map: 'world', pool: 'countries', tag: 'WORLD · ANIMALS', ask: c => `Which country is home to wild <b>${esc(c)}</b>?` },
        wCompany: { map: 'world', pool: 'countries', tag: 'WORLD · BRANDS', ask: c => `Which country does <b>${esc(c)}</b> come from?` },
        wPeople: { map: 'world', pool: 'countries', tag: 'WORLD · FAMOUS PEOPLE', ask: c => `Which country is <b>${esc(c)}</b> from?` },
        usCompany: { map: 'us', pool: 'states', tag: 'USA · BRANDS', ask: c => `Which state is <b>${esc(c)}</b> based in?` },
        usPeople: { map: 'us', pool: 'states', tag: 'USA · FAMOUS PEOPLE', ask: c => `In which state was <b>${esc(c)}</b> born?` },
        wWW2: { map: 'world', pool: 'countries', tag: 'WORLD · WWII', ask: c => c },
        usWW2: { map: 'us', pool: 'states', tag: 'USA · WWII', ask: c => c },
        wOly: { map: 'world', pool: 'countries', tag: 'WORLD · OLYMPICS', ask: c => c }
    };
    const clueList = (type, maxLevel) => CLUES[type].filter(c => c[2] <= maxLevel);

    // ---------- multi-answer questions: any right answer counts, RARE answers (not in "common") fly you twice as far ----------
    const MULTI = [
        // world
        { id: 'sa', map: 'world', lvl: 1, ask: 'Name a country in <b>South America</b>', all: ['Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Guyana', 'Paraguay', 'Peru', 'Suriname', 'Uruguay', 'Venezuela', 'France', 'United Kingdom'], common: ['Brazil', 'Argentina', 'Chile', 'Peru', 'Colombia', 'Venezuela'] },
        { id: 'euro', map: 'world', lvl: 1, ask: 'Name a country that uses the <b>euro</b> 💶', all: ['Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Portugal', 'Slovakia', 'Slovenia', 'Spain', 'Monaco', 'San Marino', 'Vatican City', 'Andorra', 'Montenegro', 'Kosovo'], common: ['France', 'Germany', 'Italy', 'Spain', 'Portugal', 'Greece', 'Netherlands', 'Belgium', 'Ireland', 'Austria', 'Finland'] },
        { id: 'dollar', map: 'world', lvl: 1, ask: 'Name a country whose money is called the <b>dollar</b> 💵', all: ['United States', 'Canada', 'Australia', 'New Zealand', 'Ecuador', 'El Salvador', 'Panama', 'Singapore', 'Jamaica', 'Bahamas', 'Barbados', 'Belize', 'Fiji', 'Liberia', 'Namibia', 'Taiwan', 'Brunei', 'Guyana', 'Suriname', 'Trinidad and Tobago', 'Timor-Leste', 'Marshall Islands', 'Micronesia', 'Palau', 'Kiribati', 'Tuvalu', 'Solomon Islands', 'Antigua and Barbuda', 'Dominica', 'Grenada', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines'], common: ['United States', 'Canada', 'Australia', 'New Zealand'] },
        { id: 'island', map: 'world', lvl: 1, ask: 'Name an <b>island country</b> 🏝️', all: ['Japan', 'United Kingdom', 'Ireland', 'Iceland', 'Madagascar', 'Philippines', 'Indonesia', 'New Zealand', 'Cuba', 'Jamaica', 'Sri Lanka', 'Taiwan', 'Fiji', 'Malta', 'Cyprus', 'Singapore', 'Bahamas', 'Barbados', 'Trinidad and Tobago', 'Maldives', 'Mauritius', 'Seychelles', 'Bahrain', 'Samoa', 'Tonga', 'Vanuatu', 'Solomon Islands', 'Cape Verde', 'Comoros', 'São Tomé and Príncipe', 'Dominica', 'Grenada', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Saint Kitts and Nevis', 'Antigua and Barbuda', 'Kiribati', 'Tuvalu', 'Nauru', 'Palau', 'Marshall Islands', 'Micronesia', 'Papua New Guinea', 'Haiti', 'Dominican Republic', 'Timor-Leste'], common: ['Japan', 'United Kingdom', 'Ireland', 'Iceland', 'Madagascar', 'Philippines', 'Indonesia', 'New Zealand', 'Cuba', 'Jamaica'] },
        { id: 'spanish', map: 'world', lvl: 1, ask: 'Name a country where most people speak <b>Spanish</b>', all: ['Spain', 'Mexico', 'Argentina', 'Colombia', 'Peru', 'Venezuela', 'Chile', 'Ecuador', 'Guatemala', 'Cuba', 'Bolivia', 'Dominican Republic', 'Honduras', 'Paraguay', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama', 'Uruguay', 'Equatorial Guinea'], common: ['Spain', 'Mexico', 'Argentina', 'Colombia', 'Peru', 'Chile', 'Venezuela'] },
        { id: 'nordic', map: 'world', lvl: 1, ask: 'Name a <b>Nordic</b> country', all: ['Norway', 'Sweden', 'Denmark', 'Finland', 'Iceland'], common: ['Norway', 'Sweden', 'Denmark'] },
        { id: 'olympics', map: 'world', lvl: 1, ask: 'Name a country that has hosted the <b>Summer Olympics</b> 🏅', all: ['United States', 'United Kingdom', 'France', 'Greece', 'Sweden', 'Belgium', 'Netherlands', 'Germany', 'Finland', 'Australia', 'Italy', 'Japan', 'Mexico', 'Canada', 'Russia', 'South Korea', 'Spain', 'China', 'Brazil'], common: ['United States', 'United Kingdom', 'France', 'Greece', 'Australia', 'Japan', 'China', 'Brazil'] },
        { id: 'africa', map: 'world', lvl: 2, ask: 'Name a country in <b>Africa</b>', all: ['Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cameroon', 'Cape Verde', 'Central African Republic', 'Chad', 'Comoros', 'Democratic Republic of the Congo', 'Republic of the Congo', "Côte d'Ivoire", 'Djibouti', 'Egypt', 'Equatorial Guinea', 'Eritrea', 'Eswatini', 'Ethiopia', 'Gabon', 'Gambia', 'Ghana', 'Guinea', 'Guinea-Bissau', 'Kenya', 'Lesotho', 'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali', 'Mauritania', 'Mauritius', 'Morocco', 'Mozambique', 'Namibia', 'Niger', 'Nigeria', 'Rwanda', 'São Tomé and Príncipe', 'Senegal', 'Seychelles', 'Sierra Leone', 'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo', 'Tunisia', 'Uganda', 'Zambia', 'Zimbabwe', 'Spain', 'France'], common: ['Egypt', 'South Africa', 'Nigeria', 'Kenya', 'Morocco', 'Ethiopia', 'Ghana', 'Madagascar', 'Algeria', 'Libya'] },
        { id: 'china', map: 'world', lvl: 2, ask: 'Name a country that borders <b>China</b>', all: ['Afghanistan', 'Bhutan', 'India', 'Kazakhstan', 'Kyrgyzstan', 'Laos', 'Mongolia', 'Myanmar', 'Nepal', 'North Korea', 'Pakistan', 'Russia', 'Tajikistan', 'Vietnam'], common: ['Russia', 'India', 'Mongolia', 'North Korea', 'Vietnam', 'Pakistan'] },
        { id: 'brazil', map: 'world', lvl: 2, ask: 'Name a country that borders <b>Brazil</b>', all: ['Argentina', 'Bolivia', 'Colombia', 'Guyana', 'Paraguay', 'Peru', 'Suriname', 'Uruguay', 'Venezuela', 'France'], common: ['Argentina', 'Bolivia', 'Colombia', 'Paraguay', 'Peru', 'Uruguay', 'Venezuela'] },
        { id: 'germany', map: 'world', lvl: 2, ask: 'Name a country that borders <b>Germany</b>', all: ['Denmark', 'Poland', 'Czechia', 'Austria', 'Switzerland', 'France', 'Luxembourg', 'Belgium', 'Netherlands'], common: ['Denmark', 'Poland', 'Austria', 'Switzerland', 'France', 'Netherlands', 'Belgium'] },
        { id: 'camerica', map: 'world', lvl: 2, ask: 'Name a country in <b>Central America</b>', all: ['Belize', 'Guatemala', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama'], common: ['Costa Rica', 'Panama', 'Guatemala'] },
        { id: 'portuguese', map: 'world', lvl: 2, ask: 'Name a country where <b>Portuguese</b> is an official language', all: ['Portugal', 'Brazil', 'Angola', 'Mozambique', 'Cape Verde', 'Guinea-Bissau', 'São Tomé and Príncipe', 'Timor-Leste', 'Equatorial Guinea'], common: ['Portugal', 'Brazil'] },
        { id: 'equator', map: 'world', lvl: 2, ask: 'Name a country on the <b>equator</b>', all: ['Ecuador', 'Colombia', 'Brazil', 'São Tomé and Príncipe', 'Gabon', 'Republic of the Congo', 'Democratic Republic of the Congo', 'Uganda', 'Kenya', 'Somalia', 'Maldives', 'Indonesia', 'Kiribati'], common: ['Ecuador', 'Colombia', 'Brazil', 'Kenya', 'Indonesia'] },
        { id: 'stan', map: 'world', lvl: 2, ask: 'Name a country ending in <b>-stan</b>', all: ['Afghanistan', 'Kazakhstan', 'Kyrgyzstan', 'Pakistan', 'Tajikistan', 'Turkmenistan', 'Uzbekistan'], common: ['Afghanistan', 'Kazakhstan', 'Pakistan'] },
        { id: 'russia', map: 'world', lvl: 3, ask: 'Name a country that borders <b>Russia</b>', all: ['Norway', 'Finland', 'Estonia', 'Latvia', 'Lithuania', 'Poland', 'Belarus', 'Ukraine', 'Georgia', 'Azerbaijan', 'Kazakhstan', 'China', 'Mongolia', 'North Korea'], common: ['Finland', 'Ukraine', 'China', 'Kazakhstan', 'Mongolia', 'Norway'] },
        { id: 'landlocked', map: 'world', lvl: 3, ask: 'Name a <b>landlocked</b> country (no coastline)', all: ['Afghanistan', 'Andorra', 'Armenia', 'Austria', 'Azerbaijan', 'Belarus', 'Bhutan', 'Bolivia', 'Botswana', 'Burkina Faso', 'Burundi', 'Central African Republic', 'Chad', 'Czechia', 'Eswatini', 'Ethiopia', 'Hungary', 'Kazakhstan', 'Kosovo', 'Kyrgyzstan', 'Laos', 'Lesotho', 'Liechtenstein', 'Luxembourg', 'Malawi', 'Mali', 'Moldova', 'Mongolia', 'Nepal', 'Niger', 'North Macedonia', 'Paraguay', 'Rwanda', 'San Marino', 'Serbia', 'Slovakia', 'South Sudan', 'Switzerland', 'Tajikistan', 'Turkmenistan', 'Uganda', 'Uzbekistan', 'Vatican City', 'Zambia', 'Zimbabwe'], common: ['Switzerland', 'Austria', 'Bolivia', 'Paraguay', 'Mongolia', 'Nepal', 'Afghanistan', 'Hungary', 'Czechia', 'Kazakhstan'] },
        // USA
        { id: 'mexicoBorder', map: 'us', lvl: 1, ask: 'Name a state that borders <b>Mexico</b>', all: ['California', 'Arizona', 'New Mexico', 'Texas'], common: ['California', 'Texas', 'Arizona'] },
        { id: 'pacific', map: 'us', lvl: 1, ask: 'Name a state on the <b>Pacific Ocean</b> 🌊', all: ['California', 'Oregon', 'Washington', 'Alaska', 'Hawaii'], common: ['California', 'Oregon', 'Washington'] },
        { id: 'texasBorder', map: 'us', lvl: 1, ask: 'Name a state that borders <b>Texas</b>', all: ['New Mexico', 'Oklahoma', 'Arkansas', 'Louisiana'], common: ['New Mexico', 'Oklahoma', 'Louisiana'] },
        { id: 'gulf', map: 'us', lvl: 1, ask: 'Name a state on the <b>Gulf Coast</b>', all: ['Texas', 'Louisiana', 'Mississippi', 'Alabama', 'Florida'], common: ['Texas', 'Louisiana', 'Florida'] },
        { id: 'caBorder', map: 'us', lvl: 1, ask: 'Name a state that borders <b>California</b>', all: ['Oregon', 'Nevada', 'Arizona'], common: ['Oregon', 'Nevada', 'Arizona'] },
        { id: 'newEngland', map: 'us', lvl: 2, ask: 'Name a <b>New England</b> state', all: ['Maine', 'New Hampshire', 'Vermont', 'Massachusetts', 'Rhode Island', 'Connecticut'], common: ['Maine', 'Massachusetts', 'Vermont'] },
        { id: 'greatLakes', map: 'us', lvl: 2, ask: 'Name a state on the <b>Great Lakes</b>', all: ['Minnesota', 'Wisconsin', 'Illinois', 'Indiana', 'Michigan', 'Ohio', 'Pennsylvania', 'New York'], common: ['Michigan', 'Ohio', 'Illinois', 'New York', 'Wisconsin'] },
        { id: 'fourCorners', map: 'us', lvl: 2, ask: 'Name one of the <b>Four Corners</b> states', all: ['Arizona', 'New Mexico', 'Colorado', 'Utah'], common: ['Arizona', 'Colorado', 'Utah', 'New Mexico'] },
        { id: 'canadaBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Canada</b>', all: ['Alaska', 'Washington', 'Idaho', 'Montana', 'North Dakota', 'Minnesota', 'Michigan', 'Ohio', 'Pennsylvania', 'New York', 'Vermont', 'New Hampshire', 'Maine'], common: ['Alaska', 'Washington', 'Montana', 'Michigan', 'New York', 'Maine', 'Minnesota'] },
        { id: 'mississippi', map: 'us', lvl: 2, ask: 'Name a state on the <b>Mississippi River</b>', all: ['Minnesota', 'Wisconsin', 'Iowa', 'Illinois', 'Missouri', 'Kentucky', 'Tennessee', 'Arkansas', 'Mississippi', 'Louisiana'], common: ['Louisiana', 'Mississippi', 'Missouri', 'Minnesota', 'Tennessee'] },
        { id: 'colonies', map: 'us', lvl: 2, ask: 'Name one of the original <b>13 colonies</b>', all: ['New Hampshire', 'Massachusetts', 'Rhode Island', 'Connecticut', 'New York', 'New Jersey', 'Pennsylvania', 'Delaware', 'Maryland', 'Virginia', 'North Carolina', 'South Carolina', 'Georgia'], common: ['New York', 'Massachusetts', 'Pennsylvania', 'Virginia', 'Georgia'] },
        // ---- more world ----
        { id: 'europe', map: 'world', lvl: 1, ask: 'Name a country in <b>Europe</b>', all: ['Albania', 'Andorra', 'Austria', 'Belarus', 'Belgium', 'Bosnia and Herzegovina', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy', 'Kosovo', 'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta', 'Moldova', 'Monaco', 'Montenegro', 'Netherlands', 'North Macedonia', 'Norway', 'Poland', 'Portugal', 'Romania', 'Russia', 'San Marino', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Ukraine', 'United Kingdom', 'Vatican City', 'Turkey', 'Kazakhstan', 'Georgia', 'Azerbaijan', 'Armenia'], common: ['France', 'Germany', 'Italy', 'Spain', 'United Kingdom', 'Portugal', 'Greece', 'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Poland', 'Ireland', 'Sweden', 'Norway', 'Russia', 'Ukraine'] },
        { id: 'asia', map: 'world', lvl: 1, ask: 'Name a country in <b>Asia</b>', all: ['Afghanistan', 'Armenia', 'Azerbaijan', 'Bahrain', 'Bangladesh', 'Bhutan', 'Brunei', 'Cambodia', 'China', 'Cyprus', 'Georgia', 'India', 'Indonesia', 'Iran', 'Iraq', 'Israel', 'Japan', 'Jordan', 'Kazakhstan', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Lebanon', 'Malaysia', 'Maldives', 'Mongolia', 'Myanmar', 'Nepal', 'North Korea', 'Oman', 'Pakistan', 'Palestine', 'Philippines', 'Qatar', 'Russia', 'Saudi Arabia', 'Singapore', 'South Korea', 'Sri Lanka', 'Syria', 'Taiwan', 'Tajikistan', 'Thailand', 'Timor-Leste', 'Turkey', 'Turkmenistan', 'United Arab Emirates', 'Uzbekistan', 'Vietnam', 'Yemen', 'Egypt'], common: ['China', 'India', 'Japan', 'South Korea', 'Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Pakistan', 'Russia', 'Saudi Arabia', 'Iran', 'Israel', 'Iraq', 'North Korea', 'Mongolia'] },
        { id: 'mideast', map: 'world', lvl: 2, ask: 'Name a country in the <b>Middle East</b>', all: ['Bahrain', 'Cyprus', 'Egypt', 'Iran', 'Iraq', 'Israel', 'Jordan', 'Kuwait', 'Lebanon', 'Oman', 'Palestine', 'Qatar', 'Saudi Arabia', 'Syria', 'Turkey', 'United Arab Emirates', 'Yemen'], common: ['Saudi Arabia', 'Iran', 'Iraq', 'Israel', 'Egypt', 'Turkey', 'United Arab Emirates', 'Syria', 'Jordan'] },
        { id: 'caribbean', map: 'world', lvl: 2, ask: 'Name a country in the <b>Caribbean</b> 🌴', all: ['Cuba', 'Jamaica', 'Haiti', 'Dominican Republic', 'Bahamas', 'Barbados', 'Trinidad and Tobago', 'Saint Lucia', 'Grenada', 'Dominica', 'Antigua and Barbuda', 'Saint Kitts and Nevis', 'Saint Vincent and the Grenadines'], common: ['Cuba', 'Jamaica', 'Bahamas', 'Haiti', 'Dominican Republic'] },
        { id: 'seasia', map: 'world', lvl: 2, ask: 'Name a country in <b>Southeast Asia</b>', all: ['Thailand', 'Vietnam', 'Cambodia', 'Laos', 'Myanmar', 'Malaysia', 'Singapore', 'Indonesia', 'Philippines', 'Brunei', 'Timor-Leste'], common: ['Thailand', 'Vietnam', 'Philippines', 'Indonesia', 'Singapore', 'Malaysia'] },
        { id: 'oceania', map: 'world', lvl: 2, ask: 'Name a country in <b>Oceania</b> (Australia and the Pacific islands)', all: ['Australia', 'New Zealand', 'Fiji', 'Papua New Guinea', 'Samoa', 'Tonga', 'Vanuatu', 'Solomon Islands', 'Kiribati', 'Tuvalu', 'Nauru', 'Palau', 'Marshall Islands', 'Micronesia'], common: ['Australia', 'New Zealand', 'Fiji'] },
        { id: 'soviet', map: 'world', lvl: 3, ask: 'Name a country that was part of the <b>Soviet Union</b>', all: ['Russia', 'Ukraine', 'Belarus', 'Estonia', 'Latvia', 'Lithuania', 'Moldova', 'Georgia', 'Armenia', 'Azerbaijan', 'Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan'], common: ['Russia', 'Ukraine', 'Belarus', 'Kazakhstan'] },
        { id: 'med', map: 'world', lvl: 2, ask: 'Name a country on the <b>Mediterranean Sea</b>', all: ['Spain', 'France', 'Monaco', 'Italy', 'Malta', 'Slovenia', 'Croatia', 'Bosnia and Herzegovina', 'Montenegro', 'Albania', 'Greece', 'Turkey', 'Cyprus', 'Syria', 'Lebanon', 'Israel', 'Palestine', 'Egypt', 'Libya', 'Tunisia', 'Algeria', 'Morocco'], common: ['Spain', 'France', 'Italy', 'Greece', 'Turkey', 'Egypt', 'Croatia'] },
        { id: 'baltic', map: 'world', lvl: 3, ask: 'Name a country on the <b>Baltic Sea</b>', all: ['Sweden', 'Finland', 'Russia', 'Estonia', 'Latvia', 'Lithuania', 'Poland', 'Germany', 'Denmark'], common: ['Sweden', 'Finland', 'Russia', 'Poland', 'Germany', 'Denmark'] },
        { id: 'amazon', map: 'world', lvl: 2, ask: 'Name a country the <b>Amazon River</b> flows through', all: ['Brazil', 'Peru', 'Colombia'], common: ['Brazil'] },
        { id: 'nile', map: 'world', lvl: 2, ask: 'Name a country the <b>Nile River</b> flows through', all: ['Egypt', 'Sudan', 'South Sudan', 'Uganda', 'Ethiopia', 'Rwanda', 'Burundi', 'Tanzania', 'Kenya', 'Democratic Republic of the Congo'], common: ['Egypt', 'Sudan'] },
        { id: 'g7', map: 'world', lvl: 2, ask: 'Name a country in the <b>G7</b> (the 7 big rich democracies)', all: ['United States', 'Canada', 'United Kingdom', 'France', 'Germany', 'Italy', 'Japan'], common: ['United States', 'Canada', 'United Kingdom', 'France', 'Germany', 'Italy', 'Japan'] },
        { id: 'pop100', map: 'world', lvl: 2, ask: 'Name a country with more than <b>100 million people</b>', all: ['China', 'India', 'United States', 'Indonesia', 'Pakistan', 'Nigeria', 'Brazil', 'Bangladesh', 'Russia', 'Mexico', 'Ethiopia', 'Japan', 'Philippines', 'Egypt', 'Democratic Republic of the Congo', 'Vietnam'], common: ['China', 'India', 'United States', 'Indonesia', 'Brazil', 'Russia', 'Mexico', 'Japan', 'Pakistan', 'Nigeria'] },
        { id: 'wcHost', map: 'world', lvl: 1, ask: 'Name a country that has hosted the men\'s <b>soccer World Cup</b> ⚽', all: ['Uruguay', 'Italy', 'France', 'Brazil', 'Switzerland', 'Sweden', 'Chile', 'United Kingdom', 'Mexico', 'Germany', 'Argentina', 'Spain', 'United States', 'South Korea', 'Japan', 'South Africa', 'Russia', 'Qatar', 'Canada'], common: ['Brazil', 'Germany', 'France', 'Italy', 'United States', 'Mexico', 'Qatar', 'Russia', 'Spain', 'Argentina', 'South Africa', 'Canada'] },
        { id: 'french', map: 'world', lvl: 2, ask: 'Name a country where <b>French</b> is an official language', all: ['France', 'Canada', 'Belgium', 'Switzerland', 'Luxembourg', 'Monaco', 'Haiti', 'Senegal', "Côte d'Ivoire", 'Cameroon', 'Democratic Republic of the Congo', 'Republic of the Congo', 'Madagascar', 'Mali', 'Niger', 'Chad', 'Burkina Faso', 'Benin', 'Togo', 'Guinea', 'Gabon', 'Central African Republic', 'Burundi', 'Rwanda', 'Djibouti', 'Comoros', 'Seychelles', 'Vanuatu', 'Equatorial Guinea'], common: ['France', 'Canada', 'Belgium', 'Switzerland', 'Haiti'] },
        { id: 'arabic', map: 'world', lvl: 2, ask: 'Name a country where <b>Arabic</b> is an official language', all: ['Egypt', 'Saudi Arabia', 'Iraq', 'Syria', 'Jordan', 'Lebanon', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'Yemen', 'Libya', 'Tunisia', 'Algeria', 'Morocco', 'Sudan', 'Mauritania', 'Somalia', 'Djibouti', 'Comoros', 'Palestine', 'Chad'], common: ['Egypt', 'Saudi Arabia', 'Iraq', 'United Arab Emirates', 'Morocco', 'Jordan', 'Syria', 'Qatar'] },
        { id: 'franceBorder', map: 'world', lvl: 1, ask: 'Name a country that borders <b>France</b>', all: ['Belgium', 'Luxembourg', 'Germany', 'Switzerland', 'Italy', 'Monaco', 'Spain', 'Andorra', 'Brazil', 'Suriname'], common: ['Belgium', 'Germany', 'Switzerland', 'Italy', 'Spain'] },
        { id: 'indiaBorder', map: 'world', lvl: 2, ask: 'Name a country that borders <b>India</b>', all: ['Pakistan', 'China', 'Nepal', 'Bhutan', 'Bangladesh', 'Myanmar'], common: ['Pakistan', 'China', 'Nepal', 'Bangladesh'] },
        { id: 'mexicoBorderW', map: 'world', lvl: 1, ask: 'Name a country that borders <b>Mexico</b>', all: ['United States', 'Guatemala', 'Belize'], common: ['United States'] },
        { id: 'spainBorder', map: 'world', lvl: 1, ask: 'Name a country that borders <b>Spain</b>', all: ['Portugal', 'France', 'Andorra', 'Morocco', 'United Kingdom'], common: ['Portugal', 'France'] },
        { id: 'argBorder', map: 'world', lvl: 2, ask: 'Name a country that borders <b>Argentina</b>', all: ['Chile', 'Bolivia', 'Paraguay', 'Brazil', 'Uruguay'], common: ['Chile', 'Brazil'] },
        { id: 'egyptBorder', map: 'world', lvl: 2, ask: 'Name a country that borders <b>Egypt</b>', all: ['Libya', 'Sudan', 'Israel', 'Palestine'], common: ['Libya', 'Sudan', 'Israel'] },
        { id: 'saudiBorder', map: 'world', lvl: 3, ask: 'Name a country that borders <b>Saudi Arabia</b>', all: ['Jordan', 'Iraq', 'Kuwait', 'Qatar', 'United Arab Emirates', 'Oman', 'Yemen'], common: ['Iraq', 'Jordan', 'Yemen', 'Kuwait'] },
        { id: 'guinea', map: 'world', lvl: 2, ask: 'Name a country with <b>Guinea</b> in its name', all: ['Guinea', 'Guinea-Bissau', 'Equatorial Guinea', 'Papua New Guinea'], common: ['Guinea', 'Papua New Guinea'] },
        { id: 'united', map: 'world', lvl: 1, ask: 'Name a country with <b>United</b> in its name', all: ['United States', 'United Kingdom', 'United Arab Emirates'], common: ['United States', 'United Kingdom'] },
        { id: 'horn', map: 'world', lvl: 3, ask: 'Name a country in the <b>Horn of Africa</b>', all: ['Ethiopia', 'Somalia', 'Eritrea', 'Djibouti'], common: ['Ethiopia', 'Somalia'] },
        // ---- more USA ----
        { id: 'flBorder', map: 'us', lvl: 1, ask: 'Name a state that borders <b>Florida</b>', all: ['Georgia', 'Alabama'], common: ['Georgia', 'Alabama'] },
        { id: 'nyBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>New York</b>', all: ['Vermont', 'Massachusetts', 'Connecticut', 'New Jersey', 'Pennsylvania'], common: ['New Jersey', 'Pennsylvania', 'Vermont', 'Massachusetts'] },
        { id: 'coBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Colorado</b>', all: ['Wyoming', 'Nebraska', 'Kansas', 'Oklahoma', 'New Mexico', 'Arizona', 'Utah'], common: ['Wyoming', 'Utah', 'New Mexico', 'Kansas', 'Nebraska'] },
        { id: 'tnBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Tennessee</b>', all: ['Kentucky', 'Virginia', 'North Carolina', 'Georgia', 'Alabama', 'Mississippi', 'Arkansas', 'Missouri'], common: ['Kentucky', 'Georgia', 'Alabama', 'North Carolina', 'Mississippi'] },
        { id: 'moBorder', map: 'us', lvl: 3, ask: 'Name a state that borders <b>Missouri</b>', all: ['Iowa', 'Illinois', 'Kentucky', 'Tennessee', 'Arkansas', 'Oklahoma', 'Kansas', 'Nebraska'], common: ['Illinois', 'Kansas', 'Iowa', 'Arkansas', 'Oklahoma'] },
        { id: 'kyBorder', map: 'us', lvl: 3, ask: 'Name a state that borders <b>Kentucky</b>', all: ['Illinois', 'Indiana', 'Ohio', 'West Virginia', 'Virginia', 'Tennessee', 'Missouri'], common: ['Tennessee', 'Ohio', 'Indiana', 'Illinois'] },
        { id: 'gaBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Georgia</b>', all: ['Florida', 'Alabama', 'Tennessee', 'North Carolina', 'South Carolina'], common: ['Florida', 'Alabama', 'Tennessee', 'South Carolina'] },
        { id: 'ohBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Ohio</b>', all: ['Michigan', 'Indiana', 'Kentucky', 'West Virginia', 'Pennsylvania'], common: ['Michigan', 'Indiana', 'Kentucky', 'Pennsylvania'] },
        { id: 'nvBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Nevada</b>', all: ['California', 'Oregon', 'Idaho', 'Utah', 'Arizona'], common: ['California', 'Oregon', 'Utah', 'Arizona'] },
        { id: 'okBorder', map: 'us', lvl: 3, ask: 'Name a state that borders <b>Oklahoma</b>', all: ['Kansas', 'Missouri', 'Arkansas', 'Texas', 'New Mexico', 'Colorado'], common: ['Texas', 'Kansas', 'Arkansas'] },
        { id: 'rockies', map: 'us', lvl: 2, ask: 'Name a <b>Rocky Mountain</b> state', all: ['Montana', 'Idaho', 'Wyoming', 'Colorado', 'Utah', 'New Mexico'], common: ['Colorado', 'Montana', 'Wyoming', 'Utah'] },
        { id: 'midwest', map: 'us', lvl: 2, ask: 'Name a state in the <b>Midwest</b>', all: ['Ohio', 'Indiana', 'Illinois', 'Michigan', 'Wisconsin', 'Minnesota', 'Iowa', 'Missouri', 'North Dakota', 'South Dakota', 'Nebraska', 'Kansas'], common: ['Ohio', 'Illinois', 'Michigan', 'Iowa', 'Indiana', 'Wisconsin', 'Minnesota'] },
        { id: 'atlantic', map: 'us', lvl: 1, ask: 'Name a state on the <b>Atlantic Ocean</b> 🌊', all: ['Maine', 'New Hampshire', 'Massachusetts', 'Rhode Island', 'Connecticut', 'New York', 'New Jersey', 'Delaware', 'Maryland', 'Virginia', 'North Carolina', 'South Carolina', 'Georgia', 'Florida'], common: ['Florida', 'New York', 'Maine', 'Massachusetts', 'New Jersey', 'North Carolina', 'South Carolina', 'Georgia', 'Virginia'] },
        { id: 'aEnds', map: 'us', lvl: 1, ask: 'Name a state that starts <b>and</b> ends with the letter <b>A</b>', all: ['Alabama', 'Alaska', 'Arizona'], common: ['Alabama', 'Alaska', 'Arizona'] },
        { id: 'four', map: 'us', lvl: 1, ask: 'Name a state with only <b>4 letters</b>', all: ['Iowa', 'Ohio', 'Utah'], common: ['Iowa', 'Ohio', 'Utah'] },
        { id: 'twoWord', map: 'us', lvl: 1, ask: 'Name a state with a <b>two-word</b> name', all: ['New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'South Carolina', 'South Dakota', 'Rhode Island', 'West Virginia'], common: ['New York', 'New Jersey', 'New Mexico', 'North Carolina', 'South Carolina'] },
        { id: 'lakeMich', map: 'us', lvl: 2, ask: 'Name a state on <b>Lake Michigan</b>', all: ['Wisconsin', 'Illinois', 'Indiana', 'Michigan'], common: ['Michigan', 'Illinois', 'Wisconsin'] },
        { id: 'lakeErie', map: 'us', lvl: 3, ask: 'Name a state on <b>Lake Erie</b>', all: ['New York', 'Pennsylvania', 'Ohio', 'Michigan'], common: ['Ohio', 'New York', 'Michigan'] },
        { id: 'plains', map: 'us', lvl: 2, ask: 'Name a <b>Great Plains</b> state', all: ['North Dakota', 'South Dakota', 'Nebraska', 'Kansas', 'Oklahoma'], common: ['Kansas', 'Nebraska', 'North Dakota', 'South Dakota'] },
        { id: 'pnw', map: 'us', lvl: 1, ask: 'Name a state in the <b>Pacific Northwest</b>', all: ['Washington', 'Oregon', 'Idaho'], common: ['Washington', 'Oregon'] },
        { id: 'nfl', map: 'us', lvl: 1, ask: 'Name a state with an <b>NFL team</b> 🏈', all: ['Arizona', 'California', 'Colorado', 'Florida', 'Georgia', 'Illinois', 'Indiana', 'Louisiana', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Missouri', 'Nevada', 'New Jersey', 'New York', 'North Carolina', 'Ohio', 'Pennsylvania', 'Tennessee', 'Texas', 'Washington', 'Wisconsin'], common: ['California', 'Texas', 'Florida', 'New York', 'Pennsylvania', 'Ohio', 'Illinois'] },
        { id: 'route66', map: 'us', lvl: 3, ask: 'Name a state that <b>Route 66</b> passes through', all: ['Illinois', 'Missouri', 'Kansas', 'Oklahoma', 'Texas', 'New Mexico', 'Arizona', 'California'], common: ['Illinois', 'California', 'Arizona', 'Texas', 'New Mexico', 'Oklahoma'] },
        { id: 'appalachian', map: 'us', lvl: 3, ask: 'Name a state the <b>Appalachian Trail</b> passes through', all: ['Georgia', 'North Carolina', 'Tennessee', 'Virginia', 'West Virginia', 'Maryland', 'Pennsylvania', 'New Jersey', 'New York', 'Connecticut', 'Massachusetts', 'Vermont', 'New Hampshire', 'Maine'], common: ['Georgia', 'North Carolina', 'Tennessee', 'Virginia', 'Pennsylvania', 'Maine'] },
        // ---- world: more borders ----
        { id: 'turkeyBorder', map: 'world', lvl: 2, ask: 'Name a country that borders <b>Turkey</b>', all: ['Greece', 'Bulgaria', 'Georgia', 'Armenia', 'Azerbaijan', 'Iran', 'Iraq', 'Syria'], common: ['Greece', 'Bulgaria', 'Iran', 'Iraq', 'Syria', 'Georgia'] },
        { id: 'italyBorder', map: 'world', lvl: 1, ask: 'Name a country that borders <b>Italy</b>', all: ['France', 'Switzerland', 'Austria', 'Slovenia', 'San Marino', 'Vatican City'], common: ['France', 'Switzerland', 'Austria'] },
        { id: 'peruBorder', map: 'world', lvl: 2, ask: 'Name a country that borders <b>Peru</b>', all: ['Ecuador', 'Colombia', 'Brazil', 'Bolivia', 'Chile'], common: ['Ecuador', 'Colombia', 'Brazil', 'Bolivia', 'Chile'] },
        { id: 'kenyaBorder', map: 'world', lvl: 3, ask: 'Name a country that borders <b>Kenya</b>', all: ['Ethiopia', 'Somalia', 'Tanzania', 'Uganda', 'South Sudan'], common: ['Ethiopia', 'Somalia', 'Tanzania', 'Uganda'] },
        { id: 'zaBorder', map: 'world', lvl: 3, ask: 'Name a country that borders <b>South Africa</b>', all: ['Namibia', 'Botswana', 'Zimbabwe', 'Mozambique', 'Eswatini', 'Lesotho'], common: ['Namibia', 'Botswana', 'Zimbabwe', 'Mozambique'] },
        { id: 'austriaBorder', map: 'world', lvl: 2, ask: 'Name a country that borders <b>Austria</b>', all: ['Germany', 'Czechia', 'Slovakia', 'Hungary', 'Slovenia', 'Italy', 'Switzerland', 'Liechtenstein'], common: ['Germany', 'Czechia', 'Hungary', 'Italy', 'Switzerland', 'Slovakia', 'Slovenia'] },
        { id: 'polandBorder', map: 'world', lvl: 2, ask: 'Name a country that borders <b>Poland</b>', all: ['Germany', 'Czechia', 'Slovakia', 'Ukraine', 'Belarus', 'Lithuania', 'Russia'], common: ['Germany', 'Czechia', 'Ukraine', 'Belarus', 'Slovakia', 'Lithuania'] },
        { id: 'ukraineBorder', map: 'world', lvl: 2, ask: 'Name a country that borders <b>Ukraine</b>', all: ['Russia', 'Belarus', 'Poland', 'Slovakia', 'Hungary', 'Romania', 'Moldova'], common: ['Russia', 'Belarus', 'Poland', 'Hungary', 'Romania'] },
        { id: 'iranBorder', map: 'world', lvl: 3, ask: 'Name a country that borders <b>Iran</b>', all: ['Iraq', 'Turkey', 'Armenia', 'Azerbaijan', 'Turkmenistan', 'Afghanistan', 'Pakistan'], common: ['Iraq', 'Turkey', 'Afghanistan', 'Pakistan'] },
        { id: 'afghanBorder', map: 'world', lvl: 3, ask: 'Name a country that borders <b>Afghanistan</b>', all: ['Pakistan', 'Iran', 'Turkmenistan', 'Uzbekistan', 'Tajikistan', 'China'], common: ['Pakistan', 'Iran', 'China'] },
        { id: 'thaiBorder', map: 'world', lvl: 2, ask: 'Name a country that borders <b>Thailand</b>', all: ['Myanmar', 'Laos', 'Cambodia', 'Malaysia'], common: ['Myanmar', 'Laos', 'Cambodia', 'Malaysia'] },
        { id: 'vietBorder', map: 'world', lvl: 2, ask: 'Name a country that borders <b>Vietnam</b>', all: ['China', 'Laos', 'Cambodia'], common: ['China', 'Laos', 'Cambodia'] },
        { id: 'colBorder', map: 'world', lvl: 2, ask: 'Name a country that borders <b>Colombia</b>', all: ['Venezuela', 'Brazil', 'Peru', 'Ecuador', 'Panama'], common: ['Venezuela', 'Brazil', 'Peru', 'Ecuador', 'Panama'] },
        { id: 'swissBorder', map: 'world', lvl: 1, ask: 'Name a country that borders <b>Switzerland</b>', all: ['Germany', 'France', 'Italy', 'Austria', 'Liechtenstein'], common: ['Germany', 'France', 'Italy', 'Austria'] },
        { id: 'hungaryBorder', map: 'world', lvl: 3, ask: 'Name a country that borders <b>Hungary</b>', all: ['Austria', 'Slovakia', 'Ukraine', 'Romania', 'Serbia', 'Croatia', 'Slovenia'], common: ['Austria', 'Slovakia', 'Romania', 'Serbia', 'Croatia'] },
        { id: 'israelBorder', map: 'world', lvl: 2, ask: 'Name a country that borders <b>Israel</b>', all: ['Lebanon', 'Syria', 'Jordan', 'Egypt', 'Palestine'], common: ['Lebanon', 'Syria', 'Jordan', 'Egypt'] },
        // ---- world: groups, seas, rivers, mountains ----
        { id: 'eu', map: 'world', lvl: 1, ask: 'Name a country in the <b>European Union</b> 🇪🇺', all: ['Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden'], common: ['France', 'Germany', 'Italy', 'Spain', 'Portugal', 'Greece', 'Netherlands', 'Belgium', 'Ireland', 'Austria', 'Poland', 'Sweden', 'Denmark', 'Finland'] },
        { id: 'nato', map: 'world', lvl: 2, ask: 'Name a member of <b>NATO</b>', all: ['United States', 'Canada', 'United Kingdom', 'France', 'Germany', 'Italy', 'Spain', 'Portugal', 'Netherlands', 'Belgium', 'Luxembourg', 'Denmark', 'Norway', 'Iceland', 'Greece', 'Turkey', 'Poland', 'Czechia', 'Hungary', 'Slovakia', 'Slovenia', 'Estonia', 'Latvia', 'Lithuania', 'Romania', 'Bulgaria', 'Croatia', 'Albania', 'Montenegro', 'North Macedonia', 'Finland', 'Sweden'], common: ['United States', 'Canada', 'United Kingdom', 'France', 'Germany', 'Italy', 'Spain', 'Poland', 'Turkey', 'Norway', 'Netherlands'] },
        { id: 'blackSea', map: 'world', lvl: 2, ask: 'Name a country on the <b>Black Sea</b>', all: ['Turkey', 'Bulgaria', 'Romania', 'Ukraine', 'Russia', 'Georgia'], common: ['Turkey', 'Ukraine', 'Russia', 'Romania', 'Bulgaria'] },
        { id: 'redSea', map: 'world', lvl: 3, ask: 'Name a country on the <b>Red Sea</b>', all: ['Egypt', 'Sudan', 'Eritrea', 'Djibouti', 'Saudi Arabia', 'Yemen', 'Israel', 'Jordan'], common: ['Egypt', 'Saudi Arabia', 'Yemen', 'Sudan'] },
        { id: 'caspian', map: 'world', lvl: 3, ask: 'Name a country on the <b>Caspian Sea</b>', all: ['Russia', 'Kazakhstan', 'Turkmenistan', 'Iran', 'Azerbaijan'], common: ['Russia', 'Kazakhstan', 'Iran'] },
        { id: 'danube', map: 'world', lvl: 3, ask: 'Name a country the <b>Danube River</b> flows through', all: ['Germany', 'Austria', 'Slovakia', 'Hungary', 'Croatia', 'Serbia', 'Romania', 'Bulgaria', 'Moldova', 'Ukraine'], common: ['Germany', 'Austria', 'Hungary', 'Romania', 'Serbia', 'Bulgaria'] },
        { id: 'andes', map: 'world', lvl: 2, ask: 'Name a country the <b>Andes Mountains</b> run through', all: ['Venezuela', 'Colombia', 'Ecuador', 'Peru', 'Bolivia', 'Chile', 'Argentina'], common: ['Peru', 'Chile', 'Argentina', 'Bolivia', 'Colombia', 'Ecuador'] },
        { id: 'alps', map: 'world', lvl: 2, ask: 'Name a country the <b>Alps</b> are in 🏔️', all: ['France', 'Switzerland', 'Italy', 'Monaco', 'Liechtenstein', 'Austria', 'Germany', 'Slovenia'], common: ['France', 'Switzerland', 'Italy', 'Austria', 'Germany'] },
        { id: 'himalaya', map: 'world', lvl: 2, ask: 'Name a country the <b>Himalayas</b> are in', all: ['Nepal', 'India', 'Bhutan', 'China', 'Pakistan'], common: ['Nepal', 'India', 'China'] },
        { id: 'sahara', map: 'world', lvl: 2, ask: 'Name a country in the <b>Sahara Desert</b> 🐪', all: ['Morocco', 'Algeria', 'Tunisia', 'Libya', 'Egypt', 'Sudan', 'Chad', 'Niger', 'Mali', 'Mauritania'], common: ['Egypt', 'Libya', 'Algeria', 'Morocco', 'Sudan'] },
        { id: 'winterOly', map: 'world', lvl: 2, ask: 'Name a country that has hosted the <b>Winter Olympics</b> ⛷️', all: ['France', 'Switzerland', 'United States', 'Germany', 'Norway', 'Italy', 'Austria', 'Japan', 'Canada', 'Bosnia and Herzegovina', 'Russia', 'South Korea', 'China'], common: ['France', 'Switzerland', 'United States', 'Norway', 'Italy', 'Japan', 'Canada', 'Russia', 'China'] },
        { id: 'southAsia', map: 'world', lvl: 2, ask: 'Name a country in <b>South Asia</b>', all: ['India', 'Pakistan', 'Bangladesh', 'Nepal', 'Bhutan', 'Sri Lanka', 'Maldives', 'Afghanistan'], common: ['India', 'Pakistan', 'Bangladesh', 'Nepal', 'Sri Lanka'] },
        { id: 'centralAsia', map: 'world', lvl: 3, ask: 'Name a country in <b>Central Asia</b>', all: ['Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan'], common: ['Kazakhstan', 'Uzbekistan'] },
        { id: 'eastAsia', map: 'world', lvl: 1, ask: 'Name a country in <b>East Asia</b>', all: ['China', 'Japan', 'South Korea', 'North Korea', 'Mongolia', 'Taiwan'], common: ['China', 'Japan', 'South Korea', 'North Korea'] },
        { id: 'westAfrica', map: 'world', lvl: 3, ask: 'Name a country in <b>West Africa</b>', all: ['Nigeria', 'Ghana', 'Senegal', "Côte d'Ivoire", 'Mali', 'Burkina Faso', 'Niger', 'Guinea', 'Guinea-Bissau', 'Sierra Leone', 'Liberia', 'Togo', 'Benin', 'Gambia', 'Cape Verde', 'Mauritania'], common: ['Nigeria', 'Ghana', 'Senegal', 'Mali', "Côte d'Ivoire"] },
        { id: 'balticStates', map: 'world', lvl: 2, ask: 'Name one of the three <b>Baltic states</b>', all: ['Estonia', 'Latvia', 'Lithuania'], common: ['Estonia', 'Latvia', 'Lithuania'] },
        { id: 'britishIsles', map: 'world', lvl: 1, ask: 'Name a country in the <b>British Isles</b>', all: ['United Kingdom', 'Ireland'], common: ['United Kingdom', 'Ireland'] },
        { id: 'benelux', map: 'world', lvl: 2, ask: 'Name a <b>Benelux</b> country', all: ['Belgium', 'Netherlands', 'Luxembourg'], common: ['Belgium', 'Netherlands', 'Luxembourg'] },
        { id: 'iberia', map: 'world', lvl: 2, ask: 'Name a country on the <b>Iberian Peninsula</b>', all: ['Spain', 'Portugal', 'Andorra', 'United Kingdom'], common: ['Spain', 'Portugal'] },
        { id: 'arabia', map: 'world', lvl: 2, ask: 'Name a country on the <b>Arabian Peninsula</b>', all: ['Saudi Arabia', 'Yemen', 'Oman', 'United Arab Emirates', 'Qatar', 'Bahrain', 'Kuwait'], common: ['Saudi Arabia', 'Yemen', 'Oman', 'United Arab Emirates', 'Qatar'] },
        // ---- world: names ----
        { id: 'republic', map: 'world', lvl: 2, ask: 'Name a country with <b>Republic</b> in its name', all: ['Central African Republic', 'Dominican Republic', 'Republic of the Congo', 'Democratic Republic of the Congo', 'Czechia'], common: ['Dominican Republic', 'Central African Republic', 'Czechia'] },
        { id: 'south', map: 'world', lvl: 1, ask: 'Name a country with <b>South</b> in its name', all: ['South Africa', 'South Korea', 'South Sudan'], common: ['South Africa', 'South Korea'] },
        { id: 'north', map: 'world', lvl: 1, ask: 'Name a country with <b>North</b> in its name', all: ['North Korea', 'North Macedonia'], common: ['North Korea', 'North Macedonia'] },
        { id: 'saint', map: 'world', lvl: 3, ask: 'Name a country with <b>Saint</b> in its name', all: ['Saint Lucia', 'Saint Kitts and Nevis', 'Saint Vincent and the Grenadines', 'São Tomé and Príncipe'], common: ['Saint Lucia', 'Saint Kitts and Nevis', 'Saint Vincent and the Grenadines'] },
        { id: 'islandsName', map: 'world', lvl: 3, ask: 'Name a country with <b>Islands</b> in its name', all: ['Solomon Islands', 'Marshall Islands'], common: ['Solomon Islands', 'Marshall Islands'] },
        { id: 'newName', map: 'world', lvl: 1, ask: 'Name a country with <b>New</b> in its name', all: ['New Zealand', 'Papua New Guinea'], common: ['New Zealand', 'Papua New Guinea'] },
        // ---- USA: more borders ----
        { id: 'paBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Pennsylvania</b>', all: ['New York', 'New Jersey', 'Delaware', 'Maryland', 'West Virginia', 'Ohio'], common: ['New York', 'New Jersey', 'Ohio', 'Maryland'] },
        { id: 'idBorder', map: 'us', lvl: 3, ask: 'Name a state that borders <b>Idaho</b>', all: ['Washington', 'Oregon', 'Nevada', 'Utah', 'Wyoming', 'Montana'], common: ['Washington', 'Oregon', 'Montana', 'Utah'] },
        { id: 'utBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Utah</b>', all: ['Idaho', 'Wyoming', 'Colorado', 'New Mexico', 'Arizona', 'Nevada'], common: ['Idaho', 'Wyoming', 'Colorado', 'Arizona', 'Nevada'] },
        { id: 'wyBorder', map: 'us', lvl: 3, ask: 'Name a state that borders <b>Wyoming</b>', all: ['Montana', 'South Dakota', 'Nebraska', 'Colorado', 'Utah', 'Idaho'], common: ['Montana', 'Colorado', 'Utah', 'Idaho'] },
        { id: 'sdBorder', map: 'us', lvl: 3, ask: 'Name a state that borders <b>South Dakota</b>', all: ['North Dakota', 'Minnesota', 'Iowa', 'Nebraska', 'Wyoming', 'Montana'], common: ['North Dakota', 'Minnesota', 'Nebraska', 'Iowa'] },
        { id: 'ilBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Illinois</b>', all: ['Wisconsin', 'Iowa', 'Missouri', 'Kentucky', 'Indiana'], common: ['Wisconsin', 'Indiana', 'Missouri', 'Iowa'] },
        { id: 'iaBorder', map: 'us', lvl: 3, ask: 'Name a state that borders <b>Iowa</b>', all: ['Minnesota', 'Wisconsin', 'Illinois', 'Missouri', 'Nebraska', 'South Dakota'], common: ['Minnesota', 'Illinois', 'Missouri', 'Nebraska', 'Wisconsin'] },
        { id: 'arBorder', map: 'us', lvl: 3, ask: 'Name a state that borders <b>Arkansas</b>', all: ['Missouri', 'Tennessee', 'Mississippi', 'Louisiana', 'Texas', 'Oklahoma'], common: ['Texas', 'Louisiana', 'Missouri', 'Oklahoma', 'Tennessee'] },
        { id: 'laBorder', map: 'us', lvl: 1, ask: 'Name a state that borders <b>Louisiana</b>', all: ['Texas', 'Arkansas', 'Mississippi'], common: ['Texas', 'Arkansas', 'Mississippi'] },
        { id: 'alBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Alabama</b>', all: ['Tennessee', 'Georgia', 'Florida', 'Mississippi'], common: ['Tennessee', 'Georgia', 'Florida', 'Mississippi'] },
        { id: 'msBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Mississippi</b>', all: ['Tennessee', 'Alabama', 'Louisiana', 'Arkansas'], common: ['Tennessee', 'Alabama', 'Louisiana', 'Arkansas'] },
        { id: 'vaBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Virginia</b>', all: ['Maryland', 'West Virginia', 'Kentucky', 'Tennessee', 'North Carolina'], common: ['North Carolina', 'West Virginia', 'Maryland', 'Kentucky'] },
        { id: 'maBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Massachusetts</b>', all: ['New Hampshire', 'Vermont', 'New York', 'Connecticut', 'Rhode Island'], common: ['New Hampshire', 'Vermont', 'New York', 'Connecticut', 'Rhode Island'] },
        { id: 'miBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Michigan</b>', all: ['Ohio', 'Indiana', 'Wisconsin'], common: ['Ohio', 'Indiana', 'Wisconsin'] },
        { id: 'mnBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Minnesota</b>', all: ['North Dakota', 'South Dakota', 'Iowa', 'Wisconsin'], common: ['North Dakota', 'South Dakota', 'Iowa', 'Wisconsin'] },
        { id: 'ksBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Kansas</b>', all: ['Nebraska', 'Missouri', 'Oklahoma', 'Colorado'], common: ['Nebraska', 'Missouri', 'Oklahoma', 'Colorado'] },
        { id: 'neBorder', map: 'us', lvl: 3, ask: 'Name a state that borders <b>Nebraska</b>', all: ['South Dakota', 'Iowa', 'Missouri', 'Kansas', 'Colorado', 'Wyoming'], common: ['South Dakota', 'Iowa', 'Kansas', 'Colorado'] },
        { id: 'azBorder', map: 'us', lvl: 1, ask: 'Name a state that borders <b>Arizona</b>', all: ['California', 'Nevada', 'Utah', 'New Mexico', 'Colorado'], common: ['California', 'Nevada', 'Utah', 'New Mexico'] },
        { id: 'nmBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>New Mexico</b>', all: ['Arizona', 'Utah', 'Colorado', 'Oklahoma', 'Texas'], common: ['Arizona', 'Colorado', 'Texas', 'Oklahoma'] },
        { id: 'waBorder', map: 'us', lvl: 1, ask: 'Name a state that borders <b>Washington</b> state', all: ['Oregon', 'Idaho'], common: ['Oregon', 'Idaho'] },
        { id: 'orBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>Oregon</b>', all: ['Washington', 'Idaho', 'Nevada', 'California'], common: ['Washington', 'Idaho', 'Nevada', 'California'] },
        { id: 'mtBorder', map: 'us', lvl: 3, ask: 'Name a state that borders <b>Montana</b>', all: ['Idaho', 'Wyoming', 'South Dakota', 'North Dakota'], common: ['Idaho', 'Wyoming', 'North Dakota', 'South Dakota'] },
        { id: 'ncBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>North Carolina</b>', all: ['Virginia', 'Tennessee', 'Georgia', 'South Carolina'], common: ['Virginia', 'Tennessee', 'Georgia', 'South Carolina'] },
        { id: 'mdBorder', map: 'us', lvl: 3, ask: 'Name a state that borders <b>Maryland</b>', all: ['Pennsylvania', 'Delaware', 'Virginia', 'West Virginia'], common: ['Pennsylvania', 'Delaware', 'Virginia', 'West Virginia'] },
        { id: 'njBorder', map: 'us', lvl: 2, ask: 'Name a state that borders <b>New Jersey</b>', all: ['New York', 'Pennsylvania', 'Delaware'], common: ['New York', 'Pennsylvania', 'Delaware'] },
        // ---- USA: rivers and fun groups ----
        { id: 'ohioRiver', map: 'us', lvl: 3, ask: 'Name a state on the <b>Ohio River</b>', all: ['Pennsylvania', 'Ohio', 'West Virginia', 'Kentucky', 'Indiana', 'Illinois'], common: ['Ohio', 'Kentucky', 'Pennsylvania', 'Indiana'] },
        { id: 'missouriRiver', map: 'us', lvl: 3, ask: 'Name a state on the <b>Missouri River</b>', all: ['Montana', 'North Dakota', 'South Dakota', 'Nebraska', 'Iowa', 'Kansas', 'Missouri'], common: ['Missouri', 'Nebraska', 'Iowa', 'Kansas', 'Montana'] },
        { id: 'lastTwo', map: 'us', lvl: 1, ask: 'Name one of the <b>last two states</b> to join the U.S.', all: ['Alaska', 'Hawaii'], common: ['Alaska', 'Hawaii'] },
        { id: 'northSouth', map: 'us', lvl: 1, ask: 'Name a state with <b>North</b> or <b>South</b> in its name', all: ['North Carolina', 'North Dakota', 'South Carolina', 'South Dakota'], common: ['North Carolina', 'North Dakota', 'South Carolina', 'South Dakota'] },
        { id: 'newState', map: 'us', lvl: 1, ask: 'Name a state with <b>New</b> in its name', all: ['New York', 'New Jersey', 'New Mexico', 'New Hampshire'], common: ['New York', 'New Jersey', 'New Mexico', 'New Hampshire'] },
        { id: 'namedPerson', map: 'us', lvl: 3, ask: 'Name a state <b>named after a person</b>', all: ['Washington', 'Virginia', 'West Virginia', 'Georgia', 'Maryland', 'Pennsylvania', 'Louisiana', 'North Carolina', 'South Carolina', 'Delaware', 'New York'], common: ['Washington', 'Virginia', 'Georgia', 'Pennsylvania'] },
        { id: 'doubleS', map: 'us', lvl: 2, ask: 'Name a state with a double <b>SS</b> in its name', all: ['Mississippi', 'Massachusetts', 'Missouri', 'Tennessee'], common: ['Mississippi', 'Massachusetts', 'Missouri', 'Tennessee'] },
        { id: 'axis', map: 'world', lvl: 1, ask: 'Name one of the three main <b>Axis powers</b> of WWII', all: ['Germany', 'Italy', 'Japan'], common: ['Germany', 'Italy', 'Japan'] },
        { id: 'big3', map: 'world', lvl: 1, ask: 'Name one of the WWII Allied <b>"Big Three"</b> (count the Soviet Union as Russia)', all: ['United States', 'United Kingdom', 'Russia'], common: ['United States', 'United Kingdom', 'Russia'] },
        { id: 'ww2neutral', map: 'world', lvl: 2, ask: 'Name a European country that stayed <b>neutral in WWII</b>', all: ['Switzerland', 'Sweden', 'Ireland', 'Spain', 'Portugal'], common: ['Switzerland', 'Sweden'] },
        { id: 'koreaSplit', map: 'world', lvl: 1, ask: 'Name one of the two countries <b>Korea was split into</b> after WWII', all: ['North Korea', 'South Korea'], common: ['North Korea', 'South Korea'] },
        { id: 'olyHostAsia', map: 'world', lvl: 2, ask: 'Name an <b>Asian</b> country that has hosted the Olympics', all: ['Japan', 'South Korea', 'China', 'Russia'], common: ['Japan', 'South Korea', 'China'] }
    ];
    // "Name a state/country that starts with ..." (common = the well-known ones)
    // which answers to "starts with / ends with" questions count as RARE (double distance)
    const RARE_STATES = ['Delaware', 'Rhode Island', 'New Hampshire', 'Vermont', 'Connecticut', 'West Virginia', 'Wyoming', 'North Dakota', 'South Dakota', 'Nebraska',
        'Iowa', 'Kansas', 'Arkansas', 'Mississippi', 'Maryland', 'Indiana', 'Missouri', 'Alabama', 'Kentucky', 'Idaho', 'Montana', 'Oklahoma', 'Wisconsin'];
    const isRarePlace = (n, isUS) => isUS ? RARE_STATES.includes(n) : !(EASY_COUNTRIES.includes(n) || MEDIUM_COUNTRIES.includes(n));
    const US_LETTERS = ['A', 'C', 'D', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'U', 'V', 'W'];
    const WORLD_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVZ'.split('');
    // "Name a state/country that ends in ..."
    const US_ENDS = ['a', 'o', 's', 'e', 'n', 'i', 't', 'y'];
    const WORLD_ENDS = ['ia', 'land', 'an', 'ay', 'ea', 'ar', 'o', 'y'];

    // A capital that is basically the same word as its country makes no question (Kuwait City, Singapore...)
    function capIsGiveaway(country, cap) {
        const a = A.norm(country), b = A.norm(cap);
        return b.includes(a) || a.includes(b.split(' ')[0]);
    }

    // The deck: easy first, harder later. Enough questions for misses.
    function buildDeck(seedStr, set = 'mixed', avoid = null) {
        const r = rng(hashStr(seedStr));
        // the 50 states (D.C. and Puerto Rico aren't states, so they don't count as answers)
        const allStates = A.STATES.filter(s => GEO.stateBy[s] && A.US_CAPITALS[s]);
        // every country counts as an answer, even tiny ones with no outline on the map (Monaco, Vatican City)
        const everyCountry = A.COUNTRIES.slice();
        const hardStates = allStates.filter(s => !EASY_STATES.includes(s));
        const allCountries = A.COUNTRIES.filter(c => GEO.worldBy[c]);
        const stateCapStates = Object.keys(A.US_CAPITALS);
        const capCountries = allCountries.filter(c => A.WORLD_CAPITALS[c] && !capIsGiveaway(c, A.WORLD_CAPITALS[c]));

        const mk = {
            state: n => ({ type: 'state', target: n, answer: n, pool: 'states', map: 'us', prompt: 'Name this <b>state</b>', tag: 'USA · STATE' }),
            country: n => ({ type: 'country', target: n, answer: n, pool: 'countries', map: 'world', prompt: 'Name this <b>country</b>', tag: 'WORLD · COUNTRY' }),
            stateCap: n => ({ type: 'stateCap', target: n, answer: A.US_CAPITALS[n], pool: 'stateCapitals', map: 'us', prompt: `What is the capital of <b>${esc(n)}</b>?`, tag: 'USA · CAPITAL' }),
            countryCap: n => ({ type: 'countryCap', target: n, answer: A.WORLD_CAPITALS[n], pool: 'countryCapitals', map: 'world', prompt: `What is the capital of <b>${esc(n)}</b>?`, tag: 'WORLD · CAPITAL' }),
            capState: n => ({ type: 'capState', target: null, clue: true, answer: n, pool: 'states', map: 'us', prompt: `<b>${esc(A.US_CAPITALS[n])}</b> is the capital of which state?`, tag: 'USA · CAPITAL' }),
            capCountry: n => ({ type: 'capCountry', target: null, clue: true, answer: n, pool: 'countries', map: 'world', prompt: `<b>${esc(A.WORLD_CAPITALS[n])}</b> is the capital of which country?`, tag: 'WORLD · CAPITAL' })
        };
        Object.keys(CLUE_INFO).forEach(type => {
            const inf = CLUE_INFO[type];
            mk[type] = ([clue, ans, , alt]) => {
                // a few clues have more than one right answer (churros: Spain or Mexico)
                if (alt && alt.length) { const all = [ans].concat(alt); return Object.assign(mkMulti(type, { map: inf.map, ask: inf.ask(clue), all, common: all }), { tag: inf.tag }); }
                return { type, target: null, clue: true, answer: ans, pool: inf.pool, map: inf.map, prompt: inf.ask(clue), tag: inf.tag };
            };
        });
        // multi-answer: item = {id, map, ask, all, common}
        const mkMulti = (type, m) => ({ type, target: null, clue: true, multi: true, answers: m.all, rare: m.all.filter(a => !m.common.includes(a)),
            answer: m.common[0] || m.all[0], examples: (m.common.length ? m.common : m.all).slice(0, 2), pool: m.map === 'us' ? 'states' : 'countries', map: m.map, prompt: m.ask,
            tag: (m.map === 'us' ? 'USA' : 'WORLD') + ' · MANY ANSWERS' });
        mk.usMulti = m => mkMulti('usMulti', m);
        mk.wMulti = m => mkMulti('wMulti', m);
        const letterQ = (type, L) => {
            const isUS = type === 'usLetter';
            const all = (isUS ? allStates : everyCountry).filter(n => A.norm(n).startsWith(L.toLowerCase()));
            const common = all.length <= 2 ? all : all.filter(n => !isRarePlace(n, isUS));
            return mkMulti(type, { id: type + L, map: isUS ? 'us' : 'world', ask: `Name a ${isUS ? 'state' : 'country'} that starts with <b>${L}</b>`, all, common });
        };
        mk.usLetter = L => letterQ('usLetter', L);
        mk.wLetter = L => letterQ('wLetter', L);
        const endQ = (type, end) => {
            const isUS = type === 'usEnd';
            const all = (isUS ? allStates : everyCountry).filter(n => A.norm(n).replace(/ /g, '').endsWith(end));
            const common = all.length <= 2 ? all : all.filter(n => !isRarePlace(n, isUS));
            return mkMulti(type, { id: type + end, map: isUS ? 'us' : 'world', ask: `Name a ${isUS ? 'state' : 'country'} that ends in <b>-${end}</b>`, all, common });
        };
        mk.usEnd = e => endQ('usEnd', e);
        mk.wEnd = e => endQ('wEnd', e);
        // ---- extra banks (space-race-extra.js): Elimination-mode questions + city questions ----
        const X = window.SR_EXTRA || { elim: [], usBig: {}, usBigEasy: [], wBig: {}, wBigEasy: [], cityTop: [], cityClue: [] };
        const SIDE = m => m === 'us' ? 'USA' : 'WORLD';
        // Elimination questions: every place on the original answer list counts
        const elimItems = X.elim.map(([map, prompt, answers, lvl, cat]) => ({ id: 'E:' + prompt, map, prompt, answers, lvl, cat }));
        const mkElim = (type, e) => {
            const isUS = e.map === 'us';
            const common = e.answers.filter(n => !isRarePlace(n, isUS));
            const qq = mkMulti(type, { id: e.id, map: e.map, ask: esc(e.prompt), all: e.answers, common: common.length ? common : e.answers });
            qq.tag = SIDE(e.map) + ' · ' + String(e.cat || 'Trivia').toUpperCase();
            return qq;
        };
        mk.elimUS = e => mkElim('elimUS', e);
        mk.elimW = e => mkElim('elimW', e);
        // city questions: the answer is a city; the map lights up the state or country it's in
        const placeOk = (map, place) => !!(map === 'us' ? GEO.stateBy : GEO.worldBy)[place];
        const mkCity = (type, map, region, prompt, answers, tag) => {
            const multi = answers.length > 1;
            return { type, city: true, multi, answers: multi ? answers : undefined, rare: multi ? [] : undefined, examples: answers.slice(0, 2),
                answer: answers[0], target: placeOk(map, region) ? region : null, clue: !placeOk(map, region), region,
                pool: 'cities', map, prompt, tag: SIDE(map) + ' · ' + (tag || 'CITIES') };
        };
        mk.cityBigUS = st => mkCity('cityBigUS', 'us', st, `What is the <b>biggest city</b> in <b>${esc(st)}</b>?`, [X.usBig[st]]);
        mk.cityBigW = c => mkCity('cityBigW', 'world', c, `What is the <b>biggest city</b> in <b>${esc(c)}</b>?`, [X.wBig[c]]);
        const cityTops = X.cityTop.map(([map, region, prompt, answers, lvl]) => ({ id: 'T:' + prompt, map, region, prompt, answers, lvl }));
        const cityClues = X.cityClue.map(([map, region, prompt, answers, lvl, tag]) => ({ id: 'C:' + prompt, map, region, prompt, answers, lvl, tag }));
        mk.cityTopUS = t => mkCity('cityTopUS', t.map, t.region, t.prompt, t.answers);
        mk.cityTopW = t => mkCity('cityTopW', t.map, t.region, t.prompt, t.answers);
        mk.cityClueUS = c => mkCity('cityClueUS', c.map, c.region, c.prompt, c.answers, c.tag === 'LANDMARK' || c.tag === 'NICKNAME' ? 'CITIES' : c.tag);
        mk.cityClueW = c => mkCity('cityClueW', c.map, c.region, c.prompt, c.answers, c.tag === 'LANDMARK' || c.tag === 'NICKNAME' ? 'CITIES' : c.tag);
        const byLvl = (list, map, lvl) => list.filter(x => x.map === map && x.lvl <= lvl);
        const usBigStates = lvl => Object.keys(X.usBig).filter(st => lvl > 1 || X.usBigEasy.includes(st));
        const wBigCountries = lvl => Object.keys(X.wBig).filter(c => lvl > 1 || X.wBigEasy.includes(c));
        const extras = lvl => [['elimUS', byLvl(elimItems, 'us', lvl)], ['elimUS', byLvl(elimItems, 'us', lvl)], ['elimW', byLvl(elimItems, 'world', lvl)], ['elimW', byLvl(elimItems, 'world', lvl)],
            ['cityBigUS', usBigStates(lvl)], ['cityBigW', wBigCountries(lvl)], ['cityTopUS', byLvl(cityTops, 'us', lvl)], ['cityTopW', byLvl(cityTops, 'world', lvl)],
            ['cityClueUS', byLvl(cityClues, 'us', lvl)], ['cityClueW', byLvl(cityClues, 'world', lvl)], ['cityClueW', byLvl(cityClues, 'world', lvl)]];
        const TYPE_MAP = { state: 'us', country: 'world', stateCap: 'us', countryCap: 'world', capState: 'us', capCountry: 'world', usMulti: 'us', wMulti: 'world', usLetter: 'us', wLetter: 'world', usEnd: 'us', wEnd: 'world',
            elimUS: 'us', elimW: 'world', cityBigUS: 'us', cityBigW: 'world', cityTopUS: 'us', cityTopW: 'world', cityClueUS: 'us', cityClueW: 'world' };
        Object.keys(CLUE_INFO).forEach(t => { TYPE_MAP[t] = CLUE_INFO[t].map; });
        const mapOf = type => TYPE_MAP[type];
        const keyOf = (type, item) => /^city/.test(type) ? 'CITY:' + (typeof item === 'string' ? (type === 'cityBigUS' ? X.usBig[item] : X.wBig[item]) : item.answers[0]) : item && item.id ? 'M:' + item.id : typeof item === 'string' && /Letter|End/.test(type) ? 'L:' + type + item : (mapOf(type) === 'us' ? 'US:' : 'W:') + (Array.isArray(item) ? item[1] : item);
        // skip clues that give the answer away ("the Kentucky Derby" -> Kentucky)
        const clues = (lvl, types) => types.map(t => [t, clueList(t, lvl).filter(([c, ans]) => (CLUE_INFO[t].map === 'us' ? A.STATES : A.COUNTRIES).includes(ans) && !A.norm(c).includes(A.norm(ans)))]);
        const multis = (map, lvl) => MULTI.filter(m => m.map === map && m.lvl <= lvl);
        const US_CLUES = ['usNick', 'usCity', 'usLandmark', 'usFood', 'usTeam', 'usCompany', 'usPeople', 'usWW2'], W_CLUES = ['wLandmark', 'wCity', 'wFood', 'wClub', 'wAnimal', 'wCompany', 'wPeople', 'wWW2', 'wOly'];
        const knownCountries = EASY_COUNTRIES.concat(MEDIUM_COUNTRIES);
        // weights: map questions x2, many-answer questions x2, everything else x1
        const tiers = [
            { count: 5, pick: [['state', EASY_STATES], ['state', EASY_STATES], ['country', EASY_COUNTRIES], ['country', EASY_COUNTRIES], ['stateCap', EASY_STATE_CAPS], ['countryCap', EASY_COUNTRY_CAPS], ['capCountry', capCountries.filter(c => EASY_COUNTRIES.includes(c))],
                ['usMulti', multis('us', 1)], ['wMulti', multis('world', 1)], ['wMulti', multis('world', 1)], ['usLetter', US_LETTERS], ['wLetter', WORLD_LETTERS]]
                .concat(clues(1, US_CLUES), clues(1, W_CLUES), extras(1)) },
            { count: 8, pick: [['state', allStates], ['state', allStates], ['country', knownCountries], ['country', MEDIUM_COUNTRIES], ['stateCap', stateCapStates], ['countryCap', capCountries.filter(c => knownCountries.includes(c))], ['capState', stateCapStates], ['capCountry', capCountries.filter(c => knownCountries.includes(c))],
                ['usMulti', multis('us', 2)], ['usMulti', multis('us', 2)], ['wMulti', multis('world', 2)], ['wMulti', multis('world', 2)], ['usLetter', US_LETTERS], ['wLetter', WORLD_LETTERS], ['usEnd', US_ENDS], ['wEnd', WORLD_ENDS]]
                .concat(clues(2, US_CLUES), clues(2, W_CLUES), extras(2)) },
            { count: 27, pick: [['state', hardStates], ['state', allStates], ['country', MEDIUM_COUNTRIES], ['country', knownCountries], ['stateCap', stateCapStates], ['countryCap', capCountries.filter(c => knownCountries.includes(c))], ['capState', stateCapStates], ['capCountry', capCountries],
                ['usMulti', multis('us', 3)], ['usMulti', multis('us', 3)], ['wMulti', multis('world', 3)], ['wMulti', multis('world', 3)], ['usLetter', US_LETTERS], ['wLetter', WORLD_LETTERS], ['usEnd', US_ENDS], ['wEnd', WORLD_ENDS]]
                .concat(clues(3, US_CLUES), clues(2, W_CLUES), extras(3)) }
        ];
        // USA-only or World-only rooms keep just those question types
        if (set === 'usa' || set === 'world') tiers.forEach(tr => { tr.pick = tr.pick.filter(([type]) => mapOf(type) === (set === 'usa' ? 'us' : 'world')); });
        tiers.forEach(tr => { tr.pick = tr.pick.filter(([, list]) => list.length); });
        tiers[2].count += Math.max(0, TARGET - DAILY_TARGET) * 2;
        const used = new Set(), deck = [];
        let lastType = '';
        const qidOf = (type, item) => type + ':' + (item.id || (Array.isArray(item) ? item[0] : item));
        if (avoid) {
            // practice races: pick only questions you haven't seen lately. Each question type is chosen with a
            // weight that grows with how many fresh questions it still has, so small groups don't repeat.
            // If a tier runs dry, it borrows from the harder tiers.
            const freshPick = picks => picks.map(([type, list]) => [type, list.filter(it => it && !avoid.has(qidOf(type, it)))]).filter(([, l]) => l.length);
            const pools = tiers.map(tr => freshPick(tr.pick));
            tiers.forEach((tier, ti) => {
                for (let i = 0; i < tier.count; i++) {
                    let done = false;
                    for (let ring = ti; ring < tiers.length + 1 && !done; ring++) {
                        const opts = (ring < tiers.length ? pools[ring] : tiers[2].pick.map(([t, l]) => [t, l.slice()])).filter(([, l]) => l.length);
                        for (let tries = 0; tries < 40 && opts.length && !done; tries++) {
                            const wts = opts.map(([t, l]) => Math.sqrt(l.length) * (t === lastType ? 0.15 : 1));
                            let x = r() * wts.reduce((a, b) => a + b, 0), k = 0;
                            while (x > wts[k] && k < wts.length - 1) { x -= wts[k]; k++; }
                            const [type, list] = opts[k];
                            const idx = Math.floor(r() * list.length), item = list[idx];
                            list.splice(idx, 1);
                            const key = keyOf(type, item);
                            if (used.has(key)) continue;
                            used.add(key); const qq = mk[type](item); qq.qid = qidOf(type, item); deck.push(qq); lastType = type; done = true;
                        }
                    }
                }
            });
            return deck;
        }
        for (const tier of tiers) {
            for (let i = 0; i < tier.count; i++) {
                for (let tries = 0; tries < 60; tries++) {
                    const [type, list] = tier.pick[Math.floor(r() * tier.pick.length)];
                    if (type === lastType && tries < 40) continue;
                    const item = list[Math.floor(r() * list.length)];
                    if (!item) continue;
                    const key = keyOf(type, item);
                    if (used.has(key)) continue;
                    // practice races skip questions you saw recently (while there are fresh ones to pick)
                    const qid = type + ':' + (item.id || (Array.isArray(item) ? item[0] : item));
                    if (avoid && avoid.has(qid) && tries < 50) continue;
                    used.add(key); const qq = mk[type](item); qq.qid = qid; deck.push(qq); lastType = type;
                    break;
                }
            }
        }
        return deck;
    }

    // ---------- racers ----------
    // computer racers get everyday player names (plus a few default "Racer-XXXX" ones, like players who skip the name box)
    const BOT_NAMES = ['Jake M', 'sophia_r', 'Mateo', 'Liam K', 'emma22', 'NoahP', 'ava.b', 'Ethan', 'maya_k', 'Lucas T', 'chloe', 'Dylan R',
        'Olivia', 'ben_w', 'Aiden', 'zoe.m', 'Carter', 'Lily G', 'owen_14', 'Grace', 'Jackson', 'mia_s', 'Eli', 'harper.j', 'Leo', 'nora',
        'Caleb B', 'Ruby', 'sam_t', 'Isaac', 'Ella', 'Max', 'jordan_c', 'Avery', 'Theo', 'priya', 'Diego', 'Hannah', 'kai', 'Marcus'];
    function botNames(r) {
        const list = shuffle(BOT_NAMES, r);
        // sometimes one lane uses a default-style name
        if (r() < 0.5) list[Math.floor(r() * 4)] = 'Racer-' + Math.floor(r() * 65536).toString(16).toUpperCase().padStart(4, '0');
        return list;
    }
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
        let t = 1200 + r() * 600, dist = 0, streak = 0;
        while (splits.length < TARGET) {
            const think = clamp(skill.mean * Math.exp(gauss(r) * 0.33), 1.8, skill.mean * 3) * 1000;
            t += think;
            if (r() < skill.acc) {
                streak++;
                // same rules as you: rare answers fly 2 (sometimes), a 3+ streak adds ½
                dist += (r() < skill.acc * 0.12 ? 2 : 1) + (streak >= 3 ? 0.5 : 0);
                while (splits.length < Math.min(TARGET, Math.floor(dist + 1e-9))) splits.push(Math.round(t));
            } else { streak = 0; misses.push(Math.round(t)); t += STALL_MS + REVEAL_MS * 0.4; }
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
    // ---------- questions you've seen lately (so practice races feel fresh) ----------
    const SEEN_KEY = 'sr_seen_q', SEEN_MAX = 2500;
    function loadSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; } }
    function rememberSeen() {
        const shown = deck.slice(0, qIndex).map(x => x.qid).filter(Boolean);
        if (!shown.length) return;
        const list = loadSeen().filter(id => !shown.includes(id)).concat(shown).slice(-SEEN_MAX);
        try { localStorage.setItem(SEEN_KEY, JSON.stringify(list)); } catch (e) {}
    }

    // ---------- your personal stats (this device) ----------
    const STATS_KEY = 'sr_stats';
    function loadStats() { try { return Object.assign({ races: 0, wins: 0, podiums: 0, best: null, bestStreak: 0, rare: 0, answers: 0 }, JSON.parse(localStorage.getItem(STATS_KEY) || '{}')); } catch (e) { return { races: 0, wins: 0, podiums: 0, best: null, bestStreak: 0, rare: 0, answers: 0 }; } }
    function saveStats(st) { try { localStorage.setItem(STATS_KEY, JSON.stringify(st)); } catch (e) {} }
    function renderStats() {
        const st = loadStats(), el = $('sr-mystats');
        if (!el) return;
        if (!st.races) { el.innerHTML = '<span class="sr-ms-empty">Finish a race to start your stats</span>'; return; }
        el.innerHTML = `<div><b>${st.best ? fmtTime(st.best) : '—'}</b><span>Fastest</span></div><div><b>${st.wins}</b><span>Wins</span></div>`
            + `<div><b>${st.races}</b><span>Races</span></div><div><b>${st.bestStreak}</b><span>Best streak</span></div><div><b>${st.rare}</b><span>💎 Rare</span></div>`;
    }
    // returns true when this race is a new fastest time
    function recordStats(place) {
        const st = loadStats();
        st.races++; if (place === 1) st.wins++; if (place <= 3) st.podiums++;
        st.bestStreak = Math.max(st.bestStreak, bestStreak);
        st.rare += answerLog.filter(e => e.rare).length; st.answers += rightN;
        let pb = false;
        if (TARGET === DAILY_TARGET && isFinite(me.finish) && (!st.best || me.finish < st.best)) { pb = !!st.best; st.best = Math.round(me.finish); }
        saveStats(st); renderStats();
        return pb;
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
    let raceStart = 0, stalledUntil = 0, streak = 0, bestStreak = 0, attempts = 0, rightN = 0, landedBeforeMe = 0, answerLog = [];
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
        const bNames = botNames(r);
        const field = [{ name, kind: 'you', color: COLORS[0], ...SRGarage.equipped() }];
        ghosts.forEach(g => field.push({ name: g.name, kind: 'ghost', color: GHOST_COLOR, splits: g.splits, misses: g.misses || [], finish: g.finish_ms }));
        let bi = 0;
        // bots fill the empty lanes; skills spread from ACE to ROOKIE
        const skillOrder = shuffle(BOT_SKILLS, r);
        while (field.length < LANES) {
            const skill = skillOrder[bi % skillOrder.length];
            const run = botRun(DAY + raceSeed + bNames[bi], skill);
            field.push({ name: bNames[bi], kind: 'bot', skill: skill.label, color: COLORS[(field.length) % COLORS.length], ...SRGarage.botLook(r), ...run });
            bi++;
        }
        lineupData = field;
        box.innerHTML = field.map((f, i) => `<div class="sr-lane-chip" style="animation-delay:${i * 70}ms">
            <span class="dot" style="background:${f.color};color:${f.color}"></span>
            <span class="nm">${esc(f.name)}</span>
            <span class="tag ${f.kind === 'you' ? 'tag-you' : f.kind === 'ghost' ? 'tag-ghost' : 'tag-racer'}">${f.kind === 'you' ? 'YOU' : f.kind === 'ghost' ? '👻 GHOST · ' + fmtTime(f.finish) : '🚀 RACER'}</span>
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
            deck = buildDeck(raceSeed, 'mixed', isOfficial ? null : new Set(loadSeen()));
            field = lineupData;
        }
        qIndex = 0; streak = 0; bestStreak = 0; attempts = 0; rightN = 0; landedBeforeMe = 0; answerLog = []; stalledUntil = 0;
        FX.finaleStart = 0; FX.landedDust = false; FX.flagAt = 0; FX.confetti = [];
        racers = field.map((f, i) => ({
            ...f, lane: i, p: 0, dp: 0, knock: 0, count: 0, finished: false, place: 0,
            splits: f.kind === 'you' || f.kind === 'friend' ? [] : (f.kind === 'bot' && !isOfficial ? botRun(raceSeed + f.name, BOT_SKILLS.find(s => s.label === f.skill)).splits : f.splits),
            misses: f.kind === 'you' || f.kind === 'friend' ? [] : (f.kind === 'bot' && !isOfficial ? botRun(raceSeed + f.name, BOT_SKILLS.find(s => s.label === f.skill)).misses : f.misses),
            missIdx: 0, landedAt: null, wobble: Math.random() * 6, left: false
        }));
        // rocket looks: yours is whatever you have equipped right now
        racers.forEach(rc => {
            if (rc.kind === 'you') Object.assign(rc, SRGarage.equipped());
            if (rc.kind === 'ghost') return;
            rc.skinObj = SRGarage.skin(rc.skin || 'classic'); rc.trailObj = SRGarage.trail(rc.trail || 'fire'); rc.trailId = rc.trailObj.id;
        });
        SRGarage.raceStarting(); renderBoostBtn();
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
        $('sr-prompt').innerHTML = raceMode === 'room' ? `Room <b>${esc(Room.code || '')}</b> race. Get ready…` : isOfficial ? "Today's official race. Get ready…" : 'Practice race. Get ready…';
        $('sr-count').textContent = `0 / ${TARGET}`; $('sr-streak').textContent = '0'; $('sr-clock').textContent = '0:00.0';
        setMapView(null);
        countdown();
    }

    function countdown() {
        state = 'countdown';
        const steps = ['3', '2', '1'];
        // online races: the engines start up first (a rumble that keeps building), then 3-2-1
        const pre = raceMode === 'room' ? 1600 : 0;
        if (pre) {
            SFX.rumble((pre + 400 + steps.length * 900) / 1000);
            callout('ENGINES ON', 'small');
            const shaker = setInterval(() => { if (state !== 'countdown') return clearInterval(shaker); FX.shake = Math.max(FX.shake, 2.5); }, 120);
        }
        steps.forEach((s, i) => setTimeout(() => { callout(s); SFX.beep(); FX.shake = 4 + i * 2; }, pre + 400 + i * 900));
        setTimeout(() => {
            callout('LIFTOFF!', 'small gold'); SFX.go(); FX.shake = 14; FX.liftoff = now();
            state = 'racing'; raceStart = now();
            racers.forEach(rc => burst(rc, 'smoke', 26));
            nextQuestion(true);
        }, pre + 400 + steps.length * 900);
    }

    function raceTime() { return state === 'countdown' || state === 'lobby' ? 0 : now() - raceStart; }

    let qShownAt = 0;
    function nextQuestion(first) {
        qShownAt = now();
        q = deck[qIndex++] || deck[(qIndex++) % deck.length];
        $('sr-prompt').innerHTML = q.prompt;
        $('sr-prompt').classList.remove('pop'); void $('sr-prompt').offsetWidth; $('sr-prompt').classList.add('pop');
        $('sr-map-tag').textContent = q.tag;
        $('sr-feedback').classList.remove('show');
        setMapView(q);
        const inp = $('sr-input');
        inp.value = ''; inp.disabled = false; inp.className = '';
        $('sr-go-btn').disabled = false; $('sr-skip-btn').disabled = false; $('sr-boost-btn').disabled = false;
        inp.focus({ preventScroll: true });
        renderSuggest();
    }

    // ---------- typing ----------
    function renderSuggest() {
        const inp = $('sr-input');
        const typedSkip = SKIP_WORDS.includes(A.norm(inp.value));
        // suggestions help with spelling but don't list answers: they start after 3 letters and show at most 3
        suggestions = q && state === 'racing' && !typedSkip && A.norm(inp.value).replace(/ /g, '').length >= 3 ? A.suggest(inp.value, q.pool, 3) : [];
        hiIdx = 0;
        const exact = q ? A.match(inp.value, q.pool) : null;
        if (exact) { suggestions = [exact].concat(suggestions.filter(s => s !== exact)).slice(0, 3); }
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
        if (!chosen && A.norm(inp.value) === 'boost') return useBoost();
        let pick = chosen || A.match(inp.value, q.pool) || (suggestions.length && A.norm(inp.value).length >= 3 ? suggestions[hiIdx] : null);
        if (!pick) {
            inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
            return;
        }
        attempts++;
        if (q.multi ? q.answers.includes(pick) : pick === q.answer) onCorrect(pick); else onWrong(pick);
    }
    function skip() {
        if (state !== 'racing' || !q || now() < stalledUntil) return;
        attempts++;
        onWrong(null);
    }

    // ⚡ BOOST (bought in the shop): skip this question with no penalty and count it as 1 right answer
    const boostAllowed = () => raceMode !== 'daily';      // not in the official daily race (leaderboard stays fair)
    function renderBoostBtn() {
        const b = $('sr-boost-btn'); if (!b) return;
        const left = Math.min(SRGarage.boosts, SRGarage.BOOSTS_PER_RACE - SRGarage.usedThisRace);
        $('sr-boost-n').textContent = boostAllowed() ? left : '–';
        b.classList.toggle('hidden', !boostAllowed() && SRGarage.boosts === 0);
        b.classList.toggle('none', !boostAllowed() || left <= 0);
        b.title = !boostAllowed() ? 'Boosts are off in the official daily race' : SRGarage.boosts === 0 ? 'No boosts. Buy them in the 🛒 Shop' : left <= 0 ? `Max ${SRGarage.BOOSTS_PER_RACE} boosts per race` : 'Boost: skip with no penalty and get 1 correct (press Enter with an empty box)';
    }
    function useBoost() {
        if (state !== 'racing' || !q || now() < stalledUntil) return;
        if (!boostAllowed()) { feedback('⚡ Boosts are off in the official daily race', 'bad'); return; }
        if (!SRGarage.canBoost()) { feedback(SRGarage.boosts ? `⚡ Max ${SRGarage.BOOSTS_PER_RACE} boosts per race` : '⚡ No boosts left. Get more in the 🛒 Shop', 'bad'); return; }
        SRGarage.useBoost(); renderBoostBtn();
        const t = raceTime();
        attempts++; rightN++;
        me.count = Math.min(TARGET, me.count + 1); me.p = me.count / TARGET;
        while (me.splits.length < Math.floor(me.count + 1e-9)) me.splits.push(Math.round(t));
        Room.send('prog', { n: me.count });
        answerLog.push({ q, pick: null, ok: true, boost: true, gain: 1 });
        $('sr-input').className = 'good';
        const ans = q.multi ? q.examples[0] : q.answer;
        feedback(`⚡ BOOST! +1  (${ans})`, 'good');
        callout('⚡ BOOST!', 'small gold'); SFX.boost();
        me.boostUntil = now() + 1800; burst(me, 'thrust', 60); FX.flashGood = 1;
        $('sr-count').textContent = `${fmtDist(me.count)} / ${TARGET}`;
        if (me.count >= TARGET) return finishRace();
        setTimeout(() => { if (state === 'racing') nextQuestion(); }, 380);
        lockInput(380);
    }

    function onCorrect(pick) {
        const t = raceTime();
        streak++; bestStreak = Math.max(bestStreak, streak); rightN++;
        // distance: 1 per right answer, RARE answers to many-answer questions fly 2, and a 3+ streak adds ½
        const rare = !!(q.multi && q.rare.includes(pick));
        const boosted = streak >= 3;
        const gain = (rare ? 2 : 1) + (boosted ? 0.5 : 0);
        me.count = Math.min(TARGET, me.count + gain); me.p = me.count / TARGET;
        while (me.splits.length < Math.floor(me.count + 1e-9)) me.splits.push(Math.round(t));   // time each whole step was reached (ghost replays)
        Room.send('prog', { n: me.count });
        answerLog.push({ q, pick, ok: true, rare, boosted, gain });
        $('sr-input').className = 'good';
        feedback(`✓ ${pick}` + (rare ? '  💎 RARE ×2' : '') + (boosted ? '  🔥 +½' : ''), rare ? 'good rare' : 'good');
        if (rare) { callout('💎 RARE! ×2', 'small gold'); SFX.rare(); }
        SFX.correct(streak);
        burst(me, 'thrust', 40);
        FX.flashGood = 1;
        if (streak >= 3) { me.boostUntil = now() + 1600; if (streak === 3 || streak % 5 === 0) { callout(streak >= 5 ? `${streak} STREAK!` : 'BOOST!', 'small gold'); SFX.boost(); } }
        $('sr-count').textContent = `${fmtDist(me.count)} / ${TARGET}`;
        $('sr-streak').textContent = streak; $('sr-streak').classList.toggle('hot', streak >= 3);
        if (me.count >= TARGET) return finishRace();
        setTimeout(() => { if (state === 'racing') nextQuestion(); }, 380);
        lockInput(380);
    }
    function onWrong(pick) {
        me.misses.push(Math.round(raceTime()));
        Room.send('miss', {});
        answerLog.push({ q, pick, ok: false });
        streak = 0; $('sr-streak').textContent = '0'; $('sr-streak').classList.remove('hot');
        $('sr-input').className = 'bad';
        const right = q.multi ? `e.g. ${q.examples.join(' or ')}` : `It was ${q.answer}`;
        feedback(pick ? `✗ ${right}` : `⏭ ${right}`, 'bad');
        SFX.wrong();
        asteroidHit(me);
        stalledUntil = now() + STALL_MS;
        lockInput(STALL_MS);
        revealOnMap();
        setTimeout(() => { if (state === 'racing') nextQuestion(); }, STALL_MS);
    }
    function lockInput(ms) {
        $('sr-input').disabled = true; $('sr-go-btn').disabled = true; $('sr-skip-btn').disabled = true; $('sr-boost-btn').disabled = true;
        $('sr-suggest').innerHTML = '';
        setTimeout(() => { if (state === 'racing') { $('sr-input').disabled = false; $('sr-go-btn').disabled = false; $('sr-skip-btn').disabled = false; $('sr-boost-btn').disabled = false; $('sr-input').focus({ preventScroll: true }); } }, ms);
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
        $('sr-input').disabled = true; $('sr-go-btn').disabled = true; $('sr-skip-btn').disabled = true; $('sr-boost-btn').disabled = true;
        $('sr-suggest').innerHTML = '';
        $('sr-prompt').innerHTML = '🌕 <b>TOUCHDOWN!</b>';
        document.querySelector('.sr-hud').classList.add('fade');
        SFX.land(!racers.some(rc => rc !== me && rc.finished));
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
        rememberSeen();
        state = 'lobby'; showScreen('sr-lobby');
    }

    // ---------- answer review (results screen) ----------
    function renderReview() {
        const box = $('sr-review');
        if (!answerLog.length) { box.innerHTML = '<li class="sr-muted">No answers this race.</li>'; return; }
        box.innerHTML = answerLog.map((e, i) => {
            const q = e.q;
            const icon = e.boost ? '⚡' : e.ok ? (e.rare ? '💎' : '✅') : e.pick ? '❌' : '⏭️';
            const you = e.boost ? 'You used a <b>boost</b>' : e.pick ? `You: <b>${esc(e.pick)}</b>` : 'You skipped';
            const pts = e.ok ? `<span class="sr-rv-pts${e.rare ? ' rare' : ''}">+${fmtDist(e.gain)}${e.rare ? ' · RARE' : ''}${e.boosted ? ' · 🔥' : ''}</span>` : '<span class="sr-rv-pts miss">+0</span>';
            let more = '';
            if (q.multi) {
                const common = q.answers.filter(a => !q.rare.includes(a)), rare = q.rare;
                const chip = (a, r) => `<span class="sr-rv-ans${r ? ' rare' : ''}${a === e.pick ? ' you' : ''}">${r ? '💎 ' : ''}${esc(a)}</span>`;
                more = `<div class="sr-rv-all"><span class="sr-rv-lbl">All ${q.answers.length} right answers:</span> ${common.map(a => chip(a, false)).join('')}${rare.map(a => chip(a, true)).join('')}</div>`;
            } else if (!e.ok || e.boost) more = `<div class="sr-rv-all"><span class="sr-rv-lbl">Answer:</span> <span class="sr-rv-ans">${esc(q.answer)}</span></div>`;
            return `<li class="${e.ok ? 'ok' : 'bad'}"><div class="sr-rv-top"><span class="sr-rv-n">${i + 1}</span><span class="sr-rv-icon">${icon}</span>
                <div class="sr-rv-q"><div class="sr-rv-tag">${esc(q.tag)}</div><div class="sr-rv-prompt">${q.prompt}</div><div class="sr-rv-you">${you}</div></div>${pts}</div>${more}</li>`;
        }).join('');
    }

    // 💰 cash for every finished race (shop money), plus any challenge rockets/trails just unlocked
    function payout(place) {
        const humans = raceMode === 'room' ? racers.filter(rc => rc.kind === 'you' || rc.kind === 'friend').length : 1;
        const misses = answerLog.filter(e => !e.ok).length;
        const res = SRGarage.raceEnded({ place, dnf: !!me.dnf, humans, misses, official: isOfficial, day: DAY, finish: me.finish, target: TARGET });
        const un = SRGarage.newUnlocksSinceStart();
        const el = $('sr-res-cash');
        el.innerHTML = `<div class="sr-cash-earn">💰 +${SRGarage.money(res.base)}<span>${me.dnf ? 'last place' : ordinal(place) + ' place'}</span></div>`
            + (res.bonus ? `<div class="sr-cash-earn bonus">🎁 +${SRGarage.money(res.bonus)}<span>first race today</span></div>` : '')
            + `<div class="sr-cash-total">Wallet: <b>${SRGarage.money(res.cash)}</b></div>`
            + (un.length ? `<div class="sr-cash-unlock">${un.some(i => i.legend) ? '★ LEGENDARY' : '🏅'} UNLOCKED: ${un.map(i => `<b>${esc(i.name)}</b>`).join(', ')}! <a href="#" id="sr-res-hangar">Equip in the Hangar</a></div>` : '');
        el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
        const hl = $('sr-res-hangar'); if (hl) hl.onclick = ev => { ev.preventDefault(); SRGarage.open('hangar'); };
        if (un.length) setTimeout(() => { callout(un.some(i => i.legend) ? '★ LEGENDARY!' : '🏅 UNLOCKED!', 'small gold'); if (un.some(i => i.legend)) SFX.newBest(); else SFX.rare(); }, 1500);
        renderWallet();
    }
    const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
    function renderWallet() { const w = $('sr-wallet'); if (w) w.innerHTML = SRGarage.walletHtml(); }

    function renderStandings() {
        const order = racers.map(rc => ({ rc, t: rc.kind === 'you' ? me.finish : rc.finish })).sort((a, b) => a.t - b.t);
        $('sr-standings').innerHTML = order.map((o, i) => {
            const nm = o.rc === me ? (raceMode === 'room' ? me.name : storedName() || 'You') : o.rc.name;
            const icon = o.rc.kind === 'ghost' ? '👻' : o.rc.kind === 'friend' ? '🧑‍🚀' : '';
            const tm = isFinite(o.t) ? fmtTime(o.t) : (o.rc.dnf || (o.rc === me && me.dnf)) ? 'didn\'t finish' : o.rc.left ? 'left' : 'racing…';
            return `<li class="${o.rc === me ? 'me' : ''}"><span class="pl">${isFinite(o.t) || o.rc.dnf || (o.rc === me && me.dnf) ? i + 1 : '–'}</span><span class="nm">${esc(nm)} ${icon}</span><span class="tm">${tm}</span></li>`;
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
        $('sr-res-title').textContent = me.dnf ? 'LAST PLACE' : names[place - 1] || `${place}TH PLACE`;
        $('sr-res-time').textContent = me.dnf ? 'DNF' : fmtTime(me.finish);
        $('sr-res-acc').textContent = `${Math.round(rightN / Math.max(attempts, 1) * 100)}%`;
        $('sr-res-streak').textContent = bestStreak;
        renderStandings();
        renderReview();
        rememberSeen();
        const pb = recordStats(place);
        payout(place);
        $('sr-res-pb').classList.toggle('hidden', !pb);
        if (pb) { setTimeout(() => callout('⭐ PERSONAL BEST!', 'small gold'), 700); setTimeout(() => SFX.newBest(), Math.max(700, (SFX.until || 0) - performance.now() + 200)); }
        $('sr-review').classList.add('hidden'); $('sr-review-btn').textContent = `📋 Review your answers (${answerLog.length})`;
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
    // draw one outline; a jump across the date line (Russia, Fiji) starts a new piece instead of a line across the map
    function traceRing(path, ring, P) {
        let px = null;
        ring.forEach(([lon, lat], i) => {
            const [x, y] = P(lon, lat);
            if (!i || Math.abs(x - px) > 90) path.moveTo(x, y); else path.lineTo(x, y);
            px = x;
        });
    }
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
                traceRing(path, ri.r, P);
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
        // clue questions (capital, nickname, city, landmark, money): hide the answer, show the whole map dimmed
        if (question && question.clue) view.dim = true;
        void prev;
    }
    function revealOnMap() {
        if (!view || !q) return;
        // after a miss, light up the right place (for clue questions too)
        if (q.city) {
            // city questions: the state or country stays lit (fly to it if it wasn't shown)
            if (q.region && !q.target && (q.map === 'us' ? GEO.stateBy : GEO.worldBy)[q.region]) setMapView({ map: q.map, target: q.region });
            view.reveal = view.targetPath; view.revealAt = now();
            return;
        }
        if (q.multi) {
            // many-answer questions: light up every right answer on the whole map
            const by = q.map === 'us' ? GEO.stateBy : GEO.worldBy;
            const path = new Path2D();
            q.answers.forEach(n => { const f = by[n]; if (f) f.rings.forEach(ri => { traceRing(path, ri.r, view.P); path.closePath(); }); });
            view.reveal = path; view.revealAt = now();
            return;
        }
        const clueFeat = q.clue ? (q.map === 'us' ? GEO.stateBy : GEO.worldBy)[q.answer] : null;
        if (clueFeat) {
            // clue questions: fly the map to the answer (so Alaska, Hawaii and small countries are easy to see)
            setMapView({ map: q.map, target: q.answer });
            view.reveal = view.targetPath;
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
            if (kind === 'thrust') FX.particles.push({ x: x - 14, y, vx: -160 - Math.random() * 220, vy: (Math.random() - 0.5) * 70, life: 0, max: 0.35 + Math.random() * 0.35, size: 3 + Math.random() * 5, kind: 'fire', hue: rc.kind === 'ghost' ? 'ghost' : (rc.trailId || 'fire') });
            if (kind === 'spark') FX.particles.push({ x, y, vx: (Math.random() - 0.5) * 380, vy: (Math.random() - 0.5) * 380, life: 0, max: 0.4 + Math.random() * 0.5, size: 1.5 + Math.random() * 2.5, kind: 'spark' });
            if (kind === 'dust') FX.particles.push({ x: x + (Math.random() - 0.5) * 20, y: y + 8, vx: (Math.random() - 0.5) * 140, vy: -Math.random() * 90, life: 0, max: 0.8 + Math.random() * 0.8, size: 3 + Math.random() * 6, kind: 'dust' });
        }
    }
    function asteroidHit(rc) {
        const G = geometry(); const [x, y] = rocketPos(rc, G);
        FX.asteroids.push({ rc, sx: x + 140 + Math.random() * 60, sy: -30, tx: x + 6, ty: y, t0: now(), dur: 420, rot: Math.random() * 6, size: rc === me ? 13 : 8, hit: false });
    }

    // skins and trails come from space-race-garage.js (SRGarage.SKINS / TRAILS)
    const DEFAULT_SKIN = { shape: 'classic', body: ['#ffffff', '#cbd5e1', '#64748b'], accent: null, win: '#0ea5e9' };
    function bodyPath(c, shape, tail) {
        c.beginPath();
        if (shape === 'sleek') { c.moveTo(-15, -4.5); c.lineTo(6, -5.5); c.quadraticCurveTo(24, -3.5, 31, 0); c.quadraticCurveTo(24, 3.5, 6, 5.5); c.lineTo(-15, 4.5); }
        else if (shape === 'heavy') { c.moveTo(tail, -7.5); c.lineTo(6, -8.5); c.quadraticCurveTo(22, -8, 24, 0); c.quadraticCurveTo(22, 8, 6, 8.5); c.lineTo(tail, 7.5); }
        else if (shape === 'shuttle') { c.moveTo(-16, -5.5); c.lineTo(12, -5.5); c.quadraticCurveTo(23, -4.5, 25, 0); c.quadraticCurveTo(23, 4.5, 12, 5.5); c.lineTo(-16, 5.5); }
        else if (shape === 'saucer') { c.ellipse(4, 1.5, 21, 6, 0, 0, Math.PI * 2); }
        else { c.moveTo(-15, -6); c.lineTo(8, -6.5); c.quadraticCurveTo(22, -5, 26, 0); c.quadraticCurveTo(22, 5, 8, 6.5); c.lineTo(-15, 6); }
        c.closePath();
    }
    // ✨ animated SHOP rockets
    function shopFx(c, fx, layer, t, sk, shape, tail) {
        const T = t / 1000;
        if (fx === 'neon' && layer === 'front') {
            const h = (T * 90) % 360;
            [[3, 0.25], [1.1, 1]].forEach(([w, a]) => { c.strokeStyle = `hsla(${h},100%,65%,${a})`; c.lineWidth = w; c.shadowColor = `hsl(${h},100%,60%)`; c.shadowBlur = 14; bodyPath(c, shape, tail); c.stroke(); });
            c.strokeStyle = `hsla(${(h + 180) % 360},100%,70%,0.9)`; c.lineWidth = 0.8; c.shadowColor = c.strokeStyle;
            c.beginPath(); c.moveTo(-6, -5); c.lineTo(-20, -12); c.lineTo(-15, -5); c.moveTo(-6, 5); c.lineTo(-20, 12); c.lineTo(-15, 5); c.stroke();
        }
        if (fx === 'candy' && layer === 'front') {
            c.save(); bodyPath(c, shape, tail); c.clip();
            c.fillStyle = 'rgba(220,38,38,0.85)';
            const off = (T * 12) % 8;
            for (let k = -40; k < 40; k += 8) { c.beginPath(); c.moveTo(k + off, -10); c.lineTo(k + off + 4, -10); c.lineTo(k + off - 6, 10); c.lineTo(k + off - 10, 10); c.closePath(); c.fill(); }
            const sh = c.createLinearGradient(0, -7, 0, 7); sh.addColorStop(0, 'rgba(255,255,255,0.55)'); sh.addColorStop(0.4, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.2)');
            c.fillStyle = sh; c.fillRect(-20, -10, 50, 20); c.restore();
        }
        if (fx === 'frost') {
            if (layer === 'back') {
                const g = c.createRadialGradient(4, 0, 3, 4, 0, 30); g.addColorStop(0, 'rgba(186,230,253,0.35)'); g.addColorStop(1, 'rgba(186,230,253,0)');
                c.fillStyle = g; c.beginPath(); c.arc(4, 0, 30, 0, Math.PI * 2); c.fill();
                c.fillStyle = '#e0f2fe';
                for (let k = 0; k < 8; k++) { const a = T * 0.8 + k * 0.785, rr = 16 + 6 * Math.sin(T * 2 + k); c.globalAlpha = 0.5 + 0.5 * Math.sin(T * 3 + k); c.fillRect(4 + Math.cos(a) * rr * 1.4, Math.sin(a) * rr * 0.8, 1.1, 1.1); }
                c.globalAlpha = 1;
            } else {
                c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 0.45; c.shadowColor = '#7dd3fc'; c.shadowBlur = 6;
                [[-9, -1.5, 2.6], [2, 2.5, 2], [12, -1, 2.2]].forEach(([fx2, fy, r]) => { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + T * 0.5; c.beginPath(); c.moveTo(fx2 - Math.cos(a) * r, fy - Math.sin(a) * r); c.lineTo(fx2 + Math.cos(a) * r, fy + Math.sin(a) * r); c.stroke(); } });
            }
        }
        if (fx === 'magma') {
            const p = 0.6 + 0.4 * Math.sin(T * 4);
            if (layer === 'back') {
                const g = c.createRadialGradient(4, 0, 4, 4, 0, 30); g.addColorStop(0, `rgba(239,68,68,${0.3 * p})`); g.addColorStop(1, 'rgba(239,68,68,0)');
                c.fillStyle = g; c.beginPath(); c.arc(4, 0, 30, 0, Math.PI * 2); c.fill();
                for (let k = 0; k < 6; k++) { const life = ((T * 0.9 + k / 6) % 1); c.fillStyle = `rgba(251,146,60,${1 - life})`; c.beginPath(); c.arc(-10 + k * 6 - life * 14, -6 - life * 14 + (k % 2) * 3, 1.1 * (1 - life) + 0.3, 0, Math.PI * 2); c.fill(); }
            } else {
                c.save(); bodyPath(c, shape, tail); c.clip();
                c.strokeStyle = `rgba(251,146,60,${0.6 + 0.4 * p})`; c.lineWidth = 1; c.shadowColor = '#f97316'; c.shadowBlur = 8;
                [[[-16, -3], [-10, 0], [-6, -4], [0, -1], [5, -7]], [[-14, 5], [-7, 2], [-1, 5], [6, 1], [12, 4], [18, -1]], [[8, -8], [11, -3], [16, -5], [21, 0]]].forEach(pts => { c.beginPath(); pts.forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x, y)); c.stroke(); });
                c.restore();
            }
        }
        if (fx === 'holo' && layer === 'front') {
            c.save(); bodyPath(c, shape, tail); c.clip();
            c.fillStyle = 'rgba(165,243,252,0.35)'; const off = (T * 20) % 3;
            for (let yy = -10 + off; yy < 10; yy += 3) c.fillRect(-20, yy, 50, 0.7);
            c.restore();
            if ((t % 2300) < 170) {   // glitch!
                c.globalAlpha = 0.5; c.fillStyle = '#22d3ee'; c.save(); c.translate(-2.5, -1); bodyPath(c, shape, tail); c.fill(); c.restore();
                c.fillStyle = '#e879f9'; c.save(); c.translate(2.5, 1); bodyPath(c, shape, tail); c.fill(); c.restore(); c.globalAlpha = 1;
            }
            c.strokeStyle = 'rgba(103,232,249,0.9)'; c.lineWidth = 0.6; c.shadowColor = '#22d3ee'; c.shadowBlur = 10; bodyPath(c, shape, tail); c.stroke();
        }
        if (fx === 'dragon') {
            if (layer === 'back') {
                c.fillStyle = sk.accent;
                for (let k = 0; k < 6; k++) { const x = -12 + k * 5, h = 4 + Math.sin(T * 6 + k) * 0.8; c.beginPath(); c.moveTo(x - 2, -5.2); c.lineTo(x + 0.5, -5.2 - h); c.lineTo(x + 2.5, -5.2); c.fill(); }
                c.beginPath(); c.moveTo(20, -3); c.lineTo(17, -11); c.lineTo(15, -4); c.fill();
            } else {
                c.save(); bodyPath(c, shape, tail); c.clip();
                c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.5;
                for (let x = -16; x < 28; x += 3.2) for (let y = -6; y < 7; y += 2.6) { c.beginPath(); c.arc(x + ((Math.round(y / 2.6) % 2) ? 1.6 : 0), y, 1.6, 0, Math.PI); c.stroke(); }
                c.restore();
                const e = 0.6 + 0.4 * Math.sin(T * 5);   // glowing eye
                c.fillStyle = `rgba(250,204,21,${e})`; c.shadowColor = '#f59e0b'; c.shadowBlur = 10; c.beginPath(); c.ellipse(17, -1.5, 2, 1, 0, 0, Math.PI * 2); c.fill();
                c.fillStyle = '#000'; c.shadowBlur = 0; c.fillRect(16.8, -2.4, 0.5, 1.8);
            }
        }
        if (fx === 'ufo') {
            if (layer === 'back') {   // tractor beam
                const a = 0.18 + 0.12 * Math.sin(T * 6);
                const g = c.createLinearGradient(0, 5, 0, 30); g.addColorStop(0, `rgba(134,239,172,${a + 0.2})`); g.addColorStop(1, 'rgba(134,239,172,0)');
                c.fillStyle = g; c.beginPath(); c.moveTo(-3, 6); c.lineTo(11, 6); c.lineTo(18, 30); c.lineTo(-10, 30); c.closePath(); c.fill();
            } else {
                // glass dome
                const dg = c.createLinearGradient(0, -12, 0, 0); dg.addColorStop(0, 'rgba(224,242,254,0.95)'); dg.addColorStop(1, 'rgba(56,189,248,0.55)');
                c.fillStyle = dg; c.beginPath(); c.ellipse(4, -1.5, 9, 8, 0, Math.PI, Math.PI * 2); c.fill();
                c.fillStyle = '#4ade80'; c.beginPath(); c.arc(4, -4, 2.6, 0, Math.PI * 2); c.fill();   // the pilot
                c.fillStyle = '#000'; c.beginPath(); c.ellipse(3, -4.5, 0.7, 1, 0.3, 0, Math.PI * 2); c.ellipse(5, -4.5, 0.7, 1, -0.3, 0, Math.PI * 2); c.fill();
                // chasing rim lights
                for (let k = 0; k < 9; k++) {
                    const x = -13 + k * 4.25, on = Math.floor(T * 10) % 3 === k % 3;
                    c.fillStyle = on ? ['#fde047', '#f472b6', '#22d3ee'][k % 3] : 'rgba(255,255,255,0.35)';
                    c.shadowColor = c.fillStyle; c.shadowBlur = on ? 8 : 0; c.beginPath(); c.arc(x, 2.2, 1.2, 0, Math.PI * 2); c.fill();
                }
                c.shadowBlur = 0;
            }
        }
        if (fx === 'reactor') {
            if (layer === 'back') {
                for (let k = 0; k < 3; k++) { const life = (T * 0.8 + k / 3) % 1; c.strokeStyle = `rgba(167,243,208,${(1 - life) * 0.7})`; c.lineWidth = 1.4 * (1 - life) + 0.3; c.shadowColor = '#34d399'; c.shadowBlur = 8; c.beginPath(); c.ellipse(4, 0, 8 + life * 30, 5 + life * 18, 0, 0, Math.PI * 2); c.stroke(); }
                c.shadowBlur = 0;
            } else {
                const p = 0.65 + 0.35 * Math.sin(T * 7);
                const g = c.createRadialGradient(4, 0, 0.5, 4, 0, 7 * p + 3); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#6ee7b7'); g.addColorStop(1, 'rgba(16,185,129,0)');
                c.fillStyle = g; c.beginPath(); c.arc(4, 0, 10, 0, Math.PI * 2); c.fill();
                c.strokeStyle = `rgba(110,231,183,${p})`; c.lineWidth = 0.6; c.beginPath(); c.arc(4, 0, 4.2, T * 3, T * 3 + 4); c.stroke();
            }
        }
    }
    // ★ LEGENDARY effects, drawn behind the rocket (back) or on top of it (front)
    function legendFx(c, fx, layer, t, sk, shape, tail) {
        const T = t / 1000;
        if (fx === 'phoenix' && layer === 'back') {
            // two flapping wings of fire
            const flap = Math.sin(T * 7) * 0.35;
            [-1, 1].forEach(side => {
                c.save(); c.scale(1, side); c.rotate(-flap * 0.6);
                const g = c.createLinearGradient(0, -2, -18, -30);
                g.addColorStop(0, 'rgba(254,240,138,0.95)'); g.addColorStop(0.35, 'rgba(249,115,22,0.85)'); g.addColorStop(1, 'rgba(220,38,38,0)');
                c.fillStyle = g; c.shadowColor = '#f97316'; c.shadowBlur = 14;
                c.beginPath(); c.moveTo(8, -4);
                c.bezierCurveTo(4, -18 - flap * 10, -10, -30 - flap * 14, -26, -28 - flap * 16);
                c.bezierCurveTo(-18, -22, -20, -16, -30, -14 - flap * 6);
                c.bezierCurveTo(-20, -10, -16, -8, -12, -5); c.closePath(); c.fill();
                // feather lines
                c.strokeStyle = 'rgba(254,249,195,0.6)'; c.lineWidth = 0.6; c.shadowBlur = 0;
                for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(2 - k * 4, -5); c.quadraticCurveTo(-6 - k * 5, -16 - k * 2 - flap * 8, -14 - k * 4, -22 - flap * 12 + k * 2); c.stroke(); }
                c.restore();
            });
            // ember aura
            const a = c.createRadialGradient(4, 0, 2, 4, 0, 34);
            a.addColorStop(0, 'rgba(251,146,60,0.35)'); a.addColorStop(1, 'rgba(251,146,60,0)');
            c.fillStyle = a; c.beginPath(); c.arc(4, 0, 34, 0, Math.PI * 2); c.fill();
        }
        if (fx === 'nova' && layer === 'back') {
            // rotating star corona
            c.save(); c.translate(4, 0); c.rotate(T * 0.8);
            const pulse = 1 + 0.12 * Math.sin(T * 5);
            for (let k = 0; k < 14; k++) {
                c.rotate(Math.PI * 2 / 14);
                const len = (k % 2 ? 22 : 34) * pulse;
                const g = c.createLinearGradient(0, 0, len, 0);
                g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.4, 'rgba(253,224,71,0.6)'); g.addColorStop(1, 'rgba(249,115,22,0)');
                c.fillStyle = g; c.beginPath(); c.moveTo(4, -2.2); c.lineTo(len, 0); c.lineTo(4, 2.2); c.closePath(); c.fill();
            }
            c.restore();
            const core = c.createRadialGradient(4, 0, 2, 4, 0, 26 * (1 + 0.1 * Math.sin(T * 5)));
            core.addColorStop(0, 'rgba(255,255,255,0.9)'); core.addColorStop(0.35, 'rgba(253,224,71,0.45)'); core.addColorStop(1, 'rgba(253,224,71,0)');
            c.fillStyle = core; c.beginPath(); c.arc(4, 0, 30, 0, Math.PI * 2); c.fill();
        }
        if (fx === 'blackhole') {
            // accretion disk orbiting the rocket: back half behind, front half in front
            c.save(); c.translate(3, 0);
            const rot = T * 2.2;
            const drawRing = (from, to) => {
                for (let k = 0; k < 3; k++) {
                    const rx = 30 - k * 4, ry = 9 - k * 1.5;
                    c.strokeStyle = k === 0 ? 'rgba(251,146,60,0.85)' : k === 1 ? 'rgba(236,72,153,0.8)' : 'rgba(167,139,250,0.9)';
                    c.lineWidth = 2.2 - k * 0.5; c.shadowColor = c.strokeStyle; c.shadowBlur = 10;
                    c.beginPath(); c.ellipse(0, 0, rx, ry, -0.25, from + rot * (k % 2 ? -1 : 1) * 0, to); c.stroke();
                }
                // orbiting debris
                c.shadowBlur = 0;
                for (let k = 0; k < 10; k++) {
                    const ang = rot + k * 0.63;
                    const norm = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                    const front = norm < Math.PI;
                    if ((layer === 'front') !== front) continue;
                    const ex = Math.cos(ang) * 27, ey = Math.sin(ang) * 8;
                    c.fillStyle = k % 3 ? '#fde68a' : '#f0abfc';
                    c.beginPath(); c.arc(ex * Math.cos(-0.25) - ey * Math.sin(-0.25), ex * Math.sin(-0.25) + ey * Math.cos(-0.25), 1.1, 0, Math.PI * 2); c.fill();
                }
            };
            if (layer === 'back') {
                const lens = c.createRadialGradient(0, 0, 6, 0, 0, 40);
                lens.addColorStop(0, 'rgba(76,29,149,0.55)'); lens.addColorStop(1, 'rgba(76,29,149,0)');
                c.fillStyle = lens; c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.fill();
                drawRing(Math.PI, Math.PI * 2);
            } else drawRing(0, Math.PI);
            c.restore();
        }
        if (fx === 'shield' && layer === 'front') {
            // hexagon energy shield
            const p = 0.55 + 0.45 * Math.sin(T * 3);
            c.save(); c.translate(4, 0);
            c.strokeStyle = `rgba(103,232,249,${0.35 + 0.35 * p})`; c.lineWidth = 0.8; c.shadowColor = '#22d3ee'; c.shadowBlur = 12;
            c.beginPath(); c.ellipse(0, 0, 32, 20, 0, 0, Math.PI * 2); c.stroke();
            c.clip();
            c.lineWidth = 0.5; c.strokeStyle = `rgba(165,243,252,${0.12 + 0.2 * p})`; c.shadowBlur = 0;
            const h = 5, sweep = ((T * 30) % 80) - 40;
            for (let gx = -36; gx < 36; gx += h * 1.5) for (let gy = -24; gy < 24; gy += h * 1.73) {
                const cx = gx, cy = gy + ((Math.round(gx / (h * 1.5)) % 2) ? h * 0.86 : 0);
                c.globalAlpha = Math.abs(cx - sweep) < 8 ? 1 : 0.5;
                c.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; c[i ? 'lineTo' : 'moveTo'](cx + h * Math.cos(a), cy + h * Math.sin(a)); } c.closePath(); c.stroke();
            }
            c.restore();
            // orbiting runes
            c.save(); c.translate(4, 0);
            for (let k = 0; k < 6; k++) { const a = T * 1.5 + k * Math.PI / 3; c.fillStyle = k % 2 ? '#fde68a' : '#a5f3fc'; c.shadowColor = c.fillStyle; c.shadowBlur = 8; c.beginPath(); c.arc(Math.cos(a) * 32, Math.sin(a) * 20, 1.3, 0, Math.PI * 2); c.fill(); }
            c.restore();
        }
        if (fx === 'lightning' && layer === 'back') {
            const p = 0.6 + 0.4 * Math.abs(Math.sin(T * 9));
            const g = c.createRadialGradient(6, 0, 3, 6, 0, 34);
            g.addColorStop(0, `rgba(250,204,21,${0.35 * p})`); g.addColorStop(0.5, `rgba(56,189,248,${0.18 * p})`); g.addColorStop(1, 'rgba(56,189,248,0)');
            c.fillStyle = g; c.beginPath(); c.arc(6, 0, 34, 0, Math.PI * 2); c.fill();
        }
        if (fx === 'lightning' && layer === 'front') {
            // crackling electric arcs that hug the hull, with little branches
            c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
            const seed = Math.floor(t / 60);
            const rnd = i => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };
            for (let a = 0; a < 4; a++) {
                const side = a % 2 ? 1 : -1;
                const pts = [];
                let px = -14 + rnd(a) * 4;
                while (px < 28) { pts.push([px, side * (5 + rnd(a * 31 + px) * 7)]); px += 3 + rnd(a * 7 + px) * 4; }
                [[3.2, a < 2 ? 'rgba(56,189,248,0.35)' : 'rgba(250,204,21,0.3)'], [1.1, a < 2 ? '#e0f2fe' : '#fef9c3']].forEach(([w, col]) => {
                    c.strokeStyle = col; c.lineWidth = w; c.shadowColor = a < 2 ? '#38bdf8' : '#facc15'; c.shadowBlur = w > 2 ? 0 : 12;
                    c.beginPath(); pts.forEach(([qx, qy], i) => c[i ? 'lineTo' : 'moveTo'](qx, qy)); c.stroke();
                });
                const b = pts[Math.floor(rnd(a + 40) * pts.length)];   // one branch
                if (b) { c.lineWidth = 0.7; c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(b[0] + 3 + rnd(a + 5) * 5, b[1] + side * (4 + rnd(a + 6) * 6)); c.stroke(); }
            }
            c.restore();
        }
        if (fx === 'aurora' && layer === 'back') {
            // flowing aurora ribbons behind the rocket
            c.save();
            for (let r = 0; r < 3; r++) {
                const hue = (T * 40 + r * 60) % 360;
                const g = c.createLinearGradient(-60, 0, 0, 0);
                g.addColorStop(0, `hsla(${hue},90%,60%,0)`); g.addColorStop(1, `hsla(${hue},90%,65%,0.55)`);
                c.fillStyle = g; c.beginPath();
                const off = (r - 1) * 6;
                c.moveTo(-6, off - 2);
                for (let x = -6; x >= -64; x -= 4) c.lineTo(x, off - 2 + Math.sin(x / 7 + T * 4 + r) * (3 + -x / 12));
                for (let x = -64; x <= -6; x += 4) c.lineTo(x, off + 2 + Math.sin(x / 7 + T * 4 + r) * (3 + -x / 12) + 3);
                c.closePath(); c.fill();
            }
            c.restore();
        }
        if (fx === 'galaxy' && layer === 'back') {
            const aura = c.createRadialGradient(4, 0, 4, 4, 0, 40);
            aura.addColorStop(0, 'rgba(192,38,211,0.4)'); aura.addColorStop(0.6, 'rgba(79,70,229,0.18)'); aura.addColorStop(1, 'rgba(79,70,229,0)');
            c.fillStyle = aura; c.beginPath(); c.arc(4, 0, 40, 0, Math.PI * 2); c.fill();
            // spiral galaxy turning behind the ship
            c.save(); c.translate(4, 0); c.scale(1, 0.55); c.rotate(T * 0.9);
            for (let arm = 0; arm < 2; arm++) for (let k = 0; k < 26; k++) {
                const r = 6 + k * 1.3, a = arm * Math.PI + k * 0.28;
                c.fillStyle = k % 3 === 0 ? 'rgba(255,255,255,0.9)' : arm ? 'rgba(244,114,182,0.75)' : 'rgba(96,165,250,0.75)';
                c.beginPath(); c.arc(Math.cos(a) * r, Math.sin(a) * r, k % 3 === 0 ? 0.9 : 1.4 - k * 0.03, 0, Math.PI * 2); c.fill();
            }
            c.restore();
            // two little moons in orbit
            [[24, 9, 1.6, '#e2e8f0'], [30, 12, 1.1, '#fca5a5']].forEach(([rx, ry, rr, col], i) => {
                const a = T * (1.4 + i * 0.6) + i * 2;
                if (Math.sin(a) > 0) return;   // behind
                c.fillStyle = col; c.beginPath(); c.arc(4 + Math.cos(a) * rx, Math.sin(a) * ry, rr, 0, Math.PI * 2); c.fill();
            });
        }
        if (fx === 'galaxy' && layer === 'front') {
            [[24, 9, 1.6, '#e2e8f0'], [30, 12, 1.1, '#fca5a5']].forEach(([rx, ry, rr, col], i) => {
                const a = T * (1.4 + i * 0.6) + i * 2;
                if (Math.sin(a) <= 0) return;
                c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 6; c.beginPath(); c.arc(4 + Math.cos(a) * rx, Math.sin(a) * ry, rr, 0, Math.PI * 2); c.fill();
            });
            c.shadowBlur = 0;
        }
    }
    function drawRocket(c, x, y, scale, color, opts = {}) {
        const { ghost = false, flame = 1, boost = false, t = 0 } = opts;
        const sk = opts.skin || DEFAULT_SKIN, tr = opts.trail || null;
        const shape = ghost ? 'classic' : sk.shape;
        let accent = sk.accent || color;
        if (sk.fx === 'rainbow') accent = `hsl(${(t / 8) % 360},90%,62%)`;
        c.save();
        c.translate(x, y); c.scale(scale, scale);
        if (ghost) { c.globalAlpha = 0.78 + 0.14 * Math.sin(t / 90); c.shadowColor = 'rgba(167,139,250,0.9)'; c.shadowBlur = 12; }
        const legend = !ghost && sk.legend ? sk.fx : null, anim = !ghost && sk.anim ? sk.fx : null;
        if (legend) { c.save(); legendFx(c, legend, 'back', t, sk, shape, shape === 'heavy' ? -17 : -15); c.restore(); }
        if (anim) { c.save(); shopFx(c, anim, 'back', t, sk, shape, shape === 'heavy' ? -17 : -15); c.restore(); }
        // flame
        const fl = (boost ? 1.8 : 1) * flame * (0.85 + 0.25 * Math.sin(t / 30) + Math.random() * 0.12);
        const tail = shape === 'heavy' ? -17 : -15, fw = shape === 'heavy' ? 7 : 5;
        const fg = c.createLinearGradient(tail - 1, 0, tail - 1 - 30 * fl, 0);
        if (ghost) { fg.addColorStop(0, 'rgba(196,181,253,0.95)'); fg.addColorStop(1, 'rgba(129,140,248,0)'); }
        else if (tr && tr.rainbow) { const h = (t / 4) % 360; fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.3, `hsl(${h},95%,65%)`); fg.addColorStop(0.65, `hsl(${(h + 90) % 360},95%,60%)`); fg.addColorStop(1, `hsla(${(h + 180) % 360},95%,55%,0)`); }
        else { const st = (tr && tr.flame) || ['#fff7ed', '#fde047', '#f97316', 'rgba(239,68,68,0)']; [0, 0.25, 0.6, 1].forEach((o, i) => fg.addColorStop(o, st[i])); }
        c.fillStyle = fg;
        c.beginPath(); c.moveTo(tail, -fw); c.quadraticCurveTo(tail - 1 - 34 * fl, 0, tail, fw); c.closePath(); c.fill();
        if (boost && !ghost) {
            c.fillStyle = 'rgba(125,211,252,0.85)';
            c.beginPath(); c.moveTo(tail, -2.5); c.quadraticCurveTo(tail - 1 - 50 * fl, 0, tail, 2.5); c.closePath(); c.fill();
        }
        if (!ghost && sk.fx === 'glow') { c.shadowColor = accent; c.shadowBlur = 10; }
        // fins / wings
        c.fillStyle = ghost ? 'rgba(167,139,250,0.7)' : accent;
        if (shape === 'sleek') {
            c.beginPath(); c.moveTo(-6, -5); c.lineTo(-20, -12); c.lineTo(-15, -5); c.closePath(); c.fill();
            c.beginPath(); c.moveTo(-6, 5); c.lineTo(-20, 12); c.lineTo(-15, 5); c.closePath(); c.fill();
        } else if (shape === 'heavy') {
            c.beginPath(); c.moveTo(-10, -8); c.lineTo(-20, -16); c.lineTo(-20, -8); c.lineTo(-4, -8); c.closePath(); c.fill();
            c.beginPath(); c.moveTo(-10, 8); c.lineTo(-20, 16); c.lineTo(-20, 8); c.lineTo(-4, 8); c.closePath(); c.fill();
        } else if (shape === 'shuttle') {
            c.beginPath(); c.moveTo(6, -5); c.lineTo(-14, -15); c.lineTo(-16, -5); c.closePath(); c.fill();
            c.beginPath(); c.moveTo(6, 5); c.lineTo(-14, 15); c.lineTo(-16, 5); c.closePath(); c.fill();
            c.beginPath(); c.moveTo(-8, -3); c.lineTo(-17, -10); c.lineTo(-15, -3); c.closePath(); c.fill();
        } else if (shape === 'saucer') {
            // no fins on a flying saucer
        } else {
            c.beginPath(); c.moveTo(-12, -6); c.lineTo(-19, -13); c.lineTo(-6, -6); c.closePath(); c.fill();
            c.beginPath(); c.moveTo(-12, 6); c.lineTo(-19, 13); c.lineTo(-6, 6); c.closePath(); c.fill();
        }
        c.shadowBlur = ghost ? 12 : 0;
        // body
        const hh = shape === 'heavy' ? 8.5 : shape === 'sleek' ? 5.5 : 6.5;
        const bg = c.createLinearGradient(0, -hh, 0, hh);
        if (ghost) { bg.addColorStop(0, 'rgba(237,233,254,0.9)'); bg.addColorStop(1, 'rgba(139,92,246,0.6)'); }
        else if (sk.fx === 'chrome') { const k = 0.5 + 0.5 * Math.sin(t / 500); bg.addColorStop(0, sk.body[0]); bg.addColorStop(0.3 + 0.3 * k, sk.body[2]); bg.addColorStop(0.75, sk.body[1]); bg.addColorStop(1, '#475569'); }
        else { bg.addColorStop(0, sk.body[0]); bg.addColorStop(0.55, sk.body[1]); bg.addColorStop(1, sk.body[2]); }
        if (legend === 'aurora') { const h = (t / 25) % 360; bg.addColorStop(0, `hsl(${h},85%,80%)`); bg.addColorStop(0.5, `hsl(${(h + 60) % 360},85%,55%)`); bg.addColorStop(1, `hsl(${(h + 120) % 360},80%,35%)`); }
        c.fillStyle = bg;
        if (legend === 'blackhole' || legend === 'nova' || legend === 'shield') { c.shadowColor = sk.accent; c.shadowBlur = 12; }
        bodyPath(c, shape, tail); c.fill(); c.shadowBlur = 0;
        if (legend === 'galaxy') {   // the hull is a window into deep space
            c.save(); bodyPath(c, shape, tail); c.clip();
            const ng = c.createLinearGradient(-16, 0, 26, 0); ng.addColorStop(0, '#1e1b4b'); ng.addColorStop(0.5, '#581c87'); ng.addColorStop(1, '#0f172a');
            c.fillStyle = ng; c.fillRect(-20, -10, 50, 20);
            const off = (t / 40) % 40;
            [[-8, -2, 7, 'rgba(236,72,153,0.45)'], [10, 2, 6, 'rgba(56,189,248,0.4)']].forEach(([nx, ny, nr, col]) => { const g = c.createRadialGradient(nx, ny, 0, nx, ny, nr); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(nx - nr, ny - nr, nr * 2, nr * 2); });
            c.fillStyle = '#fff';
            for (let k = 0; k < 16; k++) { const sx = ((k * 17.3 - off) % 46 + 46) % 46 - 18, sy = ((k * 7.7) % 11) - 5.5; c.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t / 250 + k)); c.fillRect(sx, sy, 0.9, 0.9); }
            c.globalAlpha = 1; c.restore();
        }
        if (legend === 'diamond') {   // cut-crystal facets with a rainbow glint
            c.save(); bodyPath(c, shape, tail); c.clip();
            c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.5;
            for (let fx2 = -18; fx2 < 26; fx2 += 6) { c.beginPath(); c.moveTo(fx2, -9); c.lineTo(fx2 + 3, 0); c.lineTo(fx2, 9); c.moveTo(fx2 + 3, 0); c.lineTo(fx2 + 6, -9); c.moveTo(fx2 + 3, 0); c.lineTo(fx2 + 6, 9); c.stroke(); }
            const gx = -20 + ((t / 8) % 70);
            const rb = c.createLinearGradient(gx - 8, -8, gx + 8, 8);
            rb.addColorStop(0, 'rgba(255,0,128,0)'); rb.addColorStop(0.3, 'rgba(255,0,200,0.45)'); rb.addColorStop(0.5, 'rgba(0,255,255,0.6)'); rb.addColorStop(0.7, 'rgba(255,255,0,0.45)'); rb.addColorStop(1, 'rgba(0,255,0,0)');
            c.fillStyle = rb; c.fillRect(-20, -10, 50, 20);
            c.restore();
        }
        if (!ghost && sk.fx === 'gold') {   // moving shine
            const sx = -15 + ((t / 12) % 60);
            const sh = c.createLinearGradient(sx - 6, 0, sx + 6, 0);
            sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.75)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
            c.save(); c.clip(); c.fillStyle = sh; c.fillRect(-20, -10, 50, 20); c.restore();
        }
        if (!ghost && sk.fx === 'stars') {
            c.fillStyle = '#fff';
            [[-10, -3], [-4, 4], [9, -4], [14, 3], [-13, 2], [4, 6]].forEach(([sx, sy], i) => { c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t / 300 + i * 1.7)); c.fillRect(sx, sy, 1.1, 1.1); });
            c.globalAlpha = 1;
        }
        // nose + stripe
        c.fillStyle = ghost ? 'rgba(196,181,253,0.9)' : accent;
        c.beginPath();
        if (shape === 'sleek') { c.moveTo(18, -4.3); c.quadraticCurveTo(26, -3, 31, 0); c.quadraticCurveTo(26, 3, 18, 4.3); }
        else if (shape === 'heavy') { c.moveTo(15, -8.2); c.quadraticCurveTo(22, -8, 24, 0); c.quadraticCurveTo(22, 8, 15, 8.2); }
        else if (shape === 'shuttle') { c.moveTo(18, -5); c.quadraticCurveTo(23, -4.5, 25, 0); c.quadraticCurveTo(23, 4.5, 18, 5); }
        else if (shape === 'saucer') { c.ellipse(4, 3.2, 19, 2.4, 0, 0, Math.PI * 2); }
        else { c.moveTo(14, -5.6); c.quadraticCurveTo(22, -5, 26, 0); c.quadraticCurveTo(22, 5, 14, 5.6); }
        c.closePath(); c.fill();
        if (shape === 'heavy') { c.fillRect(-11, -8.2, 3, 16.4); c.fillRect(-5, -8.4, 1.6, 16.8); }
        else if (shape === 'sleek') { c.fillRect(-11, -4.8, 2, 9.6); }
        else if (shape === 'classic') c.fillRect(-9, -6.2, 3, 12.4);
        // window(s)
        c.fillStyle = ghost ? 'rgba(221,214,254,0.9)' : (sk.win || '#0ea5e9');
        if (!ghost && sk.fx === 'glow') { c.shadowColor = sk.win; c.shadowBlur = 8; }
        if (shape === 'shuttle') { c.beginPath(); c.ellipse(14, -1.5, 3.2, 1.6, 0, 0, Math.PI * 2); c.fill(); }
        else if (shape === 'heavy') { [[1, 0], [8, 0]].forEach(([wx, wy]) => { c.beginPath(); c.arc(wx, wy, 3, 0, Math.PI * 2); c.fill(); }); }
        else if (shape === 'saucer') { /* the dome is drawn by its effect */ }
        else { c.beginPath(); c.arc(shape === 'sleek' ? 6 : 3, 0, shape === 'sleek' ? 2.6 : 3.2, 0, Math.PI * 2); c.fill(); }
        c.shadowBlur = 0;
        c.fillStyle = 'rgba(255,255,255,0.8)';
        if (shape !== 'shuttle' && shape !== 'saucer') { c.beginPath(); c.arc(shape === 'sleek' ? 5.2 : 2, -1, 1, 0, Math.PI * 2); c.fill(); }
        if (legend) { c.save(); legendFx(c, legend, 'front', t, sk, shape, tail); c.restore(); }
        if (anim) { c.save(); shopFx(c, anim, 'front', t, sk, shape, tail); c.restore(); }
        if (legend === 'diamond') {   // twinkling glints
            [[20, -3, 0], [-6, 5, 1.3], [8, -6, 2.6]].forEach(([gx, gy, ph]) => {
                const k = Math.max(0, Math.sin(t / 260 + ph)); if (k < 0.2) return;
                c.fillStyle = `rgba(255,255,255,${k})`; c.shadowColor = '#a5f3fc'; c.shadowBlur = 8;
                const r = 4 * k; c.beginPath(); c.moveTo(gx, gy - r); c.lineTo(gx + r * 0.25, gy); c.lineTo(gx, gy + r); c.lineTo(gx - r * 0.25, gy); c.closePath(); c.fill();
                c.beginPath(); c.moveTo(gx - r, gy); c.lineTo(gx, gy + r * 0.25); c.lineTo(gx + r, gy); c.lineTo(gx, gy - r * 0.25); c.closePath(); c.fill();
            });
            c.shadowBlur = 0;
        }
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
                        if (state === 'racing') rivalLanded(rc);
                    }
                }
                while (rc.missIdx < rc.misses.length && rc.misses[rc.missIdx] <= rt) { rc.missIdx++; asteroidHit(rc); }
            }
            rc.dp += (rc.p - rc.dp) * Math.min(1, dt * 5);
            rc.knock *= Math.pow(0.02, dt);
        }
        FX.shake *= Math.pow(0.004, dt);
    }
    // another rocket reached the Moon while you are still flying
    function rivalLanded(rc) {
        landedBeforeMe++;
        const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th'][landedBeforeMe - 1] || landedBeforeMe + 'th';
        feedbackRival(`${rc.name} landed ${ord}!`);
        SFX.rivalLand();
        FX.shake = Math.max(FX.shake, 6);
        burst(rc, 'dust', 30);
        checkLastOneLeft();
    }
    // everyone else has landed (or left): the race is over and you finish last.
    // Not in the official daily race, where your own time still goes on the leaderboard.
    function checkLastOneLeft() {
        if (state !== 'racing' || isOfficial || !me || me.finished) return;
        const others = racers.filter(rc => rc !== me);
        if (!others.some(rc => rc.finished && !rc.dnf) || !others.every(rc => rc.finished || rc.left)) return;
        setTimeout(() => {
            if (state !== 'racing' || me.finished) return;
            me.dnf = true; me.finish = Infinity;
            Room.send('dnf', {});
            state = 'finale';
            FX.finaleStart = now(); FX.landedDust = false; FX.flagAt = 0;
            $('sr-input').disabled = true; $('sr-go-btn').disabled = true; $('sr-skip-btn').disabled = true; $('sr-boost-btn').disabled = true;
            $('sr-suggest').innerHTML = '';
            $('sr-prompt').innerHTML = '🏁 <b>RACE OVER</b> · everyone else has landed';
            document.querySelector('.sr-hud').classList.add('fade');
            callout('RACE OVER', 'small');
            setTimeout(showResults, 2600);
        }, 1400);
    }
    let rivalTimer = 0;
    function feedbackRival(text) {
        const el = $('sr-map-tag');
        const old = q ? q.tag : '';
        el.textContent = '🚀 ' + text; el.style.color = '#fcd34d';
        el.classList.remove('alert'); void el.offsetWidth; if (/landed/.test(text)) el.classList.add('alert');
        clearTimeout(rivalTimer); rivalTimer = setTimeout(() => { el.textContent = q ? q.tag : old; el.style.color = ''; el.classList.remove('alert'); }, 2400);
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
                FX.particles.push({ x: x - 16 * scale, y: y + (Math.random() - 0.5) * 3, vx: -60 - Math.random() * 80 - (moving ? 200 : 0), vy: (Math.random() - 0.5) * 20, life: 0, max: 0.3 + Math.random() * 0.3, size: 2 + Math.random() * 3, kind: 'fire', hue: rc.kind === 'ghost' ? 'ghost' : (rc.trailId || 'fire') });
                if (rc.trailObj && (rc.trailObj.sparkle || rc.trailObj.rainbow) && Math.random() < 0.35) FX.particles.push({ x: x - 16 * scale, y: y + (Math.random() - 0.5) * 10, vx: -40 - Math.random() * 90, vy: (Math.random() - 0.5) * 40, life: 0, max: 0.5 + Math.random() * 0.4, size: 1.6 + Math.random() * 1.4, kind: 'twinkle', hue: rc.trailId });
            }
            if (rc === me) {
                const halo = c.createRadialGradient(x, y, 2, x, y, 34 * scale);
                halo.addColorStop(0, 'rgba(56,189,248,0.25)'); halo.addColorStop(1, 'rgba(56,189,248,0)');
                c.fillStyle = halo; c.beginPath(); c.arc(x, y, 34 * scale, 0, Math.PI * 2); c.fill();
            }
            drawRocket(c, x, y, scale * (rc === me ? 1.15 : 1), rc.color, { ghost: rc.kind === 'ghost', flame: state === 'countdown' ? 0.4 : moving ? 1.5 : 0.8, boost: rc.boostUntil > t, t: t + rc.wobble * 100, skin: rc.skinObj, trail: rc.trailObj });
            // name tag
            c.font = `700 ${Math.round(11 * scale)}px Rajdhani, sans-serif`;
            c.textAlign = 'center';
            const label = rc === me ? (raceMode === 'room' ? me.name : storedName() || 'YOU') : rc.name;
            c.fillStyle = rc === me ? '#7dd3fc' : rc.kind === 'ghost' ? '#c4b5fd' : 'rgba(226,232,240,0.75)';
            c.fillText((rc.kind === 'ghost' ? '👻 ' : rc.kind === 'friend' ? '🧑‍🚀 ' : '') + label + (rc.left && !rc.finished ? ' (left)' : ''), x, y - 15 * scale);
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

    const FIRE_COLS = [[254, 240, 138], [251, 146, 60], [239, 68, 68]];
    function trailColors(id) { if (!id || id === 'fire' || !window.SRGarage) return FIRE_COLS; const tr = SRGarage.trail(id); return tr.p || FIRE_COLS; }
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
                if (p.hue === 'ghost') c.fillStyle = `rgba(196,181,253,${a * 0.8})`;
                else if (p.hue === 'rainbow') c.fillStyle = `hsla(${(p.x * 2 + p.life * 600) % 360},95%,62%,${a})`;
                else { const cols = trailColors(p.hue), col = k < 0.25 ? cols[0] : k < 0.55 ? cols[1] : cols[2]; c.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${k < 0.55 ? a : a * 0.7})`; }
                c.beginPath(); c.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2); c.fill();
            } else if (p.kind === 'twinkle') {
                p.vx *= 0.97;
                const a = (1 - k) * (0.6 + 0.4 * Math.sin(p.life * 40));
                c.fillStyle = p.hue === 'rainbow' ? `hsla(${(p.life * 900) % 360},95%,70%,${a})` : `rgba(${trailColors(p.hue)[0].join(',')},${a})`;
                const r = p.size; c.beginPath(); c.moveTo(p.x, p.y - r * 1.8); c.lineTo(p.x + r * 0.5, p.y); c.lineTo(p.x, p.y + r * 1.8); c.lineTo(p.x - r * 0.5, p.y); c.closePath(); c.fill();
                c.beginPath(); c.moveTo(p.x - r * 1.8, p.y); c.lineTo(p.x, p.y + r * 0.5); c.lineTo(p.x + r * 1.8, p.y); c.lineTo(p.x, p.y - r * 0.5); c.closePath(); c.fill();
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
    // ==========================================
    // LAUNCH PAD: the waiting room shows everyone's rockets. New racers fly in to their lane.
    // ==========================================
    const Pad = {
        ents: new Map(), raf: 0, launching: 0, stars: null,
        // list: [{ id, name, skin, trail, color, me, bot }]
        sync(list) {
            const t = now(), seen = new Set();
            list.forEach((r, i) => {
                seen.add(r.id);
                let e = this.ents.get(r.id);
                if (!e) {
                    e = { enterT: t + (r.bot ? i * 120 : 0), wob: Math.random() * 6 };
                    this.ents.set(r.id, e);
                    if (this.ents.size > 1 || r.bot) setTimeout(() => { if (soundOn) { noise(0.5, 0.08, 2500, 300); tone(300, 0.4, 'sawtooth', 0.03, 500); } }, Math.max(0, e.enterT - t));
                }
                Object.assign(e, r, { slot: i, skinObj: SRGarage.skin(r.skin || 'classic'), trailObj: SRGarage.trail(r.trail || 'fire'), gone: 0 });
            });
            this.ents.forEach((e, id) => { if (!seen.has(id) && !e.gone) e.gone = t; });
            if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
        },
        reset() { this.ents.clear(); this.launching = 0; },
        frame() {
            this.raf = 0;
            const cv = $('sr-room-pad');
            if (!cv || !$('sr-room').classList.contains('active')) return;
            const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
            if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
            const c = cv.getContext('2d'), t = now();
            c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
            // drifting stars
            if (!this.stars) this.stars = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7 }));
            const speed = this.launching ? 0.25 + 0.6 * Math.min(1, (t - this.launching) / 3000) : 0.03;
            this.stars.forEach(st => { st.x -= speed * st.z * 0.016; if (st.x < 0) { st.x += 1; st.y = Math.random(); } c.fillStyle = `rgba(226,232,240,${0.25 + 0.5 * st.z})`; c.fillRect(st.x * W, st.y * H, 1.3 * st.z + (this.launching ? speed * 20 * st.z : 0), 1.3 * st.z); });
            const lanes = LANES, top = 16, laneH = (H - top - 4) / lanes, scale = Math.min(1.45, laneH / 27);
            // empty pads
            for (let i = 0; i < lanes; i++) {
                const y = top + laneH * (i + 0.5);
                c.strokeStyle = 'rgba(56,189,248,0.12)'; c.setLineDash([5, 9]); c.lineDashOffset = -t / 40; c.beginPath(); c.moveTo(14, y); c.lineTo(W - 14, y); c.stroke(); c.setLineDash([]);
                if (![...this.ents.values()].some(e => e.slot === i && !e.gone)) {
                    c.fillStyle = 'rgba(148,163,184,0.35)'; c.font = `600 ${Math.round(11 * scale)}px Rajdhani, sans-serif`; c.textAlign = 'center';
                    c.fillText('waiting for a racer' + '.'.repeat(1 + Math.floor(t / 500) % 3), W * 0.5, y + 4);
                }
            }
            let busy = false;
            this.ents.forEach((e, id) => {
                if (e.gone && t - e.gone > 700) { this.ents.delete(id); return; }
                const y = top + laneH * (e.slot + 0.5) + Math.sin(t / 500 + e.wob) * 2;
                const homeX = W * (0.42 + (e.slot % 2) * 0.06);
                const k = clamp((t - e.enterT) / 1100, 0, 1), ease = 1 - Math.pow(1 - k, 3);
                let x = lerp(-60, homeX, ease);
                if (e.gone) x = homeX + Math.pow((t - e.gone) / 700, 2) * W;
                if (this.launching) x += Math.pow(Math.max(0, t - this.launching) / 1000, 2) * 6 + (Math.random() - 0.5) * 1.5;
                if (t < e.enterT) return;
                if (k < 1 || e.gone) busy = true;
                c.save();
                if (e.me) { const g = c.createRadialGradient(x, y, 2, x, y, 30 * scale); g.addColorStop(0, 'rgba(56,189,248,0.28)'); g.addColorStop(1, 'rgba(56,189,248,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, 30 * scale, 0, Math.PI * 2); c.fill(); }
                const flame = k < 1 ? 1.8 : this.launching ? 0.8 + Math.min(1.6, (t - this.launching) / 1500) : 0.45;
                drawRocket(c, x, y, scale * (e.me ? 1.12 : 1), e.color || '#38bdf8', { flame, boost: k < 1, t: t + e.wob * 100, skin: e.skinObj, trail: e.trailObj });
                c.font = `700 ${Math.round(11 * scale)}px Rajdhani, sans-serif`; c.textAlign = 'center';
                c.fillStyle = e.me ? '#7dd3fc' : e.bot ? 'rgba(226,232,240,0.7)' : '#f8fafc';
                c.fillText((e.me ? '⭐ ' : '') + (e.name || 'Racer') + (e.me ? ' (you)' : ''), x, y - 15 * scale);
                const sk = e.skinObj;
                if (sk && sk.id !== 'classic') { c.font = `600 ${Math.round(9 * scale)}px Rajdhani, sans-serif`; c.fillStyle = sk.legend ? '#fde68a' : 'rgba(148,163,184,0.85)'; c.textAlign = 'left'; c.fillText((sk.legend ? '★ ' : '') + sk.name, x + 32 * scale, y + 4); }
                c.restore();
            });
            this.raf = requestAnimationFrame(() => this.frame());
        }
    };

    const Room = {
        code: null, ch: null, quick: false, joinedAt: 0, players: [], hostId: null,
        settings: { set: 'mixed', target: 15, bots: true }, racing: false, roster: null,
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
            this.settings = { set: 'mixed', target: DAILY_TARGET, bots: true };
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
            ch.on('broadcast', { event: 'dnf' }, ({ payload }) => { const rc = this.friend(payload.id); if (rc) { rc.dnf = true; rc.finished = true; if (!$('sr-results').classList.contains('hidden')) { renderStandings(); this.renderResultButtons(); } } });
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
            const meta = { name: this.myName, joinedAt: this.joinedAt, ...SRGarage.equipped() };
            if (this.isHost) { meta.settings = this.settings; meta.racing = this.racing; meta.quick = this.quick; meta.created = this.quickCreated; if (this.racing && this.startPayload) meta.start = this.startPayload; }
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
                // backup for a missed 'start' message: the host's presence carries the race it launched
                if (host.racing && host.start && !this.startedRace && host.start.seed !== this.lastSeed) this.onStart(host.start);
            }
            if (this.isHost && list[0] && list[0].id === CLIENT_ID && !list[0].settings) this.track();   // I'm host: publish settings
            // full room: the late arrivals leave
            const myIdx = list.findIndex(p => p.id === CLIENT_ID);
            if (myIdx >= MAX_PLAYERS) { alert(`Room ${this.code} is full (${MAX_PLAYERS} racers).`); this.leave(); return; }
            // racers who left mid-race
            if (racers.length && raceMode === 'room') {
                const here = new Set(list.map(p => p.id));
                racers.forEach(rc => { if (rc.kind === 'friend' && !here.has(rc.id) && !rc.left) { rc.left = true; if (!rc.finished) feedbackRival(`${rc.name} left the race`); } });
                checkLastOneLeft();
                if (!$('sr-results').classList.contains('hidden')) { renderStandings(); this.renderResultButtons(); }
            }
            if (this.quick) this.quickHostCheck();
            this.render();
        },

        // ---------- room screen ----------
        render() {
            if (!this.code) return;
            $('sr-room-title').textContent = this.quick ? '⚡ QUICK MATCH' : '🔒 PRIVATE ROOM';
            if (this.intro) return;   // MATCH FOUND! 3-2-1 is on screen
            Pad.launching = 0;
            $('sr-room-code').textContent = this.quick ? 'ONLINE' : this.code; $('sr-room-code').classList.remove('mf-small', 'mf-pop');
            document.querySelector('.sr-room-code-label').textContent = this.quick ? 'PUBLIC RACE' : 'ROOM CODE';
            $('sr-room-share').classList.toggle('hidden', this.quick);
            $('sr-room-link').textContent = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}space-race.html?room=${this.code}`;
            const humans = this.players.slice(0, MAX_PLAYERS);
            const sig = humans.map(p => p.id + p.name).join('|') + this.hostId;
            if (sig !== this._sig) $('sr-room-players').innerHTML = humans.map((p, i) => `<div class="sr-lane-chip"><span class="dot" style="background:${COLORS[i % COLORS.length]};color:${COLORS[i % COLORS.length]}"></span>
                <span class="nm">${esc(p.name || 'Racer')}${p.id === CLIENT_ID ? ' (you)' : ''}</span>
                <span class="tag ${i === 0 ? 'tag-ghost' : 'tag-you'}">${i === 0 ? '👑 HOST' : 'READY'}</span></div>`).join('') || '<div class="sr-muted">Connecting…</div>';
            this._sig = sig;
            Pad.sync(humans.map((p, i) => ({ id: p.id, name: p.id === CLIENT_ID ? this.myName : p.name, skin: p.id === CLIENT_ID ? SRGarage.equipped().skin : p.skin, trail: p.id === CLIENT_ID ? SRGarage.equipped().trail : p.trail, color: COLORS[i % COLORS.length], me: p.id === CLIENT_ID })));
            $('sr-room-players').classList.toggle('hidden', this.quick); $('sr-room-players').previousElementSibling.classList.toggle('hidden', this.quick);
            // settings: host can change them, everyone else sees them
            const st = this.settings;
            document.querySelectorAll('#sr-room-settings [data-set]').forEach(b => { b.classList.toggle('active', b.dataset.set === st.set); b.disabled = !this.isHost; });
            document.querySelectorAll('#sr-room-settings [data-target]').forEach(b => { b.classList.toggle('active', +b.dataset.target === st.target); b.disabled = !this.isHost; });
            document.querySelectorAll('#sr-room-settings [data-bots]').forEach(b => { b.classList.toggle('active', (b.dataset.bots === 'on') === st.bots); b.disabled = !this.isHost; });
            $('sr-room-settings').classList.toggle('hidden', this.quick);
            const startBtn = $('sr-room-start');
            startBtn.classList.toggle('hidden', !this.isHost || this.quick);   // quick matches launch on their own timer
            startBtn.disabled = this.racing;
            startBtn.textContent = humans.length < 2 && !st.bots ? '🚀 START (add a friend or fill empty lanes)' : '🚀 START RACE';
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
            const humans = this.players.slice(0, MAX_PLAYERS).map(p => ({ id: p.id, name: p.name || 'Racer', skin: p.skin, trail: p.trail }));
            const st = this.settings;
            const nBots = st.bots ? Math.max(0, LANES - humans.length) : 0;
            const payload = { seed: this.code + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7), set: st.set, target: st.target, roster: humans, bots: nBots };
            this.racing = true; this.startPayload = payload; this.track();
            if (this.lobbyCh) { this.lobbyCh.untrack(); }
            clearInterval(this.tickTimer);
            const ch = this.ch;
            ch.send({ type: 'broadcast', event: 'start', payload });
            // send it again in case someone's connection dropped the first one
            [1200, 3000].forEach(ms => setTimeout(() => { if (this.ch === ch && this.startPayload === payload) ch.send({ type: 'broadcast', event: 'start', payload }); }, ms));
            this.onStart(payload);
        },
        onStart(payload) {
            if (!payload || payload.seed === this.lastSeed) return;   // already racing this one
            this.racing = true;
            if (!payload.roster.some(r => r.id === CLIENT_ID)) {   // joined too late
                this.lastSeed = payload.seed; this.startedRace = false; clearInterval(this.tickTimer);
                if (this.quick) {
                    $('sr-room-status').innerHTML = '🚀 That race launched just before you joined. Finding you another match…';
                    clearTimeout(this.quickTimer);
                    this.quickTimer = setTimeout(() => { if (this.quick && !this.startedRace) this.leave(true).then(() => quickMatch()); }, 1800);
                } else this.render();
                return;
            }
            this.lastSeed = payload.seed;
            clearInterval(this.tickTimer); clearTimeout(this.quickTimer);
            this.startedRace = true;
            const r = rng(hashStr(payload.seed + 'bots'));
            const bNames = botNames(r), skills = shuffle(BOT_SKILLS, r);
            const field = payload.roster.map((p, i) => ({ id: p.id, name: p.id === CLIENT_ID ? this.myName : p.name, kind: p.id === CLIENT_ID ? 'you' : 'friend', color: COLORS[i % COLORS.length], skin: p.id === CLIENT_ID ? SRGarage.equipped().skin : p.skin, trail: p.id === CLIENT_ID ? SRGarage.equipped().trail : p.trail }));
            for (let i = 0; i < payload.bots; i++) field.push({ name: bNames[i], kind: 'bot', skill: skills[i % skills.length].label, color: COLORS[(field.length) % COLORS.length], ...SRGarage.botLook(r) });
            TARGET = payload.target;
            const go = () => startRace({ seed: payload.seed, set: payload.set, target: payload.target, field });
            if (!this.quick) { go(); return; }
            // quick match: "MATCH FOUND!" and a 3-2-1 in the lobby, then the race's own countdown
            const code = this.code, humans = payload.roster.length;
            $('sr-room-status').innerHTML = `⚡ <b>MATCH FOUND!</b> ${humans} ${humans === 1 ? 'racer' : 'racers'}${payload.bots ? ` + ${payload.bots} computer` : ''}`;
            const big = $('sr-room-code'), label = document.querySelector('.sr-room-code-label');
            const flash = (text, small) => { big.textContent = text; big.classList.toggle('mf-small', !!small); big.classList.remove('mf-pop'); void big.offsetWidth; big.classList.add('mf-pop'); };
            this.intro = true; label.textContent = 'GET READY'; flash('STARTING MATCH', true); SFX.matchStart();
            Pad.sync(field.map((f, i) => ({ id: f.id || 'bot' + i, name: f.name, skin: f.skin, trail: f.trail, color: f.color, me: f.kind === 'you', bot: f.kind === 'bot' })));
            setTimeout(() => { this.intro = false; if (this.code === code && this.startedRace) go(); }, 3000);
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
            if (state === 'racing') rivalLanded(rc);
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
            Pad.reset();
            this.ch = null; this.lobbyCh = null; this.code = null; this.quick = false; this.players = []; this.racing = false; this.startedRace = false; this.startPayload = null; this.intro = false;
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
                // no seconds shown: device clocks differ, so only the host's clock decides the launch,
                // and everyone gets the same "MATCH FOUND! 3-2-1" when it happens
                const left = Math.max(0, Math.ceil((this.quickCreated + QUICK_WAIT_MS - Date.now()) / 1000));
                const dots = '.'.repeat(1 + Math.floor(Date.now() / 500) % 3);
                $('sr-room-status').innerHTML = `🔎 Searching for racers${dots} <b>${this.players.length}</b> found`;
                if (left <= 0 && this.isHost && !this.racing) this.hostStart();
                // timer ran out long ago and nothing arrived (host gone or message lost): find a fresh match
                if (!this.isHost && !this.startedRace && Date.now() > this.joinedAt + QUICK_WAIT_MS + 9000) {
                    clearInterval(this.tickTimer);
                    $('sr-room-status').innerHTML = '🔄 Lost the launch signal. Finding you another match…';
                    this.leave(true).then(() => quickMatch());
                }
            };
            tick(); this.tickTimer = setInterval(tick, 500);
        }
    };

    async function quickMatch() {
        if (!sb) { alert('Online play needs an internet connection. Please try again.'); return; }
        $('sr-quick-btn').disabled = true;
        try {
            await authReady;
            if (!storedName()) await Room.ensureName();
            const lobby = sb.channel('sr-quick-lobby', { config: { presence: { key: CLIENT_ID } } });
            const openRooms = () => Object.values(lobby.presenceState()).map(m => m[m.length - 1])
                .filter(m => m && m.room && m.open && Date.now() - m.created < QUICK_WAIT_MS - 1500);
            let mine = null;   // the room I created, once I have one
            const open = await new Promise(resolve => {
                let done = false;
                const finish = v => { if (!done) { done = true; resolve(v); } };
                lobby.on('presence', { event: 'sync' }, () => {
                    if (!mine) { finish(openRooms().sort((a, b) => a.created - b.created)[0] || null); return; }
                    // two people clicked at the same moment and each made a room: the newer, still-empty room moves into the older one
                    if (Room.code !== mine.room || Room.racing || Room.players.length > 1 || !Room.isHost) return;
                    const older = openRooms().filter(m => m.room !== mine.room && (m.created < mine.created || (m.created === mine.created && m.room < mine.room)))
                        .sort((a, b) => a.created - b.created)[0];
                    if (older) { mine = { room: null }; Room.open(older.room, { quick: true }); }
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
                mine = { room: code, created: Room.quickCreated };
                await lobby.track({ room: code, open: true, created: Room.quickCreated });
                if (Room.code !== code) return;   // already moved into an older room
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
    $('sr-room-start').onclick = () => { ac(); if (!Room.quick) Room.hostStart(); };
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
    $('sr-boost-btn').onclick = () => { useBoost(); $('sr-input').focus({ preventScroll: true }); };
    $('sr-review-btn').addEventListener('click', () => {
        const box = $('sr-review'), open = box.classList.toggle('hidden') === false;
        $('sr-review-btn').textContent = open ? '▲ Hide answers' : `📋 Review your answers (${answerLog.length})`;
        if (open) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('sr-suggest').addEventListener('click', e => { const b = e.target.closest('.sr-chip'); if (b) submit(suggestions[+b.dataset.i]); });
    $('sr-input').addEventListener('input', () => { SFX.key(); renderSuggest(); });
    $('sr-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); useBoost(); }
        else if (e.key === 'Enter' && !e.target.value.trim() && !e.repeat) { e.preventDefault(); if (now() - qShownAt > 350) useBoost(); }   // Enter on an empty box = ⚡ boost
        else if (e.key === 'Enter') { e.preventDefault(); submit(); }
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
        setSoundBtn(); renderCallsign(); renderStats();
        // 🛒 shop / 🛠️ hangar
        SRGarage.setStats(loadStats); SRGarage.setDrawer(drawRocket); SRGarage.onChange(() => { renderWallet(); renderBoostBtn(); });
        renderWallet();
        $('sr-shop-btn').onclick = () => { ac(); SRGarage.open('shop'); };
        $('sr-shop-btn').innerHTML = '🛒 Shop <span class="sr-sale-tag">SALE</span>';
        $('sr-hangar-btn').onclick = () => { ac(); SRGarage.open('hangar'); };
        try { await loadMaps(); } catch (e) { $('sr-start-btn').textContent = 'MAPS FAILED TO LOAD'; console.error(e); return; }
        await buildLineup();
        updateStartBtn();
        requestAnimationFrame(frame);
        const linkCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z]/g, '');
        if (linkCode.length === 4) Room.open(linkCode);
    })();

    // test hook (used by automated tests only)
    window.__spaceRace = { Room, CLIENT_ID, buildDeck, get raceMode() { return raceMode; }, get state() { return state; }, get q() { return q; }, get me() { return me; }, get racers() { return racers; }, submit, skip, DAY };
})();
