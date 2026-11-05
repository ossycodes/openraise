import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';

function contextFor(user: { role: string } | undefined, roles?: string[]) {
  const handler = () => undefined;
  if (roles) Reflect.defineMetadata('roles', roles, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows handlers without @Roles', () => {
    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });

  it('allows a matching role', () => {
    expect(guard.canActivate(contextFor({ role: 'ADMIN' }, ['ADMIN']))).toBe(true);
  });

  it('forbids other roles and anonymous requests', () => {
    expect(() => guard.canActivate(contextFor({ role: 'USER' }, ['ADMIN']))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(contextFor(undefined, ['ADMIN']))).toThrow(
      ForbiddenException,
    );
  });
});
