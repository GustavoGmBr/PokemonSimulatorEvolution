## Pokémon Simulator Evolution 1.0.0

Primeira versão publicada, agora com executável para Windows.

### Como usar

1. Baixe `PokemonSimulatorEvolution.exe` e coloque numa pasta junto da pasta `recursos/` (imagens e músicas do jogo).
2. Abra o `.exe`: ele atualiza o jogo se houver versão nova, abre o navegador em **http://127.0.0.1:34600** e fica escondido na **bandeja do Windows**.
3. Clique no ícone da bandeja para abrir o jogo; clique com o botão direito para atualizar, ligar "Iniciar com o Windows", abrir as pastas de recursos e de logs ou sair.

### Detalhes

- Usa a mesma porta do Pokémon Simulator Remake (**34600**); se estiver ocupada, usa a próxima livre.
- Só uma cópia roda por vez; abrir o `.exe` de novo apenas reabre o jogo no navegador.
- Atualizações vêm destas Releases, com conferência de integridade (SHA-256). O `.exe` também verifica a cada 6 horas e avisa na bandeja.
- Os saves ficam no navegador, por endereço: use sempre `127.0.0.1:34600` (saves de `localhost:5173`, do modo de desenvolvimento, não aparecem lá — exporte e importe pelo menu **Gerenciar saves**).
- `--no-update` pula a busca de atualização, `--background` não abre o navegador e `--stop` encerra o jogo aberto.
