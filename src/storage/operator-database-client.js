import { Client as PgClient } from 'pg';
import { postgresOperatorPoolOptions } from '../config/runtime.js';

/** A one-shot operator command needs one verified database session, not a pool. */
export function operatorDatabaseClientOptions({databaseUrl,production=false}) {
  return postgresOperatorPoolOptions({databaseUrl,production});
}

export function createOperatorDatabaseClient(config,{Client=PgClient}={}) {
  return new Client(operatorDatabaseClientOptions(config));
}
