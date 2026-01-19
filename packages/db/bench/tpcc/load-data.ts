import { DB } from '../../src/db.js';
import type { Database } from 'better-sqlite3';
import {
  TPCCDataGenerator,
  type TPCCConfig,
} from './data-generator.js';

/**
 * Load TPC-C data into Triplit DB
 */
export async function loadDataTriplit(
  db: DB,
  config: TPCCConfig
): Promise<void> {
  const generator = new TPCCDataGenerator(config);
  const numItems = config.itemsPerWarehouse ?? 100000;

  console.log('Loading TPC-C data into Triplit DB...');
  console.log(`Configuration:`, config);

  // Load items (shared across all warehouses)
  console.log(`Loading ${numItems} items...`);
  const itemPromises = [];
  for (let i = 1; i <= numItems; i++) {
    const item = generator.generateItem(i);
    itemPromises.push(db.insert('item', item));

    if (itemPromises.length >= 1000) {
      await Promise.all(itemPromises);
      itemPromises.length = 0;
      if (i % 10000 === 0) {
        console.log(`  Loaded ${i} items...`);
      }
    }
  }
  if (itemPromises.length > 0) {
    await Promise.all(itemPromises);
  }
  console.log(`✓ Loaded ${numItems} items`);

  // Load warehouses and related data
  for (let w = 1; w <= config.numWarehouses; w++) {
    console.log(`Loading warehouse ${w}/${config.numWarehouses}...`);

    // Load warehouse
    const warehouse = generator.generateWarehouse(w);
    await db.insert('warehouse', warehouse);

    // Load stock for this warehouse
    console.log(`  Loading stock items...`);
    const stockPromises = [];
    for (let i = 1; i <= numItems; i++) {
      const stock = generator.generateStock(w, i);
      stockPromises.push(db.insert('stock', stock));

      if (stockPromises.length >= 1000) {
        await Promise.all(stockPromises);
        stockPromises.length = 0;
      }
    }
    if (stockPromises.length > 0) {
      await Promise.all(stockPromises);
    }

    // Load districts for this warehouse
    const districtsPerWarehouse = config.districtsPerWarehouse ?? 10;
    for (let d = 1; d <= districtsPerWarehouse; d++) {
      const district = generator.generateDistrict(w, d);
      await db.insert('district', district);

      // Load customers for this district
      const customersPerDistrict = config.customersPerDistrict ?? 3000;
      const customerPromises = [];
      for (let c = 1; c <= customersPerDistrict; c++) {
        const customer = generator.generateCustomer(w, d, c);
        customerPromises.push(db.insert('customer', customer));

        if (customerPromises.length >= 500) {
          await Promise.all(customerPromises);
          customerPromises.length = 0;
        }
      }
      if (customerPromises.length > 0) {
        await Promise.all(customerPromises);
      }

      // Load orders for this district
      const ordersPerDistrict = config.ordersPerDistrict ?? 3000;
      const orderPromises = [];
      for (let o = 1; o <= ordersPerDistrict; o++) {
        const { order, orderLines, newOrder } = generator.generateOrder(w, d, o);

        orderPromises.push(db.insert('order', order));
        for (const orderLine of orderLines) {
          orderPromises.push(db.insert('orderLine', orderLine));
        }
        if (newOrder) {
          orderPromises.push(db.insert('newOrder', newOrder));
        }

        if (orderPromises.length >= 200) {
          await Promise.all(orderPromises);
          orderPromises.length = 0;
        }
      }
      if (orderPromises.length > 0) {
        await Promise.all(orderPromises);
      }
    }

    console.log(`✓ Loaded warehouse ${w}`);
  }

  console.log('✓ TPC-C data loaded successfully into Triplit DB');
}

/**
 * Load TPC-C data into SQLite
 */
export function loadDataSQLite(
  db: Database,
  config: TPCCConfig
): void {
  const generator = new TPCCDataGenerator(config);
  const numItems = config.itemsPerWarehouse ?? 100000;

  console.log('Loading TPC-C data into SQLite...');
  console.log(`Configuration:`, config);

  // Prepare statements
  const insertItem = db.prepare(
    `INSERT INTO item (i_id, i_im_id, i_name, i_price, i_data)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insertWarehouse = db.prepare(
    `INSERT INTO warehouse (w_id, w_name, w_street_1, w_street_2, w_city, w_state, w_zip, w_tax, w_ytd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertDistrict = db.prepare(
    `INSERT INTO district (d_id, d_w_id, d_name, d_street_1, d_street_2, d_city, d_state, d_zip, d_tax, d_ytd, d_next_o_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertCustomer = db.prepare(
    `INSERT INTO customer (c_id, c_d_id, c_w_id, c_first, c_middle, c_last, c_street_1, c_street_2,
                           c_city, c_state, c_zip, c_phone, c_since, c_credit, c_credit_lim,
                           c_discount, c_balance, c_ytd_payment, c_payment_cnt, c_delivery_cnt, c_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertStock = db.prepare(
    `INSERT INTO stock (s_i_id, s_w_id, s_quantity, s_dist_01, s_dist_02, s_dist_03, s_dist_04, s_dist_05,
                        s_dist_06, s_dist_07, s_dist_08, s_dist_09, s_dist_10, s_ytd, s_order_cnt, s_remote_cnt, s_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertOrder = db.prepare(
    `INSERT INTO orders (o_id, o_d_id, o_w_id, o_c_id, o_entry_d, o_carrier_id, o_ol_cnt, o_all_local)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertOrderLine = db.prepare(
    `INSERT INTO order_line (ol_o_id, ol_d_id, ol_w_id, ol_number, ol_i_id, ol_supply_w_id,
                             ol_delivery_d, ol_quantity, ol_amount, ol_dist_info)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertNewOrder = db.prepare(
    `INSERT INTO new_order (no_o_id, no_d_id, no_w_id)
     VALUES (?, ?, ?)`
  );

  // Load items
  console.log(`Loading ${numItems} items...`);
  db.transaction(() => {
    for (let i = 1; i <= numItems; i++) {
      const item = generator.generateItem(i);
      insertItem.run(item.itemId, item.imageId, item.name, item.price, item.data);

      if (i % 10000 === 0) {
        console.log(`  Loaded ${i} items...`);
      }
    }
  })();
  console.log(`✓ Loaded ${numItems} items`);

  // Load warehouses and related data
  for (let w = 1; w <= config.numWarehouses; w++) {
    console.log(`Loading warehouse ${w}/${config.numWarehouses}...`);

    db.transaction(() => {
      // Load warehouse
      const warehouse = generator.generateWarehouse(w);
      insertWarehouse.run(
        w,
        warehouse.name,
        warehouse.street1,
        warehouse.street2,
        warehouse.city,
        warehouse.state,
        warehouse.zip,
        warehouse.tax,
        warehouse.ytd
      );

      // Load stock
      for (let i = 1; i <= numItems; i++) {
        const stock = generator.generateStock(w, i);
        insertStock.run(
          stock.itemId,
          w,
          stock.quantity,
          stock.dist01,
          stock.dist02,
          stock.dist03,
          stock.dist04,
          stock.dist05,
          stock.dist06,
          stock.dist07,
          stock.dist08,
          stock.dist09,
          stock.dist10,
          stock.ytd,
          stock.orderCount,
          stock.remoteCount,
          stock.data
        );
      }

      // Load districts
      const districtsPerWarehouse = config.districtsPerWarehouse ?? 10;
      for (let d = 1; d <= districtsPerWarehouse; d++) {
        const district = generator.generateDistrict(w, d);
        insertDistrict.run(
          d,
          w,
          district.name,
          district.street1,
          district.street2,
          district.city,
          district.state,
          district.zip,
          district.tax,
          district.ytd,
          district.nextOrderId
        );

        // Load customers
        const customersPerDistrict = config.customersPerDistrict ?? 3000;
        for (let c = 1; c <= customersPerDistrict; c++) {
          const customer = generator.generateCustomer(w, d, c);
          insertCustomer.run(
            c,
            d,
            w,
            customer.firstName,
            customer.middleName,
            customer.lastName,
            customer.street1,
            customer.street2,
            customer.city,
            customer.state,
            customer.zip,
            customer.phone,
            customer.since.toISOString(),
            customer.credit,
            customer.creditLimit,
            customer.discount,
            customer.balance,
            customer.ytdPayment,
            customer.paymentCount,
            customer.deliveryCount,
            customer.data
          );
        }

        // Load orders
        const ordersPerDistrict = config.ordersPerDistrict ?? 3000;
        for (let o = 1; o <= ordersPerDistrict; o++) {
          const { order, orderLines, newOrder } = generator.generateOrder(w, d, o);

          insertOrder.run(
            order.orderId,
            order.districtId,
            w,
            order.customerId,
            order.entryDate.toISOString(),
            order.carrierId,
            order.orderLineCount,
            order.allLocal
          );

          for (const orderLine of orderLines) {
            insertOrderLine.run(
              orderLine.orderId,
              orderLine.districtId,
              w,
              orderLine.lineNumber,
              orderLine.itemId,
              w,
              orderLine.deliveryDate?.toISOString() ?? null,
              orderLine.quantity,
              orderLine.amount,
              orderLine.distInfo
            );
          }

          if (newOrder) {
            insertNewOrder.run(newOrder.orderId, newOrder.districtId, w);
          }
        }
      }
    })();

    console.log(`✓ Loaded warehouse ${w}`);
  }

  console.log('✓ TPC-C data loaded successfully into SQLite');
}
