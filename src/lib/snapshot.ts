/**
 * Code Snapshot - AI-friendly code structure with refs
 * 
 * Generates a structural overview of code with deterministic refs
 * for functions, classes, and modules - similar to agent-browser's
 * element refs for web pages.
 * 
 * Refs:
 *   @f1, @f2, ... - Functions
 *   @c1, @c2, ... - Classes
 *   @m1, @m2, ... - Modules/Files
 *   @t1, @t2, ... - Types/Interfaces
 *   @v1, @v2, ... - Variables/Constants
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, relative, extname } from 'path';

export interface CodeRef {
  ref: string;           // e.g., "@f1", "@c2"
  type: 'function' | 'class' | 'module' | 'type' | 'variable';
  name: string;          // e.g., "login", "AuthService"
  path: string;          // e.g., "src/services/auth/index.ts"
  line?: number;         // Line number in file
  signature?: string;    // e.g., "(email: string, password: string)"
  exports?: string[];    // For modules: exported names
}

export interface SnapshotResult {
  tree: string;          // Formatted tree output
  refs: CodeRef[];       // All refs
  refMap: Map<string, CodeRef>;  // Quick lookup by ref
  stats: {
    functions: number;
    classes: number;
    modules: number;
    types: number;
    variables: number;
  };
}

export interface SnapshotOptions {
  path?: string;         // Directory to snapshot (default: cwd)
  depth?: number;        // Max depth (default: 10)
  interactive?: boolean; // Only show interactive elements (functions, classes)
  extensions?: string[]; // File extensions to include
  exclude?: string[];    // Patterns to exclude
  compact?: boolean;     // Compact output
}

// Default file extensions to analyze
const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go'];

// Default patterns to exclude
const DEFAULT_EXCLUDE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  'target',
];

/**
 * Generate a code snapshot with refs
 */
export function getSnapshot(options: SnapshotOptions = {}): SnapshotResult {
  const {
    path: rootPath = process.cwd(),
    depth = 10,
    interactive = false,
    extensions = DEFAULT_EXTENSIONS,
    exclude = DEFAULT_EXCLUDE,
    compact = false,
  } = options;

  const refs: CodeRef[] = [];
  const counters = { f: 0, c: 0, m: 0, t: 0, v: 0 };

  // Walk the directory tree
  const tree = walkDirectory(rootPath, rootPath, 0, depth, extensions, exclude, refs, counters, interactive);

  // Build ref map
  const refMap = new Map<string, CodeRef>();
  for (const ref of refs) {
    refMap.set(ref.ref, ref);
  }

  // Format tree output
  const treeOutput = formatTree(tree, compact);

  return {
    tree: treeOutput,
    refs,
    refMap,
    stats: {
      functions: counters.f,
      classes: counters.c,
      modules: counters.m,
      types: counters.t,
      variables: counters.v,
    },
  };
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  ref?: string;
  type?: CodeRef['type'];
  children?: TreeNode[];
  items?: CodeRef[];  // Functions/classes in this file
}

/**
 * Walk directory and build tree
 */
function walkDirectory(
  dirPath: string,
  rootPath: string,
  currentDepth: number,
  maxDepth: number,
  extensions: string[],
  exclude: string[],
  refs: CodeRef[],
  counters: { f: number; c: number; m: number; t: number; v: number },
  interactive: boolean
): TreeNode[] {
  if (currentDepth > maxDepth) return [];

  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  
  const nodes: TreeNode[] = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const relativePath = relative(rootPath, fullPath);

    // Skip excluded patterns
    if (exclude.some(pattern => entry.name.includes(pattern) || relativePath.includes(pattern))) {
      continue;
    }

    if (entry.isDirectory()) {
      const children = walkDirectory(
        fullPath, rootPath, currentDepth + 1, maxDepth,
        extensions, exclude, refs, counters, interactive
      );

      // Only include non-empty directories
      if (children.length > 0) {
        nodes.push({
          name: entry.name,
          path: relativePath,
          isDirectory: true,
          children,
        });
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (!extensions.includes(ext)) continue;

      // Parse file for code elements
      const items = parseFile(fullPath, relativePath, refs, counters, interactive);

      // Always include modules, or files with items
      if (items.length > 0 || !interactive) {
        counters.m++;
        const moduleRef = `@m${counters.m}`;

        const moduleRefObj: CodeRef = {
          ref: moduleRef,
          type: 'module',
          name: entry.name,
          path: relativePath,
          exports: items.map(i => i.name),
        };
        refs.push(moduleRefObj);

        nodes.push({
          name: entry.name,
          path: relativePath,
          isDirectory: false,
          ref: moduleRef,
          type: 'module',
          items,
        });
      }
    }
  }

  // Sort: directories first, then files
  return nodes.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Parse a file for functions, classes, types
 */
function parseFile(
  filePath: string,
  relativePath: string,
  refs: CodeRef[],
  counters: { f: number; c: number; m: number; t: number; v: number },
  interactive: boolean
): CodeRef[] {
  const items: CodeRef[] = [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const ext = extname(filePath);

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      parseTypeScript(content, relativePath, refs, counters, items, interactive);
    } else if (ext === '.py') {
      parsePython(content, relativePath, refs, counters, items, interactive);
    } else if (ext === '.rs') {
      parseRust(content, relativePath, refs, counters, items, interactive);
    } else if (ext === '.go') {
      parseGo(content, relativePath, refs, counters, items, interactive);
    }
  } catch {
    // Ignore parse errors
  }

  return items;
}

/**
 * Parse TypeScript/JavaScript file
 */
function parseTypeScript(
  content: string,
  path: string,
  refs: CodeRef[],
  counters: { f: number; c: number; m: number; t: number; v: number },
  items: CodeRef[],
  interactive: boolean
): void {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Function declarations
    const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(\([^)]*\))/);
    if (funcMatch) {
      counters.f++;
      const ref: CodeRef = {
        ref: `@f${counters.f}`,
        type: 'function',
        name: funcMatch[1],
        path,
        line: lineNum,
        signature: funcMatch[2],
      };
      refs.push(ref);
      items.push(ref);
      continue;
    }

    // Arrow functions (exported or const)
    const arrowMatch = line.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/);
    if (arrowMatch) {
      counters.f++;
      const ref: CodeRef = {
        ref: `@f${counters.f}`,
        type: 'function',
        name: arrowMatch[1],
        path,
        line: lineNum,
      };
      refs.push(ref);
      items.push(ref);
      continue;
    }

    // Class declarations
    const classMatch = line.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      counters.c++;
      const ref: CodeRef = {
        ref: `@c${counters.c}`,
        type: 'class',
        name: classMatch[1],
        path,
        line: lineNum,
      };
      refs.push(ref);
      items.push(ref);
      continue;
    }

    // Interface/Type declarations (if not interactive-only)
    if (!interactive) {
      const typeMatch = line.match(/(?:export\s+)?(?:interface|type)\s+(\w+)/);
      if (typeMatch) {
        counters.t++;
        const ref: CodeRef = {
          ref: `@t${counters.t}`,
          type: 'type',
          name: typeMatch[1],
          path,
          line: lineNum,
        };
        refs.push(ref);
        items.push(ref);
      }
    }
  }
}

/**
 * Parse Python file
 */
function parsePython(
  content: string,
  path: string,
  refs: CodeRef[],
  counters: { f: number; c: number; m: number; t: number; v: number },
  items: CodeRef[],
  interactive: boolean
): void {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Function definitions
    const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*(\([^)]*\))/);
    if (funcMatch) {
      counters.f++;
      const ref: CodeRef = {
        ref: `@f${counters.f}`,
        type: 'function',
        name: funcMatch[1],
        path,
        line: lineNum,
        signature: funcMatch[2],
      };
      refs.push(ref);
      items.push(ref);
      continue;
    }

    // Class definitions
    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch) {
      counters.c++;
      const ref: CodeRef = {
        ref: `@c${counters.c}`,
        type: 'class',
        name: classMatch[1],
        path,
        line: lineNum,
      };
      refs.push(ref);
      items.push(ref);
    }
  }
}

/**
 * Parse Rust file
 */
function parseRust(
  content: string,
  path: string,
  refs: CodeRef[],
  counters: { f: number; c: number; m: number; t: number; v: number },
  items: CodeRef[],
  interactive: boolean
): void {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Function definitions
    const funcMatch = line.match(/(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*(\([^)]*\))/);
    if (funcMatch) {
      counters.f++;
      const ref: CodeRef = {
        ref: `@f${counters.f}`,
        type: 'function',
        name: funcMatch[1],
        path,
        line: lineNum,
        signature: funcMatch[2],
      };
      refs.push(ref);
      items.push(ref);
      continue;
    }

    // Struct/Enum definitions (as classes)
    const structMatch = line.match(/(?:pub\s+)?(?:struct|enum)\s+(\w+)/);
    if (structMatch) {
      counters.c++;
      const ref: CodeRef = {
        ref: `@c${counters.c}`,
        type: 'class',
        name: structMatch[1],
        path,
        line: lineNum,
      };
      refs.push(ref);
      items.push(ref);
    }
  }
}

/**
 * Parse Go file
 */
function parseGo(
  content: string,
  path: string,
  refs: CodeRef[],
  counters: { f: number; c: number; m: number; t: number; v: number },
  items: CodeRef[],
  interactive: boolean
): void {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Function definitions
    const funcMatch = line.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)\s*(\([^)]*\))/);
    if (funcMatch) {
      counters.f++;
      const ref: CodeRef = {
        ref: `@f${counters.f}`,
        type: 'function',
        name: funcMatch[1],
        path,
        line: lineNum,
        signature: funcMatch[2],
      };
      refs.push(ref);
      items.push(ref);
      continue;
    }

    // Type definitions (struct)
    const typeMatch = line.match(/^type\s+(\w+)\s+struct/);
    if (typeMatch) {
      counters.c++;
      const ref: CodeRef = {
        ref: `@c${counters.c}`,
        type: 'class',
        name: typeMatch[1],
        path,
        line: lineNum,
      };
      refs.push(ref);
      items.push(ref);
    }
  }
}

/**
 * Format tree for display
 */
function formatTree(nodes: TreeNode[], compact: boolean, indent: string = ''): string {
  const lines: string[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const prefix = isLast ? '└── ' : '├── ';
    const childIndent = indent + (isLast ? '    ' : '│   ');

    if (node.isDirectory) {
      lines.push(`${indent}${prefix}${node.name}/`);
      if (node.children) {
        lines.push(formatTree(node.children, compact, childIndent));
      }
    } else {
      // File with ref
      const refStr = node.ref ? ` [${node.ref}]` : '';
      const exportsStr = node.items && node.items.length > 0 && !compact
        ? ` (${node.items.length} items)`
        : '';
      lines.push(`${indent}${prefix}${node.name}${refStr}${exportsStr}`);

      // Show items in file
      if (node.items && node.items.length > 0 && !compact) {
        for (let j = 0; j < node.items.length; j++) {
          const item = node.items[j];
          const itemIsLast = j === node.items.length - 1;
          const itemPrefix = itemIsLast ? '└── ' : '├── ';
          const typeIcon = getTypeIcon(item.type);
          const sigStr = item.signature || '';
          lines.push(`${childIndent}${itemPrefix}${typeIcon} ${item.name}${sigStr} [${item.ref}]`);
        }
      }
    }
  }

  return lines.filter(l => l).join('\n');
}

/**
 * Get icon for code element type
 */
function getTypeIcon(type: CodeRef['type']): string {
  switch (type) {
    case 'function': return 'fn';
    case 'class': return 'class';
    case 'module': return 'mod';
    case 'type': return 'type';
    case 'variable': return 'var';
    default: return '';
  }
}

/**
 * Look up a ref and return its details
 */
export function resolveRef(ref: string, snapshot: SnapshotResult): CodeRef | null {
  // Normalize ref (add @ if missing)
  const normalizedRef = ref.startsWith('@') ? ref : `@${ref}`;
  return snapshot.refMap.get(normalizedRef) || null;
}

/**
 * Get file content for a ref, with surrounding context
 */
export function getRefContent(ref: CodeRef, rootPath: string, contextLines: number = 20): string | null {
  try {
    const fullPath = join(rootPath, ref.path);
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');

    if (!ref.line) {
      return content;
    }

    const startLine = Math.max(0, ref.line - 1);
    const endLine = Math.min(lines.length, ref.line + contextLines);

    // Add line numbers
    const numberedLines = lines.slice(startLine, endLine).map((line, idx) => {
      const lineNum = startLine + idx + 1;
      const marker = lineNum === ref.line ? '>' : ' ';
      return `${marker}${String(lineNum).padStart(4)} | ${line}`;
    });

    return numberedLines.join('\n');
  } catch {
    return null;
  }
}

/**
 * Format snapshot stats for display
 */
export function formatStats(stats: SnapshotResult['stats']): string {
  const parts: string[] = [];
  if (stats.functions > 0) parts.push(`${stats.functions} functions`);
  if (stats.classes > 0) parts.push(`${stats.classes} classes`);
  if (stats.types > 0) parts.push(`${stats.types} types`);
  if (stats.modules > 0) parts.push(`${stats.modules} modules`);
  return parts.join(', ') || 'No code elements found';
}
