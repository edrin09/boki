using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace BokiShell
{
    /// <summary>
    /// 后端 Node 进程管理：启动、日志落盘、异常退出回调、就绪探测。
    ///
    /// 后端产物布局（安装目录）：
    ///   resources\server\node.exe
    ///   resources\server\dist\main.js
    ///   resources\server\node_modules\...
    ///   resources\web\...（前端静态文件）
    /// </summary>
    internal sealed class BackendProcess
    {
        private const long LogMaxBytes = 5 * 1024 * 1024;
        private const int PortProbeTimeoutMs = 2000;
        private const int PortProbeIntervalMs = 400;

        private readonly object logLock = new object();
        private StreamWriter logWriter;
        private readonly string serverDir;
        private readonly string nodeExe;
        private readonly string entry;

        public Process Child { get; private set; }
        public bool Stopping { get; set; }
        public Action<string, Exception> Crashed { get; set; }

        public BackendProcess()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            serverDir = Path.Combine(baseDir, "resources", "server");
            nodeExe = Path.Combine(serverDir, "node.exe");
            entry = Path.Combine(serverDir, "dist", "main.js");
        }

        /// <summary>追加日志；超过 5 MB 先轮转为 server.log.1，避免无限增长。</summary>
        public void Log(string line)
        {
            lock (logLock)
            {
                try
                {
                    Directory.CreateDirectory(AppPaths.Logs);
                    if (logWriter == null)
                    {
                        FileInfo info = new FileInfo(AppPaths.LogFile);
                        if (info.Exists && info.Length > LogMaxBytes)
                        {
                            string rotated = AppPaths.LogFile + ".1";
                            if (File.Exists(rotated)) File.Delete(rotated);
                            File.Move(AppPaths.LogFile, rotated);
                        }
                        FileStream stream = new FileStream(
                            AppPaths.LogFile, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
                        logWriter = new StreamWriter(stream, new UTF8Encoding(false));
                        logWriter.AutoFlush = true;
                    }
                    logWriter.WriteLine("[" + DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss.fff") + "] " + line);
                }
                catch
                {
                    // 日志失败绝不影响主流程
                }
            }
        }

        public void Start(int port, string jwtSecret)
        {
            Stopping = false;
            Log("--- 启动后端: " + nodeExe + " " + entry + " (port=" + port + ") ---");
            Log(Brand.MarketUrl.Length > 0
                ? "--- 插件市场: " + Brand.MarketUrl + "（验签公钥 " + (Brand.MarketPublicKeys.Length > 0 ? "已配置" : "缺失") + "）---"
                : "--- 插件市场: 未配置 PLUGIN_MARKET_URL，插件市场不可用 ---");

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = nodeExe;
            psi.Arguments = "\"" + entry + "\"";
            psi.WorkingDirectory = serverDir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.StandardOutputEncoding = Encoding.UTF8;
            psi.StandardErrorEncoding = Encoding.UTF8;

            ApplyEnvironment(psi, port, jwtSecret);

            Process process = new Process();
            process.StartInfo = psi;
            process.EnableRaisingEvents = true;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null) Log(e.Data);
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null) Log(e.Data);
            };
            process.Exited += OnChildExited;
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            Child = process;
            NativeMethods.BindToJob(process);
        }

        private void OnChildExited(object sender, EventArgs e)
        {
            Process process = (Process)sender;
            int code = -1;
            try { code = process.ExitCode; }
            catch { }

            if (ReferenceEquals(Child, process)) Child = null;

            if (Stopping)
            {
                Log("后端已停止 (code=" + code + ")");
                return;
            }
            Log("后端异常退出 (code=" + code + ")");
            Action<string, Exception> handler = Crashed;
            if (handler != null) handler("exit", null);
        }

        /// <summary>停止后端；5 秒未退出则强杀。</summary>
        public void Stop()
        {
            Stopping = true;
            Process process = Child;
            if (process == null) return;
            try
            {
                if (!process.HasExited)
                {
                    process.Kill();
                    process.WaitForExit(5000);
                }
            }
            catch
            {
                // 已退出
            }
            Child = null;
        }

        /// <summary>
        /// 环境变量说明：
        /// 后端只认这些键，漏一项就会在装完才暴露（例如 BOKI_PLUGINS_DIR 缺失导致
        /// 往 Program Files 写插件目录被 EPERM 拒绝）。
        /// </summary>
        private void ApplyEnvironment(ProcessStartInfo psi, int port, string jwtSecret)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string webDir = Path.Combine(baseDir, "resources", "web");
            string nodeModules = Path.Combine(serverDir, "node_modules");

            psi.EnvironmentVariables["NODE_ENV"] = "production";
            psi.EnvironmentVariables["APP_PORT"] = port.ToString();
            psi.EnvironmentVariables["APP_PREFIX"] = "api";
            psi.EnvironmentVariables["DB_DATABASE"] = AppPaths.DbFile;
            psi.EnvironmentVariables["BOKI_PLUGINS_DIR"] = AppPaths.PluginsDir;
            psi.EnvironmentVariables["PLUGIN_MARKET_URL"] = Brand.MarketUrl;
            psi.EnvironmentVariables["PLUGIN_MARKET_PUBLIC_KEYS"] = Brand.MarketPublicKeys;
            psi.EnvironmentVariables["NODE_PATH"] = nodeModules;
            psi.EnvironmentVariables["VAULT_FILE"] = AppPaths.VaultFile;
            psi.EnvironmentVariables["VAULT_KEY_FILE"] = AppPaths.VaultKeyFile;
            psi.EnvironmentVariables["DB_SYNCHRONIZE"] = "true";
            psi.EnvironmentVariables["DB_LOGGING"] = "false";
            psi.EnvironmentVariables["UPLOAD_DIR"] = AppPaths.Uploads;
            psi.EnvironmentVariables["WEB_DIST_DIR"] = webDir;
            psi.EnvironmentVariables["JWT_SECRET"] = jwtSecret;
            psi.EnvironmentVariables["JWT_EXPIRES_IN"] = "8h";
            psi.EnvironmentVariables["CORS_ORIGIN"] = "*";
            psi.EnvironmentVariables["INIT_ADMIN_USERNAME"] = "admin";
            psi.EnvironmentVariables["INIT_ADMIN_PASSWORD"] = "123456";
            psi.EnvironmentVariables["INIT_ADMIN_NICKNAME"] = "系统管理员";
            psi.EnvironmentVariables["APP_TITLE"] = Brand.AppTitle;
            psi.EnvironmentVariables["OFFICIAL_SITE"] = Brand.OfficialSite;
            psi.EnvironmentVariables["PUBLISHER_NAME"] = Brand.Publisher;
            psi.EnvironmentVariables["CONTACT_EMAIL"] = Brand.Email;
            psi.EnvironmentVariables["CONTACT_PHONE"] = Brand.Phone;
            psi.EnvironmentVariables["CONTACT_WECHAT"] = Brand.Wechat;
        }

        /// <summary>端口是否可绑定（后端监听 0.0.0.0）</summary>
        public static bool IsPortFree(int port)
        {
            TcpListener listener = null;
            try
            {
                listener = new TcpListener(IPAddress.Any, port);
                listener.Start();
                return true;
            }
            catch
            {
                return false;
            }
            finally
            {
                if (listener != null)
                {
                    try { listener.Stop(); }
                    catch { }
                }
            }
        }

        /// <summary>
        /// 等待后端就绪：收到任意 HTTP 状态码即视为可用（401/404 也算，只要 HTTP 栈起来了）。
        /// 首次启动要建表并灌种子数据，耗时不稳定，必须轮询而不是固定 sleep。
        /// </summary>
        public static bool WaitReady(int port, int timeoutMs)
        {
            DateTime deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
            while (DateTime.UtcNow < deadline)
            {
                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(
                        "http://127.0.0.1:" + port + "/api");
                    request.Timeout = PortProbeTimeoutMs;
                    request.Method = "GET";
                    request.Proxy = null;
                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    {
                        return true;
                    }
                }
                catch (WebException ex)
                {
                    // 有响应（无论状态码）就算就绪
                    if (ex.Response != null)
                    {
                        try { ex.Response.Close(); }
                        catch { }
                        return true;
                    }
                }
                catch
                {
                }
                System.Threading.Thread.Sleep(PortProbeIntervalMs);
            }
            return false;
        }
    }
}
