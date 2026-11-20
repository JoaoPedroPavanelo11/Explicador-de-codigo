import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isReadableFile } from '../analyzer/engine/languages.js';
import {
  normalizeFiles,
  type IngestLimits,
  type NormalizeResult,
} from '../analyzer/engine/normalize.js';
import type { Env } from '../config/env.js';
import { downloadGithubZip, type GithubRepoRef } from './github-fetcher.js';
import { extractZip, stripCommonRoot } from './zip-extractor.js';

const MB = 1024 * 1024;

/** Transforma qualquer origem (colado, .zip, GitHub) numa lista de arquivos analisáveis. */
@Injectable()
export class IngestionService {
  private readonly limits: IngestLimits;
  private readonly uploadMaxBytes: number;

  constructor(config: ConfigService<Env, true>) {
    this.limits = {
      maxFiles: config.get('ANALYSIS_MAX_FILES', { infer: true }),
      maxFileBytes: 512 * 1024,
      maxTotalBytes: config.get('ANALYSIS_MAX_TOTAL_MB', { infer: true }) * MB,
    };
    this.uploadMaxBytes = config.get('UPLOAD_MAX_MB', { infer: true }) * MB;
  }

  fromPaste(files: { path: string; content: string }[]): NormalizeResult {
    return normalizeFiles(files, this.limits);
  }

  async fromZip(buffer: Buffer): Promise<NormalizeResult> {
    const { files, skipped } = await extractZip(
      buffer,
      {
        maxEntries: this.limits.maxFiles * 4,
        maxTotalBytes: this.limits.maxTotalBytes,
        maxFileBytes: this.limits.maxFileBytes,
      },
      isReadableFile,
    );
    const result = normalizeFiles(stripCommonRoot(files), this.limits);
    return { files: result.files, skipped: result.skipped + skipped };
  }

  async fromGithub(ref: GithubRepoRef): Promise<NormalizeResult> {
    const zip = await downloadGithubZip(ref, {
      maxBytes: this.uploadMaxBytes * 3,
      timeoutMs: 30_000,
    });
    return this.fromZip(zip);
  }
}
