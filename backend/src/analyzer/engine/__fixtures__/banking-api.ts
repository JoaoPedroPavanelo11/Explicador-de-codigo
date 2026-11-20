import type { SourceFile } from '../types.js';

/** Uma API bancária fictícia (NestJS + Prisma) usada nos testes do motor. */
export const bankingApi: SourceFile[] = [
  {
    path: 'package.json',
    content: JSON.stringify({
      name: 'banco-digital-api',
      description:
        'API de um banco digital com contas, transferências e extrato.',
      engines: { node: '>=20.0.0' },
      dependencies: {
        '@nestjs/core': '^11.0.1',
        '@nestjs/jwt': '^11.0.0',
        '@prisma/client': '^6.2.0',
        bcrypt: '^5.1.1',
        'class-validator': '^0.14.1',
      },
      devDependencies: {
        typescript: '^5.7.3',
        jest: '^29.7.0',
        prisma: '^6.2.0',
      },
    }),
  },
  {
    path: 'README.md',
    content:
      '# Banco Digital API\n\nAPI REST de um banco digital que permite abrir contas, consultar saldo e fazer transferências entre contas com segurança.\n\n## Como rodar\n\n```bash\nnpm install\nnpm run start\n```\n',
  },
  {
    path: 'prisma/schema.prisma',
    content:
      'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n\nmodel Account {\n  id String @id\n  balance Decimal\n}\n',
  },
  {
    path: 'src/accounts/accounts.module.ts',
    content:
      "import { Module } from '@nestjs/common';\n@Module({})\nexport class AccountsModule {}\n",
  },
  {
    path: 'src/transfers/transfers.module.ts',
    content:
      "import { Module } from '@nestjs/common';\n@Module({})\nexport class TransfersModule {}\n",
  },
  {
    path: 'src/accounts/accounts.controller.ts',
    content: `import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { AccountsService } from './accounts.service';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  create(@Body() body: { ownerName: string }) {
    return this.accounts.create(body.ownerName);
  }

  @Get(':id/balance')
  balance(@Param('id') id: string) {
    return this.accounts.getBalance(id);
  }
}
`,
  },
  {
    path: 'src/accounts/accounts.service.ts',
    content: `import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerName: string) {
    return this.prisma.account.create({ data: { ownerName, balance: 0 } });
  }

  async getBalance(id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Conta não encontrada');
    return { balance: account.balance };
  }
}
`,
  },
  {
    path: 'src/transfers/transfers.controller.ts',
    content: `import { Controller, Post, Get, Body } from '@nestjs/common';
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}
  @Post()
  transfer(@Body() dto: CreateTransferDto) {
    return this.transfers.transfer(dto.fromId, dto.toId, dto.amount);
  }
  @Get()
  list() {
    return this.transfers.list();
  }
}
`,
  },
  {
    path: 'src/transfers/transfers.service.ts',
    content: `import { BadRequestException, Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Transfere dinheiro entre duas contas de forma atômica. */
  async transfer(fromId: string, toId: string, amount: number) {
    if (amount <= 0) throw new BadRequestException('Valor inválido');
    if (fromId === toId) throw new BadRequestException('Contas iguais');

    return this.prisma.$transaction(async (tx) => {
      const from = await tx.account.findUnique({ where: { id: fromId } });
      if (!from || new Decimal(from.balance).lessThan(amount)) {
        throw new BadRequestException('Saldo insuficiente');
      }
      await tx.account.update({ where: { id: fromId }, data: { balance: { decrement: amount } } });
      await tx.account.update({ where: { id: toId }, data: { balance: { increment: amount } } });
      return tx.transaction.create({ data: { fromId, toId, amount } });
    });
  }

  async list() {
    return this.prisma.transaction.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
`,
  },
  {
    path: 'src/transfers/transfers.service.spec.ts',
    content:
      "describe('TransfersService', () => { it('recusa valor negativo', () => { expect(true).toBe(true); }); });\n",
  },
  {
    path: 'src/config.ts',
    content:
      "export const config = {\n  jwtSecret: 'meuSegredoSuperForte2024',\n  port: process.env.PORT ?? 3000,\n};\n",
  },
];
