import { DB } from '../../src/db.js';
import { RandomGenerator } from './data-generator.js';

/**
 * TPC-C Transactions for Triplit DB
 * Implements the 5 standard TPC-C transactions
 */

export class TPCCTransactionsTriplit {
  private db: DB;
  private rng: RandomGenerator;
  private numWarehouses: number;

  constructor(db: DB, numWarehouses: number, seed: number = 54321) {
    this.db = db;
    this.numWarehouses = numWarehouses;
    this.rng = new RandomGenerator(seed);
  }

  /**
   * New Order Transaction
   * Creates a new order with 5-15 order lines
   */
  async newOrder(): Promise<void> {
    const wId = this.rng.number(1, this.numWarehouses);
    const dId = this.rng.number(1, 10);
    const cId = this.rng.number(1, 3000);
    const olCount = this.rng.number(5, 15);

    // Get district and increment next order id
    const districtQuery = this.db
      .query('district')
      .Where([['warehouseId', '=', `W${wId}`], ['districtId', '=', dId]]);
    const districts = await this.db.fetch(districtQuery);
    const district = [...districts.values()][0];

    if (!district) return;

    const oId = district.nextOrderId;

    // Update district next order id
    await this.db.update('district', district.id, (entity) => {
      entity.nextOrderId = oId + 1;
    });

    // Create order
    const orderId = `W${wId}D${dId}O${oId}`;
    await this.db.insert('order', {
      id: orderId,
      warehouseId: `W${wId}`,
      districtId: dId,
      orderId: oId,
      customerId: cId,
      entryDate: new Date(),
      carrierId: null,
      orderLineCount: olCount,
      allLocal: 1,
    });

    // Create new order entry
    await this.db.insert('newOrder', {
      id: `W${wId}D${dId}NO${oId}`,
      warehouseId: `W${wId}`,
      districtId: dId,
      orderId: oId,
    });

    // Create order lines
    for (let ol = 1; ol <= olCount; ol++) {
      const itemId = this.rng.number(1, 100000);

      // Get stock
      const stockQuery = this.db
        .query('stock')
        .Where([['warehouseId', '=', `W${wId}`], ['itemId', '=', itemId]])
  ;
      const stocks = await this.db.fetch(stockQuery);
        const stock = [...stocks.values()][0];

      if (!stock) continue;

      // Update stock quantity
      const newQty = stock.quantity - 5;
      await this.db.update('stock', stock.id, (entity) => {
        entity.quantity = newQty < 10 ? newQty + 91 : newQty;
        entity.ytd = entity.ytd + 5;
        entity.orderCount = entity.orderCount + 1;
      });

      // Get item price
      const itemQuery = this.db
        .query('item')
        .Where('itemId', '=', itemId)
  ;
      const items = await this.db.fetch(itemQuery);
      const item = [...items.values()][0];

      if (!item) continue;

      // Create order line
      await this.db.insert('orderLine', {
        id: `W${wId}D${dId}O${oId}L${ol}`,
        warehouseId: `W${wId}`,
        districtId: dId,
        orderId: oId,
        lineNumber: ol,
        itemId,
        supplyWarehouseId: `W${wId}`,
        deliveryDate: null,
        quantity: 5,
        amount: 5 * item.price,
        distInfo: stock[`dist0${dId}` as keyof typeof stock] as string,
      });
    }
  }

  /**
   * Payment Transaction
   * Records a customer payment
   */
  async payment(): Promise<void> {
    const wId = this.rng.number(1, this.numWarehouses);
    const dId = this.rng.number(1, 10);
    const cId = this.rng.number(1, 3000);
    const amount = this.rng.number(100, 500000) / 100;

    // Update warehouse YTD
    const warehouseQuery = this.db
      .query('warehouse')
      .Where('id', '=', `W${wId}`)
;
    const warehouses = await this.db.fetch(warehouseQuery);
    const warehouse = [...warehouses.values()][0];

    if (warehouse) {
      await this.db.update('warehouse', warehouse.id, (entity) => {
        entity.ytd = entity.ytd + amount;
      });
    }

    // Update district YTD
    const districtQuery = this.db
      .query('district')
      .Where([['warehouseId', '=', `W${wId}`], ['districtId', '=', dId]])
;
    const districts = await this.db.fetch(districtQuery);
    const district = [...districts.values()][0];

    if (district) {
      await this.db.update('district', district.id, (entity) => {
        entity.ytd = entity.ytd + amount;
      });
    }

    // Update customer
    const customerQuery = this.db
      .query('customer')
      .Where([
        ['warehouseId', '=', `W${wId}`],
        ['districtId', '=', dId],
        ['customerId', '=', cId],
      ])
;
    const customers = await this.db.fetch(customerQuery);
    const customer = [...customers.values()][0];

    if (customer) {
      await this.db.update('customer', customer.id, (entity) => {
        entity.balance = entity.balance - amount;
        entity.ytdPayment = entity.ytdPayment + amount;
        entity.paymentCount = entity.paymentCount + 1;
      });

      // Insert history
      await this.db.insert('history', {
        id: `H${Date.now()}${this.rng.number(0, 9999)}`,
        customerId: cId,
        customerDistrictId: dId,
        customerWarehouseId: `W${wId}`,
        districtId: dId,
        warehouseId: `W${wId}`,
        date: new Date(),
        amount,
        data: `${warehouse?.name ?? ''}    ${district?.name ?? ''}`,
      });
    }
  }

  /**
   * Order Status Transaction
   * Queries the status of a customer's most recent order
   */
  async orderStatus(): Promise<void> {
    const wId = this.rng.number(1, this.numWarehouses);
    const dId = this.rng.number(1, 10);
    const cId = this.rng.number(1, 3000);

    // Get customer
    const customerQuery = this.db
      .query('customer')
      .Where([
        ['warehouseId', '=', `W${wId}`],
        ['districtId', '=', dId],
        ['customerId', '=', cId],
      ])
;
    await this.db.fetch(customerQuery);

    // Get customer's most recent order
    const orderQuery = this.db
      .query('order')
      .Where([
        ['warehouseId', '=', `W${wId}`],
        ['districtId', '=', dId],
        ['customerId', '=', cId],
      ])
      .Order('orderId', 'DESC')
      .Limit(1)
;
    const orders = await this.db.fetch(orderQuery);
    const order = [...orders.values()][0];

    if (order) {
      // Get order lines
      const orderLineQuery = this.db
        .query('orderLine')
        .Where([
          ['warehouseId', '=', `W${wId}`],
          ['districtId', '=', dId],
          ['orderId', '=', order.orderId],
        ])
  ;
      await this.db.fetch(orderLineQuery);
    }
  }

  /**
   * Delivery Transaction
   * Processes delivery of orders (marks orders as delivered)
   */
  async delivery(): Promise<void> {
    const wId = this.rng.number(1, this.numWarehouses);
    const carrierId = this.rng.number(1, 10);
    const deliveryDate = new Date();

    // Process delivery for each district
    for (let dId = 1; dId <= 10; dId++) {
      // Get oldest undelivered order
      const newOrderQuery = this.db
        .query('newOrder')
        .Where([['warehouseId', '=', `W${wId}`], ['districtId', '=', dId]])
        .Order('orderId', 'ASC')
        .Limit(1)
  ;
      const newOrders = await this.db.fetch(newOrderQuery);
      const newOrder = [...newOrders.values()][0];

      if (!newOrder) continue;

      // Delete from new orders
      await this.db.delete('newOrder', newOrder.id);

      // Update order with carrier
      const orderQuery = this.db
        .query('order')
        .Where([
          ['warehouseId', '=', `W${wId}`],
          ['districtId', '=', dId],
          ['orderId', '=', newOrder.orderId],
        ])
  ;
      const orders = await this.db.fetch(orderQuery);
      const order = [...orders.values()][0];

      if (order) {
        await this.db.update('order', order.id, (entity) => {
          entity.carrierId = carrierId;
        });

        // Update order lines with delivery date and sum amounts
        const orderLineQuery = this.db
          .query('orderLine')
          .Where([
            ['warehouseId', '=', `W${wId}`],
            ['districtId', '=', dId],
            ['orderId', '=', newOrder.orderId],
          ])
    ;
        const orderLines = await this.db.fetch(orderLineQuery);

        let totalAmount = 0;
        for (const orderLine of orderLines.values()) {
          await this.db.update('orderLine', orderLine.id, (entity) => {
            entity.deliveryDate = deliveryDate;
          });
          totalAmount += orderLine.amount;
        }

        // Update customer balance and delivery count
        const customerQuery = this.db
          .query('customer')
          .Where([
            ['warehouseId', '=', `W${wId}`],
            ['districtId', '=', dId],
            ['customerId', '=', order.customerId],
          ])
    ;
        const customers = await this.db.fetch(customerQuery);
        const customer = [...customers.values()][0];

        if (customer) {
          await this.db.update('customer', customer.id, (entity) => {
            entity.balance = entity.balance + totalAmount;
            entity.deliveryCount = entity.deliveryCount + 1;
          });
        }
      }
    }
  }

  /**
   * Stock Level Transaction
   * Checks stock levels to determine if items need reordering
   */
  async stockLevel(): Promise<void> {
    const wId = this.rng.number(1, this.numWarehouses);
    const dId = this.rng.number(1, 10);
    const threshold = this.rng.number(10, 20);

    // Get district next order id
    const districtQuery = this.db
      .query('district')
      .Where([['warehouseId', '=', `W${wId}`], ['districtId', '=', dId]])
;
    const districts = await this.db.fetch(districtQuery);
    const district = [...districts.values()][0];

    if (!district) return;

    // Get last 20 orders
    const orderQuery = this.db
      .query('order')
      .Where([
        ['warehouseId', '=', `W${wId}`],
        ['districtId', '=', dId],
        ['orderId', '>=', district.nextOrderId - 20],
      ])
;
    const orders = await this.db.fetch(orderQuery);

    // Collect unique items from order lines
    const itemIds = new Set<number>();
    for (const order of orders.values()) {
      const orderLineQuery = this.db
        .query('orderLine')
        .Where([
          ['warehouseId', '=', `W${wId}`],
          ['districtId', '=', dId],
          ['orderId', '=', order.orderId],
        ])
  ;
      const orderLines = await this.db.fetch(orderLineQuery);

      for (const orderLine of orderLines.values()) {
        itemIds.add(orderLine.itemId);
      }
    }

    // Check stock levels for these items
    let lowStockCount = 0;
    for (const itemId of itemIds) {
      const stockQuery = this.db
        .query('stock')
        .Where([['warehouseId', '=', `W${wId}`], ['itemId', '=', itemId]])
  ;
      const stocks = await this.db.fetch(stockQuery);
        const stock = [...stocks.values()][0];

      if (stock && stock.quantity < threshold) {
        lowStockCount++;
      }
    }
  }
}
