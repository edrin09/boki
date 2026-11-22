; ==============================================================================
; BOKI 安装程序（NSIS 3 / Unicode）
;
; 由 scripts/build-package.mjs 生成 build\installer-vars.nsh 后调用 makensis。
; 安装页（开发者/联系方式/logo）来自 installer-hooks.nsh 的 customWelcomePage，
; 其中的值同样由 build-package.mjs 依仓库根 .env 重写。
;
; 应用主体是 resources\server（node 后端）+ 轻壳 BOKI.exe（WinForms + 系统 WebView2）。
; ==============================================================================

; 压缩与 Unicode 必须在任何 !include / File 之前设定：
; installer-hooks.nsh 的页面函数里有 File（安装页 logo），一旦先编译进去，
; SetCompressor 会报 "can't change compressor after data already got compressed"。
Unicode true
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "installer-hooks.nsh"

!ifndef APP_VERSION
  !define APP_VERSION "1.1.2"
!endif
!ifndef APP_PUBLISHER
  !define APP_PUBLISHER "西安市未央区鹏云智码软件开发部（个体工商户）"
!endif
!ifndef STAGE_DIR
  !define STAGE_DIR "stage-shell"
!endif
!ifndef OUT_FILE
  !define OUT_FILE "release\BOKI-Setup-${APP_VERSION}.exe"
!endif

Name "BOKI"
OutFile "${OUT_FILE}"
InstallDir "$PROGRAMFILES64\BOKI"
InstallDirRegKey HKLM "Software\BOKI" "InstallDir"
RequestExecutionLevel admin

; 声明 DPI 感知：缺失时 Windows 在 >100% 缩放下把安装界面按 96 DPI 渲染再位图
; 拉伸（DPI 虚拟化），欢迎页/开发者信息页/产品信息全部发虚。
; nsDialogs 用对话框单位随 DPI 自缩放；logo 位图是固定像素，高 DPI 下不放大
; 只会显得偏小，不会发虚（位图控件不做缩放，不会溢出盖字）。
ManifestDPIAware true

Icon "build\icon.ico"
UninstallIcon "build\icon.ico"

VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey /LANG=2052 "ProductName" "BOKI"
VIAddVersionKey /LANG=2052 "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey /LANG=2052 "FileDescription" "BOKI 安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "Copyright © ${APP_PUBLISHER}"

!define MUI_ICON "build\icon.ico"
!define MUI_UNICON "build\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "欢迎安装 BOKI"
!define MUI_WELCOMEPAGE_TEXT "本向导将引导您完成 BOKI 的安装。$\r$\n$\r$\n软件为本地部署：数据保存在 C:\ProgramData\BOKI，卸载不会删除账套数据。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\BOKI.exe"
!define MUI_FINISHPAGE_RUN_TEXT "立即启动 BOKI"

; —— 页面流：开发者信息 → 欢迎 → 安装目录 → 安装 → 完成 ——
!insertmacro customWelcomePage
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

Section "BOKI" SEC_MAIN
  SectionIn RO
  ; 覆盖安装前先结束正在运行的程序，避免文件占用
  nsExec::ExecToLog 'taskkill /F /T /IM BOKI.exe'
  Sleep 800

  SetOutPath "$INSTDIR"
  ; 轻壳 + WebView2 运行库 + resources\server、resources\web
  File /r "${STAGE_DIR}\*.*"

  WriteUninstaller "$INSTDIR\uninstall.exe"

  SetRegView 64
  WriteRegStr HKLM "Software\BOKI" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BOKI" "DisplayName" "BOKI"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BOKI" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BOKI" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BOKI" "DisplayIcon" "$INSTDIR\BOKI.exe,0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BOKI" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BOKI" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BOKI" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BOKI" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BOKI" "NoRepair" 1

  CreateShortcut "$DESKTOP\BOKI.lnk" "$INSTDIR\BOKI.exe" "" "$INSTDIR\icon.ico" 0
  CreateDirectory "$SMPROGRAMS\BOKI"
  CreateShortcut "$SMPROGRAMS\BOKI\BOKI.lnk" "$INSTDIR\BOKI.exe" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$SMPROGRAMS\BOKI\卸载 BOKI.lnk" "$INSTDIR\uninstall.exe"

  ; —— WebView2 运行时：系统已装则跳过；未装时用随包的在线安装器静默安装 ——
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" 0 wv2_done
  ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" 0 wv2_done
  IfFileExists "$INSTDIR\MicrosoftEdgeWebview2Setup.exe" 0 wv2_done
  DetailPrint "正在安装 WebView2 运行时…"
  ExecWait '"$INSTDIR\MicrosoftEdgeWebview2Setup.exe" /silent /install'
wv2_done:

  ; 安装目录加入 Defender 排除项（首次启动扫描数万个小文件，无排除会拖到数分钟）
  !insertmacro customInstall
SectionEnd

Section "Uninstall"
  ; 运行中的主程序会锁文件：先结束，再删
  nsExec::ExecToLog 'taskkill /F /T /IM BOKI.exe'
  Sleep 800

  Delete "$DESKTOP\BOKI.lnk"
  Delete "$SMPROGRAMS\BOKI\BOKI.lnk"
  Delete "$SMPROGRAMS\BOKI\卸载 BOKI.lnk"
  RMDir "$SMPROGRAMS\BOKI"

  RMDir /r "$INSTDIR"

  SetRegView 64
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BOKI"
  DeleteRegKey HKLM "Software\BOKI"

  ; 卸载同步移除 Defender 排除项（账套数据在 ProgramData，不受影响）
  !insertmacro customUnInstall
SectionEnd
