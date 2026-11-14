// ==========================================
// GEO-SPACERACE: DAILY LAUNCH WINDOW (USA)
// One question per day, the same for everyone.
// Find as many correct states as you can in 60 seconds.
// Each wrong click burns 5 seconds of fuel.
// One run per day + streaks + share button.
// ==========================================
window.usaDailyGame = (function () {

    // ---------- SETTINGS (easy to tweak) ----------
    const DAILY_QUESTIONS_FILE = 'questions-usa-daily.json';
    const DAILY_MAP_FILE = 'us-states.geojson';
    const ROUND_SECONDS = 60;          // starting fuel (seconds)
    const WRONG_PENALTY_SECONDS = 5;   // fuel lost per wrong click
    const FIRST_WINDOW = new Date(2026, 10, 13); // Nov 13, 2026 = Launch Window #1 (month is 0-based)
    const HARD_WEEKDAY = 3;            // 0 = Sunday ... 3 = Wednesday (the hard day)
    const STORE_KEY = 'geo_usa_daily_v1';
    const SITE_URL = 'https://geospacerace.com/';   // link added to shared results

    // ---------- STATE ----------
    let dMap = null;
    let dEntries = [];
    let dLabelLayer = null;
    let dQuestions = null;
    let dSpecials = {};
    let dQuestion = null;
    let dAnswers = new Set();     // normalized answer names
    let dFound = new Set();
    let dWrong = new Set();
    let dSeq = '';
    let dSelected = null;         // first tap selects a state, second tap on it confirms                // click history: g = correct click, r = wrong click
    let dRunning = false;
    let dEndTime = 0;
    let dTimerId = null;
    let dCountdownId = null;
    let dAudio = null;

    // ---------- HELPERS ----------
    const $ = id => document.getElementById(id);
    const norm = s => String(s || '').trim().toLowerCase();
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function dayIndex(date = new Date()) {
        const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const b = new Date(FIRST_WINDOW.getFullYear(), FIRST_WINDOW.getMonth(), FIRST_WINDOW.getDate());
        return Math.round((a - b) / 86400000);
    }
    function windowNumber() { return Math.max(1, dayIndex() + 1); }
    function dayLabel(date = new Date()) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });   // e.g. "Nov 14"
    }
    function headerLabel() { return (isHardDay() ? 'HARD WEDNESDAY · ' : 'DAILY CHALLENGE · ') + dayLabel().toUpperCase(); }

    function loadStore() {
        try {
            const s = JSON.parse(localStorage.getItem(STORE_KEY));
            if (s && typeof s === 'object') return Object.assign({ streak: 0, maxStreak: 0, lastDay: null, played: 0, results: {} }, s);
        } catch (e) {}
        return { streak: 0, maxStreak: 0, lastDay: null, played: 0, results: {} };
    }
    function saveStore(s) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
    }
    function currentStreak(store) {
        const today = dayIndex();
        if (store.lastDay === today || store.lastDay === today - 1) return store.streak || 0;
        return 0;
    }

    function msUntilNextWindow() {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        return next - now;
    }
    function formatCountdown(ms) {
        const t = Math.max(0, Math.floor(ms / 1000));
        const h = String(Math.floor(t / 3600)).padStart(2, '0');
        const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
        const s = String(t % 60).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    // ---------- SOUND ----------
    function beep(type) {
        try {
            if (!dAudio) dAudio = new (window.AudioContext || window.webkitAudioContext)();
            if (dAudio.state === 'suspended') dAudio.resume();
            const now = dAudio.currentTime;
            const osc = dAudio.createOscillator();
            const gain = dAudio.createGain();
            if (type === 'good') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(660, now);
                osc.frequency.setValueAtTime(880, now + 0.08);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            } else if (type === 'bad') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.2);
                gain.gain.setValueAtTime(0.18, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            } else if (type === 'tick') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1000, now);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
            } else if (type === 'launch') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(120, now);
                osc.frequency.exponentialRampToValueAtTime(900, now + 0.8);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.9);
            } else {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(520, now);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
            }
            osc.connect(gain); gain.connect(dAudio.destination);
            osc.start(now); osc.stop(now + 1);
        } catch (e) {}
    }

    // ---------- SCREEN ----------
    function ensureScreen() {
        if ($('daily-screen')) return;
        const el = document.createElement('div');
        el.id = 'daily-screen';
        el.className = 'screen';
        el.innerHTML = `
            <div class="daily-wrap">
                <header class="daily-hud">
                    <button id="daily-home-btn" class="space-btn secondary-btn daily-small-btn">🏠 Home</button>
                    <div class="daily-title" id="daily-num">DAILY CHALLENGE</div>
                    <div class="daily-timer" id="daily-timer">1:00</div>
                </header>
                <div class="daily-prompt" id="daily-prompt">Loading today's mission...</div>
                <div class="daily-fuel">
                    <span class="daily-fuel-label">FUEL</span>
                    <div class="daily-fuel-cells" id="daily-fuel-cells"></div>
                    <span class="daily-count" id="daily-count">0 / 0</span>
                </div>
                <div class="daily-map-wrap">
                    <div id="daily-map"></div>
                    <div class="daily-penalty" id="daily-penalty">-${WRONG_PENALTY_SECONDS}s</div>
                </div>
            </div>

            <div id="daily-intro" class="modal hidden">
                <div class="modal-content daily-card">
                    <div class="daily-kicker" id="daily-intro-num">DAILY CHALLENGE</div>
                    <h2>READY FOR LAUNCH?</h2>
                    <div class="daily-intro-cat" id="daily-intro-cat">Today's category: —</div>
                    <ul class="daily-rules">
                        <li>⛽ There are <b><span id="daily-intro-count">?</span> correct answers</b> to find</li>
                        <li>⏱️ You have <b>${ROUND_SECONDS} seconds</b></li>
                        <li>👆 Tap a state, then tap it <b>again</b> to lock it in</li>
                        <li>💥 Each wrong answer burns <b>${WRONG_PENALTY_SECONDS} seconds</b></li>
                        <li>🗓️ One launch per day, same for everyone</li>
                    </ul>
                    <div class="daily-countdown-big hidden" id="daily-countdown-big">3</div>
                    <button id="daily-go-btn" class="space-btn">🚀 LAUNCH</button>
                </div>
            </div>

            <div id="daily-results" class="modal hidden">
                <div class="modal-content daily-card">
                    <div class="daily-kicker" id="daily-res-num">DAILY CHALLENGE</div>
                    <h2 id="daily-res-title">MISSION COMPLETE</h2>
                    <div class="daily-res-score" id="daily-res-score">0 / 0</div>
                    <div class="daily-res-fuel" id="daily-res-fuel"></div>
                    <div class="daily-res-stats" id="daily-res-stats"></div>
                    <div class="daily-res-missed" id="daily-res-missed"></div>
                    <button id="daily-share-btn" class="space-btn">📤 SHARE RESULT</button>
                    <div class="daily-btn-row">
                        <button id="daily-map-btn" class="space-btn secondary-btn">🗺️ SEE MAP</button>
                        <button id="daily-res-home-btn" class="space-btn secondary-btn">🏠 HOME</button>
                    </div>
                    <div class="daily-next" id="daily-next">Next launch window in --:--:--</div>
                </div>
            </div>

            <button id="daily-show-results" class="space-btn daily-float-btn hidden">📊 RESULTS</button>
            <div id="daily-toast" class="daily-toast"></div>
        `;
        document.body.appendChild(el);

        $('daily-home-btn').onclick = goHome;
        $('daily-res-home-btn').onclick = goHome;
        $('daily-go-btn').onclick = beginCountdown;
        $('daily-share-btn').onclick = shareResult;
        $('daily-map-btn').onclick = () => {
            $('daily-results').classList.add('hidden');
            $('daily-show-results').classList.remove('hidden');
            if (dMap) setTimeout(() => dMap.invalidateSize(), 50);
        };
        $('daily-show-results').onclick = () => {
            $('daily-show-results').classList.add('hidden');
            $('daily-results').classList.remove('hidden');
        };
        window.addEventListener('resize', () => { if (dMap) dMap.invalidateSize(); });
    }

    function showScreen() {
        const home = $('home-screen');
        const game = $('game-screen');
        if (home) { home.classList.add('hidden'); home.style.display = 'none'; }
        if (game) { game.classList.remove('active'); game.style.display = 'none'; }
        const ds = $('daily-screen');
        ds.classList.add('active');
        ds.style.display = 'flex';
    }

    function goHome() {
        if (dRunning) finishRun('abandoned');
        stopTimers();
        const ds = $('daily-screen');
        if (ds) { ds.classList.remove('active'); ds.style.display = 'none'; }
        ['daily-intro', 'daily-results'].forEach(id => $(id) && $(id).classList.add('hidden'));
        $('daily-show-results') && $('daily-show-results').classList.add('hidden');
        const home = $('home-screen');
        if (home) { home.classList.remove('hidden'); home.style.display = ''; }
        if (window.refreshDailyHome) window.refreshDailyHome();
    }

    function toast(msg) {
        const t = $('daily-toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t._h);
        t._h = setTimeout(() => t.classList.remove('show'), 2200);
    }

    // ---------- DATA ----------
    async function loadQuestions() {
        if (dQuestions) return dQuestions;
        const res = await fetch(DAILY_QUESTIONS_FILE, { cache: 'no-cache' });
        if (!res.ok) throw new Error('Could not load ' + DAILY_QUESTIONS_FILE);
        const data = await res.json();
        dQuestions = (data.questions || data).filter(q => q.prompt && Array.isArray(q.answers) && q.answers.length);
        dSpecials = (data.specials && typeof data.specials === 'object') ? data.specials : {};
        if (!dQuestions.length) throw new Error('No daily questions found.');
        return dQuestions;
    }

    function dateKey(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function todaysQuestion() {
        // a hand-made question for a specific date (holidays, events) wins over the normal rotation
        const special = dSpecials[dateKey()];
        if (special && special.prompt && Array.isArray(special.answers) && special.answers.length) {
            return Object.assign({ id: 'special-' + dateKey(), category: 'Special' }, special);
        }
        // Wednesdays pull from the hard questions; every other day uses the regular ones.
        const hard = dQuestions.filter(q => q.hard);
        const regular = dQuestions.filter(q => !q.hard);
        const d = Math.max(0, dayIndex());
        if (!hard.length || !regular.length) return dQuestions[d % dQuestions.length];
        let wednesdaysBefore = 0;
        for (let i = 0; i < d; i++) {
            if (new Date(FIRST_WINDOW.getFullYear(), FIRST_WINDOW.getMonth(), FIRST_WINDOW.getDate() + i).getDay() === HARD_WEEKDAY) wednesdaysBefore++;
        }
        if (isHardDay()) return pickFromPool(hard, wednesdaysBefore, 7);
        return pickFromPool(regular, d - wednesdaysBefore, 3);
    }

    // First time through, questions run in file order. Once every question has been used,
    // the pool is reshuffled (the same way for every player) so the next lap is in a new order.
    function pickFromPool(pool, n, salt) {
        const lap = Math.floor(n / pool.length);
        const pos = n % pool.length;
        if (lap === 0) return pool[pos];
        let seed = (lap * 2654435761 + salt * 97) >>> 0;
        const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const order = pool.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        return pool[order[pos]];
    }

    function isHardDay(date = new Date()) { return date.getDay() === HARD_WEEKDAY; }

    // ---------- MAP ----------
    const NE_CALLOUTS = {
        MD: { label: [39.8, -67.4], target: [39.0, -76.6] },
        DE: { label: [38.9, -67.4], target: [39.0, -75.5] },
        DC: { label: [37.8, -67.4], target: [38.9, -77.0] },
        RI: { label: [41.9, -67.4], target: [41.6, -71.5] }
    };
    const NORTH_CALLOUTS = {
        VT: { label: [45.75, -72.7], target: [44.25, -72.7] },
        NH: { label: [45.75, -71.55], target: [44.15, -71.55] }
    };
    const LABEL_POS = {
        AK: [25.8, -117.5], MA: [42.25, -71.8], CT: [41.55, -72.7], NJ: [40.1, -74.5], ID: [43.4, -114.3], OK: [35.5, -96.5], LA: [30.95, -92.0], FL: [27.6, -81.0],
        MI: [43.6, -84.8], MS: [32.9, -89.4], VA: [37.6, -78.2], KY: [37.5, -85.3], MN: [46.0, -94.8], NC: [35.7, -78.4]
    };
    const ABBR = {
        'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
        'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS', 'kentucky': 'KY',
        'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD', 'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
        'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
        'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI',
        'south carolina': 'SC', 'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT', 'virginia': 'VA',
        'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC', 'puerto rico': 'PR'
    };

    const STYLE_BASE = { color: '#38bdf8', weight: 1.2, fillColor: '#1e293b', fillOpacity: 0.95 };
    const STYLE_HOVER = { color: '#67e8f9', weight: 2, fillColor: '#334155', fillOpacity: 1 };
    const STYLE_FOUND = { color: '#86efac', weight: 2, fillColor: '#16a34a', fillOpacity: 0.95 };
    const STYLE_WRONG = { color: '#fca5a5', weight: 1.5, fillColor: '#7f1d1d', fillOpacity: 0.9 };
    const STYLE_SELECTED = { color: '#fde68a', weight: 2.5, fillColor: '#f59e0b', fillOpacity: 0.95 };
    const STYLE_MISSED = { color: '#fde68a', weight: 2, fillColor: '#d97706', fillOpacity: 0.95 };

    function entryStyle(entry) {
        const n = entry.norm;
        if (dFound.has(n)) return STYLE_FOUND;
        if (dRunning && dSelected === entry) return STYLE_SELECTED;
        if (!dRunning && dQuestion && dAnswers.has(n) && entry.revealMissed) return STYLE_MISSED;
        if (dWrong.has(n)) return STYLE_WRONG;
        return STYLE_BASE;
    }
    function paint(entry) {
        const st = entryStyle(entry);
        entry.layer.setStyle(st);
        if (entry.circle) entry.circle.setStyle({ color: st.color, weight: 2, fillColor: st.fillColor, fillOpacity: st === STYLE_BASE ? 0.15 : 0.85 });
    }
    function paintAll() { dEntries.forEach(paint); }

    async function ensureMap() {
        if (dMap) return;
        if (!window.L) throw new Error('Map library (Leaflet) did not load.');
        const res = await fetch(DAILY_MAP_FILE);
        if (!res.ok) throw new Error('Could not load ' + DAILY_MAP_FILE);
        const geo = await res.json();
        moveAlaskaAndHawaii(geo);

        dMap = L.map('daily-map', {
            center: [37.8, -96], zoom: 4, minZoom: 1, maxZoom: 10, zoomSnap: 0.25,
            zoomControl: true, doubleClickZoom: false, attributionControl: false
        });

        L.geoJSON(geo, {
            style: () => STYLE_BASE,
            onEachFeature: (feature, layer) => {
                const name = (feature.properties && (feature.properties.name || feature.properties.NAME)) || '';
                if (!name) return;
                const entry = { name, norm: norm(name), abbr: ABBR[norm(name)] || '', layer, circle: null };
                dEntries.push(entry);
                layer.on('mouseover', () => { if (dRunning && entryStyle(entry) === STYLE_BASE) layer.setStyle(STYLE_HOVER); });
                layer.on('mouseout', () => paint(entry));
                layer.on('click', () => handleClick(entry));
            }
        }).addTo(dMap);

        buildLabels();
        fitUSA();
    }

    // Alaska and Hawaii are moved into insets (like a classroom map)
    // so the whole country fits on screen with no panning during the round.
    const INSETS = {
        alaska: { lng: c => -124.5 + (c + 170) * 0.33, lat: c => 20.6 + (c - 51) * 0.45 },
        hawaii: { lng: c => c + 50.5, lat: c => c + 3.8 }
    };
    function moveAlaskaAndHawaii(geo) {
        (geo.features || []).forEach(f => {
            const key = norm(f.properties && (f.properties.name || f.properties.NAME));
            const t = INSETS[key];
            if (!t || !f.geometry) return;
            let polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
            if (key === 'alaska') polys = polys.filter(poly => poly[0].every(pt => pt[0] < 0)); // drop the far Aleutians past 180°
            polys = polys.map(poly => poly.map(ring => ring.map(([x, y]) => [t.lng(x), t.lat(y)])));
            f.geometry = { type: 'MultiPolygon', coordinates: polys };
        });
    }
    const HI_CENTER = [20.6 + 3.8, -157.3 + 50.5];

    function fitUSA() {
        if (!dMap) return;
        dMap.invalidateSize();
        dMap.fitBounds([[17.0, -125.0], [49.4, -62.5]], { padding: [6, 6] });
    }

    function buildLabels() {
        dLabelLayer = L.layerGroup().addTo(dMap);
        const icon = (abbr, cls = '', size = [28, 20], anchor = [14, 10]) => L.divIcon({
            className: 'usa-state-label-icon',
            html: `<span class="usa-state-label ${cls}">${abbr}</span>`,
            iconSize: size, iconAnchor: anchor
        });
        const callout = (labelPos, target) => {
            L.polyline([labelPos, target], { color: '#94a3b8', weight: 1.2, opacity: 0.95, interactive: false }).addTo(dLabelLayer);
        };

        dEntries.forEach(entry => {
            const a = entry.abbr;
            if (!a) return;
            if (a === 'HI' || a === 'PR') {
                const center = a === 'HI' ? L.latLng(...HI_CENTER) : L.latLng(18.22, -66.45);
                // a big tap target that grows and shrinks with the map zoom
                entry.circle = L.circle(center, {
                    radius: a === 'HI' ? 330000 : 150000, color: '#38bdf8', weight: 1.8,
                    fillColor: '#1e293b', fillOpacity: 0.15, interactive: true, className: 'usa-island-circle'
                }).addTo(dLabelLayer);
                entry.circle.on('click', e => { L.DomEvent.stopPropagation(e); handleClick(entry); });
                L.marker(L.latLng(center.lat + (a === 'HI' ? -4.6 : 2.6), center.lng), { icon: icon(a), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(dLabelLayer);
                return;
            }
            if (NORTH_CALLOUTS[a]) {
                const c = NORTH_CALLOUTS[a];
                callout(c.label, c.target);
                L.marker(c.label, { icon: icon(a, '', [28, 20], [14, 20]), interactive: false, keyboard: false, zIndexOffset: 1200 }).addTo(dLabelLayer);
                return;
            }
            if (NE_CALLOUTS[a]) {
                const c = NE_CALLOUTS[a];
                callout(c.label, c.target);
                L.marker(c.label, { icon: icon(a, 'usa-callout-label', [40, 20], [0, 10]), interactive: false, keyboard: false, zIndexOffset: 1200 }).addTo(dLabelLayer);
                return;
            }
            const pos = LABEL_POS[a] ? L.latLng(...LABEL_POS[a]) : entry.layer.getBounds().getCenter();
            L.marker(pos, { icon: icon(a), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(dLabelLayer);
        });
    }

    // ---------- GAME FLOW ----------
    async function start() {
        ensureScreen();
        showScreen();
        $('daily-num').textContent = headerLabel();
        $('daily-prompt').textContent = 'Loading today\'s mission...';

        try {
            await loadQuestions();
            await ensureMap();
        } catch (err) {
            $('daily-prompt').textContent = 'ERROR: ' + err.message;
            return;
        }
        setTimeout(fitUSA, 80);

        dQuestion = todaysQuestion();
        dAnswers = new Set(dQuestion.answers.map(norm));
        buildFuelCells();

        const store = loadStore();
        const today = dayIndex();
        const saved = store.results[today];

        if (saved && saved.done) {
            // already launched today: show the result
            dFound = new Set(saved.found.map(norm));
            dWrong = new Set((saved.wrong || []).map(norm));
            dRunning = false;
            revealMissed();
            updateHud(saved.timeLeft || 0);
            $('daily-prompt').textContent = dQuestion.prompt;
            showResults(saved, store);
            return;
        }
        if (saved && saved.started && !saved.done) {
            // left mid-run (refresh / closed tab): count what was found
            dFound = new Set((saved.found || []).map(norm));
            dWrong = new Set((saved.wrong || []).map(norm));
            dSeq = saved.seq || '';
            dRunning = true;
            finishRun('abandoned', 0);
            return;
        }

        // fresh run: hide the question until launch
        dFound = new Set();
        dWrong = new Set();
        dRunning = false;
        paintAll();
        updateHud(ROUND_SECONDS);
        $('daily-prompt').textContent = '🔒 Today\'s mission is sealed until launch.';
        $('daily-intro-num').textContent = headerLabel();
        $('daily-intro-count').textContent = dAnswers.size;
        $('daily-intro-cat').textContent = (dQuestion.hard ? '🔥 HARD WEDNESDAY · ' : "Today's category: ") + (dQuestion.category || 'Mystery');
        $('daily-countdown-big').classList.add('hidden');
        $('daily-go-btn').classList.remove('hidden');
        $('daily-results').classList.add('hidden');
        $('daily-show-results').classList.add('hidden');
        $('daily-intro').classList.remove('hidden');
    }

    function beginCountdown() {
        beep('click');
        $('daily-go-btn').classList.add('hidden');
        const big = $('daily-countdown-big');
        big.classList.remove('hidden');
        let n = 3;
        big.textContent = n;
        beep('tick');
        clearInterval(dCountdownId);
        dCountdownId = setInterval(() => {
            n -= 1;
            if (n > 0) { big.textContent = n; beep('tick'); return; }
            clearInterval(dCountdownId);
            big.textContent = 'LIFTOFF!';
            beep('launch');
            setTimeout(() => { $('daily-intro').classList.add('hidden'); beginRun(); }, 450);
        }, 800);
    }

    function beginRun() {
        dRunning = true;
        dFound = new Set();
        dWrong = new Set();
        dSeq = '';
        dSelected = null;
        paintAll();
        $('daily-prompt').textContent = dQuestion.prompt;
        dEndTime = Date.now() + ROUND_SECONDS * 1000;

        const store = loadStore();
        store.results[dayIndex()] = { started: true, done: false, found: [], wrong: [], total: dAnswers.size, id: dQuestion.id };
        saveStore(store);

        updateHud(ROUND_SECONDS);
        clearInterval(dTimerId);
        dTimerId = setInterval(tick, 100);
    }

    function secondsLeft() { return Math.max(0, (dEndTime - Date.now()) / 1000); }

    function tick() {
        const left = secondsLeft();
        updateHud(left);
        if (left <= 0) finishRun('time', 0);
    }

    function updateHud(left) {
        const t = $('daily-timer');
        if (t) {
            const s = Math.ceil(left);
            t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
            t.classList.toggle('low', dRunning && s <= 10);
        }
        const c = $('daily-count');
        if (c) c.textContent = `${dFound.size} / ${dAnswers.size}`;
        const cells = document.querySelectorAll('#daily-fuel-cells .cell');
        cells.forEach((cell, i) => cell.classList.toggle('on', i < dFound.size));
    }

    function buildFuelCells() {
        const box = $('daily-fuel-cells');
        box.innerHTML = '';
        for (let i = 0; i < dAnswers.size; i++) {
            const d = document.createElement('div');
            d.className = 'cell';
            box.appendChild(d);
        }
    }

    function persistProgress() {
        const store = loadStore();
        const r = store.results[dayIndex()];
        if (r && !r.done) {
            r.found = [...dFound];
            r.wrong = [...dWrong];
            r.seq = dSeq;
            saveStore(store);
        }
    }

    function handleClick(entry) {
        if (!dRunning) return;
        const n = entry.norm;
        if (dFound.has(n) || dWrong.has(n)) return; // no double penalty, no double points

        // tap once to select (amber), tap the same state again to lock it in
        if (dSelected !== entry) {
            const prev = dSelected;
            dSelected = entry;
            if (prev) paint(prev);
            paint(entry);
            beep('click');
            return;
        }
        dSelected = null;

        if (dAnswers.has(n)) {
            dFound.add(n);
            dSeq += 'g';
            beep('good');
            paint(entry);
            flashState(entry, true);
            updateHud(secondsLeft());
            persistProgress();
            if (dFound.size >= dAnswers.size) finishRun('complete');
        } else {
            dWrong.add(n);
            dSeq += 'r';
            beep('bad');
            paint(entry);
            flashState(entry, false);
            dEndTime -= WRONG_PENALTY_SECONDS * 1000;
            showPenalty();
            persistProgress();
            tick();
        }
    }

    function flashState(entry, good) {
        const el = entry.layer.getElement && entry.layer.getElement();
        if (!el) return;
        el.classList.remove('daily-flash-good', 'daily-flash-bad');
        void el.getBoundingClientRect();
        el.classList.add(good ? 'daily-flash-good' : 'daily-flash-bad');
    }

    function showPenalty() {
        const p = $('daily-penalty');
        p.classList.remove('show');
        void p.offsetWidth;
        p.classList.add('show');
        const t = $('daily-timer');
        t.classList.remove('hit');
        void t.offsetWidth;
        t.classList.add('hit');
    }

    function revealMissed() {
        dEntries.forEach(e => { e.revealMissed = true; });
        paintAll();
    }

    function finishRun(reason, forcedLeft) {
        if (!dRunning) return;
        dRunning = false;
        dSelected = null;
        stopTimers();
        const left = forcedLeft !== undefined ? forcedLeft : secondsLeft();
        updateHud(left);

        const store = loadStore();
        const today = dayIndex();
        const result = {
            started: true, done: true,
            found: [...dFound], wrong: [...dWrong], seq: dSeq,
            total: dAnswers.size, timeLeft: Math.round(left),
            reason, id: dQuestion.id
        };
        const already = store.results[today] && store.results[today].done;
        store.results[today] = result;
        if (!already) {
            if (store.lastDay === today - 1) store.streak = (store.streak || 0) + 1;
            else if (store.lastDay !== today) store.streak = 1;
            store.lastDay = today;
            store.maxStreak = Math.max(store.maxStreak || 0, store.streak);
            store.played = (store.played || 0) + 1;
            if (isPerfect(result)) store.perfect = perfectCount(store, today) + 1;
        }
        // keep storage small: only the last 60 days
        Object.keys(store.results).forEach(k => { if (Number(k) < today - 60) delete store.results[k]; });
        saveStore(store);

        revealMissed();
        if (reason === 'complete') beep('launch');
        if (reason !== 'abandoned') setTimeout(() => showResults(result, store), 700);
        else if ($('daily-screen') && $('daily-screen').classList.contains('active')) showResults(result, store);
    }

    function stopTimers() {
        clearInterval(dTimerId); dTimerId = null;
        clearInterval(dCountdownId);
    }

    // ---------- RESULTS ----------
    // A perfect day = every answer found with zero wrong clicks.
    function isPerfect(r) {
        return !!r && r.done && r.found.length >= r.total && (r.wrong || []).length === 0;
    }
    function perfectCount(store, skipDay) {
        if (typeof store.perfect === 'number') return store.perfect;
        // first time: count the perfect days already saved
        return Object.keys(store.results).filter(k => Number(k) !== skipDay && isPerfect(store.results[k])).length;
    }

    // Click history as letters: g = correct click, r = wrong click, x = an answer that was missed
    function trackerLetters(r) {
        const found = r.found.length, wrong = (r.wrong || []).length;
        let seq = (r.seq && r.seq.length === found + wrong) ? r.seq : 'g'.repeat(found) + 'r'.repeat(wrong);
        return seq + 'x'.repeat(Math.max(0, r.total - found));
    }
    function trackerEmoji(r) {
        return trackerLetters(r).replace(/g/g, '🟩').replace(/r/g, '🟥').replace(/x/g, '⬛');
    }
    function trackerHTML(r) {
        const cls = { g: 'good', r: 'bad', x: 'missed' };
        return trackerLetters(r).split('').map(c => `<span class="sq ${cls[c]}"></span>`).join('');
    }

    function titleFor(result) {
        if (isPerfect(result)) return '⭐ PERFECT LAUNCH!';
        if (result.found.length >= result.total) return '🌙 MOON LANDING!';
        const pct = result.found.length / result.total;
        if (pct >= 0.7) return '🚀 IN ORBIT!';
        if (pct >= 0.4) return '🛰️ REACHED THE SKY';
        return '💨 SHORT ON FUEL';
    }

    function showResults(result, store) {
        const found = result.found.length;
        const total = result.total;
        const streak = currentStreak(store);
        $('daily-res-num').textContent = headerLabel();
        $('daily-res-title').textContent = titleFor(result);
        $('daily-res-score').textContent = `${found} / ${total}`;
        $('daily-res-fuel').innerHTML = trackerHTML(result);
        $('daily-res-stats').innerHTML =
            `<span>⏱️ ${result.timeLeft || 0}s left</span><span>💥 ${(result.wrong || []).length} wrong</span><span>🔥 ${streak}-day streak</span>`;

        const foundSet = new Set(result.found.map(norm));
        const missed = dQuestion.answers.filter(a => !foundSet.has(norm(a)));
        $('daily-res-missed').innerHTML = missed.length
            ? `<div class="daily-missed-title">You missed:</div><div class="daily-missed-list">${missed.map(m => `<span>${esc(m)}</span>`).join('')}</div>`
            : `<div class="daily-missed-title">You found every answer! 🎉</div>`;

        $('daily-results').classList.remove('hidden');
        $('daily-show-results').classList.add('hidden');

        clearInterval(showResults._t);
        const upd = () => { const el = $('daily-next'); if (el) el.textContent = 'Next launch window in ' + formatCountdown(msUntilNextWindow()); };
        upd();
        showResults._t = setInterval(upd, 1000);
    }

    function shareText() {
        const store = loadStore();
        const r = store.results[dayIndex()];
        if (!r || !r.done) return '';
        return `🚀 Geo-Spacerace Daily · ${dayLabel()}${isHardDay() ? ' 🔥 Hard Wednesday' : ''}\n` +
            `${trackerEmoji(r)} ${r.found.length}/${r.total}\n` +
            `⏱️ ${r.timeLeft || 0}s left · 💥 ${(r.wrong || []).length} · 🔥 ${currentStreak(store)}\n` +
            SITE_URL;
    }

    async function shareResult() {
        const text = shareText();
        if (!text) return;
        const body = text.replace(SITE_URL, '').trim();
        try {
            if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
                // the url field makes Messages / WhatsApp / etc. show it as a tappable link
                await navigator.share({ text: body, url: SITE_URL });
                return;
            }
        } catch (e) {
            if (e && e.name === 'AbortError') return;   // they closed the share menu
        }
        try {
            // copy both plain text and a version with a real clickable link
            const html = esc(body).replace(/\n/g, '<br>') + `<br><a href="${SITE_URL}">${SITE_URL}</a>`;
            if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
                await navigator.clipboard.write([new ClipboardItem({
                    'text/plain': new Blob([text], { type: 'text/plain' }),
                    'text/html': new Blob([html], { type: 'text/html' })
                })]);
            } else {
                await navigator.clipboard.writeText(text);
            }
            toast('Result copied! Paste it anywhere 📋');
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); toast('Result copied! Paste it anywhere 📋'); }
            catch (e2) { toast('Could not copy. Long-press to copy instead.'); }
            ta.remove();
        }
    }

    // ---------- HOME SCREEN INFO ----------
    function getHomeInfo() {
        const store = loadStore();
        const r = store.results[dayIndex()];
        return {
            number: windowNumber(),
            hard: isHardDay(),
            played: !!(r && r.done),
            found: r && r.done ? r.found.length : 0,
            total: r && r.done ? r.total : 0,
            streak: currentStreak(store),
            maxStreak: store.maxStreak || 0,
            perfect: perfectCount(store),
            nextIn: formatCountdown(msUntilNextWindow())
        };
    }

    return {
        start,
        getHomeInfo,
        getShareText: shareText,
        _debug: { dayIndex, windowNumber, todaysQuestion: () => dQuestion, click: name => { const e = dEntries.find(x => x.norm === norm(name)); if (e) { handleClick(e); handleClick(e); } },
        tap: name => { const e = dEntries.find(x => x.norm === norm(name)); if (e) handleClick(e); } }
    };
})();
