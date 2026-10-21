import { Controller, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Receiver } from '@upstash/qstash';
import { Public } from '../../common/auth/decorators';
import { AppError } from '../../common/errors/app-error';
import type { AppRequest } from '../../common/http/request-context';
import { ENV, type Env } from '../../config/env';
import { JobRegistry } from './jobs';

/** QStash delivery endpoint. Authenticated by QStash's signature, not by user JWT. */
@ApiExcludeController()
@Controller('internal/jobs')
export class JobsController {
  private readonly receiver?: Receiver;

  constructor(
    private readonly registry: JobRegistry,
    @Inject(ENV) env: Env,
  ) {
    if (env.QSTASH_CURRENT_SIGNING_KEY && env.QSTASH_NEXT_SIGNING_KEY) {
      this.receiver = new Receiver({
        currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
      });
    }
  }

  @Public()
  @Post(':name')
  @HttpCode(204)
  async run(@Param('name') name: string, @Req() request: AppRequest) {
    if (!this.receiver) throw AppError.forbidden('QStash is not configured');
    const signature = request.headers['upstash-signature'];
    const body = request.rawBody?.toString('utf8') ?? '';
    const valid = await this.receiver
      .verify({ signature: String(signature ?? ''), body })
      .catch(() => false);
    if (!valid) throw AppError.unauthorized('Invalid job signature');
    await this.registry.run(name, JSON.parse(body || '{}'));
  }
}
