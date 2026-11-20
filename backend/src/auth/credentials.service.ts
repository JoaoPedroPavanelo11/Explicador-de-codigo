import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { UsersRepository, type PublicUser } from '../users/users.repository.js';
import type { RegisterInput } from './auth.schemas.js';

@Injectable()
export class CredentialsService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async register(input: RegisterInput): Promise<PublicUser> {
    const passwordHash = await this.passwordHasher.hash(input.password);
    return this.users.create({
      name: input.name,
      email: input.email,
      passwordHash,
    });
  }

  // verify() roda mesmo sem usuário (compara com hash dummy), então o tempo de
  // resposta não entrega quais e-mails existem. Não retornar antes disso.
  async verify(email: string, password: string): Promise<PublicUser | null> {
    const found = await this.users.findCredentials(email);
    const valid = await this.passwordHasher.verify(
      password,
      found?.passwordHash,
    );
    if (!valid || !found) return null;

    // custo do hash subiu desde o cadastro
    if (this.passwordHasher.needsRehash(found.passwordHash)) {
      await this.users.updatePasswordHash(
        found.user.id,
        await this.passwordHasher.hash(password),
      );
    }
    return found.user;
  }
}
