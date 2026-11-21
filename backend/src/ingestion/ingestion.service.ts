import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_LIMITS,
  normalizeFiles,
  type IngestLimits,
  type NormalizeResult,
} from '../analyzer/engine/normalize.js';
import type { Env } from '../config/env.js';
import { downloadGithubZip, type GithubRepoRef } from './github-fetcher.js';
import { extractZip } from './zip-extractor.js';

const MB = 1024 * 1024;

// Teto de entradas no índice do zip, contando tudo (imagens, node_modules...).
// Ler o índice é barato; isto só barra zips feitos para travar o servidor.
const ZIP_MAX_ENTRIES = 100_000;

@Injectable()
export class IngestionService {
  private readonly limits: IngestLimits;
  private readonly githubMaxBytes: number;

  constructor(config: ConfigService<Env, true>) {
    this.limits = {
      maxFiles: config.get('ANALYSIS_MAX_FILES', { infer: true }),
      maxFileBytes: DEFAULT_LIMITS.maxFileBytes,
      maxTotalBytes: config.get('ANALYSIS_MAX_TOTAL_MB', { infer: true }) * MB,
    };
    this.githubMaxBytes = config.get('GITHUB_MAX_MB', { infer: true }) * MB;
  }

  fromPaste(files: { path: string; content: string }[]): NormalizeResult {
    return normalizeFiles(files, this.limits);
  }

  async fromZip(buffer: Buffer): Promise<NormalizeResult> {
    const { files, triage, skipped } = await extractZip(buffer, {
      ...this.limits,
      maxEntries: ZIP_MAX_ENTRIES,
    });
    // a triagem já respeitou os limites; aqui só sai binário disfarçado
    const result = normalizeFiles(files, this.limits);
    return {
      files: result.files,
      skipped: result.skipped + skipped,
      coverage: {
        inventory: triage.inventory,
        oversized: triage.oversized,
        leftOut: triage.leftOut,
      },
    };
  }

  async fromGithub(ref: GithubRepoRef): Promise<NormalizeResult> {
    const zip = await downloadGithubZip(ref, {
      maxBytes: this.githubMaxBytes,
      timeoutMs: 30_000,
    });
    return this.fromZip(zip);
  }
}
