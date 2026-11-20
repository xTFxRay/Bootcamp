import { useEffect, useState } from 'react';
import { request } from '../api.js';

export default function HomePage() {
  const [serverMessage, setServerMessage] = useState('Connecting to server…');

  useEffect(() => {
    request('/health')
      .then((data) => setServerMessage(data.message))
      .catch((err) => setServerMessage(err.message));
  }, []);

  return (
    <main className="page page-narrow">
      <h1>Bootcamp App</h1>
      <p>Your app is up and running.</p>
      <p className="status">Server says: {serverMessage}</p>
    </main>
  );
}
