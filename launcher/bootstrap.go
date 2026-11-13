package main

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// Primeira abertura de um .exe que veio sozinho (ex.: o 1.0.x se atualizando): o programa novo chega sem o Node.js (runtime\)
// nem o jogo (app\). O bootstrap baixa o pacote completo da release mais nova, confere o SHA-256 e instala runtime\ e app\
// (e recursos\, só se o jogador ainda não tem a pasta). Saves não são tocados.

// fullAsset é o nome do pacote completo de uma release (ex.: PokemonSimulatorEvolution-v1.2.1-full-win-x64.zip).
func fullAsset(tag string) string { return assetPrefix + "-" + tag + "-full-win-x64.zip" }

const maxFullSize = 2 << 30 // 2 GB, só para não encher o disco com algo errado

// needsBootstrap diz se faltam o jogo (app\server.mjs) ou o Node.js (runtime\node.exe, POKESIM_NODE ou um node instalado).
func needsBootstrap(root string) bool {
	if _, err := os.Stat(filepath.Join(root, "app", "server.mjs")); err != nil {
		return true
	}
	_, err := findNode(root)
	return err != nil
}

// pickFullRelease escolhe a release estável mais nova (não menor que a do .exe) que tem o pacote completo e o checksum.
func pickFullRelease(releases []ghRelease, installed semver) (ghRelease, bool) {
	best := installed
	var chosen ghRelease
	found := false
	for _, release := range releases {
		if release.Draft || !strings.HasPrefix(release.Tag, "v") {
			continue
		}
		candidate, ok := parseSemver(release.Tag)
		if !ok || (len(candidate.pre) > 0 && len(installed.pre) == 0) || candidate.compare(best) < 0 {
			continue
		}
		if found && candidate.compare(best) == 0 {
			continue
		}
		if release.asset(fullAsset(release.Tag)) == "" || release.asset(fullAsset(release.Tag)+".sha256") == "" {
			continue
		}
		best, chosen, found = candidate, release, true
	}
	return chosen, found
}

// downloadFile baixa url para dest (sem carregar tudo na memória) e devolve o SHA-256.
func downloadFile(ctx context.Context, url, dest string, limit int64) (string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	request.Header.Set("User-Agent", "PokemonSimulatorEvolution/"+version)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%s respondeu %d", request.URL.Host, response.StatusCode)
	}
	file, err := os.Create(dest)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	written, err := io.Copy(io.MultiWriter(file, hash), io.LimitReader(response.Body, limit+1))
	if err != nil {
		return "", err
	}
	if written > limit {
		return "", errors.New("download grande demais")
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

// installFull extrai o pacote completo (zip em archive) em root. withRecursos=false pula a pasta recursos\.
func installFull(root, archive string, withRecursos bool) error {
	reader, err := zip.OpenReader(archive)
	if err != nil {
		return fmt.Errorf("pacote completo inválido: %w", err)
	}
	defer reader.Close()
	staging := filepath.Join(root, "bootstrap.tmp")
	_ = os.RemoveAll(staging)
	if err := os.MkdirAll(staging, 0o755); err != nil {
		return err
	}
	defer os.RemoveAll(staging)

	var total int64
	for _, entry := range reader.File {
		name := path.Clean(strings.ReplaceAll(entry.Name, "\\", "/"))
		if entry.FileInfo().IsDir() {
			continue
		}
		if name == "." || strings.HasPrefix(name, "../") || strings.HasPrefix(name, "/") || strings.Contains(name, ":") {
			return fmt.Errorf("caminho inválido no pacote: %q", entry.Name)
		}
		// O pacote completo vem dentro de uma pasta (PokemonSimulatorEvolution/...).
		if _, rest, ok := strings.Cut(name, "/"); ok {
			name = rest
		}
		top, _, nested := strings.Cut(name, "/")
		if !nested || (top != "app" && top != "runtime" && (top != "recursos" || !withRecursos)) {
			continue // o .exe (já é este), documentos e pastas que não se mexem
		}
		total += int64(entry.UncompressedSize64)
		if total > maxFullSize {
			return errors.New("o pacote completo é grande demais")
		}
		target := filepath.Join(staging, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		if err := extractEntry(entry, target); err != nil {
			return err
		}
	}
	for _, required := range []string{"app/server.mjs", "app/web/index.html", "runtime/node.exe"} {
		if _, err := os.Stat(filepath.Join(staging, filepath.FromSlash(required))); err != nil {
			return fmt.Errorf("o pacote completo não contém %s", required)
		}
	}
	for _, folder := range []string{"runtime", "app", "recursos"} {
		source := filepath.Join(staging, folder)
		if _, err := os.Stat(source); err != nil {
			continue
		}
		target := filepath.Join(root, folder)
		if err := os.RemoveAll(target); err != nil {
			return err
		}
		if err := os.Rename(source, target); err != nil {
			return err
		}
	}
	return nil
}

func extractEntry(entry *zip.File, target string) error {
	source, err := entry.Open()
	if err != nil {
		return err
	}
	defer source.Close()
	out, err := os.Create(target)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, source); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// bootstrap baixa e instala o jogo na pasta do .exe. hasRecursos diz se o jogador já tem a pasta recursos\.
func (u *updater) bootstrap(ctx context.Context, hasRecursos bool) (string, error) {
	data, err := get(ctx, updateAPI()+"/repos/"+repository+"/releases?per_page=20", 4<<20)
	if err != nil {
		return "", err
	}
	var releases []ghRelease
	if err := json.Unmarshal(data, &releases); err != nil {
		return "", err
	}
	release, ok := pickFullRelease(releases, u.installed)
	if !ok {
		return "", errors.New("nenhuma release com o pacote completo foi encontrada")
	}
	name := fullAsset(release.Tag)
	archiveURL, sumURL := release.asset(name), release.asset(name+".sha256")
	prefix := "https://github.com/" + repository + "/releases/download/" + release.Tag + "/"
	if os.Getenv("POKESIM_UPDATE_API") == "" && (!strings.HasPrefix(archiveURL, prefix) || !strings.HasPrefix(sumURL, prefix)) {
		return "", errors.New("endereço de download inválido")
	}
	sum, err := get(ctx, sumURL, 4096)
	if err != nil {
		return "", err
	}
	fields := strings.Fields(strings.ToLower(string(sum)))
	if len(fields) == 0 || !checksumPattern.MatchString(fields[0]) {
		return "", errors.New("checksum inválido")
	}
	archive := filepath.Join(u.root, "bootstrap.zip")
	defer os.Remove(archive)
	u.log("Baixando o pacote completo %s…", release.Tag)
	got, err := downloadFile(ctx, archiveURL, archive, maxFullSize)
	if err != nil {
		return "", err
	}
	if got != fields[0] {
		return "", errors.New("o download não passou na verificação de integridade")
	}
	if err := installFull(u.root, archive, !hasRecursos); err != nil {
		return "", err
	}
	return release.Tag, nil
}
