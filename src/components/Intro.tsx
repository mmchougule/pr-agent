/**
 * Intro Component
 * Minimal, elegant branding (like Amp/Claude Code)
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface IntroProps {
  version?: string;
}

export function Intro({ version = '1.0.0' }: IntroProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Clean single-line header */}
      <Box>
        <Text color={colors.primary} bold>pr-agent</Text>
        <Text color={colors.muted}> v{version}</Text>
      </Box>
    </Box>
  );
}

export default Intro;
