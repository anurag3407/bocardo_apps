import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '../auth/auth-user';

export type AppRequest = FastifyRequest & { user?: AuthUser; rawBody?: Buffer };
