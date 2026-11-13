package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func fullAssets(tag string) []string {
	return []string{fullAsset(tag), fullAsset(tag) + ".sha256"}
}

func TestPickFullRelease(t *testing.T) {
	releases := []ghRelease{
		release("v1.0.0", false, exeName, exeName+".sha256"),
		release("v1.1.0", false, fullAssets("v1.1.0")...),
		release("v1.2.1", false, fullAssets("v1.2.1")...),
		release("v1.3.0", false, updateAssets("v1.3.0")...), // sem pacote completo
		release("v1.4.0-beta.1", false, fullAssets("v1.4.0-beta.1")...),
		release("v1.5.0", true, fullAssets("v1.5.0")...), // rascunho
	}
	got, ok := pickFullRelease(releases, mustSemver(t, "1.2.1"))
	if !ok || got.Tag != "v1.2.1" {
		t.Fatalf("esperava v1.2.1 (a do próprio .exe), veio %q %v", got.Tag, ok)
	}
	if _, ok := pickFullRelease(releases[:1], mustSemver(t, "1.2.1")); ok {
		t.Error("não há pacote completo nas releases antigas")
	}
}

func TestNeedsBootstrap(t *testing.T) {
	t.Setenv("POKESIM_NODE", "")
	t.Setenv("PATH", "")
	root := t.TempDir()
	if !needsBootstrap(root) {
		t.Error("pasta vazia precisa do jogo")
	}
	root, _ = installation(t)
	if needsBootstrap(root) {
		t.Error("instalação completa não precisa")
	}
	_ = os.Remove(filepath.Join(root, "runtime", "node.exe"))
	if !needsBootstrap(root) {
		t.Error("sem o Node.js precisa baixar de novo")
	}
}

func fullPackage(t *testing.T) []byte {
	return makeZip(t, map[string][]byte{
		"PokemonSimulatorEvolution/" + exeName:              bigExe(),
		"PokemonSimulatorEvolution/runtime/node.exe":        []byte("node novo"),
		"PokemonSimulatorEvolution/app/server.mjs":          []byte("servidor novo"),
		"PokemonSimulatorEvolution/app/web/index.html":      []byte("interface nova"),
		"PokemonSimulatorEvolution/recursos/Pokemons/1.png": []byte("png novo"),
		"PokemonSimulatorEvolution/saves/game.db":           []byte("NAO PODE"),
		"PokemonSimulatorEvolution/LEIAME.md":               []byte("leiame"),
	})
}

func bootstrapServer(t *testing.T, tag string, archive []byte, tamper bool) {
	t.Helper()
	sum := sha256.Sum256(archive)
	if tamper {
		sum[0] ^= 0xff
	}
	mux := http.NewServeMux()
	var base string
	mux.HandleFunc("/repos/"+repository+"/releases", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]ghRelease{{Tag: tag, Assets: []ghAsset{
			{Name: fullAsset(tag), URL: base + "/zip"}, {Name: fullAsset(tag) + ".sha256", URL: base + "/sha"},
		}}})
	})
	mux.HandleFunc("/zip", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(archive) })
	mux.HandleFunc("/sha", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(hex.EncodeToString(sum[:]) + "  " + fullAsset(tag)))
	})
	api := httptest.NewServer(mux)
	t.Cleanup(api.Close)
	base = api.URL
	t.Setenv("POKESIM_UPDATE_API", api.URL)
}

func TestBootstrapInstallsGame(t *testing.T) {
	bootstrapServer(t, "v1.2.1", fullPackage(t), false)
	root := t.TempDir()
	exe := filepath.Join(root, exeName)
	_ = os.WriteFile(exe, []byte("exe novo"), 0o755)
	u := &updater{installed: mustSemver(t, "1.2.1"), root: root, exe: exe, log: t.Logf}
	tag, err := u.bootstrap(context.Background(), false)
	if err != nil || tag != "v1.2.1" {
		t.Fatalf("bootstrap = %q %v", tag, err)
	}
	for file, want := range map[string]string{
		"runtime/node.exe": "node novo", "app/server.mjs": "servidor novo", "app/web/index.html": "interface nova",
		"recursos/Pokemons/1.png": "png novo", exeName: "exe novo", "saves/game.db": "<ausente>",
	} {
		if got := read(t, filepath.Join(root, filepath.FromSlash(file))); got != want {
			t.Errorf("%s = %q, esperado %q", file, got, want)
		}
	}
	for _, leftover := range []string{"bootstrap.zip", "bootstrap.tmp"} {
		if _, err := os.Stat(filepath.Join(root, leftover)); err == nil {
			t.Errorf("sobrou %s", leftover)
		}
	}
}

func TestBootstrapKeepsExistingRecursos(t *testing.T) {
	bootstrapServer(t, "v1.2.1", fullPackage(t), false)
	root := t.TempDir()
	_ = os.MkdirAll(filepath.Join(root, "recursos"), 0o755)
	_ = os.WriteFile(filepath.Join(root, "recursos", "meu.png"), []byte("meu"), 0o644)
	u := &updater{installed: mustSemver(t, "1.2.1"), root: root, exe: filepath.Join(root, exeName), log: t.Logf}
	if _, err := u.bootstrap(context.Background(), true); err != nil {
		t.Fatal(err)
	}
	if read(t, filepath.Join(root, "recursos/meu.png")) != "meu" || read(t, filepath.Join(root, "recursos/Pokemons/1.png")) != "<ausente>" {
		t.Error("os recursos do jogador não podem ser trocados")
	}
	if read(t, filepath.Join(root, "app/server.mjs")) != "servidor novo" {
		t.Error("o jogo deveria ter sido instalado")
	}
}

func TestBootstrapRejectsTamperedAndBadPackages(t *testing.T) {
	root := t.TempDir()
	u := &updater{installed: mustSemver(t, "1.2.1"), root: root, exe: filepath.Join(root, exeName), log: t.Logf}

	bootstrapServer(t, "v1.2.1", fullPackage(t), true)
	if _, err := u.bootstrap(context.Background(), false); err == nil {
		t.Error("download adulterado deveria ser recusado")
	}
	if _, err := os.Stat(filepath.Join(root, "app")); err == nil {
		t.Error("nada deveria ser instalado")
	}

	bootstrapServer(t, "v1.2.1", makeZip(t, map[string][]byte{"PokemonSimulatorEvolution/../../fora.txt": []byte("x")}), false)
	if _, err := u.bootstrap(context.Background(), false); err == nil {
		t.Error("caminho fora da pasta deveria ser recusado")
	}
	bootstrapServer(t, "v1.2.1", makeZip(t, map[string][]byte{"PokemonSimulatorEvolution/app/server.mjs": []byte("x")}), false)
	if _, err := u.bootstrap(context.Background(), false); err == nil {
		t.Error("pacote sem o Node.js deveria ser recusado")
	}
}
