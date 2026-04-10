#!/bin/bash
# OpenCode 飞书插件环境初始化脚本
# 使用方式：./setup-feishu.sh [安装目录]

set -e

# 默认安装目录
INSTALL_DIR="${1:-$HOME/work/opencode-feishu}"
CONFIG_DIR="$HOME/.config/opencode-feishu/opencode"
PLUGINS_DIR="$CONFIG_DIR/plugins"
BIN_DIR="$HOME/.local/bin"

echo "=== OpenCode 飞书插件环境初始化 ==="
echo ""

# 检查依赖
echo "[1/6] 检查依赖..."
command -v node >/dev/null 2>&1 || { echo "错误: 需要安装 Node.js"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "错误: 需要安装 npm"; exit 1; }
command -v opencode >/dev/null 2>&1 || { echo "错误: 需要安装 opencode"; exit 1; }
echo "✓ 依赖检查通过"

# 克隆或更新仓库
echo "[2/6] 获取插件代码..."
if [ -d "$INSTALL_DIR" ]; then
    echo "目录已存在，拉取最新代码..."
    cd "$INSTALL_DIR"
    git pull origin main || true
else
    echo "克隆仓库..."
    git clone https://github.com/Edcwsyh/opencode-feishu.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 安装依赖
echo "[3/6] 安装依赖..."
npm install
npm run build
echo "✓ 构建完成"

# 创建配置目录
echo "[4/6] 创建配置目录..."
mkdir -p "$PLUGINS_DIR"

# 创建飞书配置文件模板
FEISHU_CONFIG="$PLUGINS_DIR/feishu.json"
if [ ! -f "$FEISHU_CONFIG" ]; then
    echo "创建飞书配置模板..."
    cat > "$FEISHU_CONFIG" << 'EOF'
{
  "appId": " YOUR_APP_ID_HERE",
  "appSecret": "YOUR_APP_SECRET_HERE",
  "logLevel": "error"
}
EOF
    echo "⚠ 请编辑 $FEISHU_CONFIG 填写飞书应用凭证"
else
    echo "✓ 飞书配置已存在"
fi

# 创建 OpenCode 配置文件
OPENCODE_CONFIG="$CONFIG_DIR/opencode.json"
if [ ! -f "$OPENCODE_CONFIG" ]; then
    echo "创建 OpenCode 配置..."
    cat > "$OPENCODE_CONFIG" << EOF
{
  "plugin": ["$INSTALL_DIR"]
}
EOF
    echo "✓ OpenCode 配置已创建"
else
    echo "✓ OpenCode 配置已存在"
fi

# 创建启动脚本
echo "[5/6] 创建启动脚本..."
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/opencode-feishu" << EOF
#!/bin/bash
# 启动带飞书插件的 OpenCode
# 配置目录: $CONFIG_DIR

export XDG_CONFIG_HOME="$HOME/.config/opencode-feishu"

echo "启动 OpenCode (飞书插件模式)"
echo "配置目录: \$XDG_CONFIG_HOME/opencode"
echo ""

exec opencode "\$@"
EOF
chmod +x "$BIN_DIR/opencode-feishu"
echo "✓ 启动脚本已创建: $BIN_DIR/opencode-feishu"

# 复制飞书配置（如果主配置中有）
MAIN_FEISHU="$HOME/.config/opencode/plugins/feishu.json"
if [ -f "$MAIN_FEISHU" ] && [ ! -f "$FEISHU_CONFIG" ]; then
    echo "复制飞书配置..."
    cp "$MAIN_FEISHU" "$PLUGINS_DIR/"
    echo "✓ 飞书配置已复制"
fi

# 完成
echo ""
echo "[6/6] 初始化完成！"
echo ""
echo "=== 使用方法 ==="
echo ""
echo "1. 编辑飞书配置："
echo "   $EDITOR $PLUGINS_DIR/feishu.json"
echo ""
echo "2. 启动飞书插件版 OpenCode："
echo "   opencode-feishu"
echo ""
echo "3. 启动日常开发版 OpenCode（无插件）："
echo "   opencode"
echo ""
echo "=== 配置目录 ==="
echo "飞书插件配置: $CONFIG_DIR"
echo "插件安装目录: $INSTALL_DIR"
echo ""