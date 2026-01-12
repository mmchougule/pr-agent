/**
 * Intro Component
 * ASCII art branding and welcome message
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors, dimensions } from '../theme.js';

interface IntroProps {
  version?: string;
}

export function Intro({ version = '1.0.0' }: IntroProps) {
  const { introWidth } = dimensions;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* ASCII Art Banner */}
      <Text color={colors.primary} bold>
{`
 ██████╗ ██████╗        █████╗  ██████╗ ███████╗███╗   ██╗████████╗
 ██╔══██╗██╔══██╗      ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
 ██████╔╝██████╔╝█████╗███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║
 ██╔═══╝ ██╔══██╗╚════╝██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║
 ██║     ██║  ██║      ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║
 ╚═╝     ╚═╝  ╚═╝      ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝
`}
      </Text>

      {/* Version and tagline */}
      <Box marginTop={0}>
        <Text color={colors.muted}>v{version}</Text>
        <Text color={colors.mutedLight}> • </Text>
        <Text color={colors.text}>Delegate repo work to a coding agent.</Text>
      </Box>

      {/* Divider */}
      <Box marginTop={1}>
        <Text color={colors.mutedDark}>{'─'.repeat(introWidth)}</Text>
      </Box>
    </Box>
  );
}

export default Intro;
