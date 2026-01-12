/**
 * PhaseStatus Component
 * Shows current execution phase with a spinner
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { colors } from '../theme.js';

export type Phase = 'sandbox' | 'clone' | 'agent' | 'push' | 'pr' | 'complete';

const phaseLabels: Record<Phase, string> = {
  sandbox: 'Creating sandbox...',
  clone: 'Cloning repository...',
  agent: 'Running Claude Code...',
  push: 'Pushing changes...',
  pr: 'Creating pull request...',
  complete: 'Complete',
};

interface PhaseStatusProps {
  phase: Phase;
  message?: string;
}

export function PhaseStatus({ phase, message }: PhaseStatusProps) {
  // Don't show anything if complete
  if (phase === 'complete') {
    return null;
  }

  const label = message || phaseLabels[phase];

  return (
    <Box marginY={1}>
      <Text color={colors.primary}>
        <Spinner type="dots" />
      </Text>
      <Text> </Text>
      <Text color={colors.primary} bold>
        {label}
      </Text>
      <Text color={colors.muted}> (</Text>
      <Text color={colors.muted} bold>
        esc
      </Text>
      <Text color={colors.muted}> to cancel)</Text>
    </Box>
  );
}

export default PhaseStatus;
