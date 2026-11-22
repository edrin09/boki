using System;
using System.Drawing;
using System.Windows.Forms;

namespace BokiShell
{
    /// <summary>「关于」对话框：开发者与联系方式（值来自根 .env，构建时写入 Brand）。</summary>
    internal sealed class AboutForm : Form
    {
        private readonly string detail;

        public AboutForm()
        {
            detail = "开发者：" + Brand.Publisher + "\r\n" +
                     "电子邮箱：" + Brand.Email + "\r\n" +
                     "联系电话：" + Brand.Phone + "\r\n" +
                     "微    信：" + Brand.Wechat + "\r\n" +
                     "官    网：" + Brand.OfficialSite;

            Text = "关于 " + Brand.AppTitle;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterParent;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = false;
            ClientSize = new Size(460, 268);
            BackColor = Color.White;
            try
            {
                Icon = TrayController.LoadAppIcon(16);
            }
            catch
            {
            }

            Label title = new Label();
            title.Text = Brand.AppTitle + " 桌面版 v" + Brand.Version;
            title.Font = new Font("Microsoft YaHei", 13F, FontStyle.Bold);
            title.AutoSize = true;
            title.Location = new Point(20, 18);
            Controls.Add(title);

            Label subtitle = new Label();
            subtitle.Text = "离线优先 · 复式记账 · 开源财务软件";
            subtitle.ForeColor = Color.FromArgb(107, 114, 128);
            subtitle.AutoSize = true;
            subtitle.Location = new Point(22, 50);
            Controls.Add(subtitle);

            TextBox info = new TextBox();
            info.Multiline = true;
            info.ReadOnly = true;
            info.BorderStyle = BorderStyle.None;
            info.BackColor = Color.White;
            info.Font = new Font("Microsoft YaHei", 9.5F);
            info.Text = detail;
            info.Location = new Point(24, 84);
            info.Size = new Size(412, 120);
            info.TabStop = false;
            Controls.Add(info);

            Button copy = new Button();
            copy.Text = "复制联系方式";
            copy.Location = new Point(24, 216);
            copy.Size = new Size(120, 30);
            copy.Click += delegate { TrayController.CopyText(detail); };
            Controls.Add(copy);

            Button site = new Button();
            site.Text = "访问官网";
            site.Location = new Point(154, 216);
            site.Size = new Size(100, 30);
            site.Click += delegate { TrayController.OpenUrl(Brand.OfficialSite); };
            Controls.Add(site);

            Button close = new Button();
            close.Text = "关闭";
            close.Location = new Point(336, 216);
            close.Size = new Size(100, 30);
            close.DialogResult = DialogResult.OK;
            Controls.Add(close);

            AcceptButton = close;
            CancelButton = close;
        }
    }
}
