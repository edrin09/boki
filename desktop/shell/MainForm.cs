using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace BokiShell
{
    /// <summary>主窗口：WebView2 承载前端，关窗即最小化到托盘（主机就是服务器）。</summary>
    internal sealed class MainForm : Form
    {
        private readonly WebView2 web;
        private bool allowClose;
        private bool hintedTray;
        private bool coreReady;
        private bool pendingNavigate;

        public Action<string, string> ShowBalloon { get; set; }
        public string AppUrl { get; set; }

        public bool IsCoreReady
        {
            get { return coreReady; }
        }

        public MainForm()
        {
            Text = Brand.WindowTitle;
            Width = 1280;
            Height = 820;
            MinimumSize = new Size(1024, 680);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(242, 244, 247);
            try
            {
                Icon = TrayController.LoadAppIcon(32);
            }
            catch
            {
                // 取不到图标不影响运行
            }

            web = new WebView2();
            web.Dock = DockStyle.Fill;
            web.DefaultBackgroundColor = Color.FromArgb(242, 244, 247);
            Controls.Add(web);

            Load += OnFormLoad;
            Shown += OnFormShown;
            FormClosing += OnFormClosing;
        }

        private void OnFormLoad(object sender, EventArgs e)
        {
            ShowLoading();
        }

        /// <summary>
        /// WebView2 初始化。用户数据目录必须显式指到 ProgramData：
        /// 默认目录在 exe 同级的 EBWebView 下，而安装目录（Program Files）对普通用户只读，
        /// 会让 WebView2 初始化直接失败。
        /// </summary>
        private async void OnFormShown(object sender, EventArgs e)
        {
            try
            {
                Directory.CreateDirectory(AppPaths.WebViewData);
                CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(
                    null, AppPaths.WebViewData, null);
                await web.EnsureCoreWebView2Async(environment);

                web.CoreWebView2.Settings.AreDevToolsEnabled = false;
                web.CoreWebView2.Settings.IsStatusBarEnabled = false;
                web.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = true;
                web.CoreWebView2.NewWindowRequested += OnNewWindowRequested;

                coreReady = true;
                ShowLoading();
                if (pendingNavigate)
                {
                    pendingNavigate = false;
                    NavigateToApp();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "浏览器内核（WebView2）初始化失败，无法打开界面。\r\n\r\n" +
                    "常见原因：系统未安装 WebView2 运行时。\r\n" +
                    "可访问 https://go.microsoft.com/fwlink/p/?LinkId=2124703 安装后重试。\r\n\r\n" +
                    "错误：" + ex.Message,
                    Brand.AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        /// <summary>新窗口请求（target=_blank / window.open）交给系统默认浏览器打开</summary>
        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            try
            {
                Process.Start(e.Uri);
            }
            catch
            {
                // 打不开外链不影响主界面
            }
        }

        private void ShowLoading()
        {
            if (!coreReady) return;
            try
            {
                web.CoreWebView2.NavigateToString(LoadingHtml());
            }
            catch
            {
            }
        }

        /// <summary>重启服务时先切回加载页</summary>
        public void ShowLoadingPage()
        {
            ShowLoading();
        }

        public void NavigateToApp()
        {
            if (!coreReady)
            {
                pendingNavigate = true;
                return;
            }
            try
            {
                web.CoreWebView2.Navigate(AppUrl);
            }
            catch
            {
            }
        }

        public void ShowWindow()
        {
            if (WindowState == FormWindowState.Minimized)
            {
                WindowState = FormWindowState.Normal;
            }
            Show();
            Activate();
        }

        /// <summary>真正退出时调用，解除「关窗即托盘」拦截</summary>
        public void AllowRealClose()
        {
            allowClose = true;
        }

        private void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            // 只有用户点右上角关闭才拦截；系统关机 / Application.Exit / 任务管理器结束一律放行
            if (e.CloseReason == CloseReason.WindowsShutDown ||
                e.CloseReason == CloseReason.ApplicationExitCall ||
                e.CloseReason == CloseReason.TaskManagerClosing)
            {
                return;
            }
            if (allowClose) return;
            e.Cancel = true;
            Hide();
            if (!hintedTray)
            {
                hintedTray = true;
                Action<string, string> balloon = ShowBalloon;
                if (balloon != null)
                {
                    balloon(Brand.AppTitle,
                        "程序已最小化到托盘继续运行，同事仍可访问。需完全退出请右键托盘图标选择「退出」。");
                }
            }
        }

        private static string LoadingHtml()
        {
            return "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><style>" +
                   "body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;" +
                   "font-family:\"Microsoft YaHei\",\"PingFang SC\",sans-serif;background:#f2f4f7;color:#1f2937}" +
                   ".box{text-align:center}.spin{width:36px;height:36px;border:3px solid #e5e7eb;" +
                   "border-top-color:#4F46E5;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 18px}" +
                   "@keyframes spin{to{transform:rotate(360deg)}}" +
                   ".t{font-size:15px}.s{margin-top:8px;font-size:12px;color:#6b7280}" +
                   "</style></head><body><div class=\"box\"><div class=\"spin\"></div>" +
                   "<div class=\"t\">正在启动服务…</div>" +
                   "<div class=\"s\">首次启动需初始化数据库，约 1-3 分钟，请耐心等待</div></div></body></html>";
        }
    }
}
