import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginButton } from '../components/auth/LoginButton';
import { useAuth } from '../hooks/useAuth';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { isAuthenticated, isLoading, error, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Plex Media Dashboard</h1>
      <p className={styles.subtitle}>
        Connect your Plex account to browse your movies and TV shows
      </p>

      <LoginButton onClick={login} isLoading={isLoading} />

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
