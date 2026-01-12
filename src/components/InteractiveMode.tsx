/**
 * InteractiveMode Component
 * Claude Code-like interactive experience - just type `pr-agent` and get prompted
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { Intro } from './Intro.js';
import { colors } from '../theme.js';

type InputStep = 'repo' | 'task' | 'confirm' | 'executing';

interface InteractiveModeProps {
  version?: string;
}

export function InteractiveMode({ version }: InteractiveModeProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<InputStep>('repo');
  const [repo, setRepo] = useState('');
  const [task, setTask] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Handle escape to exit
  useInput((input, key) => {
    if (key.escape) {
      exit();
    }
  });

  const handleRepoSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed.includes('/')) {
      setError('Invalid format. Use: owner/repo (e.g., facebook/react)');
      return;
    }
    setError(null);
    setRepo(trimmed);
    setStep('task');
  };

  const handleTaskSubmit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 10) {
      setError('Task too short. Be specific about what you want done.');
      return;
    }
    setError(null);
    setTask(trimmed);
    setStep('confirm');
  };

  const handleConfirm = (value: string) => {
    const answer = value.toLowerCase().trim();
    if (answer === 'y' || answer === 'yes' || answer === '') {
      setStep('executing');
    } else if (answer === 'n' || answer === 'no') {
      // Go back to repo input
      setRepo('');
      setTask('');
      setStep('repo');
    }
  };

  // When confirmed, dynamically import and render the App
  if (step === 'executing') {
    // Import App dynamically to avoid circular dependency
    const AppPromise = import('../App.js');
    const [AppComponent, setAppComponent] = useState<any>(null);

    useEffect(() => {
      AppPromise.then((module) => {
        setAppComponent(() => module.App);
      });
    }, []);

    if (AppComponent) {
      return <AppComponent mode="run" repo={repo} task={task} version={version} />;
    }

    return (
      <Box flexDirection="column">
        <Text color={colors.primary}>Starting...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Intro version={version} />

      <Box marginTop={1} flexDirection="column">
        {/* Repo input */}
        {step === 'repo' && (
          <Box flexDirection="column">
            <Box>
              <Text color={colors.primary} bold>? </Text>
              <Text>Which repository? </Text>
              <Text color={colors.muted}>(owner/repo)</Text>
            </Box>
            <Box marginLeft={2}>
              <Text color={colors.accent}>❯ </Text>
              <TextInput
                value={repo}
                onChange={setRepo}
                onSubmit={handleRepoSubmit}
                placeholder="e.g., facebook/react"
              />
            </Box>
          </Box>
        )}

        {/* Task input */}
        {step === 'task' && (
          <Box flexDirection="column">
            <Box>
              <Text color={colors.success}>✓ </Text>
              <Text>Repository: </Text>
              <Text color={colors.primary}>{repo}</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={colors.primary} bold>? </Text>
              <Text>What should I do?</Text>
            </Box>
            <Box marginLeft={2}>
              <Text color={colors.accent}>❯ </Text>
              <TextInput
                value={task}
                onChange={setTask}
                onSubmit={handleTaskSubmit}
                placeholder="e.g., add unit tests for the auth module"
              />
            </Box>
          </Box>
        )}

        {/* Confirmation */}
        {step === 'confirm' && (
          <Box flexDirection="column">
            <Box>
              <Text color={colors.success}>✓ </Text>
              <Text>Repository: </Text>
              <Text color={colors.primary}>{repo}</Text>
            </Box>
            <Box>
              <Text color={colors.success}>✓ </Text>
              <Text>Task: </Text>
              <Text color={colors.text}>{task}</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={colors.primary} bold>? </Text>
              <Text>Start execution? </Text>
              <Text color={colors.muted}>(Y/n) </Text>
              <TextInput
                value=""
                onChange={() => {}}
                onSubmit={handleConfirm}
              />
            </Box>
          </Box>
        )}

        {/* Error display */}
        {error && (
          <Box marginTop={1}>
            <Text color={colors.error}>✗ {error}</Text>
          </Box>
        )}

        {/* Help text */}
        <Box marginTop={1}>
          <Text color={colors.muted}>Press </Text>
          <Text color={colors.mutedLight}>ESC</Text>
          <Text color={colors.muted}> to exit</Text>
        </Box>
      </Box>
    </Box>
  );
}

export default InteractiveMode;
