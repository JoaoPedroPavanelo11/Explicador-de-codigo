import { Injectable } from '@nestjs/common';
import {
  AuthenticationStorage,
  type RefreshTokenRecord,
  type RefreshTokenStore,
} from '@nestjs/authentication';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

// store de refresh tokens no postgres. Token já usado que aparece de novo
// revoga a família toda (o TokenService cuida disso, aqui só persistimos).
@Injectable()
export class PrismaRefreshTokenStore implements RefreshTokenStore {
  constructor(
    private readonly prisma: PrismaService,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({ refreshTokens: this });
  }

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const row = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (!row) return undefined;
    return {
      id: row.id,
      familyId: row.familyId,
      userId: row.userId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      familyExpiresAt: row.familyExpiresAt,
      // o contrato quer undefined, não null
      ...(row.usedAt ? { usedAt: row.usedAt } : {}),
      ...(row.claims ? { claims: row.claims as Record<string, unknown> } : {}),
    };
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    await this.prisma.$transaction([
      // aproveita para limpar famílias vencidas
      this.prisma.refreshToken.deleteMany({
        where: { familyExpiresAt: { lt: record.createdAt } },
      }),
      this.prisma.refreshToken.create({
        data: {
          id: record.id,
          familyId: record.familyId,
          userId: record.userId,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          familyExpiresAt: record.familyExpiresAt,
          usedAt: record.usedAt ?? null,
          claims: (record.claims ?? undefined) as
            Prisma.InputJsonValue | undefined,
        },
      }),
    ]);
  }

  async markRefreshTokenUsed(id: string, at: Date): Promise<boolean> {
    // precisa ser um único UPDATE condicional; ler e depois escrever deixa
    // duas requisições simultâneas usarem o mesmo token
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: at },
    });
    return count === 1;
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.prisma.revokedTokenFamily.upsert({
      where: { familyId },
      create: { familyId },
      update: {},
    });
  }

  async isRefreshTokenFamilyRevoked(familyId: string): Promise<boolean> {
    const row = await this.prisma.revokedTokenFamily.findUnique({
      where: { familyId },
    });
    return row !== null;
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    const families = await this.prisma.refreshToken.findMany({
      where: { userId },
      select: { familyId: true },
      distinct: ['familyId'],
    });
    if (families.length === 0) return;
    await this.prisma.revokedTokenFamily.createMany({
      data: families.map((f) => ({ familyId: f.familyId })),
      skipDuplicates: true,
    });
  }
}
