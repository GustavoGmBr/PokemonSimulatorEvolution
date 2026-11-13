package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func mustSemver(t *testing.T, text string) semver {
	t.Helper()
	v, ok := parseSemver(text)
	if !ok {
		t.Fatalf("versão inválida: %s", text)
	}
	return v
}

func TestSemverCompare(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"1.0.0", "1.0.0", 0}, {"1.0.1", "1.0.0", 1}, {"1.2.0", "1.10.0", -1}, {"2.0.0", "1.99.99", 1},
		{"1.0.0", "1.0.0-beta.1", 1}, {"1.0.0-beta.2", "1.0.0-beta.10", -1}, {"1.0.0-alpha", "1.0.0-beta", -1}, {"v1.0.0", "1.0.0", 0},
	}
	for _, c := range cases {
		if got := mustSemver(t, c.a).compare(mustSemver(t, c.b)); got != c.want {
			t.Errorf("%s vs %s = %d, esperado %d", c.a, c.b, got, c.want)
		}
	}
	if _, ok := parseSemver("dev"); ok {
		t.Error("dev não é versão")
	}
}

func release(tag string, draft bool, assets ...string) ghRelease {
	r := ghRelease{Tag: tag, Draft: draft}
	for _, name := range assets {
		r.Assets = append(r.Assets, ghAsset{Name: name, URL: "https://github.com/" + repository + "/releases/download/" + tag + "/" + name})
	}
	return r
}

func updateAssets(tag string) []string {
	return []string{updateAsset(tag), updateAsset(tag) + ".sha256"}
}

func TestPickRelease(t *testing.T) {
	releases := []ghRelease{
		release("v1.1.0", false, updateAssets("v1.1.0")...),
		release("v1.2.0", true, updateAssets("v1.2.0")...),                      // rascunho
		release("v1.3.0", false, updateAsset("v1.3.0")),                         // sem checksum
		release("v1.4.0-beta.1", false, updateAssets("v1.4.0-beta.1")...),       // pré-lançamento
		release("v0.9.0", false, updateAssets("v0.9.0")...),                     // antiga
		release("v1.5.0", false, assetPrefix+".exe", assetPrefix+".exe.sha256"), // formato antigo (só o .exe)
		release("not-a-version", false, updateAssets("not-a-version")...),
	}
	got, version, ok := pickRelease(releases, mustSemver(t, "1.0.0"))
	if !ok || got.Tag != "v1.1.0" || version.String() != "1.1.0" {
		t.Fatalf("esperava v1.1.0, veio %v %v %v", got.Tag, version, ok)
	}
	if _, _, ok := pickRelease(releases, mustSemver(t, "1.1.0")); ok {
		t.Error("não deveria haver atualização")
	}
	if got, _, ok := pickRelease(releases, mustSemver(t, "1.0.0-beta.1")); !ok || got.Tag != "v1.4.0-beta.1" {
		t.Errorf("quem usa beta recebe beta: %v", got.Tag)
	}
}

func TestVerifyChecksum(t *testing.T) {
	data := []byte("conteudo")
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	if err := verifyChecksum(data, hash+"  pacote.zip\n"); err != nil {
		t.Errorf("checksum válido recusado: %v", err)
	}
	if err := verifyChecksum([]byte("outro"), hash); err == nil {
		t.Error("conteúdo adulterado aceito")
	}
	if err := verifyChecksum(data, "lixo"); err == nil {
		t.Error("checksum inválido aceito")
	}
}

func TestReplaceExecutable(t *testing.T) {
	dir := t.TempDir()
	exe := filepath.Join(dir, "jogo.exe")
	if err := os.WriteFile(exe, []byte("antigo"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := replaceExecutable(exe, []byte("novo")); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(exe); string(data) != "novo" {
		t.Errorf("exe = %q", data)
	}
	if data, _ := os.ReadFile(exe + ".old"); string(data) != "antigo" {
		t.Errorf(".old = %q", data)
	}
}

// ---- pacote de atualização ----

func makeZip(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for name, data := range files {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = entry.Write(data)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func bigExe() []byte { return bytes.Repeat([]byte("x"), 2<<20) }

// installation cria uma pasta do jogo como a do pacote completo.
func installation(t *testing.T) (root, exe string) {
	t.Helper()
	root = t.TempDir()
	for name, content := range map[string]string{
		"app/server.mjs": "velho", "app/web/index.html": "velho", "app/web/assets/antigo.js": "x",
		"saves/game.db": "SAVES", "recursos/Pokemons/1.png": "png", "runtime/node.exe": "node",
	} {
		full := filepath.Join(root, filepath.FromSlash(name))
		_ = os.MkdirAll(filepath.Dir(full), 0o755)
		_ = os.WriteFile(full, []byte(content), 0o644)
	}
	exe = filepath.Join(root, exeName)
	_ = os.WriteFile(exe, []byte("exe antigo"), 0o755)
	return root, exe
}

func read(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		return "<ausente>"
	}
	return string(data)
}

func TestApplyUpdate(t *testing.T) {
	root, exe := installation(t)
	archive := makeZip(t, map[string][]byte{
		exeName: bigExe(), "app/server.mjs": []byte("novo"), "app/web/index.html": []byte("novo"), "app/web/assets/novo.js": []byte("y"),
		"LEIAME.md": []byte("leia"), "distribution.json": []byte("{}"),
	})
	if err := applyUpdate(root, exe, archive); err != nil {
		t.Fatal(err)
	}
	if read(t, filepath.Join(root, "app/server.mjs")) != "novo" || read(t, filepath.Join(root, "app/web/assets/novo.js")) != "y" {
		t.Error("app/ não foi atualizada")
	}
	if read(t, filepath.Join(root, "app/web/assets/antigo.js")) != "<ausente>" {
		t.Error("arquivo antigo de app/ sobrou")
	}
	if read(t, filepath.Join(root, "saves/game.db")) != "SAVES" || read(t, filepath.Join(root, "recursos/Pokemons/1.png")) != "png" || read(t, filepath.Join(root, "runtime/node.exe")) != "node" {
		t.Error("saves, recursos ou runtime foram alterados")
	}
	if read(t, filepath.Join(root, "LEIAME.md")) != "leia" || read(t, filepath.Join(root, "distribution.json")) != "{}" {
		t.Error("documentos não foram atualizados")
	}
	if len(read(t, exe)) != 2<<20 || read(t, exe+".old") != "exe antigo" {
		t.Error("executável não foi trocado")
	}
	for _, leftover := range []string{"update.tmp", "app.old"} {
		if _, err := os.Stat(filepath.Join(root, leftover)); err == nil {
			t.Errorf("sobrou %s", leftover)
		}
	}
}

func TestApplyUpdateRejectsBadPackages(t *testing.T) {
	good := map[string][]byte{"app/server.mjs": []byte("novo"), "app/web/index.html": []byte("novo")}
	with := func(extra string, data []byte) map[string][]byte {
		files := map[string][]byte{}
		for k, v := range good {
			files[k] = v
		}
		files[extra] = data
		return files
	}
	cases := map[string][]byte{
		"fora da pasta":      makeZip(t, with("../fora.txt", []byte("x"))),
		"saves":              makeZip(t, with("saves/game.db", []byte("x"))),
		"recursos":           makeZip(t, with("recursos/a.png", []byte("x"))),
		"unidade":            makeZip(t, with("C:/Windows/x.dll", []byte("x"))),
		"sem interface":      makeZip(t, map[string][]byte{"app/server.mjs": []byte("novo")}),
		"exe pequeno demais": makeZip(t, with(exeName, []byte("curto"))),
		"não é zip":          []byte("lixo"),
	}
	for name, archive := range cases {
		root, exe := installation(t)
		if err := applyUpdate(root, exe, archive); err == nil {
			t.Errorf("%s: pacote aceito", name)
		}
		if read(t, filepath.Join(root, "app/server.mjs")) != "velho" || read(t, exe) != "exe antigo" || read(t, filepath.Join(root, "saves/game.db")) != "SAVES" {
			t.Errorf("%s: a instalação foi alterada", name)
		}
		if _, err := os.Stat(filepath.Join(filepath.Dir(root), "fora.txt")); err == nil {
			t.Errorf("%s: escreveu fora da pasta", name)
		}
	}
}

func TestUpdateEndToEnd(t *testing.T) {
	archive := makeZip(t, map[string][]byte{exeName: bigExe(), "app/server.mjs": []byte("novo"), "app/web/index.html": []byte("novo")})
	sum := sha256.Sum256(archive)
	tag := "v1.0.1"
	mux := http.NewServeMux()
	var base string
	mux.HandleFunc("/repos/"+repository+"/releases", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]ghRelease{{Tag: tag, Assets: []ghAsset{
			{Name: updateAsset(tag), URL: base + "/zip"}, {Name: updateAsset(tag) + ".sha256", URL: base + "/sha"},
		}}})
	})
	mux.HandleFunc("/zip", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(archive) })
	mux.HandleFunc("/sha", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(hex.EncodeToString(sum[:]) + "  " + updateAsset(tag)))
	})
	api := httptest.NewServer(mux)
	defer api.Close()
	base = api.URL
	t.Setenv("POKESIM_UPDATE_API", api.URL)

	root, exe := installation(t)
	stopped := false
	u := &updater{installed: mustSemver(t, "1.0.0"), root: root, exe: exe, log: t.Logf, beforeApply: func() { stopped = true }}
	latest, installed, err := u.check(context.Background(), true)
	if err != nil || !installed || latest != "1.0.1" {
		t.Fatalf("check = %q %v %v", latest, installed, err)
	}
	if !stopped {
		t.Error("o jogo deveria ser parado antes de trocar os arquivos")
	}
	if read(t, filepath.Join(root, "app/server.mjs")) != "novo" || len(read(t, exe)) != 2<<20 || read(t, filepath.Join(root, "saves/game.db")) != "SAVES" {
		t.Error("atualização não aplicada como esperado")
	}
	u.installed = mustSemver(t, "1.0.1")
	if _, installed, _ := u.check(context.Background(), true); installed {
		t.Error("não devia atualizar de novo")
	}
}

func TestUpdateRejectsTamperedDownload(t *testing.T) {
	archive := makeZip(t, map[string][]byte{exeName: bigExe(), "app/server.mjs": []byte("novo"), "app/web/index.html": []byte("novo")})
	tag := "v1.0.1"
	mux := http.NewServeMux()
	var base string
	mux.HandleFunc("/repos/"+repository+"/releases", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]ghRelease{{Tag: tag, Assets: []ghAsset{
			{Name: updateAsset(tag), URL: base + "/zip"}, {Name: updateAsset(tag) + ".sha256", URL: base + "/sha"},
		}}})
	})
	mux.HandleFunc("/zip", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(archive) })
	mux.HandleFunc("/sha", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(strings.Repeat("a", 64))) })
	api := httptest.NewServer(mux)
	defer api.Close()
	base = api.URL
	t.Setenv("POKESIM_UPDATE_API", api.URL)

	root, exe := installation(t)
	u := &updater{installed: mustSemver(t, "1.0.0"), root: root, exe: exe, log: t.Logf, beforeApply: func() { t.Error("não devia parar o jogo") }}
	if _, installed, err := u.check(context.Background(), true); err == nil || installed {
		t.Fatalf("download adulterado aceito: %v %v", installed, err)
	}
	if read(t, filepath.Join(root, "app/server.mjs")) != "velho" {
		t.Error("instalação alterada")
	}
}

// ---- servidor do jogo (Node) ----

// fakeNode imita o servidor: imprime a linha de "pronto" e só encerra ao receber "stop".
func fakeNode(t *testing.T, body string) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("script de shell")
	}
	path := filepath.Join(t.TempDir(), "node")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+body), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

func gameRoot(t *testing.T) string {
	root := t.TempDir()
	_ = os.MkdirAll(filepath.Join(root, "app"), 0o755)
	_ = os.WriteFile(filepath.Join(root, "app", "server.mjs"), []byte("//"), 0o644)
	return root
}

func TestStartAndStopServer(t *testing.T) {
	t.Setenv("POKESIM_NODE", fakeNode(t, `echo "linha de aviso"; echo "Jogo pronto: http://127.0.0.1:34611/"; echo "home=$POKESIM_HOME gui=$POKESIM_GUI" >&2; read linha; [ "$linha" = "stop" ] && exit 0; exit 3`))
	root := gameRoot(t)
	game, err := startServer(serverConfig{root: root, log: t.Logf})
	if err != nil {
		t.Fatal(err)
	}
	if game.port != 34611 {
		t.Errorf("porta = %d", game.port)
	}
	game.stop()
	select {
	case <-game.exited():
	default:
		t.Error("o servidor deveria ter encerrado")
	}
	if !game.wasStopped() {
		t.Error("parada pedida pelo launcher não registrada")
	}
}

func TestStartServerFailure(t *testing.T) {
	t.Setenv("POKESIM_NODE", fakeNode(t, `echo "porta ocupada" >&2; exit 1`))
	_, err := startServer(serverConfig{root: gameRoot(t), log: t.Logf})
	if err == nil || !strings.Contains(err.Error(), "porta ocupada") {
		t.Fatalf("erro = %v", err)
	}
	if _, err := startServer(serverConfig{root: t.TempDir(), log: t.Logf}); err == nil {
		t.Error("sem app/server.mjs deveria falhar")
	}
}

func TestServerDiesOnItsOwn(t *testing.T) {
	t.Setenv("POKESIM_NODE", fakeNode(t, `echo "Jogo pronto: http://127.0.0.1:34612/"; sleep 0.2; exit 2`))
	game, err := startServer(serverConfig{root: gameRoot(t), log: t.Logf})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-game.exited():
	case <-time.After(5 * time.Second):
		t.Fatal("não percebeu que o servidor caiu")
	}
	if game.wasStopped() {
		t.Error("queda inesperada marcada como parada pedida")
	}
}

func TestServerExitsCleanly(t *testing.T) {
	t.Setenv("POKESIM_NODE", fakeNode(t, `echo "Jogo pronto: http://127.0.0.1:34613/"; sleep 0.2; exit 0`))
	game, err := startServer(serverConfig{root: gameRoot(t), log: t.Logf})
	if err != nil {
		t.Fatal(err)
	}
	<-game.exited()
	if !game.wasStopped() {
		t.Error("saída normal (--stop) não deve ser tratada como queda")
	}
}
