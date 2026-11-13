import { useState } from 'react';
import { embedUrl } from '@/lib/youtube-url';
import { gameStorage } from '@/lib/game-storage';

const storageKey = 'pokesim-evolution:video-dock';

type Saved = { url: string; open: boolean };

function load(): Saved {
  const open = false;
  try {
    const parsed = JSON.parse(gameStorage.getItem(storageKey) ?? '{}') as Partial<Saved>;
    return { url: typeof parsed.url === 'string' ? parsed.url : '', open: typeof parsed.open === 'boolean' ? parsed.open : open };
  } catch {
    return { url: '', open };
  }
}

function save(value: Saved) {
  try { gameStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* sem armazenamento: vale só nesta sessão */ }
}

/** Player do YouTube flutuante no canto: música, vídeos ou lives enquanto joga (ligado em Opções). */
export function VideoDock() {
  const [saved, setSaved] = useState<Saved>(load);
  const [draft, setDraft] = useState(saved.url);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState('');
  const src = embedUrl(saved.url);

  const change = (next: Saved) => { setSaved(next); save(next); };
  const play = () => {
    if (!embedUrl(draft)) { setError('Cole um link do YouTube (vídeo, live ou playlist).'); return; }
    setError('');
    change({ url: draft.trim(), open: true });
    setStarted(true);
  };

  return (
    <div className="video-dock" role="complementary" aria-label="Player de vídeo">
      <button type="button" className="video-dock__tab" aria-expanded={saved.open} onClick={() => change({ ...saved, open: !saved.open })}>
        {saved.open ? '▾ Vídeo' : '▸ Vídeo'}{started && !saved.open ? ' ♪' : ''}
      </button>
      <div className="video-dock__panel" hidden={!saved.open}>
        <div className="video-dock__screen">
          {started && src ? (
            <iframe
              className="video-dock__frame"
              src={src}
              title="Player do YouTube"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <p className="video-dock__empty">Cole um link do YouTube abaixo para tocar música, vídeos ou lives enquanto joga.</p>
          )}
        </div>
        <form className="video-dock__form" onSubmit={(event) => { event.preventDefault(); play(); }}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Link do vídeo (YouTube)" aria-label="Link do vídeo do YouTube" spellCheck={false} />
          <button type="submit" aria-label="Tocar">▶</button>
          {started && <button type="button" onClick={() => setStarted(false)} aria-label="Parar">■</button>}
        </form>
        {error && <p className="video-dock__error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
