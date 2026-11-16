window.globalEliminationGame = (() => {
    // ============================================
    // GEO-SPACERACE: GLOBAL ELIMINATION MODE ENGINE
    // ============================================

    const GL_MAP_FILE = 'world-countries.geojson';
    const GL_MAP_VERSION = '7';   // bump when world-countries.geojson changes so browsers fetch the new map
    const GL_QUESTION_FILE = 'questions-global-elimination.json';

    const GL_NORMAL_LIVES = 3;
    const GL_HARD_LIVES = 1;
    const GL_QUESTION_TIME = 60;

    // ============================================
    // ONLINE CLOUD LEADERBOARD CONFIGURATION
    // ============================================
    const SUPABASE_URL = 'https://ccjlpsapefnnikbschpj.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_q1GbjeHYP7X3Z3DTz4Eftg_0L2toKwO';

    let supabaseClient = null;
    let currentUserId = null;
    let playerCallsign = localStorage.getItem('astro_geo_player_callsign') || '';

    if (window.supabase && SUPABASE_URL && SUPABASE_KEY) {
        try {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storageKey: 'sb-global-auth' } });
            initAuth();
        } catch (e) {
            console.warn('[Leaderboard] Supabase init warning:', e);
        }
    }

    async function initAuth() {
        if (!supabaseClient) return;
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
                currentUserId = session.user.id;
            } else {
                const { data, error } = await supabaseClient.auth.signInAnonymously();
                if (!error && data && data.user) {
                    currentUserId = data.user.id;
                }
            }
        } catch (err) {
            console.warn('Anonymous auth failed:', err);
        }
    }

    let glMap = null;
    let glLabelLayer = null;
    let glMicroLayer = null;
    let glEntries = [];
    let glQuestions = [];
    let glQuestionDeck = [];

    let eliminatedStates = new Set();
    let glCurrentQuestion = null;
    let glSelectedEntry = null;

    let glLives = GL_NORMAL_LIVES;
    let glHardMode = false;
    let glLocked = false;

    let glTimer = null;
    let glTimeLeft = GL_QUESTION_TIME;

    const GL_NORMAL_KEY = 'astro_geo_global_elim_highscore';
    const GL_HARD_KEY = 'astro_geo_global_elim_hard_highscore';
    const GL_LOCAL_LB_KEY = 'astro_geo_global_elim_leaderboard';

    let glNormalHighScore = Number(localStorage.getItem(GL_NORMAL_KEY)) || 0;
    let glHardHighScore = Number(localStorage.getItem(GL_HARD_KEY)) || 0;

    const GL_MILESTONE_STATES = [0, 40, 80, 120, 160, 197];
    const GL_MILESTONE_DATA = [
        { name: 'Earth Surface', miles: '0 mi', icon: '🌍' },
        { name: 'Low Orbit', miles: '45,940 mi', icon: '🛰️' },
        { name: 'High Orbit', miles: '96,470 mi', icon: '🔭' },
        { name: 'Deep Space', miles: '142,410 mi', icon: '🚀' },
        { name: 'Lunar Approach', miles: '192,940 mi', icon: '🌠' },
        { name: 'The Moon', miles: '238,900 mi', icon: '🌙' }
    ];
    let glOriginalMilestones = null;

    // ============================================
    // SYNTHESIZED SOUND ENGINE
    // ============================================
    let audioCtx = null;

    function getAudioContext() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) audioCtx = new AudioContext();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    function glSound(type) {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            const now = ctx.currentTime;

            if (type === 'select' || type === 'confirm') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.08);
            } 
            else if (type === 'blastOff') {
                [150, 225, 300].forEach((baseFreq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = i === 0 ? 'sine' : 'triangle';
                    osc.frequency.setValueAtTime(baseFreq, now);
                    osc.frequency.exponentialRampToValueAtTime(baseFreq * 2.5, now + 0.8);
                    gain.gain.setValueAtTime(0.01, now);
                    gain.gain.linearRampToValueAtTime(0.1, now + 0.3);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now);
                    osc.stop(now + 1.2);
                });
            }
            else if (type === 'correct') {
                [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    const noteTime = now + i * 0.08;
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, noteTime);
                    gain.gain.setValueAtTime(0, noteTime);
                    gain.gain.linearRampToValueAtTime(0.15, noteTime + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.25);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(noteTime);
                    osc.stop(noteTime + 0.25);
                });
            } 
            else if (type === 'win') {
                const notes = [
                    { f: 523.25, t: 0.0, d: 0.15 }, { f: 659.25, t: 0.15, d: 0.15 },
                    { f: 783.99, t: 0.3, d: 0.15 }, { f: 1046.50, t: 0.45, d: 0.3 },
                    { f: 783.99, t: 0.75, d: 0.15 }, { f: 1046.50, t: 0.9, d: 0.6 }
                ];
                notes.forEach(note => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    const noteTime = now + note.t;
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(note.f, noteTime);
                    gain.gain.setValueAtTime(0, noteTime);
                    gain.gain.linearRampToValueAtTime(0.18, noteTime + 0.03);
                    gain.gain.exponentialRampToValueAtTime(0.001, noteTime + note.d);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(noteTime);
                    osc.stop(noteTime + note.d);
                });
            }
            else if (type === 'wrong') {
                glPlayWrongSound();
            } 
            else if (type === 'gameover') {
                [440, 415.3, 369.99, 329.63].forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    const noteTime = now + i * 0.15;
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, noteTime);
                    gain.gain.setValueAtTime(0, noteTime);
                    gain.gain.linearRampToValueAtTime(0.18, noteTime + 0.03);
                    gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.3);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(noteTime);
                    osc.stop(noteTime + 0.3);
                });
            }
            else if (type === 'tick' || type === 'tickHigh') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(type === 'tickHigh' ? 880 : 440, now);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.08);
            }
        } catch (e) {
            // Audio policy fallback
        }
    }

    function glPlayWrongSound() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(130, now + 0.25);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.28);
    }

    function glGet(id) {
        return document.getElementById(id);
    }

    // ============================================
    // LEADERBOARD & STORAGE
    // ============================================
    let glBoard = null;
    function glLB() {
        if (!glBoard && window.GeoLeaderboard) {
            glBoard = window.GeoLeaderboard.create({
                table: 'global_leaderboard',
                localKey: GL_LOCAL_LB_KEY,
                unit: 'Countries',
                getClient: () => supabaseClient,
                getUserId: () => currentUserId,
                ensureAuth: initAuth,
                getTotal: glTotal
            });
        }
        return glBoard;
    }

    function glRecordHardModeClear() {
        const lb = glLB();
        if (lb) lb.recordMoon(eliminatedStates.size);
    }

    function glRecordHardModeScore() {
        const lb = glLB();
        if (lb && glHardMode) lb.recordScore(eliminatedStates.size);
    }

    async function glBuildLeaderboardHTML(full) {
        const lb = glLB();
        if (!lb) return '<p style="text-align: center; color: #94a3b8;">Leaderboard unavailable.</p>';
        return lb.buildHTML(!!full);
    }

    function escapeHtml(str) {
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // ============================================
    // MILESTONES & HUD
    // ============================================
    function glApplyMilestones() {
        const track = document.querySelector('.space-track');
        if (!track) return;
        let items = Array.from(track.querySelectorAll('.milestone'));

        if (!glOriginalMilestones) {
            glOriginalMilestones = items.map(el => {
                const pts = el.querySelector('.pts');
                const labelNode = el.childNodes[el.childNodes.length - 1];
                return {
                    score: el.getAttribute('data-score'),
                    label: pts ? pts.textContent : '',
                    text: labelNode ? labelNode.textContent.trim() : '',
                    outerHTML: el.outerHTML
                };
            });
        }

        while (track.querySelectorAll('.milestone').length < GL_MILESTONE_STATES.length) {
            const templateEl = track.querySelector('.milestone');
            if (templateEl) track.appendChild(templateEl.cloneNode(true));
            else break;
        }

        items = Array.from(track.querySelectorAll('.milestone'));
        items.forEach((el, i) => {
            const target = i === GL_MILESTONE_STATES.length - 1 ? glTotal() : GL_MILESTONE_STATES[i];
            const data = GL_MILESTONE_DATA[i];
            if (target === undefined || !data) return;

            el.style.display = 'flex';
            el.setAttribute('data-score', String(target));
            const pts = el.querySelector('.pts');
            if (pts) pts.textContent = `(${target})`;

            Array.from(el.childNodes).forEach(node => {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
                    node.textContent = ` ${data.icon} ${data.name} — ${data.miles}`;
                }
            });
        });
    }

    function glRestoreMilestones() {
        if (!glOriginalMilestones) return;
        const track = document.querySelector('.space-track');
        if (!track) return;
        track.innerHTML = glOriginalMilestones.map(m => m.outerHTML).join('');
        glOriginalMilestones = null;
    }

    function glSetRewardPanelVisible(visible) {
        const panel = document.querySelector('.right-sidebar');
        if (panel) panel.style.display = visible ? '' : 'none';
    }

    function glEnsureHomeButtonInGame() {
        let hud = document.querySelector('.hud');
        if (hud && !glGet('game-home-btn')) {
            const homeBtn = document.createElement('button');
            homeBtn.id = 'game-home-btn';
            homeBtn.className = 'space-btn secondary-btn';
            homeBtn.style.cssText = 'padding: 6px 12px; font-size: 0.8rem; margin: 0; width: auto; cursor: pointer;';
            homeBtn.textContent = '🏠 Home';
            homeBtn.onclick = () => {
                glStopTimer();
                const gameScreen = glGet('game-screen');
                const homeScreen = glGet('home-screen');
                if (gameScreen) {
                    gameScreen.classList.remove('active');
                    gameScreen.style.cssText = 'display: none !important;';
                }
                if (homeScreen) {
                    homeScreen.classList.remove('hidden');
                    homeScreen.style.cssText = 'display: flex !important;';
                }
                if (window.refreshHomeHighScore) window.refreshHomeHighScore();
            };
            hud.appendChild(homeBtn);
        }
    }

    // ============================================
    // COUNTRY MAPPING & MAP DRAWING (GLOBAL)
    // ============================================

    // Extra spellings accepted in the questions file
    const glNameAliases = {
        'usa': 'united states', 'unitedstatesofamerica': 'united states', 'us': 'united states', 'america': 'united states',
        'uk': 'united kingdom', 'greatbritain': 'united kingdom', 'britain': 'united kingdom', 'england': 'united kingdom',
        'czechrepublic': 'czechia', 'holysee': 'vatican city', 'vatican': 'vatican city',
        'macedonia': 'north macedonia', 'bosnia': 'bosnia and herzegovina', 'russianfederation': 'russia',
        'holland': 'netherlands', 'turkiye': 'turkey', 'ivorycoast': "côte d'ivoire", 'cotedivoire': "côte d'ivoire",
        'caboverde': 'cape verde', 'swaziland': 'eswatini', 'burma': 'myanmar', 'easttimor': 'timor-leste',
        'drc': 'democratic republic of the congo', 'drcongo': 'democratic republic of the congo',
        'congokinshasa': 'democratic republic of the congo', 'congobrazzaville': 'republic of the congo',
        'congo': 'republic of the congo', 'saotomeandprincipe': 'são tomé and príncipe', 'uae': 'united arab emirates',
        'federatedstatesofmicronesia': 'micronesia', 'northkorea': 'north korea', 'southkorea': 'south korea',
        'thegambia': 'gambia', 'thebahamas': 'bahamas', 'stkittsandnevis': 'saint kitts and nevis',
        'stlucia': 'saint lucia', 'stvincentandthegrenadines': 'saint vincent and the grenadines'
    };

    let glKnownNames = {};   // squashed name -> real lower-case name (filled from the map file)
    const glSquash = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

    function glTotal() {
        return glEntries.length || 197;
    }

    function glNormalizeState(value) {
        if (value === null || value === undefined) return '';
        const text = String(value).trim();
        const squashed = glSquash(text);
        if (glKnownNames[squashed]) return glKnownNames[squashed];
        if (glNameAliases[squashed]) return glNameAliases[squashed];
        return text.toLowerCase();
    }

    // ---------- map look ----------
    const GL_NORMAL = { color: '#38bdf8', weight: 0.8, fillColor: '#1e293b', fillOpacity: 0.95 };
    const GL_HOVER = { color: '#67e8f9', weight: 1.6, fillColor: '#334155', fillOpacity: 1 };
    const GL_ELIM = { color: '#0f172a', weight: 0.6, fillColor: '#090d16', fillOpacity: 0.3 };
    const GL_NEUTRAL = { color: '#334155', weight: 0.6, fillColor: '#0b1220', fillOpacity: 0.9, dashArray: '3 3' };

    // the map shows one whole world plus half a world on each side, so you never have to
    // scroll all the way across to reach the other side (Alaska <-> Russia, Chile <-> New Zealand)
    const GL_COPIES = [
        { shift: 0, keep: () => true },
        { shift: -360, keep: (minLng, maxLng) => maxLng > 85 },   // eastern half shown again on the far left
        { shift: 360, keep: (minLng, maxLng) => minLng < -85 }    // western half shown again on the far right
    ];
    const GL_VIEW_WEST = -270, GL_VIEW_EAST = 270;

    (function glInjectCss() {
        if (document.getElementById('gl-map-style')) return;
        const st = document.createElement('style');
        st.id = 'gl-map-style';
        st.textContent = `
            .gl-label-icon { background: transparent !important; border: 0 !important; pointer-events: none !important; }
            .gl-label {
                display: block; transform: translate(-50%, -50%); width: max-content; max-width: 120px;
                text-align: center; line-height: 1.05; white-space: normal;
                font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 11px; letter-spacing: 0.2px;
                color: #e2e8f0; text-shadow: 0 0 3px #020617, 0 0 3px #020617, 0 0 2px #020617;
            }
            .gl-label.big { font-size: 13px; letter-spacing: 0.5px; }
            .gl-label.small { max-width: 76px; }
            .gl-label.anchor-l { transform: translate(0, -50%); text-align: left; }
            .gl-label.anchor-r { transform: translate(-100%, -50%); text-align: right; }
            .gl-label.extra { font-size: 10px; color: #94a3b8; font-weight: 600; max-width: 78px; }
            #map.gl-map { background: #020617; }
        `;
        document.head.appendChild(st);
    })();

    function glLngRange(geometry) {
        let min = 999, max = -999;
        const walk = c => {
            if (typeof c[0] === 'number') { if (c[0] < min) min = c[0]; if (c[0] > max) max = c[0]; return; }
            c.forEach(walk);
        };
        if (geometry) walk(geometry.coordinates);
        return [min, max];
    }

    // island zones keep a dashed, see-through look in every state (normal, hover, picked, eliminated)
    function glOutlineStyle(s, kind) {
        if (kind !== 'zone') return { ...s };
        return { ...s, weight: Math.max(1.2, s.weight || 1), dashArray: '5 4', fillOpacity: (s.fillOpacity || 0) * 0.35 };
    }

    // one object per country that styles every copy of it (shapes, zones, squares) together
    function glMakeEntryFacade(entry) {
        return {
            setStyle(s) {
                entry.paths.forEach(p => p.setStyle(glOutlineStyle(s, p.glKind)));
            },
            getBounds() {
                const b = L.latLngBounds([]);
                entry.paths.forEach(p => b.extend(p.getBounds()));
                return b;
            },
            setLabelVisible() { glUpdateLabels(); }
        };
    }

    function glLabelIcon(text, cls) {
        return L.divIcon({ className: 'gl-label-icon', html: `<span class="gl-label ${cls}">${escapeHtml(text)}</span>`, iconSize: [0, 0] });
    }

    function glMinZoomForWidth() {
        // smallest zoom where the visible map is no wider than one world + two half worlds
        const w = (glMap && glMap.getSize().x) || window.innerWidth;
        return Math.max(0.5, Math.log2(w * 360 / ((GL_VIEW_EAST - GL_VIEW_WEST) * 256)));
    }

    function glFitWorld() {
        if (!glMap) return;
        const mz = glMinZoomForWidth();
        glMap.setMinZoom(Math.round(mz * 2) / 2);
        const world = L.latLngBounds([[-56, -170], [78, 190]]);
        const zWidth = glMap.getBoundsZoom(world, false);
        const zHeight = glMap.getBoundsZoom(L.latLngBounds([[-56, 0], [78, 20]]), false);
        const z = Math.min(Math.max(zWidth, zHeight), 4);
        glMap.setView(world.getCenter(), Math.floor(z * 2) / 2, { animate: false });
    }

    function glCreateMap(geoData) {
        if (!window.L) throw new Error('Leaflet not loaded.');
        if (glMap) return;
        glEntries = [];
        glKnownNames = {};
        glNeutralLabels = [];
        const mapEl = document.getElementById('map');
        if (mapEl) mapEl.classList.add('gl-map');

        glMap = L.map('map', {
            center: [20, 10], zoom: 2, minZoom: 1, maxZoom: 9,
            zoomControl: true, doubleClickZoom: false, zoomSnap: 0.5, zoomDelta: 1.5, wheelPxPerZoomLevel: 50, wheelDebounceTime: 30,
            attributionControl: false, worldCopyJump: false,
            maxBounds: [[-75, GL_VIEW_WEST], [85, GL_VIEW_EAST]], maxBoundsViscosity: 1.0,
            renderer: L.canvas({ padding: 0.15, tolerance: 4 })   // small padding = much less to redraw on sharp screens
        });
        glMicroLayer = L.layerGroup().addTo(glMap);
        glLabelLayer = L.layerGroup().addTo(glMap);
        window.__glMap = glMap;   // handy for testing in the browser console

        const byName = {};
        const entryFor = props => {
            if (!byName[props.name]) {
                const entry = {
                    name: props.name, abbr: props.abbr || '', lz: props.lz || 4, side: props.side || 'r',
                    paths: [], labels: []
                };
                entry.layer = glMakeEntryFacade(entry);
                byName[props.name] = entry;
                glEntries.push(entry);
                glKnownNames[glSquash(props.name)] = props.name.toLowerCase();
            }
            return byName[props.name];
        };

        const wire = (entry, layer) => {
            layer.on('mouseover', () => {
                if (!glLocked && !eliminatedStates.has(glNormalizeState(entry.name)) && glSelectedEntry !== entry) entry.layer.setStyle(GL_HOVER);
            });
            layer.on('mouseout', () => {
                if (!glLocked && !eliminatedStates.has(glNormalizeState(entry.name)) && glSelectedEntry !== entry) entry.layer.setStyle(GL_NORMAL);
            });
            layer.on('click', () => {
                if (!eliminatedStates.has(glNormalizeState(entry.name))) glHandleStateClick(entry);
            });
        };

        const inView = lng => lng >= GL_VIEW_WEST - 5 && lng <= GL_VIEW_EAST + 5;
        const ringRange = rings => glLngRange({ coordinates: rings });

        // a clickable outline: 'zone' = dashed area around island countries (drawn under everything),
        // 'box' = square for tiny land countries like Vatican City (drawn on top of its neighbours)
        const addOutline = (entry, ring, kind, shift) => {
            const lyr = L.polygon(ring.map(([x, y]) => [y, x + shift]), glOutlineStyle(GL_NORMAL, kind));
            lyr.glKind = kind;
            lyr.addTo(glMap);
            entry.paths.push(lyr);
            wire(entry, lyr);
        };

        // pass 1: island zones (bottom layer, so real coastlines on top still win the click)
        geoData.features.forEach(f => {
            const props = f.properties || {};
            if (!props.name || props.neutral || !props.zones) return;
            const entry = entryFor(props);
            props.zones.forEach(ring => {
                const [mn, mx] = ringRange([ring]);
                GL_COPIES.forEach(copy => { if (copy.keep(mn, mx)) addOutline(entry, ring, 'zone', copy.shift); });
            });
        });

        // pass 2: real country shapes + names
        geoData.features.forEach(f => {
            const props = f.properties || {};
            if (!props.name) return;
            const [minLng, maxLng] = glLngRange(f.geometry);

            GL_COPIES.forEach(copy => {
                const shift = copy.shift;
                if (f.geometry && copy.keep(minLng, maxLng)) {
                    const lyr = L.geoJSON(f, {
                        coordsToLatLng: c => L.latLng(c[1], c[0] + shift),
                        style: () => (props.neutral ? GL_NEUTRAL : GL_NORMAL),
                        interactive: !props.neutral, smoothFactor: 1.5
                    });
                    lyr.addTo(glMap);
                    if (props.neutral) {
                        if (props.label && inView(props.label[1] + shift)) {
                            glNeutralLabels.push(L.marker([props.label[0], props.label[1] + shift], { icon: glLabelIcon(props.text || props.name, 'extra'), interactive: false, keyboard: false }));
                        }
                        return;
                    }
                    const entry = entryFor(props);
                    lyr.eachLayer(l => { l.glKind = 'land'; entry.paths.push(l); wire(entry, l); });
                }
                if (props.neutral) return;
                const entry = entryFor(props);
                if (props.label && inView(props.label[1] + shift)) {
                    const cls = entry.lz <= 2 ? 'big' : (entry.lz >= 5 || entry.name.length > 16) ? 'small' : '';
                    const anchor = props.anchor ? ' anchor-' + props.anchor : '';
                    entry.labels.push(L.marker([props.label[0], props.label[1] + shift], { icon: glLabelIcon(entry.name, cls + anchor), interactive: false, keyboard: false, zIndexOffset: 1000 }));
                }
                (props.extra || []).forEach(([pos, text, minZoom]) => {
                    if (!inView(pos[1] + shift)) return;
                    const m = L.marker([pos[0], pos[1] + shift], { icon: glLabelIcon(text, 'extra'), interactive: false, keyboard: false, zIndexOffset: 1000 });
                    m.glMinZoom = minZoom || 4;
                    entry.labels.push(m);
                });
            });
        });

        // pass 3: micro-state squares on top
        geoData.features.forEach(f => {
            const props = f.properties || {};
            if (!props.name || props.neutral) return;
            let box = props.box;
            if (!box && props.micro && !props.zones) {
                // older map file: build the square here so tiny countries are never missing
                const [lat, lng] = props.micro, h = 0.2, w = 0.2 / Math.max(0.3, Math.cos(lat * Math.PI / 180));
                box = [[lng - w, lat - h], [lng + w, lat - h], [lng + w, lat + h], [lng - w, lat + h], [lng - w, lat - h]];
                console.warn('[Global] world-countries.geojson looks out of date - upload the newest copy.');
            }
            if (!box) return;
            const entry = entryFor(props);
            const [mn, mx] = ringRange([box]);
            GL_COPIES.forEach(copy => { if (copy.keep(mn, mx)) addOutline(entry, box, 'box', copy.shift); });
        });

        glMap.on('zoomend', glUpdateLabels);
        glMap.on('resize', () => {
            const mz = glMinZoomForWidth();
            glMap.setMinZoom(Math.round(mz * 2) / 2);
        });
        glFitWorld();
        glUpdateLabels();
    }

    // names appear as you zoom in (big countries first) and hide in hard mode / when eliminated
    let glNeutralLabels = [];
    function glUpdateLabels() {
        if (!glMap || !glLabelLayer) return;
        const z = glMap.getZoom();
        glNeutralLabels.forEach(m => {
            const show = !glHardMode && z >= 4;
            const has = glLabelLayer.hasLayer(m);
            if (show && !has) glLabelLayer.addLayer(m);
            else if (!show && has) glLabelLayer.removeLayer(m);
        });
        glEntries.forEach(entry => {
            const elim = eliminatedStates.has(glNormalizeState(entry.name));
            const base = !glHardMode && !elim;
            entry.labels.forEach(m => {
                // the biggest countries are named even when fully zoomed out on a phone
                // names show most of a zoom level earlier than their size alone would suggest
                const need = m.glMinZoom ? m.glMinZoom : Math.max(1.5, entry.lz - (entry.lz >= 5 ? 1 : 0.75));
                const show = base && z >= need;
                const has = glLabelLayer.hasLayer(m);
                if (show && !has) glLabelLayer.addLayer(m);
                else if (!show && has) glLabelLayer.removeLayer(m);
            });
        });
    }

    function glCreateStateLabels() {
        glUpdateLabels();
    }

    function glGetAnswers(question) {
        const list = question.rule?.list || [];
        return (Array.isArray(list) ? list : [list]).map(glNormalizeState).filter(Boolean);
    }

    function glPrepareQuestions(bank) {
        const rawQuestions = Array.isArray(bank) ? bank : bank.questions;
        if (!Array.isArray(rawQuestions) || !rawQuestions.length) throw new Error('No questions found.');
        return rawQuestions.map(question => {
            if (!question.prompt || !question.rule?.list) return null;
            const answers = glGetAnswers(question);
            const matchingEntries = glEntries.filter(entry => {
                const normName = glNormalizeState(entry.name);
                const normAbbr = glNormalizeState(entry.abbr);
                return answers.includes(normName) || answers.includes(normAbbr);
            });
            if (!matchingEntries.length) return null;
            return { ...question, matchingEntries };
        }).filter(Boolean);
    }

    function glGetHighScore() {
        return glHardMode ? glHardHighScore : glNormalHighScore;
    }

    function glStartGame() {
        const home = glGet('home-screen');
        const game = glGet('game-screen');
        if (home) { home.classList.add('hidden'); home.style.display = 'none'; }
        if (game) { game.classList.add('active'); game.style.display = 'flex'; }

        glSound('blastOff');
        glEnsureTimerElement();
        glEnsureHomeButtonInGame();
        glApplyMilestones();
        glSetRewardPanelVisible(false);

        if (!glMap) glInitializeGame();
        else if (glQuestions.length) {
            glResetGame();
            setTimeout(() => glMap.invalidateSize(), 150);
        } else glLoadQuestions();
    }

    async function glInitializeGame() {
        try {
            glSetPrompt('Loading world map...');
            const response = await fetch(GL_MAP_FILE + '?v=' + GL_MAP_VERSION);
            if (!response.ok) throw new Error('Could not load world-countries.geojson.');
            const geoData = await response.json();
            if (!Array.isArray(geoData.features)) throw new Error('Invalid GeoJSON.');
            glCreateMap(geoData);
            await glLoadQuestions();
            setTimeout(() => { if (glMap) { glMap.invalidateSize(); glFitWorld(); glUpdateLabels(); } }, 200);
        } catch (error) {
            glStopTimer();
            glSetPrompt('ERROR: ' + error.message);
        }
    }

    async function glLoadQuestions() {
        try {
            glSetPrompt('Loading Elimination questions...');
            const response = await fetch(GL_QUESTION_FILE + '?v=' + Date.now());
            if (!response.ok) throw new Error('Could not load questions.');
            const bank = await response.json();
            glQuestions = glPrepareQuestions(bank);
            glResetGame();
            setTimeout(() => { if (glMap) glMap.invalidateSize(); }, 150);
        } catch (error) {
            glStopTimer();
            glSetPrompt('ERROR: ' + error.message);
        }
    }

    function glShuffle(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    function glHasRemainingAnswer(question) {
        if (!question || !question.matchingEntries || !question.matchingEntries.length) return false;
        return question.matchingEntries.some(entry => !eliminatedStates.has(glNormalizeState(entry.name)));
    }

    function glResetDeck() {
        glQuestionDeck = glShuffle(glQuestions.filter(glHasRemainingAnswer));
    }

    function glPickNextQuestion() {
        while (glQuestionDeck.length) {
            const candidate = glQuestionDeck.pop();
            if (glHasRemainingAnswer(candidate)) return candidate;
        }
        glResetDeck();
        while (glQuestionDeck.length) {
            const candidate = glQuestionDeck.pop();
            if (glHasRemainingAnswer(candidate)) return candidate;
        }
        return null;
    }

    function glResetGame() {
        glStopTimer();
        glLives = glHardMode ? GL_HARD_LIVES : GL_NORMAL_LIVES;
        glLocked = false;
        glSelectedEntry = null;
        eliminatedStates.clear();
        glCreateStateLabels();
        glResetMapColors();
        glResetDeck();
        glUpdateStatus();
        glNextQuestion();
    }

    function glResetMapColors() {
        glEntries.forEach(entry => {
            const isElim = eliminatedStates.has(glNormalizeState(entry.name));
            entry.layer.setStyle(isElim ? GL_ELIM : GL_NORMAL);
        });
        glUpdateLabels();
    }

    function glNextQuestion() {
        glStopTimer();
        glLocked = false;
        glSelectedEntry = null;
        glResetMapColors();

        const nextQuestion = eliminatedStates.size >= glTotal() ? null : glPickNextQuestion();

        if (!nextQuestion) {
            glCurrentQuestion = null;
            glSound('win');
            if (glHardMode) {
                glRecordHardModeClear();
            }
            glShowModal('🎉 LUNAR LANDING SUCCESS!', `Incredible! Countries eliminated: ${eliminatedStates.size} / ${glTotal()} (238,900 Miles Reached!)`, true, true);
            return;
        }

        glCurrentQuestion = nextQuestion;
        glSetPrompt(glCurrentQuestion.prompt);
        glUpdateStatus();
        glStartTimer();
    }

    function glSetPrompt(message) {
        const el = glGet('prompt-text');
        if (el) el.textContent = message;
    }

    function glHandleStateClick(entry) {
        if (glLocked || !glCurrentQuestion) return;
        
        if (glSelectedEntry && glSelectedEntry !== entry) {
            const prevNorm = glNormalizeState(glSelectedEntry.name);
            if (!eliminatedStates.has(prevNorm)) {
                glSelectedEntry.layer.setStyle({ color: '#38bdf8', weight: 1.2, fillColor: '#1e293b', fillOpacity: 0.95 });
                if (glSelectedEntry.circleMarker) {
                    glSelectedEntry.circleMarker.setStyle({ color: '#38bdf8', weight: 1.8, fillColor: '#1e293b', fillOpacity: 0.1 });
                }
            }
        }

        if (glSelectedEntry !== entry) {
            glSelectedEntry = entry;
            glSound('select');
            entry.layer.setStyle({ color: '#f59e0b', weight: 2.5, fillColor: '#f59e0b', fillOpacity: 0.95 });
            if (entry.circleMarker) {
                entry.circleMarker.setStyle({ color: '#f59e0b', weight: 2.5, fillColor: '#f59e0b', fillOpacity: 0.5 });
            }
            glSetPrompt(glCurrentQuestion.prompt + ' — Click again to confirm elimination.');
            return;
        }
        glConfirmAnswer();
    }

    function glConfirmAnswer(autoLocked = false) {
        if (!glSelectedEntry || glLocked) return;
        glLocked = true;
        glStopTimer();
        glSound('confirm');

        const selected = glSelectedEntry;
        const selectedNameNorm = glNormalizeState(selected.name);
        const correct = glCurrentQuestion.matchingEntries.some(entry => glNormalizeState(entry.name) === selectedNameNorm);
        const autoNote = autoLocked ? 'Time ran out! ' : '';

        if (correct) {
            eliminatedStates.add(selectedNameNorm);
            
            selected.layer.setStyle({ color: '#22c55e', weight: 3, fillColor: '#22c55e', fillOpacity: 1 });
            if (selected.circleMarker) {
                selected.circleMarker.setStyle({ color: '#22c55e', weight: 3, fillColor: '#22c55e', fillOpacity: 0.8 });
            }
            
            glUpdateStatus();
            
            if (selected.labelGroup && glLabelLayer && glLabelLayer.hasLayer(selected.labelGroup)) {
                glLabelLayer.removeLayer(selected.labelGroup);
            }

            if (eliminatedStates.size >= glTotal()) {
                glSound('win');
                if (glHardMode) {
                    glRecordHardModeClear();
                }
                glShowModal('🎉 TOUCHDOWN ON THE MOON!', `${autoNote}${selected.name} was correct! You reached the Moon!`, true, true);
            } else {
                glSound('correct');
                glShowModal('⚡ Location Eliminated!', `${autoNote}${selected.name} was correct and is now ELIMINATED!`, false, true);
            }
        } else {
            glLives--;
            
            selected.layer.setStyle({ color: '#ef4444', weight: 3, fillColor: '#ef4444', fillOpacity: 1 });
            if (selected.circleMarker) {
                selected.circleMarker.setStyle({ color: '#ef4444', weight: 3, fillColor: '#ef4444', fillOpacity: 0.8 });
            }
            
            glUpdateStatus();

            if (glLives <= 0) {
                glSound('gameover');
                glRecordHardModeScore();
                glShowModal('MISSION FAILED', `${autoNote}${selected.name} was incorrect.<br>Total countries eliminated: ${eliminatedStates.size}`, true, false);
            } else {
                glSound('wrong');
                glShowModal('INCORRECT ANSWER', `${autoNote}${selected.name} was incorrect. Lives left: ${glLives}`, false, false);
            }
        }
    }

    function glEnsureTimerElement() {
        let container = glGet('question-timer');
        if (!container) {
            const livesDisplay = document.querySelector('.lives-display') || document.querySelector('#lives-val')?.parentNode;
            if (livesDisplay) {
                container = document.createElement('div');
                container.id = 'question-timer';
                container.style.cssText = 'display: inline-flex; align-items: center; margin-top: 6px; font-weight: bold; font-family: inherit; font-size: 13px; color: #38bdf8; background: rgba(15, 23, 42, 0.85); padding: 3px 10px; border: 1px solid #38bdf8; border-radius: 4px; width: fit-content;';
                container.innerHTML = '⏱️ Time: <span id="timer-val" style="margin-left: 4px;">60</span>s';
                livesDisplay.parentNode.insertBefore(container, livesDisplay.nextSibling);
            }
        }
    }

    function glUpdateTimer() {
        let value = glGet('timer-val');
        if (!value) { glEnsureTimerElement(); value = glGet('timer-val'); }
        const container = glGet('question-timer');
        if (value) value.textContent = glTimeLeft;
        if (container) container.classList.toggle('timer-warning', glTimeLeft <= 5);
    }

    function glStartTimer() {
        glStopTimer();
        glTimeLeft = GL_QUESTION_TIME;
        glUpdateTimer();
        glTimer = setInterval(() => {
            if (glLocked) { glStopTimer(); return; }
            glTimeLeft--;
            glUpdateTimer();
            if (glTimeLeft >= 1 && glTimeLeft <= 5) glSound(glTimeLeft <= 2 ? 'tickHigh' : 'tick');
            if (glTimeLeft <= 0) glTimeExpired();
        }, 1000);
    }

    function glStopTimer() {
        if (glTimer) { clearInterval(glTimer); glTimer = null; }
    }

    function glTimeExpired() {
        if (glLocked || !glCurrentQuestion) return;
        if (glSelectedEntry) { glConfirmAnswer(true); return; }
        glLocked = true;
        glStopTimer();
        glLives--;
        glUpdateStatus();
        if (glLives <= 0) {
            glSound('gameover');
            glRecordHardModeScore();
            glShowModal("TIME'S UP!", `Time expired.<br>Total countries eliminated: ${eliminatedStates.size}`, true, false);
        } else {
            glSound('wrong');
            glShowModal("TIME'S UP!", `Lost a life. Lives left: ${glLives}`, false, false);
        }
    }

    function glUpdateStatus() {
        const livesEl = glGet('lives-val');
        const scoreDisplay = glGet('score-display');
        if (livesEl) livesEl.textContent = '❤️'.repeat(Math.max(0, glLives));
        if (scoreDisplay) scoreDisplay.innerHTML = `Countries Eliminated: <span id="score-val">${eliminatedStates.size}</span> / ${glTotal()}`;

        const count = eliminatedStates.size;
        if (glHardMode) {
            if (count > glHardHighScore) { glHardHighScore = count; localStorage.setItem(GL_HARD_KEY, glHardHighScore); }
        } else {
            if (count > glNormalHighScore) { glNormalHighScore = count; localStorage.setItem(GL_NORMAL_KEY, glNormalHighScore); }
        }
        if (window.refreshHomeHighScore) window.refreshHomeHighScore();
        glUpdateRocket();
    }

    function glUpdateRocket() {
        const rocket = glGet('rocket-icon');
        const milestones = Array.from(document.querySelectorAll('.space-track .milestone'));
        let reached = null;
        milestones.forEach(milestone => {
            const target = Number(milestone.getAttribute('data-score'));
            const achieved = eliminatedStates.size >= target;
            milestone.classList.toggle('achieved', achieved);
            if (achieved) reached = milestone;
        });
        if (rocket && reached) {
            rocket.style.top = `${reached.offsetTop + reached.offsetHeight / 2 - rocket.offsetHeight / 2}px`;
        }
    }

    function glShowModal(title, description, gameOver, isCorrect) {
        glStopTimer();
        let modal = glGet('feedback-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'feedback-modal';
            document.body.appendChild(modal);
        }
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); display: flex !important; align-items: center; justify-content: center; z-index: 99999; pointer-events: auto;';
        modal.classList.remove('hidden');
        const borderColor = isCorrect ? '#22c55e' : '#ef4444';

        let correctAnswersText = '';
        if (!isCorrect && glCurrentQuestion && glCurrentQuestion.matchingEntries) {
            correctAnswersText = glCurrentQuestion.matchingEntries.map(e => e.name).join(', ');
        }
        const currentPromptText = glCurrentQuestion ? glCurrentQuestion.prompt : '';

        let answerSectionHTML = '';
        if (!isCorrect && correctAnswersText) {
            const disputeSubject = encodeURIComponent("Geo-Spacerace Question Dispute");
            const disputeBody = encodeURIComponent(`Hello Landon,\n\nI would like to report an issue with this question:\n"${currentPromptText}"\n\nReason/Source:`);

            answerSectionHTML = `
                <div style="margin: 12px 0; padding: 12px; background: rgba(56, 189, 248, 0.08); border: 1px dashed #38bdf8; border-radius: 6px; text-align: left;">
                    <div style="font-size: 13px; color: #38bdf8; font-family: 'Rajdhani', sans-serif; margin-bottom: 6px;"><strong>Target Question:</strong> ${escapeHtml(currentPromptText)}</div>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 6px;">
                        <button id="modal-show-ans-btn" style="background: transparent; color: #38bdf8; border: 1px solid #38bdf8; padding: 5px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; font-weight: bold;">SHOW ANSWERS</button>
                        <a href="mailto:GeoSpaceRace2026@gmail.com?subject=${disputeSubject}&body=${disputeBody}" target="_blank" style="background: transparent; color: #f87171; border: 1px solid #f87171; padding: 5px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; font-weight: bold; text-decoration: none; display: inline-block;">REPORT DISPUTE 🚩</a>
                    </div>
                    <div id="modal-revealed-ans" style="display: none; margin-top: 8px; font-size: 13px; color: #22c55e; font-weight: bold; font-family: 'Rajdhani', sans-serif;">Correct Answer(s): ${escapeHtml(correctAnswersText)}</div>
                </div>
            `;
        }

        const buttonText = gameOver ? 'Return to Home' : 'Next Question';

        modal.innerHTML = `
            <div style="background: #0f172a; border: 2px solid ${borderColor}; border-radius: 12px; padding: 25px; text-align: center; max-width: 440px; width: 90%; color: #f8fafc; font-family: inherit;">
                <h2 style="margin-top: 0; color: ${borderColor};">${title}</h2>
                <p style="margin: 10px 0; color: #cbd5e1; line-height: 1.4; font-size: 15px;">${description}</p>
                ${answerSectionHTML}
                <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
                    <button id="modal-action-btn" style="background: ${borderColor}; color: #0f172a; border: none; padding: 10px 24px; font-weight: bold; border-radius: 6px; cursor: pointer; font-size: 15px;">${buttonText}</button>
                </div>
            </div>
        `;

        const showAnsBtn = modal.querySelector('#modal-show-ans-btn');
        const revealedDiv = modal.querySelector('#modal-revealed-ans');
        if (showAnsBtn && revealedDiv) {
            showAnsBtn.onclick = () => {
                revealedDiv.style.display = 'block';
                showAnsBtn.style.display = 'none';
            };
        }

        const actionBtn = modal.querySelector('#modal-action-btn');
        if (actionBtn) {
            actionBtn.onclick = () => {
                modal.style.display = 'none';
                modal.classList.add('hidden');
                modal.style.pointerEvents = 'none';
                
                if (gameOver || glLives <= 0) {
                    const gameScreen = glGet('game-screen');
                    const homeScreen = glGet('home-screen');
                    if (gameScreen) { gameScreen.classList.remove('active'); gameScreen.style.cssText = 'display: none !important;'; }
                    if (homeScreen) { homeScreen.classList.remove('hidden'); homeScreen.style.cssText = 'display: flex !important;'; }
                    if (window.refreshHomeHighScore) window.refreshHomeHighScore();
                } else {
                    glNextQuestion();
                }
            };
        }
    }

    return {
        setHardMode(on) {
            glHardMode = !!on;
            if (window.refreshHomeHighScore) window.refreshHomeHighScore();
            if (glMap) {
                glCreateStateLabels();
                glResetMapColors();
            }
        },
        getHighScore() { return glGetHighScore(); },
        getLeaderboardHTML: glBuildLeaderboardHTML,
        start() { glStartGame(); },
        destroy() {
            glStopTimer();
            if (glMap) { glMap.remove(); glMap = null; }
            const mapEl = document.getElementById('map');
            if (mapEl) mapEl.classList.remove('gl-map');
            glLabelLayer = null;
            glMicroLayer = null;
            glEntries = [];
            glQuestions = [];
            eliminatedStates.clear();
            glRestoreMilestones();
            glSetRewardPanelVisible(true);
        }
    };
})();
