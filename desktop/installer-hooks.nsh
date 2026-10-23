; ==============================================================================
; BOKI 安装程序自定义钩子（electron-builder: nsis.include → installer-hooks.nsh）
;
; 页面流（assisted 模式）：【开发者信息】 → 欢迎 → 选择安装目录 → 安装 → 完成
; 「开发者信息」页插在欢迎页/目录选择页之前（customWelcomePage 钩子），
; 展示 BOKI logo、软件名称与开发者 / 联系方式（官网可点击打开，
; 官网/邮箱/电话/微信号每行带「复制」按钮）。
;
; 本文件中的官网 / 开发者名称 / 邮箱 / 电话 / 微信号由 scripts/build-package.mjs
; 打包时从仓库根 .env（OFFICIAL_SITE / PUBLISHER_NAME / CONTACT_EMAIL /
; CONTACT_PHONE / CONTACT_WECHAT）自动重写，请勿手改；改联系方式只需编辑根目录
; .env，重新打包即生效。
; logo 位图由 scripts/make-icon.mjs 生成（desktop/build/installer-logo.bmp），
; 其绝对路径同样由 build-package.mjs 写入下方 File 行（占位符替换）。
; ==============================================================================

!include "nsDialogs.nsh"

; —— 插入点：欢迎页之前（即目录选择页之前），assistedInstaller.nsh 的官方钩子 ——
; 页面相关代码（含 Var）必须包在 !ifndef BUILD_UNINSTALLER 里：本文件会被安装器与
; 卸载器两遍编译共用，而 electron-builder 默认给 makensis 传 -WX（警告即错误）。
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
Var ContactValEmail
Var ContactValPhone
Var ContactValWechat
Var ContactBtnSite
Var ContactBtnEmail
Var ContactBtnPhone
Var ContactBtnWechat
Var ContactBmpLogo
Var ContactImgHandle
Var ContactFontBold
Var ContactTmp

!macro customWelcomePage
  Page custom ContactPageCreate ContactPageLeave
!macroend

; —— 写剪贴板（$ContactTmp = 待复制文本）——
; electron-builder 的 NSIS 是 Unicode 版：剪贴板格式必须用 CF_UNICODETEXT(13)，
; 字符串须经 GlobalAlloc(GMEM_MOVEABLE|GMEM_ZEROINIT) + GlobalLock 后用
; lstrcpynW 拷入（显式点 W 版，避免 System 插件 A/W 自动解析歧义）。
; SetClipboardData 成功后内存归系统所有，不再释放。
Function CopyContactText
  Push $0
  Push $1
  Push $2
  System::Call "user32::OpenClipboard(i $HWNDPARENT) i.r0"
  StrCmp $0 0 copy_done
  System::Call "user32::EmptyClipboard()"
  System::Call "kernel32::GlobalAlloc(i 0x2002, i 4096) i.r1"
  StrCmp $1 0 copy_close
  System::Call "kernel32::GlobalLock(i r1) i.r2"
  StrCmp $2 0 copy_close
  System::Call "kernel32::lstrcpynW(i r2, t '$ContactTmp', i 1024)"
  System::Call "kernel32::GlobalUnlock(i r1)"
  System::Call "user32::SetClipboardData(i 13, i r1) i.r0"
copy_close:
  System::Call "user32::CloseClipboard()"
copy_done:
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

; 官网链接：点 Link 控件直接用系统默认浏览器打开
Function ContactOpenSite
  Pop $0
  ${NSD_GetText} $ContactValSite $ContactTmp
  ExecShell "open" "$ContactTmp"
FunctionEnd

; 四个「复制」按钮：取各自值控件文本写入剪贴板
Function ContactCopySite
  Pop $0
  ${NSD_GetText} $ContactValSite $ContactTmp
  Call CopyContactText
FunctionEnd
Function ContactCopyEmail
  Pop $0
  ${NSD_GetText} $ContactValEmail $ContactTmp
  Call CopyContactText
FunctionEnd
Function ContactCopyPhone
  Pop $0
  ${NSD_GetText} $ContactValPhone $ContactTmp
  Call CopyContactText
FunctionEnd
Function ContactCopyWechat
  Pop $0
  ${NSD_GetText} $ContactValWechat $ContactTmp
  Call CopyContactText
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

  ; ⚠ 排版预算（实测校准）：该子页可用区约 266x130u，96 DPI 下 1u ≈ 1.67px、
  ; 一个汉字宽 ≈ 8u。第一版把联系方式排到 140u-218u 全部落到页面外；第二版
  ; logo 位图 320x96px 原尺寸压在 120x36u 控件上（NSIS 位图不缩放，直接溢出）
  ; 盖住了署名与标题。本版：BMP 重新生成为 180x54px（恰 = 108x32u 控件），
  ; 四行联系方式收进 76u-125u。
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
  ${NSD_CreateLabel} 0 50u 100% 10u "BOKI 开源财务软件 · 离线优先 · 复式记账"
  Pop $ContactLblTitle

  ${NSD_CreateLabel} 0 62u 100% 10u "使用中如有问题，可通过以下方式联系："
  Pop $ContactLblIntro

  ; 每行 = 前缀标签(40u，五汉字宽度) + 值(42u 起) + 「复制」按钮(214u 起)。
  ; 官网行的值是 Link 控件（可点击打开）。值文本由 build-package.mjs 依根 .env 重写。
  ${NSD_CreateLabel} 0 78u 40u 10u "官    网："
  ${NSD_CreateLink} 42u 78u 168u 10u "https://edrin09.github.io/boki/"
  Pop $ContactValSite
  ${NSD_OnClick} $ContactValSite ContactOpenSite
  ${NSD_CreateButton} 214u 76u 48u 13u "复制"
  Pop $ContactBtnSite
  ${NSD_OnClick} $ContactBtnSite ContactCopySite

  ${NSD_CreateLabel} 0 93u 40u 10u "电子邮箱："
  ${NSD_CreateLabel} 42u 93u 168u 10u "y_p09@163.com"
  Pop $ContactValEmail
  ${NSD_CreateButton} 214u 91u 48u 13u "复制"
  Pop $ContactBtnEmail
  ${NSD_OnClick} $ContactBtnEmail ContactCopyEmail

  ${NSD_CreateLabel} 0 108u 40u 10u "联系电话："
  ${NSD_CreateLabel} 42u 108u 168u 10u "15389232340"
  Pop $ContactValPhone
  ${NSD_CreateButton} 214u 106u 48u 13u "复制"
  Pop $ContactBtnPhone
  ${NSD_OnClick} $ContactBtnPhone ContactCopyPhone

  ${NSD_CreateLabel} 0 123u 40u 10u "微    信："
  ${NSD_CreateLabel} 42u 123u 168u 10u "PengYunZhiMa"
  Pop $ContactValWechat
  ${NSD_CreateButton} 214u 121u 48u 13u "复制"
  Pop $ContactBtnWechat
  ${NSD_OnClick} $ContactBtnWechat ContactCopyWechat

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
