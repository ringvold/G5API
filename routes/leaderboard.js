/** Express API router for leaderboards in get5.
 * @module routes/leaderboard
 * @requires express
 * @requires db
 */
const express = require("express");

/** Express module
 * @const
 */

const router = express.Router();
/** Database module.
 * @const
 */

const db = require("../db");

/** Util helpers.
 @const
 */
 const utils = require("../utils");

/** GET - Route serving to get lifetime leaderboard of teams.
 * @name router.get('/')
 * @function
 * @memberof module:routes/leaderboard
 * @param {string} path - Express path
 * @param {callback} middleware - Express middleware.
 */
router.get("/", async (req, res) => {
  try {
    let leaderboard = await getTeamLeaderboard();
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ message: err });
  }
});


/** GET - Route serving to get a lifetime leaderboard for players.
 * @name router.get('/players')
 * @function
 * @memberof module:routes/leaderboard
 * @param {string} path - Express path
 * @param {callback} middleware - Express middleware.
 */
router.get("/players", async (req, res) => {
  try {
    let leaderboard = await getPlayerLeaderboard();
    res.json(leaderboard);
  } catch (err) {
    console.log(err);
    res.status(500).json({ "message": err });
  }
});

/** GET - Route serving to get a lifetime leaderboard for players.
 * @name router.get('/players/:season_id')
 * @function
 * @memberof module:routes/leaderboard
 * @param {string} path - Express path
 * @param {callback} middleware - Express middleware.
 * @param {integer} season_id - Season ID to examine.
 */
router.get("/players/:season_id", async (req, res) => {
  try {
    let seasonId = req.params.season_id;
    let leaderboard = await getPlayerLeaderboard(seasonId);
    res.json(leaderboard);
  } catch (err) {
    console.log(err);
    res.status(500).json({ "message": err });
  }
});

/** GET - Route serving to get a season leaderboard of teams.
 * @name router.get('/:season_id')
 * @function
 * @memberof module:routes/leaderboard
 * @param {string} path - Express path
 * @param {integer} season_id - The season ID to query over for matches.
 * @param {callback} middleware - Express middleware.
 */
router.get("/:season_id", async (req, res) => {
  try {
    let seasonId = req.params.season_id;
    let leaderboard = await getTeamLeaderboard(seasonId);
    res.json(leaderboard);
  } catch (err) {
    console.log(err);
    res.status(500).json({ "message": err });
  }
});


/** Function to get the current team leaderboard standings in a season, or all time.
 * @function
 * @memberof module:routes/leaderboard
 * @param {string} [seasonId=null] - Season ID to filter.
 * @inner */
 const getTeamLeaderboard = async (seasonId = null) => {
  try {
    /* Logic:
     * 1. Get all matches.
     * 2. Loops through each match id, and get all map stats.
     * 3. Store all map stats for each unique team.
     * 4. Return all stats. Doesn't matter if sorted, front-end should take care of it?
     */
    let allMatches = null;
    let winningRounds,
      losingRounds = 0;
    let teamStandings = [];
    let teamValues = {};
    let matchSql = "";
    if (!seasonId) {
      matchSql =
        "SELECT id, team1_id, team2_id FROM `match` WHERE end_time IS NOT NULL AND winner IS NOT NULL AND cancelled = false";
      allMatches = await db.query(matchSql);
    } else {
      matchSql =
        "SELECT id, team1_id, team2_id FROM `match` WHERE end_time IS NOT NULL AND winner IS NOT NULL AND cancelled = FALSE AND season_id = ?";
      allMatches = await db.query(matchSql, [seasonId]);
    }
    for (let match of allMatches) {
      let mapStatSql =
        "SELECT * FROM map_stats WHERE match_id = ? AND winner IS NOT NULL";
      let teamSelectSql = "SELECT id, name FROM team WHERE id = ?";
      let winningTeam, losingTeam;
      const mapStats = await db.query(mapStatSql, match.id);
      for (let stats of mapStats) {
        winningRounds = 0; 
        losingRounds = 0;
        winningTeam = await db.query(teamSelectSql, [stats.winner]);
        if (winningTeam[0].id === match.team1_id) {
          losingTeam = await db.query(teamSelectSql, [match.team2_id]);
          winningRounds += stats.team1_score;
          losingRounds += stats.team2_score;
        } else {
          losingTeam = await db.query(teamSelectSql, [match.team1_id]);
          winningRounds += stats.team2_score;
          losingRounds += stats.team1_score;
        }
        let winName = winningTeam[0].name;
        let loseName = losingTeam[0].name;
        // Instantiate the object, needed only once.
        if(!teamStandings.some(el => el.name === winName)) {
          teamStandings.push({name: winName, wins: 0, losses: 0, rounddiff: 0})
        }
        if(!teamStandings.some(el => el.name === loseName)) {
          teamStandings.push({name: loseName, wins: 0, losses: 0, rounddiff: 0})
        }
        let winners = teamStandings.find((team) => {return team.name === winName});
        winners.wins += 1;
        winners.rounddiff += (winningRounds - losingRounds);
        let losers = teamStandings.find((team) => {return team.name === loseName});
        losers.losses += 1;
        losers.rounddiff += (losingRounds - winningRounds);
      }
    }
    return teamStandings;
  } catch (err) {
    console.log(err);
    throw err;
  }
};

/** Function to get the current player leaderboard standings in a season, or all time.
 * @function
 * @memberof module:routes/leaderboard
 * @param {string} [seasonId=null] - Season ID to filter.
 * @function
 */
const getPlayerLeaderboard = async (seasonId = null) => { 
  let allPlayers = [];
  let playerStats;
  console.log("Made it!");
  /* Logic:
  * 1. Get all player values where match is not cancelled or forfeit.
  * 2. Grab raw values, and calculate things like HSP and KDR for each user. Get names and cache 'em even.
  * 3. Insert into list of objects for each user.
  */
  let playerStatSql = `SELECT  steam_id, name, sum(kills) as kills, 
    sum(deaths) as deaths, sum(assists) as assists, sum(k1) as k1,
    sum(k2) as k2, sum(k3) as k3, 
    sum(k4) as k4, sum(k5) as k5, sum(v1) as v1, 
    sum(v2) as v2, sum(v3) as v3, sum(v4) as v4, 
    sum(v5) as v5, sum(roundsplayed) as trp, sum(flashbang_assists) as fba, 
    sum(damage) as dmg, sum(headshot_kills) as hsk
    FROM    player_stats 
    WHERE   match_id IN (
        SELECT  id 
        FROM    \`match\` 
        WHERE   cancelled=0
    )
    GROUP BY steam_id, name`;
  let playerStatSqlSeasons = `SELECT  steam_id, name, sum(kills) as kills, 
    sum(deaths) as deaths, sum(assists) as assists, sum(k1) as k1,
    sum(k2) as k2, sum(k3) as k3, 
    sum(k4) as k4, sum(k5) as k5, sum(v1) as v1, 
    sum(v2) as v2, sum(v3) as v3, sum(v4) as v4, 
    sum(v5) as v5, sum(roundsplayed) as trp, sum(flashbang_assists) as fba, 
    sum(damage) as dmg, sum(headshot_kills) as hsk
    FROM    player_stats
    WHERE   match_id IN (
        SELECT  id 
        FROM    \`match\` 
        WHERE   cancelled=0
        AND season_id = ?
    )
    GROUP BY steam_id, name`;
  
  if(!seasonId)
    playerStats = await db.query(playerStatSql);
  else
    playerStats = await db.query(playerStatSqlSeasons, [seasonId]);
  for(let player of playerStats){
    // Players can have multiple names. Avoid collision by combining everything, then performing averages.
    if(!allPlayers.some(el => el.steamId === player.steam_id)) {
      console.log(player);
      allPlayers.push({
        steamId: player.steam_id,
        name: player.name, // TODO: Use steam helper if name is null, get from steam?
        kills: player.kills,
        deaths: player.deaths,
        assists: player.assists,
        k1: player.k1,
        k2: player.k2,
        k3: player.k3,
        k4: player.k4,
        k5: player.k5,
        v1: player.v1,
        v2: player.v2,
        v3: player.v3,
        v4: player.v4,
        v5: player.v5,
        trp: player.trp,
        fba: player.fba,
        total_damage: player.dmg,
        hsk: player.hsk,
        hsp: player.kills === 0 ? 0 : ((player.hsk / player.kills) * 100).toFixed(2),
        average_rating: utils.getRating(player.kills, player.trp, player.deaths, player.k1, player.k2, player.k3, player.k4, player.k5)
      });
    } else {
      let collisionPlayer = allPlayers.find((user) => {return user.steamId === player.steam_id});
      // Update name, or concat name?
      collisionPlayer.name = (collisionPlayer.name + "/" + player.name).replace(/\/+$/, "");
      collisionPlayer.kills += player.kills;
      collisionPlayer.deaths += player.deaths;
      collisionPlayer.assists += player.assists;
      collisionPlayer.k1 += player.k1;
      collisionPlayer.k2 += player.k2;
      collisionPlayer.k3 += player.k3;
      collisionPlayer.k4 += player.k4;
      collisionPlayer.k5 += player.k5;
      collisionPlayer.v1 += player.v1;
      collisionPlayer.v2 += player.v2;
      collisionPlayer.v3 += player.v3;
      collisionPlayer.v4 += player.v4;
      collisionPlayer.v5 += player.v5;
      collisionPlayer.trp += player.trp;
      collisionPlayer.fba += player.fba;
      collisionPlayer.hsk += player.hsk;
      collisionPlayer.total_damage += player.total_damage;
      collisionPlayer.hsp = collisionPlayer.kills === 0 ? 0 : ((collisionPlayer.hsk / collisionPlayer.kills) * 100).toFixed(2);
      collisionPlayer.average_rating = utils.getRating(collisionPlayer.kills, collisionPlayer.trp, collisionPlayer.k1, collisionPlayer.k2, collisionPlayer.k3, collisionPlayer.k4, collisionPlayer.k5);
    }
  }
  return allPlayers;
};
module.exports = router;