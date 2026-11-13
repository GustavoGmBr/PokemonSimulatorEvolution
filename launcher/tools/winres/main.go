// Gera rsrc_windows_amd64.syso (ícone do .exe + manifesto) sem dependências externas.
// Uso: go run ./tools/winres   (dentro de launcher/; o go build já inclui o .syso sozinho)
package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"os"
)

type resource struct {
	id   uint32
	data []byte
}

const manifest = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security></trustInfo>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1"><application><supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/></application></compatibility>
  <application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings><longPathAware xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">true</longPathAware></windowsSettings></application>
</assembly>`

func main() {
	icon, err := os.ReadFile("icon.ico")
	if err != nil {
		fail(err)
	}
	if len(icon) < 6 || binary.LittleEndian.Uint16(icon[2:]) != 1 {
		fail(fmt.Errorf("icon.ico inválido"))
	}
	count := int(binary.LittleEndian.Uint16(icon[4:]))
	var icons []resource
	group := new(bytes.Buffer)
	binary.Write(group, binary.LittleEndian, [3]uint16{0, 1, uint16(count)})
	for i := 0; i < count; i++ {
		entry := icon[6+16*i : 22+16*i]
		size := binary.LittleEndian.Uint32(entry[8:])
		offset := binary.LittleEndian.Uint32(entry[12:])
		icons = append(icons, resource{uint32(i + 1), icon[offset : offset+size]})
		group.Write(entry[:12]) // largura, altura, cores, reservado, planos, bits, tamanho
		binary.Write(group, binary.LittleEndian, uint16(i+1))
	}
	types := []struct {
		id        uint32
		resources []resource
	}{
		{3, icons},
		{14, []resource{{1, group.Bytes()}}},
		{24, []resource{{1, []byte(manifest)}}},
	}

	// Layout da seção .rsrc: diretório raiz, um diretório por tipo, um por recurso (idioma), entradas de dados e os dados.
	total := 0
	for _, t := range types {
		total += len(t.resources)
	}
	rootSize := 16 + 8*len(types)
	pos := rootSize
	typeOffsets := make([]int, len(types))
	for i, t := range types {
		typeOffsets[i] = pos
		pos += 16 + 8*len(t.resources)
	}
	langOffset := pos
	pos += (16 + 8) * total
	entryOffset := pos
	pos += 16 * total
	dataOffset := pos

	section := new(bytes.Buffer)
	put := func(values ...any) {
		for _, v := range values {
			binary.Write(section, binary.LittleEndian, v)
		}
	}
	dirHeader := func(ids int) { put(uint32(0), uint32(0), uint16(0), uint16(0), uint16(0), uint16(ids)) }

	dirHeader(len(types))
	for i, t := range types {
		put(t.id, uint32(typeOffsets[i])|0x80000000)
	}
	index := 0
	for i, t := range types {
		if section.Len() != typeOffsets[i] {
			fail(fmt.Errorf("layout"))
		}
		dirHeader(len(t.resources))
		for j, r := range t.resources {
			put(r.id, uint32(langOffset+(16+8)*(index+j))|0x80000000)
		}
		index += len(t.resources)
	}
	for i := 0; i < total; i++ {
		dirHeader(1)
		put(uint32(0x0409), uint32(entryOffset+16*i))
	}
	var relocations []int
	var blobs bytes.Buffer
	index = 0
	for _, t := range types {
		for _, r := range t.resources {
			relocations = append(relocations, section.Len())
			put(uint32(dataOffset+blobs.Len()), uint32(len(r.data)), uint32(0), uint32(0))
			blobs.Write(r.data)
			for blobs.Len()%4 != 0 {
				blobs.WriteByte(0)
			}
			index++
		}
	}
	section.Write(blobs.Bytes())

	// Arquivo COFF (AMD64) com uma seção .rsrc, um símbolo e uma relocação ADDR32NB por entrada de dados.
	const headerSize, sectionHeaderSize = 20, 40
	rawOffset := headerSize + sectionHeaderSize
	relocOffset := rawOffset + section.Len()
	symbolOffset := relocOffset + 10*len(relocations)
	out := new(bytes.Buffer)
	w := func(values ...any) {
		for _, v := range values {
			binary.Write(out, binary.LittleEndian, v)
		}
	}
	w(uint16(0x8664), uint16(1), uint32(0), uint32(symbolOffset), uint32(1), uint16(0), uint16(0))
	name := [8]byte{'.', 'r', 's', 'r', 'c'}
	w(name, uint32(0), uint32(0), uint32(section.Len()), uint32(rawOffset), uint32(relocOffset), uint32(0), uint16(len(relocations)), uint16(0), uint32(0xC0300040))
	out.Write(section.Bytes())
	for _, at := range relocations {
		w(uint32(at), uint32(0), uint16(3))
	}
	w(name, uint32(0), int16(1), uint16(0), uint8(3), uint8(0)) // símbolo da seção
	w(uint32(4))                                                // tabela de strings vazia
	if err := os.WriteFile("rsrc_windows_amd64.syso", out.Bytes(), 0o644); err != nil {
		fail(err)
	}
	fmt.Println("rsrc_windows_amd64.syso gerado:", out.Len(), "bytes")
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
