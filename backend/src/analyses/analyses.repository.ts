import { Injectable } from '@nestjs/common';
import {
  AnalysisStatus,
  Prisma,
  type SourceType,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const summaryFields = {
  id: true,
  title: true,
  sourceType: true,
  sourceRef: true,
  status: true,
  score: true,
  aiEnhanced: true,
  fileCount: true,
  lineCount: true,
  createdAt: true,
  finishedAt: true,
} satisfies Prisma.AnalysisSelect;

// toda query filtra por userId: análise de outra pessoa vira 404, sem checagem extra
@Injectable()
export class AnalysesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId: string;
    title: string;
    sourceType: SourceType;
    sourceRef?: string;
    useAi: boolean;
  }) {
    return this.prisma.analysis.create({
      data,
      select: { id: true, status: true },
    });
  }

  countPending(userId: string) {
    return this.prisma.analysis.count({
      where: {
        userId,
        status: { in: [AnalysisStatus.QUEUED, AnalysisStatus.PROCESSING] },
      },
    });
  }

  async list(userId: string, limit: number, cursor?: string) {
    const rows = await this.prisma.analysis.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: summaryFields,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  findOwned(userId: string, id: string) {
    return this.prisma.analysis.findFirst({
      where: { id, userId },
      select: {
        ...summaryFields,
        result: true,
        errorMessage: true,
        useAi: true,
      },
    });
  }

  findReport(userId: string, id: string) {
    return this.prisma.analysis.findFirst({
      where: { id, userId },
      select: { title: true, reportMd: true, status: true },
    });
  }

  async deleteOwned(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.analysis.deleteMany({
      where: { id, userId },
    });
    return count === 1;
  }

  findForProcessing(id: string) {
    return this.prisma.analysis.findUnique({
      where: { id },
      select: { id: true, title: true, useAi: true, status: true },
    });
  }

  markProcessing(id: string) {
    return this.prisma.analysis.update({
      where: { id },
      data: { status: AnalysisStatus.PROCESSING },
    });
  }

  markDone(
    id: string,
    data: {
      score: number;
      fileCount: number;
      lineCount: number;
      aiEnhanced: boolean;
      result: Prisma.InputJsonValue;
      reportMd: string;
    },
  ) {
    return this.prisma.analysis.update({
      where: { id },
      data: {
        ...data,
        status: AnalysisStatus.DONE,
        finishedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  markFailed(id: string, errorMessage: string) {
    return this.prisma.analysis.updateMany({
      where: { id },
      data: {
        status: AnalysisStatus.FAILED,
        errorMessage: errorMessage.slice(0, 500),
        finishedAt: new Date(),
      },
    });
  }
}
