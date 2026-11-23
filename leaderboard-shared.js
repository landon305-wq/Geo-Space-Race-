// ==========================================
// GEO-SPACERACE SHARED HARD MODE LEADERBOARD
// Used by both USA and Europe modes.
// Two boards per mode:
//   1. Moon Landings  (players with clears > 0, ranked by clears)
//   2. High Score     (players who have NOT landed yet, ranked by best_score)
// Once a player lands on the Moon they leave the High Score board automatically.
// ==========================================
window.GeoLeaderboard = (function () {

    // ---------- ASTRONAUT CALLSIGN (player name) ----------
    const NAME_KEY = 'astro_geo_player_callsign';
    const OLD_DEFAULT = 'commander cadet';   // the old auto-filled name counts as "no name yet"
    const boards = [];

    function storedName() {
        let n = '';
        try { n = (localStorage.getItem(NAME_KEY) || '').trim(); } catch (e) {}
        return n.toLowerCase() === OLD_DEFAULT ? '' : n;
    }
    function cleanName(n) {
        return String(n || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
    }

    // In-page name box (replaces the browser prompt, which phones often block or people skip)
    function askCallsign(message, current) {
        return new Promise(resolve => {
            let box = document.getElementById('callsign-modal');
            if (box) box.remove();
            box = document.createElement('div');
            box.id = 'callsign-modal';
            box.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.88);display:flex;align-items:center;justify-content:center;z-index:100000;padding:16px;';
            box.innerHTML = `
                <div style="background:#0f172a;border:2px solid #38bdf8;border-radius:14px;padding:26px 22px;max-width:400px;width:100%;text-align:center;color:#f8fafc;box-shadow:0 0 40px rgba(56,189,248,0.4);">
                    <div style="font-family:'Orbitron',sans-serif;font-size:1.25rem;font-weight:800;margin-bottom:8px;">🧑‍🚀 ASTRONAUT CALLSIGN</div>
                    <div style="color:#94a3b8;font-size:1rem;margin-bottom:16px;line-height:1.4;">${esc(message || 'Enter the name to show on the leaderboard.')}</div>
                    <input id="callsign-input" type="text" maxlength="20" autocomplete="nickname" placeholder="Your name"
                        style="width:100%;padding:12px 14px;font-size:1.1rem;border-radius:8px;border:1px solid #38bdf8;background:#020617;color:#f8fafc;outline:none;font-family:inherit;">
                    <div id="callsign-error" style="color:#f87171;font-size:0.9rem;min-height:1.2em;margin:6px 0 10px;"></div>
                    <button id="callsign-save" class="space-btn" style="margin:0;">SAVE NAME</button>
                </div>`;
            document.body.appendChild(box);
            const input = box.querySelector('#callsign-input');
            const err = box.querySelector('#callsign-error');
            input.value = current || '';
            setTimeout(() => input.focus(), 50);
            const save = () => {
                const n = cleanName(input.value);
                if (n.length < 2) { err.textContent = 'Please enter at least 2 characters.'; return; }
                if (n.toLowerCase() === OLD_DEFAULT) { err.textContent = 'Pick your own name for the leaderboard!'; return; }
                box.remove();
                setCallsign(n);
                resolve(n);
            };
            box.querySelector('#callsign-save').onclick = save;
            input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
        });
    }

    async function ensureCallsign(message) {
        return storedName() || askCallsign(message);
    }

    function setCallsign(n) {
        const old = storedName();
        try { localStorage.setItem(NAME_KEY, n); } catch (e) {}
        boards.forEach(b => b.rename(n, old));
    }

    async function changeCallsign() {
        const n = await askCallsign('Change the name shown on the leaderboard.', storedName());
        return n;
    }

    function esc(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    // Standard competition ranking: equal values share a rank (1, 2, 2, 4)
    function rankRows(rows, key) {
        let rank = 0, prev = null;
        return rows.map((r, i) => {
            if (r[key] !== prev) { rank = i + 1; prev = r[key]; }
            return Object.assign({}, r, { rank });
        });
    }

    function byValueThenTime(key) {
        return (a, b) => (b[key] || 0) - (a[key] || 0) ||
            new Date(a.updated_at || 0) - new Date(b.updated_at || 0);
    }

    function create(opts) {
        // opts: { table, localKey, unit, getClient(), getUserId(), ensureAuth() }
        const unit = opts.unit || 'States';
        const total = () => (opts.getTotal ? opts.getTotal() : 0) || Infinity;

        // Combine rows that share a name (ignoring capitals and extra spaces) into one entry:
        // Moon landings are added up, the best score is the highest one, and the newest spelling of the name is shown.
        function mergeByName(rows, uid) {
            const map = new Map();
            (rows || []).forEach(r => {
                const name = String(r.name || 'Anonymous').replace(/\s+/g, ' ').trim() || 'Anonymous';
                const key = name.toLowerCase();
                const clears = Math.max(r.clears || 0, (r.best_score || 0) >= total() ? 1 : 0);
                const cur = map.get(key);
                if (!cur) { map.set(key, Object.assign({}, r, { name, clears, ids: [r.user_id] })); return; }
                cur.clears += clears;
                cur.best_score = Math.max(cur.best_score || 0, r.best_score || 0);
                cur.ids.push(r.user_id);
                if (new Date(r.updated_at || 0) > new Date(cur.updated_at || 0)) { cur.updated_at = r.updated_at; cur.name = name; }
            });
            return [...map.values()];
        }

        function getLocal() {
            try { return JSON.parse(localStorage.getItem(opts.localKey)) || []; } catch (e) { return []; }
        }
        function saveLocal(board) {
            try { localStorage.setItem(opts.localKey, JSON.stringify(board)); } catch (e) {}
        }

        async function readyClient() {
            const client = opts.getClient();
            if (!client) return null;
            if (!opts.getUserId()) { try { await opts.ensureAuth(); } catch (e) {} }
            return opts.getUserId() ? client : null;
        }

        // ---- record a hard mode MOON LANDING ----
        async function recordMoon(totalItems) {
            const name = await ensureCallsign('🎉 You reached the Moon! Enter your name for the leaderboard.');
            const now = new Date().toISOString();

            const board = getLocal();
            let mine = board.find(e => (e.name || '').toLowerCase() === name.toLowerCase());
            if (mine) { mine.clears = (mine.clears || 0) + 1; mine.best_score = Math.max(mine.best_score || 0, totalItems || 0); mine.updated_at = now; }
            else board.push({ name, clears: 1, best_score: totalItems || 0, updated_at: now });
            saveLocal(board);

            const client = await readyClient();
            if (!client) return;
            try {
                const uid = opts.getUserId();
                const { data: rows } = await client.from(opts.table).select('clears, best_score').eq('user_id', uid).limit(1);
                if (rows && rows.length) {
                    await client.from(opts.table)
                        .update({ name, clears: (rows[0].clears || 0) + 1, best_score: Math.max(rows[0].best_score || 0, totalItems || 0), updated_at: now })
                        .eq('user_id', uid);
                } else {
                    await client.from(opts.table)
                        .insert([{ user_id: uid, name, clears: 1, best_score: totalItems || 0, mode: 'hard', updated_at: now }]);
                }
            } catch (err) { console.warn('Leaderboard moon sync failed:', err); }
        }

        // ---- record a hard mode game that ended BEFORE the Moon ----
        async function recordScore(score) {
            if (!score || score < 1) return;
            if (score >= total()) return recordMoon(score);   // a full map is a Moon landing
            const name = await ensureCallsign(`🚀 ${score} ${unit.toLowerCase()} eliminated! Enter your name for the leaderboard.`);
            const now = new Date().toISOString();

            const board = getLocal();
            let mine = board.find(e => (e.name || '').toLowerCase() === name.toLowerCase());
            if (mine) {
                if (score > (mine.best_score || 0)) { mine.best_score = score; mine.updated_at = now; }
            } else board.push({ name, clears: 0, best_score: score, updated_at: now });
            saveLocal(board);

            const client = await readyClient();
            if (!client) return;
            try {
                const uid = opts.getUserId();
                const { data: rows } = await client.from(opts.table).select('best_score').eq('user_id', uid).limit(1);
                if (rows && rows.length) {
                    if (score > (rows[0].best_score || 0)) {
                        await client.from(opts.table).update({ name, best_score: score, updated_at: now }).eq('user_id', uid);
                    } else {
                        await client.from(opts.table).update({ name }).eq('user_id', uid);   // keep the name current
                    }
                } else {
                    await client.from(opts.table)
                        .insert([{ user_id: uid, name, clears: 0, best_score: score, mode: 'hard', updated_at: now }]);
                }
            } catch (err) { console.warn('Leaderboard score sync failed:', err); }
        }

        async function fetchAll() {
            const client = opts.getClient();
            if (client) {
                try {
                    const { data, error } = await client.from(opts.table)
                        .select('user_id, name, clears, best_score, updated_at')
                        .limit(1000);
                    if (!error && data) return { rows: data, cloud: true };
                } catch (err) { console.warn('Cloud leaderboard fetch failed:', err); }
            }
            return { rows: getLocal(), cloud: false };
        }

        function sectionHTML(title, color, valueLabel, ranked, key, isMe, full, suffix) {
            let html = `<div style="margin: 4px 0 16px;">
                <div style="color: ${color}; font-weight: bold; letter-spacing: 1px; font-size: 1rem; margin-bottom: 6px;">${title}</div>`;
            if (!ranked.length) {
                return html + `<p style="color: #94a3b8; margin: 6px 0;">No entries yet. Be the first!</p></div>`;
            }
            const shown = full ? ranked : ranked.slice(0, 5);
            html += '<table style="width: 100%; font-size: 0.95rem; border-collapse: collapse;">';
            html += `<tr style="color: #38bdf8; border-bottom: 1px solid #1e293b;"><th style="text-align: left; padding: 5px 6px;">Astronaut</th><th style="text-align: right; padding: 5px 6px;">${valueLabel}</th></tr>`;
            shown.forEach(r => {
                const me = isMe(r);
                html += `<tr style="border-bottom: 1px solid rgba(30,41,59,0.5);${me ? ' background: rgba(250,204,21,0.12);' : ''}">
                    <td style="padding: 7px 6px; color: ${me ? '#facc15' : '#f8fafc'};">${r.rank}. ${esc(r.name || 'Anonymous')}${me ? ' (YOU)' : ''}</td>
                    <td style="text-align: right; padding: 7px 6px; color: ${color}; font-weight: bold;">${r[key] || 0}</td>
                </tr>`;
            });
            html += '</table>';

            const myRow = ranked.find(isMe);
            if (myRow && !shown.includes(myRow)) {
                html += `<div style="margin-top: 6px; color: #facc15; font-weight: bold;">Your rank: #${myRow.rank} of ${ranked.length} (${myRow[key]} ${suffix})</div>`;
            } else if (!myRow) {
                html += `<div style="margin-top: 6px; color: #94a3b8; font-size: 0.85rem;">${ranked.length} astronaut${ranked.length === 1 ? '' : 's'} ranked</div>`;
            }
            return html + '</div>';
        }

        async function buildHTML(full) {
            const fetched = await fetchAll();
            const cloud = fetched.cloud;
            const uid = opts.getUserId();
            const myName = (localStorage.getItem('astro_geo_player_callsign') || '').replace(/\s+/g, ' ').trim().toLowerCase();
            // one entry per name: rows saved from different phones/computers under the same name are combined
            const rows = mergeByName(fetched.rows, uid);
            const isMe = r => (!!uid && (r.ids || []).includes(uid)) || (!!myName && (r.name || '').toLowerCase() === myName);

            // Anyone who cleared the whole map counts as a Moon lander, never as a high score
            const landed = r => (r.clears || 0) > 0 || (r.best_score || 0) >= total();
            const moon = rankRows(rows.filter(landed)
                .map(r => Object.assign({}, r, { clears: Math.max(r.clears || 0, 1) }))
                .sort(byValueThenTime('clears')), 'clears');
            const score = rankRows(rows.filter(r => !landed(r) && (r.best_score || 0) > 0).sort(byValueThenTime('best_score')), 'best_score');

            return sectionHTML('🌙 MOON LANDINGS (HARD MODE)', '#22c55e', 'Landings', moon, 'clears', isMe, full, 'landings') +
                   sectionHTML(`🚀 HIGH SCORES (HARD MODE)`, '#38bdf8', `${unit} Eliminated`, score, 'best_score', isMe, full, unit.toLowerCase());
        }

        // Update this player's name everywhere it is saved for this board
        async function rename(newName, oldName) {
            if (!newName) return;
            const board = getLocal();
            board.forEach(e => {
                const n = (e.name || '').toLowerCase();
                if (n === OLD_DEFAULT || (oldName && n === oldName.toLowerCase())) e.name = newName;
            });
            saveLocal(board);
            const client = await readyClient();
            if (!client) return;
            try { await client.from(opts.table).update({ name: newName }).eq('user_id', opts.getUserId()); }
            catch (err) { console.warn('Leaderboard rename failed:', err); }
        }

        const api = { recordMoon, recordScore, buildHTML, rename };
        boards.push(api);
        // once per visit, make sure the saved leaderboard row shows the current name
        setTimeout(() => { const n = storedName(); if (n) rename(n); }, 2000);
        return api;
    }

    return { create, askCallsign, ensureCallsign, changeCallsign, getCallsign: storedName };
})();
