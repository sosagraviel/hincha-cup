import { useState } from 'react';

export function Login(): JSX.Element {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  return (
    <form>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
      <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" />
      <button>Sign in with Firebase</button>
    </form>
  );
}
