## Pokémon Simulator Evolution 1.1.0

### Como instalar

Baixe **`PokemonSimulatorEvolution-v1.1.0-full-win-x64.zip`**, extraia onde quiser e abra `PokemonSimulatorEvolution.exe`. A pasta já vem completa: o executável, o Node.js embutido (`runtime/`), o jogo (`app/`) e as imagens e músicas (`recursos/`). Não precisa instalar nada.

(`PokemonSimulatorEvolution-v1.1.0-update-win-x64.zip` é o pacote que a atualização automática baixa; não precisa baixá-lo à mão.)

### Como funciona

- Ao abrir, o `.exe` atualiza o jogo se houver versão nova, abre o navegador em **http://127.0.0.1:34600** (a mesma porta do Pokémon Simulator Remake; se estiver ocupada, usa a próxima livre) e fica escondido na **bandeja do Windows**.
- Clique no ícone da bandeja para abrir o jogo; com o botão direito: atualizar, "Iniciar com o Windows", abrir as pastas de recursos, saves e logs, sair.
- Só uma cópia roda por vez; abrir o `.exe` de novo apenas reabre o jogo no navegador.
- Atualizações vêm destas Releases, com conferência de integridade (SHA-256); o `.exe` verifica a cada 6 horas e avisa na bandeja. A atualização troca só o `.exe` e a pasta `app/`: saves e `recursos/` ficam como estão.
- Opções de linha de comando: `--no-update`, `--background` (não abre o navegador) e `--stop` (encerra o jogo aberto).

### Novidades

- **Saves em banco SQLite**, como no jogo antigo: ficam em `saves/game.db`, ao lado do `.exe`, e não dependem mais do navegador nem do endereço. A cada início o jogo guarda uma cópia em `saves/backups/` (as 5 últimas). Para mudar de computador ou fazer backup, copie a pasta `saves/`.
- **Seus saves da 1.0.0 vêm junto:** na primeira abertura o jogo envia ao banco, uma única vez, o que seu navegador já guardava em `127.0.0.1:34600`.
- **Mesma arquitetura do jogo antigo:** launcher na bandeja + Node.js embutido + servidor local, em vez de um único executável.
- **Pokémon inicial:** numa jornada nova só dá para escolher entre os iniciais de Kanto. Os iniciais de todas as gerações são liberados no **Novo Jogo+**, depois de zerar o jogo.

### Atualizando da 1.0.0

A 1.0.0 era um único `.exe` e não consegue se atualizar para este formato. Baixe o pacote completo da 1.1.0 e extraia numa pasta nova; ao abrir, seus saves são migrados sozinhos. Depois disso as atualizações são automáticas.

### Segurança da atualização

O launcher só aceita atualizações que tenham o arquivo `.sha256` correspondente, recusa pacotes com arquivos fora de `app/` e troca os arquivos sem apagar `recursos/` nem `saves/`.
