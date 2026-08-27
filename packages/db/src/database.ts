import { Pool } from 'pg';

export interface DatabaseResult<Row> {
  rows: Row[];
  rowCount: number;
}

export interface QueryClient {
  query<Row>(sql: string, parameters?: readonly unknown[]): Promise<DatabaseResult<Row>>;
  execute(sql: string): Promise<void>;
}

export interface Database extends QueryClient {
  transaction<Result>(work: (client: QueryClient) => Promise<Result>): Promise<Result>;
  close(): Promise<void>;
}

class PgQueryClient implements QueryClient {
  constructor(private readonly client: Pick<Pool, 'query'>) {}

  async query<Row>(sql: string, parameters: readonly unknown[] = []): Promise<DatabaseResult<Row>> {
    const result = await this.client.query(sql, [...parameters]);
    return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 };
  }

  async execute(sql: string): Promise<void> {
    await this.client.query(sql);
  }
}

export class PgDatabase implements Database {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async query<Row>(sql: string, parameters: readonly unknown[] = []): Promise<DatabaseResult<Row>> {
    return new PgQueryClient(this.pool).query<Row>(sql, parameters);
  }

  async execute(sql: string): Promise<void> {
    return new PgQueryClient(this.pool).execute(sql);
  }

  async transaction<Result>(work: (client: QueryClient) => Promise<Result>): Promise<Result> {
    const connection = await this.pool.connect();
    const client = new PgQueryClient(connection);
    try {
      await client.execute('BEGIN');
      const result = await work(client);
      await client.execute('COMMIT');
      return result;
    } catch (error) {
      await client.execute('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
