import axios from 'axios';

/** Base URL for the running backend service in Docker */
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3050';
const API_PREFIX = process.env.API_PREFIX || '/api/v1';

export const API_URL = `${API_BASE_URL}${API_PREFIX}`;

/** Axios instance pre-configured for integration tests */
export const httpClient = axios.create({
  baseURL: API_URL,
  validateStatus: () => true // Don't throw on any status code
});
