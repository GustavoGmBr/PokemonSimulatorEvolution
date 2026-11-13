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
	"strings"
	"testing"
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

func TestPickRelease(t *testing.T) {
	full := []string{assetName, assetName + ".sha256"}
	releases := []ghRelease{
		release("v1.1.0", false, full...),
		release("v1.2.0", true, full...),                 // rascunho
		release("v1.3.0", false, assetName),              // sem checksum
		release("v1.4.0-beta.1", false, full...),         // pré-lançamento
		release("v0.9.0", false, full...),                // antiga
		release("not-a-version", false, full...),
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
	if err := verifyChecksum(data, hash+"  "+assetName+"\n"); err != nil {
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

func TestUpdateEndToEnd(t *testing.T) {
	payload := []byte(strings.Repeat("x", 2<<20))
	sum := sha256.Sum256(payload)
	mux := http.NewServeMux()
	var base string
	mux.HandleFunc("/repos/"+repository+"/releases", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]ghRelease{{Tag: "v1.0.1", Assets: []ghAsset{
			{Name: assetName, URL: base + "/exe"}, {Name: assetName + ".sha256", URL: base + "/sha"},
		}}})
	})
	mux.HandleFunc("/exe", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(payload) })
	mux.HandleFunc("/sha", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(hex.EncodeToString(sum[:]) + "  " + assetName))
	})
	api := httptest.NewServer(mux)
	defer api.Close()
	base = api.URL
	t.Setenv("POKESIM_UPDATE_API", api.URL)

	exe := filepath.Join(t.TempDir(), "jogo.exe")
	_ = os.WriteFile(exe, []byte("antigo"), 0o755)
	u := &updater{installed: mustSemver(t, "1.0.0"), exe: exe, log: t.Logf}
	latest, installed, err := u.check(context.Background(), true)
	if err != nil || !installed || latest != "1.0.1" {
		t.Fatalf("check = %q %v %v", latest, installed, err)
	}
	if data, _ := os.ReadFile(exe); len(data) != len(payload) {
		t.Errorf("exe não foi trocado (%d bytes)", len(data))
	}
	u.installed = mustSemver(t, "1.0.1")
	if _, installed, _ := u.check(context.Background(), true); installed {
		t.Error("não devia atualizar de novo")
	}
}

func newTestServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	recursos := t.TempDir()
	for path, size := range map[string]int{
		"Pokemons/001.png": 10, "Treinadores/Ash.png": 10, "Treinadores/leia.txt": 5,
		"Sons/Musicas/01 - Pallet Town.mp3": 200_000, "Sons/Musicas/02 - Vinheta.mp3": 5_000, "Itens/segredo.txt": 5,
	} {
		full := filepath.Join(recursos, filepath.FromSlash(path))
		_ = os.MkdirAll(filepath.Dir(full), 0o755)
		_ = os.WriteFile(full, make([]byte, size), 0o644)
	}
	_ = os.WriteFile(filepath.Join(filepath.Dir(recursos), "fora.png"), []byte("x"), 0o644)
	srv, err := newServer(recursos, nil)
	if err != nil {
		t.Fatal(err)
	}
	srv.port = preferredPort
	return httptest.NewServer(srv), recursos
}

func status(t *testing.T, url string, headers map[string]string) (int, string) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	buf := make([]byte, 4096)
	n, _ := res.Body.Read(buf)
	return res.StatusCode, string(buf[:n])
}

func TestServer(t *testing.T) {
	ts, _ := newTestServer(t)
	defer ts.Close()

	if code, body := status(t, ts.URL+"/", nil); code != 200 || !strings.Contains(body, "<html") {
		t.Errorf("interface: %d %.40q", code, body)
	}
	if code, _ := status(t, ts.URL+"/rota-qualquer", nil); code != 200 {
		t.Errorf("rota sem arquivo deveria cair na interface: %d", code)
	}
	if code, _ := status(t, ts.URL+"/assets/nao-existe.js", nil); code != 404 {
		t.Errorf("asset inexistente: %d", code)
	}
	if code, _ := status(t, ts.URL+"/recursos/Pokemons/001.png", nil); code != 200 {
		t.Errorf("sprite: %d", code)
	}
	for _, bad := range []string{"/recursos/Itens/segredo.txt", "/recursos/Treinadores/leia.txt", "/recursos/../fora.png", "/recursos/Pokemons/../../fora.png", "/recursos/Pokemons/%2e%2e/%2e%2e/fora.png", "/recursos/Desconhecida/a.png"} {
		if code, _ := status(t, ts.URL+bad, nil); code == 200 {
			t.Errorf("%s não devia ser servido", bad)
		}
	}
	code, body := status(t, ts.URL+"/recursos/Sons/Musicas/lista.json", nil)
	var tracks []track
	_ = json.Unmarshal([]byte(body), &tracks)
	if code != 200 || len(tracks) != 1 || tracks[0].Title != "Pallet Town" {
		t.Errorf("lista de músicas: %d %s", code, body)
	}
	if _, body := status(t, ts.URL+"/recursos/Treinadores/lista.json", nil); strings.TrimSpace(body) != `["Ash.png"]` {
		t.Errorf("lista de treinadores: %s", body)
	}
	if code, _ := status(t, ts.URL+"/recursos/Sons/Musicas/01%20-%20Pallet%20Town.mp3", map[string]string{"Range": "bytes=0-99"}); code != http.StatusPartialContent {
		t.Errorf("Range: %d", code)
	}
	if code, body := status(t, ts.URL+"/_/versao", nil); code != 200 || !strings.Contains(body, appID) {
		t.Errorf("versão: %d %s", code, body)
	}
}

func TestServerRejectsForeignHostAndStop(t *testing.T) {
	ts, _ := newTestServer(t)
	defer ts.Close()
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/", nil)
	req.Host = "evil.example.com"
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode == 200 {
		t.Error("host externo aceito")
	}
	post, _ := http.NewRequest(http.MethodPost, ts.URL+"/_/sair", nil)
	res, _ = http.DefaultClient.Do(post)
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Errorf("sair sem cabeçalho: %d", res.StatusCode)
	}
}

func TestListenFallback(t *testing.T) {
	first, port, err := listen(34700)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, port2, err := listen(port)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	if port2 != port+1 {
		t.Errorf("esperava %d, veio %d", port+1, port2)
	}
}
