import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { AuthProvider } from './context/AuthContext';
import CatLoader from './components/CatLoader';
import './index.css';

export default function App() {
  const [loaderState, setLoaderState] = useState('visible'); // 'visible' | 'fading' | 'gone'

  function handleLoaderDone() {
    setLoaderState('fading');
    // Matches CatLoader's 0.3s opacity transition, so it unmounts as the fade ends.
    setTimeout(() => setLoaderState('gone'), 300);
  }

  return (
    <>
      {loaderState !== 'gone' && (
        <CatLoader onDone={handleLoaderDone} fading={loaderState === 'fading'} />
      )}
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </>
  );
}
