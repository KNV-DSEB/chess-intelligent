const pieces: Readonly<Record<string, string>> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
  P: '♙',
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};

function boardSquares(fen: string): Array<{ piece: string; square: string; light: boolean }> {
  const rows = (fen.split(' ')[0] ?? '').split('/');
  const squares: Array<{ piece: string; square: string; light: boolean }> = [];
  rows.forEach((row, rowIndex) => {
    let file = 0;
    for (const token of row) {
      const empty = /\d/u.test(token) ? Number(token) : 0;
      for (let offset = 0; offset < (empty || 1); offset += 1) {
        const rank = 8 - rowIndex;
        squares.push({
          piece: empty ? '' : (pieces[token] ?? ''),
          square: `${String.fromCharCode(97 + file)}${rank}`,
          light: (file + rowIndex) % 2 === 0,
        });
        file += 1;
      }
    }
  });
  return squares;
}

export function ChessPosition({
  fen,
  sideToMove,
  compact = false,
}: {
  fen: string;
  sideToMove: 'WHITE' | 'BLACK';
  compact?: boolean;
}) {
  const ordered = boardSquares(fen);
  const squares = sideToMove === 'BLACK' ? [...ordered].reverse() : ordered;
  return (
    <div
      className={`training-board${compact ? ' compact-board' : ''}`}
      aria-label={`Exact ${sideToMove.toLowerCase()}-to-move position`}
    >
      {squares.map((square) => (
        <div
          className={square.light ? 'training-square light' : 'training-square dark'}
          key={square.square}
          title={square.square}
        >
          <span aria-hidden="true">{square.piece}</span>
          <small>{square.square}</small>
        </div>
      ))}
    </div>
  );
}
