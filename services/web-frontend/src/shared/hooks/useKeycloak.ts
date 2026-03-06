import { useContext } from 'react';
import KeycloakContext from '@/shared/context/keycloak';

export const useKeycloak = () => useContext(KeycloakContext);
