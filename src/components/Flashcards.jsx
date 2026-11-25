import { useRef, useState } from 'react';

const STORAGE_KEY = 'falconry_questions';
const NEXT_ID_KEY = 'falconry_next_card_id';

const OPTION_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

const TRUE_FALSE_OPTIONS = {
  a: 'True',
  b: 'False',
};

function getCardSignature(card) {
  const normalize = (value) =>
    String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

  return JSON.stringify({
    type: card.type,
    question: normalize(card.question),
    term: normalize(card.term),
    definition: normalize(card.definition),
    correctAnswer: normalize(card.correctAnswer),
    options: Object.entries(card.options || {})
      .map(([key, value]) => [normalize(key), normalize(value)])
      .sort(([a], [b]) => a.localeCompare(b)),
  });
}

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
  const [importMode, setImportMode] = useState('merge');
  const [importStatus, setImportStatus] = useState('');

  const touchStart = useRef(null);

  const isEditing = !!editForm || !!createForm;

  // ------------------------------------
  // IMPORT QUESTIONS
  // ------------------------------------

  const importQuestions = async (event) => {
    const input = event.target;
    const file = input.files?.[0];

    if (!file) return;

    setError('');
    setImportStatus('');

    try {
      const data = JSON.parse(await file.text());

      if (!Array.isArray(data)) {
        throw new Error('JSON must contain an array of questions.');
      }

      // Validate imported records.
      const imported = data.map((item, i) => {
        const id = Number(item?.id);

        if (
          !item ||
          typeof item !== 'object' ||
          Array.isArray(item) ||
          !Number.isSafeInteger(id) ||
          id < 1 ||
          !['definition', 'multiple_choice', 'true_false'].includes(item.type)
        ) {
          throw new Error(`Invalid question at position ${i + 1}.`);
        }

        return { ...item, id };
      });

      // Remove duplicate IDs inside the imported file.
      const fileIds = new Set();
      const uniqueImported = [];
      let fileDuplicates = 0;

      for (const item of imported) {
        if (fileIds.has(item.id)) {
          fileDuplicates++;
          continue;
        }

        fileIds.add(item.id);
        uniqueImported.push(item);
      }

      // --------------------------------
      // MERGE QUESTIONS
      // --------------------------------

      if (importMode === 'merge') {
        const existingIds = new Set(cards.map((card) => Number(card.id)));

        const existingSignatures = new Set(cards.map(getCardSignature));

        const newCards = [];

        let skippedIds = 0;
        let skippedContent = 0;

        for (const item of uniqueImported) {
          // Never overwrite an existing ID.
          if (existingIds.has(item.id)) {
            skippedIds++;
            continue;
          }

          const signature = getCardSignature(item);

          // Skip identical question content.
          if (existingSignatures.has(signature)) {
            skippedContent++;
            continue;
          }

          newCards.push(item);
          existingIds.add(item.id);
          existingSignatures.add(signature);
        }

        const updatedCards = [...cards, ...newCards].sort(
          (a, b) => Number(a.id) - Number(b.id),
        );

        if (newCards.length > 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCards));

          setCards(updatedCards);
          setIndex(0);
          setShowAnswer(false);
        }

        const skipped = skippedIds + skippedContent + fileDuplicates;

        setImportStatus(
          `Imported ${newCards.length} new questions. ` +
            `Skipped ${skipped} duplicates or conflicting IDs. ` +
            `Total: ${updatedCards.length} questions.`,
        );
      }

      // --------------------------------
      // REPLACE QUESTIONS
      // --------------------------------
      else {
        const confirmed = window.confirm(
          `Replace all ${cards.length} existing questions ` +
            `with ${uniqueImported.length} imported questions?\n\n` +
            'This will also reset review progress and ' +
            'practice test history.\n\n' +
            'Export a backup first if you want to keep them.',
        );

        if (!confirmed) {
          setImportStatus('Import canceled.');
          return;
        }

        const sorted = [...uniqueImported].sort((a, b) => a.id - b.id);

        const updates = {
          [STORAGE_KEY]: JSON.stringify(sorted),
          falconry_review_progress: '{}',
          falconry_test_history: '[]',
        };

        // Save previous values for recovery if a write fails.
        const previous = Object.fromEntries(
          Object.keys(updates).map((key) => [key, localStorage.getItem(key)]),
        );

        try {
          for (const [key, value] of Object.entries(updates)) {
            localStorage.setItem(key, value);
          }
        } catch {
          let rollbackFailed = false;

          for (const [key, value] of Object.entries(previous)) {
            try {
              if (value === null) {
                localStorage.removeItem(key);
              } else {
                localStorage.setItem(key, value);
              }
            } catch {
              rollbackFailed = true;
            }
          }

          throw new Error(
            rollbackFailed
              ? 'Import failed and recovery was incomplete. Restore your backup.'
              : 'Import failed. Existing data was restored.',
          );
        }

        setCards(sorted);
        setIndex(0);
        setShowAnswer(false);

        setImportStatus(
          `Replaced question bank with ${sorted.length} questions.`,
        );
      }
    } catch (err) {
      setError(err.message || 'Unable to import questions.');
    } finally {
      input.value = '';
    }
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

      <div className='flashcard-import-controls'>
        <strong>Import Questions</strong>

        <label>
          <input
            type='radio'
            name='import-mode'
            value='merge'
            checked={importMode === 'merge'}
            onChange={() => setImportMode('merge')}
            disabled={isEditing}
          />
          Merge with existing questions
        </label>

        <label>
          <input
            type='radio'
            name='import-mode'
            value='replace'
            checked={importMode === 'replace'}
            onChange={() => setImportMode('replace')}
            disabled={isEditing}
          />
          Replace all questions
        </label>

        <label className='import-label'>
          {importMode === 'merge' ? 'Import & Merge' : 'Import & Replace'}

          <input
            type='file'
            accept='.json,application/json'
            onChange={importQuestions}
            disabled={isEditing}
          />
        </label>

        {importStatus && (
          <p role='status' className='import-status'>
            {importStatus}
          </p>
        )}
      </div>

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
