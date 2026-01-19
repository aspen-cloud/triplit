import type { Database } from 'better-sqlite3';
import { RandomGenerator } from './data-generator.js';

/**
 * TPC-C Transactions for SQLite
 * Implements the 5 standard TPC-C transactions
 */

export class TPCCTransactionsSQLite {
  private db: Database;
  private rng: RandomGenerator;
  private numWarehouses: number;

  constructor(db: Database, numWarehouses: number, seed: number = 54321) {
    this.db = db;
    this.numWarehouses = numWarehouses;
    this.rng = new RandomGenerator(seed);
  }

  /**
   * New Order Transaction
   * Creates a new order with 5-15 order lines
   */
  newOrder(): void {
    const wId = this.rng.number(1, this.numWarehouses);
    const dId = this.rng.number(1, 10);
    const cId = this.rng.number(1, 3000);
    const olCount = this.rng.number(5, 15);

    this.db.transaction(() => {
      // Get and increment district next order id
      const district = this.db
        .prepare('SELECT d_next_o_id FROM district WHERE d_w_id = ? AND d_id = ?')
        .get(wId, dId) as { d_next_o_id: number } | undefined;

      if (!district) return;

      const oId = district.d_next_o_id;

      this.db
        .prepare(
          'UPDATE district SET d_next_o_id = d_next_o_id + 1 WHERE d_w_id = ? AND d_id = ?'
        )
        .run(wId, dId);

      // Create order
      this.db
        .prepare(
          `INSERT INTO orders (o_id, o_d_id, o_w_id, o_c_id, o_entry_d, o_carrier_id, o_ol_cnt, o_all_local)
           VALUES (?, ?, ?, ?, datetime('now'), NULL, ?, 1)`
        )
        .run(oId, dId, wId, cId, olCount);

      // Create new order entry
      this.db
        .prepare(
          `INSERT INTO new_order (no_o_id, no_d_id, no_w_id)
           VALUES (?, ?, ?)`
        )
        .run(oId, dId, wId);

      // Create order lines
      for (let ol = 1; ol <= olCount; ol++) {
        const itemId = this.rng.number(1, 100000);

        // Get stock
        const stock = this.db
          .prepare(
            'SELECT s_quantity, s_ytd, s_order_cnt, s_dist_01 FROM stock WHERE s_w_id = ? AND s_i_id = ?'
          )
          .get(wId, itemId) as {
          s_quantity: number;
          s_ytd: number;
          s_order_cnt: number;
          s_dist_01: string;
        } | undefined;

        if (!stock) continue;

        // Update stock
        const newQty = stock.s_quantity - 5;
        this.db
          .prepare(
            `UPDATE stock
             SET s_quantity = ?, s_ytd = s_ytd + 5, s_order_cnt = s_order_cnt + 1
             WHERE s_w_id = ? AND s_i_id = ?`
          )
          .run(newQty < 10 ? newQty + 91 : newQty, wId, itemId);

        // Get item price
        const item = this.db
          .prepare('SELECT i_price FROM item WHERE i_id = ?')
          .get(itemId) as { i_price: number } | undefined;

        if (!item) continue;

        // Create order line
        this.db
          .prepare(
            `INSERT INTO order_line (ol_o_id, ol_d_id, ol_w_id, ol_number, ol_i_id, ol_supply_w_id,
                                      ol_delivery_d, ol_quantity, ol_amount, ol_dist_info)
             VALUES (?, ?, ?, ?, ?, ?, NULL, 5, ?, ?)`
          )
          .run(oId, dId, wId, ol, itemId, wId, 5 * item.i_price, stock.s_dist_01);
      }
    })();
  }

  /**
   * Payment Transaction
   * Records a customer payment
   */
  payment(): void {
    const wId = this.rng.number(1, this.numWarehouses);
    const dId = this.rng.number(1, 10);
    const cId = this.rng.number(1, 3000);
    const amount = this.rng.number(100, 500000) / 100;

    this.db.transaction(() => {
      // Update warehouse YTD
      this.db
        .prepare('UPDATE warehouse SET w_ytd = w_ytd + ? WHERE w_id = ?')
        .run(amount, wId);

      // Update district YTD
      this.db
        .prepare(
          'UPDATE district SET d_ytd = d_ytd + ? WHERE d_w_id = ? AND d_id = ?'
        )
        .run(amount, wId, dId);

      // Get warehouse and district names for history
      const warehouse = this.db
        .prepare('SELECT w_name FROM warehouse WHERE w_id = ?')
        .get(wId) as { w_name: string } | undefined;

      const district = this.db
        .prepare('SELECT d_name FROM district WHERE d_w_id = ? AND d_id = ?')
        .get(wId, dId) as { d_name: string } | undefined;

      // Update customer
      this.db
        .prepare(
          `UPDATE customer
           SET c_balance = c_balance - ?,
               c_ytd_payment = c_ytd_payment + ?,
               c_payment_cnt = c_payment_cnt + 1
           WHERE c_w_id = ? AND c_d_id = ? AND c_id = ?`
        )
        .run(amount, amount, wId, dId, cId);

      // Insert history
      this.db
        .prepare(
          `INSERT INTO history (h_c_id, h_c_d_id, h_c_w_id, h_d_id, h_w_id, h_date, h_amount, h_data)
           VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?)`
        )
        .run(
          cId,
          dId,
          wId,
          dId,
          wId,
          amount,
          `${warehouse?.w_name ?? ''}    ${district?.d_name ?? ''}`
        );
    })();
  }

  /**
   * Order Status Transaction
   * Queries the status of a customer's most recent order
   */
  orderStatus(): void {
    const wId = this.rng.number(1, this.numWarehouses);
    const dId = this.rng.number(1, 10);
    const cId = this.rng.number(1, 3000);

    // Get customer
    this.db
      .prepare(
        'SELECT * FROM customer WHERE c_w_id = ? AND c_d_id = ? AND c_id = ?'
      )
      .get(wId, dId, cId);

    // Get customer's most recent order
    const order = this.db
      .prepare(
        `SELECT * FROM orders
         WHERE o_w_id = ? AND o_d_id = ? AND o_c_id = ?
         ORDER BY o_id DESC LIMIT 1`
      )
      .get(wId, dId, cId) as { o_id: number } | undefined;

    if (order) {
      // Get order lines
      this.db
        .prepare(
          `SELECT * FROM order_line
           WHERE ol_w_id = ? AND ol_d_id = ? AND ol_o_id = ?`
        )
        .all(wId, dId, order.o_id);
    }
  }

  /**
   * Delivery Transaction
   * Processes delivery of orders (marks orders as delivered)
   */
  delivery(): void {
    const wId = this.rng.number(1, this.numWarehouses);
    const carrierId = this.rng.number(1, 10);

    this.db.transaction(() => {
      // Process delivery for each district
      for (let dId = 1; dId <= 10; dId++) {
        // Get oldest undelivered order
        const newOrder = this.db
          .prepare(
            `SELECT no_o_id FROM new_order
             WHERE no_w_id = ? AND no_d_id = ?
             ORDER BY no_o_id ASC LIMIT 1`
          )
          .get(wId, dId) as { no_o_id: number } | undefined;

        if (!newOrder) continue;

        const oId = newOrder.no_o_id;

        // Delete from new orders
        this.db
          .prepare(
            'DELETE FROM new_order WHERE no_w_id = ? AND no_d_id = ? AND no_o_id = ?'
          )
          .run(wId, dId, oId);

        // Update order with carrier
        this.db
          .prepare(
            `UPDATE orders
             SET o_carrier_id = ?
             WHERE o_w_id = ? AND o_d_id = ? AND o_id = ?`
          )
          .run(carrierId, wId, dId, oId);

        // Get order customer
        const order = this.db
          .prepare(
            'SELECT o_c_id FROM orders WHERE o_w_id = ? AND o_d_id = ? AND o_id = ?'
          )
          .get(wId, dId, oId) as { o_c_id: number } | undefined;

        if (!order) continue;

        // Update order lines and calculate total
        this.db
          .prepare(
            `UPDATE order_line
             SET ol_delivery_d = datetime('now')
             WHERE ol_w_id = ? AND ol_d_id = ? AND ol_o_id = ?`
          )
          .run(wId, dId, oId);

        const totalResult = this.db
          .prepare(
            `SELECT SUM(ol_amount) as total FROM order_line
             WHERE ol_w_id = ? AND ol_d_id = ? AND ol_o_id = ?`
          )
          .get(wId, dId, oId) as { total: number } | undefined;

        const totalAmount = totalResult?.total ?? 0;

        // Update customer
        this.db
          .prepare(
            `UPDATE customer
             SET c_balance = c_balance + ?,
                 c_delivery_cnt = c_delivery_cnt + 1
             WHERE c_w_id = ? AND c_d_id = ? AND c_id = ?`
          )
          .run(totalAmount, wId, dId, order.o_c_id);
      }
    })();
  }

  /**
   * Stock Level Transaction
   * Checks stock levels to determine if items need reordering
   */
  stockLevel(): void {
    const wId = this.rng.number(1, this.numWarehouses);
    const dId = this.rng.number(1, 10);
    const threshold = this.rng.number(10, 20);

    // Get district next order id
    const district = this.db
      .prepare('SELECT d_next_o_id FROM district WHERE d_w_id = ? AND d_id = ?')
      .get(wId, dId) as { d_next_o_id: number } | undefined;

    if (!district) return;

    // Count distinct items with low stock in recent orders
    this.db
      .prepare(
        `SELECT COUNT(DISTINCT s_i_id) as low_stock
         FROM stock
         WHERE s_w_id = ? AND s_quantity < ? AND s_i_id IN (
           SELECT DISTINCT ol_i_id
           FROM order_line
           WHERE ol_w_id = ? AND ol_d_id = ? AND ol_o_id >= ? AND ol_o_id < ?
         )`
      )
      .get(
        wId,
        threshold,
        wId,
        dId,
        district.d_next_o_id - 20,
        district.d_next_o_id
      );
  }
}
