/**
 * StreamingLogs Component
 * Displays real-time Claude Code activity logs like the Claude Code CLI
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface AgentLog {
  type: 'tool_call' | 'thinking' | 'message' | 'tool_result';
  tool?: string;
  display?: string;
  content?: string;
  timestamp: Date;
}

interface StreamingLogsProps {
  logs: AgentLog[];
}

/**
 * Format a tool call for display
 */
function formatTool(tool?: string, display?: string): string {
  // If we have a display string from the parser, use it
  if (display) return display;

  // Otherwise format based on tool name
  switch (tool) {
    case 'Read':
      return 'Reading file...';
    case 'Write':
      return 'Writing file...';
    case 'Edit':
      return 'Editing file...';
    case 'Bash':
      return 'Running command...';
    case 'Glob':
      return 'Finding files...';
    case 'Grep':
      return 'Searching...';
    case 'TodoWrite':
      return 'Updating tasks...';
    default:
      return tool ? `Using ${tool}...` : 'Working...';
  }
}

/**
 * Format timestamp for display
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Truncate text to max length
 */
function truncate(text: string | undefined, maxLength: number): string {
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function StreamingLogs({ logs }: StreamingLogsProps) {
  // Filter out empty entries and show last 12 logs
  const recentLogs = logs
    .filter(log => {
      // Filter out empty entries
      if (log.type === 'thinking' && !log.content?.trim()) return false;
      if (log.type === 'tool_result' && !log.content?.trim()) return false;
      if (log.type === 'tool_call' && !log.tool && !log.display) return false;
      if (log.type === 'message' && !log.content?.trim()) return false;
      return true;
    })
    .slice(-12);

  if (recentLogs.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>{'─'.repeat(50)}</Text>
      {recentLogs.map((log, index) => (
        <Box key={index}>
          <Text dimColor>  {formatTime(log.timestamp)} </Text>
          {log.type === 'tool_call' && (
            <Text>
              <Text color="cyan">{log.tool || 'tool'}</Text> {truncate(log.display || '', 50)}
            </Text>
          )}
          {log.type === 'thinking' && (
            <Text dimColor>
              {truncate(log.content, 50)}
            </Text>
          )}
          {log.type === 'message' && (
            <Text>
              {truncate(log.content, 55)}
            </Text>
          )}
          {log.type === 'tool_result' && (
            <Text dimColor>
              {truncate(log.content, 55)}
            </Text>
          )}
        </Box>
      ))}
      <Text dimColor>{'─'.repeat(50)}</Text>
    </Box>
  );
}

export default StreamingLogs;
