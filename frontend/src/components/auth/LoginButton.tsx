import styles from './LoginButton.module.css';

interface LoginButtonProps {
  onClick: () => void;
  isLoading: boolean;
}

export function LoginButton({ onClick, isLoading }: LoginButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className={styles.button}
    >
      {isLoading ? 'Connecting...' : 'Sign in with Plex'}
    </button>
  );
}
