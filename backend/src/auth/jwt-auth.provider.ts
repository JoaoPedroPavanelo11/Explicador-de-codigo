import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  JwtBearerProvider,
  type JwtClaims,
} from '@nestjs/authentication';
import { UsersRepository, type PublicUser } from '../users/users.repository.js';

// busca o usuário a cada request para que um usuário excluído perca o acesso na hora
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
