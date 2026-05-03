import { Question } from '@domain/entities/question';
import { Answer } from '@domain/entities/answer';
import {
  createScoringStrategy,
  type ScoringStrategy,
  type ScoringAlgorithmType,
} from '@domain/value-objects/scoring-strategy';

export enum QuizStatus {
  Active = 'Active',
  Pending = 'Pending',
  Completed = 'Completed',
}

export class Quiz {
  id: string;
  title: string;
  questions: Question[];
  players: Set<string>;
  status: QuizStatus;
  currentQuestionIndex: number;
  startTime?: Date;
  endTime?: Date;
  settings: QuizSettings;
  answers: Map<string, Answer[]>;
  joinCode?: string;

  constructor(
    id: string,
    title: string,
    questions: Question[],
    settings: QuizSettings,
    options?: {
      joinCode?: string;
    }
  ) {
    // Validate scoring settings
    this.validateScoringSettings(settings);

    this.id = id;
    this.title = title;
    this.questions = questions;
    this.players = new Set();
    this.status = QuizStatus.Pending;
    this.currentQuestionIndex = 0;
    this.settings = settings;
    this.answers = new Map();
    this.joinCode = options?.joinCode;
  }

  private validateScoringSettings(settings: QuizSettings): void {
    const { scoringAlgorithm, scoringDecayRate } = settings;

    // Validate that decay rate is only provided for algorithms that use it
    if (scoringAlgorithm === 'FIXED' && scoringDecayRate !== undefined) {
      throw new Error(
        'Decay rate should not be provided for FIXED scoring algorithm'
      );
    }

    // Validate that decay rate is provided for algorithms that require it
    if (
      (scoringAlgorithm === 'EXPONENTIAL_DECAY' ||
        scoringAlgorithm === 'LINEAR') &&
      (scoringDecayRate === undefined || scoringDecayRate === null)
    ) {
      throw new Error(
        `Decay rate is required for ${scoringAlgorithm} scoring algorithm`
      );
    }

    // Validate decay rate bounds
    if (scoringDecayRate !== undefined && scoringDecayRate !== null) {
      if (scoringDecayRate < 0.1 || scoringDecayRate > 5.0) {
        throw new Error('Decay rate must be between 0.1 and 5.0');
      }
    }
  }

  getScoringStrategy(): ScoringStrategy {
    const { scoringAlgorithm, scoringDecayRate } = this.settings;
    return createScoringStrategy(
      scoringAlgorithm || 'EXPONENTIAL_DECAY',
      scoringDecayRate
    );
  }

  startQuiz(): void {
    if (this.status !== QuizStatus.Pending) {
      throw new Error('Quiz can only be started if it is in Pending status.');
    }
    this.status = QuizStatus.Active;
    this.startTime = new Date();
  }

  endQuiz(): void {
    if (this.status !== QuizStatus.Active) {
      throw new Error('Quiz can only be ended if it is in Active status.');
    }
    this.status = QuizStatus.Completed;
    this.endTime = new Date();
  }

  addPlayer(playerId: string): void {
    this.players.add(playerId);
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.answers.delete(playerId);
  }

  submitAnswer(playerId: string, answer: Answer): void {
    if (!this.players.has(playerId)) {
      throw new Error('Player is not part of this quiz.');
    }

    if (!this.answers.has(playerId)) {
      this.answers.set(playerId, []);
    }

    this.answers.get(playerId)!.push(answer);
  }

  calculateScores(): Map<string, number> {
    const scores = new Map<string, number>();

    for (const [playerId, answers] of this.answers.entries()) {
      const totalScore = answers
        .filter((answer) => answer.isCorrect)
        .reduce((sum, answer) => sum + (answer.points || 0), 0);
      scores.set(playerId, totalScore);
    }

    return scores;
  }

  reset(): void {
    if (
      this.status !== QuizStatus.Active &&
      this.status !== QuizStatus.Completed
    ) {
      throw new Error(
        'Quiz can only be reset if it is in Active or Completed status.'
      );
    }
    this.status = QuizStatus.Pending;
    this.startTime = undefined;
    this.endTime = undefined;
    this.currentQuestionIndex = 0;
    this.answers = new Map();
    for (const question of this.questions) {
      question.answersLockedAt = undefined;
    }
  }

  nextQuestion(): Question | null {
    if (this.currentQuestionIndex < this.questions.length - 1) {
      this.currentQuestionIndex++;
      return this.questions[this.currentQuestionIndex];
    }
    return null;
  }
}

export interface QuizSettings {
  timePerQuestion: number;
  allowSkipping: boolean;
  scoringAlgorithm?: ScoringAlgorithmType;
  scoringDecayRate?: number;
}
