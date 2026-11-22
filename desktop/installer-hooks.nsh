; ==============================================================================
; BOKI 安装程序自定义钩子（由 installer.nsi 通过 !include 引入）
;
; 页面流（assisted 模式）：【开发者信息】 → 欢迎 → 选择安装目录 → 安装 → 完成
; 「开发者信息」页插在欢迎页/目录选择页之前（customWelcomePage 钩子），
; 精简版：logo + 软件名 + 开发者署名 + 官网链接（邮箱/电话/微信等联系方式
; 一律走官网，安装页不再罗列）。
;
; 本文件中的官网 / 开发者名称由 scripts/build-package.mjs 打包时从仓库根
; .env（OFFICIAL_SITE / PUBLISHER_NAME）自动重写，请勿手改；改联系方式只需
; 编辑根目录 .env，重新打包即生效。
; logo 位图由 scripts/make-icon.mjs 生成（desktop/build/installer-logo.bmp），
; 其绝对路径同样由 build-package.mjs 写入下方 File 行（占位符替换）。
; ==============================================================================

!include "nsDialogs.nsh"

; —— 插入点：欢迎页之前（即目录选择页之前），assistedInstaller.nsh 的官方钩子 ——
; 页面相关代码（含 Var）必须包在 !ifndef BUILD_UNINSTALLER 里：本文件会被安装器与
; 卸载器两遍编译共用，而打包脚本给 makensis 传 -WX（警告即错误）。
; 卸载器那遍里 Page 指令不会插入（模板自身也有 !ifndef BUILD_UNINSTALLER 保护），
; 页面函数就成了死代码，触发 warning 6010「install function not referenced」；
; 页面用的 Var 若留在 guard 外，则触发 warning 6001「Variable not referenced」。
; 两者都会被 -WX 升级成致命错误（实测：打包在 makensis 阶段失败）。
!ifndef BUILD_UNINSTALLER
Var ContactDlg
Var ContactLblPublisher
Var ContactLblTitle
Var ContactLblIntro
Var ContactValSite
Var ContactBmpLogo
Var ContactImgHandle
Var ContactFontBold
Var ContactTmp

!macro customWelcomePage
  Page custom ContactPageCreate ContactPageLeave
!macroend

; 官网链接：点 Link 控件直接用系统默认浏览器打开
Function ContactOpenSite
  Pop $0
  ${NSD_GetText} $ContactValSite $ContactTmp
  ExecShell "open" "$ContactTmp"
FunctionEnd

Function ContactPageCreate
  ; 1018 = WS_CHILD|WS_VISIBLE|WS_CLIPSIBLINGS|DS_CONTROL，MUI 子页标准父窗口风格
  ; logo 位图随安装包分发，页面创建前释放到 $PLUGINSDIR 供 nsDialogs 显示
  ; （/oname 与源路径同引号串；源文件绝对路径由 build-package.mjs 写入占位符）
  InitPluginsDir
  File "/oname=$PLUGINSDIR\boki-logo.bmp" "D:\wwwroot\financial\desktop\build\installer-logo.bmp"

  nsDialogs::Create 1018
  Pop $ContactDlg
  StrCmp $ContactDlg "error" 0 +2
  Abort

  ; 页面底色固定为 F0F0F0，与 logo 位图展平的底色一致（BMP 无 alpha 通道，
  ; 只能靠"位图底色 == 页面底色"做出视觉透明效果，见 make-icon.mjs）
  SetCtlColors $ContactDlg "" F0F0F0

  ; ⚠ 排版预算（实测校准）：该子页可用区约 266x130u，96 DPI 下 1u ≈ 1.67px。
  ; logo 位图 180x54px（恰 = 108x32u 控件），NSIS 位图控件不缩放，原尺寸显示。
  ; —— logo（180x54px 位图 = 108x32u，水平居中）——
  ${NSD_CreateBitmap} 79u 0u 108u 32u ""
  Pop $ContactBmpLogo
  ${NSD_SetImage} $ContactBmpLogo $PLUGINSDIR\boki-logo.bmp $ContactImgHandle

  ; —— 开发者署名（logo 正下方，加粗；文本由 build-package.mjs 依 .env 重写）——
  ${NSD_CreateLabel} 0 36u 100% 12u "西安市未央区鹏云智码软件开发部（个体工商户）"
  Pop $ContactLblPublisher
  CreateFont $ContactFontBold "Microsoft YaHei" 10 700
  SendMessage $ContactLblPublisher 0x0030 $ContactFontBold 0  ; 0x0030 = WM_SETFONT

  ; —— 软件名称与定位 ——
  ${NSD_CreateLabel} 0 50u 100% 10u "BOKI · 离线优先 · 复式记账"
  Pop $ContactLblTitle

  ; —— 官网（更多信息与联系方式一律走官网；URL 由 build-package.mjs 依 .env 重写）——
  ${NSD_CreateLabel} 0 66u 100% 10u "使用中如有问题，可通过官网联系我们："
  Pop $ContactLblIntro

  ${NSD_CreateLink} 42u 82u 168u 10u "https://edrin09.github.io/boki/"
  Pop $ContactValSite
  ${NSD_OnClick} $ContactValSite ContactOpenSite

  nsDialogs::Show
FunctionEnd

Function ContactPageLeave
FunctionEnd
!endif

; —— 安装阶段：把安装目录加入 Windows Defender 排除项 ——
; 首次启动需全量扫描数万个 node_modules 小文件，无排除时冷启动可能被拖到数分钟。
; 引号写法（实测踩坑）：外层必须用双引号，内层 PowerShell 的引号用 $\" 转义。
; 早先试过外层单引号 + $\' 转义内层单引号，makensis 报 "ExecWait expects 1-2
; parameters, got 4"——NSIS 的 '' 不是转义而是「闭合+重开」，会把一条命令切成
; 4 个参数；且单引号串的运行时变量展开行为不可靠，$INSTDIR 可能原样透传给
; PowerShell 导致排除项静默失效。双引号 + $\" 是上一次真实打包编译通过的形式。
; 无权限 / 系统未启用 Defender 时静默失败，不影响安装结果。
!macro customInstall
  nsExec::ExecToLog "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command $\"Add-MpPreference -ExclusionPath '$INSTDIR' -ErrorAction SilentlyContinue$\""
!macroend

; —— 卸载阶段：同步移除排除项，不在系统里留孤儿配置 ——
!macro customUnInstall
  nsExec::ExecToLog "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command $\"Remove-MpPreference -ExclusionPath '$INSTDIR' -ErrorAction SilentlyContinue$\""
!macroend
