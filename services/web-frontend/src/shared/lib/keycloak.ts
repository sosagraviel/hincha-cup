import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: process.env.VITE_KEYCLOAK_EXTERNAL_URL || 'http://localhost:7080',
  realm: process.env.VITE_KEYCLOAK_REALM || 'gira',
  clientId: process.env.VITE_KEYCLOAK_CLIENT_ID || 'web-frontend'
});

export default keycloak;
