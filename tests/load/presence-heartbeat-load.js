import http from 'k6/http';
import { check, sleep } from 'k6';
import { config, generatePlayerName, hostHeaders } from './config.js';

// Test options
export const options = {
  stages: config.stages.heartbeatLoad,
  thresholds: {
    'http_req_duration{operation:heartbeat}': config.thresholds.heartbeat,
    http_req_failed: ['rate<0.01'],
  },
  setupTimeout: '120s', // Allow time for 25 player creation on dev server
};

// Test setup: Create players
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
      const playerName = generatePlayerName(`Heartbeat_${playerIndex}`);

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

  // Ensure quiz is started (heartbeats may require Active state)
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

  console.log('✓ Starting 5-minute heartbeat test...');

  return { quizId, players };
}

// Main test scenario: Send heartbeat every 30s
export default function (data) {
  const { quizId, players } = data;

  // Each VU represents one player
  const playerIndex = (__VU - 1) % players.length;
  const player = players[playerIndex];

  if (!player) {
    console.error('No player available for VU', __VU);
    return;
  }

  // Send presence heartbeat
  const heartbeatRes = http.post(
    `${config.baseUrl}/api/quiz/${quizId}/player/${player.playerId}/presence`,
    JSON.stringify({
      timestamp: new Date().toISOString(),
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'heartbeat' },
    }
  );

  // Verify heartbeat
  check(heartbeatRes, {
    'heartbeat status is 200': (r) => r.status === 200,
    'heartbeat latency <100ms': (r) => r.timings.duration < 100,
  });

  if (heartbeatRes.status !== 200) {
    console.error(
      `Player ${player.playerName} heartbeat failed: ${heartbeatRes.status}`
    );
  }

  // Wait 30 seconds before next heartbeat (matching production interval)
  sleep(30);
}

// Test teardown
export function teardown(data) {
  console.log('\n=== Presence Heartbeat Load Test Complete ===');
  console.log(`Quiz ID: ${data.quizId}`);
  console.log(`Players tested: ${data.players.length}`);
  console.log('Duration: 5 minutes + ramp up/down');
}
