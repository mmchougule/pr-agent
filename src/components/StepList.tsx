/**
 * StepList Component
 * Displays execution steps with status icons
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { colors } from '../theme.js';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Step {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

interface StatusIconProps {
  status: StepStatus;
}

function StatusIcon({ status }: StatusIconProps) {
  switch (status) {
    case 'pending':
      return <Text color={colors.muted}>○</Text>;
    case 'running':
      return (
        <Text color={colors.primary}>
          <Spinner type="dots" />
        </Text>
      );
    case 'completed':
      return <Text color={colors.success}>✓</Text>;
    case 'failed':
      return <Text color={colors.error}>✗</Text>;
    default:
      return <Text color={colors.muted}>○</Text>;
  }
}

interface StepRowProps {
  step: Step;
}

function StepRow({ step }: StepRowProps) {
  const textColor = step.status === 'pending' ? colors.muted : colors.text;
  const showDetail = step.status === 'running' && step.detail;

  return (
    <Box flexDirection="column">
      <Box>
        <StatusIcon status={step.status} />
        <Text> </Text>
        <Text color={textColor}>{step.label}</Text>
        {step.status === 'completed' && step.detail && (
          <Text color={colors.muted}> {step.detail}</Text>
        )}
      </Box>
      {showDetail && (
        <Box marginLeft={2}>
          <Text color={colors.mutedLight} dimColor>
            {step.detail}
          </Text>
        </Box>
      )}
    </Box>
  );
}

interface StepListProps {
  steps: Step[];
}

export function StepList({ steps }: StepListProps) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginY={1}>
      {steps.map((step) => (
        <StepRow key={step.id} step={step} />
      ))}
    </Box>
  );
}

export default StepList;
