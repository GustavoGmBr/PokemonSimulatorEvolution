//go:build windows

package main

import (
	_ "embed"
	"encoding/binary"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

// Bandeja do Windows feita direto com a API Win32 (sem dependências externas).

//go:embed icon.ico
var iconData []byte

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	shell32  = syscall.NewLazyDLL("shell32.dll")
	advapi32 = syscall.NewLazyDLL("advapi32.dll")

	pRegisterClassEx     = user32.NewProc("RegisterClassExW")
	pCreateWindowEx      = user32.NewProc("CreateWindowExW")
	pDefWindowProc       = user32.NewProc("DefWindowProcW")
	pDestroyWindow       = user32.NewProc("DestroyWindow")
	pGetMessage          = user32.NewProc("GetMessageW")
	pTranslateMessage    = user32.NewProc("TranslateMessage")
	pDispatchMessage     = user32.NewProc("DispatchMessageW")
	pPostMessage         = user32.NewProc("PostMessageW")
	pPostQuitMessage     = user32.NewProc("PostQuitMessage")
	pRegisterWindowMsg   = user32.NewProc("RegisterWindowMessageW")
	pCreatePopupMenu     = user32.NewProc("CreatePopupMenu")
	pAppendMenu          = user32.NewProc("AppendMenuW")
	pDestroyMenu         = user32.NewProc("DestroyMenu")
	pTrackPopupMenu      = user32.NewProc("TrackPopupMenu")
	pSetForegroundWindow = user32.NewProc("SetForegroundWindow")
	pGetCursorPos        = user32.NewProc("GetCursorPos")
	pMessageBox          = user32.NewProc("MessageBoxW")
	pLoadCursor          = user32.NewProc("LoadCursorW")
	pGetSystemMetrics    = user32.NewProc("GetSystemMetrics")
	pCreateIconFromRes   = user32.NewProc("CreateIconFromResourceEx")
	pLoadIcon            = user32.NewProc("LoadIconW")

	pGetModuleHandle = kernel32.NewProc("GetModuleHandleW")
	pCreateMutex     = kernel32.NewProc("CreateMutexW")
	pCloseHandle     = kernel32.NewProc("CloseHandle")

	pShellNotifyIcon = shell32.NewProc("Shell_NotifyIconW")
	pShellExecute    = shell32.NewProc("ShellExecuteW")

	pRegCreateKeyEx = advapi32.NewProc("RegCreateKeyExW")
	pRegOpenKeyEx   = advapi32.NewProc("RegOpenKeyExW")
	pRegSetValueEx  = advapi32.NewProc("RegSetValueExW")
	pRegQueryValue  = advapi32.NewProc("RegQueryValueExW")
	pRegDeleteValue = advapi32.NewProc("RegDeleteValueW")
	pRegCloseKey    = advapi32.NewProc("RegCloseKey")
)

const (
	wmDestroy     = 0x0002
	wmClose       = 0x0010
	wmNull        = 0x0000
	wmLButtonUp   = 0x0202
	wmLButtonDbl  = 0x0203
	wmRButtonUp   = 0x0205
	wmContextMenu = 0x007B
	wmApp         = 0x8000
	trayCallback  = wmApp + 1

	nimAdd    = 0
	nimModify = 1
	nimDelete = 2

	nifMessage = 0x1
	nifIcon    = 0x2
	nifTip     = 0x4
	nifInfo    = 0x10

	niifInfo = 0x1

	mfString    = 0x0
	mfGrayed    = 0x1
	mfDisabled  = 0x2
	mfChecked   = 0x8
	mfSeparator = 0x800

	tpmRightButton = 0x2
	tpmReturnCmd   = 0x100

	idcArrow       = 32512
	idiApplication = 32512
	smCxSmIcon     = 49

	hkeyCurrentUser    = 0x80000001
	keyRead            = 0x20019
	keyWrite           = 0x20006
	regSz              = 1
	errorAlreadyExists = 183
)

type point struct{ x, y int32 }

type msg struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      point
	_       uint32
}

type wndClassEx struct {
	size       uint32
	style      uint32
	wndProc    uintptr
	clsExtra   int32
	wndExtra   int32
	instance   uintptr
	icon       uintptr
	cursor     uintptr
	background uintptr
	menuName   *uint16
	className  *uint16
	iconSm     uintptr
}

type notifyIconData struct {
	size            uint32
	hwnd            uintptr
	id              uint32
	flags           uint32
	callbackMessage uint32
	icon            uintptr
	tip             [128]uint16
	state           uint32
	stateMask       uint32
	info            [256]uint16
	timeout         uint32
	infoTitle       [64]uint16
	infoFlags       uint32
	guidItem        [16]byte
	balloonIcon     uintptr
}

var (
	trayMu      sync.Mutex
	trayWnd     uintptr
	trayIcon    uintptr
	taskbarMsg  uintptr
	current     *app
	quitPending bool
)

func utf16(text string) *uint16 {
	ptr, _ := syscall.UTF16PtrFromString(text)
	return ptr
}

func copyUTF16(dst []uint16, text string) {
	units := syscall.StringToUTF16(text)
	if len(units) > len(dst) {
		units = units[:len(dst)]
		units[len(units)-1] = 0
	}
	copy(dst, units)
}

// loadTrayIcon escolhe do icon.ico (imagens PNG) o tamanho mais próximo do que a bandeja usa.
func loadTrayIcon() uintptr {
	size, _, _ := pGetSystemMetrics.Call(smCxSmIcon)
	if size == 0 {
		size = 16
	}
	if len(iconData) >= 6 {
		count := int(binary.LittleEndian.Uint16(iconData[4:6]))
		bestIndex, bestWidth := -1, 0
		for i := 0; i < count && 6+16*(i+1) <= len(iconData); i++ {
			entry := iconData[6+16*i:]
			width := int(entry[0])
			if width == 0 {
				width = 256
			}
			if width < int(size) {
				continue
			}
			if bestIndex == -1 || width < bestWidth {
				bestIndex, bestWidth = i, width
			}
		}
		if bestIndex == -1 && count > 0 {
			bestIndex = count - 1
		}
		if bestIndex >= 0 {
			entry := iconData[6+16*bestIndex:]
			length := int(binary.LittleEndian.Uint32(entry[8:12]))
			offset := int(binary.LittleEndian.Uint32(entry[12:16]))
			if offset >= 0 && length > 0 && offset+length <= len(iconData) {
				data := iconData[offset : offset+length]
				handle, _, _ := pCreateIconFromRes.Call(uintptr(unsafe.Pointer(&data[0])), uintptr(length), 1, 0x00030000, size, size, 0)
				if handle != 0 {
					return handle
				}
			}
		}
	}
	handle, _, _ := pLoadIcon.Call(0, idiApplication)
	return handle
}

func notifyData(hwnd uintptr) notifyIconData {
	data := notifyIconData{hwnd: hwnd, id: 1}
	data.size = uint32(unsafe.Sizeof(data))
	return data
}

func addTrayIcon(hwnd uintptr, tip string) {
	data := notifyData(hwnd)
	data.flags = nifMessage | nifIcon | nifTip
	data.callbackMessage = trayCallback
	data.icon = trayIcon
	copyUTF16(data.tip[:], tip)
	pShellNotifyIcon.Call(nimAdd, uintptr(unsafe.Pointer(&data)))
}

func removeTrayIcon(hwnd uintptr) {
	data := notifyData(hwnd)
	pShellNotifyIcon.Call(nimDelete, uintptr(unsafe.Pointer(&data)))
}

func showMenu(hwnd uintptr) {
	a := current
	if a == nil {
		return
	}
	menu, _, _ := pCreatePopupMenu.Call()
	if menu == 0 {
		return
	}
	defer pDestroyMenu.Call(menu)
	for _, item := range a.menu() {
		if item.divider {
			pAppendMenu.Call(menu, mfSeparator, 0, 0)
			continue
		}
		flags := uintptr(mfString)
		if item.checked {
			flags |= mfChecked
		}
		if item.disabled {
			flags |= mfGrayed | mfDisabled
		}
		pAppendMenu.Call(menu, flags, uintptr(item.id), uintptr(unsafe.Pointer(utf16(item.text))))
	}
	var cursor point
	pGetCursorPos.Call(uintptr(unsafe.Pointer(&cursor)))
	pSetForegroundWindow.Call(hwnd) // sem isto o menu não fecha ao clicar fora
	chosen, _, _ := pTrackPopupMenu.Call(menu, tpmRightButton|tpmReturnCmd, uintptr(cursor.x), uintptr(cursor.y), 0, hwnd, 0)
	pPostMessage.Call(hwnd, wmNull, 0, 0)
	if chosen != 0 {
		go a.handle(int(chosen)) // fora da thread da janela: atualizar demora e travaria a bandeja
	}
}

func windowProc(hwnd, message, wParam, lParam uintptr) uintptr {
	switch {
	case message == trayCallback:
		switch uint32(lParam) & 0xFFFF {
		case wmLButtonUp, wmLButtonDbl:
			if current != nil {
				go current.openGame()
			}
		case wmRButtonUp, wmContextMenu:
			showMenu(hwnd)
		}
		return 0
	case message == uint32Msg(taskbarMsg) && taskbarMsg != 0:
		// O Explorer foi reiniciado: o ícone some e precisa ser recolocado.
		if current != nil {
			addTrayIcon(hwnd, current.tooltip())
		}
		return 0
	case message == wmClose:
		pDestroyWindow.Call(hwnd)
		return 0
	case message == wmDestroy:
		removeTrayIcon(hwnd)
		pPostQuitMessage.Call(0)
		return 0
	}
	result, _, _ := pDefWindowProc.Call(hwnd, message, wParam, lParam)
	return result
}

func uint32Msg(value uintptr) uintptr { return value }

func runTray(a *app) {
	lockThread()
	current = a
	instance, _, _ := pGetModuleHandle.Call(0)
	cursor, _, _ := pLoadCursor.Call(0, idcArrow)
	trayIcon = loadTrayIcon()
	taskbarMsg, _, _ = pRegisterWindowMsg.Call(uintptr(unsafe.Pointer(utf16("TaskbarCreated"))))

	className := utf16("PokemonSimulatorEvolutionTray")
	class := wndClassEx{
		wndProc:   syscall.NewCallback(windowProc),
		instance:  instance,
		cursor:    cursor,
		className: className,
		icon:      trayIcon,
		iconSm:    trayIcon,
	}
	class.size = uint32(unsafe.Sizeof(class))
	pRegisterClassEx.Call(uintptr(unsafe.Pointer(&class)))
	// Janela comum que nunca é exibida (as janelas "só de mensagens" não recebem o aviso de que o Explorer reiniciou).
	hwnd, _, _ := pCreateWindowEx.Call(0, uintptr(unsafe.Pointer(className)), uintptr(unsafe.Pointer(utf16("Pokémon Simulator Evolution"))), 0, 0, 0, 0, 0, 0, 0, instance, 0)
	if hwnd == 0 {
		a.logf("não foi possível criar a janela da bandeja")
		return
	}
	trayMu.Lock()
	trayWnd = hwnd
	pending := quitPending
	trayMu.Unlock()
	addTrayIcon(hwnd, a.tooltip())
	if pending {
		pPostMessage.Call(hwnd, wmClose, 0, 0)
	}

	var message msg
	for {
		ret, _, _ := pGetMessage.Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0)
		if int32(ret) <= 0 {
			break
		}
		pTranslateMessage.Call(uintptr(unsafe.Pointer(&message)))
		pDispatchMessage.Call(uintptr(unsafe.Pointer(&message)))
	}
}

// trayQuit encerra o programa (seguro de chamar de qualquer thread).
func trayQuit() {
	trayMu.Lock()
	hwnd := trayWnd
	if hwnd == 0 {
		quitPending = true
	}
	trayMu.Unlock()
	if hwnd != 0 {
		pPostMessage.Call(hwnd, wmClose, 0, 0)
	}
}

func trayNotify(title, message string) {
	trayMu.Lock()
	hwnd := trayWnd
	trayMu.Unlock()
	if hwnd == 0 {
		return
	}
	data := notifyData(hwnd)
	data.flags = nifInfo
	data.infoFlags = niifInfo
	copyUTF16(data.infoTitle[:], title)
	copyUTF16(data.info[:], message)
	pShellNotifyIcon.Call(nimModify, uintptr(unsafe.Pointer(&data)))
}

func openTarget(target string) error {
	ret, _, err := pShellExecute.Call(0, uintptr(unsafe.Pointer(utf16("open"))), uintptr(unsafe.Pointer(utf16(target))), 0, 0, 1)
	if ret <= 32 {
		return err
	}
	return nil
}

func showError(title, message string) {
	pMessageBox.Call(0, uintptr(unsafe.Pointer(utf16(message))), uintptr(unsafe.Pointer(utf16(title))), 0x10)
}

func hideWindow(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}

// ---- instância única ----

func acquireInstance(wait time.Duration) (func(), bool) {
	name := utf16(`Local\PokemonSimulatorEvolution.Launcher`)
	deadline := time.Now().Add(wait)
	for {
		handle, _, err := pCreateMutex.Call(0, 0, uintptr(unsafe.Pointer(name)))
		if handle != 0 {
			if errno, ok := err.(syscall.Errno); ok && errno == errorAlreadyExists {
				pCloseHandle.Call(handle)
			} else {
				return func() { pCloseHandle.Call(handle) }, true
			}
		}
		if time.Now().After(deadline) {
			return func() {}, false
		}
		time.Sleep(300 * time.Millisecond)
	}
}

// ---- iniciar com o Windows ----

const (
	runKey   = `Software\Microsoft\Windows\CurrentVersion\Run`
	runValue = "PokemonSimulatorEvolution"
)

func openRunKey(access uintptr, create bool) (uintptr, bool) {
	var key uintptr
	path := utf16(runKey)
	var ret uintptr
	if create {
		ret, _, _ = pRegCreateKeyEx.Call(hkeyCurrentUser, uintptr(unsafe.Pointer(path)), 0, 0, 0, access, 0, uintptr(unsafe.Pointer(&key)), 0)
	} else {
		ret, _, _ = pRegOpenKeyEx.Call(hkeyCurrentUser, uintptr(unsafe.Pointer(path)), 0, access, uintptr(unsafe.Pointer(&key)))
	}
	return key, ret == 0
}

func autostartEnabled() bool {
	key, ok := openRunKey(keyRead, false)
	if !ok {
		return false
	}
	defer pRegCloseKey.Call(key)
	ret, _, _ := pRegQueryValue.Call(key, uintptr(unsafe.Pointer(utf16(runValue))), 0, 0, 0, 0)
	return ret == 0
}

func setAutostart(enabled bool, exe string) error {
	key, ok := openRunKey(keyWrite, true)
	if !ok {
		return syscall.EACCES
	}
	defer pRegCloseKey.Call(key)
	name := utf16(runValue)
	if !enabled {
		pRegDeleteValue.Call(key, uintptr(unsafe.Pointer(name)))
		return nil
	}
	value := syscall.StringToUTF16(`"` + strings.ReplaceAll(exe, `"`, "") + `" --background`)
	ret, _, _ := pRegSetValueEx.Call(key, uintptr(unsafe.Pointer(name)), 0, regSz, uintptr(unsafe.Pointer(&value[0])), uintptr(len(value)*2))
	if ret != 0 {
		return syscall.Errno(ret)
	}
	return nil
}
