using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace BokiShell
{
    /// <summary>托盘图标与右键菜单。</summary>
    internal sealed class TrayController : IDisposable
    {
        private readonly NotifyIcon icon;
        private readonly MainForm form;
        private readonly Action restartAction;
        private readonly Action exitAction;
        private readonly string appUrl;

        public TrayController(MainForm form, string appUrl, Action restartAction, Action exitAction)
        {
            this.form = form;
            this.appUrl = appUrl;
            this.restartAction = restartAction;
            this.exitAction = exitAction;

            icon = new NotifyIcon();
            icon.Icon = LoadAppIcon(16) ?? SystemIcons.Application;
            icon.Text = Brand.AppTitle;
            icon.Visible = true;
            icon.DoubleClick += delegate { form.ShowWindow(); };
            icon.ContextMenuStrip = new ContextMenuStrip();
            icon.ContextMenuStrip.Opening += delegate(object sender, System.ComponentModel.CancelEventArgs e)
            {
                ContextMenuStrip menu = (ContextMenuStrip)sender;
                menu.Items.Clear();
                FillMenu(menu);
            };
        }

        /// <summary>
        /// 从 exe 旁的 icon.ico 按指定像素取原生帧（托盘 16px、任务栏 32px）。
        /// ExtractAssociatedIcon 只返回 32x32 帧，托盘会把 32px 硬缩到 16px，
        /// 角标发虚；icon.ico 含 16~256 各尺寸，按需提取即为原生清晰度。
        /// </summary>
        internal static Icon LoadAppIcon(int size)
        {
            try
            {
                string icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "icon.ico");
                if (File.Exists(icoPath))
                {
                    return new Icon(icoPath, size, size);
                }
            }
            catch
            {
            }
            try
            {
                return Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch
            {
                return null;
            }
        }

        public void ShowBalloon(string title, string text)
        {
            try
            {
                icon.ShowBalloonTip(4000, title, text, ToolTipIcon.Info);
            }
            catch
            {
            }
        }

        private void FillMenu(ContextMenuStrip menu)
        {
            ToolStripMenuItem local = new ToolStripMenuItem("本机访问：" + appUrl);
            local.Click += delegate { form.ShowWindow(); };
            menu.Items.Add(local);

            ToolStripMenuItem lan = new ToolStripMenuItem("复制局域网地址");
            List<LanAddress> addresses = AppPaths.LanAddresses();
            lan.Enabled = addresses.Count > 0;
            foreach (LanAddress item in addresses)
            {
                string name = item.Name;
                string address = item.Address;
                ToolStripMenuItem child = new ToolStripMenuItem(address + "（" + name + "）");
                child.Click += delegate
                {
                    CopyText("http://" + address + ":" + PortOf(appUrl));
                    ShowBalloon(Brand.AppTitle, "已复制：http://" + address + ":" + PortOf(appUrl));
                };
                lan.DropDownItems.Add(child);
            }
            menu.Items.Add(lan);
            menu.Items.Add(new ToolStripSeparator());

            menu.Items.Add(MenuItem("打开界面", delegate { form.ShowWindow(); }));
            menu.Items.Add(MenuItem("打开数据目录", delegate { OpenPath(AppPaths.Root); }));
            menu.Items.Add(MenuItem("打开日志", delegate { OpenPath(AppPaths.LogFile); }));
            menu.Items.Add(MenuItem("访问官网", delegate { OpenUrl(Brand.OfficialSite); }));
            menu.Items.Add(MenuItem("关于 " + Brand.AppTitle, delegate
            {
                using (AboutForm about = new AboutForm())
                {
                    about.ShowDialog(form);
                }
            }));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(MenuItem("重启服务", delegate
            {
                Action action = restartAction;
                if (action != null) action();
            }));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(MenuItem("退出", delegate
            {
                Action action = exitAction;
                if (action != null) action();
            }));
        }

        private static ToolStripMenuItem MenuItem(string text, EventHandler handler)
        {
            ToolStripMenuItem item = new ToolStripMenuItem(text);
            item.Click += handler;
            return item;
        }

        private static string PortOf(string url)
        {
            try
            {
                Uri uri = new Uri(url);
                return uri.Port.ToString();
            }
            catch
            {
                return AppPaths.LoadConfig().Port.ToString();
            }
        }

        public static void CopyText(string text)
        {
            try
            {
                Clipboard.SetText(text);
            }
            catch
            {
            }
        }

        public static void OpenUrl(string url)
        {
            try
            {
                Process.Start(url);
            }
            catch
            {
            }
        }

        public static void OpenPath(string path)
        {
            try
            {
                Process.Start("explorer.exe", path);
            }
            catch
            {
            }
        }

        public void Dispose()
        {
            icon.Visible = false;
            icon.Dispose();
        }
    }
}
