import { readFileSync, existsSync } from 'node:fs';

interface EnvJson {
  firebase: { projectId: string; region: string };
  stripe?: { secretKey: string };
  sendgrid?: { apiKey: string };
}

export function loadEnvJson(path = 'env.json'): EnvJson {
  if (!existsSync(path)) {
    throw new Error(`env.json missing — copy env.json.template and fill in real values`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as EnvJson;
}

export function validateProjectId(envJson: EnvJson): void {
  if (!envJson.firebase?.projectId || envJson.firebase.projectId.includes('REPLACE_ME')) {
    throw new Error('env.json firebase.projectId is unset');
  }
}
