# BOKI 插件市场服务端镜像
# 服务端零第三方运行时依赖（内置 node:sqlite），无需 npm install，只带 Node 与源码。
#
# 构建上下文必须是 boki-market/ 根目录（Dockerfile 在本目录）：
#   docker build -f docker/Dockerfile -t boki-market:latest .
# 或用 Compose（compose 文件在项目根目录，只运行不构建）：
#   docker compose -f docker-compose-market.yml up -d
FROM alpine:latest

# nodejs：Alpine 仓库提供 Node 24（满足 >=22.5 的 node:sqlite 要求）
# tini：作为 PID 1 转发 SIGTERM/SIGINT 并回收僵尸进程
# 国内构建可用 --build-arg APK_MIRROR=https://mirrors.aliyun.com 加速
ARG APK_MIRROR=https://dl-cdn.alpinelinux.org
RUN sed -i "s#https://dl-cdn.alpinelinux.org#${APK_MIRROR}#g" /etc/apk/repositories \
    && apk add --no-cache nodejs tini \
    && node --version

# 容器内监听 0.0.0.0；库与制品落在数据卷，避免写进镜像层
ENV NODE_ENV=production \
    MARKET_HOST=0.0.0.0 \
    MARKET_PORT=8789 \
    MARKET_DB_FILE=/app/db/market.db \
    MARKET_DATA_DIR=/app/data \
    MARKET_REQUIRE_HTTPS=false \
    MARKET_LOG_LEVEL=info

WORKDIR /app

# 只复制运行所需：版本号（config 读取 package.json）与 server 源码/迁移
COPY package.json /app/package.json
COPY server /app/server

# 非 root 运行；代码保持 root 只读，仅数据目录归运行用户
RUN addgroup -S -g 10001 boki-market \
    && adduser -S -D -H -u 10001 -G boki-market boki-market \
    && mkdir -p /app/db /app/data \
    && chown -R boki-market:boki-market /app/db /app/data

USER boki-market

EXPOSE 8789

# 回环地址健康检查（MARKET_REQUIRE_HTTPS=true 时回环仍放行）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.MARKET_PORT||8789)+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/src/main.mjs"]
