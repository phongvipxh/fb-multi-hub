using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;

namespace FBMultiHubStandalone
{
    class Program
    {
        private static Process serverProcess = null;

        [DllImport("Kernel32")]
        private static extern bool SetConsoleCtrlHandler(EventHandler handler, bool add);
        private delegate bool EventHandler(CtrlType sig);
        private static EventHandler handler;

        private enum CtrlType
        {
            CTRL_C_EVENT = 0,
            CTRL_BREAK_EVENT = 1,
            CTRL_CLOSE_EVENT = 2,
            CTRL_LOGOFF_EVENT = 5,
            CTRL_SHUTDOWN_EVENT = 6
        }

        private static bool Handler(CtrlType sig)
        {
            KillServer();
            return false;
        }

        static void KillServer()
        {
            if (serverProcess != null && !serverProcess.HasExited)
            {
                try
                {
                    serverProcess.Kill();
                }
                catch { }
                serverProcess = null;
            }
        }

        static void Main(string[] args)
        {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            Console.Title = "FB Multi-Hub - Standalone Single-File Edition";

            handler = new EventHandler(Handler);
            SetConsoleCtrlHandler(handler, true);
            AppDomain.CurrentDomain.ProcessExit += (s, e) => KillServer();

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("==================================================================");
            Console.WriteLine("   🚀 FB MULTI-HUB - PHIÊN BẢN ĐÓNG GÓI 1 FILE DUY NHẤT (.EXE)");
            Console.WriteLine("   Tự giải nén môi trường, độc lập 100%, không cần cài đặt gì");
            Console.WriteLine("==================================================================");
            Console.ResetColor();

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string appDir = Path.Combine(baseDir, "_runtime");
            string dataDir = Path.Combine(baseDir, "data");

            if (!Directory.Exists(dataDir)) Directory.CreateDirectory(dataDir);

            // Check if runtime folder exists
            string serverJs = Path.Combine(appDir, @"src\server.js");
            if (!Directory.Exists(appDir) || !File.Exists(serverJs))
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("➜ Lần đầu khởi chạy: Đang tự động giải nén môi trường ứng dụng...");
                Console.ResetColor();

                Assembly assembly = Assembly.GetExecutingAssembly();
                using (Stream stream = assembly.GetManifestResourceStream("Payload"))
                {
                    if (stream == null)
                    {
                        Console.ForegroundColor = ConsoleColor.Red;
                        Console.WriteLine("❌ Lỗi: Không tìm thấy gói tài nguyên nhúng Payload trong file exe!");
                        Console.ResetColor();
                        Console.WriteLine("Nhấn phím bất kỳ để thoát...");
                        Console.ReadKey();
                        return;
                    }

                    string tempZip = Path.Combine(baseDir, "temp_payload.zip");
                    using (FileStream fs = new FileStream(tempZip, FileMode.Create, FileAccess.Write))
                    {
                        stream.CopyTo(fs);
                    }

                    if (Directory.Exists(appDir)) Directory.Delete(appDir, true);
                    ZipFile.ExtractToDirectory(tempZip, appDir);
                    File.Delete(tempZip);
                }

                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("✔ Đã giải nén môi trường ứng dụng thành công!");
                Console.ResetColor();
            }

            // Sync or copy data folder into runtime if needed
            string runtimeData = Path.Combine(appDir, "data");
            if (!Directory.Exists(runtimeData)) Directory.CreateDirectory(runtimeData);

            // Check node binary
            string nodeExe = "node";
            string portableNode = Path.Combine(appDir, @"bin\node\node.exe");
            bool hasNode = false;

            if (File.Exists(portableNode))
            {
                nodeExe = portableNode;
                hasNode = true;
            }
            else
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo("node", "-v")
                    {
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        CreateNoWindow = true
                    };
                    using (Process p = Process.Start(psi))
                    {
                        string output = p.StandardOutput.ReadToEnd();
                        p.WaitForExit();
                        if (p.ExitCode == 0 && output.Trim().StartsWith("v"))
                        {
                            hasNode = true;
                        }
                    }
                }
                catch { }
            }

            // If Node is missing, run bundled setup_and_start.ps1 to download portable Node.js
            if (!hasNode)
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("➜ Chưa phát hiện Node.js trên máy! Đang tự động tải bộ cài đặt Node.js Portable...");
                Console.ResetColor();

                string psScript = Path.Combine(appDir, "setup_and_start.ps1");
                ProcessStartInfo psiPs = new ProcessStartInfo("powershell", string.Format("-NoProfile -ExecutionPolicy Bypass -File \"{0}\"", psScript))
                {
                    WorkingDirectory = appDir,
                    UseShellExecute = true
                };
                using (Process p = Process.Start(psiPs))
                {
                    p.WaitForExit();
                }
                return;
            }

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("➜ Đang khởi chạy FB Multi-Hub Server...");
            Console.ResetColor();

            ProcessStartInfo serverPsi = new ProcessStartInfo(nodeExe, string.Format("\"{0}\"", serverJs))
            {
                WorkingDirectory = appDir,
                UseShellExecute = false,
                RedirectStandardOutput = false,
                RedirectStandardError = false
            };

            string binDir = Path.Combine(appDir, "bin");
            string nodeDir = Path.Combine(appDir, @"bin\node");
            string currentPath = Environment.GetEnvironmentVariable("PATH") ?? "";
            serverPsi.EnvironmentVariables["PATH"] = binDir + ";" + nodeDir + ";" + currentPath;
            serverPsi.EnvironmentVariables["DB_PATH"] = Path.Combine(dataDir, "fb_tool.db");

            string port = Environment.GetEnvironmentVariable("PORT");
            if (string.IsNullOrEmpty(port)) port = "3000";

            try
            {
                serverProcess = Process.Start(serverPsi);
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Lỗi khởi chạy: " + ex.Message);
                Console.ResetColor();
                Console.WriteLine("Nhấn phím bất kỳ để thoát...");
                Console.ReadKey();
                return;
            }

            new Thread(() =>
            {
                Thread.Sleep(2000);
                try
                {
                    Process.Start("http://localhost:" + port);
                }
                catch { }
            }).Start();

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine(string.Format("\n👉 Dashboard: http://localhost:{0} (Trình duyệt sẽ tự động mở)", port));
            Console.WriteLine("👉 Đang chạy ngầm... Đóng cửa sổ này hoặc bấm Ctrl+C để tắt app.\n");
            Console.ResetColor();

            serverProcess.WaitForExit();
        }
    }
}
