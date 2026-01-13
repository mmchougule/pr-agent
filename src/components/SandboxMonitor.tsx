/**
 * SandboxMonitor Component
 * Displays live sandbox metrics during execution (similar to React frontend)
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { ProgressBar } from './ProgressBar.js';

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
  showProgress?: boolean;  // Whether to show progress bar
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

/**
 * Calculate sandbox operation progress based on phase and metrics
 */
function calculateSandboxProgress(phase: string, uptime: number, isRunning: boolean): number {
  if (!isRunning) return 100;

  // Map phases to progress percentages for sandbox operations
  const phaseProgress: Record<string, number> = {
    sandbox: 20,     // Initializing sandbox
    clone: 50,       // Cloning repository (major I/O operation)
    agent: 80,       // Agent running (most time spent here)
    push: 95,        // Pushing changes
    pr: 98,          // Creating PR
    complete: 100,
  };

  let progress = phaseProgress[phase] || 0;

  // Add a small time-based increment for long-running operations
  // to show that work is being done
  if (phase === 'agent' && uptime > 30) {
    // Gradually increase from 80 to 95 over time during agent phase
    const timeBonus = Math.min(15, Math.floor((uptime - 30) / 10));
    progress = Math.min(95, progress + timeBonus);
  }

  return progress;
}

export function SandboxMonitor({ metrics, showDetails = true, showProgress = true }: SandboxMonitorProps) {
  const { sandboxId, jobId, uptime, estimatedCost, phase, isRunning } = metrics;

  // Track progress state
  const [progress, setProgress] = useState(0);

  // Update progress based on phase and uptime
  useEffect(() => {
    const newProgress = calculateSandboxProgress(phase, uptime, isRunning);
    setProgress(newProgress);
  }, [phase, uptime, isRunning]);

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

      {/* Progress bar for sandbox operations */}
      {showProgress && isRunning && progress < 100 && (
        <Box marginLeft={2} marginTop={1}>
          <ProgressBar
            progress={progress}
            style="bar"
            width={30}
            showPercentage={false}
          />
        </Box>
      )}
    </Box>
  );
}

export default SandboxMonitor;
