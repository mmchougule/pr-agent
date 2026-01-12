/**
 * useAuth Hook
 * Manages GitHub Device Flow authentication
 */

import { useState, useCallback } from 'react';
import { saveConfig, loadConfig } from '../lib/config.js';
import type { AuthStatus } from '../components/AuthFlow.js';

// GitHub OAuth App Client ID (must be public OAuth app, not GitHub App)
// Configure via environment variable GITHUB_OAUTH_CLIENT_ID
// Falls back to the public Invariant OAuth app for convenience
const GITHUB_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID || 'Ov23liiiMsdLBN1iKbsP';

interface AuthState {
  status: AuthStatus;
  verificationUrl?: string;
  userCode?: string;
  error?: string;
  username?: string;
  token?: string;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface UserResponse {
  login: string;
  name?: string;
  email?: string;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    status: 'idle',
  });

  /**
   * Start the GitHub Device Flow
   */
  const startAuth = useCallback(async () => {
    setState({ status: 'pending' });

    try {
      // Request device code
      const deviceResponse = await fetch(
        'https://github.com/login/device/code',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            scope: 'repo',
          }),
        }
      );

      if (!deviceResponse.ok) {
        throw new Error(`GitHub API error: ${deviceResponse.status}`);
      }

      const deviceData = (await deviceResponse.json()) as DeviceCodeResponse;

      setState({
        status: 'pending',
        verificationUrl: deviceData.verification_uri,
        userCode: deviceData.user_code,
      });

      // Start polling for token
      const pollInterval = (deviceData.interval || 5) * 1000;
      const expiresAt = Date.now() + deviceData.expires_in * 1000;

      const poll = async (): Promise<void> => {
        if (Date.now() > expiresAt) {
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: 'Authorization timed out. Please try again.',
          }));
          return;
        }

        try {
          const tokenResponse = await fetch(
            'https://github.com/login/oauth/access_token',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                device_code: deviceData.device_code,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
              }),
            }
          );

          const tokenData = (await tokenResponse.json()) as TokenResponse;

          if (tokenData.error === 'authorization_pending') {
            // User hasn't authorized yet, continue polling
            setTimeout(poll, pollInterval);
            return;
          }

          if (tokenData.error === 'slow_down') {
            // Rate limited, slow down
            setTimeout(poll, pollInterval * 2);
            return;
          }

          if (tokenData.error) {
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: tokenData.error_description || tokenData.error,
            }));
            return;
          }

          if (tokenData.access_token) {
            // Success! Get user info
            const userResponse = await fetch('https://api.github.com/user', {
              headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
                Accept: 'application/vnd.github.v3+json',
              },
            });

            const userData = (await userResponse.json()) as UserResponse;

            // Save to config
            const config = loadConfig();
            config.githubToken = tokenData.access_token;
            config.githubUsername = userData.login;
            saveConfig(config);

            setState({
              status: 'success',
              username: userData.login,
              token: tokenData.access_token,
            });
          }
        } catch (err) {
          // Network error, retry
          setTimeout(poll, pollInterval);
        }
      };

      // Start polling after a short delay
      setTimeout(poll, pollInterval);
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to start authentication',
      });
    }
  }, []);

  return {
    ...state,
    startAuth,
    isAuthenticated: state.status === 'success',
  };
}

export default useAuth;
