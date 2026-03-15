import { useState } from 'react';
import LoginScreen from './components/LoginScreen.jsx';
import BankingInterface from './components/BankingInterface.jsx';

export default function App() {
  const [session, setSession] = useState(null);

  const handleLogin = (sessionData) => {
    setSession(sessionData);
  };

  const handleLogout = () => {
    setSession(null);
  };

  return session ? (
    <BankingInterface session={session} onLogout={handleLogout} />
  ) : (
    <LoginScreen onLogin={handleLogin} />
  );
}
