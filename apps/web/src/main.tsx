import '@fontsource-variable/manrope';
import '@fontsource-variable/space-grotesk';
import '@/styles/globals.css';
import '@/styles/game.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app';
import { initGameStorage } from '@/lib/game-storage';
import { startSettingsEffects } from '@/lib/settings';
import { loadTrainerSpriteFiles } from '@/lib/trainer-sprites';

// Saves e preferências vêm do banco do servidor local; só depois a interface (e os temas) podem abrir.
// A lista de sprites de treinador vem da pasta recursos/Treinadores; os saves dependem dela para abrir.
void initGameStorage().then(() => {
  startSettingsEffects();
  return loadTrainerSpriteFiles();
}).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
