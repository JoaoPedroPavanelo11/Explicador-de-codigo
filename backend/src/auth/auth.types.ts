import type { PublicUser } from '../users/users.repository.js';

// Diz ao @nestjs/authentication qual é o formato do usuário autenticado.
// A partir daqui, @CurrentUser() e AuthenticationContext ficam tipados.
declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: PublicUser;
  }
}
