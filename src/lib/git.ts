/**
 * Git context detection utilities
 */

import { execSync } from 'child_process';

export interface GitContext {
  repo: string;        // "owner/repo"
  branch: string;      // Current branch
  remoteUrl: string;   // Origin URL
  isGitRepo: boolean;
  rootDir: string;     // Git root directory
}

/**
 * Execute git command safely
 */
function git(args: string, cwd?: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Parse repo owner/name from git remote URL
 */
export function parseRepoFromUrl(url: string): string {
  if (!url) return '';
  
  // Handle SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@[^:]+:([^/]+\/[^.]+)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];
  
  // Handle HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = url.match(/https?:\/\/[^/]+\/([^/]+\/[^.]+?)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];
  
  return '';
}

/**
 * Get current git context from working directory
 */
export function getGitContext(cwd?: string): GitContext {
  const isGitRepo = git('rev-parse --is-inside-work-tree', cwd) === 'true';
  
  if (!isGitRepo) {
    return {
      repo: '',
      branch: '',
      remoteUrl: '',
      isGitRepo: false,
      rootDir: '',
    };
  }

  const rootDir = git('rev-parse --show-toplevel', cwd) || '';
  const branch = git('rev-parse --abbrev-ref HEAD', cwd) || '';
  const remoteUrl = git('remote get-url origin', cwd) || '';
  const repo = parseRepoFromUrl(remoteUrl) || '';

  return {
    repo,
    branch,
    remoteUrl,
    isGitRepo: true,
    rootDir,
  };
}

/**
 * Get a short commit hash
 */
export function getShortCommit(cwd?: string): string {
  return git('rev-parse --short HEAD', cwd);
}

/**
 * Check if there are uncommitted changes
 */
export function hasUncommittedChanges(cwd?: string): boolean {
  const status = git('status --porcelain', cwd);
  return status.length > 0;
}
