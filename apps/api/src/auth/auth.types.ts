import type { Role, User } from '../generated/prisma/client.js';

/** Claims in an access token. `tv` must match the user's tokenVersion. */
export interface AccessTokenPayload {
  sub: string;
  role: Role;
  tv: number;
}

/** What a guarded handler sees as the signed-in user. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  emailVerified: boolean;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  createdAt: Date;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  /** Seconds until the access token expires */
  expiresIn: number;
  refreshToken: string;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt,
  };
}
