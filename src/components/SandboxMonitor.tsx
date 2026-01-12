/**
 * SandboxMonitor Component
 * Displays live sandbox metrics during execution (similar to React frontend)
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

export interface SandboxMetrics {
  sandboxId?: string;
  jobId?: string;
  uptime: number;           // seconds since start
  estimatedCost: number;    // USD
  phase: string;
  isRunning: boolean;
}

interface SandboxMonitorProps {
  metrics: SandboxMetrics;
  showDetails?: boolean;
}

/**
 * Format uptime as mm:ss or hh:mm:ss
 */
function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format cost
 */
function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

export function SandboxMonitor({ metrics, showDetails = true }: SandboxMonitorProps) {
  const { sandboxId, jobId, uptime, estimatedCost, phase, isRunning } = metrics;

  // Status indicator
  const statusIcon = isRunning ? '●' : '○';
  const statusColor = isRunning ? colors.success : colors.muted;
  const statusText = isRunning ? 'Running' : 'Stopped';

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header line */}
      <Box>
        <Text color={colors.primary} bold>Sandbox </Text>
        <Text color={statusColor}>{statusIcon} {statusText}</Text>
        <Text color={colors.muted}> · </Text>
        <Text color={colors.muted}>{formatUptime(uptime)}</Text>
        <Text color={colors.muted}> · </Text>
        <Text color={colors.warning}>{formatCost(estimatedCost)}</Text>
      </Box>

      {/* Details (optional) */}
      {showDetails && (sandboxId || jobId) && (
        <Box marginLeft={2}>
          {sandboxId && (
            <Text color={colors.muted}>
              sandbox:{sandboxId.substring(0, 12)}
            </Text>
          )}
          {sandboxId && jobId && <Text color={colors.muted}> · </Text>}
          {jobId && (
            <Text color={colors.muted}>
              job:{jobId.substring(0, 8)}
            </Text>
          )}
        </Box>
      )}

      {/* Phase indicator */}
      <Box marginLeft={2}>
        <Text color={colors.accent}>{phase}</Text>
      </Box>
    </Box>
  );
}

export default SandboxMonitor;
