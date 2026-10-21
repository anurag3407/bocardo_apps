import { Kysely, Transaction } from 'kysely';
import type { Database } from './db.types';

export const DB = Symbol('DB');

/** A connection or an open transaction — repositories accept either. */
export type Db = Kysely<Database>;
export type Tx = Transaction<Database>;
export type Executor = Db | Tx;

/** jsonb values are written as strings so arrays stay JSON arrays. */
export const json = (value: unknown): string => JSON.stringify(value);
