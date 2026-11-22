using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace BokiShell
{
    /// <summary>
    /// 运行期路径与配置。
    ///
    /// 数据目录固定为 ProgramData\BOKI（安装目录对普通用户只读，
    /// SQLite 建库与 WAL 写入必须落在可写位置），升级后原账套、日志、插件目录原地可用。
    /// </summary>
    internal static class AppPaths
    {
        private const string AppDirName = "BOKI";
        private const int DefaultPort = 9300;

        public static readonly string Root = ResolveRoot();
        public static readonly string Data = Path.Combine(Root, "data");
        public static readonly string Backup = Path.Combine(Data, "backup");
        public static readonly string Uploads = Path.Combine(Data, "uploads");
        public static readonly string Logs = Path.Combine(Root, "logs");
        public static readonly string ConfigFile = Path.Combine(Root, "config.json");
        public static readonly string DbFile = Path.Combine(Data, "financial.db");
        public static readonly string VaultFile = Path.Combine(Data, "vault.json");
        public static readonly string VaultKeyFile = Path.Combine(Root, "vault.key");
        public static readonly string LogFile = Path.Combine(Logs, "server.log");
        public static readonly string PluginsDir = Path.Combine(Root, "plugins");
        public static readonly string WebViewData = Path.Combine(Root, "webview2");

        /// <summary>数据根目录：ProgramData\BOKI。</summary>
        private static string ResolveRoot()
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), AppDirName);
        }

        public static void EnsureDirs()
        {            string[] dirs = new string[] { Root, Data, Backup, Uploads, Logs, PluginsDir, WebViewData };
            foreach (string dir in dirs)
            {
                Directory.CreateDirectory(dir);
            }
        }

        /// <summary>
        /// 读取或初始化 config.json：端口非法时回退 9300，jwtSecret 缺失时生成一次并持久化
        /// （轮换会让既有登录态全部失效）。
        /// </summary>
        public static AppConfig LoadConfig()
        {
            EnsureDirs();
            AppConfig cfg = new AppConfig();
            cfg.Port = DefaultPort;
            cfg.JwtSecret = null;

            try
            {
                if (File.Exists(ConfigFile))
                {
                    string raw = File.ReadAllText(ConfigFile);
                    int port;
                    if (TryReadInt(raw, "port", out port) && port >= 1 && port <= 65535)
                    {
                        cfg.Port = port;
                    }
                    string secret = ReadString(raw, "jwtSecret");
                    if (secret != null && secret.Length >= 32)
                    {
                        cfg.JwtSecret = secret;
                    }
                }
            }
            catch
            {
                // 配置损坏按默认值重建，不让用户卡在启动阶段
            }

            bool dirty = false;
            if (cfg.JwtSecret == null)
            {
                byte[] buffer = new byte[32];
                using (var rng = new System.Security.Cryptography.RNGCryptoServiceProvider())
                {
                    rng.GetBytes(buffer);
                }
                cfg.JwtSecret = ToHex(buffer);
                dirty = true;
            }
            if (dirty)
            {
                SaveConfig(cfg);
            }
            return cfg;
        }

        public static void SaveConfig(AppConfig cfg)
        {
            EnsureDirs();
            string json = "{\r\n  \"port\": " + cfg.Port + ",\r\n  \"jwtSecret\": \"" + cfg.JwtSecret + "\"\r\n}";
            File.WriteAllText(ConfigFile, json);
        }

        /// <summary>枚举非内部 IPv4（多网卡机器全部列出，供局域网访问地址复制）</summary>
        public static List<LanAddress> LanAddresses()
        {
            List<LanAddress> result = new List<LanAddress>();
            try
            {
                foreach (NetworkInterface nic in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (nic.OperationalStatus != OperationalStatus.Up) continue;
                    foreach (UnicastIPAddressInformation info in nic.GetIPProperties().UnicastAddresses)
                    {
                        if (info.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                        if (IPAddress.IsLoopback(info.Address)) continue;
                        result.Add(new LanAddress(nic.Name, info.Address.ToString()));
                    }
                }
            }
            catch
            {
                // 取不到网卡信息时只显示本机地址
            }
            return result;
        }

        private static bool TryReadInt(string json, string key, out int value)
        {
            value = 0;
            int at = json.IndexOf("\"" + key + "\"", StringComparison.Ordinal);
            if (at < 0) return false;
            int colon = json.IndexOf(':', at);
            if (colon < 0) return false;
            int i = colon + 1;
            while (i < json.Length && char.IsWhiteSpace(json[i])) i++;
            int start = i;
            while (i < json.Length && char.IsDigit(json[i])) i++;
            return i > start && int.TryParse(json.Substring(start, i - start), out value);
        }

        private static string ReadString(string json, string key)
        {
            int at = json.IndexOf("\"" + key + "\"", StringComparison.Ordinal);
            if (at < 0) return null;
            int colon = json.IndexOf(':', at);
            if (colon < 0) return null;
            int first = json.IndexOf('"', colon + 1);
            if (first < 0) return null;
            int second = json.IndexOf('"', first + 1);
            if (second < 0) return null;
            return json.Substring(first + 1, second - first - 1);
        }

        private static string ToHex(byte[] bytes)
        {
            char[] chars = new char[bytes.Length * 2];
            const string hex = "0123456789abcdef";
            for (int i = 0; i < bytes.Length; i++)
            {
                chars[i * 2] = hex[bytes[i] >> 4];
                chars[i * 2 + 1] = hex[bytes[i] & 0xF];
            }
            return new string(chars);
        }
    }

    internal sealed class AppConfig
    {
        public int Port;
        public string JwtSecret;
    }

    internal sealed class LanAddress
    {
        public readonly string Name;
        public readonly string Address;

        public LanAddress(string name, string address)
        {
            Name = name;
            Address = address;
        }
    }
}
