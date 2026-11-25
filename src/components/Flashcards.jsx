import { useRef, useState } from 'react';

const STORAGE_KEY = 'falconry_questions';
const NEXT_ID_KEY = 'falconry_next_card_id';

const OPTION_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

const TRUE_FALSE_OPTIONS = {
  a: 'True',
  b: 'False',
};

// Convert a True/False answer to our standard a/b format.
function trueFalseLetter(card) {
  const value = String(card.correctAnswer ?? '').toLowerCase();

  if (value === 'a' || value === 'true') return 'a';
  if (value === 'b' || value === 'false') return 'b';

  const answer = String(card.correctAnswerText ?? '')
    .trim()
    .toLowerCase();

  if (answer === 'true') return 'a';
  if (answer === 'false') return 'b';

  return '';
}

// Make sure existing multiple-choice options have
// consecutive letters, without losing the correct answer.
function normalizeMultipleChoice(card) {
  const entries = Object.entries(card.options || {});

  if (entries.length > OPTION_LETTERS.length) {
    throw new Error('A maximum of 26 answer choices is supported.');
  }

  const selectedIndex = entries.findIndex(
    ([letter]) => letter === card.correctAnswer,
  );

  const options = Object.fromEntries(
    entries.map(([, value], i) => [OPTION_LETTERS[i], String(value ?? '')]),
  );

  return {
    ...card,
    options,
    correctAnswer: selectedIndex >= 0 ? OPTION_LETTERS[selectedIndex] : '',
  };
}

// Reusable helpers for adding/removing choices.
function addAnswerChoice(setter) {
  setter((current) => {
    if (!current || current.type !== 'multiple_choice') {
      return current;
    }

    const count = Object.keys(current.options || {}).length;

    if (count >= OPTION_LETTERS.length) {
      return current;
    }

    return {
      ...current,
      options: {
        ...current.options,
        [OPTION_LETTERS[count]]: '',
      },
    };
  });
}

function removeAnswerChoice(setter, letter) {
  setter((current) => {
    if (!current || current.type !== 'multiple_choice') {
      return current;
    }

    const entries = Object.entries(current.options || {});

    // Always keep at least two answers.
    if (entries.length <= 2) return current;

    const remaining = entries.filter(([key]) => key !== letter);

    // Preserve the selected correct answer if it remains.
    const correctIndex = remaining.findIndex(
      ([key]) => key === current.correctAnswer,
    );

    const options = Object.fromEntries(
      remaining.map(([, value], i) => [OPTION_LETTERS[i], value]),
    );

    return {
      ...current,
      options,
      correctAnswer: correctIndex >= 0 ? OPTION_LETTERS[correctIndex] : '',
    };
  });
}

function updateAnswerChoice(setter, letter, value) {
  setter((current) => ({
    ...current,
    options: {
      ...current.options,
      [letter]: value,
    },
  }));
}

// Shared form for creating and editing multiple-choice cards.
function AnswerChoicesEditor({
  options,
  correctAnswer,
  onOptionChange,
  onAnswerChange,
  onAdd,
  onRemove,
}) {
  const entries = Object.entries(options || {});

  return (
    <div className='answer-choices-editor'>
      <h4>Answer Choices</h4>

      {entries.map(([letter, value]) => (
        <div className='answer-choice-row' key={letter}>
          <label>
            Option {letter.toUpperCase()}
            <input
              type='text'
              value={value}
              onChange={(e) => onOptionChange(letter, e.target.value)}
              placeholder={`Enter option ${letter.toUpperCase()}`}
            />
          </label>

          <button
            type='button'
            className='remove-option-button'
            onClick={() => onRemove(letter)}
            disabled={entries.length <= 2}
            aria-label={`Remove option ${letter.toUpperCase()}`}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type='button'
        className='add-option-button'
        onClick={onAdd}
        disabled={entries.length >= 26}
      >
        + Add Answer Choice
      </button>

      <small>{entries.length} of 26 possible answers</small>

      <label>
        Correct Answer
        <select
          value={correctAnswer || ''}
          onChange={(e) => onAnswerChange(e.target.value)}
        >
          <option value=''>Select correct answer</option>

          {entries.map(([letter, value]) => (
            <option key={letter} value={letter}>
              {letter.toUpperCase()}
              {value.trim() ? ` — ${value}` : ''}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Flashcards() {
  const [cards, setCards] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });

  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [error, setError] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [createForm, setCreateForm] = useState(null);
  const [jumpQuestion, setJumpQuestion] = useState('');

  const touchStart = useRef(null);

  const isEditing = !!editForm || !!createForm;

  // ------------------------------------
  // IMPORT QUESTIONS
  // ------------------------------------

  const importQuestions = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());

      if (!Array.isArray(data)) {
        throw new Error('JSON must contain an array of questions.');
      }

      const sorted = [...data].sort((a, b) => Number(a.id) - Number(b.id));

      localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));

      setCards(sorted);
      setIndex(0);
      setShowAnswer(false);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not import questions.');
    }

    event.target.value = '';
  };

  // ------------------------------------
  // FLASHCARD NAVIGATION
  // ------------------------------------

  const goToCard = (newIndex) => {
    if (isEditing || cards.length === 0) return;

    const safeIndex = Math.max(0, Math.min(newIndex, cards.length - 1));

    setIndex(safeIndex);
    setShowAnswer(false);
    setError('');
  };

  const changeCard = (direction) => {
    goToCard(index + direction);
  };

  const jumpToQuestion = (event) => {
    event.preventDefault();

    if (isEditing) return;

    const questionNumber = jumpQuestion.trim();

    if (!questionNumber) return;

    const foundIndex = cards.findIndex(
      (card) => String(card.id) === questionNumber,
    );

    if (foundIndex === -1) {
      setError(`Question #${questionNumber} not found.`);
      return;
    }

    goToCard(foundIndex);
    setJumpQuestion('');
  };

  const randomCard = () => {
    if (isEditing || cards.length < 2) return;

    let randomIndex = Math.floor(Math.random() * (cards.length - 1));

    if (randomIndex >= index) {
      randomIndex += 1;
    }

    goToCard(randomIndex);
  };

  // ------------------------------------
  // SWIPE NAVIGATION
  // ------------------------------------

  const handleTouchStart = (event) => {
    if (isEditing) return;

    const touch = event.touches[0];

    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const handleTouchEnd = (event) => {
    if (!touchStart.current || isEditing) return;

    const touch = event.changedTouches[0];

    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = touch.clientY - touchStart.current.y;

    touchStart.current = null;

    // Ignore short swipes or vertical scrolling.
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) {
      return;
    }

    changeCard(deltaX < 0 ? 1 : -1);
  };

  // ------------------------------------
  // DELETE CARD
  // ------------------------------------

  const deleteCard = () => {
    const card = cards[index];

    if (!card || isEditing) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete question #${card.id}?`,
    );

    if (!confirmed) return;

    const updatedCards = cards.filter((_, i) => i !== index);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCards));

      setCards(updatedCards);

      setIndex((current) =>
        Math.min(current, Math.max(0, updatedCards.length - 1)),
      );

      setShowAnswer(false);
      setError('');
    } catch {
      setError('Unable to delete card.');
    }
  };

  // ------------------------------------
  // EDIT CARD
  // ------------------------------------

  const startEditing = () => {
    const card = cards[index];

    if (!card || isEditing) return;

    try {
      if (card.type === 'multiple_choice') {
        setEditForm(normalizeMultipleChoice(card));
      } else if (card.type === 'true_false') {
        setEditForm({
          ...card,
          options: { ...TRUE_FALSE_OPTIONS },
          correctAnswer: trueFalseLetter(card),
        });
      } else {
        setEditForm({
          ...card,
          options: { ...(card.options || {}) },
        });
      }

      setShowAnswer(false);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const updateEditField = (field, value) => {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const cancelEditing = () => {
    setEditForm(null);
    setError('');
  };

  const saveCard = () => {
    if (!editForm) return;

    let updatedCard = { ...editForm };

    if (updatedCard.type === 'definition') {
      const term = (updatedCard.term || '').trim();
      const definition = (updatedCard.definition || '').trim();

      if (!term || !definition) {
        setError('Term and definition are required.');
        return;
      }

      updatedCard = {
        ...updatedCard,
        term,
        definition,
        question: `Define: ${term}`,
        correctAnswerText: definition,
        answerStatement: definition,
      };
    } else {
      const question = (updatedCard.question || '').trim();

      const options =
        updatedCard.type === 'true_false'
          ? { ...TRUE_FALSE_OPTIONS }
          : Object.fromEntries(
              Object.entries(updatedCard.options || {}).map(([key, value]) => [
                key,
                String(value).trim(),
              ]),
            );

      const correctAnswer = updatedCard.correctAnswer;

      if (!question) {
        setError('Enter a question.');
        return;
      }

      if (
        updatedCard.type === 'multiple_choice' &&
        (Object.keys(options).length < 2 ||
          Object.values(options).some((value) => !value))
      ) {
        setError('At least two non-empty answer choices are required.');
        return;
      }

      if (!options[correctAnswer]) {
        setError('Select a valid correct answer.');
        return;
      }

      updatedCard = {
        ...updatedCard,
        question,
        options,
        correctAnswerText: options[correctAnswer],
        answerStatement: options[correctAnswer],
      };
    }

    const updatedCards = cards.map((card, i) =>
      i === index ? updatedCard : card,
    );

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCards));

      setCards(updatedCards);
      setEditForm(null);
      setShowAnswer(false);
      setError('');
    } catch {
      setError('Unable to save card.');
    }
  };

  // ------------------------------------
  // CREATE CARD
  // ------------------------------------

  const startCreating = () => {
    if (isEditing) return;

    setCreateForm({
      type: 'definition',
      term: '',
      definition: '',
      question: '',
      options: {
        a: '',
        b: '',
        c: '',
        d: '',
      },
      correctAnswer: 'a',
      explanation: '',
    });

    setError('');
    setShowAnswer(false);
  };

  const updateCreateField = (field, value) => {
    setCreateForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const cancelCreating = () => {
    setCreateForm(null);
    setError('');
  };

  const addCard = () => {
    if (!createForm) return;

    let newCard;

    // Definition
    if (createForm.type === 'definition') {
      const term = createForm.term.trim();
      const definition = createForm.definition.trim();

      if (!term || !definition) {
        setError('Please enter a term and definition.');
        return;
      }

      newCard = {
        type: 'definition',
        term,
        definition,
        question: `Define: ${term}`,
        options: {},
        correctAnswer: null,
        correctAnswerText: definition,
        answerStatement: definition,
        explanation: '',
      };
    }

    // True / False
    else if (createForm.type === 'true_false') {
      const question = createForm.question.trim();
      const correctAnswer = createForm.correctAnswer;

      if (!question || !TRUE_FALSE_OPTIONS[correctAnswer]) {
        setError('Enter a question and select True or False.');
        return;
      }

      newCard = {
        type: 'true_false',
        term: null,
        definition: null,
        question,
        options: { ...TRUE_FALSE_OPTIONS },
        correctAnswer,
        correctAnswerText: TRUE_FALSE_OPTIONS[correctAnswer],
        answerStatement: TRUE_FALSE_OPTIONS[correctAnswer],
        explanation: createForm.explanation.trim(),
      };
    }

    // Multiple Choice
    else {
      const question = createForm.question.trim();

      const options = Object.fromEntries(
        Object.entries(createForm.options).map(([letter, value]) => [
          letter,
          value.trim(),
        ]),
      );

      const correctAnswer = createForm.correctAnswer;

      if (!question) {
        setError('Enter a question.');
        return;
      }

      if (
        Object.keys(options).length < 2 ||
        Object.values(options).some((value) => !value)
      ) {
        setError('Enter at least two non-empty answer choices.');
        return;
      }

      if (!options[correctAnswer]) {
        setError('Select the correct answer.');
        return;
      }

      newCard = {
        type: 'multiple_choice',
        term: null,
        definition: null,
        question,
        options,
        correctAnswer,
        correctAnswerText: options[correctAnswer],
        answerStatement: options[correctAnswer],
        explanation: createForm.explanation.trim(),
      };
    }

    // Generate a new unique ID.
    const existingMax = Math.max(
      0,
      ...cards.map((card) => Number(card.id) || 0),
    );

    const savedMax = Number(localStorage.getItem(NEXT_ID_KEY)) || 0;

    const nextId = Math.max(existingMax, savedMax) + 1;

    newCard = {
      id: nextId,
      ...newCard,
      needsReview: false,
      issues: [],
      rawText: null,
    };

    const updatedCards = [...cards, newCard];

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCards));

      localStorage.setItem(NEXT_ID_KEY, String(nextId));

      setCards(updatedCards);
      setIndex(updatedCards.length - 1);
      setShowAnswer(false);
      setCreateForm(null);
      setError('');
    } catch {
      setError('Unable to save card to browser storage.');
    }
  };

  const card = cards[index];

  // ------------------------------------
  // RENDER
  // ------------------------------------

  return (
    <div className='flashcards'>
      <h2>Flashcards</h2>

      <button
        className='create-card-button'
        onClick={startCreating}
        disabled={isEditing}
      >
        + Add New Card
      </button>

      <label className='import-label'>
        Import Questions
        <input
          type='file'
          accept='.json,application/json'
          onChange={importQuestions}
          disabled={isEditing}
        />
      </label>

      {error && (
        <p className='error' role='alert'>
          {error}
        </p>
      )}

      {/* CREATE FORM */}

      {createForm && (
        <div className='create-card-form'>
          <h3>Create Flashcard</h3>

          <label>
            Card Type
            <select
              value={createForm.type}
              onChange={(e) => {
                setCreateForm((current) => ({
                  ...current,
                  type: e.target.value,
                  correctAnswer: 'a',
                }));
              }}
            >
              <option value='definition'>Definition</option>

              <option value='multiple_choice'>Multiple Choice</option>

              <option value='true_false'>True / False</option>
            </select>
          </label>

          {createForm.type === 'definition' ? (
            <>
              <label>
                Term
                <input
                  type='text'
                  value={createForm.term}
                  placeholder='Example: Block perch'
                  onChange={(e) => updateCreateField('term', e.target.value)}
                />
              </label>

              <label>
                Definition
                <textarea
                  rows={4}
                  value={createForm.definition}
                  onChange={(e) =>
                    updateCreateField('definition', e.target.value)
                  }
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Question
                <textarea
                  rows={3}
                  value={createForm.question}
                  onChange={(e) =>
                    updateCreateField('question', e.target.value)
                  }
                />
              </label>

              {createForm.type === 'true_false' ? (
                <label>
                  Correct Answer
                  <select
                    value={createForm.correctAnswer}
                    onChange={(e) =>
                      updateCreateField('correctAnswer', e.target.value)
                    }
                  >
                    <option value='a'>True</option>
                    <option value='b'>False</option>
                  </select>
                </label>
              ) : (
                <AnswerChoicesEditor
                  options={createForm.options}
                  correctAnswer={createForm.correctAnswer}
                  onOptionChange={(letter, value) =>
                    updateAnswerChoice(setCreateForm, letter, value)
                  }
                  onAnswerChange={(value) =>
                    updateCreateField('correctAnswer', value)
                  }
                  onAdd={() => addAnswerChoice(setCreateForm)}
                  onRemove={(letter) =>
                    removeAnswerChoice(setCreateForm, letter)
                  }
                />
              )}

              <label>
                Explanation (Optional)
                <textarea
                  rows={4}
                  value={createForm.explanation}
                  onChange={(e) =>
                    updateCreateField('explanation', e.target.value)
                  }
                />
              </label>
            </>
          )}

          <div className='create-actions'>
            <button onClick={cancelCreating}>Cancel</button>

            <button onClick={addCard}>Save Flashcard</button>
          </div>
        </div>
      )}

      {/* FLASHCARD DISPLAY */}

      {cards.length === 0 ? (
        <p>No flashcards yet. Add a card or import a JSON file to begin.</p>
      ) : (
        <>
          <div className='flashcard-progress'>
            Card {index + 1} of {cards.length}
          </div>

          {/* QUICK NAVIGATION */}

          <div className='flashcard-quick-nav'>
            <label
              htmlFor='flashcard-slider'
              className='flashcard-slider-label'
            >
              Quick Navigation
            </label>

            <input
              id='flashcard-slider'
              type='range'
              min='0'
              max={Math.max(0, cards.length - 1)}
              value={index}
              onChange={(e) => goToCard(Number(e.target.value))}
              disabled={isEditing || cards.length < 2}
            />

            <div className='flashcard-jump-row'>
              <form className='flashcard-jump-form' onSubmit={jumpToQuestion}>
                <input
                  type='number'
                  inputMode='numeric'
                  placeholder='Question #'
                  aria-label='Question number'
                  value={jumpQuestion}
                  onChange={(e) => setJumpQuestion(e.target.value)}
                  disabled={isEditing}
                />

                <button type='submit' disabled={isEditing}>
                  Go
                </button>
              </form>

              <button
                type='button'
                onClick={randomCard}
                disabled={isEditing || cards.length < 2}
              >
                Random
              </button>
            </div>
          </div>

          {/* CARD */}

          <div
            className='flashcard'
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <small>Question #{card.id}</small>

            {!showAnswer ? (
              <>
                <h3>
                  {card.type === 'definition'
                    ? `Define: ${card.term}`
                    : card.question}
                </h3>

                {(card.type === 'multiple_choice' ||
                  card.type === 'true_false') && (
                  <div className='flashcard-options'>
                    {Object.entries(
                      card.type === 'true_false'
                        ? TRUE_FALSE_OPTIONS
                        : card.options || {},
                    ).map(([letter, option]) => (
                      <p key={letter}>
                        <strong>{letter.toUpperCase()}.</strong> {option}
                      </p>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <h3>Answer</h3>

                <p>
                  {card.type === 'definition'
                    ? card.definition
                    : card.type === 'true_false'
                      ? TRUE_FALSE_OPTIONS[trueFalseLetter(card)] ||
                        card.correctAnswerText
                      : card.correctAnswerText}
                </p>

                {card.explanation && (
                  <p className='explanation'>{card.explanation}</p>
                )}
              </>
            )}
          </div>

          {/* REVEAL ANSWER */}

          <button
            className='reveal-button'
            onClick={() => setShowAnswer(!showAnswer)}
            disabled={isEditing}
          >
            {showAnswer ? 'Show Question' : 'Reveal Answer'}
          </button>

          {/* PREVIOUS / NEXT */}

          <div className='flashcard-navigation'>
            <button
              disabled={isEditing || index === 0}
              onClick={() => changeCard(-1)}
            >
              Previous
            </button>

            <button
              disabled={isEditing || index === cards.length - 1}
              onClick={() => changeCard(1)}
            >
              Next
            </button>
          </div>

          <button
            className='edit-card-button'
            onClick={startEditing}
            disabled={isEditing}
          >
            Edit Card
          </button>

          <button
            className='delete-card-button'
            onClick={deleteCard}
            disabled={isEditing}
          >
            Delete Card
          </button>

          {/* EDIT FORM */}

          {editForm && (
            <div className='edit-card-form'>
              <h3>Edit Question #{editForm.id}</h3>

              {editForm.type === 'definition' ? (
                <>
                  <label>
                    Term
                    <input
                      type='text'
                      value={editForm.term || ''}
                      onChange={(e) => updateEditField('term', e.target.value)}
                    />
                  </label>

                  <label>
                    Definition
                    <textarea
                      rows={4}
                      value={editForm.definition || ''}
                      onChange={(e) =>
                        updateEditField('definition', e.target.value)
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Question
                    <textarea
                      rows={3}
                      value={editForm.question || ''}
                      onChange={(e) =>
                        updateEditField('question', e.target.value)
                      }
                    />
                  </label>

                  {editForm.type === 'true_false' ? (
                    <label>
                      Correct Answer
                      <select
                        value={editForm.correctAnswer || ''}
                        onChange={(e) =>
                          updateEditField('correctAnswer', e.target.value)
                        }
                      >
                        <option value=''>Select answer</option>

                        <option value='a'>True</option>
                        <option value='b'>False</option>
                      </select>
                    </label>
                  ) : (
                    <AnswerChoicesEditor
                      options={editForm.options}
                      correctAnswer={editForm.correctAnswer}
                      onOptionChange={(letter, value) =>
                        updateAnswerChoice(setEditForm, letter, value)
                      }
                      onAnswerChange={(value) =>
                        updateEditField('correctAnswer', value)
                      }
                      onAdd={() => addAnswerChoice(setEditForm)}
                      onRemove={(letter) =>
                        removeAnswerChoice(setEditForm, letter)
                      }
                    />
                  )}

                  <label>
                    Explanation
                    <textarea
                      rows={5}
                      value={editForm.explanation || ''}
                      onChange={(e) =>
                        updateEditField('explanation', e.target.value)
                      }
                    />
                  </label>
                </>
              )}

              <div className='edit-actions'>
                <button onClick={cancelEditing}>Cancel</button>

                <button onClick={saveCard}>Save Changes</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Flashcards;
