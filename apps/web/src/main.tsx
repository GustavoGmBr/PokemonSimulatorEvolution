import '@fontsource-variable/manrope';
import '@fontsource-variable/space-grotesk';
import '@/styles/globals.css';
import '@/styles/game.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app';
import { startSettingsEffects } from '@/lib/settings';
import { loadTrainerSpriteFiles } from '@/lib/trainer-sprites';

startSettingsEffects();

// A lista de sprites de treinador vem da pasta recursos/Treinadores; os saves dependem dela para abrir.
void loadTrainerSpriteFiles().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
