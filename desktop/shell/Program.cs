using System;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;

namespace BokiShell
{
    /// <summary>
    /// 轻壳入口：单实例、端口检查、主窗口 + 托盘、后端进程生命周期。
    ///
    /// 行为约定：
    /// - 关窗不退出（主机就是服务器），托盘常驻；
    /// - 后端异常退出自动重启，连续 3 次失败才停手并提示；
    /// - 启动等待期给「继续等待 / 打开日志 / 退出」，不把界面永久停在加载页。
    /// </summary>
    internal static class Program
    {
        private const int ReadyTimeoutMs = 300000;
        private const int MaxAutoRestarts = 3;
        private const string MutexName = "Local\\BOKI-Desktop-SingleInstance";
        private const string ShowEventName = "Local\\BOKI-Desktop-ShowWindow";

        private static Mutex instanceMutex;
        private static EventWaitHandle showEvent;
        private static MainForm mainForm;
        private static TrayController tray;
        private static BackendProcess backend;
        private static AppConfig config;
        private static bool quitting;
        private static int restarts;

        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool createdNew;
            instanceMutex = new Mutex(true, MutexName, out createdNew);
            if (!createdNew)
            {
                // 双开会抢 SQLite 与端口，表现为莫名启动失败：只把已有实例唤到前台
                try
                {
                    using (EventWaitHandle signal = EventWaitHandle.OpenExisting(ShowEventName))
                    {
                        signal.Set();
                    }
                }
                catch
                {
                }
                return;
            }

            showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowEventName);
            Thread activationWatcher = new Thread(WatchActivation);
            activationWatcher.IsBackground = true;
            activationWatcher.Start();

            config = AppPaths.LoadConfig();
            if (!BackendProcess.IsPortFree(config.Port))
            {
                DialogResult choice = MessageBox.Show(
                    "端口 " + config.Port + " 已被占用，服务无法启动。\r\n\r\n" +
                    "请关闭占用该端口的程序后重试，或修改配置文件中的 port 换一个端口。\r\n\r\n" +
                    "配置文件：" + AppPaths.ConfigFile,
                    Brand.AppTitle, MessageBoxButtons.OKCancel, MessageBoxIcon.Error);
                if (choice == DialogResult.OK)
                {
                    try
                    {
                        Process.Start("notepad.exe", AppPaths.ConfigFile);
                    }
                    catch
                    {
                    }
                }
                return;
            }

            mainForm = new MainForm();
            mainForm.AppUrl = "http://127.0.0.1:" + config.Port;
            tray = new TrayController(mainForm, mainForm.AppUrl, RestartBackend, ExitApp);
            mainForm.ShowBalloon = tray.ShowBalloon;
            mainForm.Shown += delegate { StartBackend(); };

            NativeMethods.PreventSystemSleep();

            try
            {
                Application.Run(mainForm);
            }
            finally
            {
                NativeMethods.AllowSystemSleep();
                if (backend != null) backend.Stop();
                if (tray != null) tray.Dispose();
            }
        }

        private static void WatchActivation()
        {
            while (true)
            {
                try
                {
                    showEvent.WaitOne();
                    MainForm form = mainForm;
                    if (form == null) continue;
                    form.BeginInvoke(new Action(form.ShowWindow));
                }
                catch
                {
                    // 窗口已销毁：结束监听线程
                    return;
                }
            }
        }

        private static void StartBackend()
        {
            backend = new BackendProcess();
            backend.Crashed = OnBackendCrash;
            backend.Start(config.Port, config.JwtSecret);
            ThreadPool.QueueUserWorkItem(delegate { WaitUntilReady(); });
        }

        /// <summary>等待后端就绪；超时后给用户「继续等待 / 打开日志 / 退出」，直到就绪或用户放弃。</summary>
        private static void WaitUntilReady()
        {
            bool ready = BackendProcess.WaitReady(config.Port, ReadyTimeoutMs);
            while (!ready && !quitting)
            {
                DialogResult choice = AskSlowStartup();
                if (choice == DialogResult.No)
                {
                    TrayController.OpenPath(AppPaths.LogFile);
                    ready = BackendProcess.WaitReady(config.Port, ReadyTimeoutMs);
                    continue;
                }
                if (choice == DialogResult.Cancel)
                {
                    ExitAppOnUi();
                    return;
                }
                ready = BackendProcess.WaitReady(config.Port, ReadyTimeoutMs);
            }
            if (!ready || quitting) return;
            restarts = 0;
            NavigateOnUi();
        }

        private static DialogResult AskSlowStartup()
        {
            try
            {
                return (DialogResult)mainForm.Invoke(new Func<DialogResult>(delegate
                {
                    return MessageBox.Show(
                        mainForm,
                        "后端仍在初始化（首次启动较慢属正常），可继续等待。\r\n\r\n日志文件：" + AppPaths.LogFile,
                        "服务启动比预期慢",
                        MessageBoxButtons.YesNoCancel,
                        MessageBoxIcon.Warning);
                }));
            }
            catch
            {
                return DialogResult.Cancel;
            }
        }

        private static void OnBackendCrash(string reason, Exception error)
        {
            if (quitting) return;
            restarts++;
            BackendProcess process = backend;
            if (process != null)
            {
                process.Log("自动重启尝试 " + restarts + "/" + MaxAutoRestarts + "（原因：" + reason + "）");
            }

            if (restarts > MaxAutoRestarts)
            {
                ShowErrorOnUi(
                    "服务启动失败",
                    "后端连续 " + MaxAutoRestarts + " 次启动失败，已停止重试。",
                    "日志文件：" + AppPaths.LogFile + (error != null ? "\r\n错误：" + error.Message : ""));
                return;
            }

            ThreadPool.QueueUserWorkItem(delegate
            {
                Thread.Sleep(2000);
                if (quitting) return;
                if (process != null) process.Start(config.Port, config.JwtSecret);
                bool ready = BackendProcess.WaitReady(config.Port, ReadyTimeoutMs);
                if (ready && !quitting)
                {
                    restarts = 0;
                    NavigateOnUi();
                }
            });
        }

        private static void RestartBackend()
        {
            try
            {
                mainForm.BeginInvoke(new Action(mainForm.ShowLoadingPage));
            }
            catch
            {
            }
            ThreadPool.QueueUserWorkItem(delegate
            {
                BackendProcess process = backend;
                if (process != null) process.Stop();
                if (quitting) return;
                if (process != null) process.Start(config.Port, config.JwtSecret);
                bool ready = BackendProcess.WaitReady(config.Port, ReadyTimeoutMs);
                if (quitting) return;
                if (ready)
                {
                    restarts = 0;
                    NavigateOnUi();
                }
                else
                {
                    ShowErrorOnUi("服务启动失败", "后端未能就绪。", "日志文件：" + AppPaths.LogFile);
                }
            });
        }

        private static void NavigateOnUi()
        {
            try
            {
                mainForm.BeginInvoke(new Action(mainForm.NavigateToApp));
            }
            catch
            {
            }
        }

        private static void ShowErrorOnUi(string title, string message, string detail)
        {
            try
            {
                mainForm.BeginInvoke(new Action(delegate
                {
                    MessageBox.Show(mainForm, message + "\r\n\r\n" + detail, title,
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                }));
            }
            catch
            {
            }
        }

        private static void ExitAppOnUi()
        {
            try
            {
                mainForm.BeginInvoke(new Action(ExitApp));
            }
            catch
            {
            }
        }

        private static void ExitApp()
        {
            if (quitting) return;
            quitting = true;
            if (backend != null) backend.Stop();
            NativeMethods.AllowSystemSleep();
            if (mainForm != null)
            {
                mainForm.AllowRealClose();
                mainForm.Close();
            }
            Application.Exit();
        }
    }
}
