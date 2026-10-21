import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';

/** Supabase Storage via REST with the service role (signed URLs for private buckets). */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  private get headers() {
    const key = this.env.SUPABASE_SERVICE_ROLE_KEY!;
    return { apikey: key, Authorization: `Bearer ${key}` };
  }

  get configured() {
    return Boolean(this.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  async exists(bucket: string, path: string): Promise<boolean> {
    if (!this.configured) return true; // dev without storage: trust the client
    const res = await fetch(
      `${this.env.SUPABASE_URL}/storage/v1/object/info/${bucket}/${encodePath(path)}`,
      { headers: this.headers },
    ).catch(() => null);
    return Boolean(res?.ok);
  }

  async signedUrl(bucket: string, path: string, expiresInSeconds = 3600): Promise<string | null> {
    if (!this.configured) return null;
    try {
      const res = await fetch(
        `${this.env.SUPABASE_URL}/storage/v1/object/sign/${bucket}/${encodePath(path)}`,
        {
          method: 'POST',
          headers: { ...this.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiresIn: expiresInSeconds }),
        },
      );
      if (!res.ok) return null;
      const { signedURL } = (await res.json()) as { signedURL: string };
      return `${this.env.SUPABASE_URL}/storage/v1${signedURL}`;
    } catch (err) {
      this.logger.warn(`signing ${bucket}/${path} failed: ${(err as Error).message}`);
      return null;
    }
  }
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
