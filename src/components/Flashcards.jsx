import { useState } from 'react';

const STORAGE_KEY = 'falconry_questions';

const NEXT_ID_KEY = 'falconry_next_card_id';

function Flashcards() {
  const [cards, setCards] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  });

  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [error, setError] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [createForm, setCreateForm] = useState(null);

  // Import questions from JSON
  const importQuestions = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data)) {
        throw new Error('JSON must contain an array.');
      }

      const sorted = [...data].sort((a, b) => a.id - b.id);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));

      setCards(sorted);
      setIndex(0);
      setShowAnswer(false);
      setError('');
    } catch (err) {
      setError(err.message);
    }

    event.target.value = '';
  };

  const changeCard = (direction) => {
    setIndex((current) => current + direction);
    setShowAnswer(false);
  };

  const deleteCard = () => {
    const card = cards[index];

    const confirmed = window.confirm(
      `Are you sure you want to delete question #${card.id}?`,
    );

    if (!confirmed) return;

    const updatedCards = cards.filter((_, cardIndex) => cardIndex !== index);

    // Save updated cards to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCards));

    // Update React state
    setCards(updatedCards);

    // Adjust index if we deleted the last card
    setIndex((current) =>
      Math.min(current, Math.max(0, updatedCards.length - 1)),
    );

    // Reset answer visibility
    setShowAnswer(false);
  };

  const startEditing = () => {
    const card = cards[index];

    setEditForm({
      ...card,
      options: { ...(card.options || {}) },
    });

    setShowAnswer(false);
    setError('');
  };

  const updateEditField = (field, value) => {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateOption = (letter, value) => {
    setEditForm((current) => ({
      ...current,
      options: {
        ...current.options,
        [letter]: value,
      },
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
      const term = updatedCard.term?.trim();
      const definition = updatedCard.definition?.trim();

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
      const question = updatedCard.question?.trim();
      const correctAnswer = updatedCard.correctAnswer;

      if (
        !question ||
        !correctAnswer ||
        !updatedCard.options?.[correctAnswer]?.trim()
      ) {
        setError('Question and correct answer are required.');
        return;
      }

      updatedCard = {
        ...updatedCard,
        question,
        correctAnswerText: updatedCard.options[correctAnswer].trim(),
      };
    }

    const updatedCards = cards.map((card, i) =>
      i === index ? updatedCard : card,
    );

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCards));

    setCards(updatedCards);
    setEditForm(null);
    setShowAnswer(false);
    setError('');
  };

  const startCreating = () => {
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

  const updateCreateOption = (letter, value) => {
    setCreateForm((current) => ({
      ...current,
      options: {
        ...current.options,
        [letter]: value,
      },
    }));
  };

  const cancelCreating = () => {
    setCreateForm(null);
    setError('');
  };

  const addCard = () => {
    if (!createForm) return;

    let newCard;

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
    } else {
      const question = createForm.question.trim();

      const options = Object.fromEntries(
        Object.entries(createForm.options).map(([letter, value]) => [
          letter,
          value.trim(),
        ]),
      );

      if (!question || Object.values(options).some((v) => !v)) {
        setError('Enter a question and all four options.');
        return;
      }

      const correctAnswer = createForm.correctAnswer;

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

    // Generate a unique numeric ID.
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
    } catch {
      setError('Unable to save card to browser storage.');
      return;
    }

    setCards(updatedCards);
    setIndex(updatedCards.length - 1);
    setShowAnswer(false);
    setCreateForm(null);
    setError('');
  };

  const card = cards[index];

  return (
    <div className='flashcards'>
      <h2>Flashcards</h2>
      <button
        className='create-card-button'
        onClick={startCreating}
        disabled={!!createForm || !!editForm}
      >
        + Add New Card
      </button>

      <label className='import-label'>
        Import Questions
        <input
          type='file'
          accept='.json,application/json'
          onChange={importQuestions}
        />
      </label>

      {error && <p className='error'>{error}</p>}

      {createForm && (
        <div className='create-card-form'>
          <h3>Create Flashcard</h3>

          <label>
            Card Type
            <select
              value={createForm.type}
              onChange={(e) => updateCreateField('type', e.target.value)}
            >
              <option value='definition'>Definition</option>
              <option value='multiple_choice'>Multiple Choice</option>
            </select>
          </label>

          {createForm.type === 'definition' ? (
            <>
              <label>
                Term
                <input
                  type='text'
                  placeholder='Example: Block perch'
                  value={createForm.term}
                  onChange={(e) => updateCreateField('term', e.target.value)}
                />
              </label>

              <label>
                Definition
                <textarea
                  rows={4}
                  placeholder='Enter the definition...'
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
                  placeholder='Enter your question...'
                  value={createForm.question}
                  onChange={(e) =>
                    updateCreateField('question', e.target.value)
                  }
                />
              </label>

              <h4>Answer Choices</h4>

              {Object.entries(createForm.options).map(([letter, value]) => (
                <label key={letter}>
                  Option {letter.toUpperCase()}
                  <input
                    type='text'
                    value={value}
                    onChange={(e) => updateCreateOption(letter, e.target.value)}
                  />
                </label>
              ))}

              <label>
                Correct Answer
                <select
                  value={createForm.correctAnswer}
                  onChange={(e) =>
                    updateCreateField('correctAnswer', e.target.value)
                  }
                >
                  {Object.keys(createForm.options).map((letter) => (
                    <option key={letter} value={letter}>
                      Option {letter.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Explanation (Optional)
                <textarea
                  rows={4}
                  placeholder='Explain why this is correct...'
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

      {cards.length === 0 ? (
        <p>Import your falconry_questions.json to begin.</p>
      ) : (
        <>
          <div className='flashcard-progress'>
            Card {index + 1} of {cards.length}
          </div>

          <div className='flashcard'>
            <small>Question #{card.id}</small>

            {!showAnswer ? (
              <>
                <h3>
                  {card.type === 'definition'
                    ? `Define: ${card.term}`
                    : card.question}
                </h3>

                {card.type === 'multiple_choice' && (
                  <div className='flashcard-options'>
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

                <p>
                  {card.type === 'definition'
                    ? card.definition
                    : card.correctAnswerText}
                </p>

                {card.explanation && (
                  <p className='explanation'>{card.explanation}</p>
                )}
              </>
            )}
          </div>

          <button
            className='reveal-button'
            onClick={() => setShowAnswer(!showAnswer)}
          >
            {showAnswer ? 'Show Question' : 'Reveal Answer'}
          </button>

          <div className='flashcard-navigation'>
            <button
              disabled={!!createForm || !!editForm || index === 0}
              onClick={() => changeCard(-1)}
            >
              Previous
            </button>

            <button
              disabled={
                !!createForm || !!editForm || index === cards.length - 1
              }
              onClick={() => changeCard(1)}
            >
              Next
            </button>
          </div>
          <button
            className='edit-card-button'
            onClick={startEditing}
            disabled={!!editForm || !!createForm}
          >
            Edit Card
          </button>
          <button
            // Delete Card
            disabled={!!createForm || !!editForm}
            className='delete-card-button'
            onClick={deleteCard}
          >
            Delete Card
          </button>

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

                  <h4>Answer Choices</h4>

                  {Object.entries(editForm.options || {}).map(
                    ([letter, option]) => (
                      <label key={letter}>
                        Option {letter.toUpperCase()}
                        <input
                          type='text'
                          value={option}
                          onChange={(e) => updateOption(letter, e.target.value)}
                        />
                      </label>
                    ),
                  )}

                  <label>
                    Correct Answer
                    <select
                      value={editForm.correctAnswer || ''}
                      onChange={(e) =>
                        updateEditField('correctAnswer', e.target.value)
                      }
                    >
                      <option value=''>Select answer</option>

                      {Object.keys(editForm.options || {}).map((letter) => (
                        <option key={letter} value={letter}>
                          {letter.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>

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
