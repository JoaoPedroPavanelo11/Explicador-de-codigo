import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** O usuário como o resto da aplicação o enxerga: SEM o hash da senha. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

const publicFields = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/**
 * Único lugar que toca na tabela users. O hash da senha nunca sai daqui,
 * exceto em findCredentials(), usado apenas na verificação do login.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    email: string;
    name: string;
    passwordHash: string;
  }): Promise<PublicUser> {
    try {
      return await this.prisma.user.create({ data, select: publicFields });
    } catch (error) {
      // Insere direto e trata a violação de unicidade (P2002).
      // Consultar antes e depois inserir abre espaço para condição de corrida.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Este e-mail já está cadastrado');
      }
      throw error;
    }
  }

  findById(id: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({ where: { id }, select: publicFields });
  }

  async findCredentials(
    email: string,
  ): Promise<{ user: PublicUser; passwordHash: string } | null> {
    const row = await this.prisma.user.findUnique({
      where: { email },
      select: { ...publicFields, passwordHash: true },
    });
    if (!row) return null;
    const { passwordHash, ...user } = row;
    return { user, passwordHash };
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }
}
