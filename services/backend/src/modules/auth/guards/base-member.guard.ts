import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, UnauthorizedException } from '@libs/exceptions';

/**
 * Abstract base class for membership-based guards. Extracts the common pattern of:
 * 1. Verifying the user is authenticated
 * 2. Extracting an entity ID from route params
 * 3. Looking up membership for the user
 * 4. Checking role-based metadata
 * 5. Attaching membership to the request
 *
 * Subclasses implement the entity-specific details (param name, query, metadata key).
 */
export abstract class BaseMemberGuard implements CanActivate {
  constructor(protected readonly reflector: Reflector) {}

  /** Route param names to check (in order). First match wins. */
  protected abstract readonly paramNames: string[];

  /** Metadata key for the roles decorator (e.g., ORG_ROLES_KEY). */
  protected abstract readonly rolesMetadataKey: string;

  /** Entity name for error messages (e.g., "organization", "project"). */
  protected abstract readonly entityName: string;

  /** Request property to attach the membership to. */
  protected abstract readonly requestProperty: string;

  /** Look up the membership for the given user and entity. Return null if not found. */
  protected abstract findMembership(
    userId: string,
    entityId: string
  ): Promise<{ role: string } | null>;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.auth?.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const entityId = this.extractEntityId(request.params);
    if (!entityId) {
      throw new ForbiddenException(
        `${this.capitalize(this.entityName)} ID is required`
      );
    }

    const membership = await this.findMembership(user.id, entityId);
    if (!membership) {
      throw new ForbiddenException(
        `You are not a member of this ${this.entityName}`
      );
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      this.rolesMetadataKey,
      [context.getHandler(), context.getClass()]
    );

    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(membership.role)) {
        throw new ForbiddenException(
          `Insufficient ${this.entityName} permissions`
        );
      }
    }

    request[this.requestProperty] = membership;
    return true;
  }

  private extractEntityId(params: Record<string, string>): string | undefined {
    for (const name of this.paramNames) {
      if (params[name]) return params[name];
    }
    return undefined;
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
