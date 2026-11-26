// ==========================================
// GEO-SPACERACE: OTHER GAME MODES
// The "Other Game Modes" menu on the home screen. Each themed mode is one entry in OTHER_MODES.
// To add a new mode:
//   1. add an entry below with ready: true and a start() function that launches it
//   2. load the mode's own script in index.html (after this file is fine)
// Entries with ready: false show as "Coming soon" cards that can't be launched yet.
// ==========================================
window.otherModes = (function () {

    const OTHER_MODES = [
        {
            id: 'sports',
            icon: '🏟️',
            title: 'USA Sports Elimination',
            desc: 'Pro teams, college conferences, champions and famous events on the USA map.',
            ready: true,
            start: () => window.openThemedElimination && window.openThemedElimination('sports')
        },
        {
            id: 'eusoccer',
            icon: '⚽',
            title: 'Europe Soccer Elimination',
            desc: 'World Cups, Euros, clubs and leagues on the Europe map.',
            ready: true,
            start: () => window.openThemedElimination && window.openThemedElimination('eusoccer')
        },
        {
            id: 'worldsports',
            icon: '🌍',
            title: 'Global Sports Elimination',
            desc: 'Soccer, Olympics, rugby, cricket and F1. All 197 countries are in play.',
            ready: true,
            start: () => window.openThemedElimination && window.openThemedElimination('worldsports')
        }
    ];

    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const sound = type => { try { if (window.initAudio) window.initAudio(); if (window.playSound) window.playSound(type); } catch (e) {} };

    function render() {
        const list = $('other-modes-list');
        if (!list) return;
        list.innerHTML = OTHER_MODES.map(m => `
            <button type="button" class="other-mode-card${m.ready ? '' : ' soon'}" data-mode="${esc(m.id)}"${m.ready ? '' : ' aria-disabled="true"'}>
                <span class="other-mode-icon">${m.icon}</span>
                <span class="other-mode-text">
                    <span class="other-mode-title">${esc(m.title)}</span>
                    <span class="other-mode-desc">${esc(m.desc)}</span>
                </span>
                <span class="other-mode-tag">${m.ready ? 'PLAY ▶' : 'COMING SOON'}</span>
            </button>`).join('');
        list.querySelectorAll('.other-mode-card').forEach(card => {
            card.addEventListener('click', () => {
                const mode = OTHER_MODES.find(m => m.id === card.dataset.mode);
                if (!mode) return;
                if (!mode.ready || typeof mode.start !== 'function') {
                    sound('wrong');
                    card.classList.remove('shake');
                    void card.offsetWidth;
                    card.classList.add('shake');
                    return;
                }
                sound('confirm');
                mode.start();
            });
        });
    }

    function show() {
        sound('confirm');
        render();
        $('daily-menu').classList.add('hidden');
        $('elim-menu').classList.add('hidden');
        $('other-menu').classList.remove('hidden');
    }

    function back() {
        sound('confirm');
        $('other-menu').classList.add('hidden');
        $('daily-menu').classList.remove('hidden');
        if (window.refreshDailyHome) window.refreshDailyHome();
    }

    function init() {
        const open = $('show-other-btn');
        const close = $('other-back-btn');
        if (open) open.addEventListener('click', show);
        if (close) close.addEventListener('click', back);
        render();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    return { modes: OTHER_MODES, show, back, render };
})();
