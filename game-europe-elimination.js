window.europeEliminationGame = (() => {
    // ============================================
    // GEO-SPACERACE: EUROPE ELIMINATION MODE ENGINE
    // ============================================

    const EU_MAP_FILE = 'europe-countries.geojson';
    const EU_QUESTION_FILE = 'questions-europe-elimination.json';

    const EU_NORMAL_LIVES = 3;
    const EU_HARD_LIVES = 1;
    const EU_QUESTION_TIME = 60;

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
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storageKey: 'sb-europe-auth' } });
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

    let euMap = null;
    let euLabelLayer = null;
    let euMicroLayer = null;
    let euEntries = [];
    let euQuestions = [];
    let euQuestionDeck = [];

    let eliminatedStates = new Set();
    let euCurrentQuestion = null;
    let euSelectedEntry = null;

    let euLives = EU_NORMAL_LIVES;
    let euHardMode = false;
    let euLocked = false;

    let euTimer = null;
    let euTimeLeft = EU_QUESTION_TIME;

    const EU_NORMAL_KEY = 'astro_geo_europe_elim_states_highscore';
    const EU_HARD_KEY = 'astro_geo_europe_elim_states_hard_highscore';
    const EU_LOCAL_LB_KEY = 'astro_geo_europe_elim_leaderboard';

    let euNormalHighScore = Number(localStorage.getItem(EU_NORMAL_KEY)) || 0;
    let euHardHighScore = Number(localStorage.getItem(EU_HARD_KEY)) || 0;

    const EU_MILESTONE_STATES = [0, 8, 17, 26, 36, 47];
    const EU_MILESTONE_DATA = [
        { name: 'Earth Surface', miles: '0 mi', icon: '🌍' },
        { name: 'Low Orbit', miles: '45,940 mi', icon: '🛰️' },
        { name: 'High Orbit', miles: '96,470 mi', icon: '🔭' },
        { name: 'Deep Space', miles: '142,410 mi', icon: '🚀' },
        { name: 'Lunar Approach', miles: '192,940 mi', icon: '🌠' },
        { name: 'The Moon', miles: '238,900 mi', icon: '🌙' }
    ];
    let euOriginalMilestones = null;

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

    function euSound(type) {
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
                euPlayWrongSound();
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

    function euPlayWrongSound() {
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

    function euGet(id) {
        return document.getElementById(id);
    }

    // ============================================
    // LEADERBOARD & STORAGE
    // ============================================
    let euBoard = null;
    function euLB() {
        if (!euBoard && window.GeoLeaderboard) {
            euBoard = window.GeoLeaderboard.create({
                table: 'europe_leaderboard',
                localKey: EU_LOCAL_LB_KEY,
                unit: 'Countries',
                getClient: () => supabaseClient,
                getUserId: () => currentUserId,
                ensureAuth: initAuth,
                getTotal: euTotal
            });
        }
        return euBoard;
    }

    function euRecordHardModeClear() {
        const lb = euLB();
        if (lb) lb.recordMoon(eliminatedStates.size);
    }

    function euRecordHardModeScore() {
        const lb = euLB();
        if (lb && euHardMode) lb.recordScore(eliminatedStates.size);
    }

    async function euBuildLeaderboardHTML(full) {
        const lb = euLB();
        if (!lb) return '<p style="text-align: center; color: #94a3b8;">Leaderboard unavailable.</p>';
        return lb.buildHTML(!!full);
    }

    function escapeHtml(str) {
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // ============================================
    // MILESTONES & HUD
    // ============================================
    function euApplyMilestones() {
        const track = document.querySelector('.space-track');
        if (!track) return;
        let items = Array.from(track.querySelectorAll('.milestone'));

        if (!euOriginalMilestones) {
            euOriginalMilestones = items.map(el => {
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

        while (track.querySelectorAll('.milestone').length < EU_MILESTONE_STATES.length) {
            const templateEl = track.querySelector('.milestone');
            if (templateEl) track.appendChild(templateEl.cloneNode(true));
            else break;
        }

        items = Array.from(track.querySelectorAll('.milestone'));
        items.forEach((el, i) => {
            const target = EU_MILESTONE_STATES[i];
            const data = EU_MILESTONE_DATA[i];
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

    function euRestoreMilestones() {
        if (!euOriginalMilestones) return;
        const track = document.querySelector('.space-track');
        if (!track) return;
        track.innerHTML = euOriginalMilestones.map(m => m.outerHTML).join('');
        euOriginalMilestones = null;
    }

    function euSetRewardPanelVisible(visible) {
        const panel = document.querySelector('.right-sidebar');
        if (panel) panel.style.display = visible ? '' : 'none';
    }

    function euEnsureHomeButtonInGame() {
        let hud = document.querySelector('.hud');
        if (hud && !euGet('game-home-btn')) {
            const homeBtn = document.createElement('button');
            homeBtn.id = 'game-home-btn';
            homeBtn.className = 'space-btn secondary-btn';
            homeBtn.style.cssText = 'padding: 6px 12px; font-size: 0.8rem; margin: 0; width: auto; cursor: pointer;';
            homeBtn.textContent = '🏠 Home';
            homeBtn.onclick = () => {
                euStopTimer();
                const gameScreen = euGet('game-screen');
                const homeScreen = euGet('home-screen');
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
    // STATE MAPPING & GAME LOGIC
    // ============================================
    const euStateAliases = {
        PT: 'Portugal',
        ES: 'Spain',
        AD: 'Andorra',
        FR: 'France',
        MC: 'Monaco',
        BE: 'Belgium',
        LU: 'Luxembourg',
        NL: 'Netherlands',
        DE: 'Germany',
        DK: 'Denmark',
        CH: 'Switzerland',
        LI: 'Liechtenstein',
        AT: 'Austria',
        IT: 'Italy',
        SM: 'San Marino',
        VA: 'Vatican City',
        MT: 'Malta',
        SI: 'Slovenia',
        HR: 'Croatia',
        BA: 'Bosnia and Herzegovina',
        RS: 'Serbia',
        ME: 'Montenegro',
        XK: 'Kosovo',
        AL: 'Albania',
        MK: 'North Macedonia',
        GR: 'Greece',
        BG: 'Bulgaria',
        RO: 'Romania',
        MD: 'Moldova',
        HU: 'Hungary',
        SK: 'Slovakia',
        CZ: 'Czechia',
        PL: 'Poland',
        LT: 'Lithuania',
        LV: 'Latvia',
        EE: 'Estonia',
        BY: 'Belarus',
        UA: 'Ukraine',
        RU: 'Russia',
        FI: 'Finland',
        SE: 'Sweden',
        NO: 'Norway',
        IS: 'Iceland',
        IE: 'Ireland',
        GB: 'United Kingdom',
        CY: 'Cyprus',
        TR: 'Turkey'
    };

    // Extra spellings accepted in the questions file
    const euNameAliases = {
        'uk': 'united kingdom', 'greatbritain': 'united kingdom', 'britain': 'united kingdom',
        'czechrepublic': 'czechia', 'holysee': 'vatican city', 'vatican': 'vatican city',
        'macedonia': 'north macedonia', 'bosnia': 'bosnia and herzegovina',
        'russianfederation': 'russia', 'holland': 'netherlands', 'turkiye': 'turkey'
    };

    function euTotal() {
        return euEntries.length || 47;
    }

    function euNormalizeState(value) {
        if (value === null || value === undefined) return '';
        const text = String(value).trim();
        const upper = text.toUpperCase();
        if (text.length === 2 && euStateAliases[upper]) return euStateAliases[upper].toLowerCase();
        const cleaned = text.toLowerCase().replace(/[^a-z]/g, '');
        if (euNameAliases[cleaned]) return euNameAliases[cleaned];
        for (const key in euStateAliases) {
            const fullName = euStateAliases[key].toLowerCase();
            if (fullName.replace(/[^a-z]/g, '') === cleaned) return fullName;
        }
        return text.toLowerCase();
    }

    function euGetStateName(properties) {
        return properties.name || properties.NAME || properties.ADMIN || properties.country || '';
    }

    function euGetStateAbbreviation(properties) {
        return properties.abbr || properties.ISO_A2 || properties.iso2 || properties.code || '';
    }

    function euAbbreviationFromName(name) {
        const normalized = euNormalizeState(name);
        for (const abbreviation in euStateAliases) {
            if (euStateAliases[abbreviation].toLowerCase() === normalized) return abbreviation;
        }
        return '';
    }

    // Micro nations are drawn as small fixed-size SQUARES (like a map-quiz), placed on their
    // real location. The label is part of the same marker, so it always stays attached.
    const euMicroNations = {
        AD: { center: [42.54, 1.58],  side: 'l' },
        MC: { center: [43.74, 7.42],  side: 'r' },
        LI: { center: [47.16, 9.55],  side: 'r' },
        SM: { center: [43.94, 12.46], side: 'r' },
        VA: { center: [41.90, 12.45], side: 'l' },
        MT: { center: [35.90, 14.40], side: 'r' }
    };

    // one-time CSS for the squares (injected here so no extra CSS file edit is needed)
    (function euInjectMicroCss() {
        if (document.getElementById('eu-micro-style')) return;
        const st = document.createElement('style');
        st.id = 'eu-micro-style';
        st.textContent = `
            .eu-micro-icon { background: transparent !important; border: 0 !important; cursor: pointer; }
            .eu-micro-sq {
                position: absolute; left: 50%; top: 50%;
                width: 26px; height: 20px; margin: -10px 0 0 -13px;
                box-sizing: border-box; border: 2px solid #38bdf8;
                background: #1e293b; border-radius: 3px;
            }
            .eu-micro-lbl {
                position: absolute; left: 50%; top: 50%;
                width: 26px; height: 20px; margin: -10px 0 0 -13px;
                font-size: 9px; letter-spacing: 0; z-index: 2;
            }
        `;
        document.head.appendChild(st);
    })();

    function euMakeSquare(abbr, micro) {
        const center = L.latLng(...micro.center);
        const marker = L.marker(center, {
            icon: L.divIcon({
                className: 'eu-micro-icon',
                html: `<div class="eu-micro-sq"></div><span class="usa-state-label eu-micro-lbl">${abbr}</span>`,
                iconSize: [34, 34], iconAnchor: [17, 17]
            }),
            keyboard: false, zIndexOffset: 900
        }).addTo(euMicroLayer);

        let st = { color: '#38bdf8', weight: 1.2, fillColor: '#1e293b', fillOpacity: 0.95 };
        let labelOn = true;
        const apply = () => {
            const el = marker.getElement();
            if (!el) return;
            const sq = el.querySelector('.eu-micro-sq');
            const lb = el.querySelector('.eu-micro-lbl');
            if (sq) {
                sq.style.borderColor = st.color;
                sq.style.background = st.fillColor;
                sq.style.opacity = st.fillOpacity;
                sq.style.borderWidth = (st.weight >= 2.5 ? 3 : 2) + 'px';
            }
            if (lb) lb.style.display = labelOn ? '' : 'none';
        };
        marker.on('add', apply);
        apply();

        // same small API the game uses on normal country layers
        return {
            marker,
            setStyle(s) { st = Object.assign({}, st, s); apply(); },
            setLabelVisible(v) { labelOn = !!v; apply(); },
            on(evt, fn) { marker.on(evt, fn); return this; },
            getBounds() { return L.latLngBounds([center, center]); }
        };
    }

    const euLabelPositionOverrides = {
        NO: [62.0, 9.0], SE: [62.5, 16.0], FR: [46.6, 2.4], IT: [41.3, 15.0],
        GB: [53.0, -1.8], FI: [63.5, 26.5], RU: [58.0, 42.0], HR: [45.3, 16.0],
        DK: [56.0, 9.5], GR: [39.4, 22.2], ES: [40.2, -3.5], TR: [39.2, 33.5],
        PT: [39.5, -8.0], UA: [49.0, 32.0], RO: [45.9, 25.0], BA: [44.2, 17.8],
        RS: [44.2, 20.8], ME: [42.75, 19.2], XK: [42.55, 21.0], AL: [41.1, 20.1],
        MK: [41.6, 21.7], SI: [46.1, 14.8], NL: [52.4, 5.6], BE: [50.6, 4.6],
        CH: [46.75, 7.6], EE: [58.7, 25.5], LV: [56.9, 25.0], LT: [55.4, 23.9],
        MD: [47.2, 28.5], CY: [35.1, 33.3], IS: [64.9, -18.5], IE: [53.3, -8.0],
        LU: [49.8, 6.1], DE: [51.2, 10.3], PL: [52.0, 19.2], AT: [47.5, 14.0], CZ: [49.8, 15.5],
        SK: [48.7, 19.5], HU: [47.2, 19.3], BG: [42.8, 25.3], BY: [53.6, 28.0]
    };

    function euCreateStateLabels() {
        if (!euMap) return;
        if (euLabelLayer) {
            euLabelLayer.clearLayers();
        } else {
            euLabelLayer = L.layerGroup().addTo(euMap);
        }
        euEntries.forEach(e => { e.labelGroup = null; });

        const labelIcon = abbreviation => L.divIcon({
            className: 'usa-state-label-icon',
            html: `<span class="usa-state-label">${abbreviation}</span>`,
            iconSize: [28, 20], iconAnchor: [14, 10]
        });

        if (!euHardMode) {
            euEntries.forEach(entry => {
                const key = (entry.abbr || euAbbreviationFromName(entry.name)).toUpperCase();
                if (!key || euMicroNations[key]) return;
                const pos = euLabelPositionOverrides[key]
                    ? L.latLng(...euLabelPositionOverrides[key])
                    : entry.layer.getBounds().getCenter();
                const group = L.layerGroup();
                L.marker(pos, { icon: labelIcon(key), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(group);
                entry.labelGroup = group;
                group.addTo(euLabelLayer);
            });
        }
    }

    function euGetAnswers(question) {
        const list = question.rule?.list || [];
        return (Array.isArray(list) ? list : [list]).map(euNormalizeState).filter(Boolean);
    }

    function euPrepareQuestions(bank) {
        const rawQuestions = Array.isArray(bank) ? bank : bank.questions;
        if (!Array.isArray(rawQuestions) || !rawQuestions.length) throw new Error('No questions found.');
        return rawQuestions.map(question => {
            if (!question.prompt || !question.rule?.list) return null;
            const answers = euGetAnswers(question);
            const matchingEntries = euEntries.filter(entry => {
                const normName = euNormalizeState(entry.name);
                const normAbbr = euNormalizeState(entry.abbr);
                return answers.includes(normName) || answers.includes(normAbbr);
            });
            if (!matchingEntries.length) return null;
            return { ...question, matchingEntries };
        }).filter(Boolean);
    }

    function euGetHighScore() {
        return euHardMode ? euHardHighScore : euNormalHighScore;
    }

    function euStartGame() {
        const home = euGet('home-screen');
        const game = euGet('game-screen');
        if (home) { home.classList.add('hidden'); home.style.display = 'none'; }
        if (game) { game.classList.add('active'); game.style.display = 'flex'; }

        euSound('blastOff');
        euEnsureTimerElement();
        euEnsureHomeButtonInGame();
        euApplyMilestones();
        euSetRewardPanelVisible(false);

        if (!euMap) euInitializeGame();
        else if (euQuestions.length) {
            euResetGame();
            setTimeout(() => euMap.invalidateSize(), 150);
        } else euLoadQuestions();
    }

    async function euInitializeGame() {
        try {
            euSetPrompt('Loading Elimination Europe map...');
            const response = await fetch(EU_MAP_FILE);
            if (!response.ok) throw new Error('Could not load europe-countries.geojson.');
            const geoData = await response.json();
            if (!Array.isArray(geoData.features)) throw new Error('Invalid GeoJSON.');
            euCreateMap(geoData);
            await euLoadQuestions();
        } catch (error) {
            euStopTimer();
            euSetPrompt('ERROR: ' + error.message);
        }
    }

    function euCreateMap(geoData) {
        if (!window.L) throw new Error('Leaflet not loaded.');
        if (euMap) return;
        euEntries = [];
        // Double-click zoom disabled: double-clicking confirms an answer instead of zooming
        euMap = L.map('map', { center: [54.5, 14], zoom: 4, minZoom: 3, maxZoom: 11, zoomControl: true, doubleClickZoom: false, zoomSnap: 0.5, attributionControl: false });
        euMicroLayer = L.layerGroup().addTo(euMap);
        const normalStyle = { color: '#38bdf8', weight: 1.2, fillColor: '#1e293b', fillOpacity: 0.95 };

        const wire = (entry, layer) => {
            layer.on('mouseover', () => {
                const norm = euNormalizeState(entry.name);
                if (!euLocked && !eliminatedStates.has(norm) && euSelectedEntry !== entry) {
                    layer.setStyle({ color: '#67e8f9', weight: 2, fillColor: '#334155', fillOpacity: 1 });
                }
            });
            layer.on('mouseout', () => {
                const norm = euNormalizeState(entry.name);
                if (!euLocked && !eliminatedStates.has(norm) && euSelectedEntry !== entry) {
                    layer.setStyle(normalStyle);
                }
            });
            layer.on('click', () => {
                const norm = euNormalizeState(entry.name);
                if (!eliminatedStates.has(norm)) euHandleStateClick(entry);
            });
        };
        const abbrOf = f => String(euGetStateAbbreviation(f.properties || {})).toUpperCase();

        // normal countries (real borders)
        L.geoJSON(geoData, {
            style: () => normalStyle,
            filter: f => !euMicroNations[abbrOf(f)],
            onEachFeature: (feature, layer) => {
                const properties = feature.properties || {};
                const entry = { name: euGetStateName(properties), abbr: euGetStateAbbreviation(properties), layer };
                if (!entry.name) return;
                euEntries.push(entry);
                wire(entry, layer);
            }
        }).addTo(euMap);

        // micro nations (small squares)
        geoData.features.forEach(f => {
            const abbr = abbrOf(f);
            const micro = euMicroNations[abbr];
            const name = euGetStateName(f.properties || {});
            if (!micro || !name) return;
            const entry = { name, abbr, layer: null };
            entry.layer = euMakeSquare(abbr, micro);
            euEntries.push(entry);
            wire(entry, entry.layer);
        });

        euCreateStateLabels();
    }

    async function euLoadQuestions() {
        try {
            euSetPrompt('Loading Elimination questions...');
            const response = await fetch(EU_QUESTION_FILE + '?v=' + Date.now());
            if (!response.ok) throw new Error('Could not load questions.');
            const bank = await response.json();
            euQuestions = euPrepareQuestions(bank);
            euResetGame();
            setTimeout(() => { if (euMap) euMap.invalidateSize(); }, 150);
        } catch (error) {
            euStopTimer();
            euSetPrompt('ERROR: ' + error.message);
        }
    }

    function euShuffle(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    function euHasRemainingAnswer(question) {
        if (!question || !question.matchingEntries || !question.matchingEntries.length) return false;
        return question.matchingEntries.some(entry => !eliminatedStates.has(euNormalizeState(entry.name)));
    }

    function euResetDeck() {
        euQuestionDeck = euShuffle(euQuestions.filter(euHasRemainingAnswer));
    }

    function euPickNextQuestion() {
        while (euQuestionDeck.length) {
            const candidate = euQuestionDeck.pop();
            if (euHasRemainingAnswer(candidate)) return candidate;
        }
        euResetDeck();
        while (euQuestionDeck.length) {
            const candidate = euQuestionDeck.pop();
            if (euHasRemainingAnswer(candidate)) return candidate;
        }
        return null;
    }

    function euResetGame() {
        euStopTimer();
        euLives = euHardMode ? EU_HARD_LIVES : EU_NORMAL_LIVES;
        euLocked = false;
        euSelectedEntry = null;
        eliminatedStates.clear();
        euCreateStateLabels();
        euResetMapColors();
        euResetDeck();
        euUpdateStatus();
        euNextQuestion();
    }

    function euResetMapColors() {
        if (euMap && euEntries.length && !euLabelLayer) euCreateStateLabels();
        euEntries.forEach(entry => {
            const norm = euNormalizeState(entry.name);
            const isElim = eliminatedStates.has(norm);
            
            entry.layer.setStyle({
                color: isElim ? '#0f172a' : '#38bdf8',
                weight: isElim ? 1 : 1.2,
                fillColor: isElim ? '#090d16' : '#1e293b',
                fillOpacity: isElim ? 0.3 : 0.95
            });

            if (entry.circleMarker) {
                entry.circleMarker.setStyle({
                    color: isElim ? '#0f172a' : '#38bdf8',
                    weight: isElim ? 1 : 1.8,
                    fillColor: isElim ? '#090d16' : '#1e293b',
                    fillOpacity: isElim ? 0.05 : 0.1
                });
            }

            if (entry.layer.setLabelVisible) entry.layer.setLabelVisible(!isElim && !euHardMode);

            if (entry.labelGroup) {
                if (isElim || euHardMode) {
                    if (euLabelLayer && euLabelLayer.hasLayer(entry.labelGroup)) {
                        euLabelLayer.removeLayer(entry.labelGroup);
                    }
                } else {
                    if (euLabelLayer && !euLabelLayer.hasLayer(entry.labelGroup)) {
                        euLabelLayer.addLayer(entry.labelGroup);
                    }
                }
            }
        });
    }

    function euNextQuestion() {
        euStopTimer();
        euLocked = false;
        euSelectedEntry = null;
        euResetMapColors();

        const nextQuestion = eliminatedStates.size >= euTotal() ? null : euPickNextQuestion();

        if (!nextQuestion) {
            euCurrentQuestion = null;
            euSound('win');
            if (euHardMode) {
                euRecordHardModeClear();
            }
            euShowModal('🎉 LUNAR LANDING SUCCESS!', `Incredible! Countries eliminated: ${eliminatedStates.size} / ${euTotal()} (238,900 Miles Reached!)`, true, true);
            return;
        }

        euCurrentQuestion = nextQuestion;
        euSetPrompt(euCurrentQuestion.prompt);
        euUpdateStatus();
        euStartTimer();
    }

    function euSetPrompt(message) {
        const el = euGet('prompt-text');
        if (el) el.textContent = message;
    }

    function euHandleStateClick(entry) {
        if (euLocked || !euCurrentQuestion) return;
        
        if (euSelectedEntry && euSelectedEntry !== entry) {
            const prevNorm = euNormalizeState(euSelectedEntry.name);
            if (!eliminatedStates.has(prevNorm)) {
                euSelectedEntry.layer.setStyle({ color: '#38bdf8', weight: 1.2, fillColor: '#1e293b', fillOpacity: 0.95 });
                if (euSelectedEntry.circleMarker) {
                    euSelectedEntry.circleMarker.setStyle({ color: '#38bdf8', weight: 1.8, fillColor: '#1e293b', fillOpacity: 0.1 });
                }
            }
        }

        if (euSelectedEntry !== entry) {
            euSelectedEntry = entry;
            euSound('select');
            entry.layer.setStyle({ color: '#f59e0b', weight: 2.5, fillColor: '#f59e0b', fillOpacity: 0.95 });
            if (entry.circleMarker) {
                entry.circleMarker.setStyle({ color: '#f59e0b', weight: 2.5, fillColor: '#f59e0b', fillOpacity: 0.5 });
            }
            euSetPrompt(euCurrentQuestion.prompt + ' — Click again to confirm elimination.');
            return;
        }
        euConfirmAnswer();
    }

    function euConfirmAnswer(autoLocked = false) {
        if (!euSelectedEntry || euLocked) return;
        euLocked = true;
        euStopTimer();
        euSound('confirm');

        const selected = euSelectedEntry;
        const selectedNameNorm = euNormalizeState(selected.name);
        const correct = euCurrentQuestion.matchingEntries.some(entry => euNormalizeState(entry.name) === selectedNameNorm);
        const autoNote = autoLocked ? 'Time ran out! ' : '';

        if (correct) {
            eliminatedStates.add(selectedNameNorm);
            
            selected.layer.setStyle({ color: '#22c55e', weight: 3, fillColor: '#22c55e', fillOpacity: 1 });
            if (selected.circleMarker) {
                selected.circleMarker.setStyle({ color: '#22c55e', weight: 3, fillColor: '#22c55e', fillOpacity: 0.8 });
            }
            
            euUpdateStatus();
            
            if (selected.labelGroup && euLabelLayer && euLabelLayer.hasLayer(selected.labelGroup)) {
                euLabelLayer.removeLayer(selected.labelGroup);
            }

            if (eliminatedStates.size >= euTotal()) {
                euSound('win');
                if (euHardMode) {
                    euRecordHardModeClear();
                }
                euShowModal('🎉 TOUCHDOWN ON THE MOON!', `${autoNote}${selected.name} was correct! You reached the Moon!`, true, true);
            } else {
                euSound('correct');
                euShowModal('⚡ Location Eliminated!', `${autoNote}${selected.name} was correct and is now ELIMINATED!`, false, true);
            }
        } else {
            euLives--;
            
            selected.layer.setStyle({ color: '#ef4444', weight: 3, fillColor: '#ef4444', fillOpacity: 1 });
            if (selected.circleMarker) {
                selected.circleMarker.setStyle({ color: '#ef4444', weight: 3, fillColor: '#ef4444', fillOpacity: 0.8 });
            }
            
            euUpdateStatus();

            if (euLives <= 0) {
                euSound('gameover');
                euRecordHardModeScore();
                euShowModal('MISSION FAILED', `${autoNote}${selected.name} was incorrect.<br>Total countries eliminated: ${eliminatedStates.size}`, true, false);
            } else {
                euSound('wrong');
                euShowModal('INCORRECT ANSWER', `${autoNote}${selected.name} was incorrect. Lives left: ${euLives}`, false, false);
            }
        }
    }

    function euEnsureTimerElement() {
        let container = euGet('question-timer');
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

    function euUpdateTimer() {
        let value = euGet('timer-val');
        if (!value) { euEnsureTimerElement(); value = euGet('timer-val'); }
        const container = euGet('question-timer');
        if (value) value.textContent = euTimeLeft;
        if (container) container.classList.toggle('timer-warning', euTimeLeft <= 5);
    }

    function euStartTimer() {
        euStopTimer();
        euTimeLeft = EU_QUESTION_TIME;
        euUpdateTimer();
        euTimer = setInterval(() => {
            if (euLocked) { euStopTimer(); return; }
            euTimeLeft--;
            euUpdateTimer();
            if (euTimeLeft >= 1 && euTimeLeft <= 5) euSound(euTimeLeft <= 2 ? 'tickHigh' : 'tick');
            if (euTimeLeft <= 0) euTimeExpired();
        }, 1000);
    }

    function euStopTimer() {
        if (euTimer) { clearInterval(euTimer); euTimer = null; }
    }

    function euTimeExpired() {
        if (euLocked || !euCurrentQuestion) return;
        if (euSelectedEntry) { euConfirmAnswer(true); return; }
        euLocked = true;
        euStopTimer();
        euLives--;
        euUpdateStatus();
        if (euLives <= 0) {
            euSound('gameover');
            euRecordHardModeScore();
            euShowModal("TIME'S UP!", `Time expired.<br>Total countries eliminated: ${eliminatedStates.size}`, true, false);
        } else {
            euSound('wrong');
            euShowModal("TIME'S UP!", `Lost a life. Lives left: ${euLives}`, false, false);
        }
    }

    function euUpdateStatus() {
        const livesEl = euGet('lives-val');
        const scoreDisplay = euGet('score-display');
        if (livesEl) livesEl.textContent = '❤️'.repeat(Math.max(0, euLives));
        if (scoreDisplay) scoreDisplay.innerHTML = `Countries Eliminated: <span id="score-val">${eliminatedStates.size}</span> / ${euTotal()}`;

        const count = eliminatedStates.size;
        if (euHardMode) {
            if (count > euHardHighScore) { euHardHighScore = count; localStorage.setItem(EU_HARD_KEY, euHardHighScore); }
        } else {
            if (count > euNormalHighScore) { euNormalHighScore = count; localStorage.setItem(EU_NORMAL_KEY, euNormalHighScore); }
        }
        if (window.refreshHomeHighScore) window.refreshHomeHighScore();
        euUpdateRocket();
    }

    function euUpdateRocket() {
        const rocket = euGet('rocket-icon');
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

    function euShowModal(title, description, gameOver, isCorrect) {
        euStopTimer();
        let modal = euGet('feedback-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'feedback-modal';
            document.body.appendChild(modal);
        }
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); display: flex !important; align-items: center; justify-content: center; z-index: 99999; pointer-events: auto;';
        modal.classList.remove('hidden');
        const borderColor = isCorrect ? '#22c55e' : '#ef4444';

        let correctAnswersText = '';
        if (!isCorrect && euCurrentQuestion && euCurrentQuestion.matchingEntries) {
            correctAnswersText = euCurrentQuestion.matchingEntries.map(e => e.name).join(', ');
        }
        const currentPromptText = euCurrentQuestion ? euCurrentQuestion.prompt : '';

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
                
                if (gameOver || euLives <= 0) {
                    const gameScreen = euGet('game-screen');
                    const homeScreen = euGet('home-screen');
                    if (gameScreen) { gameScreen.classList.remove('active'); gameScreen.style.cssText = 'display: none !important;'; }
                    if (homeScreen) { homeScreen.classList.remove('hidden'); homeScreen.style.cssText = 'display: flex !important;'; }
                    if (window.refreshHomeHighScore) window.refreshHomeHighScore();
                } else {
                    euNextQuestion();
                }
            };
        }
    }

    return {
        setHardMode(on) {
            euHardMode = !!on;
            if (window.refreshHomeHighScore) window.refreshHomeHighScore();
            if (euMap) {
                euCreateStateLabels();
                euResetMapColors();
            }
        },
        getHighScore() { return euGetHighScore(); },
        getLeaderboardHTML: euBuildLeaderboardHTML,
        start() { euStartGame(); },
        destroy() {
            euStopTimer();
            if (euMap) { euMap.remove(); euMap = null; }
            euLabelLayer = null;
            euMicroLayer = null;
            euEntries = [];
            euQuestions = [];
            eliminatedStates.clear();
            euRestoreMilestones();
            euSetRewardPanelVisible(true);
        }
    };
})();