# π Universe - Pi Network Web 迁移指南

## 📋 改动总结

### 1. 后端改动（已完成）

#### 数据库 Schema 更新
```sql
-- 添加到 users 表
ALTER TABLE users ADD COLUMN pi_uid VARCHAR(255) UNIQUE;
ALTER TABLE users ADD INDEX (pi_uid);

-- 改为可选字段（支持 Pi 认证用户）
ALTER TABLE users MODIFY email VARCHAR(255) UNIQUE NULL;
ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL;
```

#### 新增 Users 路由 (`src/routes/users.ts`)
- `POST /api/users/sync` - 同步 Pi Network 用户
- `GET /api/users/profile` - 获取用户资料（需要认证）
- `POST /api/users/profile` - 更新用户资料（需要认证）

#### 服务器配置 (`src/server.ts`)
已添加：
```typescript
import usersRoutes from './routes/users';
app.use('/api/users', usersRoutes);
```

### 2. 前端改动

#### 认证流程
```
旧：用户名/密码 或 Pi UID + Pi 签名
新：Pi.authenticate() → window.Pi 注入 → 自动认证
```

#### API 调用
```
旧：Authorization: Bearer {jwt_token}
新：X-Pi-UID: {pi_uid} （Header）
```

## 🚀 部署步骤

### 第一步：更新后端

1. **拉取/推送最新代码**
```bash
git add src/db/schema.sql src/routes/users.ts src/server.ts
git commit -m "feat: Add Pi Network user sync endpoint for web app integration"
git push origin main
```

2. **Render 自动部署**
- 连接到 Render 的应用会自动部署
- 数据库迁移自动运行（schema.sql 的 CREATE TABLE IF NOT EXISTS）

3. **验证后端**
```bash
curl -X POST https://pi-universe-api.onrender.com/api/users/sync \
  -H "Content-Type: application/json" \
  -d '{"pi_uid": "test_123", "username": "testuser"}'

# 应该返回：
# {
#   "success": true,
#   "data": {
#     "user_id": 1,
#     "pi_uid": "test_123",
#     "username": "testuser",
#     ...
#   }
# }
```

### 第二步：部署前端 Web 应用

1. **使用 Vercel**（推荐）
```bash
# 在 pi-universe-web 目录
npm run build
vercel deploy
```

2. **或使用 Render**
```bash
# 连接到 Render，自动部署 dist/ 目录
```

3. **环境变量设置**
```
REACT_APP_API_URL=https://pi-universe-api.onrender.com
REACT_APP_PI_NETWORK=testnet
REACT_APP_PI_APP_ID=your_app_id
```

### 第三步：在 Pi App Studio 注册

1. 访问 https://app.minepi.com/admin
2. Create New App
3. 填入信息：
   - **App Name**: π Universe
   - **App URL**: 你的 Vercel/Render 网址
   - **Description**: Multi-Sanctuary Faith Platform
   - **Network**: Testnet（先测试）
4. 获取 **App ID** → 设置到 `.env`
5. 提交审核

### 第四步：测试流程

#### 测试用户同步
```bash
# 1. 先创建一个测试用户
curl -X POST https://your-render-app.com/api/users/sync \
  -H "Content-Type: application/json" \
  -d '{
    "pi_uid": "SAT7H3_TESTUID",
    "username": "testuser"
  }'

# 2. 打开你的 Web App
# 3. 点击 "Login with Pi Network"
# 4. Pi Browser 会弹出认证对话
# 5. 完成后应该自动登录
```

#### 测试支付
```
在 Testnet 环境：
1. 确保你有 Pi Testnet 币
2. 在 App 里点击"捐赠"
3. 输入金额
4. Pi.payment() 会打开支付对话
5. 确认支付
6. 后端收到支付回调
```

## 🔑 API 端点参考

### 用户端点

#### 同步用户 (无需认证)
```
POST /api/users/sync

Body:
{
  "pi_uid": "user_pi_uid_here",
  "username": "display_name"
}

Response:
{
  "success": true,
  "data": {
    "user_id": 123,
    "pi_uid": "user_pi_uid_here",
    "username": "display_name",
    "sanctuary_id": 1,
    "created_at": "2026-09-24T..."
  }
}
```

#### 获取用户资料 (需要认证)
```
GET /api/users/profile

Headers:
X-Pi-UID: user_pi_uid_here

Response:
{
  "success": true,
  "data": {
    "user_id": 123,
    "username": "display_name",
    "pi_uid": "user_pi_uid_here",
    "sanctuary_id": 1,
    "created_at": "2026-09-24T..."
  }
}
```

#### 更新用户资料 (需要认证)
```
POST /api/users/profile

Headers:
X-Pi-UID: user_pi_uid_here

Body:
{
  "username": "new_name",
  "current_sanctuary_id": 2
}

Response:
{
  "success": true,
  "data": {
    "message": "Profile updated successfully"
  }
}
```

## 🔄 认证中间件更新

现有的 `authMiddleware` 需要支持 Pi UID Header：

```typescript
// src/middleware/auth.ts
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // 从 Header 获取 Pi UID
  const piUid = req.headers['x-pi-uid'] as string;
  
  if (!piUid) {
    return sendErrorResponse(res, StatusCodes.UNAUTHORIZED, ...);
  }
  
  // 从数据库查询用户
  // ...
  
  (req as any).userId = user.id;
  next();
}
```

## 📝 支付流程集成

前端 (`usePiPayment.ts`) 调用：

```typescript
1. apiClient.createPayment()    // 后端创建支付记录
   ↓
2. window.Pi.payment()          // Pi SDK 打开支付对话
   ↓
3. apiClient.completePayment()  // 后端完成支付
   ↓
4. 后端验证支付（可选，需要 Pi 平台 API）
```

## ✅ 检查清单

- [ ] 后端代码已推送到 main 分支
- [ ] Render 已自动部署后端
- [ ] `/api/users/sync` 端点可访问
- [ ] 前端 Web App 已部署（Vercel/Render）
- [ ] 环境变量已设置正确
- [ ] 在 Pi App Studio 已注册应用
- [ ] Testnet 测试通过
- [ ] 准备好移到 Mainnet

## 🐛 常见问题

### 问题 1：Pi SDK 不加载
```
原因：网页不是从 Pi Browser 打开
解决：确保用户从 Pi Browser 访问你的 App URL
```

### 问题 2：用户同步失败
```
原因：api_url 不正确或网络问题
解决：检查 .env 中的 REACT_APP_API_URL
```

### 问题 3：支付卡住
```
原因：后端支付端点配置不完整
解决：实现 `/api/donations/complete-payment` 端点
```

## 📚 相关资源

- [Pi SDK 文档](https://pi-apps.github.io/pi-sdk-docs/)
- [π Universe 原生 App](https://github.com/你的地址/pi-universe-mobile)
- [后端 API 文档](./docs/api.md)

## 🎯 下一步

1. **Testnet 完整测试** - 用 Testnet Pi 币进行完整流程测试
2. **Mainnet 部署** - 通过 Pi App Studio 审核后切换到 Mainnet
3. **推广应用** - 在 Pi 社区推广你的 App
4. **持续优化** - 根据用户反馈优化功能

---

**最后更新**: 2026-09-24  
**状态**: 后端已准备，前端已生成，可开始测试
