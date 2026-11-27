// ==========================================
// GEO-SPACERACE: SPACE RACE ANSWER BANK + FORGIVING SPELLING
// Every place has its official name plus nicknames, abbreviations and old names.
// match() accepts small typos and sound-alike spellings, but only when the
// typed text is clearly closest to ONE place (so "Austria" never counts as Australia).
// ==========================================
window.SRAnswers = (function () {

    // ---------- capitals (same tables as Practice mode) ----------
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
    });;

    const COUNTRIES = ["Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czechia", "Côte d'Ivoire", "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Republic of the Congo", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "São Tomé and Príncipe", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"];
    const STATES = Object.keys(US_CAPITALS).concat(['District of Columbia', 'Puerto Rico']);
    const STATE_CODES = {
        AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',
        FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',
        LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
        MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',
        NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',
        SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',
        WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia',PR:'Puerto Rico'
    };

    // ---------- extra accepted names ----------
    const STATE_ALIASES = {
        'District of Columbia': ['washington dc', 'washington d c', 'dc', 'd c', 'the district', 'washington district of columbia'],
        'Puerto Rico': ['pr', 'puerto rico usa'],
        'Massachusetts': ['mass'], 'Pennsylvania': ['penn', 'penna'], 'Washington': ['washington state', 'wash'],
        'California': ['cali', 'calif'], 'Connecticut': ['conn'], 'Mississippi': ['miss'], 'Tennessee': ['tenn'],
        'New York': ['new york state', 'ny state'], 'Rhode Island': ['rhode'], 'Colorado': ['colo'], 'Oklahoma': ['okla'],
        'Wisconsin': ['wisc'], 'Michigan': ['mich'], 'Minnesota': ['minn'], 'Nebraska': ['neb'], 'Arizona': ['ariz'],
        'Delaware': ['del'], 'Kentucky': ['ky'], 'Virginia': ['virg'], 'West Virginia': ['w virginia', 'w va', 'wva']
    };
    const COUNTRY_ALIASES = {
        'United States': ['usa', 'us', 'u s a', 'u s', 'america', 'united states of america', 'the states'],
        'United Kingdom': ['uk', 'u k', 'britain', 'great britain', 'gb', 'england', 'scotland', 'wales', 'northern ireland', 'united kingdom of great britain and northern ireland'],
        "Côte d'Ivoire": ['ivory coast', 'cote divoire', 'cote d ivoire'],
        'Czechia': ['czech republic', 'czech', 'czechoslovakia'],
        'Eswatini': ['swaziland'], 'Myanmar': ['burma'], 'North Macedonia': ['macedonia'], 'Timor-Leste': ['east timor', 'timor'],
        'Cape Verde': ['cabo verde'],
        'Democratic Republic of the Congo': ['drc', 'dr congo', 'd r congo', 'congo kinshasa', 'zaire', 'democratic republic of congo', 'congo drc'],
        'Republic of the Congo': ['congo', 'congo brazzaville', 'republic of congo', 'roc congo'],
        'Vatican City': ['vatican', 'holy see', 'vatican city state'],
        'Micronesia': ['federated states of micronesia', 'fsm'],
        'South Korea': ['korea', 'republic of korea', 's korea', 'rok'], 'North Korea': ['dprk', 'n korea', 'democratic peoples republic of korea'],
        'Taiwan': ['republic of china', 'chinese taipei', 'formosa'], 'Palestine': ['palestinian territories', 'state of palestine', 'west bank', 'gaza'],
        'Bosnia and Herzegovina': ['bosnia', 'bosnia herzegovina', 'bih'], 'Trinidad and Tobago': ['trinidad', 'tobago'],
        'Antigua and Barbuda': ['antigua', 'barbuda'], 'Saint Kitts and Nevis': ['st kitts', 'st kitts and nevis', 'saint kitts', 'nevis'],
        'Saint Lucia': ['st lucia'], 'Saint Vincent and the Grenadines': ['st vincent', 'saint vincent', 'st vincent and the grenadines', 'grenadines'],
        'São Tomé and Príncipe': ['sao tome', 'sao tome and principe', 'st tome'], 'Turkey': ['turkiye'],
        'Netherlands': ['holland', 'the netherlands', 'nederland'], 'United Arab Emirates': ['uae', 'u a e', 'emirates'],
        'Russia': ['russian federation', 'ussr', 'soviet union'], 'Laos': ['lao', 'lao pdr'], 'Gambia': ['the gambia'], 'Bahamas': ['the bahamas'],
        'Vietnam': ['viet nam'], 'Brunei': ['brunei darussalam'], 'Iran': ['persia'], 'Moldova': ['moldavia'], 'Sri Lanka': ['ceylon'],
        'Thailand': ['siam'], 'Belarus': ['byelorussia', 'belorussia'], 'Kyrgyzstan': ['kyrgyz republic', 'kirghizia'],
        'Central African Republic': ['car', 'c a r'], 'Papua New Guinea': ['png', 'papua'], 'New Zealand': ['nz', 'aotearoa'],
        'South Africa': ['rsa', 's africa'], 'Saudi Arabia': ['saudi', 'ksa'], 'Dominican Republic': ['dr', 'dominican rep'],
        'Philippines': ['the philippines'], 'Marshall Islands': ['marshalls'], 'Solomon Islands': ['solomons'],
        'Equatorial Guinea': ['eq guinea'], 'Guinea-Bissau': ['guinea bissau'], 'Kosovo': ['kosova'], 'Ireland': ['eire', 'republic of ireland'],
        'Germany': ['deutschland'], 'Spain': ['espana'], 'Japan': ['nippon'], 'China': ['prc', 'peoples republic of china'],
        'Australia': ['oz'], 'Mexico': ['mexico'], 'Syria': ['syrian arab republic'], 'Libya': ['libyan arab jamahiriya'],
        'Sudan': ['north sudan'], 'Tanzania': ['united republic of tanzania'], 'Venezuela': ['bolivarian republic of venezuela'],
        'Bolivia': ['plurinational state of bolivia'], 'Comoros': ['the comoros'], 'Maldives': ['the maldives'], 'Seychelles': ['the seychelles']
    };
    const CAPITAL_ALIASES = {
        'Washington, D.C.': ['washington dc', 'washington', 'dc', 'washington d c'],
        'Saint Paul': ['st paul'], "Saint John's": ['st johns', 'saint johns', 'st john s'], "St. George's": ['st georges', 'saint georges'],
        'Kyiv': ['kiev'], 'Chișinău': ['chisinau', 'kishinev'], 'Reykjavík': ['reykjavik'], 'Bogotá': ['bogota'], 'Brasília': ['brasilia'],
        'Yaoundé': ['yaounde'], 'Lomé': ['lome'], "Nukuʻalofa": ['nukualofa', 'nuku alofa'], 'Asunción': ['asuncion'], 'San José': ['san jose'],
        'São Tomé': ['sao tome'], 'Malé': ['male'], 'Sucre / La Paz': ['sucre', 'la paz'],
        'Sri Jayawardenepura Kotte': ['kotte', 'sri jayawardenepura', 'jayawardenepura kotte', 'colombo'],
        'Pretoria': ['cape town', 'bloemfontein', 'tshwane'], 'Amsterdam': ['the hague'], 'Mbabane': ['lobamba'], 'Kuala Lumpur': ['kl', 'putrajaya'],
        'South Tarawa': ['tarawa'], 'Luxembourg City': ['luxembourg'], 'City of San Marino': ['san marino'], 'Kuwait City': ['kuwait'],
        'Panama City': ['panama'], 'Guatemala City': ['guatemala'], 'Mexico City': ['ciudad de mexico', 'cdmx'], 'Vatican City': ['vatican'],
        'Port of Spain': ['port-of-spain'], 'Port-au-Prince': ['port au prince'], 'Port Moresby': ['moresby'], 'Ulaanbaatar': ['ulan bator', 'ulan baatar'],
        'Naypyidaw': ['nay pyi taw', 'naypyitaw'], 'Astana': ['nur sultan', 'nursultan'], 'Sanaa': ["sana'a", 'sana a'], 'Beijing': ['peking'],
        'New Delhi': ['delhi'], 'Jerusalem': ['jerusalem'], "N'Djamena": ['ndjamena', 'n djamena'], 'Abu Dhabi': ['abudhabi'],
        'Salt Lake City': ['salt lake', 'slc'], 'Oklahoma City': ['okc', 'oklahoma'], 'Jefferson City': ['jefferson'], 'Carson City': ['carson'],
        'Indianapolis': ['indy'], 'Baton Rouge': ['batonrouge'], 'Des Moines': ['desmoines'], 'Santa Fe': ['santafe'],
        'Washington': [], 'Dodoma': [], 'Hanoi': ['ha noi'], 'Tehran': ['teheran'], 'Kathmandu': ['katmandu'], 'Ashgabat': ['ashkhabad'],
        'Bishkek': ['frunze'], 'Gitega': [], 'Yamoussoukro': [], 'Ngerulmud': ['melekeok'], 'Yaren': ['yaren district'], 'Palikir': [],
        'Bandar Seri Begawan': ['bandar', 'bsb'], 'Addis Ababa': ['addis'], 'Antananarivo': ['tana'], 'Ouagadougou': ['ouaga'],
        'Port Louis': ['portlouis'], 'Funafuti': [], 'Majuro': [], 'Basseterre': [], 'Castries': [], 'Kingstown': [], 'Roseau': []
    };

    // ---------- text helpers ----------
    function norm(s) {
        return String(s || '')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/&/g, ' and ')
            .replace(/['’ʻ`.]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\bsaint\b/g, 'st')
            .replace(/^the /, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    // a rough "how it sounds" key, so phonetic spellings like "kentukee" still match
    function soundKey(s) {
        let w = norm(s).replace(/[^a-z]/g, '');
        if (!w) return '';
        w = w.replace(/ph/g, 'f').replace(/gh/g, 'g').replace(/kn/g, 'n').replace(/ck/g, 'k').replace(/qu/g, 'kw')
             .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks').replace(/z/g, 's')
             .replace(/dg/g, 'j').replace(/sch/g, 'sk').replace(/sh/g, 'x').replace(/th/g, 't').replace(/y/g, 'i');
        // a starting vowel, W, H or Y all sound alike ("Ouagadougou" / "Wagadugu")
        const first = /[aeiouwhy]/.test(w[0]) ? 'a' : w[0];
        let rest = w.slice(1).replace(/[aeiouhw]/g, '');
        let out = first;
        for (const ch of rest) if (ch !== out[out.length - 1]) out += ch;
        return out;
    }
    // Damerau-Levenshtein (swapped letters count as one mistake)
    function dist(a, b, max) {
        const la = a.length, lb = b.length;
        if (Math.abs(la - lb) > max) return max + 1;
        let prev2 = null, prev = Array.from({ length: lb + 1 }, (_, j) => j);
        for (let i = 1; i <= la; i++) {
            const cur = [i];
            let rowMin = i;
            for (let j = 1; j <= lb; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
                if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
                cur.push(v);
                if (v < rowMin) rowMin = v;
            }
            if (rowMin > max) return max + 1;
            prev2 = prev; prev = cur;
        }
        return prev[lb];
    }
    // how many mistakes a word of this length may have
    function tolerance(len) {
        if (len <= 3) return 0;
        if (len <= 5) return 1;
        if (len <= 9) return 2;
        if (len <= 14) return 3;
        return 4;
    }

    // ---------- answer pools ----------
    function buildPool(names, aliasMap, extra) {
        return names.map(name => {
            const keys = new Set([norm(name)]);
            (aliasMap[name] || []).forEach(a => keys.add(norm(a)));
            if (extra) extra(name).forEach(a => keys.add(norm(a)));
            keys.delete('');
            const keyList = [...keys];
            return { name, keys: keyList, sounds: keyList.filter(k => k.length >= 4).map(soundKey) };
        });
    }
    const codeOf = {};
    Object.entries(STATE_CODES).forEach(([c, n]) => { codeOf[n] = c; });
    const POOLS = {
        states: buildPool(STATES, STATE_ALIASES, n => [codeOf[n] || '']),
        countries: buildPool(COUNTRIES, COUNTRY_ALIASES),
        stateCapitals: buildPool([...new Set(Object.values(US_CAPITALS))], CAPITAL_ALIASES),
        countryCapitals: buildPool([...new Set(Object.values(WORLD_CAPITALS))], CAPITAL_ALIASES)
    };

    // Is the typed text clearly one place? Returns that place's name, or null.
    function match(input, poolName) {
        const pool = POOLS[poolName];
        const n = norm(input);
        if (!n) return null;
        const exact = pool.find(e => e.keys.includes(n));
        if (exact) return exact.name;
        // typo-tolerant: best distance must be within tolerance and better than every other place
        const tol = tolerance(n.length);
        let best = null, bestD = Infinity, second = Infinity;
        for (const e of pool) {
            let d = Infinity;
            for (const k of e.keys) d = Math.min(d, dist(n, k, Math.max(tol, 1) + 1));
            if (d < bestD) { second = bestD; bestD = d; best = e; }
            else if (d < second) second = d;
        }
        if (best && bestD <= tol && bestD < second) return best.name;
        // sound-alike: only if exactly one place sounds the same
        if (n.length >= 4) {
            const sk = soundKey(n);
            const hits = pool.filter(e => e.sounds.includes(sk));
            if (hits.length === 1) return hits[0].name;
        }
        return null;
    }

    // Suggestions while typing. Always drawn from the whole list of places,
    // so they never give away which one is right.
    function suggest(input, poolName, limit) {
        const pool = POOLS[poolName];
        const n = norm(input);
        if (n.length < 2) return [];
        const sk = n.length >= 4 ? soundKey(n) : null;
        const scored = [];
        for (const e of pool) {
            let score = Infinity;
            for (const k of e.keys) {
                if (k === n) score = Math.min(score, 0);
                else if (k.startsWith(n)) score = Math.min(score, 1 + (k === norm(e.name) ? 0 : 0.5));
                else if (k.split(' ').some(w => w.startsWith(n))) score = Math.min(score, 2);
                else if (n.length >= 3) {
                    const d = dist(n, k.slice(0, n.length), tolerance(n.length));
                    if (d <= tolerance(n.length)) score = Math.min(score, 3 + d);
                    const full = dist(n, k, tolerance(n.length));
                    if (full <= tolerance(n.length)) score = Math.min(score, 3 + full);
                }
            }
            if (score === Infinity && sk && e.sounds.includes(sk)) score = 5;
            if (score < Infinity) scored.push({ name: e.name, score });
        }
        scored.sort((a, b) => a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name));
        return scored.slice(0, limit || 5).map(s => s.name);
    }

    return {
        US_CAPITALS, WORLD_CAPITALS, COUNTRIES, STATES,
        norm, soundKey, match, suggest,
        poolNames: Object.keys(POOLS)
    };
})();
