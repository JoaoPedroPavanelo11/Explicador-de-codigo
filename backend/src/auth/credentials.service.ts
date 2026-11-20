import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import {
  UsersRepository,
  type PublicUser,
} from '../users/users.repository.js';
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

  /**
   * Retorna o usuário, ou null se e-mail OU senha estiverem errados.
   *
   * Segurança: mesmo quando o e-mail não existe, verify() compara a senha com
   * um hash "falso". Assim o tempo de resposta é o mesmo nos dois casos e
   * ninguém consegue descobrir quais e-mails estão cadastrados (timing attack).
   */
  async verify(email: string, password: string): Promise<PublicUser | null> {
    const found = await this.users.findCredentials(email);
    const valid = await this.passwordHasher.verify(
      password,
      found?.passwordHash,
    );
    if (!valid || !found) return null;

    // Se o custo do hash aumentou desde o cadastro, atualiza o hash agora.
    if (this.passwordHasher.needsRehash(found.passwordHash)) {
      await this.users.updatePasswordHash(
        found.user.id,
        await this.passwordHasher.hash(password),
      );
    }
    return found.user;
  }
}
