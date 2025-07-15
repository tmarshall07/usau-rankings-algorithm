import { games } from "./games-mixed-2025";
import { run } from "./rankings";
import { Division } from "./types";

const main = async () => {
  const teamIds = new Set<number>();
  games.forEach((g) => {
    teamIds.add(g.HomeTeamId);
    teamIds.add(g.AwayTeamId);
  });

  const initialTeams = [...teamIds].map((id) => ({
    id,
    currentRating: 1000,
    games: [],
    validGames: [],
    blowoutGames: [],
    computedGames: [],
  }));

  const results = run(initialTeams, games, {
    division: Division.MIXED
  });

  console.log(results);
}

main();