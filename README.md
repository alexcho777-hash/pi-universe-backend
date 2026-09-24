# π Universe - Buddhist Sanctuary Backend API

A complete Node.js/Express backend implementation for the π Universe multi-sanctuary faith platform, starting with Buddhist sanctuary integration.

## Project Structure

```
pi-universe-api/
├── src/
│   ├── db/
│   │   └── connection.ts          # Database connection and query utilities
│   ├── middleware/
│   │   └── auth.ts                # JWT authentication and sanctuary isolation
│   ├── routes/
│   │   ├── auth.ts                # Authentication endpoints
│   │   ├── wallet.ts              # Wallet and transaction endpoints
│   │   ├── activities.ts          # Activity and reward endpoints
│   │   └── shop.ts                # Shop and inventory endpoints
│   ├── services/
│   │   ├── PiCurrencyService.ts   # π currency business logic
│   │   ├── UserService.ts         # User authentication and profile
│   │   ├── ActivityService.ts     # Activity management
│   │   └── ShopService.ts         # Shop and inventory management
│   ├── types/
│   │   └── index.ts               # TypeScript interfaces
│   ├── utils/
│   │   ├── auth.ts                # JWT and password utilities
│   │   └── errors.ts              # Error handling
│   └── server.ts                  # Express app setup
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Features Implemented

### ✅ Phase 1: Core Infrastructure
- [x] User registration and login with JWT authentication
- [x] Sanctuary-level data isolation (prevent cross-sanctuary access)
- [x] Wallet management with π currency tracking
- [x] Transaction history and wallet statistics
- [x] Monthly reward caps based on user tier (Level 1-7)

### ✅ Phase 2: Activity Rewards
- [x] Daily bell-ringing check-in (π2 per day)
- [x] Meditation session tracking (0.5π per minute)
- [x] Meditation streak bonuses (7-day, 14-day, 30-day milestones)
- [x] Lecture attendance rewards (π5 base)
- [x] Activity management and completion

### ✅ Phase 3: Shop System
- [x] Shop item browsing with filtering and sorting
- [x] Purchase logic with balance validation
- [x] User inventory management
- [x] Item display on user profile

### Key Features
- **Strict Sanctuary Isolation**: Every database query includes sanctuary_id checks
- **7-Tier Level System**: Monthly earning caps from π100 (L1) to π3000 (L7)
- **Reward Configuration**: Customizable reward rates for all activities
- **Transaction Audit Trail**: Complete history of all π movements
- **Error Handling**: Comprehensive error codes and messages in Chinese

## Installation

### Prerequisites
- Node.js 16+ and npm
- MySQL 5.7+ or PostgreSQL 12+
- TypeScript 5+

### Setup Steps

1. **Clone and install dependencies**
```bash
npm install
```

2. **Set up environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your database credentials:
```
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=pi_universe
JWT_SECRET=your_secret_key_change_in_production
```

3. **Create database and tables**
```bash
# MySQL
mysql -u root -p < database-schema.sql

# PostgreSQL
psql -U postgres -d pi_universe -f database-schema.sql
```

4. **Start the server**
```bash
# Development with hot reload
npm run dev

# Production build
npm run build
npm start
```

Server will start at `http://localhost:3000`

## API Documentation

### ⚡ Authentication Endpoints (Pi Network)

**NEW: Authentication now uses Pi Network wallet signatures instead of email/password**

See [PI_AUTH_IMPLEMENTATION.md](./PI_AUTH_IMPLEMENTATION.md) for complete frontend integration guide.

#### Register New User (Pi Network)
```
POST /api/auth/register
Content-Type: application/json

{
  "pi_uid": "pi_user_abc123def456",
  "username": "张三",
  "sanctuary_id": 1,
  "gender": "male",
  "birthday": "1990-01-15"
}

Response: {
  "success": true,
  "data": {
    "user_id": "uuid-...",
    "username": "张三",
    "sanctuary_id": 1,
    "level": 1,
    "pi_balance": 0,
    "message": "注册成功！"
  }
}
```

#### Login with Pi Network Signature
```
POST /api/auth/login
Content-Type: application/json

{
  "pi_uid": "pi_user_abc123def456",
  "pi_sig": "7a8f9e1c2d3b4a5f6e7d8c9b...",
  "sanctuary_id": 1
}

Response: {
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "user_id": "uuid-...",
      "username": "张三",
      "level": 1,
      "pi_uid": "pi_user_abc123def456"
    }
  }
}
```

**Error: User Not Yet Registered**
```json
{
  "success": false,
  "error": "π账户未注册，请先注册",
  "error_code": "PI_NOT_REGISTERED",
  "details": {
    "register_url": "/api/auth/register"
  }
}
```

### Wallet Endpoints

#### Get Current Wallet
```
GET /api/wallets/current?sanctuary_id=1
Authorization: Bearer {token}

Response: {
  "success": true,
  "data": {
    "wallet_id": "wallet_...",
    "balance": 250.5,
    "total_earned": 500,
    "monthly_earned": 120,
    "monthly_cap": 250,
    "monthly_remaining": 130
  }
}
```

#### Get Transaction History
```
GET /api/wallets/transactions?sanctuary_id=1&limit=50&offset=0
Authorization: Bearer {token}
```

### Activity Endpoints

#### Daily Check-in
```
POST /api/activities/daily-checkin?sanctuary_id=1
Authorization: Bearer {token}

Response: {
  "success": true,
  "data": {
    "transaction_id": "tx_...",
    "reward": 2,
    "message": "打卡成功！获得 π2",
    "next_checkin_available_at": "2026-09-21T00:00:00Z"
  }
}
```

#### Start Meditation
```
POST /api/activities/meditation/start?sanctuary_id=1
Authorization: Bearer {token}
Content-Type: application/json

{
  "location": "禅修堂"
}

Response: {
  "success": true,
  "data": {
    "session_id": "ses_...",
    "start_time": "2026-09-20T18:35:00Z",
    "location": "禅修堂"
  }
}
```

#### End Meditation
```
POST /api/activities/meditation/:session_id/end?sanctuary_id=1
Authorization: Bearer {token}
Content-Type: application/json

{
  "duration_minutes": 45,
  "notes": "感到很平静"
}

Response: {
  "success": true,
  "data": {
    "duration_minutes": 45,
    "pi_reward": 22.5,
    "transaction_id": "tx_...",
    "monthly_remaining": 108,
    "streak_status": {
      "current_days": 7,
      "bonus_earned": true,
      "bonus_amount": 20
    }
  }
}
```

### Shop Endpoints

#### Get Shop Items
```
GET /api/shop?sanctuary_id=1&category=beads&sort=newest
Authorization: Bearer {token}

Response: {
  "success": true,
  "data": {
    "items": [
      {
        "item_id": "item_...",
        "name": "木制108念珠",
        "price_pi": 5,
        "icon": "📿",
        "quantity_available": 100,
        "status": "active"
      }
    ],
    "total": 50
  }
}
```

#### Purchase Item
```
POST /api/shop/:item_id/purchase?sanctuary_id=1
Authorization: Bearer {token}
Content-Type: application/json

{
  "quantity": 1
}

Response: {
  "success": true,
  "data": {
    "transaction_id": "tx_...",
    "item_name": "木制108念珠",
    "quantity": 1,
    "total_cost": 5,
    "new_balance": 245,
    "message": "购买成功！物品已添加到您的收藏"
  }
}
```

#### Get User Inventory
```
GET /api/shop/inventory?sanctuary_id=1
Authorization: Bearer {token}

Response: {
  "success": true,
  "data": {
    "items": [
      {
        "inventory_id": "inv_...",
        "item": {
          "item_id": "item_...",
          "name": "木制108念珠",
          "icon": "📿"
        },
        "quantity": 1,
        "acquired_at": "2026-09-15T10:30:00Z",
        "is_displayed_on_profile": true
      }
    ]
  }
}
```

## Error Handling

All errors follow a standard format:

```json
{
  "success": false,
  "error": "错误描述",
  "error_code": "ERROR_CODE",
  "details": {
    "field": "value"
  },
  "timestamp": "2026-09-20T18:35:00Z"
}
```

### Common Error Codes
- `MISSING_TOKEN` - Missing authorization header
- `INVALID_TOKEN` - Invalid or expired JWT
- `FORBIDDEN_CROSS_SANCTUARY` - Attempting cross-sanctuary access
- `INSUFFICIENT_BALANCE` - Not enough π coins
- `USER_ALREADY_EXISTS` - Email already registered in sanctuary
- `INVALID_CREDENTIALS` - Wrong password or user not found
- `OUT_OF_STOCK` - Item not available
- `ACTIVITY_FULL` - Activity at max capacity

## Database Schema

The system includes 13 core tables:
- `sanctuaries` - Faith communities
- `users` - User accounts with sanctuary FK
- `pi_wallets` - User wallets (one per sanctuary)
- `pi_transactions` - Transaction audit trail
- `monthly_reward_caps` - Tier-based earning limits
- `activities` - Events and activities
- `activity_attendance` - Attendance records
- `shop_items` - Merchandise catalog
- `user_inventory` - User collections
- `daily_checkins` - Bell-ringing log
- `meditation_sessions` - Meditation records
- `user_streaks` - Streak tracking
- `user_levels` - Level history

All tables include `sanctuary_id` for strict data isolation.

## Reward Configuration

### Daily Activities
- Daily Check-in: π2 (max 1/day)
- Meditation: π0.5/minute (max 60 min/day)
- Lecture Attendance: π5 base (π7.5 with bonus)
- Volunteer Work: π10/hour (min 15 min)

### Streak Bonuses
- 7-day streak: π20
- 14-day streak: π40
- 30-day streak: π100

### Monthly Caps by Level
| Level | Monthly Cap |
|-------|------------|
| 1 | π100 |
| 2 | π150 |
| 3 | π250 |
| 4 | π400 |
| 5 | π600 |
| 6 | π1000 |
| 7 | π3000 |

## Development

### Type Checking
```bash
npm run typecheck
```

### Testing (future)
```bash
npm test
```

## Next Steps

1. **Frontend Integration**
   - React/Vue SPA for user interface
   - 3D temple visualization (Babylon.js/Three.js)
   - Real-time WebSocket updates

2. **Advanced Features**
   - Volunteer hour tracking
   - Referral system with 3-tier rewards
   - Achievement/badge system
   - Leaderboards and rankings
   - Sanctuary management dashboard

3. **Additional Sanctuaries**
   - Christianity sanctuary
   - Islam sanctuary
   - Taoism sanctuary
   - Yoga/Hinduism sanctuary
   - (Following same architecture, one at a time)

4. **Blockchain Integration**
   - Pi Network payment processing
   - On-chain transaction logging
   - Wallet verification

## Security Considerations

- ✅ JWT tokens with expiration
- ✅ Password hashing with bcryptjs
- ✅ Sanctuary isolation at database level
- ✅ CORS enabled for frontend integration
- ⚠️ Use HTTPS in production
- ⚠️ Keep JWT_SECRET secure
- ⚠️ Implement rate limiting
- ⚠️ Add input validation/sanitization

## License

MIT

## Contact

Built for π Universe - Multi-Sanctuary Faith Platform
Email: princessjewelryshop168@gmail.com
