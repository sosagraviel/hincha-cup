const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function directoryExists(dirPath) {
  try {
    const stats = await fs.promises.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function copyDirectory(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });

  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

function getAllFilesRecursive(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFilesRecursive(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

function hashDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const files = getAllFilesRecursive(dirPath).sort();
  const combinedContent = files.map((file) => fs.readFileSync(file, 'utf-8')).join('');

  return crypto.createHash('sha256').update(combinedContent).digest('hex');
}

async function updateSingleSkill(skillName, projectPath, frameworkPath) {
  const { ConfigUpdater } = require('../config/config-updater.js');
  const configUpdater = new ConfigUpdater(projectPath, frameworkPath);
  const config = await configUpdater.readConfig();

  const skillInfo = config.resource_state.skills[skillName];
  if (!skillInfo) {
    throw new Error(`Skill ${skillName} not found in configuration`);
  }

  if (!skillInfo.managed_by_framework) {
    console.log(`Skipping ${skillName} (user-managed)`);
    return { updated: false, reason: 'user-managed' };
  }

  const sourcePath = path.join(frameworkPath, skillInfo.source_path);
  const destPath = path.join(projectPath, '.claude', 'skills', skillName);

  if (!(await directoryExists(sourcePath))) {
    throw new Error(`Source skill not found: ${sourcePath}`);
  }

  await fs.promises.rm(destPath, { recursive: true, force: true });
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await copyDirectory(sourcePath, destPath);

  const newSourceHash = hashDirectory(sourcePath);
  const newFileHash = hashDirectory(destPath);

  await configUpdater.updateResourceState('skills', skillName, {
    source_hash: newSourceHash,
    file_hash: newFileHash,
    user_modified: false
  });

  return { updated: true, newHash: newFileHash };
}

async function addSingleSkill(skillName, projectPath, frameworkPath) {
  const { ConfigUpdater } = require('../config/config-updater.js');
  const configUpdater = new ConfigUpdater(projectPath, frameworkPath);
  const config = await configUpdater.readConfig();

  if (config.resource_state.skills[skillName]) {
    console.log(`Skill ${skillName} already exists`);
    return { added: false, reason: 'already-exists' };
  }

  const skillsPath = path.join(frameworkPath, 'skills');
  let sourcePath = null;
  let category = null;

  const categories = await fs.promises.readdir(skillsPath);
  for (const cat of categories) {
    const catPath = path.join(skillsPath, cat);
    if (!(await directoryExists(catPath))) continue;

    const skillPath = path.join(catPath, skillName);
    if (await directoryExists(skillPath)) {
      sourcePath = skillPath;
      category = cat;
      break;
    }
  }

  if (!sourcePath) {
    throw new Error(`Skill ${skillName} not found in framework`);
  }

  const destPath = path.join(projectPath, '.claude', 'skills', category, skillName);
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await copyDirectory(sourcePath, destPath);

  const sourceHash = hashDirectory(sourcePath);
  const fileHash = hashDirectory(destPath);

  const skillKey = `${category}/${skillName}`;
  await configUpdater.updateResourceState('skills', skillKey, {
    source_path: path.relative(frameworkPath, sourcePath),
    copied_timestamp: new Date().toISOString(),
    source_hash: sourceHash,
    file_hash: fileHash,
    managed_by_framework: true,
    user_modified: false,
    dependencies: []
  });

  return { added: true, path: destPath };
}

module.exports = {
  updateSingleSkill,
  addSingleSkill,
  hashDirectory,
  copyDirectory,
  directoryExists,
  getAllFilesRecursive
};
