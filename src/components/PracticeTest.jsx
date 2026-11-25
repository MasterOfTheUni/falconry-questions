import { useState } from 'react';

const QUESTIONS_KEY = 'falconry_questions';
const TEST_HISTORY_KEY = 'falconry_test_history';

const TRUE_FALSE_OPTIONS = {
  a: 'True',
  b: 'False',
};

// -----------------------------------
// QUESTION HELPERS
// -----------------------------------

// Get the answer choices for a question.
function getOptions(question) {
  if (question.type === 'true_false') {
    return TRUE_FALSE_OPTIONS;
  }

  if (question.type === 'multiple_choice') {
    return question.options || {};
  }

  return {};
}

// Resolve the correct answer to its option key.
function getCorrectAnswer(question) {
  if (question.type === 'true_false') {
    const value = String(question.correctAnswer ?? '')
      .trim()
      .toLowerCase();

    if (value === 'a' || value === 'true') {
      return 'a';
    }

    if (value === 'b' || value === 'false') {
      return 'b';
    }

    const answerText = String(question.correctAnswerText ?? '')
      .trim()
      .toLowerCase();

    if (answerText === 'true') return 'a';
    if (answerText === 'false') return 'b';

    return null;
  }

  const options = getOptions(question);

  const correctKey = Object.keys(options).find(
    (key) =>
      key.toLowerCase() === String(question.correctAnswer ?? '').toLowerCase(),
  );

  return correctKey || null;
}

// Load valid questions from browser storage.
function loadQuestions() {
  try {
    const data = JSON.parse(localStorage.getItem(QUESTIONS_KEY) || '[]');

    if (!Array.isArray(data)) return [];

    return data.filter((question) => {
      if (
        question.id == null ||
        !['multiple_choice', 'true_false'].includes(question.type) ||
        !question.question?.trim()
      ) {
        return false;
      }

      const options = getOptions(question);
      const correctAnswer = getCorrectAnswer(question);

      return (
        Object.keys(options).length >= 2 &&
        Object.values(options).every(
          (value) => typeof value === 'string' && value.trim().length > 0,
        ) &&
        correctAnswer !== null &&
        Boolean(options[correctAnswer])
      );
    });
  } catch (error) {
    console.error('Unable to load questions:', error);
    return [];
  }
}

// Fisher-Yates shuffle.
function shuffleQuestions(questions) {
  const shuffled = [...questions];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

// -----------------------------------
// PRACTICE TEST COMPONENT
// -----------------------------------

function PracticeTest() {
  const [questions] = useState(loadQuestions);

  const [testSize, setTestSize] = useState('10');
  const [test, setTest] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState(null);

  const [showAllResults, setShowAllResults] = useState(false);

  const [error, setError] = useState('');

  const currentQuestion = test[currentIndex];

  const answeredCount = test.filter(
    (question) => answers[question.id] !== undefined,
  ).length;

  // -----------------------------------
  // START TEST
  // -----------------------------------

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
    setError('');
  };

  // -----------------------------------
  // SELECT AN ANSWER
  // -----------------------------------

  const selectAnswer = (letter) => {
    if (!currentQuestion) return;

    setAnswers((previous) => ({
      ...previous,
      [currentQuestion.id]: letter,
    }));
  };

  // -----------------------------------
  // SUBMIT AND GRADE TEST
  // -----------------------------------

  const submitTest = () => {
    if (test.length === 0 || answeredCount !== test.length) {
      return;
    }

    const graded = test.map((question) => {
      const selectedAnswer = answers[question.id];
      const correctAnswer = getCorrectAnswer(question);

      return {
        ...question,
        selectedAnswer,
        correctAnswer,
        isCorrect: selectedAnswer === correctAnswer,
      };
    });

    const correct = graded.filter((question) => question.isCorrect).length;

    const score = Math.round((correct / graded.length) * 100);

    const result = {
      total: graded.length,
      correct,
      score,
      questions: graded,
    };

    setResults(result);

    // Save results for the Progress Dashboard.
    const newEntry = {
      date: new Date().toISOString(),
      total: graded.length,
      correct,
      score,

      missedIds: graded
        .filter((question) => !question.isCorrect)
        .map((question) => question.id),
    };

    try {
      const stored = JSON.parse(localStorage.getItem(TEST_HISTORY_KEY) || '[]');

      const history = Array.isArray(stored) ? stored : [];

      localStorage.setItem(
        TEST_HISTORY_KEY,
        JSON.stringify([...history, newEntry]),
      );
    } catch (error) {
      console.error('Unable to save test history:', error);

      setError('Test graded, but the results could not be saved.');
    }
  };

  // -----------------------------------
  // RESET TEST
  // -----------------------------------

  const resetTest = () => {
    setTest([]);
    setAnswers({});
    setResults(null);
    setCurrentIndex(0);
    setShowAllResults(false);
    setError('');
  };

  // -----------------------------------
  // TEST SETUP
  // -----------------------------------

  if (test.length === 0) {
    const multipleChoiceCount = questions.filter(
      (q) => q.type === 'multiple_choice',
    ).length;

    const trueFalseCount = questions.filter(
      (q) => q.type === 'true_false',
    ).length;

    return (
      <div className='practice-test'>
        <h2>Practice Test</h2>

        <p>Test your falconry knowledge with randomly selected questions.</p>

        <div className='test-setup'>
          <h3>Start a Practice Exam</h3>

          <p>{questions.length} questions available</p>

          <p>
            {multipleChoiceCount} Multiple Choice
            {' · '}
            {trueFalseCount} True / False
          </p>

          <label htmlFor='test-size'>Number of Questions</label>

          <select
            id='test-size'
            value={testSize}
            onChange={(e) => setTestSize(e.target.value)}
          >
            <option value='5'>5 Questions</option>
            <option value='10'>10 Questions</option>
            <option value='20'>20 Questions</option>
            <option value='50'>50 Questions</option>
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
              No valid multiple-choice or True/False questions found. Add
              questions in the Flashcards section first.
            </p>
          )}
        </div>
      </div>
    );
  }

  // -----------------------------------
  // TEST RESULTS
  // -----------------------------------

  if (results) {
    const missed = results.questions.filter((question) => !question.isCorrect);

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
              ? 'Perfect score!'
              : 'Review your missed questions below.'}
          </p>
        </div>

        {error && (
          <p className='error' role='alert'>
            {error}
          </p>
        )}

        <div className='test-result-controls'>
          <button onClick={() => setShowAllResults(!showAllResults)}>
            {showAllResults ? 'Show Missed Only' : 'Show All Answers'}
          </button>
        </div>

        <div className='test-review-list'>
          {displayedQuestions.length === 0 ? (
            <p>No missed questions!</p>
          ) : (
            displayedQuestions.map((question) => {
              const options = getOptions(question);

              return (
                <div
                  key={question.id}
                  className={`test-review-item ${
                    question.isCorrect ? 'correct' : 'incorrect'
                  }`}
                >
                  <strong>
                    #{question.id} — {question.question}
                  </strong>

                  <p>
                    Your answer:{' '}
                    <span>
                      {question.selectedAnswer.toUpperCase()}.{' '}
                      {options[question.selectedAnswer]}
                    </span>
                  </p>

                  <p>
                    Correct answer:{' '}
                    <strong>
                      {question.correctAnswer.toUpperCase()}.{' '}
                      {options[question.correctAnswer]}
                    </strong>
                  </p>

                  {question.explanation && (
                    <p className='test-explanation'>{question.explanation}</p>
                  )}
                </div>
              );
            })
          )}
        </div>

        <button className='test-primary-button' onClick={resetTest}>
          New Practice Test
        </button>
      </div>
    );
  }

  // -----------------------------------
  // ACTIVE TEST
  // -----------------------------------

  const options = getOptions(currentQuestion);

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
        <small>
          Question #{currentQuestion.id}
          {' · '}
          {currentQuestion.type === 'true_false'
            ? 'True / False'
            : 'Multiple Choice'}
        </small>

        <h3>{currentQuestion.question}</h3>

        <div className='test-options'>
          {Object.entries(options).map(([letter, option]) => (
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
