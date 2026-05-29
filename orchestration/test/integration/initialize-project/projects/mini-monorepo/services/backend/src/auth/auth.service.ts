import { Injectable, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class AuthService {
  private readonly keycloakUrl = process.env.KEYCLOAK_URL ?? 'http://localhost:7080';
  private readonly realm = process.env.KEYCLOAK_REALM ?? 'mini-monorepo';
  private readonly clientId = process.env.KEYCLOAK_CLIENT_ID ?? 'mini-monorepo-backend';

  async login(username: string, password: string): Promise<{ accessToken: string }> {
    try {
      const response = await axios.post<{ access_token: string }>(
        `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/token`,
        new URLSearchParams({
          grant_type: 'password',
          client_id: this.clientId,
          username,
          password,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      return { accessToken: response.data.access_token };
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }
  }
}
