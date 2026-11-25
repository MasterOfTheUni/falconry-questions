import { useState } from 'react';

// V3 deck storage
const DECKS_KEY = 'studydeck_decks_v1';
const ACTIVE_DECK_KEY = 'studydeck_active_v1';
const SNAPSHOT_PREFIX = 'studydeck_snapshot_v1_';

// Storage used by the existing study components
const CURRENT_KEYS = {
  questions: 'falconry_questions',
  reviews: 'falconry_review_progress',
  tests: 'falconry_test_history',
  nextId: 'falconry_next_card_id',
};

const APP_ID = 'studydeck';
const BACKUP_VERSION = 2;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ------------------------------------
// VALIDATE QUESTION DATA
// ------------------------------------

function validateDeckData(data) {
  if (
    !isObject(data) ||
    !Array.isArray(data.questions) ||
    !isObject(data.reviewProgress) ||
    !Array.isArray(data.testHistory) ||
    !Number.isSafeInteger(data.nextCardId) ||
    data.nextCardId < 0
  ) {
    throw new Error('A deck contains missing or invalid study data.');
  }

  const ids = new Set();

  for (const card of data.questions) {
    if (!isObject(card) || card.id == null) {
      throw new Error('A backup contains an invalid flashcard.');
    }

    const id = String(card.id);

    if (ids.has(id)) {
      throw new Error(`Duplicate question ID ${id} found in a deck.`);
    }

    ids.add(id);
  }

  return {
    questions: data.questions,
    reviewProgress: data.reviewProgress,
    testHistory: data.testHistory,
    nextCardId: data.nextCardId,
  };
}

// ------------------------------------
// DECODE EXISTING STORAGE
// ------------------------------------

function decodeRawData(raw) {
  if (
    !isObject(raw) ||
    ['questions', 'reviews', 'tests', 'nextId'].some(
      (field) => typeof raw[field] !== 'string',
    )
  ) {
    throw new Error('Saved deck data is invalid.');
  }

  return validateDeckData({
    questions: JSON.parse(raw.questions),
    reviewProgress: JSON.parse(raw.reviews),
    testHistory: JSON.parse(raw.tests),
    nextCardId: Number(raw.nextId),
  });
}

function encodeRawData(data) {
  const valid = validateDeckData(data);

  return {
    questions: JSON.stringify(valid.questions),
    reviews: JSON.stringify(valid.reviewProgress),
    tests: JSON.stringify(valid.testHistory),
    nextId: String(valid.nextCardId),
  };
}

// The active deck uses the original falconry_* keys.
function readActiveDeckData() {
  const raw = {
    questions: localStorage.getItem(CURRENT_KEYS.questions) ?? '[]',

    reviews: localStorage.getItem(CURRENT_KEYS.reviews) ?? '{}',

    tests: localStorage.getItem(CURRENT_KEYS.tests) ?? '[]',

    nextId: localStorage.getItem(CURRENT_KEYS.nextId) ?? '0',
  };

  return decodeRawData(raw);
}

// Inactive decks use saved snapshots.
function readInactiveDeckData(deckId) {
  const saved = localStorage.getItem(SNAPSHOT_PREFIX + deckId);

  if (saved === null) {
    throw new Error(`Missing saved data for deck: ${deckId}`);
  }

  return decodeRawData(JSON.parse(saved));
}

// ------------------------------------
// VALIDATE DECK LIBRARY
// ------------------------------------

function validateDecks(decks, activeDeckId) {
  if (!Array.isArray(decks) || decks.length === 0) {
    throw new Error('No valid decks were found.');
  }

  const ids = new Set();

  for (const deck of decks) {
    if (
      !isObject(deck) ||
      typeof deck.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(deck.id) ||
      typeof deck.name !== 'string' ||
      !deck.name.trim()
    ) {
      throw new Error('Invalid deck information.');
    }

    if (ids.has(deck.id)) {
      throw new Error('Duplicate deck IDs found.');
    }

    ids.add(deck.id);
  }

  if (!ids.has(activeDeckId)) {
    throw new Error('The active deck does not exist in the backup.');
  }
}

// ------------------------------------
// CREATE MULTI-DECK BACKUP
// ------------------------------------

function createBackup() {
  const storedDecks = localStorage.getItem(DECKS_KEY);

  const decks = storedDecks
    ? JSON.parse(storedDecks)
    : [{ id: 'falconry', name: 'Falconry' }];

  const activeDeckId = localStorage.getItem(ACTIVE_DECK_KEY) || 'falconry';

  validateDecks(decks, activeDeckId);

  const backupDecks = decks.map((deck) => {
    const data =
      deck.id === activeDeckId
        ? readActiveDeckData()
        : readInactiveDeckData(deck.id);

    return {
      id: deck.id,
      name: deck.name,
      data,
    };
  });

  return {
    app: APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    activeDeckId,
    decks: backupDecks,
  };
}

// ------------------------------------
// VALIDATE V2 BACKUP
// ------------------------------------

function validateV2Backup(backup) {
  if (
    !isObject(backup) ||
    backup.app !== APP_ID ||
    backup.version !== BACKUP_VERSION
  ) {
    throw new Error('This is not a supported StudyDeck backup.');
  }

  validateDecks(backup.decks, backup.activeDeckId);

  const decks = backup.decks.map((deck) => ({
    id: deck.id,
    name: deck.name,
    data: validateDeckData(deck.data),
  }));

  return {
    app: APP_ID,
    version: BACKUP_VERSION,
    activeDeckId: backup.activeDeckId,
    decks,
  };
}

// ------------------------------------
// SUPPORT OLDER FALCONRY BACKUPS
// ------------------------------------

// Older backups contained one Falconry deck.
// Restore them into Falconry without deleting
// unrelated decks.
function parseBackupFile(backup) {
  if (backup?.app === APP_ID && backup?.version === BACKUP_VERSION) {
    return {
      kind: 'full',
      backup: validateV2Backup(backup),
    };
  }

  if (backup?.app === 'falconry-study' && backup?.version === 1) {
    return {
      kind: 'legacy',
      backup: {
        data: validateDeckData(backup.data),
        exportedAt: backup.exportedAt,
      },
    };
  }

  throw new Error('Unsupported backup file. Please select a StudyDeck backup.');
}

// Convert an old one-deck backup into the
// current multi-deck format, keeping other decks.
function mergeLegacyBackup(legacyData) {
  const current = createBackup();

  const falconryIndex = current.decks.findIndex(
    (deck) => deck.id === 'falconry',
  );

  const falconryDeck = {
    id: 'falconry',
    name: 'Falconry',
    data: legacyData,
  };

  if (falconryIndex >= 0) {
    current.decks[falconryIndex] = {
      ...current.decks[falconryIndex],
      data: legacyData,
    };
  } else {
    current.decks.push(falconryDeck);
  }

  return validateV2Backup(current);
}

// ------------------------------------
// RESTORE ALL DECKS
// ------------------------------------

function applyBackup(backup) {
  const valid = validateV2Backup(backup);

  const activeDeck = valid.decks.find((deck) => deck.id === valid.activeDeckId);

  const activeData = encodeRawData(activeDeck.data);

  // Prepare all writes before changing storage.
  const updates = new Map();

  for (const deck of valid.decks) {
    updates.set(
      SNAPSHOT_PREFIX + deck.id,
      JSON.stringify(encodeRawData(deck.data)),
    );
  }

  updates.set(CURRENT_KEYS.questions, activeData.questions);

  updates.set(CURRENT_KEYS.reviews, activeData.reviews);

  updates.set(CURRENT_KEYS.tests, activeData.tests);

  updates.set(CURRENT_KEYS.nextId, activeData.nextId);

  updates.set(
    DECKS_KEY,
    JSON.stringify(
      valid.decks.map(({ id, name }) => ({
        id,
        name,
      })),
    ),
  );

  updates.set(ACTIVE_DECK_KEY, valid.activeDeckId);

  // Remove old snapshots that are not
  // included in this restored library.
  const validSnapshotKeys = new Set(
    valid.decks.map((deck) => SNAPSHOT_PREFIX + deck.id),
  );

  const obsoleteKeys = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);

    if (key?.startsWith(SNAPSHOT_PREFIX) && !validSnapshotKeys.has(key)) {
      obsoleteKeys.push(key);
    }
  }

  const changedKeys = new Set([...updates.keys(), ...obsoleteKeys]);

  // Remember previous values in case
  // a storage write fails.
  const previous = new Map();

  for (const key of changedKeys) {
    previous.set(key, localStorage.getItem(key));
  }

  try {
    for (const [key, value] of updates) {
      localStorage.setItem(key, value);
    }

    for (const key of obsoleteKeys) {
      localStorage.removeItem(key);
    }
  } catch {
    let rollbackFailed = false;

    for (const [key, value] of previous) {
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
        ? 'Restore failed and recovery was incomplete. Keep your backup file.'
        : 'Restore failed. Previous data was recovered.',
    );
  }
}

// ------------------------------------
// COMPONENT
// ------------------------------------

function BackupRestore() {
  const [pendingBackup, setPendingBackup] = useState(null);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // ------------------------------------
  // EXPORT
  // ------------------------------------

  const exportBackup = async () => {
    setMessage('');
    setError('');

    try {
      const backup = createBackup();

      const json = JSON.stringify(backup, null, 2);

      const filename =
        'studydeck-backup-' + new Date().toISOString().slice(0, 10) + '.json';

      const file = new File([json], filename, { type: 'application/json' });

      // iPhone native share sheet
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'StudyDeck Backup',
          });

          setMessage(
            'Sharing completed. Check that your backup was saved in Files.',
          );
        } catch (err) {
          if (err.name === 'AbortError') {
            setMessage('Export canceled.');
          } else {
            setError('Unable to share backup. Try exporting from Safari.');
          }
        }

        return;
      }

      // Browser download fallback
      const url = URL.createObjectURL(file);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 30000);

      setMessage('Backup download requested. Check Downloads.');
    } catch (err) {
      setError(err.message || 'Unable to export backup.');
    }
  };

  // ------------------------------------
  // SELECT BACKUP FILE
  // ------------------------------------

  const selectBackup = async (event) => {
    const input = event.target;
    const file = input.files?.[0];

    if (!file) return;

    setError('');
    setMessage('');
    setPendingBackup(null);

    try {
      if (file.size > 20 * 1024 * 1024) {
        throw new Error('Backup file exceeds the 20 MB limit.');
      }

      const text = await file.text();
      const parsed = JSON.parse(text);

      if (Array.isArray(parsed)) {
        throw new Error(
          'This is a question-only JSON file. Import it from Flashcards instead.',
        );
      }

      const result = parseBackupFile(parsed);

      setPendingBackup({
        filename: file.name,
        ...result,
      });
    } catch (err) {
      setError(err.message || 'Unable to read backup.');
    } finally {
      input.value = '';
    }
  };

  // ------------------------------------
  // RESTORE
  // ------------------------------------

  const restoreBackup = () => {
    if (!pendingBackup) return;

    const isLegacy = pendingBackup.kind === 'legacy';

    const warning = isLegacy
      ? 'Restore the Falconry deck from this older backup?\n\n' +
        'Other decks will remain unchanged. Current Falconry data will be replaced.'
      : 'Restore ALL decks from this backup?\n\n' +
        'This replaces the current deck library, including all questions, reviews, and test history.';

    if (!window.confirm(warning)) return;

    try {
      const backup = isLegacy
        ? mergeLegacyBackup(pendingBackup.backup.data)
        : pendingBackup.backup;

      applyBackup(backup);

      // App.jsx keeps its deck list in React state.
      // Reload to initialize that state from
      // the newly restored library.
      window.alert('Backup restored successfully! StudyDeck will reload.');

      window.location.reload();
    } catch (err) {
      setError(err.message || 'Unable to restore backup.');
    }
  };

  const isLegacy = pendingBackup?.kind === 'legacy';

  const previewDecks = pendingBackup
    ? isLegacy
      ? [
          {
            id: 'falconry',
            name: 'Falconry',
            data: pendingBackup.backup.data,
          },
        ]
      : pendingBackup.backup.decks
    : [];

  const totalQuestions = previewDecks.reduce(
    (total, deck) => total + deck.data.questions.length,
    0,
  );

  const totalTests = previewDecks.reduce(
    (total, deck) => total + deck.data.testHistory.length,
    0,
  );

  return (
    <div className='backup-page'>
      <h2>Backup & Restore</h2>

      <p>
        Save all your study decks, questions, review progress, and test results.
      </p>

      {error && (
        <p className='error' role='alert'>
          {error}
        </p>
      )}

      {message && <p role='status'>{message}</p>}

      {/* EXPORT SECTION */}

      <section
        style={{
          padding: 20,
          marginBottom: 20,
          background: '#f5f7f5',
          border: '1px solid #dce5dd',
          borderRadius: 14,
        }}
      >
        <h3>Export All Decks</h3>

        <p>
          Create one backup containing every deck, including all questions,
          review progress, and practice test history.
        </p>

        <button
          type='button'
          onClick={exportBackup}
          style={{
            width: '100%',
            padding: 15,
            background: '#263c31',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            fontWeight: 600,
          }}
        >
          Export Complete Backup
        </button>
      </section>

      {/* RESTORE SECTION */}

      <section
        style={{
          padding: 20,
          border: '1px solid #dce5dd',
          borderRadius: 14,
        }}
      >
        <h3>Restore Backup</h3>

        <p>Select a StudyDeck backup file to preview its contents.</p>

        <input
          type='file'
          accept='.json,application/json'
          onChange={selectBackup}
          style={{
            width: '100%',
            marginTop: 12,
          }}
        />

        {pendingBackup && (
          <div
            style={{
              marginTop: 20,
              padding: 16,
              background: '#e8efe9',
              borderRadius: 10,
            }}
          >
            <h4>Backup Preview</h4>

            <p>
              <strong>File:</strong> {pendingBackup.filename}
            </p>

            <p>
              <strong>Decks:</strong> {previewDecks.length}
            </p>

            <p>
              <strong>Questions:</strong> {totalQuestions}
            </p>

            <p>
              <strong>Practice Tests:</strong> {totalTests}
            </p>

            <h4>Included Decks</h4>

            <ul>
              {previewDecks.map((deck) => (
                <li key={deck.id}>
                  {deck.name} — {deck.data.questions.length} questions
                </li>
              ))}
            </ul>

            {isLegacy ? (
              <p style={{ color: '#8a4b20' }}>
                This is an older Falconry backup. Restoring it will replace
                Falconry data but keep your other decks.
              </p>
            ) : (
              <p style={{ color: '#a52a2a' }}>
                Restoring will replace every deck currently saved on this
                device.
              </p>
            )}

            <button
              type='button'
              onClick={restoreBackup}
              style={{
                width: '100%',
                padding: 14,
                background: '#263c31',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              Restore Backup
            </button>

            <button
              type='button'
              onClick={() => setPendingBackup(null)}
              style={{
                width: '100%',
                padding: 12,
                marginTop: 8,
                background: 'white',
                border: '1px solid #ccc',
                borderRadius: 10,
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default BackupRestore;
