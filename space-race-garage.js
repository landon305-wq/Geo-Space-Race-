/* =====================================================================
   SPACE RACE — Garage: cash, boosts, rockets, trails, shop & hangar
   Everything is saved on this device (localStorage).
   space-race.js calls SRGarage.* and hands over its drawRocket().
   ===================================================================== */
(function () {
    'use strict';

    const KEY = 'sr_garage_v1';
    const PAYOUT = [250, 200, 150, 100];          // 1st, 2nd, 3rd, 4th. Everyone else (and last place) gets 50
    const LAST_PAY = 50;
    const DAILY_BONUS = 100;                      // first race of each day
    const BOOST_PRICE = 200;
    const BOOST_PACK = { n: 5, price: 850 };
    const BOOSTS_PER_RACE = 3;

    // ---------- rockets ----------
    // body: gradient top→bottom · accent: fins/nose/stripe (null = your lane color) · shape: classic | sleek | heavy | shuttle
    // fx: glow | gold | rainbow | stars | chrome
    const SKINS = [
        { id: 'classic',   name: 'Classic',       shape: 'classic', body: ['#ffffff', '#cbd5e1', '#64748b'], accent: null, win: '#0ea5e9', price: 0, desc: 'The rocket that started it all.' },
        { id: 'midnight',  name: 'Midnight',      shape: 'classic', body: ['#334155', '#1e293b', '#0f172a'], accent: '#22d3ee', win: '#67e8f9', price: 500 },
        { id: 'firecracker', name: 'Firecracker', shape: 'classic', body: ['#fecaca', '#ef4444', '#991b1b'], accent: '#facc15', win: '#fde68a', price: 750 },
        { id: 'mintjet',   name: 'Mint Jet',      shape: 'sleek',   body: ['#f0fdf4', '#86efac', '#15803d'], accent: '#14b8a6', win: '#0f766e', price: 900 },
        { id: 'bubblegum', name: 'Bubblegum',     shape: 'heavy',   body: ['#fdf2f8', '#f9a8d4', '#db2777'], accent: '#a855f7', win: '#f0abfc', price: 1200 },
        { id: 'shuttle',   name: 'Space Shuttle', shape: 'shuttle', body: ['#ffffff', '#e2e8f0', '#94a3b8'], accent: '#1e293b', win: '#0f172a', price: 2000 },
        { id: 'stealth',   name: 'Stealth',       shape: 'sleek',   body: ['#3f3f46', '#18181b', '#09090b'], accent: '#ef4444', win: '#ef4444', fx: 'glow', price: 2500 },
        { id: 'nebula',    name: 'Nebula',        shape: 'heavy',   body: ['#c4b5fd', '#7c3aed', '#312e81'], accent: '#f472b6', win: '#fbcfe8', fx: 'stars', price: 4000 },
        { id: 'chrome',    name: 'Chrome Comet',  shape: 'sleek',   body: ['#ffffff', '#94a3b8', '#e2e8f0'], accent: '#38bdf8', win: '#0284c7', fx: 'chrome', price: 6000 },
        { id: 'golden',    name: 'Golden Eagle',  shape: 'classic', body: ['#fef9c3', '#facc15', '#a16207'], accent: '#b45309', win: '#fef3c7', fx: 'gold', price: 10000 },
        // challenge rockets
        { id: 'rookie',    name: 'Rookie',        shape: 'classic', body: ['#ffedd5', '#fb923c', '#c2410c'], accent: '#1e3a8a', win: '#bfdbfe', challenge: 'races5' },
        { id: 'champion',  name: 'Champion',      shape: 'sleek',   body: ['#fee2e2', '#dc2626', '#7f1d1d'], accent: '#facc15', win: '#fde047', fx: 'glow', challenge: 'wins10' },
        { id: 'gemhunter', name: 'Gem Hunter',    shape: 'heavy',   body: ['#ccfbf1', '#2dd4bf', '#0f766e'], accent: '#a5f3fc', win: '#ecfeff', fx: 'glow', challenge: 'rare50' },
        { id: 'inferno',   name: 'Inferno',       shape: 'sleek',   body: ['#fef08a', '#f97316', '#7c2d12'], accent: '#dc2626', win: '#fde047', fx: 'glow', challenge: 'streak15' },
        { id: 'speedster', name: 'Speed Demon',   shape: 'sleek',   body: ['#ecfccb', '#84cc16', '#365314'], accent: '#111827', win: '#d9f99d', challenge: 'fast60' },
        { id: 'rainbow',   name: 'Rainbow Rider', shape: 'classic', body: ['#ffffff', '#e0e7ff', '#a5b4fc'], accent: '#f472b6', win: '#38bdf8', fx: 'rainbow', challenge: 'humanwins3' },
        { id: 'veteran',   name: 'Moon Veteran',  shape: 'heavy',   body: ['#f8fafc', '#94a3b8', '#334155'], accent: '#fbbf24', win: '#fde68a', fx: 'chrome', challenge: 'races100' },
        { id: 'daily',     name: 'Daily Devotee', shape: 'shuttle', body: ['#e0f2fe', '#38bdf8', '#075985'], accent: '#facc15', win: '#0c4a6e', challenge: 'daily7' },
        // ★ LEGENDARY: the hardest challenges in the game
        { id: 'diamond',   name: 'Diamond Dynasty',    legend: true, fx: 'diamond',   shape: 'heavy',   body: ['#ffffff', '#a5f3fc', '#0891b2'], accent: '#67e8f9', win: '#ecfeff', challenge: 'rare1000' },
        { id: 'phoenix',   name: 'Phoenix',            legend: true, fx: 'phoenix',   shape: 'sleek',   body: ['#fef08a', '#f97316', '#991b1b'], accent: '#fbbf24', win: '#fef9c3', challenge: 'wins250' },
        { id: 'thunder',   name: 'Thunderbolt',        legend: true, fx: 'lightning', shape: 'sleek',   body: ['#475569', '#1e293b', '#020617'], accent: '#facc15', win: '#fde047', challenge: 'streak40' },
        { id: 'supernova', name: 'Supernova',          legend: true, fx: 'nova',      shape: 'classic', body: ['#ffffff', '#fde68a', '#f59e0b'], accent: '#fb923c', win: '#fff7ed', challenge: 'fast35' },
        { id: 'blackhole', name: 'Black Hole',         legend: true, fx: 'blackhole', shape: 'heavy',   body: ['#3b0764', '#0c0a1f', '#000000'], accent: '#a855f7', win: '#f0abfc', challenge: 'races1000' },
        { id: 'galaxy',    name: 'Galaxy Emperor',     legend: true, fx: 'galaxy',    shape: 'shuttle', body: ['#312e81', '#1e1b4b', '#0f172a'], accent: '#e879f9', win: '#f5d0fe', challenge: 'humanwins100' },
        { id: 'aurora',    name: 'Aurora',             legend: true, fx: 'aurora',    shape: 'sleek',   body: ['#ffffff', '#5eead4', '#7c3aed'], accent: '#5eead4', win: '#ecfeff', challenge: 'earn250k' },
        { id: 'celestial', name: 'Celestial Guardian', legend: true, fx: 'shield',    shape: 'heavy',   body: ['#f8fafc', '#cbd5e1', '#64748b'], accent: '#22d3ee', win: '#67e8f9', challenge: 'daily100' },
    ];

    // ---------- exhaust trails ----------
    // flame: gradient stops for the flame · p: particle colors (young → old)
    const TRAILS = [
        { id: 'fire',    name: 'Rocket Fire', flame: ['#fff7ed', '#fde047', '#f97316', 'rgba(239,68,68,0)'], p: [[254, 240, 138], [251, 146, 60], [239, 68, 68]], price: 0 },
        { id: 'ice',     name: 'Ice Blast',   flame: ['#ffffff', '#a5f3fc', '#38bdf8', 'rgba(37,99,235,0)'],  p: [[236, 254, 255], [103, 232, 249], [59, 130, 246]], price: 400 },
        { id: 'toxic',   name: 'Toxic',       flame: ['#f7fee7', '#bef264', '#22c55e', 'rgba(21,128,61,0)'],  p: [[236, 252, 203], [163, 230, 53], [22, 163, 74]], price: 600 },
        { id: 'plasma',  name: 'Plasma',      flame: ['#fdf4ff', '#f0abfc', '#a855f7', 'rgba(109,40,217,0)'], p: [[250, 232, 255], [232, 121, 249], [147, 51, 234]], price: 800 },
        { id: 'gold',    name: 'Gold Sparks', flame: ['#fffbeb', '#fde047', '#f59e0b', 'rgba(180,83,9,0)'],   p: [[254, 249, 195], [250, 204, 21], [217, 119, 6]], sparkle: true, price: 2500 },
        { id: 'rainbow', name: 'Rainbow',     flame: null, rainbow: true, challenge: 'earn10k' },
        { id: 'stardust', name: 'Stardust',   flame: ['#ffffff', '#e0e7ff', '#818cf8', 'rgba(99,102,241,0)'], p: [[255, 255, 255], [199, 210, 254], [129, 140, 248]], sparkle: true, challenge: 'perfect' },
    ];

    // ---------- challenges ----------
    const CHALLENGES = {
        races5:     { label: 'Finish 5 races',                        goal: 5,     get: s => s.races },
        races100:   { label: 'Finish 100 races',                      goal: 100,   get: s => s.races },
        wins10:     { label: 'Win 10 races',                          goal: 10,    get: s => s.wins },
        rare50:     { label: 'Find 50 💎 rare answers',               goal: 50,    get: s => s.rare },
        streak15:   { label: 'Get a 15-answer streak',                goal: 15,    get: s => s.bestStreak },
        fast60:     { label: 'Finish a 15-point race in under 1:00',  goal: 1,     get: s => (s.best && s.best < 60000 ? 1 : 0) },
        humanwins3: { label: 'Win 3 races against real people',       goal: 3,     get: s => s.humanWins },
        daily7:     { label: 'Race the daily race on 7 different days', goal: 7,   get: s => s.dailyDays },
        earn10k:    { label: 'Earn $10,000 in total',                 goal: 10000, get: s => s.earned, money: true },
        perfect:    { label: 'Win a race without a single miss',      goal: 1,     get: s => s.perfectWins },
        // legendary
        rare1000:     { label: 'Find 1,000 💎 rare answers',                goal: 1000,   get: s => s.rare },
        wins250:      { label: 'Win 250 races',                            goal: 250,    get: s => s.wins },
        streak40:     { label: 'Get a 40-answer streak',                   goal: 40,     get: s => s.bestStreak },
        fast35:       { label: 'Finish a 15-point race in under 0:35',     goal: 1,      get: s => (s.best && s.best < 35000 ? 1 : 0) },
        races1000:    { label: 'Finish 1,000 races',                       goal: 1000,   get: s => s.races },
        humanwins100: { label: 'Win 100 races against real people',        goal: 100,    get: s => s.humanWins },
        earn250k:     { label: 'Earn $250,000 in total',                   goal: 250000, get: s => s.earned, money: true },
        daily100:     { label: 'Race the daily race on 100 different days', goal: 100,   get: s => s.dailyDays },
    };

    // ---------- saved state ----------
    function fresh() { return { cash: 0, boosts: 1, earned: 0, owned: ['classic', 'fire'], skin: 'classic', trail: 'fire', humanWins: 0, perfectWins: 0, dailyDays: [], boostsUsed: 0, bonusDay: '', seenUnlocks: [] }; }
    let G = load();
    function load() { try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return fresh(); } }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) {} }

    let statsFn = () => ({});                       // space-race.js supplies its stats (races, wins, rare, best…)
    let drawFn = null;                              // space-race.js supplies drawRocket
    const S = () => Object.assign({}, statsFn(), { humanWins: G.humanWins, perfectWins: G.perfectWins, dailyDays: G.dailyDays.length, earned: G.earned });

    const skin = id => SKINS.find(s => s.id === id) || SKINS[0];
    const trail = id => TRAILS.find(t => t.id === id) || TRAILS[0];
    const unlockedByChallenge = item => item.challenge && CHALLENGES[item.challenge].get(S()) >= CHALLENGES[item.challenge].goal;
    const owns = item => G.owned.includes(item.id) || item.price === 0 || unlockedByChallenge(item);
    const money = n => '$' + Math.round(n).toLocaleString('en-US');
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---------- after each race ----------
    // info: { place, dnf, humans (real people in the race), misses, official, day }
    function raceEnded(info) {
        const before = allItems().filter(owns).map(i => i.id);
        const base = info.dnf ? LAST_PAY : (PAYOUT[info.place - 1] || LAST_PAY);
        let bonus = 0;
        if (G.bonusDay !== info.day) { G.bonusDay = info.day; bonus = DAILY_BONUS; }
        const total = base + bonus;
        G.cash += total; G.earned += total;
        if (!info.dnf && info.place === 1 && info.humans >= 2) G.humanWins++;
        if (!info.dnf && info.place === 1 && info.misses === 0) G.perfectWins++;
        if (info.official && !G.dailyDays.includes(info.day)) G.dailyDays.push(info.day);
        save();
        const unlocked = allItems().filter(i => owns(i) && !before.includes(i.id) && i.challenge);
        return { base, bonus, total, cash: G.cash, unlocked };
    }
    // stats from space-race.js are recorded right before raceEnded(); unlocks that come from them
    // are caught by comparing against what was owned when the race started
    let ownedAtStart = [];
    function raceStarting() { ownedAtStart = allItems().filter(owns).map(i => i.id); G.usedThisRace = 0; }
    function newUnlocksSinceStart() { return allItems().filter(i => i.challenge && owns(i) && !ownedAtStart.includes(i.id)); }
    const allItems = () => SKINS.concat(TRAILS);

    // ---------- boosts ----------
    function canBoost() { return G.boosts > 0 && (G.usedThisRace || 0) < BOOSTS_PER_RACE; }
    function useBoost() { if (!canBoost()) return false; G.boosts--; G.usedThisRace = (G.usedThisRace || 0) + 1; G.boostsUsed++; save(); return true; }

    // ---------- shop / hangar overlay ----------
    let overlay = null, mode = 'shop', tab = 'rockets', anim = 0, onChange = () => {};
    function open(m, t) {
        mode = m; tab = t || (m === 'shop' ? 'rockets' : 'rockets');
        if (!overlay) build();
        overlay.classList.remove('hidden');
        render();
        cancelAnimationFrame(anim); loop();
    }
    function close() { if (overlay) overlay.classList.add('hidden'); cancelAnimationFrame(anim); onChange(); }
    function build() {
        overlay = document.createElement('div');
        overlay.id = 'sr-garage'; overlay.className = 'sr-overlay hidden';
        overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML = `<div class="sr-gar-card">
            <div class="sr-gar-head">
                <div class="sr-gar-modes"><button data-mode="shop">🛒 Shop</button><button data-mode="hangar">🛠️ Hangar</button></div>
                <div class="sr-gar-wallet" id="sr-gar-wallet"></div>
                <button class="sr-gar-x" aria-label="Close">✕</button>
            </div>
            <div class="sr-gar-tabs" id="sr-gar-tabs"></div>
            <div class="sr-gar-body" id="sr-gar-body"></div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => {
            if (e.target === overlay || e.target.closest('.sr-gar-x')) return close();
            const m = e.target.closest('[data-mode]'); if (m) { mode = m.dataset.mode; tab = 'rockets'; return render(); }
            const tb = e.target.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; return render(); }
            const act = e.target.closest('[data-act]'); if (act) return action(act.dataset.act, act.dataset.id);
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) close(); });
    }
    function action(act, id) {
        if (act === 'boost1' || act === 'boostpack') {
            const n = act === 'boost1' ? 1 : BOOST_PACK.n, price = act === 'boost1' ? BOOST_PRICE : BOOST_PACK.price;
            if (G.cash < price) return toast(`You need ${money(price - G.cash)} more`);
            G.cash -= price; G.boosts += n; save(); toast(`⚡ +${n} boost${n > 1 ? 's' : ''}!`, true); return render();
        }
        const item = allItems().find(i => i.id === id); if (!item) return;
        const isSkin = SKINS.includes(item);
        if (act === 'buy') {
            if (G.cash < item.price) return toast(`You need ${money(item.price - G.cash)} more`);
            G.cash -= item.price; G.owned.push(item.id);
            if (isSkin) G.skin = item.id; else G.trail = item.id;
            save(); toast(`🎉 ${item.name} unlocked and equipped!`, true); return render();
        }
        if (act === 'equip' && owns(item)) { if (isSkin) G.skin = item.id; else G.trail = item.id; save(); toast(`✓ ${item.name} equipped`, true); return render(); }
    }
    let toastT = 0;
    function toast(msg, good) {
        const el = overlay.querySelector('.sr-gar-toast') || overlay.querySelector('.sr-gar-card').appendChild(Object.assign(document.createElement('div'), { className: 'sr-gar-toast' }));
        el.textContent = msg; el.classList.toggle('good', !!good); el.classList.add('show');
        clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1600);
    }
    function render() {
        overlay.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
        overlay.querySelector('#sr-gar-wallet').innerHTML = `<span>💰 <b>${money(G.cash)}</b></span><span>⚡ <b>${G.boosts}</b></span>`;
        const tabs = mode === 'shop' ? [['rockets', '🚀 Rockets'], ['trails', '🔥 Trails'], ['boosts', '⚡ Boosts']] : [['rockets', '🚀 Rockets'], ['trails', '🔥 Trails'], ['challenges', '🏅 Challenges']];
        if (!tabs.some(t => t[0] === tab)) tab = 'rockets';
        overlay.querySelector('#sr-gar-tabs').innerHTML = tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('');
        const body = overlay.querySelector('#sr-gar-body');
        if (tab === 'boosts') { body.innerHTML = boostsHtml(); return; }
        if (tab === 'challenges') { body.innerHTML = challengesHtml(); paintPreviews(); return; }
        const list = tab === 'rockets' ? SKINS : TRAILS;
        // shop: things for sale you don't own yet · hangar: everything you own + challenge rewards
        const items = mode === 'shop' ? list.filter(i => i.price > 0) : list.filter(i => owns(i) || i.challenge);
        body.innerHTML = (mode === 'hangar' ? `<div class="sr-gar-hint">Pick what you fly. Locked items unlock from 🏅 challenges or the 🛒 shop.</div>` : `<div class="sr-gar-hint">Win races to earn cash: 1st ${money(PAYOUT[0])} · 2nd ${money(PAYOUT[1])} · 3rd ${money(PAYOUT[2])} · 4th ${money(PAYOUT[3])} · others ${money(LAST_PAY)}. First race each day: +${money(DAILY_BONUS)}.</div>`)
            + `<div class="sr-gar-grid">${items.map(i => cardHtml(i, tab === 'rockets')).join('')}</div>`;
        paintPreviews();
    }
    function cardHtml(item, isSkin) {
        const equipped = isSkin ? G.skin === item.id : G.trail === item.id;
        const own = owns(item);
        let foot;
        if (equipped) foot = `<div class="sr-gar-eq">✓ EQUIPPED</div>`;
        else if (own) foot = `<button class="sr-btn sr-btn-ghost sr-gar-btn" data-act="equip" data-id="${item.id}">Equip</button>`;
        else if (item.challenge) {
            const c = CHALLENGES[item.challenge], v = Math.min(c.get(S()) || 0, c.goal);
            foot = `<div class="sr-gar-lock">🔒 ${esc(c.label)}</div><div class="sr-gar-bar"><i style="width:${(v / c.goal * 100).toFixed(1)}%"></i></div><div class="sr-gar-prog">${c.money ? money(v) : v} / ${c.money ? money(c.goal) : c.goal}</div>`;
        } else foot = `<button class="sr-btn ${G.cash >= item.price ? 'sr-btn-main' : 'sr-btn-ghost'} sr-gar-btn" data-act="buy" data-id="${item.id}">${money(item.price)}</button>`;
        return `<div class="sr-gar-item${equipped ? ' eq' : ''}${own ? '' : ' locked'}${item.legend ? ' legend' : ''}">
            <canvas class="sr-gar-prev" data-${isSkin ? 'skin' : 'trail'}="${item.id}" width="220" height="110"></canvas>
            <div class="sr-gar-name">${esc(item.name)}${item.legend ? ' <span class="sr-gar-tag lg">★ LEGENDARY</span>' : item.challenge ? ' <span class="sr-gar-tag">CHALLENGE</span>' : ''}</div>
            ${foot}</div>`;
    }
    function boostsHtml() {
        return `<div class="sr-gar-boost">
            <div class="sr-gar-boost-icon">⚡</div>
            <div class="sr-gar-boost-txt"><b>BOOST</b><br>Skip any question with <b>no penalty</b>, and it counts as <b>1 correct answer</b>. Up to ${BOOSTS_PER_RACE} per race. Press the ⚡ button (or <b>Shift+Enter</b>, or type <b>boost</b>) during a race. (Not allowed in the official daily race, so the leaderboard stays fair.)</div>
            <div class="sr-gar-have">You have <b>${G.boosts}</b></div>
            <div class="sr-gar-boost-btns">
                <button class="sr-btn ${G.cash >= BOOST_PRICE ? 'sr-btn-main' : 'sr-btn-ghost'}" data-act="boost1">1 boost · ${money(BOOST_PRICE)}</button>
                <button class="sr-btn ${G.cash >= BOOST_PACK.price ? 'sr-btn-main' : 'sr-btn-ghost'}" data-act="boostpack">${BOOST_PACK.n} boosts · ${money(BOOST_PACK.price)} <small>(save ${money(BOOST_PRICE * BOOST_PACK.n - BOOST_PACK.price)})</small></button>
            </div></div>`;
    }
    function challengesHtml() {
        const rows = allItems().filter(i => i.challenge).map(i => {
            const c = CHALLENGES[i.challenge], v = Math.min(c.get(S()) || 0, c.goal), done = v >= c.goal, isSkin = SKINS.includes(i);
            return `<div class="sr-gar-ch${done ? ' done' : ''}${i.legend ? ' legend' : ''}"><canvas class="sr-gar-prev sm" data-${isSkin ? 'skin' : 'trail'}="${i.id}" width="132" height="66"></canvas>
                <div class="sr-gar-ch-txt"><b>${i.legend ? '<span class="sr-gar-tag lg">★ LEGENDARY</span> ' : ''}${esc(c.label)}</b><span>Reward: ${esc(i.name)} ${isSkin ? 'rocket' : 'trail'}</span>
                <div class="sr-gar-bar"><i style="width:${(v / c.goal * 100).toFixed(1)}%"></i></div></div>
                <div class="sr-gar-ch-n">${done ? '✅' : (c.money ? money(v) : v) + ' / ' + (c.money ? money(c.goal) : c.goal)}</div></div>`;
        });
        return `<div class="sr-gar-list">${rows.join('')}</div>`;
    }
    // previews: rockets fly with your equipped trail; trails are shown on your equipped rocket
    function paintPreviews(t = performance.now()) {
        if (!drawFn || !overlay) return;
        overlay.querySelectorAll('canvas.sr-gar-prev').forEach(cv => {
            const c = cv.getContext('2d'), W = cv.width, H = cv.height;
            c.clearRect(0, 0, W, H);
            const sk = cv.dataset.skin ? skin(cv.dataset.skin) : skin(G.skin), tr = cv.dataset.trail ? trail(cv.dataset.trail) : trail(G.trail);
            // a few drifting stars
            c.fillStyle = 'rgba(226,232,240,0.5)';
            for (let i = 0; i < 9; i++) { const x = (i * 53 + t / 25) % W, y = (i * 37) % H; c.fillRect(W - x, y, 1.4, 1.4); }
            drawFn(c, W * (sk.legend ? 0.56 : 0.6), H * 0.5 + Math.sin(t / 400 + W) * 3, H / (sk.legend ? 50 : 36), '#38bdf8', { skin: sk, trail: tr, flame: 0.75, t });
        });
    }
    function loop() { paintPreviews(); anim = requestAnimationFrame(loop); }

    // the lobby's wallet line
    function walletHtml() { return `<span title="Cash">💰 <b>${money(G.cash)}</b></span> <span class="sr-wallet-sep">·</span> <span title="Boosts">⚡ <b>${G.boosts}</b></span>`; }

    window.SRGarage = {
        PAYOUT, LAST_PAY, BOOSTS_PER_RACE, SKINS, TRAILS,
        get cash() { return G.cash; }, get boosts() { return G.boosts; }, get usedThisRace() { return G.usedThisRace || 0; },
        skin: id => skin(id || G.skin), trail: id => trail(id || G.trail),
        equipped: () => ({ skin: G.skin, trail: G.trail }),
        // random cosmetics for computer racers (seeded so everyone in a room sees the same)
        botLook: r => ({ skin: SKINS[Math.floor(r() * 9)].id, trail: TRAILS[Math.floor(r() * 5)].id }),
        setStats: fn => { statsFn = fn; }, setDrawer: fn => { drawFn = fn; }, onChange: fn => { onChange = fn; },
        raceStarting, raceEnded, newUnlocksSinceStart, canBoost, useBoost, open, close, walletHtml, money,
        _reset: () => { G = fresh(); save(); },
    };
})();
