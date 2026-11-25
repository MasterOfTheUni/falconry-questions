import { useState } from 'react';
import './index.css';

import {
  FaBookOpen,
  FaBrain,
  FaClipboardCheck,
  FaChartBar,
  FaHome,
  FaFeather,
  FaDatabase,
  FaLayerGroup,
} from 'react-icons/fa';

import Flashcards from './components/Flashcards';
import Review from './components/Review';
import PracticeTest from './components/PracticeTest';
import Progress from './components/Progress';
import BackupRestore from './components/BackupRestore';

// Deck metadata and saved deck snapshots.
const DECKS_KEY = 'studydeck_decks_v1';
const ACTIVE_DECK_KEY = 'studydeck_active_v1';
const SNAPSHOT_PREFIX = 'studydeck_snapshot_v1_';

// Existing components still use these keys.
// We'll switch their contents when switching decks.
const STORAGE_KEYS = {
  questions: 'falconry_questions',
  reviews: 'falconry_review_progress',
  tests: 'falconry_test_history',
  nextId: 'falconry_next_card_id',
};

const EMPTY_DATA = {
  questions: '[]',
  reviews: '{}',
  tests: '[]',
  nextId: '0',
};

const sections = [
  {
    id: 'flashcards',
    title: 'Flashcards',
    icon: FaBookOpen,
  },
  {
    id: 'review',
    title: 'Review',
    icon: FaBrain,
  },
  {
    id: 'test',
    title: 'Practice Test',
    icon: FaClipboardCheck,
  },
  {
    id: 'progress',
    title: 'Progress',
    icon: FaChartBar,
  },
];

// ----------------------------------
// STORAGE HELPERS
// ----------------------------------

// Read the data currently used by existing components.
function readCurrentData() {
  const data = {};

  for (const [field, key] of Object.entries(STORAGE_KEYS)) {
    data[field] = localStorage.getItem(key) ?? EMPTY_DATA[field];
  }

  return data;
}

// Write a selected deck into the existing storage keys.
function writeCurrentData(data) {
  for (const [field, key] of Object.entries(STORAGE_KEYS)) {
    localStorage.setItem(key, data[field] ?? EMPTY_DATA[field]);
  }
}

// Read a previously saved deck.
function readDeckSnapshot(deckId) {
  const saved = localStorage.getItem(SNAPSHOT_PREFIX + deckId);

  if (saved === null) {
    throw new Error('Saved deck data was not found. No decks were switched.');
  }

  const data = JSON.parse(saved);

  if (
    !data ||
    typeof data !== 'object' ||
    Object.keys(EMPTY_DATA).some((field) => typeof data[field] !== 'string')
  ) {
    throw new Error('Saved deck data is invalid.');
  }

  return data;
}

// Initialize the deck library without changing
// any existing Falconry questions or progress.
function initializeDeckLibrary() {
  const saved = localStorage.getItem(DECKS_KEY);

  if (saved !== null) {
    const decks = JSON.parse(saved);

    if (!Array.isArray(decks) || decks.length === 0) {
      throw new Error('Deck library is invalid.');
    }

    const activeId = localStorage.getItem(ACTIVE_DECK_KEY);

    if (!decks.some((deck) => deck.id === activeId)) {
      throw new Error('Active deck was not found.');
    }

    return { decks, activeId };
  }

  const decks = [{ id: 'falconry', name: 'Falconry' }];

  // Do not replace the original falconry_* keys.
  localStorage.setItem(DECKS_KEY, JSON.stringify(decks));

  localStorage.setItem(ACTIVE_DECK_KEY, 'falconry');

  return {
    decks,
    activeId: 'falconry',
  };
}

// ----------------------------------
// APP COMPONENT
// ----------------------------------

function App() {
  const [initialLibrary] = useState(initializeDeckLibrary);

  const [decks, setDecks] = useState(initialLibrary.decks);

  const [activeDeckId, setActiveDeckId] = useState(initialLibrary.activeId);

  const [page, setPage] = useState('home');
  const [newDeckName, setNewDeckName] = useState('');
  const [deckError, setDeckError] = useState('');

  const activeDeck = decks.find((deck) => deck.id === activeDeckId);

  // ----------------------------------
  // CREATE A NEW DECK
  // ----------------------------------

  const createDeck = (event) => {
    event.preventDefault();

    const name = newDeckName.trim();

    if (!name) return;

    if (decks.some((deck) => deck.name.toLowerCase() === name.toLowerCase())) {
      setDeckError('A deck with that name already exists.');
      return;
    }

    const id =
      'deck_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    const newDeck = { id, name };
    const updatedDecks = [...decks, newDeck];

    try {
      // Every new deck starts empty.
      localStorage.setItem(SNAPSHOT_PREFIX + id, JSON.stringify(EMPTY_DATA));

      localStorage.setItem(DECKS_KEY, JSON.stringify(updatedDecks));

      setDecks(updatedDecks);
      setNewDeckName('');
      setDeckError('');
    } catch {
      setDeckError('Unable to create deck.');
    }
  };

  // ----------------------------------
  // SWITCH BETWEEN DECKS
  // ----------------------------------

  const switchDeck = (nextDeckId) => {
    if (nextDeckId === activeDeckId) return;

    if (!decks.some((deck) => deck.id === nextDeckId)) {
      setDeckError('Selected deck was not found.');
      return;
    }

    try {
      // Check target data before changing anything.
      const targetData = readDeckSnapshot(nextDeckId);

      // Capture the active deck and its original values.
      const currentData = readCurrentData();

      // Save active deck before leaving it.
      localStorage.setItem(
        SNAPSHOT_PREFIX + activeDeckId,
        JSON.stringify(currentData),
      );

      // Load the new deck into the existing keys.
      try {
        writeCurrentData(targetData);

        localStorage.setItem(ACTIVE_DECK_KEY, nextDeckId);
      } catch {
        // Recover the original active deck if switching fails.
        try {
          writeCurrentData(currentData);

          localStorage.setItem(ACTIVE_DECK_KEY, activeDeckId);
        } catch {
          throw new Error(
            'Deck switch failed and recovery was incomplete. ' +
              'Do not edit questions until your data is checked.',
          );
        }

        throw new Error('Could not switch decks. Existing data was restored.');
      }

      setActiveDeckId(nextDeckId);
      setPage('home');
      setDeckError('');
    } catch (error) {
      setDeckError(error.message || 'Unable to switch decks.');
    }
  };

  // ----------------------------------
  // HOME SCREEN
  // ----------------------------------

  const renderHome = () => (
    <>
      <div className='welcome'>
        <h2>{activeDeck?.name}</h2>
        <p>Choose a study activity or switch decks below.</p>
      </div>

      <section className='deck-manager'>
        <div className='deck-manager-heading'>
          <div className='deck-manager-title'>
            <div className='deck-heading-icon'>
              <FaLayerGroup />
            </div>

            <div>
              <span className='deck-eyebrow'>YOUR LIBRARY</span>

              <h3>Study decks</h3>
            </div>
          </div>

          <span className='deck-count'>
            {decks.length} {decks.length === 1 ? 'deck' : 'decks'}
          </span>
        </div>

        <div className='deck-list'>
          {decks.map((deck) => {
            const isActive = deck.id === activeDeckId;

            return (
              <button
                key={deck.id}
                type='button'
                className={`deck-option ${isActive ? 'selected' : ''}`}
                aria-pressed={isActive}
                onClick={() => switchDeck(deck.id)}
              >
                <span className='deck-option-icon'>
                  <FaBookOpen />
                </span>

                <span className='deck-option-copy'>
                  <strong>{deck.name}</strong>

                  <small>
                    {isActive ? 'Currently studying' : 'Tap to switch decks'}
                  </small>
                </span>

                <span className='deck-option-status'>
                  {isActive ? 'Active' : 'Open'}
                </span>
              </button>
            );
          })}
        </div>

        <form className='deck-create-form' onSubmit={createDeck}>
          <label htmlFor='new-deck-name'>Create a new deck</label>

          <div className='deck-create-row'>
            <input
              id='new-deck-name'
              type='text'
              placeholder='e.g. Hacking, Biology...'
              maxLength={60}
              value={newDeckName}
              onChange={(event) => setNewDeckName(event.target.value)}
            />

            <button type='submit' disabled={!newDeckName.trim()}>
              + Add
            </button>
          </div>
        </form>

        {deckError && (
          <p className='error' role='alert'>
            {deckError}
          </p>
        )}
      </section>

      <div className='dashboard-grid'>
        {sections.map((section) => {
          const Icon = section.icon;

          return (
            <button
              key={section.id}
              type='button'
              className='dashboard-card'
              onClick={() => setPage(section.id)}
            >
              <span className='card-icon'>
                <Icon />
              </span>

              <strong>{section.title}</strong>
            </button>
          );
        })}
      </div>

      <button
        type='button'
        className='dashboard-card'
        style={{
          width: '100%',
          marginTop: 12,
        }}
        onClick={() => setPage('backup')}
      >
        <span className='card-icon'>
          <FaDatabase />
        </span>

        <strong>Backup All Decks</strong>
      </button>
    </>
  );

  // ----------------------------------
  // PAGE ROUTING
  // ----------------------------------

  const renderPage = () => {
    switch (page) {
      case 'flashcards':
        return <Flashcards />;

      case 'review':
        return <Review />;

      case 'test':
        return <PracticeTest />;

      case 'progress':
        return <Progress />;

      case 'backup':
        return <BackupRestore />;

      default:
        return renderHome();
    }
  };

  return (
    <div className='app'>
      <header className='header'>
        <div className='header-brand'>
          <div className='header-icon'>
            <FaFeather />
          </div>

          <div>
            <h1>StudyDeck</h1>
            <p>{activeDeck?.name || 'Flashcards'}</p>
          </div>
        </div>
      </header>

      <main className='content'>{renderPage()}</main>

      <nav className='bottom-nav'>
        <button
          type='button'
          className={page === 'home' ? 'active' : ''}
          onClick={() => setPage('home')}
        >
          <FaHome />
          <span>Home</span>
        </button>

        {sections.map((section) => {
          const Icon = section.icon;

          return (
            <button
              key={section.id}
              type='button'
              className={page === section.id ? 'active' : ''}
              onClick={() => setPage(section.id)}
            >
              <Icon />
              <span>{section.title}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default App;
