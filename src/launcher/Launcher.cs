using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace FBMultiHub
{
    class Program
    {
        private static Process serverProcess = null;

        // Native Windows handler for Console close / Ctrl+C
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
            Console.Title = "FB Multi-Hub - Portable Server Launcher";

            handler = new EventHandler(Handler);
            SetConsoleCtrlHandler(handler, true);
            AppDomain.CurrentDomain.ProcessExit += (s, e) => KillServer();

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("==================================================================");
            Console.WriteLine("   🚀 FB MULTI-HUB - BỘ KHỞI CHẠY PORTABLE 1-CLICK (WINDOWS)");
            Console.WriteLine("   Hệ thống Quản trị Đa Fanpage Facebook & Báo Thức Xuyên Đêm");
            Console.WriteLine("==================================================================");
            Console.ResetColor();

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;

            // 1. Ensure data directory
            string dataDir = Path.Combine(baseDir, "data");
            if (!Directory.Exists(dataDir)) Directory.CreateDirectory(dataDir);

            // 2. Locate Node.js executable
            string nodeExe = "node";
            string portableNode = Path.Combine(baseDir, @"bin\node\node.exe");

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

            // Check essential files
            string nodeModules = Path.Combine(baseDir, "node_modules");
            string serverJs = Path.Combine(baseDir, @"src\server.js");

            // If Node is missing or dependencies are missing, delegate to setup_and_start.ps1
            if (!hasNode || !Directory.Exists(nodeModules) || !File.Exists(serverJs))
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("➜ Chưa phát hiện đủ môi trường, đang chạy tự động cài đặt qua PowerShell...");
                Console.ResetColor();

                string psScript = Path.Combine(baseDir, "setup_and_start.ps1");
                ProcessStartInfo psiPs = new ProcessStartInfo("powershell", string.Format("-NoProfile -ExecutionPolicy Bypass -File \"{0}\"", psScript))
                {
                    UseShellExecute = true
                };
                using (Process p = Process.Start(psiPs))
                {
                    p.WaitForExit();
                }
                return;
            }

            // Launch Server
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("➜ Môi trường đã sẵn sàng. Đang khởi chạy hệ thống...");
            Console.ResetColor();

            ProcessStartInfo serverPsi = new ProcessStartInfo(nodeExe, string.Format("\"{0}\"", serverJs))
            {
                WorkingDirectory = baseDir,
                UseShellExecute = false,
                RedirectStandardOutput = false,
                RedirectStandardError = false
            };

            // Set PATH to prioritize local bin and bin\node
            string binDir = Path.Combine(baseDir, "bin");
            string nodeDir = Path.Combine(baseDir, @"bin\node");
            string currentPath = Environment.GetEnvironmentVariable("PATH") ?? "";
            serverPsi.EnvironmentVariables["PATH"] = binDir + ";" + nodeDir + ";" + currentPath;

            try
            {
                serverProcess = Process.Start(serverPsi);
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Lỗi khởi chạy server: " + ex.Message);
                Console.ResetColor();
                Console.WriteLine("Nhấn phím bất kỳ để thoát...");
                Console.ReadKey();
                return;
            }

            // Auto-open browser after 2 seconds
            new Thread(() =>
            {
                Thread.Sleep(2000);
                try
                {
                    Process.Start("http://localhost:3000");
                }
                catch { }
            }).Start();

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("\n👉 Dashboard: http://localhost:3000 (Trình duyệt sẽ tự động mở)");
            Console.WriteLine("👉 Đang chạy ngầm... Đóng cửa sổ này hoặc bấm Ctrl+C để dừng app.\n");
            Console.ResetColor();

            serverProcess.WaitForExit();
        }
    }
}
