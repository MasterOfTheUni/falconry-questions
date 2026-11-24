import { useState } from 'react';

const QUESTIONS_KEY = 'falconry_questions';
const REVIEW_KEY = 'falconry_review_progress';

const DAY = 24 * 60 * 60 * 1000;

// Load saved flashcards
function loadCards() {
  try {
    const data = JSON.parse(localStorage.getItem(QUESTIONS_KEY) || '[]');

    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error loading flashcards:', error);
    return [];
  }
}

// Load saved review history
function loadProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}');

    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (error) {
    console.error('Error loading review progress:', error);
    return {};
  }
}

// Find cards ready for review
function getReviewQueue(cards, progress, onlyDue = true) {
  const now = Date.now();

  return cards
    .filter((card) => {
      if (card.id == null) return false;

      if (!onlyDue) return true;

      const dueAt = progress[card.id]?.dueAt;

      if (!dueAt) return true;

      const dueTime = new Date(dueAt).getTime();

      return !Number.isFinite(dueTime) || dueTime <= now;
    })
    .sort((a, b) => {
      const aMissed = progress[a.id]?.lastRating === 'again' ? 0 : 1;

      const bMissed = progress[b.id]?.lastRating === 'again' ? 0 : 1;

      return aMissed - bMissed;
    })
    .map((card) => card.id);
}

function Review() {
  const [cards] = useState(loadCards);
  const [progress, setProgress] = useState(loadProgress);

  const [queue, setQueue] = useState(() => getReviewQueue(cards, progress));

  const [showAnswer, setShowAnswer] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('due');
  const [reviewedCount, setReviewedCount] = useState(0);

  const card = cards.find((c) => c.id === queue[0]);

  // Start a new review session
  const startSession = (newMode) => {
    setMode(newMode);

    setQueue(getReviewQueue(cards, progress, newMode === 'due'));

    setShowAnswer(false);
    setReviewedCount(0);
    setError('');
  };

  // Calculate the next review interval
  const calculateInterval = (rating, previousDays = 0) => {
    switch (rating) {
      case 'again':
        return 0;

      case 'hard':
        return Math.max(1, Math.ceil(previousDays * 1.2));

      case 'good':
        return Math.max(3, Math.ceil(previousDays * 2));

      case 'easy':
        return Math.max(7, Math.ceil(previousDays * 3));

      default:
        return 1;
    }
  };

  // Save the review result
  const rateCard = (rating) => {
    if (!card || !showAnswer) return;

    const previous = progress[card.id] || {};
    const now = Date.now();

    const intervalDays = calculateInterval(rating, previous.intervalDays || 0);

    const updatedProgress = {
      ...progress,

      [card.id]: {
        reviews: (previous.reviews || 0) + 1,

        missed: (previous.missed || 0) + (rating === 'again' ? 1 : 0),

        lastRating: rating,
        intervalDays,

        lastReviewedAt: new Date(now).toISOString(),

        dueAt: new Date(now + intervalDays * DAY).toISOString(),
      },
    };

    try {
      localStorage.setItem(REVIEW_KEY, JSON.stringify(updatedProgress));
    } catch (error) {
      console.error('Error saving review:', error);
      setError('Could not save review progress.');
      return;
    }

    setProgress(updatedProgress);
    setReviewedCount((count) => count + 1);

    // Put missed cards at the end of the queue
    setQueue((current) => {
      const remaining = current.slice(1);

      if (rating === 'again') {
        return [...remaining, card.id];
      }

      return remaining;
    });

    setShowAnswer(false);
    setError('');
  };

  return (
    <div className='review-page'>
      <h2>Review Flashcards</h2>

      <p className='review-description'>
        Reveal each answer, then rate how well you remembered it.
      </p>

      {/* Review Mode */}
      <div className='review-controls'>
        <button
          className={mode === 'due' ? 'selected' : ''}
          onClick={() => startSession('due')}
        >
          Due Cards
        </button>

        <button
          className={mode === 'all' ? 'selected' : ''}
          onClick={() => startSession('all')}
        >
          Study All
        </button>
      </div>

      {error && <p className='error'>{error}</p>}

      {cards.length === 0 ? (
        <p>
          No flashcards found. Add or import your questions from the Flashcards
          section first.
        </p>
      ) : !card ? (
        <div className='review-complete'>
          <h3>🎉 You're all caught up!</h3>

          <p>You reviewed {reviewedCount} cards this session.</p>

          <button onClick={() => startSession('all')}>
            Practice All Cards
          </button>
        </div>
      ) : (
        <>
          {/* Review Progress */}
          <div className='review-count'>{queue.length} cards remaining</div>

          {/* Current Flashcard */}
          <div className='review-card'>
            <small>Question #{card.id}</small>

            {!showAnswer ? (
              <>
                <h3>
                  {card.type === 'definition'
                    ? `Define: ${card.term}`
                    : card.question}
                </h3>

                {card.type === 'multiple_choice' && (
                  <div className='review-options'>
                    {Object.entries(card.options || {}).map(
                      ([letter, option]) => (
                        <p key={letter}>
                          <strong>{letter.toUpperCase()}.</strong> {option}
                        </p>
                      ),
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <h3>Answer</h3>

                <p className='review-answer'>
                  {card.type === 'definition'
                    ? card.definition
                    : card.correctAnswerText}
                </p>

                {card.explanation && (
                  <p className='review-explanation'>{card.explanation}</p>
                )}
              </>
            )}
          </div>

          {/* Reveal Answer */}
          {!showAnswer ? (
            <button
              className='review-reveal'
              onClick={() => setShowAnswer(true)}
            >
              Reveal Answer
            </button>
          ) : (
            <>
              <p className='review-prompt'>How well did you remember?</p>

              <div className='review-rating-buttons'>
                <button className='again' onClick={() => rateCard('again')}>
                  Again
                </button>

                <button className='hard' onClick={() => rateCard('hard')}>
                  Hard
                </button>

                <button className='good' onClick={() => rateCard('good')}>
                  Good
                </button>

                <button className='easy' onClick={() => rateCard('easy')}>
                  Easy
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Review;
