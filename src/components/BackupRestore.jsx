import { useState } from 'react';

const STORAGE_KEYS = {
  questions: 'falconry_questions',
  reviewProgress: 'falconry_review_progress',
  testHistory: 'falconry_test_history',
  nextCardId: 'falconry_next_card_id',
};

const APP_ID = 'falconry-study';
const BACKUP_VERSION = 1;

function readJSON(key, fallback) {
  const stored = localStorage.getItem(key);

  if (stored === null) return fallback;

  return JSON.parse(stored);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Validate before importing or exporting.
function validateBackup(backup) {
  if (
    !isObject(backup) ||
    backup.app !== APP_ID ||
    backup.version !== BACKUP_VERSION ||
    !isObject(backup.data)
  ) {
    throw new Error('This is not a supported Falconry Study backup.');
  }

  const { questions, reviewProgress, testHistory, nextCardId } = backup.data;

  if (
    !Array.isArray(questions) ||
    !isObject(reviewProgress) ||
    !Array.isArray(testHistory) ||
    !Number.isSafeInteger(nextCardId) ||
    nextCardId < 0
  ) {
    throw new Error('The backup contains missing or invalid data.');
  }

  if (questions.some((card) => !isObject(card) || card.id == null)) {
    throw new Error('The backup contains invalid flashcards.');
  }

  const ids = questions.map((card) => String(card.id));

  if (new Set(ids).size !== ids.length) {
    throw new Error('The backup contains duplicate question IDs.');
  }

  return backup.data;
}

// Gather all saved study data.
function createBackup() {
  const backup = {
    app: APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),

    data: {
      questions: readJSON(STORAGE_KEYS.questions, []),

      reviewProgress: readJSON(STORAGE_KEYS.reviewProgress, {}),

      testHistory: readJSON(STORAGE_KEYS.testHistory, []),

      nextCardId: Number(localStorage.getItem(STORAGE_KEYS.nextCardId) ?? 0),
    },
  };

  validateBackup(backup);

  return backup;
}

function BackupRestore() {
  const [pendingBackup, setPendingBackup] = useState(null);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // ---------------------------------
  // EXPORT BACKUP
  // ---------------------------------

  const exportBackup = async () => {
    setMessage('');
    setError('');

    try {
      const backup = createBackup();

      const json = JSON.stringify(backup, null, 2);

      const date = new Date().toISOString().slice(0, 10);

      const filename = `falconry-backup-${date}.json`;

      const file = new File([json], filename, { type: 'application/json' });

      // Use the native share sheet when
      // the device supports file sharing.
      if (
        navigator.share &&
        navigator.canShare?.({
          files: [file],
        })
      ) {
        try {
          await navigator.share({
            files: [file],
            title: 'Falconry Study Backup',
          });

          setMessage(
            'Sharing completed. Check that your backup was saved in Files.',
          );
        } catch (shareError) {
          if (shareError.name === 'AbortError') {
            setMessage('Export canceled.');
          } else {
            setError('Unable to share the backup. Try exporting in Safari.');
          }
        }

        return;
      }

      // Fallback for browsers without
      // native file sharing.
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

      setMessage('Backup download requested. Check your Downloads folder.');
    } catch (err) {
      setError(err.message || 'Unable to export backup.');
    }
  };

  // ---------------------------------
  // SELECT BACKUP FILE
  // ---------------------------------

  const selectBackup = async (event) => {
    const input = event.target;
    const file = input.files?.[0];

    if (!file) return;

    setError('');
    setMessage('');
    setPendingBackup(null);

    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Backup files must be smaller than 10 MB.');
      }

      const text = await file.text();
      const backup = JSON.parse(text);

      if (Array.isArray(backup)) {
        throw new Error(
          'This looks like a question-only JSON file. Import it from Flashcards instead.',
        );
      }

      validateBackup(backup);

      // Only preview the backup here.
      // Do not overwrite anything yet.
      setPendingBackup({
        filename: file.name,
        backup,
      });
    } catch (err) {
      setError(err.message || 'Unable to read backup.');
    } finally {
      input.value = '';
    }
  };

  // ---------------------------------
  // RESTORE BACKUP
  // ---------------------------------

  const restoreBackup = () => {
    if (!pendingBackup) return;

    const confirmed = window.confirm(
      'Restore this backup?\n\n' +
        'This will replace ALL questions, review progress, and test history currently saved on this device.',
    );

    if (!confirmed) return;

    try {
      const data = validateBackup(pendingBackup.backup);

      const updatedValues = {
        [STORAGE_KEYS.questions]: JSON.stringify(data.questions),

        [STORAGE_KEYS.reviewProgress]: JSON.stringify(data.reviewProgress),

        [STORAGE_KEYS.testHistory]: JSON.stringify(data.testHistory),

        [STORAGE_KEYS.nextCardId]: String(data.nextCardId),
      };

      // Preserve current values in case
      // writing a restored value fails.
      const previousValues = {};

      for (const key of Object.keys(updatedValues)) {
        previousValues[key] = localStorage.getItem(key);
      }

      try {
        for (const [key, value] of Object.entries(updatedValues)) {
          localStorage.setItem(key, value);
        }
      } catch (writeError) {
        // Attempt to roll back all changes.
        let rollbackSucceeded = true;

        for (const [key, value] of Object.entries(previousValues)) {
          try {
            if (value === null) {
              localStorage.removeItem(key);
            } else {
              localStorage.setItem(key, value);
            }
          } catch {
            rollbackSucceeded = false;
          }
        }

        throw new Error(
          rollbackSucceeded
            ? 'Restore failed. Previous data was restored.'
            : 'Restore failed and rollback was incomplete. Check your saved data.',
        );
      }

      setPendingBackup(null);
      setError('');

      setMessage(
        'Backup restored successfully! Open Flashcards or Progress to see your restored data.',
      );
    } catch (err) {
      setError(err.message || 'Unable to restore backup.');
    }
  };

  const pendingData = pendingBackup?.backup.data;

  return (
    <div
      className='backup-page'
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <h2>Backup & Restore</h2>

      <p>
        Keep a copy of your questions and study progress so you can restore them
        if needed.
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
          border: '1px solid #dce5dd',
          borderRadius: 14,
          background: '#f5f7f5',
        }}
      >
        <h3>Export Your Data</h3>

        <p>Create a JSON backup containing:</p>

        <ul>
          <li>All flashcards</li>
          <li>Edited and newly created questions</li>
          <li>Review progress and due dates</li>
          <li>Practice test history</li>
        </ul>

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
          Export Backup
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
        <h3>Restore Your Data</h3>

        <p>Select a previously exported Falconry Study backup file.</p>

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
            <h4>Backup Ready to Restore</h4>

            <p>
              <strong>File:</strong> {pendingBackup.filename}
            </p>

            <p>
              <strong>Questions:</strong> {pendingData.questions.length}
            </p>

            <p>
              <strong>Tests:</strong> {pendingData.testHistory.length}
            </p>

            <p>
              <strong>Created:</strong>{' '}
              {pendingBackup.backup.exportedAt
                ? new Date(pendingBackup.backup.exportedAt).toLocaleString()
                : 'Unknown'}
            </p>

            <p
              style={{
                color: '#a52a2a',
                fontSize: 14,
              }}
            >
              Restoring will replace your current data on this device.
            </p>

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
              Restore This Backup
            </button>

            <button
              type='button'
              onClick={() => setPendingBackup(null)}
              style={{
                width: '100%',
                padding: 12,
                marginTop: 8,
                border: '1px solid #ccc',
                borderRadius: 10,
                background: 'white',
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
