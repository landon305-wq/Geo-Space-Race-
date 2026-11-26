// ==========================================
// GEO-SPACERACE: THEMED ELIMINATION MODES
// Soccer (world map) and Sports (USA map) reuse the regular elimination engines
// with their own question bank, high scores and leaderboard table.
// ==========================================
(function () {
    if (window.createGlobalElimination) {
        window.soccerEliminationGame = window.createGlobalElimination({
            questionFile: 'questions-soccer-elimination.json',
            normalKey: 'astro_geo_soccer_elim_highscore',
            hardKey: 'astro_geo_soccer_elim_hard_highscore',
            localLbKey: 'astro_geo_soccer_elim_leaderboard',
            table: 'soccer_leaderboard',
            authKey: 'sb-soccer-auth',
            coveredOnly: true      // only the countries the soccer questions cover count toward the Moon
        });
    }
    if (window.createUsaElimination) {
        window.sportsEliminationGame = window.createUsaElimination({
            questionFile: 'questions-sports-elimination.json',
            normalKey: 'astro_geo_sports_elim_highscore',
            hardKey: 'astro_geo_sports_elim_hard_highscore',
            localLbKey: 'astro_geo_sports_elim_leaderboard',
            table: 'sports_leaderboard',
            authKey: 'sb-sports-auth'
        });
    }
})();
