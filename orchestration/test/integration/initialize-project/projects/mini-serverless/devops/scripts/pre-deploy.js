// Pre-deploy hook invoked by firebase.json. Real deploys validate config
// and emit a manifest the post-deploy step reads.
import { writeFileSync } from 'fs';

const manifest = {
  timestamp: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? 'local',
  project: process.env.GCP_PROJECT ?? 'mini-serverless-dev',
};

writeFileSync('.deploy-manifest.json', JSON.stringify(manifest, null, 2));
console.warn('pre-deploy: wrote .deploy-manifest.json');
