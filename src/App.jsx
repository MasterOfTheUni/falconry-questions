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
} from 'react-icons/fa';

import Flashcards from './components/Flashcards';
import Review from './components/Review';
import PracticeTest from './components/PracticeTest';
import Progress from './components/Progress';
import BackupRestore from './components/BackupRestore';

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

function App() {
  const [page, setPage] = useState('home');

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
        return (
          <>
            <div className='welcome'>
              <h2>Ready to study?</h2>
              <p>Build your knowledge one card at a time.</p>
            </div>

            <div className='dashboard-grid'>
              {sections.map((section) => {
                const Icon = section.icon;

                return (
                  <button
                    key={section.id}
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

              <strong>Backup & Restore</strong>
            </button>
          </>
        );
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
            <h1>Falconry Study</h1>
            <p>Utah Falconry Exam Prep</p>
          </div>
        </div>
      </header>

      <main className='content'>{renderPage()}</main>

      <nav className='bottom-nav' aria-label='Main navigation'>
        <button
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
