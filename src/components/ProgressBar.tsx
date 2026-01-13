import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

/**
 * Progress bar style types
 */
export type ProgressBarStyle = 'spinner' | 'bar' | 'dots';

/**
 * Animation frame configurations for different styles
 */
const ANIMATION_FRAMES = {
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  dots: ['   ', '.  ', '.. ', '...'],
} as const;

/**
 * Props for the ProgressBar component
 */
export interface ProgressBarProps {
  /**
   * Progress percentage (0-100)
   */
  progress: number;

  /**
   * Style of the progress indicator
   * @default 'bar'
   */
  style?: ProgressBarStyle;

  /**
   * Width of the progress bar (in characters)
   * @default 30
   */
  width?: number;

  /**
   * Animation speed in milliseconds
   * @default 80
   */
  animationSpeed?: number;

  /**
   * Whether to disable animations
   * @default false
   */
  disableAnimation?: boolean;

  /**
   * Optional label to display before the progress bar
   */
  label?: string;

  /**
   * Whether to show percentage text
   * @default true
   */
  showPercentage?: boolean;
}

/**
 * ASCII Progress Bar Component
 *
 * Displays an animated progress indicator with configurable styles.
 * Supports spinner, bar, and dots animations.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  style = 'bar',
  width = 30,
  animationSpeed = 80,
  disableAnimation = false,
  label,
  showPercentage = true,
}) => {
  const [frameIndex, setFrameIndex] = useState(0);

  // Clamp progress between 0 and 100
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const percentage = Math.round(clampedProgress);

  // Animation effect
  useEffect(() => {
    if (disableAnimation || style === 'bar') {
      return;
    }

    const frames = ANIMATION_FRAMES[style];
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, animationSpeed);

    return () => clearInterval(interval);
  }, [style, animationSpeed, disableAnimation]);

  /**
   * Renders a bar-style progress indicator
   */
  const renderBar = () => {
    const filledWidth = Math.round((width * clampedProgress) / 100);
    const emptyWidth = width - filledWidth;

    const filled = '█'.repeat(filledWidth);
    const empty = '░'.repeat(emptyWidth);

    return (
      <Text color={colors.primary}>
        [{filled}
        <Text color={colors.mutedDark}>{empty}</Text>
        ]
      </Text>
    );
  };

  /**
   * Renders a spinner-style progress indicator
   */
  const renderSpinner = () => {
    const frames = ANIMATION_FRAMES.spinner;
    const frame = disableAnimation ? frames[0] : frames[frameIndex];

    return (
      <Text color={colors.primary}>
        {frame}
      </Text>
    );
  };

  /**
   * Renders a dots-style progress indicator
   */
  const renderDots = () => {
    const frames = ANIMATION_FRAMES.dots;
    const frame = disableAnimation ? frames[0] : frames[frameIndex];

    return (
      <Text color={colors.primary}>
        {frame}
      </Text>
    );
  };

  /**
   * Renders the appropriate style
   */
  const renderProgress = () => {
    switch (style) {
      case 'spinner':
        return renderSpinner();
      case 'dots':
        return renderDots();
      case 'bar':
      default:
        return renderBar();
    }
  };

  return (
    <Box>
      {label && (
        <Text color={colors.text}>
          {label}{' '}
        </Text>
      )}
      {renderProgress()}
      {showPercentage && style === 'bar' && (
        <Text color={colors.textDim}>
          {' '}{percentage}%
        </Text>
      )}
    </Box>
  );
};
