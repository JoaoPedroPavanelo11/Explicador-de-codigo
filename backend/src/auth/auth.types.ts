import type { PublicUser } from '../users/users.repository.js';

// tipa @CurrentUser() e AuthenticationContext
declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: PublicUser;
  }
}
