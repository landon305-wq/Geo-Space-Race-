window.usaEliminationGame = (() => {
    // ============================================
    // GEO-ODYSSEY: USA ELIMINATION MODE ENGINE
    // ============================================

    const USA_MAP_FILE = 'us-states.geojson';
    const USA_QUESTION_FILE = 'questions-usa-elimination.json';

    const USA_NORMAL_LIVES = 3;
    const USA_HARD_LIVES = 1;
    const USA_QUESTION_TIME = 60;

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
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
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

    let usaMap = null;
    let usaLabelLayer = null;
    let usaEntries = [];
    let usaQuestions = [];
    let usaQuestionDeck = [];

    let eliminatedStates = new Set();
    let usaCurrentQuestion = null;
    let usaSelectedEntry = null;

    let usaLives = USA_NORMAL_LIVES;
    let usaHardMode = false;
    let usaLocked = false;

    let usaTimer = null;
    let usaTimeLeft = USA_QUESTION_TIME;

    const USA_NORMAL_KEY = 'astro_geo_usa_elim_states_highscore';
    const USA_HARD_KEY = 'astro_geo_usa_elim_states_hard_highscore';
    const USA_LOCAL_LB_KEY = 'astro_geo_usa_elim_leaderboard';

    let usaNormalHighScore = Number(localStorage.getItem(USA_NORMAL_KEY)) || 0;
    let usaHardHighScore = Number(localStorage.getItem(USA_HARD_KEY)) || 0;

    const USA_MILESTONE_STATES = [0, 10, 21, 31, 42, 52];
    const USA_MILESTONE_DATA = [
        { name: 'Earth Surface', miles: '0 mi', icon: '🌍' },
        { name: 'Low Orbit', miles: '45,940 mi', icon: '🛰️' },
        { name: 'High Orbit', miles: '96,470 mi', icon: '🔭' },
        { name: 'Deep Space', miles: '142,410 mi', icon: '🚀' },
        { name: 'Lunar Approach', miles: '192,940 mi', icon: '🌠' },
        { name: 'The Moon', miles: '238,900 mi', icon: '🌙' }
    ];
    let usaOriginalMilestones = null;

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

    function usaSound(type) {
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
                usaPlayWrongSound();
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

    function usaPlayWrongSound() {
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

    function usaGet(id) {
        return document.getElementById(id);
    }

    // ============================================
    // LEADERBOARD & STORAGE
    // ============================================
    function usaGetLocalLeaderboard() {
        try {
            return JSON.parse(localStorage.getItem(USA_LOCAL_LB_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    async function usaGetLeaderboard() {
        if (supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('usa_leaderboard')
                    .select('*')
                    .order('clears', { ascending: false })
                    .limit(10);
                if (!error && data) return data;
            } catch (err) {
                console.warn('Cloud leaderboard fetch failed:', err);
            }
        }
        return usaGetLocalLeaderboard();
    }

    async function usaRecordHardModeClear() {
        if (!playerCallsign || !playerCallsign.trim()) {
            let inputName = prompt("🎉 LUNAR LANDING SUCCESS!\nEnter your astronaut callsign for the leaderboard:", "Commander Cadet");
            playerCallsign = (inputName && inputName.trim()) ? inputName.trim() : "Commander Cadet";
            localStorage.setItem('astro_geo_player_callsign', playerCallsign);
        }

        if (!currentUserId && supabaseClient) {
            try {
                const { data } = await supabaseClient.auth.getSession();
                if (data && data.session) currentUserId = data.session.user.id;
                else await initAuth();
            } catch (e) {}
        }

        const currentDate = new Date().toLocaleDateString();
        let board = usaGetLocalLeaderboard();
        let existing = board.find(entry => entry.name.toLowerCase() === playerCallsign.toLowerCase());
        if (existing) {
            existing.clears += 1;
            existing.date = currentDate;
        } else {
            board.push({ name: playerCallsign, clears: 1, date: currentDate });
        }
        board.sort((a, b) => b.clears - a.clears);
        localStorage.setItem(USA_LOCAL_LB_KEY, JSON.stringify(board));

        if (supabaseClient && currentUserId) {
            try {
                const { data: rows } = await supabaseClient
                    .from('usa_leaderboard')
                    .select('clears')
                    .eq('user_id', currentUserId);

                if (rows && rows.length > 0) {
                    await supabaseClient
                        .from('usa_leaderboard')
                        .update({ clears: rows[0].clears + 1, name: playerCallsign, updated_at: new Date() })
                        .eq('user_id', currentUserId);
                } else {
                    await supabaseClient
                        .from('usa_leaderboard')
                        .insert([{ user_id: currentUserId, name: playerCallsign, clears: 1, mode: 'hard', updated_at: new Date() }]);
                }
            } catch (err) {
                console.warn('Cloud sync failed:', err);
            }
        }
    }

    async function usaBuildLeaderboardHTML() {
        const board = await usaGetLeaderboard();
        if (!board || board.length === 0) {
            return '<p style="text-align: center; color: #94a3b8; margin: 10px 0;">No hard mode moon landings recorded yet.</p>';
        }
        let html = '<table style="width: 100%; font-size: 0.95rem; border-collapse: collapse;">';
        html += '<tr style="color: #38bdf8; border-bottom: 1px solid #1e293b;"><th style="text-align: left; padding: 6px;">Astronaut</th><th style="text-align: right; padding: 6px;">Moon Landings</th></tr>';
        board.forEach((entry, idx) => {
            html += `<tr style="border-bottom: 1px solid rgba(30, 41, 59, 0.5);">
                <td style="padding: 8px 6px; color: #f8fafc;">${idx + 1}. ${escapeHtml(entry.name || 'Anonymous')}</td>
                <td style="text-align: right; padding: 8px 6px; color: #22c55e; font-weight: bold;">${entry.clears || 1}</td>
            </tr>`;
        });
        html += '</table>';
        return html;
    }

    function escapeHtml(str) {
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // ============================================
    // MILESTONES & HUD
    // ============================================
    function usaApplyMilestones() {
        const track = document.querySelector('.space-track');
        if (!track) return;
        let items = Array.from(track.querySelectorAll('.milestone'));

        if (!usaOriginalMilestones) {
            usaOriginalMilestones = items.map(el => {
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

        while (track.querySelectorAll('.milestone').length < USA_MILESTONE_STATES.length) {
            const templateEl = track.querySelector('.milestone');
            if (templateEl) track.appendChild(templateEl.cloneNode(true));
            else break;
        }

        items = Array.from(track.querySelectorAll('.milestone'));
        items.forEach((el, i) => {
            const target = USA_MILESTONE_STATES[i];
            const data = USA_MILESTONE_DATA[i];
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

    function usaRestoreMilestones() {
        if (!usaOriginalMilestones) return;
        const track = document.querySelector('.space-track');
        if (!track) return;
        track.innerHTML = usaOriginalMilestones.map(m => m.outerHTML).join('');
        usaOriginalMilestones = null;
    }

    function usaSetRewardPanelVisible(visible) {
        const panel = document.querySelector('.right-sidebar');
        if (panel) panel.style.display = visible ? '' : 'none';
    }

    function usaEnsureHomeButtonInGame() {
        let hud = document.querySelector('.hud');
        if (hud && !usaGet('game-home-btn')) {
            const homeBtn = document.createElement('button');
            homeBtn.id = 'game-home-btn';
            homeBtn.className = 'space-btn secondary-btn';
            homeBtn.style.cssText = 'padding: 6px 12px; font-size: 0.8rem; margin: 0; width: auto; cursor: pointer;';
            homeBtn.textContent = '🏠 Home';
            homeBtn.onclick = () => {
                usaStopTimer();
                const gameScreen = usaGet('game-screen');
                const homeScreen = usaGet('home-screen');
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
    const usaStateAliases = {
        AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
        CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
        FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
        IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
        KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
        MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
        MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
        NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
        NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
        OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
        SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
        VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
        WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia', PR: 'Puerto Rico'
    };

    function usaNormalizeState(value) {
        if (value === null || value === undefined) return '';
        const text = String(value).trim();
        const upper = text.toUpperCase();
        if (usaStateAliases[upper]) return usaStateAliases[upper].toLowerCase();
        const cleaned = text.toLowerCase().replace(/[^a-z]/g, '');
        for (const key in usaStateAliases) {
            const fullName = usaStateAliases[key].toLowerCase();
            if (fullName.replace(/[^a-z]/g, '') === cleaned) return fullName;
        }
        return text.toLowerCase();
    }

    function usaGetStateName(properties) {
        return properties.name || properties.NAME || properties.STATE_NAME || properties.state || properties.State || '';
    }

    function usaGetStateAbbreviation(properties) {
        return properties.abbr || properties.STUSPS || properties.postal || properties.code || properties.STATE_ABBR || '';
    }

    function usaAbbreviationFromName(name) {
        const normalized = usaNormalizeState(name);
        for (const abbreviation in usaStateAliases) {
            if (usaStateAliases[abbreviation].toLowerCase() === normalized) return abbreviation;
        }
        return '';
    }

    const usaNortheastCallouts = {
        MD: { label: [39.8, -67.4], target: [39.0, -76.6] },
        DE: { label: [38.9, -67.4], target: [39.0, -75.5] },
        DC: { label: [37.8, -67.4], target: [38.9, -77.0] },
        RI: { label: [41.9, -67.4], target: [41.6, -71.5] }
    };

    const usaNorthernCallouts = {
        VT: { label: [45.75, -72.7], target: [44.25, -72.7] },
        NH: { label: [45.75, -71.55], target: [44.15, -71.55] }
    };

    const usaLabelPositionOverrides = {
        AK: [64.5, -152.5], MA: [42.25, -71.8], CT: [41.55, -72.7],
        NJ: [40.1, -74.5], ID: [43.4, -114.3], OK: [35.5, -96.5],
        LA: [30.95, -92.0], FL: [27.6, -81.0], MI: [43.6, -84.8],
        MS: [32.9, -89.4], VA: [37.6, -78.2], KY: [37.5, -85.3],
        MN: [46.0, -94.8], NC: [35.7, -78.4]
    };

    function usaCreateStateLabels() {
        if (!usaMap) return;
        if (usaLabelLayer) {
            usaLabelLayer.clearLayers();
        } else {
            usaLabelLayer = L.layerGroup().addTo(usaMap);
        }

        usaEntries.forEach(e => { e.labelGroup = null; });
        const placed = new Set();

        const labelIcon = abbreviation => L.divIcon({
            className: 'usa-state-label-icon',
            html: `<span class="usa-state-label">${abbreviation}</span>`,
            iconSize: [28, 20], iconAnchor: [14, 10]
        });

        const outsideLabelIcon = abbreviation => L.divIcon({
            className: 'usa-state-label-icon',
            html: `<span class="usa-state-label usa-callout-label">${abbreviation}</span>`,
            iconSize: [40, 20], iconAnchor: [0, 10]
        });

        const northernLabelIcon = abbreviation => L.divIcon({
            className: 'usa-state-label-icon',
            html: `<span class="usa-state-label">${abbreviation}</span>`,
            iconSize: [28, 20], iconAnchor: [14, 20]
        });

        function addCalloutElements(labelPosition, targetPosition, direction = 'down') {
            const group = L.layerGroup();
            L.polyline([labelPosition, targetPosition], { color: '#94a3b8', weight: 1.2, opacity: 0.95, interactive: false }).addTo(group);
            let borderStyle = 'border-top: 8px solid #94a3b8; border-left: 5px solid transparent; border-right: 5px solid transparent;';
            let anchor = [5, 0];
            if (direction === 'left') {
                borderStyle = 'border-right: 8px solid #94a3b8; border-top: 5px solid transparent; border-bottom: 5px solid transparent;';
                anchor = [0, 5];
            }
            const arrowIcon = L.divIcon({
                className: 'usa-label-arrow-icon',
                html: `<div style="width: 0; height: 0; ${borderStyle}"></div>`,
                iconSize: [10, 8], iconAnchor: anchor
            });
            L.marker(targetPosition, { icon: arrowIcon, interactive: false, keyboard: false, zIndexOffset: 1100 }).addTo(group);
            return group;
        }

        if (!usaHardMode) {
            usaEntries.forEach(entry => {
                const abbreviation = entry.abbr || usaAbbreviationFromName(entry.name);
                if (!abbreviation) return;
                const key = abbreviation.toUpperCase();
                if (key === 'HI' || key === 'PR') return;
                placed.add(key);
                const entryGroup = L.layerGroup();

                if (usaNorthernCallouts[key]) {
                    const callout = usaNorthernCallouts[key];
                    addCalloutElements(L.latLng(...callout.label), L.latLng(...callout.target), 'down').addTo(entryGroup);
                    L.marker(callout.label, { icon: northernLabelIcon(key), interactive: false, keyboard: false, zIndexOffset: 1200 }).addTo(entryGroup);
                    entry.labelGroup = entryGroup;
                    entryGroup.addTo(usaLabelLayer);
                    return;
                }
                if (usaNortheastCallouts[key]) {
                    const callout = usaNortheastCallouts[key];
                    addCalloutElements(L.latLng(...callout.label), L.latLng(...callout.target), 'left').addTo(entryGroup);
                    L.marker(callout.label, { icon: outsideLabelIcon(key), interactive: false, keyboard: false, zIndexOffset: 1200 }).addTo(entryGroup);
                    entry.labelGroup = entryGroup;
                    entryGroup.addTo(usaLabelLayer);
                    return;
                }

                const statePosition = usaLabelPositionOverrides[key]
                    ? L.latLng(...usaLabelPositionOverrides[key])
                    : entry.layer.getBounds().getCenter();

                L.marker(statePosition, { icon: labelIcon(key), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(entryGroup);
                entry.labelGroup = entryGroup;
                entryGroup.addTo(usaLabelLayer);
            });

            if (!placed.has('DC')) {
                const dcEntry = usaEntries.find(e => (e.abbr || usaAbbreviationFromName(e.name)).toUpperCase() === 'DC');
                const dcCallout = usaNortheastCallouts.DC;
                const dcGroup = L.layerGroup();
                addCalloutElements(L.latLng(...dcCallout.label), L.latLng(...dcCallout.target), 'left').addTo(dcGroup);
                L.marker(dcCallout.label, { icon: outsideLabelIcon('DC'), interactive: false, keyboard: false, zIndexOffset: 1200 }).addTo(dcGroup);
                dcGroup.addTo(usaLabelLayer);
                if (dcEntry) dcEntry.labelGroup = dcGroup;
            }
        }
        usaAddIslandCircles();
    }

    function usaAddIslandCircles() {
        if (!usaMap || !usaLabelLayer) return;
        const labelIcon = abbreviation => L.divIcon({
            className: 'usa-state-label-icon',
            html: `<span class="usa-state-label">${abbreviation}</span>`,
            iconSize: [28, 20], iconAnchor: [14, 10]
        });

        usaEntries.forEach(entry => {
            const abbr = (entry.abbr || usaAbbreviationFromName(entry.name)).toUpperCase();
            if (abbr === 'HI' || abbr === 'PR') {
                const center = abbr === 'HI' ? L.latLng(20.35, -157.55) : L.latLng(18.22, -66.45);
                const circleRadius = abbr === 'HI' ? 30 : 24;
                const circleMarker = L.circleMarker(center, {
                    radius: circleRadius, color: '#38bdf8', weight: 1.8,
                    fillColor: '#1e293b', fillOpacity: 0.1, interactive: true, className: 'usa-island-circle'
                });

                entry.circleMarker = circleMarker;
                const labelPos = abbr === 'HI' ? L.latLng(center.lat + 4.2, center.lng) : L.latLng(center.lat + 3.8, center.lng);
                const entryGroup = L.layerGroup();
                if (!usaHardMode) {
                    L.marker(labelPos, { icon: labelIcon(abbr), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(entryGroup);
                }
                entryGroup.addTo(usaLabelLayer);
                entry.labelGroup = entryGroup;

                circleMarker.on('mouseover', () => {
                    const norm = usaNormalizeState(entry.name);
                    if (!usaLocked && !eliminatedStates.has(norm) && usaSelectedEntry !== entry) {
                        circleMarker.setStyle({ color: '#67e8f9', weight: 2.5, fillColor: '#334155', fillOpacity: 0.25 });
                        entry.layer.setStyle({ color: '#67e8f9', weight: 2 });
                    }
                });

                circleMarker.on('mouseout', () => {
                    const norm = usaNormalizeState(entry.name);
                    if (!usaLocked && !eliminatedStates.has(norm) && usaSelectedEntry !== entry) {
                        const isElim = eliminatedStates.has(norm);
                        circleMarker.setStyle({ color: isElim ? '#0f172a' : '#38bdf8', weight: 1.8, fillColor: isElim ? '#090d16' : '#1e293b', fillOpacity: isElim ? 0.05 : 0.1 });
                        entry.layer.setStyle({ color: isElim ? '#0f172a' : '#38bdf8', weight: 1.2 });
                    }
                });

                circleMarker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    const norm = usaNormalizeState(entry.name);
                    if (!eliminatedStates.has(norm)) usaHandleStateClick(entry);
                });
                circleMarker.addTo(usaLabelLayer);
            }
        });
    }

    function usaGetAnswers(question) {
        const list = question.rule?.list || [];
        return (Array.isArray(list) ? list : [list]).map(usaNormalizeState).filter(Boolean);
    }

    function usaPrepareQuestions(bank) {
        const rawQuestions = Array.isArray(bank) ? bank : bank.questions;
        if (!Array.isArray(rawQuestions) || !rawQuestions.length) throw new Error('No questions found.');
        return rawQuestions.map(question => {
            if (!question.prompt || !question.rule?.list) return null;
            const answers = usaGetAnswers(question);
            const matchingEntries = usaEntries.filter(entry => {
                const normName = usaNormalizeState(entry.name);
                const normAbbr = usaNormalizeState(entry.abbr);
                return answers.includes(normName) || answers.includes(normAbbr);
            });
            if (!matchingEntries.length) return null;
            return { ...question, matchingEntries };
        }).filter(Boolean);
    }

    function usaGetHighScore() {
        return usaHardMode ? usaHardHighScore : usaNormalHighScore;
    }

    function usaStartGame() {
        const home = usaGet('home-screen');
        const game = usaGet('game-screen');
        if (home) { home.classList.add('hidden'); home.style.display = 'none'; }
        if (game) { game.classList.add('active'); game.style.display = 'flex'; }

        usaSound('blastOff');
        usaEnsureTimerElement();
        usaEnsureHomeButtonInGame();
        usaApplyMilestones();
        usaSetRewardPanelVisible(false);

        if (!usaMap) usaInitializeGame();
        else if (usaQuestions.length) {
            usaResetGame();
            setTimeout(() => usaMap.invalidateSize(), 150);
        } else usaLoadQuestions();
    }

    async function usaInitializeGame() {
        try {
            usaSetPrompt('Loading Elimination USA map...');
            const response = await fetch(USA_MAP_FILE);
            if (!response.ok) throw new Error('Could not load us-states.geojson.');
            const geoData = await response.json();
            if (!Array.isArray(geoData.features)) throw new Error('Invalid GeoJSON.');
            usaCreateMap(geoData);
            await usaLoadQuestions();
        } catch (error) {
            usaStopTimer();
            usaSetPrompt('ERROR: ' + error.message);
        }
    }

    function usaCreateMap(geoData) {
        if (!window.L) throw new Error('Leaflet not loaded.');
        if (usaMap) return;
        usaEntries = [];
        usaMap = L.map('map', { center: [37.8, -96], zoom: 4, minZoom: 3, maxZoom: 7, zoomControl: true, attributionControl: false });
        const normalStyle = { color: '#38bdf8', weight: 1.2, fillColor: '#1e293b', fillOpacity: 0.95 };

        L.geoJSON(geoData, {
            style: () => normalStyle,
            onEachFeature: (feature, layer) => {
                const properties = feature.properties || {};
                const entry = { name: usaGetStateName(properties), abbr: usaGetStateAbbreviation(properties), layer };
                if (!entry.name) return;
                usaEntries.push(entry);

                layer.on('mouseover', () => {
                    const norm = usaNormalizeState(entry.name);
                    if (!usaLocked && !eliminatedStates.has(norm) && usaSelectedEntry !== entry) {
                        layer.setStyle({ color: '#67e8f9', weight: 2, fillColor: '#334155', fillOpacity: 1 });
                    }
                });

                layer.on('mouseout', () => {
                    const norm = usaNormalizeState(entry.name);
                    if (!usaLocked && !eliminatedStates.has(norm) && usaSelectedEntry !== entry) {
                        layer.setStyle(normalStyle);
                    }
                });

                layer.on('click', () => {
                    const norm = usaNormalizeState(entry.name);
                    if (!eliminatedStates.has(norm)) usaHandleStateClick(entry);
                });
            }
        }).addTo(usaMap);
        usaCreateStateLabels();
    }

    async function usaLoadQuestions() {
        try {
            usaSetPrompt('Loading Elimination questions...');
            const response = await fetch(USA_QUESTION_FILE + '?v=' + Date.now());
            if (!response.ok) throw new Error('Could not load questions.');
            const bank = await response.json();
            usaQuestions = usaPrepareQuestions(bank);
            usaResetGame();
            setTimeout(() => { if (usaMap) usaMap.invalidateSize(); }, 150);
        } catch (error) {
            usaStopTimer();
            usaSetPrompt('ERROR: ' + error.message);
        }
    }

    function usaShuffle(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    function usaHasRemainingAnswer(question) {
        if (!question || !question.matchingEntries || !question.matchingEntries.length) return false;
        return question.matchingEntries.some(entry => !eliminatedStates.has(usaNormalizeState(entry.name)));
    }

    function usaResetDeck() {
        usaQuestionDeck = usaShuffle(usaQuestions.filter(usaHasRemainingAnswer));
    }

    function usaPickNextQuestion() {
        while (usaQuestionDeck.length) {
            const candidate = usaQuestionDeck.pop();
            if (usaHasRemainingAnswer(candidate)) return candidate;
        }
        usaResetDeck();
        while (usaQuestionDeck.length) {
            const candidate = usaQuestionDeck.pop();
            if (usaHasRemainingAnswer(candidate)) return candidate;
        }
        return null;
    }

    function usaResetGame() {
        usaStopTimer();
        usaLives = usaHardMode ? USA_HARD_LIVES : USA_NORMAL_LIVES;
        usaLocked = false;
        usaSelectedEntry = null;
        eliminatedStates.clear();
        usaCreateStateLabels();
        usaResetMapColors();
        usaResetDeck();
        usaUpdateStatus();
        usaNextQuestion();
    }

    function usaResetMapColors() {
        if (usaMap && usaEntries.length && !usaLabelLayer) usaCreateStateLabels();
        usaEntries.forEach(entry => {
            const norm = usaNormalizeState(entry.name);
            const isElim = eliminatedStates.has(norm);
            
            entry.layer.setStyle({
                color: isElim ? '#0f172a' : '#38bdf8',
                weight: isElim ? 1 : 1.2,
                fillColor: isElim ? '#090d16' : '#1e293b',
                fillOpacity: isElim ? 0.3 : 0.95
            });

            if (entry.labelGroup) {
                if (isElim || usaHardMode) {
                    if (usaLabelLayer && usaLabelLayer.hasLayer(entry.labelGroup)) {
                        usaLabelLayer.removeLayer(entry.labelGroup);
                    }
                } else {
                    if (usaLabelLayer && !usaLabelLayer.hasLayer(entry.labelGroup)) {
                        usaLabelLayer.addLayer(entry.labelGroup);
                    }
                }
            }
        });
    }

    function usaNextQuestion() {
        usaStopTimer();
        usaLocked = false;
        usaSelectedEntry = null;
        usaResetMapColors();

        const nextQuestion = eliminatedStates.size >= 52 ? null : usaPickNextQuestion();

        if (!nextQuestion) {
            usaCurrentQuestion = null;
            usaSound('win');
            if (usaHardMode) {
                usaRecordHardModeClear();
            }
            usaShowModal('🎉 LUNAR LANDING SUCCESS!', `Incredible! Items eliminated: ${eliminatedStates.size} / 52 (238,900 Miles Reached!)`, true, true);
            return;
        }

        usaCurrentQuestion = nextQuestion;
        usaSetPrompt(usaCurrentQuestion.prompt);
        usaUpdateStatus();
        usaStartTimer();
    }

    function usaSetPrompt(message) {
        const el = usaGet('prompt-text');
        if (el) el.textContent = message;
    }

    function usaHandleStateClick(entry) {
        if (usaLocked || !usaCurrentQuestion) return;
        
        if (usaSelectedEntry && usaSelectedEntry !== entry) {
            const prevNorm = usaNormalizeState(usaSelectedEntry.name);
            if (!eliminatedStates.has(prevNorm)) {
                usaSelectedEntry.layer.setStyle({ color: '#38bdf8', weight: 1.2, fillColor: '#1e293b', fillOpacity: 0.95 });
            }
        }

        if (usaSelectedEntry !== entry) {
            usaSelectedEntry = entry;
            usaSound('select');
            entry.layer.setStyle({ color: '#f59e0b', weight: 2.5, fillColor: '#f59e0b', fillOpacity: 0.95 });
            usaSetPrompt(usaCurrentQuestion.prompt + ' — Click again to confirm elimination.');
            return;
        }
        usaConfirmAnswer();
    }

    function usaConfirmAnswer(autoLocked = false) {
        if (!usaSelectedEntry || usaLocked) return;
        usaLocked = true;
        usaStopTimer();
        usaSound('confirm');

        const selected = usaSelectedEntry;
        const selectedNameNorm = usaNormalizeState(selected.name);
        const correct = usaCurrentQuestion.matchingEntries.some(entry => usaNormalizeState(entry.name) === selectedNameNorm);
        const autoNote = autoLocked ? 'Time ran out! ' : '';

        if (correct) {
            eliminatedStates.add(selectedNameNorm);
            selected.layer.setStyle({ color: '#22c55e', weight: 2.5, fillColor: '#22c55e', fillOpacity: 1 });
            usaUpdateStatus();
            
            if (selected.labelGroup && usaLabelLayer && usaLabelLayer.hasLayer(selected.labelGroup)) {
                usaLabelLayer.removeLayer(selected.labelGroup);
            }

            if (eliminatedStates.size >= 52) {
                usaSound('win');
                if (usaHardMode) {
                    usaRecordHardModeClear();
                }
                usaShowModal('🎉 TOUCHDOWN ON THE MOON!', `${autoNote}${selected.name} was correct! You reached the Moon!`, true, true);
            } else {
                usaSound('correct');
                usaShowModal('⚡ Location Eliminated!', `${autoNote}${selected.name} was correct and is now ELIMINATED!`, false, true);
            }
        } else {
            usaLives--;
            selected.layer.setStyle({ color: '#ef4444', weight: 2.5, fillColor: '#ef4444', fillOpacity: 1 });
            usaUpdateStatus();

            if (usaLives <= 0) {
                usaSound('gameover');
                usaShowModal('MISSION FAILED', `${autoNote}${selected.name} was incorrect.<br>Total states eliminated: ${eliminatedStates.size}`, true, false);
            } else {
                usaSound('wrong');
                usaShowModal('INCORRECT ANSWER', `${autoNote}${selected.name} was incorrect. Lives left: ${usaLives}`, false, false);
            }
        }
    }

    function usaEnsureTimerElement() {
        let container = usaGet('question-timer');
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

    function usaUpdateTimer() {
        let value = usaGet('timer-val');
        if (!value) { usaEnsureTimerElement(); value = usaGet('timer-val'); }
        const container = usaGet('question-timer');
        if (value) value.textContent = usaTimeLeft;
        if (container) container.classList.toggle('timer-warning', usaTimeLeft <= 5);
    }

    function usaStartTimer() {
        usaStopTimer();
        usaTimeLeft = USA_QUESTION_TIME;
        usaUpdateTimer();
        usaTimer = setInterval(() => {
            if (usaLocked) { usaStopTimer(); return; }
            usaTimeLeft--;
            usaUpdateTimer();
            if (usaTimeLeft >= 1 && usaTimeLeft <= 5) usaSound(usaTimeLeft <= 2 ? 'tickHigh' : 'tick');
            if (usaTimeLeft <= 0) usaTimeExpired();
        }, 1000);
    }

    function usaStopTimer() {
        if (usaTimer) { clearInterval(usaTimer); usaTimer = null; }
    }

    function usaTimeExpired() {
        if (usaLocked || !usaCurrentQuestion) return;
        if (usaSelectedEntry) { usaConfirmAnswer(true); return; }
        usaLocked = true;
        usaStopTimer();
        usaLives--;
        usaUpdateStatus();
        if (usaLives <= 0) {
            usaSound('gameover');
            usaShowModal("TIME'S UP!", `Time expired.<br>Total states eliminated: ${eliminatedStates.size}`, true, false);
        } else {
            usaSound('wrong');
            usaShowModal("TIME'S UP!", `Lost a life. Lives left: ${usaLives}`, false, false);
        }
    }

    function usaUpdateStatus() {
        const livesEl = usaGet('lives-val');
        const scoreDisplay = usaGet('score-display');
        if (livesEl) livesEl.textContent = '❤️'.repeat(Math.max(0, usaLives));
        if (scoreDisplay) scoreDisplay.innerHTML = `States Eliminated: <span id="score-val">${eliminatedStates.size}</span> / 52`;

        const count = eliminatedStates.size;
        if (usaHardMode) {
            if (count > usaHardHighScore) { usaHardHighScore = count; localStorage.setItem(USA_HARD_KEY, usaHardHighScore); }
        } else {
            if (count > usaNormalHighScore) { usaNormalHighScore = count; localStorage.setItem(USA_NORMAL_KEY, usaNormalHighScore); }
        }
        if (window.refreshHomeHighScore) window.refreshHomeHighScore();
        usaUpdateRocket();
    }

    function usaUpdateRocket() {
        const rocket = usaGet('rocket-icon');
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

    function usaShowModal(title, description, gameOver, isCorrect) {
        usaStopTimer();
        let modal = usaGet('feedback-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'feedback-modal';
            document.body.appendChild(modal);
        }
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); display: flex !important; align-items: center; justify-content: center; z-index: 99999; pointer-events: auto;';
        modal.classList.remove('hidden');
        const borderColor = isCorrect ? '#22c55e' : '#ef4444';

        // Extract correct answers from current question if incorrect
        let correctAnswersText = '';
        if (!isCorrect && usaCurrentQuestion && usaCurrentQuestion.matchingEntries) {
            correctAnswersText = usaCurrentQuestion.matchingEntries.map(e => e.name).join(', ');
        }
        const currentPromptText = usaCurrentQuestion ? usaCurrentQuestion.prompt : '';

        // Build HTML for the Question, Show Answer, and Dispute Button Section targeting GeoSpaceRace2026@gmail.com
        let answerSectionHTML = '';
        if (!isCorrect && !gameOver && correctAnswersText) {
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

        modal.innerHTML = `
            <div style="background: #0f172a; border: 2px solid ${borderColor}; border-radius: 12px; padding: 25px; text-align: center; max-width: 440px; width: 90%; color: #f8fafc; font-family: inherit;">
                <h2 style="margin-top: 0; color: ${borderColor};">${title}</h2>
                <p style="margin: 10px 0; color: #cbd5e1; line-height: 1.4; font-size: 15px;">${description}</p>
                ${answerSectionHTML}
                <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
                    <button id="modal-action-btn" style="background: ${borderColor}; color: #0f172a; border: none; padding: 10px 24px; font-weight: bold; border-radius: 6px; cursor: pointer; font-size: 15px;">${gameOver ? 'Return to Home' : 'Next Question'}</button>
                </div>
            </div>
        `;

        // Wire up the Show Answer toggle button
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
                
                if (gameOver || usaLives <= 0) {
                    const gameScreen = usaGet('game-screen');
                    const homeScreen = usaGet('home-screen');
                    if (gameScreen) { gameScreen.classList.remove('active'); gameScreen.style.cssText = 'display: none !important;'; }
                    if (homeScreen) { homeScreen.classList.remove('hidden'); homeScreen.style.cssText = 'display: flex !important;'; }
                    if (window.refreshHomeHighScore) window.refreshHomeHighScore();
                } else {
                    usaNextQuestion();
                }
            };
        }
    }

    return {
        setHardMode(on) {
            usaHardMode = !!on;
            if (window.refreshHomeHighScore) window.refreshHomeHighScore();
            if (usaMap) {
                usaCreateStateLabels();
                usaResetMapColors();
            }
        },
        getHighScore() { return usaGetHighScore(); },
        getLeaderboardHTML: usaBuildLeaderboardHTML,
        start() { usaStartGame(); },
        destroy() {
            usaStopTimer();
            if (usaMap) { usaMap.remove(); usaMap = null; }
            usaLabelLayer = null;
            usaEntries = [];
            usaQuestions = [];
            eliminatedStates.clear();
            usaRestoreMilestones();
            usaSetRewardPanelVisible(true);
        }
    };
})();
