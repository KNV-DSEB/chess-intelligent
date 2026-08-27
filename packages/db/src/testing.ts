import { PGlite } from '@electric-sql/pglite';

import type { Database, DatabaseResult, QueryClient } from './database';

interface PGliteQueryResult {
  rows: unknown[];
  affectedRows?: number;
}

interface PGliteClientLike {
  query(sql: string, parameters?: unknown[]): Promise<PGliteQueryResult>;
  exec(sql: string): Promise<unknown>;
}

class PGliteQueryClient implements QueryClient {
  constructor(private readonly client: PGliteClientLike) {}

  async query<Row>(sql: string, parameters: readonly unknown[] = []): Promise<DatabaseResult<Row>> {
    const result = await this.client.query(sql, [...parameters]);
    return {
      rows: result.rows as Row[],
      rowCount: result.affectedRows ?? result.rows.length,
    };
  }

  async execute(sql: string): Promise<void> {
    await this.client.exec(sql);
  }
}

export class PGliteDatabase implements Database {
  private constructor(private readonly pglite: PGlite) {}

  static async create(): Promise<PGliteDatabase> {
    return new PGliteDatabase(await PGlite.create());
  }

  async query<Row>(sql: string, parameters: readonly unknown[] = []): Promise<DatabaseResult<Row>> {
    return new PGliteQueryClient(this.pglite).query<Row>(sql, parameters);
  }

  async execute(sql: string): Promise<void> {
    return new PGliteQueryClient(this.pglite).execute(sql);
  }

  async transaction<Result>(work: (client: QueryClient) => Promise<Result>): Promise<Result> {
    return this.pglite.transaction(async (transaction) => work(new PGliteQueryClient(transaction)));
  }

  async close(): Promise<void> {
    await this.pglite.close();
  }
}
