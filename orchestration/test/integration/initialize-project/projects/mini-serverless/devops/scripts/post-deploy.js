// Plan v5 fixture — post-deploy hook. Tags the released version,
// purges CDN caches, posts to slack. The fixture just logs.
import { existsSync, readFileSync } from 'fs';

if (existsSync('.deploy-manifest.json')) {
  const manifest = JSON.parse(readFileSync('.deploy-manifest.json', 'utf-8'));
  console.warn('post-deploy: deployed', manifest);
} else {
  console.warn('post-deploy: no manifest — nothing to tag');
}
