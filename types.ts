export type RankingGameProps = {
  gameId: number;
  rating: number;
  weight: number;
  isBlowout: boolean;
  won: boolean;
};

export enum Level {
  CLUB = 'club',
  COLLEGE = 'college',
}

export enum EventGameStatus {
  SCHEDULED = 'Scheduled',
  FINAL = 'Final',
  IN_PROGRESS = 'In Progress',
}

export type EventGame = {
  EventGameId: number;
  StartDate: string;
  StartTime: string;
  HomeTeamId: number;
  HomeTeamName: string;
  HomeTeamScore: string | null;
  AwayTeamId: number;
  AwayTeamName: string;
  AwayTeamScore: string | null;
  GameStatus: EventGameStatus; // | something else
  FieldName: string;
};

export enum Division {
  MIXED = 'mixed',
  MENS = 'mens',
  WOMENS = 'womens',
  COLLEGE_MENS = 'college-mens',
  COLLEGE_WOMENS = 'college-womens',
}
export type Truthy<T> = T extends false | '' | 0 | null | undefined ? never : T; // from lodash

export function truthy<T>(value: T): value is Truthy<T> {
  return !!value;
}