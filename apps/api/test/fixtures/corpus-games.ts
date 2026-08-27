export interface CorpusFixtureGame {
  key: string;
  gameContext: 'OTB' | 'ONLINE';
  timeCategory: 'CLASSICAL' | 'RAPID' | 'BLITZ';
  pgn: string;
}

export const FOCAL_FIDE_ID = '12456789';

export const CORPUS_FIXTURE_GAMES: CorpusFixtureGame[] = [
  {
    key: 'focal-e4-win',
    gameContext: 'OTB',
    timeCategory: 'CLASSICAL',
    pgn: `[Event "Academy Masters A"]
[Date "2024.01.10"]
[White "Nguyen Van A"]
[WhiteFideId "12456789"]
[WhiteElo "2185"]
[Black "Strong Opponent One"]
[BlackFideId "22000001"]
[BlackElo "2300"]
[Result "1-0"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 1-0`,
  },
  {
    key: 'focal-e4-draw',
    gameContext: 'OTB',
    timeCategory: 'CLASSICAL',
    pgn: `[Event "Academy Masters B"]
[Date "2025.02.11"]
[White "Nguyen Van A"]
[WhiteFideId "12456789"]
[WhiteElo "2210"]
[Black "Strong Opponent Two"]
[BlackFideId "22000002"]
[BlackElo "2450"]
[Result "1/2-1/2"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1/2-1/2`,
  },
  {
    key: 'focal-d4-low-opponent',
    gameContext: 'OTB',
    timeCategory: 'CLASSICAL',
    pgn: `[Event "Academy Masters C"]
[Date "2025.03.12"]
[White "Nguyen Van A"]
[WhiteFideId "12456789"]
[WhiteElo "2215"]
[Black "Developing Opponent"]
[BlackFideId "22000003"]
[BlackElo "2199"]
[Result "0-1"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 0-1`,
  },
  {
    key: 'focal-e4-unknown-opponent-rating',
    gameContext: 'OTB',
    timeCategory: 'CLASSICAL',
    pgn: `[Event "Academy Masters D"]
[Date "2026.04.13"]
[White "Nguyen Van A"]
[WhiteFideId "12456789"]
[WhiteElo "2230"]
[Black "Unrated Opponent"]
[BlackFideId "22000004"]
[Result "1-0"]

1. e4 c6 2. d4 d5 3. Nc3 dxe4 1-0`,
  },
  {
    key: 'focal-d4-rapid',
    gameContext: 'OTB',
    timeCategory: 'RAPID',
    pgn: `[Event "Academy Rapid"]
[Date "2025.05.14"]
[White "Nguyen Van A"]
[WhiteFideId "12456789"]
[WhiteElo "2200"]
[Black "Rapid Specialist"]
[BlackFideId "22000005"]
[BlackElo "2350"]
[Result "1-0"]

1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 1-0`,
  },
  {
    key: 'focal-nf3-online-transposition',
    gameContext: 'ONLINE',
    timeCategory: 'BLITZ',
    pgn: `[Event "Academy Online"]
[Date "2024.06.15"]
[White "Nguyen Van A"]
[WhiteFideId "12456789"]
[WhiteElo "2190"]
[Black "Online Specialist"]
[BlackFideId "22000006"]
[BlackElo "2500"]
[Result "0-1"]

1. Nf3 d5 2. g3 Nf6 3. Bg2 g6 4. O-O Bg7 5. d3 O-O 0-1`,
  },
  {
    key: 'global-g3-transposition',
    gameContext: 'OTB',
    timeCategory: 'CLASSICAL',
    pgn: `[Event "Transposition Cup"]
[Date "2025.07.16"]
[White "Different Player"]
[WhiteFideId "33000001"]
[WhiteElo "2520"]
[Black "Reference Opponent"]
[BlackFideId "33000002"]
[BlackElo "2480"]
[Result "1/2-1/2"]

1. g3 d5 2. Nf3 Nf6 3. Bg2 g6 4. O-O Bg7 5. c4 O-O 1/2-1/2`,
  },
  {
    key: 'focal-as-black',
    gameContext: 'OTB',
    timeCategory: 'CLASSICAL',
    pgn: `[Event "Academy Masters E"]
[Date "2026.08.17"]
[White "White Challenger"]
[WhiteFideId "44000001"]
[WhiteElo "2400"]
[Black "Nguyen Van A"]
[BlackFideId "12456789"]
[BlackElo "2240"]
[Result "0-1"]

1. c4 e5 2. Nc3 Nf6 3. g3 d5 0-1`,
  },
  {
    key: 'same-name-unrelated',
    gameContext: 'OTB',
    timeCategory: 'CLASSICAL',
    pgn: `[Event "Names Are Not Identities"]
[Date "2026.09.18"]
[White "Nguyen Van A"]
[WhiteElo "2100"]
[Black "Another Player"]
[BlackElo "2250"]
[Result "1-0"]

1. e4 e6 2. d4 d5 3. Nc3 Bb4 1-0`,
  },
];
