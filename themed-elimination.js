// ==========================================
// GEO-SPACERACE: THEMED ELIMINATION MODES
// USA Sports (USA map), Europe Soccer (Europe map) and Global Sports (world map) reuse the
// regular elimination engines with their own question bank, high scores and leaderboard table.
// ==========================================
(function () {
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
    if (window.createEuropeElimination) {
        window.euSoccerEliminationGame = window.createEuropeElimination({
            questionFile: 'questions-eusoccer-elimination.json',
            normalKey: 'astro_geo_eusoccer_elim_highscore',
            hardKey: 'astro_geo_eusoccer_elim_hard_highscore',
            localLbKey: 'astro_geo_eusoccer_elim_leaderboard',
            table: 'eu_soccer_leaderboard',
            authKey: 'sb-eusoccer-auth'
        });
    }
    if (window.createGlobalElimination) {
        window.worldSportsEliminationGame = window.createGlobalElimination({
            questionFile: 'questions-worldsports-elimination.json',
            normalKey: 'astro_geo_worldsports_elim_highscore',
            hardKey: 'astro_geo_worldsports_elim_hard_highscore',
            localLbKey: 'astro_geo_worldsports_elim_leaderboard',
            table: 'world_sports_leaderboard',
            authKey: 'sb-worldsports-auth'
        });
    }
})();
