import { useState } from 'react';

const QUESTIONS_KEY = 'falconry_questions';
const TEST_HISTORY_KEY = 'falconry_test_history';

// Load questions from localStorage.
function loadQuestions() {
  try {
    const data = JSON.parse(localStorage.getItem(QUESTIONS_KEY) || '[]');

    if (!Array.isArray(data)) return [];

    // Only include valid multiple-choice questions.
    return data.filter((q) => {
      return (
        q.type === 'multiple_choice' &&
        q.id != null &&
        q.question?.trim() &&
        q.options &&
        Object.keys(q.options).length >= 2 &&
        q.options[q.correctAnswer]
      );
    });
  } catch {
    return [];
  }
}

// Shuffle without changing the original array.
function shuffleQuestions(questions) {
  const shuffled = [...questions];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function PracticeTest() {
  const [questions] = useState(loadQuestions);

  const [testSize, setTestSize] = useState('10');
  const [test, setTest] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState(null);
  const [showAllResults, setShowAllResults] = useState(false);

  const currentQuestion = test[currentIndex];

  const answeredCount = test.filter((q) => answers[q.id] !== undefined).length;

  // Create a new randomized practice test.
  const startTest = () => {
    const shuffled = shuffleQuestions(questions);

    const count =
      testSize === 'all'
        ? shuffled.length
        : Math.min(Number(testSize), shuffled.length);

    setTest(shuffled.slice(0, count));
    setCurrentIndex(0);
    setAnswers({});
    setResults(null);
    setShowAllResults(false);
  };

  // Record the selected answer.
  const selectAnswer = (letter) => {
    setAnswers((previous) => ({
      ...previous,
      [currentQuestion.id]: letter,
    }));
  };

  // Grade the completed test.
  const submitTest = () => {
    if (answeredCount !== test.length || !test.length) {
      return;
    }

    const graded = test.map((question) => {
      const selectedAnswer = answers[question.id];

      return {
        ...question,
        selectedAnswer,
        isCorrect: selectedAnswer === question.correctAnswer,
      };
    });

    const correct = graded.filter((q) => q.isCorrect).length;

    const score = Math.round((correct / test.length) * 100);

    const result = {
      total: test.length,
      correct,
      score,
      questions: graded,
    };

    setResults(result);

    // Save test results for our future Progress screen.
    try {
      const history = JSON.parse(
        localStorage.getItem(TEST_HISTORY_KEY) || '[]',
      );

      const newEntry = {
        date: new Date().toISOString(),
        total: test.length,
        correct,
        score,
        missedIds: graded.filter((q) => !q.isCorrect).map((q) => q.id),
      };

      const updatedHistory = [
        ...(Array.isArray(history) ? history : []),
        newEntry,
      ];

      localStorage.setItem(TEST_HISTORY_KEY, JSON.stringify(updatedHistory));
    } catch (error) {
      console.error('Could not save test history:', error);
    }
  };

  // Return to test setup.
  const resetTest = () => {
    setTest([]);
    setAnswers({});
    setResults(null);
    setCurrentIndex(0);
    setShowAllResults(false);
  };

  // -------------------------------
  // TEST SETUP
  // -------------------------------

  if (test.length === 0) {
    return (
      <div className='practice-test'>
        <h2>Practice Test</h2>

        <p>
          Test your falconry knowledge with randomly selected multiple-choice
          questions.
        </p>

        <div className='test-setup'>
          <h3>Start a Practice Exam</h3>

          <p>{questions.length} multiple-choice questions available.</p>

          <label htmlFor='test-size'>Number of Questions</label>

          <select
            id='test-size'
            value={testSize}
            onChange={(e) => setTestSize(e.target.value)}
          >
            <option value='5'>5 Questions</option>
            <option value='10'>10 Questions</option>
            <option value='20'>20 Questions</option>
            <option value='all'>All Questions</option>
          </select>

          <button
            className='test-primary-button'
            onClick={startTest}
            disabled={questions.length === 0}
          >
            Start Test
          </button>

          {questions.length === 0 && (
            <p>
              No valid multiple-choice questions found. Import your questions in
              Flashcards first.
            </p>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------
  // TEST RESULTS
  // -------------------------------

  if (results) {
    const missed = results.questions.filter((q) => !q.isCorrect);

    const displayedQuestions = showAllResults ? results.questions : missed;

    return (
      <div className='practice-test'>
        <h2>Test Results</h2>

        <div className='test-results'>
          <div className='test-score'>{results.score}%</div>

          <h3>
            {results.correct} / {results.total} Correct
          </h3>

          <p>
            {results.score === 100
              ? 'Perfect score! Excellent work!'
              : 'Review the questions you missed below.'}
          </p>
        </div>

        <div className='test-result-controls'>
          <button onClick={() => setShowAllResults(!showAllResults)}>
            {showAllResults ? 'Show Missed Only' : 'Show All Answers'}
          </button>
        </div>

        <div className='test-review-list'>
          {displayedQuestions.length === 0 ? (
            <p>No missed questions!</p>
          ) : (
            displayedQuestions.map((q) => (
              <div
                key={q.id}
                className={`test-review-item ${
                  q.isCorrect ? 'correct' : 'incorrect'
                }`}
              >
                <strong>
                  #{q.id} — {q.question}
                </strong>

                <p>
                  Your answer:{' '}
                  <span>
                    {q.selectedAnswer.toUpperCase()}.{' '}
                    {q.options[q.selectedAnswer]}
                  </span>
                </p>

                <p>
                  Correct answer:{' '}
                  <strong>
                    {q.correctAnswer.toUpperCase()}.{' '}
                    {q.options[q.correctAnswer]}
                  </strong>
                </p>

                {q.explanation && (
                  <p className='test-explanation'>{q.explanation}</p>
                )}
              </div>
            ))
          )}
        </div>

        <button className='test-primary-button' onClick={resetTest}>
          New Practice Test
        </button>
      </div>
    );
  }

  // -------------------------------
  // ACTIVE TEST
  // -------------------------------

  return (
    <div className='practice-test'>
      <h2>Practice Test</h2>

      <div className='test-progress'>
        <span>
          Question {currentIndex + 1} of {test.length}
        </span>

        <span>{answeredCount} answered</span>
      </div>

      <div className='test-progress-bar'>
        <div
          style={{
            width: `${((currentIndex + 1) / test.length) * 100}%`,
          }}
        />
      </div>

      <div className='test-question'>
        <small>Question #{currentQuestion.id}</small>

        <h3>{currentQuestion.question}</h3>

        <div className='test-options'>
          {Object.entries(currentQuestion.options).map(([letter, option]) => (
            <label
              key={letter}
              className={`test-option ${
                answers[currentQuestion.id] === letter ? 'selected' : ''
              }`}
            >
              <input
                type='radio'
                name={`question-${currentQuestion.id}`}
                value={letter}
                checked={answers[currentQuestion.id] === letter}
                onChange={() => selectAnswer(letter)}
              />

              <span>
                <strong>{letter.toUpperCase()}.</strong> {option}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className='test-navigation'>
        <button
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((i) => i - 1)}
        >
          Previous
        </button>

        {currentIndex < test.length - 1 ? (
          <button
            disabled={answers[currentQuestion.id] === undefined}
            onClick={() => setCurrentIndex((i) => i + 1)}
          >
            Next
          </button>
        ) : (
          <button disabled={answeredCount !== test.length} onClick={submitTest}>
            Finish Test
          </button>
        )}
      </div>
    </div>
  );
}

export default PracticeTest;
