/**
 * Plan Parser for PR-Agent CLI
 * Parses and generates plan.md files for human/LLM readable execution plans
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { SessionTask } from './session.js';

// ============================================================================
// Types
// ============================================================================

export interface PlanMetadata {
  name: string;
  repo: string;
  branch: string;
  createdAt: string;
}

export interface PlanTask {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  priority: number;
  dependencies: string[];
  description: string;
  acceptanceCriteria: string[];
}

export interface Plan {
  metadata: PlanMetadata;
  context: string;
  tasks: PlanTask[];
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse a plan.md file into a Plan object
 */
export function parsePlanMd(content: string): Plan {
  const lines = content.split('\n');
  let currentSection = '';
  let currentTask: Partial<PlanTask> | null = null;
  const tasks: PlanTask[] = [];

  // Metadata defaults
  const metadata: PlanMetadata = {
    name: 'Untitled Plan',
    repo: '',
    branch: 'main',
    createdAt: new Date().toISOString(),
  };

  let context = '';
  let inAcceptanceCriteria = false;
  let acceptanceCriteria: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Parse title (# Title)
    if (line.startsWith('# ') && !metadata.name) {
      metadata.name = line.substring(2).trim();
      continue;
    }

    // Parse blockquote metadata (> Created: ... | Repo: ... | Branch: ...)
    if (trimmed.startsWith('>')) {
      const metaLine = trimmed.substring(1).trim();
      const parts = metaLine.split('|').map(p => p.trim());

      for (const part of parts) {
        if (part.startsWith('Created:')) {
          metadata.createdAt = part.replace('Created:', '').trim();
        } else if (part.startsWith('Repo:')) {
          metadata.repo = part.replace('Repo:', '').trim();
        } else if (part.startsWith('Branch:')) {
          metadata.branch = part.replace('Branch:', '').trim();
        }
      }
      continue;
    }

    // Section headers (## Context, ## Tasks)
    if (line.startsWith('## ')) {
      const sectionName = line.substring(3).trim().toLowerCase();

      // Save previous task if exists
      if (currentTask && currentTask.id) {
        if (inAcceptanceCriteria) {
          currentTask.acceptanceCriteria = [...acceptanceCriteria];
          acceptanceCriteria = [];
          inAcceptanceCriteria = false;
        }
        tasks.push(currentTask as PlanTask);
        currentTask = null;
      }

      currentSection = sectionName;
      continue;
    }

    // Task headers (### US-001: Title)
    const taskMatch = line.match(/^### ([\w-]+):\s*(.+)$/);
    if (taskMatch) {
      // Save previous task
      if (currentTask && currentTask.id) {
        if (inAcceptanceCriteria) {
          currentTask.acceptanceCriteria = [...acceptanceCriteria];
          acceptanceCriteria = [];
          inAcceptanceCriteria = false;
        }
        tasks.push(currentTask as PlanTask);
      }

      currentTask = {
        id: taskMatch[1],
        title: taskMatch[2],
        status: 'pending',
        priority: tasks.length + 1,
        dependencies: [],
        description: '',
        acceptanceCriteria: [],
      };
      inAcceptanceCriteria = false;
      continue;
    }

    // Inside a task
    if (currentTask) {
      // Parse status, priority, dependencies
      if (trimmed.startsWith('- **Status**:')) {
        const status = trimmed.replace('- **Status**:', '').trim().toLowerCase();
        if (['pending', 'running', 'completed', 'failed', 'skipped'].includes(status)) {
          currentTask.status = status as PlanTask['status'];
        }
        continue;
      }

      if (trimmed.startsWith('- **Priority**:')) {
        const priority = parseInt(trimmed.replace('- **Priority**:', '').trim(), 10);
        if (!isNaN(priority)) {
          currentTask.priority = priority;
        }
        continue;
      }

      if (trimmed.startsWith('- **Dependencies**:')) {
        const deps = trimmed.replace('- **Dependencies**:', '').trim();
        if (deps.toLowerCase() !== 'none') {
          currentTask.dependencies = deps.split(',').map(d => d.trim()).filter(Boolean);
        }
        continue;
      }

      // Acceptance criteria section
      if (trimmed.startsWith('**Acceptance Criteria:**')) {
        inAcceptanceCriteria = true;
        continue;
      }

      // Acceptance criteria items
      if (inAcceptanceCriteria && trimmed.startsWith('- [')) {
        // Parse checkbox items: - [ ] item or - [x] item
        const match = trimmed.match(/^- \[[x ]\] (.+)$/);
        if (match) {
          acceptanceCriteria.push(match[1]);
        }
        continue;
      }

      // Task separator
      if (trimmed === '---') {
        if (currentTask.id) {
          if (inAcceptanceCriteria) {
            currentTask.acceptanceCriteria = [...acceptanceCriteria];
            acceptanceCriteria = [];
            inAcceptanceCriteria = false;
          }
          tasks.push(currentTask as PlanTask);
        }
        currentTask = null;
        continue;
      }

      // Description text (non-empty lines not matching above patterns)
      if (trimmed && !inAcceptanceCriteria && !trimmed.startsWith('- **')) {
        if (currentTask.description) {
          currentTask.description += '\n' + trimmed;
        } else {
          currentTask.description = trimmed;
        }
      }
    }

    // Context section
    if (currentSection === 'context' && trimmed && !currentTask) {
      if (context) {
        context += '\n' + trimmed;
      } else {
        context = trimmed;
      }
    }
  }

  // Save last task
  if (currentTask && currentTask.id) {
    if (inAcceptanceCriteria) {
      currentTask.acceptanceCriteria = [...acceptanceCriteria];
    }
    tasks.push(currentTask as PlanTask);
  }

  return {
    metadata,
    context,
    tasks,
  };
}

/**
 * Load and parse a plan.md file
 */
export function loadPlan(path: string): Plan | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    return parsePlanMd(content);
  } catch (err) {
    console.error('Failed to load plan:', err);
    return null;
  }
}

// ============================================================================
// Generator
// ============================================================================

/**
 * Generate plan.md content from a Plan object
 */
export function generatePlanMd(plan: Plan): string {
  const lines: string[] = [];

  // Title
  lines.push(`# ${plan.metadata.name}`);
  lines.push('');

  // Metadata
  const metaParts: string[] = [];
  if (plan.metadata.createdAt) {
    const date = new Date(plan.metadata.createdAt).toISOString().split('T')[0];
    metaParts.push(`Created: ${date}`);
  }
  if (plan.metadata.repo) {
    metaParts.push(`Repo: ${plan.metadata.repo}`);
  }
  if (plan.metadata.branch) {
    metaParts.push(`Branch: ${plan.metadata.branch}`);
  }
  if (metaParts.length > 0) {
    lines.push(`> ${metaParts.join(' | ')}`);
    lines.push('');
  }

  // Context section
  if (plan.context) {
    lines.push('## Context');
    lines.push('');
    lines.push(plan.context);
    lines.push('');
  }

  // Tasks section
  if (plan.tasks.length > 0) {
    lines.push('## Tasks');
    lines.push('');

    for (let i = 0; i < plan.tasks.length; i++) {
      const task = plan.tasks[i];

      // Task header
      lines.push(`### ${task.id}: ${task.title}`);

      // Metadata
      lines.push(`- **Status**: ${task.status}`);
      lines.push(`- **Priority**: ${task.priority}`);
      lines.push(`- **Dependencies**: ${task.dependencies.length > 0 ? task.dependencies.join(', ') : 'none'}`);
      lines.push('');

      // Description
      if (task.description) {
        lines.push(task.description);
        lines.push('');
      }

      // Acceptance criteria
      if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
        lines.push('**Acceptance Criteria:**');
        for (const criterion of task.acceptanceCriteria) {
          const checked = task.status === 'completed' ? 'x' : ' ';
          lines.push(`- [${checked}] ${criterion}`);
        }
        lines.push('');
      }

      // Separator between tasks
      if (i < plan.tasks.length - 1) {
        lines.push('---');
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/**
 * Save a Plan to a plan.md file
 */
export function savePlan(plan: Plan, path: string): void {
  const dir = dirname(path);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const content = generatePlanMd(plan);
  writeFileSync(path, content);
}

/**
 * Update a task's status in the plan file
 */
export function updateTaskInPlan(
  path: string,
  taskId: string,
  status: PlanTask['status']
): boolean {
  const plan = loadPlan(path);

  if (!plan) {
    return false;
  }

  const task = plan.tasks.find(t => t.id === taskId);
  if (!task) {
    return false;
  }

  task.status = status;
  savePlan(plan, path);
  return true;
}

// ============================================================================
// Conversion
// ============================================================================

/**
 * Convert PlanTasks to SessionTasks
 */
export function planTasksToSessionTasks(planTasks: PlanTask[]): SessionTask[] {
  return planTasks.map(pt => ({
    id: pt.id,
    title: pt.title,
    description: pt.description,
    priority: pt.priority,
    dependencies: pt.dependencies,
    status: pt.status === 'running' ? 'pending' : pt.status,
    acceptanceCriteria: pt.acceptanceCriteria,
  }));
}

/**
 * Convert SessionTasks to PlanTasks
 */
export function sessionTasksToPlanTasks(sessionTasks: SessionTask[]): PlanTask[] {
  return sessionTasks.map(st => ({
    id: st.id,
    title: st.title,
    description: st.description,
    priority: st.priority,
    dependencies: st.dependencies,
    status: st.status,
    acceptanceCriteria: st.acceptanceCriteria || [],
  }));
}

// ============================================================================
// Random Name Generator (like Docker/Vercel)
// ============================================================================

const ADJECTIVES = [
  'bold', 'brave', 'bright', 'calm', 'clever', 'cool', 'cosmic', 'crisp',
  'daring', 'eager', 'epic', 'fast', 'fierce', 'fresh', 'golden', 'grand',
  'happy', 'keen', 'lively', 'lucky', 'magic', 'mighty', 'noble', 'polished',
  'proud', 'quick', 'rapid', 'sharp', 'shiny', 'silent', 'sleek', 'slick',
  'smart', 'smooth', 'snappy', 'solid', 'spark', 'speedy', 'spicy', 'steady',
  'stellar', 'striking', 'strong', 'super', 'swift', 'vivid', 'wild', 'witty',
  'zen', 'zesty', 'fancy', 'fluffy', 'fuzzy', 'gentle', 'glowing', 'graceful'
];

const NOUNS = [
  'anchor', 'arrow', 'atlas', 'beacon', 'blade', 'bolt', 'breeze', 'bridge',
  'canyon', 'castle', 'cloud', 'comet', 'coral', 'crystal', 'dawn', 'delta',
  'dream', 'eagle', 'ember', 'falcon', 'flame', 'flash', 'forest', 'frost',
  'galaxy', 'garden', 'glacier', 'harbor', 'hawk', 'horizon', 'island', 'jet',
  'jewel', 'jungle', 'lantern', 'laser', 'leaf', 'light', 'lion', 'maple',
  'meadow', 'meteor', 'moon', 'mountain', 'nebula', 'night', 'ocean', 'orbit',
  'orchid', 'otter', 'owl', 'panda', 'panther', 'peak', 'pearl', 'phoenix',
  'pilot', 'pine', 'pixel', 'planet', 'prism', 'pulse', 'quartz', 'rain',
  'raven', 'reef', 'ridge', 'river', 'rocket', 'rose', 'sage', 'sail',
  'shadow', 'shark', 'shield', 'sky', 'snow', 'spark', 'star', 'stone',
  'storm', 'stream', 'sun', 'surf', 'swan', 'thunder', 'tiger', 'torch',
  'tower', 'tree', 'valley', 'wave', 'wind', 'wolf', 'zenith'
];

/**
 * Generate a random memorable name (like "bold-falcon" or "cosmic-reef")
 */
export function generatePlanName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}

// ============================================================================
// Templates
// ============================================================================

/**
 * Create an empty plan with auto-generated name
 */
export function createEmptyPlan(description: string, repo: string, branch: string = 'main'): Plan {
  const planName = generatePlanName();
  return {
    metadata: {
      name: planName,
      repo,
      branch,
      createdAt: new Date().toISOString(),
    },
    context: description,
    tasks: [],
  };
}

/**
 * Create a plan with initial tasks
 */
export function createPlanWithTasks(
  description: string,
  repo: string,
  context: string,
  tasks: Array<{ title: string; description: string; acceptanceCriteria?: string[] }>,
  branch: string = 'main'
): Plan {
  const planName = generatePlanName();
  const planTasks: PlanTask[] = tasks.map((t, i) => ({
    id: `US-${String(i + 1).padStart(3, '0')}`,
    title: t.title,
    description: t.description,
    priority: i + 1,
    dependencies: i > 0 ? [`US-${String(i).padStart(3, '0')}`] : [],
    status: 'pending' as const,
    acceptanceCriteria: t.acceptanceCriteria || [],
  }));

  return {
    metadata: {
      name: planName,
      repo,
      branch,
      createdAt: new Date().toISOString(),
    },
    context: context || description,
    tasks: planTasks,
  };
}
