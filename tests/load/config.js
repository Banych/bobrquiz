// Shared configuration for k6 load tests
export const config = {
  // Base URL for API calls
  baseUrl: 'http://localhost:3000',

  // Quiz ID for testing (update with a valid quiz from your database)
  quizId: 'cml3yl1ql0000cwu7shf1los1', // Trivia Night Demo

  // Performance thresholds
  thresholds: {
    playerJoin: ['p(95)<500'], // 500ms P95 for player joins
    answerSubmit: ['p(95)<300'], // 300ms P95 for answer submissions
    heartbeat: ['p(95)<100'], // 100ms P95 for heartbeats
  },

  // Load test stages
  stages: {
    // Concurrent player joins: ramp up to 50 VUs over 2 minutes
    playerJoins: [
      { duration: '30s', target: 10 },
      { duration: '30s', target: 25 },
      { duration: '30s', target: 50 },
      { duration: '30s', target: 50 },
    ],

    // Answer submission storm: quick ramp to 50 VUs
    answerStorm: [
      { duration: '10s', target: 10 },
      { duration: '10s', target: 25 },
      { duration: '10s', target: 50 },
      { duration: '5s', target: 50 },
    ],

    // Heartbeat load: sustained 50 VUs for 5 minutes
    heartbeatLoad: [
      { duration: '1m', target: 50 },
      { duration: '5m', target: 50 },
    ],
  },
};

// Headers for host routes (start, advance), which need the quiz owner's session.
// HOST_COOKIE holds the Cookie header of a signed-in request from the quiz owner's browser
// (README: "Host session"). Throws only when a host route is about to be called without it.
export function hostHeaders() {
  const cookie = __ENV.HOST_COOKIE;
  if (!cookie) {
    throw new Error(
      'HOST_COOKIE is not set: host routes need the quiz owner session (tests/load/README.md, "Host session")'
    );
  }
  return { 'Content-Type': 'application/json', Cookie: cookie };
}

// Helper function to generate unique player names
export function generatePlayerName(prefix) {
  // Use __ITER if available (during test execution), otherwise just use timestamp
  // __ITER is not available in setup() function
  const iter = typeof __ITER !== 'undefined' ? __ITER : '';
  const timestamp = Date.now();
  return iter
    ? `Player_${prefix}_${iter}_${timestamp}`
    : `Player_${prefix}_${timestamp}`;
}
