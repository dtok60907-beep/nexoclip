// Narrow declaration for the PostgreSQL pool APIs used by Canvas and realtime.
declare module 'pg' {
  export interface QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
    rows: Row[]
    rowCount: number | null
  }
  export interface PoolClient {
    query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<QueryResult<Row>>
    release(): void
  }
  export class Pool {
    constructor(options?: { connectionString?: string; options?: string; connectionTimeoutMillis?: number; query_timeout?: number })
    query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<QueryResult<Row>>
    connect(): Promise<PoolClient>
    on(event: 'error', listener: (error: Error) => void): this
    end(): Promise<void>
  }
}
