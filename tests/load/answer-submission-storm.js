import http from 'k6/http';
import { check, sleep } from 'k6';
import { config, generatePlayerName, hostHeaders } from './config.js';

// Test options
export const options = {
  stages: config.stages.answerStorm,
  thresholds: {
    'http_req_duration{operation:submit_answer}':
      config.thresholds.answerSubmit,
    http_req_failed: ['rate<0.01'],
  },
  setupTimeout: '120s', // Allow time for player creation on dev server
};

// Test setup: Create players and start quiz
export function setup() {
  const quizId = config.quizId;
  if (quizId === 'UPDATE_ME') {
    throw new Error('Please update QUIZ_ID in config.js');
  }

  // Verify quiz exists
  const quizRes = http.get(`${config.baseUrl}/api/quiz/${quizId}/state`);
  if (quizRes.status !== 200) {
    throw new Error(`Quiz ${quizId} not found`);
  }

  const quiz = JSON.parse(quizRes.body);
  console.log(`✓ Using quiz: ${quiz.title}`);

  // Pre-create players in batches (reduced to 25 for dev server capacity)
  const totalPlayers = 25;
  const batchSize = 5;
  const players = [];

  console.log(`Creating ${totalPlayers} players in batches of ${batchSize}...`);

  for (
    let batchIndex = 0;
    batchIndex < totalPlayers / batchSize;
    batchIndex++
  ) {
    const batchRequests = [];

    for (let i = 0; i < batchSize; i++) {
      const playerIndex = batchIndex * batchSize + i + 1;
      const playerName = generatePlayerName(`Storm_${playerIndex}`);

      batchRequests.push([
        'POST',
        `${config.baseUrl}/api/player/add`,
        JSON.stringify({ quizId, playerName }),
        { headers: { 'Content-Type': 'application/json' } },
      ]);
    }

    const responses = http.batch(batchRequests);

    responses.forEach((joinRes) => {
      if (joinRes.status === 200) {
        const { player } = JSON.parse(joinRes.body);
        players.push({ playerId: player.id, playerName: player.name });
      }
    });

    console.log(
      `  Batch ${batchIndex + 1}/${totalPlayers / batchSize}: ${players.length} players created`
    );
  }

  console.log(`✓ Created ${players.length} players total`);

  // Check if quiz needs to be started
  const stateRes = http.get(`${config.baseUrl}/api/quiz/${quizId}/state`);
  const currentState = JSON.parse(stateRes.body);

  if (currentState.status !== 'Active') {
    console.log(`Quiz status: ${currentState.status} - starting quiz...`);
    const startRes = http.post(
      `${config.baseUrl}/api/quiz/start`,
      JSON.stringify({ quizId }),
      { headers: hostHeaders() }
    );

    if (startRes.status !== 200) {
      throw new Error(
        `Failed to start quiz: ${startRes.status} - ${startRes.body}`
      );
    }
    console.log('✓ Quiz started successfully');
  } else {
    console.log('✓ Quiz already Active');
  }

  // Get current question
  let quizState = JSON.parse(
    http.get(`${config.baseUrl}/api/quiz/${quizId}/state`).body
  );
  console.log(`✓ New quiz status: ${quizState.status}`);

  // Get current question from questions array using currentQuestionIndex
  let currentQuestion = quizState.questions[quizState.currentQuestionIndex];
  console.log(`✓ Current question: ${currentQuestion?.text}`);

  // If no current question, advance to first question
  if (!currentQuestion) {
    console.log('Advancing to first question...');
    const advanceRes = http.post(
      `${config.baseUrl}/api/quiz/${quizId}/advance`,
      JSON.stringify({}),
      { headers: hostHeaders() }
    );

    if (advanceRes.status === 200) {
      console.log('✓ Advanced to first question');
      // Use the quiz state returned by advance endpoint
      quizState = JSON.parse(advanceRes.body);
      currentQuestion = quizState.questions[quizState.currentQuestionIndex];
    } else {
      throw new Error(
        `Failed to advance quiz: ${advanceRes.status} - ${advanceRes.body}`
      );
    }
  }

  if (!currentQuestion) {
    throw new Error(
      `Quiz has no active question after advance (index: ${quizState.currentQuestionIndex}, total questions: ${quizState.questions.length})`
    );
  }

  const question = currentQuestion;
  console.log(`✓ Question type: ${question.type}`);
  console.log(`✓ Options: ${JSON.stringify(question.options)}`);

  // Determine correct answer based on question type
  let correctAnswer;
  if (question.type === 'multiple-choice') {
    correctAnswer = question.options[0]; // Use first option
  } else if (question.type === 'true-false') {
    correctAnswer = 'true';
  } else {
    correctAnswer = 'Answer text';
  }

  return { quizId, players, questionId: question.id, correctAnswer };
}

// Main test scenario: Submit answers rapidly
export default function (data) {
  const { quizId, players, questionId, correctAnswer } = data;

  // Each VU represents one player
  const playerIndex = (__VU - 1) % players.length;
  const player = players[playerIndex];

  if (!player) {
    console.error('No player available for VU', __VU);
    return;
  }

  // Submit answer
  const submitRes = http.post(
    `${config.baseUrl}/api/player/answer`,
    JSON.stringify({
      quizId,
      playerId: player.playerId,
      questionId,
      answer: correctAnswer,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'submit_answer' },
    }
  );

  // Verify submission
  check(submitRes, {
    'submit status is 200': (r) => r.status === 200,
    'submit has result': (r) => {
      if (!r || !r.body) return false; // Handle timeout/null responses
      try {
        const body = JSON.parse(r.body);
        return body.status === 'submitted' && body.isCorrect !== undefined;
      } catch {
        return false;
      }
    },
    'submit latency <300ms': (r) => r && r.timings && r.timings.duration < 300,
  });

  if (submitRes.status !== 200) {
    console.error(
      `Player ${player.playerName} answer failed: ${submitRes.status}`
    );
  }

  sleep(1);
}

// Test teardown
export function teardown(data) {
  console.log('\n=== Answer Submission Storm Test Complete ===');
  console.log(`Quiz ID: ${data.quizId}`);
  console.log(`Players tested: ${data.players.length}`);
}
