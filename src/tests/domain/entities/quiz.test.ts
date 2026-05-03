import { Answer } from '@domain/entities/answer';
import { Question } from '@domain/entities/question';
import { Quiz, QuizStatus } from '@domain/entities/quiz';
import { describe, expect, it } from 'vitest';

describe('Quiz', () => {
  it('should initialize with the given attributes', () => {
    const questions = [new Question('q1', 'What is 2 + 2?', ['4'], 'text', 10)];
    const quiz = new Quiz('quiz1', 'Math Quiz', questions, {
      timePerQuestion: 30,
      allowSkipping: true,
    });

    expect(quiz.id).toBe('quiz1');
    expect(quiz.title).toBe('Math Quiz');
    expect(quiz.questions).toHaveLength(1);
    expect(quiz.players).toHaveLength(0);
    expect(quiz.status).toBe(QuizStatus.Pending);
    expect(quiz.currentQuestionIndex).toBe(0);
    expect(quiz.settings.timePerQuestion).toBe(30);
    expect(quiz.settings.allowSkipping).toBe(true);
  });

  it('should start the quiz', () => {
    const quiz = new Quiz('quiz1', 'Math Quiz', [], {
      timePerQuestion: 30,
      allowSkipping: true,
    });

    quiz.startQuiz();

    expect(quiz.status).toBe(QuizStatus.Active);
    expect(quiz.startTime).toBeDefined();
  });

  it('should throw an error if starting a quiz that is not in Pending status', () => {
    const quiz = new Quiz('quiz1', 'Math Quiz', [], {
      timePerQuestion: 30,
      allowSkipping: true,
    });

    quiz.startQuiz();

    expect(() => quiz.startQuiz()).toThrow(
      'Quiz can only be started if it is in Pending status.'
    );
  });

  it('should end the quiz', () => {
    const quiz = new Quiz('quiz1', 'Math Quiz', [], {
      timePerQuestion: 30,
      allowSkipping: true,
    });

    quiz.startQuiz();
    quiz.endQuiz();

    expect(quiz.status).toBe(QuizStatus.Completed);
    expect(quiz.endTime).toBeDefined();
  });

  it('should throw an error if ending a quiz that is not in Active status', () => {
    const quiz = new Quiz('quiz1', 'Math Quiz', [], {
      timePerQuestion: 30,
      allowSkipping: true,
    });

    expect(() => quiz.endQuiz()).toThrow(
      'Quiz can only be ended if it is in Active status.'
    );
  });

  it('should add a player to the quiz', () => {
    const quiz = new Quiz('quiz1', 'Math Quiz', [], {
      timePerQuestion: 30,
      allowSkipping: true,
    });

    const playerId = 'p1';
    quiz.addPlayer(playerId);

    expect(quiz.players).toHaveLength(1);
    expect(quiz.players).toContain(playerId);
  });

  it('should remove a player from the quiz', () => {
    const quiz = new Quiz('quiz1', 'Math Quiz', [], {
      timePerQuestion: 30,
      allowSkipping: true,
    });

    const playerId = 'p1';
    quiz.addPlayer(playerId);
    quiz.removePlayer(playerId);

    expect(quiz.players).toHaveLength(0);
  });

  it('should move to the next question', () => {
    const questions = [
      new Question('q1', 'What is 2 + 2?', ['4'], 'text', 10),
      new Question('q2', 'What is 3 + 3?', ['6'], 'text', 10),
    ];
    const quiz = new Quiz('quiz1', 'Math Quiz', questions, {
      timePerQuestion: 30,
      allowSkipping: true,
    });

    const nextQuestion = quiz.nextQuestion();

    expect(quiz.currentQuestionIndex).toBe(1);
    expect(nextQuestion).toBe(questions[1]);
  });

  it('should return null if there are no more questions', () => {
    const questions = [new Question('q1', 'What is 2 + 2?', ['4'], 'text', 10)];
    const quiz = new Quiz('quiz1', 'Math Quiz', questions, {
      timePerQuestion: 30,
      allowSkipping: true,
    });

    quiz.nextQuestion();
    const nextQuestion = quiz.nextQuestion();

    expect(nextQuestion).toBeNull();
  });

  it('should reset a completed quiz back to Pending', () => {
    const quiz = new Quiz('q1', 'Test', [], {
      timePerQuestion: 30,
      allowSkipping: true,
    });
    quiz.startQuiz();
    quiz.endQuiz();
    quiz.reset();
    expect(quiz.status).toBe(QuizStatus.Pending);
    expect(quiz.startTime).toBeUndefined();
    expect(quiz.endTime).toBeUndefined();
    expect(quiz.currentQuestionIndex).toBe(0);
  });

  it('should reset an active quiz back to Pending', () => {
    const quiz = new Quiz('q1', 'Test', [], {
      timePerQuestion: 30,
      allowSkipping: true,
    });
    quiz.startQuiz();
    quiz.reset();
    expect(quiz.status).toBe(QuizStatus.Pending);
  });

  it('should throw when resetting a quiz already in Pending status', () => {
    const quiz = new Quiz('q1', 'Test', [], {
      timePerQuestion: 30,
      allowSkipping: true,
    });
    expect(() => quiz.reset()).toThrow(
      'Quiz can only be reset if it is in Active or Completed status.'
    );
  });

  it('should submit an answer and update the answers map', () => {
    const question = new Question('q1', 'What is 2 + 2?', ['4'], 'text', 10);
    const quiz = new Quiz('quiz1', 'Math Quiz', [question], {
      timePerQuestion: 30,
      allowSkipping: true,
    });

    quiz.addPlayer('p1');
    quiz.startQuiz();

    const answer = new Answer('a1', 'p1', 'q1', '4', new Date());
    answer.markCorrect(10);

    quiz.submitAnswer('p1', answer);

    const answers = quiz.answers.get('p1');
    expect(answers).toBeDefined();
    expect(answers?.length).toBe(1);
    expect(answers?.[0].questionId).toBe('q1');
    expect(answers?.[0].value).toBe('4');
    expect(answers?.[0].isCorrect).toBe(true);
  });
});
