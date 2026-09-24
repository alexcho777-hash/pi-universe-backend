import { v4 as uuidv4 } from 'uuid';
import { executeQuery, executeInsert, executeUpdate } from '../db/connection';
import { ShopItem, UserInventory, PiTransaction } from '../types';
import { PiCurrencyService } from './PiCurrencyService';

export class ShopService {
  /**
   * Get shop items by category
   */
  static async getShopItems(
    sanctuaryId: number,
    category?: string,
    sort: string = 'newest',
    limit: number = 20,
    offset: number = 0
  ): Promise<{ items: ShopItem[]; total: number }> {
    let query = "SELECT * FROM shop_items WHERE sanctuary_id = ? AND status = 'active'";
    const params: any[] = [sanctuaryId];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    // Add sorting
    switch (sort) {
      case 'price_asc':
        query += ' ORDER BY price_pi ASC';
        break;
      case 'price_desc':
        query += ' ORDER BY price_pi DESC';
        break;
      case 'newest':
        query += ' ORDER BY created_at DESC';
        break;
      case 'popular':
        query += ' ORDER BY quantity_sold DESC';
        break;
      default:
        query += ' ORDER BY created_at DESC';
    }

    // Get total count
    const countQuery = query.split(' ORDER BY')[0];
    const countResults = await executeQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM (${countQuery}) as counted`,
      params
    );

    // Get paginated results
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const items = await executeQuery<ShopItem>(query, params);

    return {
      items,
      total: countResults[0].count,
    };
  }

  /**
   * Get item by ID
   */
  static async getItemById(itemId: string, sanctuaryId: number): Promise<ShopItem> {
    const items = await executeQuery<ShopItem>(
      `SELECT * FROM shop_items WHERE item_id = ? AND sanctuary_id = ?`,
      [itemId, sanctuaryId]
    );

    if (items.length === 0) {
      throw new Error('商品不存在');
    }

    return items[0];
  }

  /**
   * Purchase an item
   */
  static async purchaseItem(
    itemId: string,
    userId: string,
    sanctuaryId: number,
    quantity: number,
    userLevel: number
  ): Promise<{
    transactionId: string;
    itemName: string;
    quantity: number;
    totalCost: number;
    newBalance: number;
    inventoryId: string;
  }> {
    // Get item
    const item = await this.getItemById(itemId, sanctuaryId);

    // Check stock
    if (item.status === 'out_of_stock') {
      throw new Error('商品已售罄');
    }

    if (item.quantity_available !== null && item.quantity_available !== undefined && item.quantity_available < quantity) {
      throw new Error('库存不足');
    }

    // Check quantity limit per user
    if (item.max_per_user !== null && item.max_per_user !== undefined) {
      const userInventory = await executeQuery<UserInventory>(
        `SELECT * FROM user_inventory WHERE user_id = ? AND item_id = ? AND sanctuary_id = ?`,
        [userId, itemId, sanctuaryId]
      );

      if (userInventory.length > 0 && userInventory[0].quantity >= (item.max_per_user ?? 0)) {
        throw new Error(`每位用户最多购买 ${item.max_per_user} 件`);
      }
    }

    // Calculate total cost
    const totalCost = item.price_pi * quantity;

    // Deduct from wallet
    const transaction = await PiCurrencyService.deductBalance(
      userId,
      sanctuaryId,
      totalCost,
      'shop_purchase',
      itemId
    );

    // Update inventory
    const existingInventory = await executeQuery<UserInventory>(
      `SELECT * FROM user_inventory WHERE user_id = ? AND item_id = ? AND sanctuary_id = ?`,
      [userId, itemId, sanctuaryId]
    );

    let inventoryId: string;

    if (existingInventory.length > 0) {
      inventoryId = existingInventory[0].inventory_id;
      await executeUpdate(
        `UPDATE user_inventory SET quantity = quantity + ? WHERE inventory_id = ?`,
        [quantity, inventoryId]
      );
    } else {
      inventoryId = uuidv4();
      await executeInsert(
        `INSERT INTO user_inventory
         (inventory_id, user_id, sanctuary_id, item_id, quantity, is_displayed_on_profile)
         VALUES (?, ?, ?, ?, ?, true)`,
        [inventoryId, userId, sanctuaryId, itemId, quantity]
      );
    }

    // Update item sold count and stock
    await executeUpdate(
      `UPDATE shop_items
       SET quantity_sold = quantity_sold + ?, quantity_available = CASE WHEN quantity_available IS NULL THEN NULL ELSE quantity_available - ? END
       WHERE item_id = ?`,
      [quantity, quantity, itemId]
    );

    // Get new wallet balance
    const wallet = await PiCurrencyService.getUserWallet(userId, sanctuaryId);
    if (!wallet) throw new Error('Wallet not found');

    return {
      transactionId: transaction.transaction_id,
      itemName: item.name,
      quantity,
      totalCost,
      newBalance: wallet.balance,
      inventoryId,
    };
  }

  /**
   * Get user inventory
   */
  static async getUserInventory(
    userId: string,
    sanctuaryId: number,
    displayOnly: boolean = false
  ): Promise<
    Array<{
      inventory_id: string;
      item: ShopItem;
      quantity: number;
      acquired_at: string;
      is_displayed_on_profile: boolean;
    }>
  > {
    let query = `SELECT ui.*, si.* FROM user_inventory ui
                 JOIN shop_items si ON ui.item_id = si.item_id
                 WHERE ui.user_id = ? AND ui.sanctuary_id = ?`;
    const params: any[] = [userId, sanctuaryId];

    if (displayOnly) {
      query += ' AND ui.is_displayed_on_profile = true';
    }

    query += ' ORDER BY ui.acquired_at DESC';

    const results = await executeQuery<any>(query, params);

    // Transform results
    return results.map(row => ({
      inventory_id: row.inventory_id,
      item: {
        item_id: row.item_id,
        sanctuary_id: row.sanctuary_id,
        name: row.name,
        description: row.description,
        category: row.category,
        icon: row.icon,
        price_pi: row.price_pi,
        quantity_available: row.quantity_available,
        quantity_sold: row.quantity_sold,
        is_limited_edition: row.is_limited_edition,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      quantity: row.quantity,
      acquired_at: row.acquired_at,
      is_displayed_on_profile: row.is_displayed_on_profile,
    }));
  }

  /**
   * Update inventory display status
   */
  static async updateInventoryDisplay(
    inventoryId: string,
    userId: string,
    sanctuaryId: number,
    isDisplayed: boolean
  ): Promise<UserInventory> {
    await executeUpdate(
      `UPDATE user_inventory
       SET is_displayed_on_profile = ?
       WHERE inventory_id = ? AND user_id = ? AND sanctuary_id = ?`,
      [isDisplayed ? 1 : 0, inventoryId, userId, sanctuaryId]
    );

    const results = await executeQuery<UserInventory>(
      `SELECT * FROM user_inventory WHERE inventory_id = ?`,
      [inventoryId]
    );

    if (results.length === 0) {
      throw new Error('库存项目不存在');
    }

    return results[0];
  }

  /**
   * Create shop item (admin)
   */
  static async createShopItem(
    sanctuaryId: number,
    name: string,
    description: string,
    category: string,
    icon: string,
    pricePi: number,
    quantityAvailable?: number,
    isLimitedEdition: boolean = false,
    maxPerUser?: number
  ): Promise<ShopItem> {
    const itemId = uuidv4();

    await executeInsert(
      `INSERT INTO shop_items
       (item_id, sanctuary_id, name, description, category, icon, price_pi, quantity_available, is_limited_edition, max_per_user, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [itemId, sanctuaryId, name, description, category, icon, pricePi, quantityAvailable || null, isLimitedEdition, maxPerUser || null]
    );

    return this.getItemById(itemId, sanctuaryId);
  }
}
