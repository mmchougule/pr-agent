/**
 * ResultBox Component
 * Displays the final result (success or failure) in a styled box
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors, dimensions } from '../theme.js';

/**
 * Format duration in seconds to human-readable format
 */
function formatDuration(seconds: number): string {
  const totalSeconds = Math.round(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  }
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${secs}s`;
}

interface ResultBoxProps {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
  sandboxId?: string;
  jobId?: string;
  error?: string;
  estimatedCostUsd?: number;
  sandboxDurationSeconds?: number;
  llmInputTokens?: number;
  llmOutputTokens?: number;
  llmModel?: string;
  summary?: string;           // LLM-generated fix summary
  fixBranch?: string;         // Branch name
  commitSha?: string;         // Commit SHA
}

export function ResultBox({
  success,
  prUrl,
  prNumber,
  filesChanged,
  additions,
  deletions,
  sandboxId,
  jobId,
  error,
  estimatedCostUsd,
  sandboxDurationSeconds,
  llmInputTokens,
  llmOutputTokens,
  llmModel,
  summary,
  fixBranch,
  commitSha,
}: ResultBoxProps) {
  const { resultBoxWidth } = dimensions;
  const borderColor = success ? colors.success : colors.error;
  const icon = success ? '✓' : '✗';
  const title = success ? 'PR Created Successfully' : 'Task Failed';

  // Build content lines
  const contentLines: Array<{ text: string; color?: string; wrap?: boolean }> = [];

  if (success && prUrl) {
    contentLines.push({ text: prUrl, color: colors.primary });

    // Show LLM-generated summary if available (most important info)
    if (summary) {
      // Word wrap the summary to fit in the box
      const maxWidth = resultBoxWidth - 6;
      const words = summary.split(' ');
      let currentLine = '';
      for (const word of words) {
        if ((currentLine + ' ' + word).trim().length <= maxWidth) {
          currentLine = (currentLine + ' ' + word).trim();
        } else {
          if (currentLine) {
            contentLines.push({ text: currentLine, color: colors.text, wrap: true });
          }
          currentLine = word;
        }
      }
      if (currentLine) {
        contentLines.push({ text: currentLine, color: colors.text, wrap: true });
      }
    }

    // Show diff stats with +/- format
    if (filesChanged !== undefined || additions !== undefined || deletions !== undefined) {
      const parts: string[] = [];
      if (filesChanged !== undefined) {
        parts.push(`${filesChanged} file${filesChanged !== 1 ? 's' : ''}`);
      }
      if (additions !== undefined || deletions !== undefined) {
        const addStr = additions !== undefined ? `+${additions}` : '';
        const delStr = deletions !== undefined ? `-${deletions}` : '';
        if (addStr || delStr) {
          parts.push([addStr, delStr].filter(Boolean).join('/'));
        }
      }
      if (parts.length > 0) {
        contentLines.push({ text: parts.join(' · '), color: colors.muted });
      }
    }

    // Add cost, duration, and token stats
    const stats: string[] = [];
    if (estimatedCostUsd !== undefined) {
      stats.push(`$${estimatedCostUsd.toFixed(2)}`);
    }
    if (sandboxDurationSeconds !== undefined) {
      stats.push(formatDuration(sandboxDurationSeconds));
    }
    if (llmInputTokens !== undefined || llmOutputTokens !== undefined) {
      const tokensStr = [
        llmInputTokens ? `${(llmInputTokens / 1000).toFixed(0)}K in` : '',
        llmOutputTokens ? `${(llmOutputTokens / 1000).toFixed(1)}K out` : '',
      ].filter(Boolean).join('/');
      if (tokensStr) stats.push(tokensStr);
    }
    if (stats.length > 0) {
      contentLines.push({ text: stats.join(' · '), color: colors.muted });
    }

    // Show job/sandbox IDs for debugging (dimmed)
    if (jobId || sandboxId) {
      const idParts: string[] = [];
      if (jobId) idParts.push(`job:${jobId.substring(0, 8)}`);
      if (sandboxId) idParts.push(`sandbox:${sandboxId.substring(0, 8)}`);
      contentLines.push({ text: idParts.join(' · '), color: colors.muted });
    }
  } else if (error) {
    contentLines.push({ text: error, color: colors.error });
  }

  // Calculate padding for centering
  const maxContentWidth = resultBoxWidth - 4; // Account for borders and padding

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Top border */}
      <Text color={borderColor}>
        {'╭'}{'─'.repeat(resultBoxWidth - 2)}{'╮'}
      </Text>

      {/* Title row */}
      <Box>
        <Text color={borderColor}>│</Text>
        <Text color={borderColor}> {icon} </Text>
        <Text color={success ? colors.success : colors.error} bold>
          {title}
        </Text>
        <Text color={borderColor}>
          {' '.repeat(Math.max(0, resultBoxWidth - title.length - 6))}│
        </Text>
      </Box>

      {/* Empty line */}
      <Text color={borderColor}>
        │{' '.repeat(resultBoxWidth - 2)}│
      </Text>

      {/* Content lines */}
      {contentLines.map((line, index) => {
        const displayLine = line.text.length > maxContentWidth
          ? line.text.substring(0, maxContentWidth - 3) + '...'
          : line.text;
        const padding = resultBoxWidth - displayLine.length - 4;

        return (
          <Box key={index}>
            <Text color={borderColor}>│</Text>
            <Text>  </Text>
            <Text color={line.color || colors.muted}>
              {displayLine}
            </Text>
            <Text>{' '.repeat(Math.max(0, padding))}</Text>
            <Text color={borderColor}>│</Text>
          </Box>
        );
      })}

      {/* Empty line */}
      <Text color={borderColor}>
        │{' '.repeat(resultBoxWidth - 2)}│
      </Text>

      {/* Bottom border */}
      <Text color={borderColor}>
        {'╰'}{'─'.repeat(resultBoxWidth - 2)}{'╯'}
      </Text>
    </Box>
  );
}

export function ErrorBox({ error }: { error: string }) {
  return <ResultBox success={false} error={error} />;
}

export default ResultBox;
