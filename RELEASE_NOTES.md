## Pokémon Simulator Evolution 1.0.1

### Como instalar

Baixe **`PokemonSimulatorEvolution-v1.0.1-full-win-x64.zip`**, extraia onde quiser e abra `PokemonSimulatorEvolution.exe`. A pasta já vem completa: o executável e a pasta `recursos/` (sprites, mapas, itens e músicas) lado a lado.

(`PokemonSimulatorEvolution.exe` solto é só o executável: é o que a atualização automática baixa. Use-o apenas se você já tem a pasta `recursos/`.)

### Como funciona

- Ao abrir, o `.exe` atualiza o jogo se houver versão nova, abre o navegador em **http://127.0.0.1:34600** (a mesma porta do Pokémon Simulator Remake; se estiver ocupada, usa a próxima livre) e fica escondido na **bandeja do Windows**.
- Clique no ícone da bandeja para abrir o jogo; com o botão direito: atualizar, "Iniciar com o Windows", abrir as pastas de recursos e de logs, sair.
- Só uma cópia roda por vez; abrir o `.exe` de novo apenas reabre o jogo no navegador.
- Atualizações vêm destas Releases, com conferência de integridade (SHA-256); o `.exe` verifica a cada 6 horas e avisa na bandeja.
- Os saves ficam no navegador, por endereço: use sempre `127.0.0.1:34600` (saves de `localhost:5173`, do modo de desenvolvimento, precisam ser exportados e importados em **Gerenciar saves**).
- Opções de linha de comando: `--no-update`, `--background` (não abre o navegador) e `--stop` (encerra o jogo aberto).

### Novidades

- **Pokémon inicial:** numa jornada nova só dá para escolher entre os iniciais de Kanto. Os iniciais de todas as gerações são liberados no **Novo Jogo+**, depois de zerar o jogo.
- Pacote completo da release (pasta do jogo com o `.exe` e os recursos).

### Segurança da atualização

O `.exe` só aceita atualizações que tenham o arquivo `.sha256` correspondente, e troca o executável sem apagar `recursos/` nem os saves.
