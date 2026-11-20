import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  JwtBearerProvider,
  type JwtClaims,
} from '@nestjs/authentication';
import {
  UsersRepository,
  type PublicUser,
} from '../users/users.repository.js';

/**
 * Lê o header "Authorization: Bearer <token>", valida assinatura e expiração
 * do JWT e carrega o usuário do banco a cada requisição — assim um usuário
 * excluído perde o acesso na hora, sem esperar o token expirar.
 */
@Injectable()
export class JwtAuthProvider extends JwtBearerProvider<PublicUser> {
  constructor(
    private readonly users: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerProvider(this);
  }

  protected validate({ sub }: JwtClaims) {
    return sub ? this.users.findById(sub) : null;
  }
}
