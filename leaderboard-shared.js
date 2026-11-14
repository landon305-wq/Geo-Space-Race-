// ==========================================
// GEO-SPACERACE SHARED HARD MODE LEADERBOARD
// Used by both USA and Europe modes.
// Two boards per mode:
//   1. Moon Landings  (players with clears > 0, ranked by clears)
//   2. High Score     (players who have NOT landed yet, ranked by best_score)
// Once a player lands on the Moon they leave the High Score board automatically.
// ==========================================
window.GeoLeaderboard = (function () {

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

        function getCallsign(promptText) {
            let name = localStorage.getItem('astro_geo_player_callsign') || '';
            if (!name.trim()) {
                const input = prompt(promptText + '\nEnter your astronaut callsign for the leaderboard:', 'Commander Cadet');
                name = (input && input.trim()) ? input.trim().slice(0, 24) : 'Commander Cadet';
                localStorage.setItem('astro_geo_player_callsign', name);
            }
            return name;
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
            const name = getCallsign('🎉 LUNAR LANDING SUCCESS!');
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
            const name = getCallsign('🚀 MISSION OVER! ' + score + ' ' + unit.toLowerCase() + ' eliminated.');
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
            const { rows, cloud } = await fetchAll();
            const uid = opts.getUserId();
            const myName = (localStorage.getItem('astro_geo_player_callsign') || '').toLowerCase();
            const isMe = r => cloud ? (!!uid && r.user_id === uid) : (!!myName && (r.name || '').toLowerCase() === myName);

            // Anyone who cleared the whole map counts as a Moon lander, never as a high score
            const landed = r => (r.clears || 0) > 0 || (r.best_score || 0) >= total();
            const moon = rankRows(rows.filter(landed)
                .map(r => Object.assign({}, r, { clears: Math.max(r.clears || 0, 1) }))
                .sort(byValueThenTime('clears')), 'clears');
            const score = rankRows(rows.filter(r => !landed(r) && (r.best_score || 0) > 0).sort(byValueThenTime('best_score')), 'best_score');

            return sectionHTML('🌙 MOON LANDINGS (HARD MODE)', '#22c55e', 'Landings', moon, 'clears', isMe, full, 'landings') +
                   sectionHTML(`🚀 HIGH SCORES (HARD MODE)`, '#38bdf8', `${unit} Eliminated`, score, 'best_score', isMe, full, unit.toLowerCase());
        }

        return { recordMoon, recordScore, buildHTML };
    }

    return { create };
})();