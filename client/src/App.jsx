import { useState, useEffect, useCallback } from 'react';
import ProfileForm from './components/ProfileForm';
import GapDashboard from './components/GapDashboard';
import { fetchProfile } from './api';
import './App.css';

export default function App() {
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState('profile'); // 'profile' | 'dashboard'
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(() => {
    fetchProfile()
      .then((p) => {
        if (p) {
          setProfile(p);
          setView('dashboard');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  function handleProfileSaved(p) {
    if (p === null) {
      // Resume was uploaded/reparsed — re-fetch from SQLite
      setLoading(true);
      loadProfile();
      return;
    }
    setProfile(p);
    setView('dashboard');
  }

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <span className="logo">Skill-Bridge Career Navigator</span>
          <nav>
            <button
              className={view === 'profile' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setView('profile')}
            >
              My Profile
            </button>
            {profile && (
              <button
                className={view === 'dashboard' ? 'nav-btn active' : 'nav-btn'}
                onClick={() => setView('dashboard')}
              >
                My Feedback
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="app-main">
        {view === 'profile' && (
          <ProfileForm profile={profile} onSaved={handleProfileSaved} />
        )}
        {view === 'dashboard' && profile && (
          <GapDashboard profile={profile} />
        )}
      </main>
    </div>
  );
}
