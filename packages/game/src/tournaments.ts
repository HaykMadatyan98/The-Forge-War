/** Shared tournament catalog — UI mock until backend exists. */

export type TournamentBracket = 'open' | 'rookie' | 'veteran' | 'elite';

export type TournamentMock = {
  id: string;
  nameKey: string;
  detailKey: string;
  /** Min rating inclusive */
  ratingMin: number;
  /** Max rating inclusive (null = no cap) */
  ratingMax: number | null;
  /** Max deploy units allowed */
  deployCap: number;
  /** Entry fee sparks (display only for now) */
  entrySparks: number;
  prizeKey: string;
  status: 'upcoming' | 'open' | 'running' | 'ended';
  startsInHours: number;
  entrants: number;
  maxEntrants: number;
  bracket: TournamentBracket;
};

export const TOURNAMENT_MOCKS: TournamentMock[] = [
  {
    id: 'cup_open_weekly',
    nameKey: 'tourOpenWeekly',
    detailKey: 'tourOpenWeeklyDetail',
    ratingMin: 0,
    ratingMax: null,
    deployCap: 6,
    entrySparks: 2,
    prizeKey: 'tourPrizeOpen',
    status: 'open',
    startsInHours: 6,
    entrants: 48,
    maxEntrants: 64,
    bracket: 'open',
  },
  {
    id: 'cup_rookie',
    nameKey: 'tourRookie',
    detailKey: 'tourRookieDetail',
    ratingMin: 0,
    ratingMax: 1099,
    deployCap: 4,
    entrySparks: 0,
    prizeKey: 'tourPrizeRookie',
    status: 'open',
    startsInHours: 2,
    entrants: 22,
    maxEntrants: 32,
    bracket: 'rookie',
  },
  {
    id: 'cup_veteran',
    nameKey: 'tourVeteran',
    detailKey: 'tourVeteranDetail',
    ratingMin: 1100,
    ratingMax: 1399,
    deployCap: 6,
    entrySparks: 3,
    prizeKey: 'tourPrizeVeteran',
    status: 'upcoming',
    startsInHours: 18,
    entrants: 0,
    maxEntrants: 32,
    bracket: 'veteran',
  },
  {
    id: 'cup_elite',
    nameKey: 'tourElite',
    detailKey: 'tourEliteDetail',
    ratingMin: 1400,
    ratingMax: null,
    deployCap: 8,
    entrySparks: 5,
    prizeKey: 'tourPrizeElite',
    status: 'upcoming',
    startsInHours: 36,
    entrants: 4,
    maxEntrants: 16,
    bracket: 'elite',
  },
];

export function canEnterTournament(t: TournamentMock, rating: number) {
  if (rating < t.ratingMin) return false;
  if (t.ratingMax != null && rating > t.ratingMax) return false;
  return true;
}
