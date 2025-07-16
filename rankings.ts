import { Division, EventGame, Level, RankingGameProps, truthy} from './types';
import _ from 'lodash';
import dayjs from 'dayjs';

export type EventGameMinimal = {
  EventGameId: EventGame['EventGameId'];
  HomeTeamId: EventGame['HomeTeamId'];
  AwayTeamId: EventGame['AwayTeamId'];
  HomeTeamScore: EventGame['HomeTeamScore'];
  AwayTeamScore: EventGame['AwayTeamScore'];
  StartDate?: EventGame['StartDate'];
  HomeTeamName?: EventGame['HomeTeamName'];
  AwayTeamName?: EventGame['AwayTeamName'];
};

export const computeDifferential = (losingScore: number, winningScore: number) => {
  const r = losingScore / (winningScore - 1);
  const differential = 125 + (475 * Math.sin(Math.min(1, (1 - r) / 0.5) * 0.4 * Math.PI)) / Math.sin(0.4 * Math.PI);

  return differential;
};

export type GameData = {
  game: EventGameMinimal;
  differential: number;
  winningScore: number;
  losingScore: number;
  winningTeamId: number;
  losingTeamId: number;
};

export type TeamGameData = GameData & {
  rating: number;
  weight: number;
};

export type TeamResult = { rating: number; id: number | string; games: TeamGameData[] };

export type ValidTeamGameData = TeamGameData & {
  percent: number;
};

export type BaseTeamData = {
  games: TeamGameData[];
  id: number;
  currentRating: number;
};

export type TeamData = BaseTeamData & {
  computedGames: RankingGameProps[];
  validGames: ValidTeamGameData[];
  blowoutGames: TeamGameData[];
};

const computeBlowout = (winningTeam: BaseTeamData, losingTeam: BaseTeamData, game: GameData) => {
  const blowoutCriterionOne = winningTeam?.currentRating - losingTeam?.currentRating >= 600;
  const blowoutCriterionTwo = game.winningScore > game.losingScore * 2 + 1;
  // TODO: However, this is only done if the winning team has at least N other results that are not being ignored, where N=5

  return blowoutCriterionOne && blowoutCriterionTwo;
};

const computeGameRating = (
  game: GameData,
  team: TeamData,
  opposingTeam: TeamData,
  options: { dateMultiplier?: boolean; scoreMultiplier?: boolean; scoreWeightMax?: number },
): TeamGameData => {
  const didWin = game.winningTeamId === team.id;

  const rating = opposingTeam?.currentRating + game.differential * (didWin ? 1 : -1);

  const weight = computeWeightedRating(game, options);

  return {
    ...game,
    rating,
    weight,
  };
};

const computeScoreWeight = (game: GameData, options: { scoreWeightMax?: number }) => {
  const { scoreWeightMax = 13 } = options;
  const { winningScore, losingScore } = game;

  let weight;
  // "The score weight of a game will be 1.0 if the winning score is at least 13, or if the total score is at least 19"
  if (winningScore >= scoreWeightMax || winningScore + losingScore >= (19 / 13) * scoreWeightMax) weight = 1;
  else {
    weight = Math.sqrt((winningScore + Math.max(losingScore, (winningScore - 1) / 2)) / 19);
  }

  return weight;
};

const CLUB_REGULAR_SEASON_WEEKS = 13;
const COLLEGE_REGULAR_SEASON_WEEKS = 13;

const B = -0.5;

export const getCurrentYearFromDivision = (division: Division) => {
  const level = getLevel(division);
  // club regular season starts in may
  let rankingsYear = dayjs().month() >= 5 ? dayjs().year() : dayjs().year() - 1;
  if (level === Level.COLLEGE) {
    // College regular season starts in january
    rankingsYear = dayjs().month() >= 1 ? dayjs().year() : dayjs().year() - 1;
  }

  return rankingsYear;
};

export const getLevel = (division: Division) => {
  if (division === Division.COLLEGE_MENS || division === Division.COLLEGE_WOMENS) {
    return Level.COLLEGE;
  }
  return Level.CLUB;
};

function getFirstTuesdayInMonth(year: number, month: number): Date {
  const date = new Date(year, month, 1);
  // 2 = Tuesday (0 = Sunday)
  while (date.getDay() !== 2) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

const computeDateWeight = (game: GameData, options: RankingOptions = {}) => {
  const level = options?.division ? getLevel(options.division) : Level.CLUB; // Default to club

  if (!game.game.StartDate) {
    console.log('No start date for game', game);
    return 1;
  }

  const year = new Date(game.game.StartDate).getFullYear();

  // Get first tuesday in june
  const clubStartDate = getFirstTuesdayInMonth(year, 5); // "in june", ends in "mid-september"
  const collegeStartDate = getFirstTuesdayInMonth(year, 0); // "in january", ends in "mid-april"

  let weeks = CLUB_REGULAR_SEASON_WEEKS;
  let startDate = clubStartDate;
  if (level === Level.COLLEGE) {
    weeks = COLLEGE_REGULAR_SEASON_WEEKS;
    startDate = collegeStartDate;
  }

  const dateMultiplier = Math.pow(1.5, 1 / weeks);

  const gameWeek = Math.floor(
    (new Date(game.game.StartDate).getTime() - startDate.getTime()) / 1000 / 60 / 60 / 24 / 7,
  );

  const currentGameWeek = _.clamp(gameWeek, 0, weeks);

  const weight = Math.pow(dateMultiplier, currentGameWeek) + B;

  return weight;
};

const computeWeightedRating = (game: GameData, options: RankingOptions = {}) => {
  const { dateMultiplier = true, scoreMultiplier = true } = options;
  const scoreWeight = scoreMultiplier ? computeScoreWeight(game, options) : 1;
  const dateWeight = dateMultiplier ? computeDateWeight(game, options) : 1;

  return scoreWeight * dateWeight;
};

const computeWeightedAverage = (games: TeamGameData[]) => {
  const summedWeightedRatings = _.sum(games.map((g) => g.rating * g.weight));
  const summedWeights = _.sum(games.map((g) => g.weight));

  const average = summedWeightedRatings / summedWeights;

  return average;
};

export const computeGameValues = (teams: TeamData[], games: EventGameMinimal[], options: RankingOptions = {}) => {
  const formattedGames: GameData[] = games
    .map((game) => {
      const awayTeamScore = parseInt(game.AwayTeamScore || 'NaN', 10);
      const homeTeamScore = parseInt(game.HomeTeamScore || 'NaN', 10);

      const winningScore = awayTeamScore > homeTeamScore ? awayTeamScore : homeTeamScore;
      const losingScore = awayTeamScore > homeTeamScore ? homeTeamScore : awayTeamScore;

      const differential = computeDifferential(losingScore, winningScore);

      const winningTeamId = awayTeamScore > homeTeamScore ? game.AwayTeamId : game.HomeTeamId;
      const losingTeamId = awayTeamScore > homeTeamScore ? game.HomeTeamId : game.AwayTeamId;

      return {
        game,
        winningScore,
        losingScore,
        winningTeamId,
        losingTeamId,
        differential,
      };
    })
    .filter(truthy);

  const teamsData: BaseTeamData[] = teams
    .map((team) => {
      const teamGames = formattedGames
        // Find only games for this team
        .filter((game) => game.losingTeamId === team.id || game.winningTeamId === team.id)
        // make sure differential exists
        .filter((game) => !Number.isNaN(game.differential));

      const teamGameData: TeamGameData[] = teamGames
        .map((game) => {
          const opposingTeamId = game.winningTeamId === team.id ? game.losingTeamId : game.winningTeamId;
          const opposingTeam = teams.find((t) => t.id === opposingTeamId);

          if (!opposingTeam) {
            console.log(`No opposing team found for game ${game.game.EventGameId}
Missing Team: ${opposingTeamId}`);
            return null;
          }

          const computedGame = computeGameRating(game, team, opposingTeam, options);

          return computedGame;
        })
        .filter(truthy);

      const weightedAverage = computeWeightedAverage(teamGameData);

      return {
        games: teamGameData,
        currentRating: weightedAverage,
        id: team.id,
      };
    })
    .filter(truthy);

  return teamsData;
};

const MAX_ITERATIONS = 500;

type RankingOptions = {
  currentIteration?: number;
  dateMultiplier?: boolean;
  scoreMultiplier?: boolean;
  scoreWeightMax?: number;
  previousCurrentRatings?: number[] | null;
  previousAverageRatingDiff?: number | null;
  division?: Division;
};

export const iterate = (
  data: TeamData[],
  games: EventGameMinimal[],
  options: RankingOptions = {},
): { data: TeamData[]; totalIterations?: number } => {
  const { currentIteration = 0, previousCurrentRatings = null, previousAverageRatingDiff = null } = options;

  const n = currentIteration;
  const newData = computeGameValues(data, games, options);

  if (n < MAX_ITERATIONS) {
    const computedData = newData?.map((d) => {
      const weightedAverage = computeWeightedAverage(d.games);

      return {
        ...d,
        currentRating: weightedAverage,
        computedGames: d.games.map((g) => ({
          gameId: g.game.EventGameId,
          rating: g.rating,
          weight: g.weight,
          won: g.winningTeamId === d.id,
          isBlowout: false,
        })),
        validGames: d.games.map((g) => ({
          ...g,
          percent: g.weight / _.sum(d.games.map((v) => v.weight)),
        })),
        blowoutGames: [] as TeamGameData[],
      };
    });

    computedData?.forEach((d) => {
      if (isNaN(d.currentRating)) {
        throw new Error('Something went wrong, a rating was calculated as NaN');
      }
    });

    let currentRatingAverageDiff = 0;
    // Calculate diff, and if we've iterated enough then stop
    if (previousCurrentRatings !== null) {
      // Compute the difference between each current rating and the previous rating, then average those differences
      const currentRatingDiffs = computedData.map((d, i) => Math.abs(d.currentRating - previousCurrentRatings[i]));
      const totalRatingDiffs = currentRatingDiffs.reduce((a, b) => a + b, 0);
      const averageRatingDiff = totalRatingDiffs / computedData.length;

      // Compare the average calculated above with the previous average
      if (previousAverageRatingDiff && Math.abs(averageRatingDiff - previousAverageRatingDiff) < 0.001) {
        return { data: computedData, totalIterations: n };
      }

      currentRatingAverageDiff = averageRatingDiff;
    }

    return iterate(computedData, games, {
      ...options,
      currentIteration: n + 1,
      previousCurrentRatings: computedData.map((d) => d.currentRating),
      previousAverageRatingDiff: currentRatingAverageDiff,
    });
  }

  return { data, totalIterations: n };
};

const applyBlowoutRule = (teams: TeamData[]): TeamData[] => {
  return teams.map((t) => {
    const [blowoutGames, validGames] = _.partition(t.games, (g) => {
      const game = t.games.find((baseGame) => baseGame.game.EventGameId === g.game.EventGameId);

      if (game) {
        const winningTeam = teams.find((team) => team.id === game.winningTeamId);
        const losingTeam = teams.find((team) => team.id === game.losingTeamId);

        if (!winningTeam || !losingTeam) throw new Error('Could not find winning or losing team');

        const isBlowout = computeBlowout(winningTeam, losingTeam, game);
        if (isBlowout) return true;
      }

      return false;
    });

    // Compute final rating without blowout games
    const finalRating = computeWeightedAverage(validGames);

    return {
      ...t,
      computedGames: t.computedGames.map((g) => ({
        ...g,
        // Add blowout flag
        isBlowout: blowoutGames.some((bg) => bg.game.EventGameId === g.gameId),
      })),
      currentRating: finalRating,
      blowoutGames,
    };
  });
};

export const run = (teams: TeamData[], games: EventGameMinimal[], options: RankingOptions = {}) => {
  // Filter out any games with null or missing scores
  let filteredGames = _.partition(
    games,
    (g) => !isNaN(parseInt(g.AwayTeamScore || 'NaN', 10)) && !isNaN(parseInt(g.HomeTeamScore || 'NaN', 10)),
  );

  let validGames = filteredGames[0];
  const nullGames = filteredGames[1];

  // Filter out games that are ties
  filteredGames = _.partition(
    validGames,
    (g) =>
      // And not a tie
      parseInt(g.AwayTeamScore || '', 10) !== parseInt(g.HomeTeamScore || '', 10),
  );

  validGames = filteredGames[0];
  const tieGames = filteredGames[1];

  // Filter out any teams that have no games
  const [validTeams, invalidTeams] = _.partition(teams, (team) => {
    const teamGames = validGames
      // Find only games for this team
      .filter((game) => game.HomeTeamId === team.id || game.AwayTeamId === team.id);

    // Make sure the team has played at least one game (can enforce a minimum number of games here)
    return teamGames.length > 0;
  });

  const iterationResults = iterate(validTeams, validGames, options);

  // Finally apply blowout rule
  const finalResults = applyBlowoutRule(iterationResults.data);

  const results = {
    ...iterationResults,
    data: finalResults,
    invalidTeams: invalidTeams.map((t) => ({
      id: t.id,
      message: 'Team has no valid games',
    })),
    invalidGames: [
      ...nullGames.map((g) => ({
        id: g.EventGameId,
        message: 'Game has no scores',
      })),
      ...tieGames.map((g) => ({
        id: g.EventGameId,
        message: 'Game was a tie',
      })),
    ],
  };

  return results;
};

type GameProps = Omit<EventGameMinimal, 'EventGameId'>;

export const computeCustomRankings = (games: GameProps[]) => {
  games = games.map((g) => ({
    ...g,
  }));

  const playerIds = [...new Set(games.flatMap((g) => [g.AwayTeamId, g.HomeTeamId]))];

  if (!playerIds.length) {
    return {
      success: false,
      message: 'Games not formatted correctly. Make sure each entry has an AwayTeamId and HomeTeamId.',
    };
  }

  if (
    !games.every((g) =>
      ['AwayTeamId', 'HomeTeamId', 'AwayTeamScore', 'HomeTeamScore'].every(
        (key) =>
          g[key as keyof GameProps] !== undefined &&
          g[key as keyof GameProps] !== '' &&
          g[key as keyof GameProps] !== null,
      ),
    )
  ) {
    return {
      success: false,
      message: 'Games not formatted correctly. Make sure there are no missing or blank values.',
    };
  }

  const teams = [...playerIds].map((id) => ({
    id,
    currentRating: 1000,
    games: [],
    validGames: [],
    blowoutGames: [],
    computedGames: [],
  }));

  const results = run(
    teams,
    games.map((g, i) => ({
      HomeTeamId: g.HomeTeamId,
      AwayTeamId: g.AwayTeamId,
      HomeTeamScore: g.HomeTeamScore,
      AwayTeamScore: g.AwayTeamScore,
      StartDate: g.StartDate,
      EventGameId: i,
    })),
    {
      dateMultiplier: false,
      scoreMultiplier: false,
    },
  );

  return {
    success: true,
    playerIds,
    meta: {
      iterations: results.totalIterations,
    },
    results: results.data.map((r) => ({
      rating: r.currentRating,
      id: r.id,
      games: r.games,
    })),
  };
};
