/**
 * AuthFlow Component
 * GitHub Device Flow authentication UI
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { colors } from '../theme.js';

export type AuthStatus = 'idle' | 'pending' | 'polling' | 'success' | 'error';

interface AuthFlowProps {
  status: AuthStatus;
  verificationUrl?: string;
  userCode?: string;
  error?: string;
  username?: string;
}

export function AuthFlow({
  status,
  verificationUrl,
  userCode,
  error,
  username,
}: AuthFlowProps) {
  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color={colors.text}>
        GitHub Authentication
      </Text>

      <Box marginTop={1} flexDirection="column">
        {status === 'pending' && verificationUrl && userCode && (
          <>
            <Box>
              <Text color={colors.text}>Visit: </Text>
              <Text color={colors.primary} bold>
                {verificationUrl}
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color={colors.text}>Enter code: </Text>
              <Text color={colors.accent} bold>
                {userCode}
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color={colors.primary}>
                <Spinner type="dots" />
              </Text>
              <Text color={colors.muted}> Waiting for authorization...</Text>
            </Box>
          </>
        )}

        {status === 'polling' && (
          <Box>
            <Text color={colors.primary}>
              <Spinner type="dots" />
            </Text>
            <Text color={colors.muted}> Checking authorization status...</Text>
          </Box>
        )}

        {status === 'success' && (
          <Box>
            <Text color={colors.success}>✓</Text>
            <Text color={colors.success}>
              {' '}
              Authenticated successfully
              {username && (
                <Text color={colors.muted}> as {username}</Text>
              )}
              !
            </Text>
          </Box>
        )}

        {status === 'error' && error && (
          <Box>
            <Text color={colors.error}>✗</Text>
            <Text color={colors.error}> {error}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default AuthFlow;
