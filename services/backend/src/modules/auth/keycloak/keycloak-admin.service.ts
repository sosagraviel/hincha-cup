import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import KcAdminClient from '@keycloak/keycloak-admin-client';
import { AllConfigType } from '@src/config/config.type';

/**
 * Admin client for the Keycloak realm. Manages user CRUD, realm role assignments,
 * and password resets via the Keycloak Admin REST API. Authenticates on module init
 * and auto-refreshes the admin token before expiry.
 *
 * @example
 * const { id } = await keycloakAdminService.createUser({
 *   email: 'alice@acme.com',
 *   firstName: 'Alice',
 *   password: 'secret123',
 * });
 * await keycloakAdminService.assignRealmRole(id, 'member');
 */
@Injectable()
export class KeycloakAdminService implements OnModuleInit {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private kcAdminClient: KcAdminClient;
  private tokenExpiresAt = 0;

  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly adminUsername: string;
  private readonly adminPassword: string;

  constructor(
    private readonly configService: ConfigService<AllConfigType, true>
  ) {
    this.baseUrl = this.configService.get('keycloak.KEYCLOAK_INTERNAL_URL', {
      infer: true
    });
    this.realm = this.configService.get('keycloak.KEYCLOAK_REALM', {
      infer: true
    });
    this.adminUsername = this.configService.get(
      'keycloak.KEYCLOAK_ADMIN_USERNAME',
      { infer: true }
    );
    this.adminPassword = this.configService.get(
      'keycloak.KEYCLOAK_ADMIN_PASSWORD',
      { infer: true }
    );

    this.kcAdminClient = new KcAdminClient({
      baseUrl: this.baseUrl,
      realmName: 'master'
    });
  }

  async onModuleInit(): Promise<void> {
    await this.authenticate();
  }

  private async authenticate(): Promise<void> {
    try {
      await this.kcAdminClient.auth({
        username: this.adminUsername,
        password: this.adminPassword,
        grantType: 'password',
        clientId: 'admin-cli'
      });
      this.tokenExpiresAt = Date.now() + 55 * 1000;
      this.logger.log('Keycloak admin client authenticated successfully');
    } catch (error) {
      this.logger.error('Failed to authenticate Keycloak admin client', error);
      throw error;
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (Date.now() >= this.tokenExpiresAt) {
      await this.authenticate();
    }
  }

  async createUser(params: {
    email: string;
    firstName?: string;
    lastName?: string;
    enabled?: boolean;
    password?: string;
  }): Promise<{ id: string }> {
    await this.ensureAuthenticated();

    const { id } = await this.kcAdminClient.users.create({
      realm: this.realm,
      email: params.email,
      username: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      enabled: params.enabled ?? true,
      emailVerified: true,
      credentials: params.password
        ? [{ type: 'password', value: params.password, temporary: false }]
        : undefined
    });

    return { id };
  }

  async deleteUser(userId: string): Promise<void> {
    await this.ensureAuthenticated();
    await this.kcAdminClient.users.del({
      id: userId,
      realm: this.realm
    });
  }

  async findUserByEmail(email: string): Promise<{ id: string } | null> {
    await this.ensureAuthenticated();

    const users = await this.kcAdminClient.users.find({
      realm: this.realm,
      email,
      exact: true
    });

    if (users.length === 0) {
      return null;
    }

    return { id: users[0].id! };
  }

  async assignRealmRole(userId: string, roleName: string): Promise<void> {
    await this.ensureAuthenticated();

    const role = await this.kcAdminClient.roles.findOneByName({
      realm: this.realm,
      name: roleName
    });

    if (!role) {
      throw new Error(`Realm role "${roleName}" not found`);
    }

    await this.kcAdminClient.users.addRealmRoleMappings({
      id: userId,
      realm: this.realm,
      roles: [{ id: role.id!, name: role.name! }]
    });
  }

  async removeRealmRole(userId: string, roleName: string): Promise<void> {
    await this.ensureAuthenticated();

    const role = await this.kcAdminClient.roles.findOneByName({
      realm: this.realm,
      name: roleName
    });

    if (!role) {
      throw new Error(`Realm role "${roleName}" not found`);
    }

    await this.kcAdminClient.users.delRealmRoleMappings({
      id: userId,
      realm: this.realm,
      roles: [{ id: role.id!, name: role.name! }]
    });
  }

  async resetUserPassword(
    userId: string,
    password: string,
    temporary = false
  ): Promise<void> {
    await this.ensureAuthenticated();

    await this.kcAdminClient.users.resetPassword({
      id: userId,
      realm: this.realm,
      credential: {
        type: 'password',
        value: password,
        temporary
      }
    });
  }
}
