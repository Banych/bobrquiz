/**
 * Strategy pattern for calculating quiz answer scores based on speed.
 * Supports multiple algorithms: exponential decay, linear decay, and fixed points.
 */

export type ScoringAlgorithmType = 'EXPONENTIAL_DECAY' | 'LINEAR' | 'FIXED';

export interface ScoringStrategy {
  /**
   * Calculate the score for an answer based on time taken.
   * @param basePoints - The maximum points available for the question
   * @param timeTaken - Time taken to answer in seconds
   * @param totalTime - Total time limit for the question in seconds
   * @returns The calculated score (integer)
   */
  calculate(basePoints: number, timeTaken: number, totalTime: number): number;
}

/**
 * Exponential decay strategy: rewards speed exponentially.
 * Formula: basePoints * exp(-decayRate * (timeTaken / totalTime))
 *
 * Example with basePoints=100, totalTime=10s, decayRate=2.0:
 * - Answer in 2s: ~82 pts
 * - Answer in 5s: ~37 pts
 * - Answer in 8s: ~20 pts
 * - Answer in 10s: ~14 pts
 */
export class ExponentialDecayStrategy implements ScoringStrategy {
  constructor(private decayRate: number) {
    if (decayRate < 0.1 || decayRate > 5.0) {
      throw new Error('Decay rate must be between 0.1 and 5.0');
    }
  }

  calculate(basePoints: number, timeTaken: number, totalTime: number): number {
    if (basePoints <= 0) return 0;
    if (totalTime <= 0) return basePoints;
    if (timeTaken <= 0) return basePoints; // Instant answer gets full points

    const timeRatio = Math.min(timeTaken / totalTime, 1); // Cap at 1.0
    const score = basePoints * Math.exp(-this.decayRate * timeRatio);
    return Math.floor(score);
  }
}

/**
 * Linear decay strategy: balanced speed bonus.
 * Formula: basePoints * (0.5 + 0.5 * (1 - timeTaken / totalTime))
 *
 * Guarantees at least 50% of points, with linear bonus for speed.
 * Example with basePoints=100, totalTime=10s:
 * - Answer in 2s: 90 pts
 * - Answer in 5s: 75 pts
 * - Answer in 8s: 60 pts
 * - Answer in 10s: 50 pts
 */
export class LinearDecayStrategy implements ScoringStrategy {
  calculate(basePoints: number, timeTaken: number, totalTime: number): number {
    if (basePoints <= 0) return 0;
    if (totalTime <= 0) return basePoints;
    if (timeTaken <= 0) return basePoints;

    const timeRatio = Math.min(timeTaken / totalTime, 1);
    const remainingRatio = 1 - timeRatio;
    const score = basePoints * (0.5 + 0.5 * remainingRatio);
    return Math.floor(score);
  }
}

/**
 * Fixed points strategy: no speed adjustment.
 * Always returns the base points regardless of time taken.
 *
 * Use this for quizzes where time pressure shouldn't affect scoring,
 * or for backward compatibility with existing quizzes.
 */
export class FixedPointsStrategy implements ScoringStrategy {
  calculate(
    basePoints: number,

    timeTaken: number,

    totalTime: number
  ): number {
    return basePoints;
  }
}

/**
 * Factory method to create the appropriate scoring strategy.
 * @param algorithm - The scoring algorithm type
 * @param decayRate - The decay rate for exponential/linear strategies (default: 2.0)
 * @returns A concrete ScoringStrategy implementation
 */
export function createScoringStrategy(
  algorithm: ScoringAlgorithmType,
  decayRate?: number
): ScoringStrategy {
  switch (algorithm) {
    case 'EXPONENTIAL_DECAY':
      if (decayRate === undefined) {
        throw new Error(
          'Decay rate is required for EXPONENTIAL_DECAY algorithm'
        );
      }
      return new ExponentialDecayStrategy(decayRate);

    case 'LINEAR':
      // Linear doesn't use decay rate, but accept it for consistency
      return new LinearDecayStrategy();

    case 'FIXED':
      if (decayRate !== undefined) {
        throw new Error(
          'Decay rate should not be provided for FIXED algorithm'
        );
      }
      return new FixedPointsStrategy();

    default:
      throw new Error(`Unknown scoring algorithm: ${algorithm}`);
  }
}
