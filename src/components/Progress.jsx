import { useState } from 'react';

const QUESTIONS_KEY = 'falconry_questions';
const REVIEW_KEY = 'falconry_review_progress';
const TEST_HISTORY_KEY = 'falconry_test_history';

// Read data safely from localStorage.
function readStorage(key, fallback) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

function formatDate(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : date.toLocaleDateString();
}

function Progress() {
  const [data] = useState(() => ({
    cards: readStorage(QUESTIONS_KEY, []),
    reviews: readStorage(REVIEW_KEY, {}),
    history: readStorage(TEST_HISTORY_KEY, []),
  }));

  const cards = Array.isArray(data.cards) ? data.cards : [];

  const reviews =
    data.reviews &&
    typeof data.reviews === 'object' &&
    !Array.isArray(data.reviews)
      ? data.reviews
      : {};

  const history = Array.isArray(data.history) ? data.history : [];

  // -----------------------
  // FLASHCARD STATISTICS
  // -----------------------

  const totalCards = cards.length;

  const reviewedCards = cards.filter((card) => {
    return (reviews[card.id]?.reviews || 0) > 0;
  }).length;

  const dueCards = cards.filter((card) => {
    const dueAt = reviews[card.id]?.dueAt;

    if (!dueAt) return true;

    const dueTime = new Date(dueAt).getTime();

    return !Number.isFinite(dueTime) || dueTime <= Date.now();
  }).length;

  const studiedPercentage = totalCards
    ? Math.round((reviewedCards / totalCards) * 100)
    : 0;

  // -----------------------
  // PRACTICE TEST STATISTICS
  // -----------------------

  const scores = history
    .filter((test) => Number.isFinite(test?.score))
    .map((test) => test.score);

  const totalTests = scores.length;

  const averageScore = totalTests
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / totalTests)
    : null;

  const bestScore = totalTests ? Math.max(...scores) : null;

  const recentTests = history.slice(-5).reverse();

  // -----------------------
  // DIFFICULT CARDS
  // -----------------------

  const difficultCards = cards
    .map((card) => {
      // Times marked Again during reviews.
      const reviewMisses = reviews[card.id]?.missed || 0;

      // Times missed on practice tests.
      const testMisses = history.reduce((total, test) => {
        const missed = Array.isArray(test.missedIds) ? test.missedIds : [];

        return (
          total + (missed.some((id) => String(id) === String(card.id)) ? 1 : 0)
        );
      }, 0);

      return {
        ...card,
        mistakes: reviewMisses + testMisses,
      };
    })
    .filter((card) => card.mistakes > 0)
    .sort((a, b) => b.mistakes - a.mistakes)
    .slice(0, 5);

  const stats = [
    {
      label: 'Total Cards',
      value: totalCards,
      icon: '',
    },
    {
      label: 'Cards Reviewed',
      value: reviewedCards,
      icon: '',
    },
    {
      label: 'Due for Review',
      value: dueCards,
      icon: '',
    },
    {
      label: 'Tests Completed',
      value: totalTests,
      icon: '',
    },
  ];

  return (
    <div className='progress-page'>
      <h2>Your Progress</h2>

      <p className='progress-description'>
        Track your falconry exam preparation.
      </p>

      {/* Statistics */}

      <div className='progress-stats'>
        {stats.map((stat) => (
          <div key={stat.label} className='progress-stat-card'>
            <span className='progress-stat-icon'>{stat.icon}</span>

            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Flashcard Completion */}

      <section className='progress-section'>
        <h3>Flashcard Progress</h3>

        <div className='progress-row'>
          <span>Cards Studied</span>
          <strong>{studiedPercentage}%</strong>
        </div>

        <div className='progress-bar'>
          <div
            style={{
              width: `${studiedPercentage}%`,
            }}
          />
        </div>

        <p>
          {reviewedCards} of {totalCards} cards reviewed at least once.
        </p>
      </section>

      {/* Practice Test Scores */}

      <section className='progress-section'>
        <h3>Practice Test Performance</h3>

        <div className='progress-score-grid'>
          <div>
            <span>Average Score</span>
            <strong>{averageScore === null ? '—' : `${averageScore}%`}</strong>
          </div>

          <div>
            <span>Best Score</span>
            <strong>{bestScore === null ? '—' : `${bestScore}%`}</strong>
          </div>
        </div>

        <h4>Recent Tests</h4>

        {recentTests.length === 0 ? (
          <p>No practice tests completed yet.</p>
        ) : (
          <div className='progress-test-history'>
            {recentTests.map((test, index) => (
              <div key={`${test.date}-${index}`} className='progress-test-item'>
                <div>
                  <strong>{formatDate(test.date)}</strong>

                  <span>
                    {test.correct} / {test.total} correct
                  </span>
                </div>

                <strong>{test.score}%</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Cards Needing Attention */}

      <section className='progress-section'>
        <h3>Cards Needing Attention</h3>

        <p>Cards you've missed during reviews or practice tests.</p>

        {difficultCards.length === 0 ? (
          <p>No missed cards recorded yet.</p>
        ) : (
          <div className='difficult-cards'>
            {difficultCards.map((card) => (
              <div key={card.id} className='difficult-card'>
                <div>
                  <strong>#{card.id}</strong>

                  <p>
                    {card.type === 'definition' ? card.term : card.question}
                  </p>
                </div>

                <span>{card.mistakes} missed</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Progress;
