import { useEffect, useState } from 'react';

export default function App() {
  const [serverMessage, setServerMessage] = useState('Connecting to server…');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((body) => setServerMessage(body.success ? body.data.message : body.error))
      .catch(() => setServerMessage('Could not reach the server.'));
  }, []);

  return (
    <main className="app">
      <h1>Bootcamp App</h1>
      <p>Your app is up and running.</p>
      <p className="status">Server says: {serverMessage}</p>
    </main>
  );
}
