import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import {
  normalizeScoreToWhitePerspective,
  type ChessEngine,
  type EngineAnalysisRequest,
  type EngineAnalysisResult,
  type EngineIdentity,
  type EnginePrincipalVariation,
  type EngineScore,
  type EngineSearchConfiguration,
} from '@chess-intelligent/domain';

const STANDARD_INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export class EngineProcessError extends Error {
  readonly transient = true;

  constructor(message: string) {
    super(message);
    this.name = 'EngineProcessError';
  }
}

interface Exchange {
  lines: string[];
  done: (line: string) => boolean;
  resolve: (lines: string[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function integerMetric(line: string, name: string): number | null {
  const match = new RegExp(`(?:^|\\s)${name} (\\d+)(?:\\s|$)`, 'u').exec(line);
  return match?.[1] ? Number(match[1]) : null;
}

export function parseUciInfoLine(
  line: string,
  sideToMove: 'WHITE' | 'BLACK',
): EnginePrincipalVariation | null {
  if (!line.startsWith('info ')) return null;
  const scoreMatch = /(?:^|\s)score (cp|mate) (-?\d+)(?:\s|$)/u.exec(line);
  const pvMatch = /(?:^|\s)pv (.+)$/u.exec(line);
  if (!scoreMatch?.[1] || !scoreMatch[2] || !pvMatch?.[1]) return null;
  const moves = pvMatch[1].trim().split(/\s+/u);
  const rootMoveUci = moves[0];
  if (!rootMoveUci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/u.test(rootMoveUci)) return null;
  const rawScore: EngineScore =
    scoreMatch[1] === 'cp'
      ? { kind: 'CENTIPAWN', centipawns: Number(scoreMatch[2]) }
      : { kind: 'MATE', mateIn: Number(scoreMatch[2]) };
  return {
    pvRank: integerMetric(line, 'multipv') ?? 1,
    rootMoveUci,
    moves,
    score: normalizeScoreToWhitePerspective(rawScore, sideToMove),
    depth: integerMetric(line, 'depth'),
    seldepth: integerMetric(line, 'seldepth'),
    nodes: integerMetric(line, 'nodes'),
    nps: integerMetric(line, 'nps'),
    timeMs: integerMetric(line, 'time'),
    hashfull: integerMetric(line, 'hashfull'),
  };
}

export function buildUciPositionCommand(initialFen: string, moves: readonly string[]): string {
  const root =
    initialFen === STANDARD_INITIAL_FEN ? 'position startpos' : `position fen ${initialFen}`;
  return moves.length === 0 ? root : `${root} moves ${moves.join(' ')}`;
}

export function buildUciGoCommand(request: EngineAnalysisRequest): string {
  const searchMoves = request.allowedRootMoves?.length
    ? ` searchmoves ${request.allowedRootMoves.join(' ')}`
    : '';
  const limit = request.configuration.searchLimit;
  const command =
    limit.type === 'DEPTH'
      ? `depth ${limit.value}`
      : limit.type === 'NODES'
        ? `nodes ${limit.value}`
        : `movetime ${limit.value}`;
  return `go ${command}${searchMoves}`;
}

export class StockfishUciEngine implements ChessEngine {
  private process: ChildProcessWithoutNullStreams | null = null;
  private activeExchange: Exchange | null = null;
  private identity: EngineIdentity | null = null;
  private closed = false;

  constructor(
    private readonly executablePath: string,
    private readonly startupTimeoutMs = 10_000,
  ) {}

  private start(): void {
    if (this.process) return;
    if (this.closed) throw new EngineProcessError('The Stockfish adapter is already closed.');
    const child = spawn(this.executablePath, [], { stdio: 'pipe', windowsHide: true });
    this.process = child;
    const output = createInterface({ input: child.stdout });
    output.on('line', (line) => this.receive(line.trim()));
    child.on('error', (error) => this.failExchange(new EngineProcessError(error.message)));
    child.on('exit', (code, signal) => {
      if (!this.closed) {
        this.failExchange(
          new EngineProcessError(
            `Stockfish exited unexpectedly (code ${String(code)}, signal ${String(signal)}).`,
          ),
        );
      }
      this.process = null;
    });
  }

  private receive(line: string): void {
    const exchange = this.activeExchange;
    if (!exchange) return;
    exchange.lines.push(line);
    if (exchange.done(line)) {
      clearTimeout(exchange.timer);
      this.activeExchange = null;
      exchange.resolve(exchange.lines);
    }
  }

  private failExchange(error: Error): void {
    const exchange = this.activeExchange;
    if (!exchange) return;
    clearTimeout(exchange.timer);
    this.activeExchange = null;
    exchange.reject(error);
  }

  private async exchange(
    command: string,
    done: (line: string) => boolean,
    timeoutMs: number,
  ): Promise<string[]> {
    this.start();
    if (!this.process || this.activeExchange) {
      throw new EngineProcessError('Stockfish command sequencing failed.');
    }
    const promise = new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.activeExchange = null;
        reject(
          new EngineProcessError(`Stockfish timed out while executing ${command.split(' ')[0]}.`),
        );
        this.process?.kill();
      }, timeoutMs);
      this.activeExchange = { lines: [], done, resolve, reject, timer };
    });
    this.process.stdin.write(`${command}\n`);
    return promise;
  }

  private write(command: string): void {
    this.start();
    this.process!.stdin.write(`${command}\n`);
  }

  async identify(): Promise<EngineIdentity> {
    if (this.identity) return this.identity;
    const [lines, binarySha256] = await Promise.all([
      this.exchange('uci', (line) => line === 'uciok', this.startupTimeoutMs),
      sha256File(this.executablePath).catch((error: unknown) => {
        throw new EngineProcessError(
          `The configured Stockfish executable could not be hashed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }),
    ]);
    const reportedName = lines
      .find((line) => line.startsWith('id name '))
      ?.slice(8)
      .trim();
    if (!reportedName) throw new EngineProcessError('Stockfish did not report an engine name.');
    const versionMatch = /^Stockfish\s+(.+)$/iu.exec(reportedName);
    this.identity = {
      family: 'STOCKFISH',
      reportedName,
      reportedVersion: versionMatch?.[1] ?? null,
      binarySha256,
    };
    return this.identity;
  }

  async newGame(configuration: EngineSearchConfiguration): Promise<void> {
    await this.identify();
    this.write(`setoption name Threads value ${configuration.threads}`);
    this.write(`setoption name Hash value ${configuration.hashMb}`);
    this.write(`setoption name MultiPV value ${configuration.multiPv}`);
    await this.exchange('isready', (line) => line === 'readyok', this.startupTimeoutMs);
    this.write('ucinewgame');
    await this.exchange('isready', (line) => line === 'readyok', this.startupTimeoutMs);
  }

  async analyze(request: EngineAnalysisRequest): Promise<EngineAnalysisResult> {
    await this.identify();
    const multiPv = request.allowedRootMoves?.length ? 1 : request.configuration.multiPv;
    this.write(`setoption name MultiPV value ${multiPv}`);
    await this.exchange('isready', (line) => line === 'readyok', this.startupTimeoutMs);
    this.write(buildUciPositionCommand(request.position.initialFen, request.position.moves));
    const lines = await this.exchange(
      buildUciGoCommand(request),
      (line) => line.startsWith('bestmove '),
      request.configuration.analysisTimeoutMs,
    );
    const bestMove = [...lines]
      .reverse()
      .find((line) => line.startsWith('bestmove '))
      ?.split(/\s+/u)[1];
    if (!bestMove || bestMove === '(none)') {
      throw new EngineProcessError('Stockfish returned no legal best move.');
    }
    const latestByRank = new Map<number, EnginePrincipalVariation>();
    for (const line of lines) {
      const parsed = parseUciInfoLine(line, request.position.sideToMove);
      if (!parsed) continue;
      const existing = latestByRank.get(parsed.pvRank);
      if (!existing || (parsed.depth ?? -1) >= (existing.depth ?? -1)) {
        latestByRank.set(parsed.pvRank, parsed);
      }
    }
    const principalVariations = [...latestByRank.values()].sort(
      (left, right) => left.pvRank - right.pvRank,
    );
    if (!principalVariations[0] || principalVariations[0].pvRank !== 1) {
      throw new EngineProcessError(
        'Stockfish returned bestmove without a parseable rank-1 evaluation.',
      );
    }
    return { bestMoveUci: bestMove, lines: principalVariations };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const child = this.process;
    this.process = null;
    if (!child) return;
    child.stdin.write('quit\n');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, 1_000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
