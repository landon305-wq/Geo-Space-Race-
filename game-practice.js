// ==========================================
// GEO-SPACERACE: PRACTICE MODE
// A separate game from Elimination and the Daily Challenge.
//   Maps:  USA (50 states) · Europe (47 countries) · World (197 countries)
//   Modes: STATES / COUNTRIES  - "Find Texas"           (local personal best)
//          CAPITALS (HARD)     - "Austin is the capital of...?"  (online leaderboard)
//   Water: rivers, lakes, seas & oceans, bays & gulfs (or all of them) on a world map
//          (map data: water-bodies.geojson, from Natural Earth - public domain)
// Rules: one life, no names on the map, every place comes up once in a random order.
// Tap a place once to select it (yellow), tap it again to lock it in.
// ==========================================
window.practiceGame = (function () {

    // ---------- ONLINE LEADERBOARD (same Supabase project as the other modes) ----------
    const SUPABASE_URL = 'https://ccjlpsapefnnikbschpj.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_q1GbjeHYP7X3Z3DTz4Eftg_0L2toKwO';

    let supabaseClient = null;
    let currentUserId = null;
    if (window.supabase && SUPABASE_URL && SUPABASE_KEY) {
        try {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storageKey: 'sb-practice-auth' } });
            initAuth();
        } catch (e) { console.warn('[Practice] Supabase init warning:', e); }
    }
    async function initAuth() {
        if (!supabaseClient) return;
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) currentUserId = session.user.id;
            else {
                const { data, error } = await supabaseClient.auth.signInAnonymously();
                if (!error && data && data.user) currentUserId = data.user.id;
            }
        } catch (err) { console.warn('[Practice] Anonymous auth failed:', err); }
    }

    // ---------- SETTINGS ----------
    const REGIONS = {
        usa:    { label: 'USA',    flag: '🇺🇸', unit: 'States',    one: 'state',   map: 'us-states.geojson',          table: 'usa_capitals_leaderboard' },
        europe: { label: 'EUROPE', flag: '🇪🇺', unit: 'Countries', one: 'country', map: 'europe-countries.geojson',   table: 'europe_capitals_leaderboard' },
        world:  { label: 'WORLD',  flag: '🌍', unit: 'Countries', one: 'country', map: 'world-countries.geojson?v=7', table: 'world_capitals_leaderboard' },
        water:  { label: 'WATER',  flag: '🌊', unit: 'Bodies of Water', one: 'body of water', map: 'water-bodies.geojson?v=1', table: null }
    };
    // Water mode categories (cats = which kinds of water are in play)
    const WATER_TYPES = {
        all:    { label: 'ALL WATER',      icon: '🌊', cats: ['river', 'lake', 'sea', 'ocean', 'bay'], one: 'body of water', sub: 'Every river, lake, sea, ocean and bay' },
        rivers: { label: 'RIVERS',         icon: '🏞️', cats: ['river'],        one: 'river',         sub: 'The Nile, Amazon, Mississippi and more' },
        lakes:  { label: 'LAKES',          icon: '💧', cats: ['lake'],         one: 'lake',          sub: 'The Great Lakes, Baikal, Victoria and more' },
        seas:   { label: 'SEAS & OCEANS',  icon: '🌐', cats: ['sea', 'ocean'], one: 'sea or ocean',  sub: 'All 5 oceans and the major seas' },
        bays:   { label: 'BAYS & GULFS',   icon: '⚓', cats: ['bay'],          one: 'bay or gulf',   sub: 'Hudson Bay, Gulf of Mexico and more' }
    };
    const WATER_COUNTS = { river: 64, lake: 49, sea: 45, ocean: 5, bay: 26 };   // matches water-bodies.geojson
    const BEST_KEY = (region, type) => `geo_practice_best_${region}_${type}`;
    const LAST_KEY = 'geo_practice_last_choice';
    const REVEAL_DELAY_MS = 1600;   // how long the right answer shows on the map before the results card

    // ---------- CAPITALS ----------
    const US_CAPITALS = {
        'Alabama': 'Montgomery', 'Alaska': 'Juneau', 'Arizona': 'Phoenix', 'Arkansas': 'Little Rock', 'California': 'Sacramento',
        'Colorado': 'Denver', 'Connecticut': 'Hartford', 'Delaware': 'Dover', 'Florida': 'Tallahassee', 'Georgia': 'Atlanta',
        'Hawaii': 'Honolulu', 'Idaho': 'Boise', 'Illinois': 'Springfield', 'Indiana': 'Indianapolis', 'Iowa': 'Des Moines',
        'Kansas': 'Topeka', 'Kentucky': 'Frankfort', 'Louisiana': 'Baton Rouge', 'Maine': 'Augusta', 'Maryland': 'Annapolis',
        'Massachusetts': 'Boston', 'Michigan': 'Lansing', 'Minnesota': 'Saint Paul', 'Mississippi': 'Jackson', 'Missouri': 'Jefferson City',
        'Montana': 'Helena', 'Nebraska': 'Lincoln', 'Nevada': 'Carson City', 'New Hampshire': 'Concord', 'New Jersey': 'Trenton',
        'New Mexico': 'Santa Fe', 'New York': 'Albany', 'North Carolina': 'Raleigh', 'North Dakota': 'Bismarck', 'Ohio': 'Columbus',
        'Oklahoma': 'Oklahoma City', 'Oregon': 'Salem', 'Pennsylvania': 'Harrisburg', 'Rhode Island': 'Providence', 'South Carolina': 'Columbia',
        'South Dakota': 'Pierre', 'Tennessee': 'Nashville', 'Texas': 'Austin', 'Utah': 'Salt Lake City', 'Vermont': 'Montpelier',
        'Virginia': 'Richmond', 'Washington': 'Olympia', 'West Virginia': 'Charleston', 'Wisconsin': 'Madison', 'Wyoming': 'Cheyenne'
    };
    const EUROPE_CAPITALS = {
        'Albania': 'Tirana', 'Andorra': 'Andorra la Vella', 'Austria': 'Vienna', 'Belarus': 'Minsk', 'Belgium': 'Brussels',
        'Bosnia and Herzegovina': 'Sarajevo', 'Bulgaria': 'Sofia', 'Croatia': 'Zagreb', 'Cyprus': 'Nicosia', 'Czechia': 'Prague',
        'Denmark': 'Copenhagen', 'Estonia': 'Tallinn', 'Finland': 'Helsinki', 'France': 'Paris', 'Germany': 'Berlin',
        'Greece': 'Athens', 'Hungary': 'Budapest', 'Iceland': 'Reykjavík', 'Ireland': 'Dublin', 'Italy': 'Rome',
        'Kosovo': 'Pristina', 'Latvia': 'Riga', 'Liechtenstein': 'Vaduz', 'Lithuania': 'Vilnius', 'Luxembourg': 'Luxembourg City',
        'Malta': 'Valletta', 'Moldova': 'Chișinău', 'Monaco': 'Monaco', 'Montenegro': 'Podgorica', 'Netherlands': 'Amsterdam',
        'North Macedonia': 'Skopje', 'Norway': 'Oslo', 'Poland': 'Warsaw', 'Portugal': 'Lisbon', 'Romania': 'Bucharest',
        'Russia': 'Moscow', 'San Marino': 'City of San Marino', 'Serbia': 'Belgrade', 'Slovakia': 'Bratislava', 'Slovenia': 'Ljubljana',
        'Spain': 'Madrid', 'Sweden': 'Stockholm', 'Switzerland': 'Bern', 'Turkey': 'Ankara', 'Ukraine': 'Kyiv',
        'United Kingdom': 'London', 'Vatican City': 'Vatican City'
    };
    const WORLD_CAPITALS = Object.assign({}, EUROPE_CAPITALS, {
        'Afghanistan': 'Kabul', 'Algeria': 'Algiers', 'Angola': 'Luanda', 'Antigua and Barbuda': "Saint John's", 'Argentina': 'Buenos Aires',
        'Armenia': 'Yerevan', 'Australia': 'Canberra', 'Azerbaijan': 'Baku', 'Bahamas': 'Nassau', 'Bahrain': 'Manama',
        'Bangladesh': 'Dhaka', 'Barbados': 'Bridgetown', 'Belize': 'Belmopan', 'Benin': 'Porto-Novo', 'Bhutan': 'Thimphu',
        'Bolivia': 'Sucre / La Paz', 'Botswana': 'Gaborone', 'Brazil': 'Brasília', 'Brunei': 'Bandar Seri Begawan', 'Burkina Faso': 'Ouagadougou',
        'Burundi': 'Gitega', 'Cambodia': 'Phnom Penh', 'Cameroon': 'Yaoundé', 'Canada': 'Ottawa', 'Cape Verde': 'Praia',
        'Central African Republic': 'Bangui', 'Chad': "N'Djamena", 'Chile': 'Santiago', 'China': 'Beijing', 'Colombia': 'Bogotá',
        'Comoros': 'Moroni', 'Costa Rica': 'San José', "Côte d'Ivoire": 'Yamoussoukro', 'Cuba': 'Havana',
        'Democratic Republic of the Congo': 'Kinshasa', 'Djibouti': 'Djibouti', 'Dominica': 'Roseau', 'Dominican Republic': 'Santo Domingo',
        'Ecuador': 'Quito', 'Egypt': 'Cairo', 'El Salvador': 'San Salvador', 'Equatorial Guinea': 'Malabo', 'Eritrea': 'Asmara',
        'Eswatini': 'Mbabane', 'Ethiopia': 'Addis Ababa', 'Fiji': 'Suva', 'Gabon': 'Libreville', 'Gambia': 'Banjul',
        'Georgia': 'Tbilisi', 'Ghana': 'Accra', 'Grenada': "St. George's", 'Guatemala': 'Guatemala City', 'Guinea': 'Conakry',
        'Guinea-Bissau': 'Bissau', 'Guyana': 'Georgetown', 'Haiti': 'Port-au-Prince', 'Honduras': 'Tegucigalpa', 'India': 'New Delhi',
        'Indonesia': 'Jakarta', 'Iran': 'Tehran', 'Iraq': 'Baghdad', 'Israel': 'Jerusalem', 'Jamaica': 'Kingston',
        'Japan': 'Tokyo', 'Jordan': 'Amman', 'Kazakhstan': 'Astana', 'Kenya': 'Nairobi', 'Kiribati': 'South Tarawa',
        'Kuwait': 'Kuwait City', 'Kyrgyzstan': 'Bishkek', 'Laos': 'Vientiane', 'Lebanon': 'Beirut', 'Lesotho': 'Maseru',
        'Liberia': 'Monrovia', 'Libya': 'Tripoli', 'Madagascar': 'Antananarivo', 'Malawi': 'Lilongwe', 'Malaysia': 'Kuala Lumpur',
        'Maldives': 'Malé', 'Mali': 'Bamako', 'Marshall Islands': 'Majuro', 'Mauritania': 'Nouakchott', 'Mauritius': 'Port Louis',
        'Mexico': 'Mexico City', 'Micronesia': 'Palikir', 'Mongolia': 'Ulaanbaatar', 'Morocco': 'Rabat', 'Mozambique': 'Maputo',
        'Myanmar': 'Naypyidaw', 'Namibia': 'Windhoek', 'Nauru': 'Yaren', 'Nepal': 'Kathmandu', 'New Zealand': 'Wellington',
        'Nicaragua': 'Managua', 'Niger': 'Niamey', 'Nigeria': 'Abuja', 'North Korea': 'Pyongyang', 'Oman': 'Muscat',
        'Pakistan': 'Islamabad', 'Palau': 'Ngerulmud', 'Palestine': 'Ramallah', 'Panama': 'Panama City', 'Papua New Guinea': 'Port Moresby',
        'Paraguay': 'Asunción', 'Peru': 'Lima', 'Philippines': 'Manila', 'Qatar': 'Doha', 'Republic of the Congo': 'Brazzaville',
        'Rwanda': 'Kigali', 'Saint Kitts and Nevis': 'Basseterre', 'Saint Lucia': 'Castries', 'Saint Vincent and the Grenadines': 'Kingstown',
        'Samoa': 'Apia', 'Saudi Arabia': 'Riyadh', 'Senegal': 'Dakar', 'Seychelles': 'Victoria', 'Sierra Leone': 'Freetown',
        'Singapore': 'Singapore', 'Solomon Islands': 'Honiara', 'Somalia': 'Mogadishu', 'South Africa': 'Pretoria', 'South Korea': 'Seoul',
        'South Sudan': 'Juba', 'Sri Lanka': 'Sri Jayawardenepura Kotte', 'Sudan': 'Khartoum', 'Suriname': 'Paramaribo', 'Syria': 'Damascus',
        'São Tomé and Príncipe': 'São Tomé', 'Taiwan': 'Taipei', 'Tajikistan': 'Dushanbe', 'Tanzania': 'Dodoma', 'Thailand': 'Bangkok',
        'Timor-Leste': 'Dili', 'Togo': 'Lomé', 'Tonga': "Nukuʻalofa", 'Trinidad and Tobago': 'Port of Spain', 'Tunisia': 'Tunis',
        'Turkmenistan': 'Ashgabat', 'Tuvalu': 'Funafuti', 'Uganda': 'Kampala', 'United Arab Emirates': 'Abu Dhabi',
        'United States': 'Washington, D.C.', 'Uruguay': 'Montevideo', 'Uzbekistan': 'Tashkent', 'Vanuatu': 'Port Vila',
        'Venezuela': 'Caracas', 'Vietnam': 'Hanoi', 'Yemen': 'Sanaa', 'Zambia': 'Lusaka', 'Zimbabwe': 'Harare'
    });
    const CAPITALS = { usa: US_CAPITALS, europe: EUROPE_CAPITALS, world: WORLD_CAPITALS };

    // ---------- STATE ----------
    let pRegion = 'usa';
    let pType = 'places';          // 'places' (states / countries) or 'capitals' (hard mode)
    let pMap = null, pKind = null;
    let pEntries = [];
    let pDeck = [], pIdx = 0, pTarget = null;
    let pFound = new Set();
    let pSelected = null, pWrongEntry = null, pMissedEntry = null;
    let pRunning = false;
    let pLastResult = null;
    let pAudio = null;
    let pBuilding = null;
    const boards = {};

    try {
        const last = JSON.parse(localStorage.getItem(LAST_KEY) || '{}');
        if (REGIONS[last.region]) pRegion = last.region;
        if (validType(pRegion, last.type)) pType = last.type;
        else pType = pRegion === 'water' ? 'all' : 'places';
    } catch (e) {}

    const $ = id => document.getElementById(id);
    function validType(region, type) {
        return region === 'water' ? !!WATER_TYPES[type] : (type === 'places' || type === 'capitals');
    }
    const norm = s => String(s || '').trim().toLowerCase();
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const isHard = () => pType === 'capitals';

    function getBest(region = pRegion, type = pType) { return Number(localStorage.getItem(BEST_KEY(region, type))) || 0; }
    function setBest(v, region = pRegion, type = pType) { try { localStorage.setItem(BEST_KEY(region, type), String(v)); } catch (e) {} }
    function totalFor(region, type) {
        if (region === 'water') return (WATER_TYPES[type] || WATER_TYPES.all).cats.reduce((n, c) => n + WATER_COUNTS[c], 0);
        if (type === 'capitals') return Object.keys(CAPITALS[region]).length;
        return { usa: 50, europe: 47, world: 197 }[region];
    }
    function typeLabel(region = pRegion, type = pType) {
        if (region === 'water') return (WATER_TYPES[type] || WATER_TYPES.all).label;
        return type === 'capitals' ? 'CAPITALS' : REGIONS[region].unit.toUpperCase();
    }
    // what one thing in this run is called ("state", "river", "sea or ocean"...)
    function oneName(region = pRegion, type = pType) {
        return region === 'water' ? (WATER_TYPES[type] || WATER_TYPES.all).one : REGIONS[region].one;
    }

    function board(region) {
        if (!boards[region] && window.GeoLeaderboard) {
            boards[region] = window.GeoLeaderboard.create({
                table: REGIONS[region].table,
                localKey: `geo_practice_capitals_lb_${region}`,
                unit: 'Capitals',
                getClient: () => supabaseClient,
                getUserId: () => currentUserId,
                ensureAuth: initAuth,
                getTotal: () => totalFor(region, 'capitals')
            });
        }
        return boards[region];
    }

    // ---------- SOUND ----------
    function beep(type) {
        try {
            if (!pAudio) pAudio = new (window.AudioContext || window.webkitAudioContext)();
            if (pAudio.state === 'suspended') pAudio.resume();
            const now = pAudio.currentTime;
            const osc = pAudio.createOscillator();
            const gain = pAudio.createGain();
            if (type === 'good') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(523.25, now);
                osc.frequency.setValueAtTime(783.99, now + 0.08);
                gain.gain.setValueAtTime(0.14, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            } else if (type === 'bad') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.linearRampToValueAtTime(80, now + 0.45);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
            } else if (type === 'win') {
                osc.type = 'triangle';
                [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => osc.frequency.setValueAtTime(f, now + i * 0.12));
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
            } else {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, now);
                osc.frequency.exponentialRampToValueAtTime(900, now + 0.1);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
            }
            osc.connect(gain); gain.connect(pAudio.destination);
            osc.start(now); osc.stop(now + 0.8);
        } catch (e) {}
    }

    // ---------- SCREEN ----------
    function ensureScreen() {
        if ($('practice-screen')) return;
        const el = document.createElement('div');
        el.id = 'practice-screen';
        el.className = 'screen';
        el.innerHTML = `
            <div class="prac-wrap">
                <header class="prac-hud">
                    <button id="prac-home-btn" class="space-btn secondary-btn prac-small-btn">🏠 Home</button>
                    <div class="prac-title" id="prac-title">PRACTICE</div>
                    <button id="prac-mode-btn" class="space-btn secondary-btn prac-small-btn">⚙️ Mode</button>
                </header>
                <div class="prac-prompt" id="prac-prompt">Choose a practice mode</div>
                <div class="prac-tap-hint" id="prac-tap-hint">Tap a ${'place'} once to select it, then tap it again to lock it in.</div>
                <div class="prac-progress">
                    <span class="prac-life" id="prac-life">❤️ 1 LIFE</span>
                    <div class="prac-bar"><div class="prac-bar-fill" id="prac-bar-fill"></div></div>
                    <span class="prac-count" id="prac-count">0 / 0</span>
                </div>
                <div class="prac-map-wrap">
                    <div id="practice-map"></div>
                    <div class="prac-loading hidden" id="prac-loading">Loading map...</div>
                </div>
            </div>

            <!-- SETUP -->
            <div id="prac-setup" class="modal hidden">
                <div class="modal-content prac-card">
                    <div class="prac-kicker">📚 PRACTICE MODE</div>
                    <h2>PICK YOUR MAP</h2>
                    <div class="prac-picker four" id="prac-region-picker">
                        <button type="button" class="prac-pick" data-region="usa">🇺🇸<span>USA</span></button>
                        <button type="button" class="prac-pick" data-region="europe">🇪🇺<span>EUROPE</span></button>
                        <button type="button" class="prac-pick" data-region="world">🌍<span>WORLD</span></button>
                        <button type="button" class="prac-pick" data-region="water">🌊<span>WATER</span></button>
                    </div>
                    <div class="prac-types water hidden" id="prac-water-types"></div>
                    <div class="prac-types" id="prac-land-types">
                        <button type="button" class="prac-type" data-type="places">
                            <span class="prac-type-name" id="prac-type-places-name">🗺️ STATES</span>
                            <span class="prac-type-sub" id="prac-type-places-sub">Find each state on the map</span>
                            <span class="prac-type-best" id="prac-type-places-best">Best: 0 / 50</span>
                        </button>
                        <button type="button" class="prac-type hard" data-type="capitals">
                            <span class="prac-type-name">🏛️ CAPITALS <em>💀 HARD</em></span>
                            <span class="prac-type-sub" id="prac-type-capitals-sub">Find the state for each capital</span>
                            <span class="prac-type-best" id="prac-type-capitals-best">Best: 0 / 50 · 🏆 Leaderboard</span>
                        </button>
                    </div>
                    <ul class="prac-rules">
                        <li>❤️ <b>One life</b>: one wrong answer ends the run</li>
                        <li>🚫 <b>No names</b> on the map</li>
                        <li>👆👆 Tap once to select, <b>tap again</b> to lock it in</li>
                        <li id="prac-rule-board">🏆 Capitals runs go on the <b>online leaderboard</b></li>
                    </ul>
                    <button id="prac-start-btn" class="space-btn">🚀 START PRACTICE</button>
                    <div class="prac-btn-row">
                        <button id="prac-setup-lb-btn" class="space-btn secondary-btn">🏆 LEADERBOARD</button>
                        <button id="prac-setup-home-btn" class="space-btn secondary-btn">🏠 HOME</button>
                    </div>
                </div>
            </div>

            <!-- RESULTS -->
            <div id="prac-results" class="modal hidden">
                <div class="modal-content prac-card">
                    <div class="prac-kicker" id="prac-res-kicker">PRACTICE</div>
                    <h2 id="prac-res-title">MISSION OVER</h2>
                    <div class="prac-res-score" id="prac-res-score">0 / 0</div>
                    <div class="prac-res-detail" id="prac-res-detail"></div>
                    <div class="prac-res-best" id="prac-res-best"></div>
                    <button id="prac-again-btn" class="space-btn">🔁 PLAY AGAIN</button>
                    <div class="prac-btn-row">
                        <button id="prac-map-btn" class="space-btn secondary-btn">🗺️ SEE MAP</button>
                        <button id="prac-change-btn" class="space-btn secondary-btn">⚙️ CHANGE MODE</button>
                    </div>
                    <div class="prac-btn-row">
                        <button id="prac-res-lb-btn" class="space-btn secondary-btn">🏆 LEADERBOARD</button>
                        <button id="prac-res-home-btn" class="space-btn secondary-btn">🏠 HOME</button>
                    </div>
                </div>
            </div>

            <!-- CAPITALS LEADERBOARD -->
            <div id="prac-lb" class="modal hidden">
                <div class="modal-content prac-card prac-lb-card">
                    <button id="prac-lb-close" class="lb-close-x" aria-label="Close leaderboard">✕</button>
                    <div class="prac-kicker">🏛️ CAPITALS · HARD MODE</div>
                    <h2>LEADERBOARD</h2>
                    <div class="prac-picker small" id="prac-lb-picker">
                        <button type="button" class="prac-pick" data-region="usa">🇺🇸<span>USA</span></button>
                        <button type="button" class="prac-pick" data-region="europe">🇪🇺<span>EUROPE</span></button>
                        <button type="button" class="prac-pick" data-region="world">🌍<span>WORLD</span></button>
                    </div>
                    <div class="prac-lb-note">🌙 A Moon landing = every capital answered with no mistakes</div>
                    <div id="prac-lb-list" class="prac-lb-list"></div>
                    <div class="prac-lb-name">
                        <span>Playing as: <b id="prac-lb-callsign">—</b></span>
                        <button id="prac-lb-rename" class="space-btn secondary-btn prac-small-btn">✏️ CHANGE NAME</button>
                    </div>
                </div>
            </div>

            <button id="prac-show-results" class="space-btn prac-float-btn hidden">📊 RESULTS</button>
        `;
        document.body.appendChild(el);

        $('prac-home-btn').onclick = goHome;
        $('prac-setup-home-btn').onclick = goHome;
        $('prac-res-home-btn').onclick = goHome;
        $('prac-mode-btn').onclick = () => { if (pRunning) abandonRun(); showSetup(); };
        $('prac-change-btn').onclick = showSetup;
        $('prac-start-btn').onclick = () => { beep('ok'); startRun(); };
        $('prac-again-btn').onclick = () => { beep('ok'); startRun(); };
        $('prac-setup-lb-btn').onclick = () => openLeaderboard(pRegion);
        $('prac-res-lb-btn').onclick = () => openLeaderboard(pRegion);
        $('prac-lb-close').onclick = () => $('prac-lb').classList.add('hidden');
        $('prac-lb-rename').onclick = async () => {
            if (!window.GeoLeaderboard) return;
            await window.GeoLeaderboard.changeCallsign();
            setTimeout(() => renderLeaderboard(), 600);
        };
        $('prac-map-btn').onclick = () => {
            $('prac-results').classList.add('hidden');
            $('prac-show-results').classList.remove('hidden');
            if (pMap) setTimeout(() => pMap.invalidateSize(), 50);
        };
        $('prac-show-results').onclick = () => {
            $('prac-show-results').classList.add('hidden');
            $('prac-results').classList.remove('hidden');
        };
        el.querySelectorAll('#prac-region-picker .prac-pick').forEach(b => b.onclick = () => {
            beep('ok');
            pRegion = b.dataset.region;
            if (!validType(pRegion, pType)) pType = pRegion === 'water' ? 'all' : 'places';
            saveChoice();
            refreshSetup();
            ensureMap(pRegion).catch(err => console.warn(err));
        });
        $('prac-water-types').innerHTML = Object.entries(WATER_TYPES).map(([key, t]) => `
            <button type="button" class="prac-type${key === 'all' ? ' wide' : ''}" data-type="${key}">
                <span class="prac-type-name">${t.icon} ${t.label}</span>
                <span class="prac-type-sub">${t.sub}</span>
                <span class="prac-type-best" data-best="${key}">Best: 0</span>
            </button>`).join('');
        el.querySelectorAll('.prac-type').forEach(b => b.onclick = () => {
            beep('ok');
            pType = b.dataset.type;
            saveChoice();
            refreshSetup();
            if (pKind === 'water') paintAll();
        });
        el.querySelectorAll('#prac-lb-picker .prac-pick').forEach(b => b.onclick = () => { beep('ok'); renderLeaderboard(b.dataset.region); });
        window.addEventListener('resize', () => { if (pMap) pMap.invalidateSize(); });
    }

    function saveChoice() { try { localStorage.setItem(LAST_KEY, JSON.stringify({ region: pRegion, type: pType })); } catch (e) {} }

    function showScreen() {
        const home = $('home-screen');
        const game = $('game-screen');
        if (home) { home.classList.add('hidden'); home.style.display = 'none'; }
        if (game) { game.classList.remove('active'); game.style.display = 'none'; }
        const ps = $('practice-screen');
        ps.classList.add('active');
        ps.style.display = 'flex';
    }

    function goHome() {
        if (pRunning) abandonRun();
        ['prac-setup', 'prac-results', 'prac-lb'].forEach(id => $(id) && $(id).classList.add('hidden'));
        $('prac-show-results') && $('prac-show-results').classList.add('hidden');
        const ps = $('practice-screen');
        if (ps) { ps.classList.remove('active'); ps.style.display = 'none'; }
        const home = $('home-screen');
        if (home) { home.classList.remove('hidden'); home.style.display = ''; }
        if (window.refreshDailyHome) window.refreshDailyHome();
    }

    function refreshSetup() {
        const r = REGIONS[pRegion];
        document.querySelectorAll('#prac-region-picker .prac-pick').forEach(b => b.classList.toggle('active', b.dataset.region === pRegion));
        document.querySelectorAll('.prac-type').forEach(b => b.classList.toggle('active', b.dataset.type === pType));
        if (pRegion !== 'water') $('prac-type-places-name').textContent = '🗺️ ' + r.unit.toUpperCase();
        $('prac-type-places-sub').textContent = `Find every ${r.one} on the map`;
        $('prac-type-capitals-sub').textContent = `Find the ${r.one} for each capital city`;
        if (pRegion !== 'water') $('prac-type-places-best').textContent = `Best: ${getBest(pRegion, 'places')} / ${totalFor(pRegion, 'places')}`;
        const water = pRegion === 'water';
        $('prac-water-types').classList.toggle('hidden', !water);
        $('prac-land-types').classList.toggle('hidden', water);
        if (!water) $('prac-type-capitals-best').textContent = `Best: ${getBest(pRegion, 'capitals')} / ${totalFor(pRegion, 'capitals')} · 🏆 Leaderboard`;
        document.querySelectorAll('#prac-water-types .prac-type-best').forEach(el => {
            el.textContent = `Best: ${getBest('water', el.dataset.best)} / ${totalFor('water', el.dataset.best)}`;
        });
        $('prac-rule-board').innerHTML = water
            ? '🏞️ Only the kind of water you pick is <b>clickable</b>; the rest is dimmed'
            : isHard()
                ? '🏆 This run goes on the <b>online leaderboard</b>'
                : '🏆 Pick <b>Capitals</b> to play for the online leaderboard';
        $('prac-setup-lb-btn').style.display = water ? 'none' : '';
        $('prac-start-btn').textContent = water
            ? `🌊 START ${typeLabel()} PRACTICE`
            : isHard() ? '💀 START CAPITALS (HARD)' : `🚀 START ${r.unit.toUpperCase()} PRACTICE`;
        $('prac-start-btn').classList.toggle('hard', isHard());
        $('prac-title').textContent = pRegion === 'water' ? `🌊 ${typeLabel()}` : `${r.label} · ${typeLabel()}${isHard() ? ' 💀' : ''}`;
    }

    function showSetup() {
        ensureScreen();
        showScreen();
        $('prac-results').classList.add('hidden');
        $('prac-show-results').classList.add('hidden');
        refreshSetup();
        $('prac-prompt').textContent = 'Choose a practice mode';
        $('prac-setup').classList.remove('hidden');
        ensureMap(pRegion).catch(err => console.warn(err));
    }

    // ---------- MAP ----------
    const STYLE_BASE = { color: '#38bdf8', weight: 1.2, fillColor: '#1e293b', fillOpacity: 0.95 };
    const STYLE_HOVER = { color: '#67e8f9', weight: 2, fillColor: '#334155', fillOpacity: 1 };
    const STYLE_FOUND = { color: '#86efac', weight: 1.6, fillColor: '#16a34a', fillOpacity: 0.95 };
    const STYLE_SELECTED = { color: '#fde68a', weight: 2.5, fillColor: '#f59e0b', fillOpacity: 0.95 };
    const STYLE_WRONG = { color: '#fca5a5', weight: 2.5, fillColor: '#b91c1c', fillOpacity: 0.95 };
    const STYLE_MISSED = { color: '#ffffff', weight: 3, fillColor: '#d97706', fillOpacity: 0.95 };

    const STYLE_DIM = { color: '#1e3a5f', weight: 0.8, fillColor: '#0b1a2e', fillOpacity: 0.6 };
    // in water mode only the chosen kind of water is in play
    function inPlay(entry) {
        if (pKind !== 'water') return true;
        return (WATER_TYPES[pType] || WATER_TYPES.all).cats.includes(entry.cat);
    }
    function entryStyle(entry) {
        if (!inPlay(entry)) return STYLE_DIM;
        if (entry === pWrongEntry) return STYLE_WRONG;
        if (entry === pMissedEntry) return STYLE_MISSED;
        if (pFound.has(entry)) return STYLE_FOUND;
        if (pRunning && pSelected === entry) return STYLE_SELECTED;
        return STYLE_BASE;
    }
    function applyStyle(entry, st) { entry.parts.forEach(p => p.layer.setStyle(p.tf(st))); }
    function paint(entry) { if (entry) applyStyle(entry, entryStyle(entry)); }
    function paintAll() { pEntries.forEach(paint); }

    function newEntry(name, cat) {
        const entry = { name, norm: norm(name), parts: [], cat: cat || '' };
        pEntries.push(entry);
        return entry;
    }
    function addPart(entry, layer, tf) {
        entry.parts.push({ layer, tf: tf || (s => s) });
        layer.on('mouseover', () => { if (pRunning && entryStyle(entry) === STYLE_BASE) applyStyle(entry, STYLE_HOVER); });
        layer.on('mouseout', () => paint(entry));
        layer.on('click', e => { if (e && e.originalEvent) L.DomEvent.stopPropagation(e); handleClick(entry); });
    }
    function entryBounds(entry) {
        let b = null;
        entry.parts.forEach(p => {
            const lb = p.layer.getBounds ? p.layer.getBounds() : null;
            if (lb && lb.isValid && lb.isValid()) b = b ? b.extend(lb) : L.latLngBounds(lb.getSouthWest(), lb.getNorthEast());
        });
        return b;
    }

    const geoCache = {};
    let buildToken = 0;
    function ensureMap(region) {
        if (pMap && pKind === region) return Promise.resolve();
        if (pBuilding && pBuilding.region === region) return pBuilding.promise;
        const token = ++buildToken;
        const promise = (async () => {
            if (!window.L) throw new Error('Map library (Leaflet) did not load.');
            if (pMap) { pMap.remove(); pMap = null; }
            pEntries = [];
            pKind = region;
            $('prac-loading').classList.remove('hidden');
            try {
                if (!geoCache[region]) {
                    const res = await fetch(REGIONS[region].map);
                    if (!res.ok) throw new Error('Could not load ' + REGIONS[region].map);
                    geoCache[region] = await res.text();
                }
                if (token !== buildToken) return;   // the player switched maps while this one loaded
                const geo = JSON.parse(geoCache[region]);
                if (region === 'usa') buildUSA(geo);
                else if (region === 'europe') buildEurope(geo);
                else if (region === 'water') buildWater(geo);
                else buildWorld(geo);
                fitMap();
                setTimeout(fitMap, 120);
            } finally {
                if (token === buildToken) {
                    $('prac-loading').classList.add('hidden');
                    pBuilding = null;
                }
            }
        })();
        pBuilding = { region, promise };
        return promise;
    }

    function baseMap(opts) {
        return L.map('practice-map', Object.assign({
            zoomControl: true, doubleClickZoom: false, attributionControl: false, zoomSnap: 0.25
        }, opts));
    }

    // USA: Alaska and Hawaii moved into insets so the whole country fits on screen
    const INSETS = {
        alaska: { lng: c => -124.5 + (c + 170) * 0.33, lat: c => 20.6 + (c - 51) * 0.45 },
        hawaii: { lng: c => c + 50.5, lat: c => c + 3.8 }
    };
    const HI_CENTER = [20.6 + 3.8, -157.3 + 50.5];
    function buildUSA(geo) {
        geo.features = (geo.features || []).filter(f => {
            const n = norm(f.properties && (f.properties.name || f.properties.NAME));
            return n && n !== 'puerto rico' && n !== 'district of columbia';
        });
        geo.features.forEach(f => {
            const key = norm(f.properties.name || f.properties.NAME);
            const t = INSETS[key];
            if (!t || !f.geometry) return;
            let polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
            if (key === 'alaska') polys = polys.filter(poly => poly[0].every(pt => pt[0] < 0));
            polys = polys.map(poly => poly.map(ring => ring.map(([x, y]) => [t.lng(x), t.lat(y)])));
            f.geometry = { type: 'MultiPolygon', coordinates: polys };
        });
        pMap = baseMap({ center: [37.8, -96], zoom: 4, minZoom: 2, maxZoom: 10 });
        L.geoJSON(geo, {
            style: () => STYLE_BASE,
            onEachFeature: (feature, layer) => {
                const name = feature.properties.name || feature.properties.NAME;
                const entry = newEntry(name);
                addPart(entry, layer);
                if (norm(name) === 'hawaii') {
                    // the islands are tiny, so Hawaii also gets a big round tap zone (no label)
                    const circle = L.circle(L.latLng(...HI_CENTER), { radius: 330000, interactive: true }).addTo(pMap);
                    addPart(entry, circle, s => ({ color: s.color, weight: 1.8, fillColor: s.fillColor, fillOpacity: (s === STYLE_BASE || s === STYLE_HOVER) ? 0.15 : 0.6, dashArray: '5 4' }));
                }
            }
        }).addTo(pMap);
        paintAll();
    }

    // EUROPE: tiny countries are small squares on their real location (no label)
    const EU_MICRO = {
        AD: [42.54, 1.58], MC: [43.74, 7.42], LI: [47.16, 9.55], SM: [43.94, 12.46], VA: [41.90, 12.45], MT: [35.90, 14.40]
    };
    function microSquare(center) {
        const marker = L.marker(L.latLng(...center), {
            icon: L.divIcon({ className: 'prac-micro-icon', html: '<div class="prac-micro-sq"></div>', iconSize: [34, 34], iconAnchor: [17, 17] }),
            keyboard: false, zIndexOffset: 900
        }).addTo(pMap);
        let st = STYLE_BASE;
        const apply = () => {
            const el = marker.getElement();
            const sq = el && el.querySelector('.prac-micro-sq');
            if (!sq) return;
            sq.style.borderColor = st.color;
            sq.style.background = st.fillColor;
            sq.style.borderWidth = (st.weight >= 2.5 ? 3 : 2) + 'px';
        };
        marker.on('add', apply);
        apply();
        return {
            setStyle(s) { st = s; apply(); },
            on(evt, fn) { marker.on(evt, fn); return this; },
            getBounds() { const c = marker.getLatLng(); return L.latLngBounds(c, c); }
        };
    }
    function buildEurope(geo) {
        pMap = baseMap({ center: [54.5, 14], zoom: 4, minZoom: 2.5, maxZoom: 11 });
        const abbrOf = f => String((f.properties && f.properties.abbr) || '').toUpperCase();
        L.geoJSON(geo, {
            style: () => STYLE_BASE,
            filter: f => !EU_MICRO[abbrOf(f)],
            onEachFeature: (feature, layer) => {
                const name = feature.properties && feature.properties.name;
                if (!name) return;
                addPart(newEntry(name), layer);
            }
        }).addTo(pMap);
        (geo.features || []).forEach(f => {
            const center = EU_MICRO[abbrOf(f)];
            const name = f.properties && f.properties.name;
            if (!center || !name) return;
            addPart(newEntry(name), microSquare(center));
        });
        paintAll();
    }

    // WORLD: same map file as Global elimination - island countries get a dashed clickable zone,
    // tiny countries get a small square. No names are drawn.
    const zoneStyle = s => ({ ...s, weight: Math.max(1.1, (s.weight || 1) * 0.8), dashArray: '5 4', fillOpacity: (s.fillOpacity || 0) * 0.35 });
    const thinStyle = s => ({ ...s, weight: Math.max(0.6, (s.weight || 1) * 0.65) });
    function buildWorld(geo) {
        pMap = baseMap({
            center: [20, 10], zoom: 2, minZoom: 1, maxZoom: 8, zoomSnap: 0.5, zoomDelta: 1, wheelPxPerZoomLevel: 60,
            worldCopyJump: false, maxBounds: [[-75, -200], [85, 215]], maxBoundsViscosity: 1.0,
            renderer: L.canvas({ padding: 0.15, tolerance: 4 })
        });
        const byName = {};
        const entryFor = props => byName[props.name] || (byName[props.name] = newEntry(props.name));
        const outline = (entry, ring, kind) => {
            const tf = kind === 'zone' ? zoneStyle : thinStyle;
            const lyr = L.polygon(ring.map(([x, y]) => [y, x]), tf(STYLE_BASE)).addTo(pMap);
            addPart(entry, lyr, tf);
        };
        const feats = (geo.features || []).filter(f => f.properties && f.properties.name);
        feats.forEach(f => { if (!f.properties.neutral && f.properties.zones) f.properties.zones.forEach(r => outline(entryFor(f.properties), r, 'zone')); });
        feats.forEach(f => {
            const p = f.properties;
            if (!f.geometry) return;
            if (p.neutral) {
                L.geoJSON(f, { style: () => ({ color: '#334155', weight: 0.6, fillColor: '#0b1220', fillOpacity: 0.9, dashArray: '3 3' }), interactive: false }).addTo(pMap);
                return;
            }
            const entry = entryFor(p);
            L.geoJSON(f, { style: () => thinStyle(STYLE_BASE), smoothFactor: 1.5 }).eachLayer(l => { l.addTo(pMap); addPart(entry, l, thinStyle); });
        });
        feats.forEach(f => { if (!f.properties.neutral && f.properties.box) outline(entryFor(f.properties), f.properties.box, 'box'); });
        paintAll();
    }

    // WATER: world map of rivers, lakes, seas, oceans and bays. Land is a plain backdrop (not clickable).
    // Rivers are thin, so each one also gets a wide invisible line on top that is easy to tap.
    const WATER_ORDER = { land: 0, ocean: 1, sea: 2, bay: 3, lake: 4, river: 5 };
    const riverLine = s => s === STYLE_BASE
        ? { color: '#38bdf8', weight: 2.2, opacity: 1 }
        : s === STYLE_DIM ? { color: '#1e4a6e', weight: 1.2, opacity: 0.8 }
        : { color: s === STYLE_HOVER ? '#a5f3fc' : s.fillColor, weight: 4.5, opacity: 1 };
    const riverHit = () => ({ color: '#000', weight: 16, opacity: 0 });
    const waterFill = s => s === STYLE_BASE ? { color: '#38bdf8', weight: 1, fillColor: '#0c4a6e', fillOpacity: 0.75 } : s;
    function buildWater(geo) {
        pMap = baseMap({
            center: [20, 10], zoom: 2, minZoom: 1, maxZoom: 8, zoomSnap: 0.5, zoomDelta: 1, wheelPxPerZoomLevel: 60,
            worldCopyJump: false, maxBounds: [[-85, -200], [88, 215]], maxBoundsViscosity: 1.0,
            renderer: L.canvas({ padding: 0.15, tolerance: 6 })
        });
        // plain water underneath everything, so straits and channels that are not in the quiz still look like water
        L.rectangle([[-90, -200], [90, 215]], { stroke: false, fillColor: '#0a3958', fillOpacity: 1, interactive: false }).addTo(pMap);
        const feats = (geo.features || []).filter(f => f.properties && f.geometry)
            .sort((a, b) => (WATER_ORDER[a.properties.cat] || 0) - (WATER_ORDER[b.properties.cat] || 0));
        feats.forEach(f => {
            const p = f.properties;
            if (p.cat === 'land') {
                L.geoJSON(f, { style: () => ({ color: '#6b9a6f', weight: 0.8, fillColor: '#2f5236', fillOpacity: 1 }), interactive: false }).addTo(pMap);
                return;
            }
            const entry = newEntry(p.name, p.cat);
            if (p.cat === 'river') {
                L.geoJSON(f, { style: () => riverLine(STYLE_BASE), interactive: false }).eachLayer(l => { l.addTo(pMap); entry.parts.push({ layer: l, tf: riverLine }); });
                L.geoJSON(f, { style: riverHit }).eachLayer(l => { l.addTo(pMap); addPart(entry, l, riverHit); });
            } else {
                L.geoJSON(f, { style: () => waterFill(STYLE_BASE), smoothFactor: 1.2 }).eachLayer(l => { l.addTo(pMap); addPart(entry, l, waterFill); });
            }
        });
        paintAll();
    }

    function fitMap() {
        if (!pMap) return;
        pMap.invalidateSize();
        if (pKind === 'world' || pKind === 'water') pMap.fitBounds([[-56, -170], [78, 190]], { padding: [4, 4] });
        else if (pKind === 'europe') pMap.fitBounds([[34.5, -12], [66, 42]], { padding: [6, 6] });
        else pMap.fitBounds([[17.0, -125.0], [49.4, -66.5]], { padding: [6, 6] });
    }

    // ---------- GAME FLOW ----------
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    async function startRun() {
        ensureScreen();
        showScreen();
        ['prac-setup', 'prac-results', 'prac-lb'].forEach(id => $(id).classList.add('hidden'));
        $('prac-show-results').classList.add('hidden');
        refreshSetup();

        // capitals count for the leaderboard, so get the player's name before the run
        if (isHard() && window.GeoLeaderboard && !window.GeoLeaderboard.getCallsign()) {
            await window.GeoLeaderboard.ensureCallsign('Capitals mode counts for the leaderboard. What name should we show?');
        }

        try {
            await ensureMap(pRegion);
        } catch (err) {
            $('prac-prompt').textContent = 'ERROR: ' + err.message;
            return;
        }

        const caps = CAPITALS[pRegion] || {};
        pDeck = shuffle(pEntries.filter(e => inPlay(e) && (!isHard() || caps[e.name])));
        pIdx = 0;
        pFound = new Set();
        pSelected = pWrongEntry = pMissedEntry = null;
        pLastResult = null;
        pRunning = true;
        $('prac-life').classList.remove('lost');
        $('prac-life').textContent = '❤️ 1 LIFE';
        fitMap();
        paintAll();
        nextTarget();
    }

    function promptHTML(entry) {
        if (isHard()) {
            const cap = CAPITALS[pRegion][entry.name];
            return `🏛️ <b>${esc(cap)}</b> is the capital of which ${REGIONS[pRegion].one}?`;
        }
        return `📍 Find <b>${esc(entry.name)}</b>`;
    }

    function nextTarget() {
        pTarget = pDeck[pIdx];
        $('prac-prompt').innerHTML = promptHTML(pTarget);
        $('prac-prompt').classList.remove('flash-good');
        void $('prac-prompt').offsetWidth;
        if (pIdx > 0) $('prac-prompt').classList.add('flash-good');
        setHint();
        updateHud();
    }

    function updateHud() {
        const total = pDeck.length || totalFor(pRegion, pType);
        $('prac-count').textContent = `${pFound.size} / ${total}`;
        $('prac-bar-fill').style.width = (total ? (pFound.size / total) * 100 : 0) + '%';
    }

    function setHint() {
        const h = $('prac-tap-hint');
        if (pSelected) {
            h.innerHTML = '👆 <b>Tap it again</b> to lock it in, or tap a different one';
            h.classList.add('armed');
        } else {
            h.innerHTML = `Tap a ${oneName()} once to select it, then <b>tap it again</b> to lock it in`;
            h.classList.remove('armed');
        }
    }

    function handleClick(entry) {
        if (!pRunning || !entry || pFound.has(entry) || !inPlay(entry)) return;
        if (pSelected !== entry) {
            const prev = pSelected;
            pSelected = entry;
            paint(prev);
            paint(entry);
            beep('ok');
            setHint();
            return;
        }
        // second tap on the same place: lock it in
        pSelected = null;
        if (entry === pTarget) {
            pFound.add(entry);
            paint(entry);
            beep('good');
            pIdx++;
            if (pIdx >= pDeck.length) { updateHud(); return finishRun(true); }
            nextTarget();
        } else {
            pWrongEntry = entry;
            pMissedEntry = pTarget;
            pRunning = false;
            paint(entry);
            paint(pTarget);
            beep('bad');
            $('prac-life').textContent = '💔 0 LIVES';
            $('prac-life').classList.add('lost');
            $('prac-tap-hint').innerHTML = '❌ Wrong! The right answer is flashing on the map.';
            $('prac-tap-hint').classList.remove('armed');
            showCorrectOnMap(pTarget);
            setTimeout(() => finishRun(false), REVEAL_DELAY_MS);
        }
    }

    function showCorrectOnMap(entry) {
        if (!pMap || !entry) return;
        let n = 0;
        const blink = setInterval(() => {
            n++;
            applyStyle(entry, n % 2 ? STYLE_BASE : STYLE_MISSED);
            if (n >= 6) { clearInterval(blink); paint(entry); }
        }, 220);
        const b = entryBounds(entry);
        if (!b) return;
        const view = pMap.getBounds();
        // small or off-screen answers get zoomed to so the player can actually see them
        const tiny = pMap.latLngToContainerPoint(b.getNorthEast()).distanceTo(pMap.latLngToContainerPoint(b.getSouthWest())) < 30;
        if (tiny || !view.contains(b)) {
            pMap.flyToBounds(b, { padding: [60, 60], maxZoom: pKind === 'world' ? 5 : 6, duration: 0.8 });
        }
    }

    function finishRun(won) {
        pRunning = false;
        pSelected = null;
        const score = pFound.size;
        const total = pDeck.length;
        const prevBest = getBest();
        if (score > prevBest) setBest(score);
        pLastResult = { won, score, total, prevBest, wrong: pWrongEntry, missed: pMissedEntry };

        if (isHard() && score > 0) {
            const lb = board(pRegion);
            if (lb) lb.recordScore(score);
        }
        paintAll();
        showResults();
    }

    // leaving in the middle of a run still saves the score (it can only be lower than finishing)
    function abandonRun() {
        if (!pRunning) return;
        pRunning = false;
        pSelected = null;
        const score = pFound.size;
        if (score > getBest()) setBest(score);
        if (isHard() && score > 0) {
            const lb = board(pRegion);
            if (lb) lb.recordScore(score);
        }
        paintAll();
    }

    function showResults() {
        const r = pLastResult;
        if (!r) return;
        const reg = REGIONS[pRegion];
        $('prac-res-kicker').textContent = pRegion === 'water' ? `WATER · ${typeLabel()} PRACTICE` : `${reg.label} · ${typeLabel()}${isHard() ? ' · 💀 HARD' : ' PRACTICE'}`;
        $('prac-res-title').textContent = r.won ? '🌙 PERFECT RUN!' : '💥 MISSION OVER';
        $('prac-res-score').textContent = `${r.score} / ${r.total}`;
        $('prac-res-score').classList.toggle('won', r.won);

        let detail = '';
        if (r.won) {
            detail = isHard()
                ? `You named the ${reg.one} for <b>every capital</b> with no mistakes. That's a Moon landing on the leaderboard!`
                : `You found <b>every ${oneName()}</b> without a single mistake!`;
        } else if (r.wrong && r.missed) {
            const capList = CAPITALS[pRegion] || {};
            const cap = capList[r.missed.name];
            detail = isHard()
                ? `<b>${esc(cap)}</b> is the capital of <span class="good">${esc(r.missed.name)}</span>.<br>You picked <span class="bad">${esc(r.wrong.name)}</span>${capList[r.wrong.name] ? ` (capital: ${esc(capList[r.wrong.name])})` : ''}.`
                : `You were looking for <span class="good">${esc(r.missed.name)}</span>.<br>You picked <span class="bad">${esc(r.wrong.name)}</span>.`;
        }
        $('prac-res-detail').innerHTML = detail;

        const best = getBest();
        $('prac-res-best').innerHTML = r.score > r.prevBest
            ? `⭐ <b>New personal best!</b> ${best} / ${r.total}`
            : `Personal best: <b>${best}</b> / ${r.total}`;

        $('prac-res-lb-btn').style.display = isHard() ? '' : 'none';
        $('prac-results').classList.remove('hidden');
        if (r.won) beep('win');
    }

    // ---------- LEADERBOARD ----------
    let lbRegion = 'usa';
    function openLeaderboard(region) {
        ensureScreen();
        $('prac-lb').classList.remove('hidden');
        renderLeaderboard(region || lbRegion);
    }
    async function renderLeaderboard(region) {
        if (region) lbRegion = region;
        document.querySelectorAll('#prac-lb-picker .prac-pick').forEach(b => b.classList.toggle('active', b.dataset.region === lbRegion));
        const name = window.GeoLeaderboard ? window.GeoLeaderboard.getCallsign() : '';
        $('prac-lb-callsign').textContent = name || 'not set yet';
        $('prac-lb-rename').textContent = name ? '✏️ CHANGE NAME' : '✏️ SET NAME';
        const list = $('prac-lb-list');
        list.innerHTML = '<p class="prac-lb-loading">Loading telemetry data...</p>';
        const lb = board(lbRegion);
        const want = lbRegion;
        const html = lb ? await lb.buildHTML(false) : '<p class="prac-lb-loading">Leaderboard unavailable.</p>';
        if (want === lbRegion) list.innerHTML = html;
    }

    // ---------- PUBLIC ----------
    return {
        open() { showSetup(); },
        start(region, type) {
            if (REGIONS[region]) pRegion = region;
            if (validType(pRegion, type)) pType = type;
            else if (!validType(pRegion, pType)) pType = pRegion === 'water' ? 'all' : 'places';
            saveChoice();
            startRun();
        },
        openLeaderboard,
        getBest
    };
})();
