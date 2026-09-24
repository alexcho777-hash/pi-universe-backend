import { Router, Request, Response } from 'express';
import { sendSuccessResponse, sendErrorResponse, StatusCodes, ErrorCodes } from '../utils/errors';
import { authMiddleware, sanctuaryIsolationMiddleware } from '../middleware/auth';
import { ShopService } from '../services/ShopService';
import { UserService } from '../services/UserService';

const router = Router();

/**
 * GET /api/shop
 * Get shop items
 */
router.get('/', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const category = req.query.category as string;
    const sort = (req.query.sort as string) || 'newest';
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const { items, total } = await ShopService.getShopItems(sanctuaryId, category, sort, limit, offset);

    sendSuccessResponse(res, StatusCodes.OK, {
      items: items.map(item => ({
        item_id: item.item_id,
        name: item.name,
        description: item.description,
        category: item.category,
        price_pi: item.price_pi,
        icon: item.icon,
        quantity_available: item.quantity_available,
        is_limited_edition: item.is_limited_edition,
        status: item.status,
      })),
      total,
    });
  } catch (error: any) {
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      error.message
    );
  }
});

/**
 * POST /api/shop/:item_id/purchase
 * Purchase an item
 */
router.post('/:item_id/purchase', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const { item_id } = req.params;
    const { quantity } = req.body;
    const userId = req.user!.user_id;

    if (!quantity || quantity < 1) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        '数量必须大于0'
      );
      return;
    }

    const user = await UserService.getUserProfile(userId, sanctuaryId);
    const result = await ShopService.purchaseItem(item_id, userId, sanctuaryId, quantity, user.level);

    sendSuccessResponse(res, StatusCodes.OK, {
      transaction_id: result.transactionId,
      item_id,
      item_name: result.itemName,
      quantity: result.quantity,
      total_cost: result.totalCost,
      inventory_id: result.inventoryId,
      new_balance: result.newBalance,
      message: '购买成功！物品已添加到您的收藏',
    });
  } catch (error: any) {
    if (error.message.includes('不足')) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.INSUFFICIENT_BALANCE,
        error.message,
        {
          required: (error.message.match(/π(.+?)，/)?.[1] || 'unknown'),
          available: (error.message.match(/您有 π(.+?)$/)?.[1] || 'unknown'),
        }
      );
    } else if (error.message.includes('售罄')) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.OUT_OF_STOCK,
        error.message
      );
    } else if (error.message.includes('库存不足')) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.OUT_OF_STOCK,
        error.message
      );
    } else if (error.message.includes('最多购买')) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.QUANTITY_LIMIT_EXCEEDED,
        error.message
      );
    } else if (error.message.includes('不存在')) {
      sendErrorResponse(
        res,
        StatusCodes.NOT_FOUND,
        ErrorCodes.ITEM_NOT_FOUND,
        error.message
      );
    } else {
      sendErrorResponse(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        ErrorCodes.INTERNAL_ERROR,
        error.message
      );
    }
  }
});

/**
 * GET /api/inventory
 * Get user inventory
 */
router.get('/inventory', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const userId = req.user!.user_id;
    const displayOnly = req.query.display_only === 'true';

    const inventory = await ShopService.getUserInventory(userId, sanctuaryId, displayOnly);

    sendSuccessResponse(res, StatusCodes.OK, {
      items: inventory.map(inv => ({
        inventory_id: inv.inventory_id,
        item: {
          item_id: inv.item.item_id,
          name: inv.item.name,
          icon: inv.item.icon,
        },
        quantity: inv.quantity,
        acquired_at: inv.acquired_at,
        is_displayed_on_profile: inv.is_displayed_on_profile,
      })),
    });
  } catch (error: any) {
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      error.message
    );
  }
});

/**
 * PATCH /api/inventory/:inventory_id
 * Update inventory display
 */
router.patch('/inventory/:inventory_id', authMiddleware, sanctuaryIsolationMiddleware, async (req: Request, res: Response) => {
  try {
    const sanctuaryId = parseInt(req.query.sanctuary_id as string);
    const { inventory_id } = req.params;
    const { is_displayed_on_profile } = req.body;
    const userId = req.user!.user_id;

    if (is_displayed_on_profile === undefined) {
      sendErrorResponse(
        res,
        StatusCodes.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        '缺少必需参数: is_displayed_on_profile'
      );
      return;
    }

    const inventory = await ShopService.updateInventoryDisplay(inventory_id, userId, sanctuaryId, is_displayed_on_profile);

    sendSuccessResponse(res, StatusCodes.OK, {
      inventory_id: inventory.inventory_id,
      is_displayed_on_profile: inventory.is_displayed_on_profile,
      message: is_displayed_on_profile ? '已添加到个人资料展示' : '已从个人资料移除',
    });
  } catch (error: any) {
    sendErrorResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      error.message
    );
  }
});

export default router;
