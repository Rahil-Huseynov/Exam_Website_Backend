import { Injectable, Inject, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { TranslationServiceClient } from '@google-cloud/translate';
import * as crypto from 'crypto';

@Injectable()
export class TranslationService implements OnModuleInit {
  private client: TranslationServiceClient;
  private projectLocation?: string;
  private defaultMime = 'text/plain';
  private defaultTtlSeconds: number;

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
    this.client = new TranslationServiceClient();
    this.defaultTtlSeconds = Number(process.env.REDIS_TTL || 3600);
  }

  async onModuleInit() {
    await this.ensureProjectLocation();
  }

  private async ensureProjectLocation() {
    if (this.projectLocation) return;
    const projectIdFromEnv = process.env.GCLOUD_PROJECT_ID;
    if (projectIdFromEnv) {
      this.projectLocation = `projects/${projectIdFromEnv}/locations/global`;
      return;
    }
    try {
      const detected = await this.client.getProjectId();
      if (detected) {
        this.projectLocation = `projects/${detected}/locations/global`;
        return;
      }
    } catch (err) {
      console.warn('[TranslationService] getProjectId() failed', err);
    }
    throw new Error('GCLOUD_PROJECT_ID required (set env GCLOUD_PROJECT_ID or provide credentials with project_id).');
  }

  private makeCacheKey(texts: string[], target: string, mimeType?: string) {
    const hash = crypto.createHash('sha256').update(JSON.stringify({ texts, target, mimeType })).digest('hex');
    return `translate:${target}:${mimeType ?? this.defaultMime}:${hash}`;
  }

  async translate(texts: string[], target: string, mimeType?: string): Promise<{ translations: string[]; detectedLanguageCodes: (string | null)[] }> {
    if (!Array.isArray(texts) || texts.length === 0) return { translations: [], detectedLanguageCodes: [] };

    if (!this.projectLocation) {
      await this.ensureProjectLocation();
    }

    const mt = mimeType ?? this.defaultMime;
    const key = this.makeCacheKey(texts, target, mt);

    const cached = await this.cacheManager.get<{ translations: string[]; detectedLanguageCodes: (string | null)[] }>(key);
    if (cached) return cached;

    const request = {
      parent: this.projectLocation!,
      contents: texts,
      mimeType: mt,
      targetLanguageCode: target,
    };

    try {
      const [response] = await this.client.translateText(request);
      const translations = (response.translations || []).map((t) => t.translatedText ?? '');
      const detectedLanguageCodes = (response.translations || []).map((t) => (t.detectedLanguageCode ?? null));

      const ttlToPass = this.defaultTtlSeconds;
      await this.cacheManager.set(key, { translations, detectedLanguageCodes }, ttlToPass);

      return { translations, detectedLanguageCodes };
    } catch (err) {
      console.error('TranslationService.translate error', err);
      throw new InternalServerErrorException('Translation failed');
    }
  }
}
