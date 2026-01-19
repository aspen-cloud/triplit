import { Schema as S } from '../../src/schema/builder.js';

/**
 * TPC-C Schema for Triplit DB
 * Based on the TPC-C benchmark specification v5.11
 */

export const TPCC_SCHEMA = {
  collections: S.Collections({
    // Warehouse - represents a physical warehouse
    warehouse: {
      schema: S.Schema({
        id: S.Id(), // W_ID
        name: S.String(), // W_NAME
        street1: S.String(), // W_STREET_1
        street2: S.String(), // W_STREET_2
        city: S.String(), // W_CITY
        state: S.String(), // W_STATE
        zip: S.String(), // W_ZIP
        tax: S.Number(), // W_TAX
        ytd: S.Number(), // W_YTD (year-to-date balance)
      }),
    },

    // District - 10 districts per warehouse
    district: {
      schema: S.Schema({
        id: S.Id(), // D_ID composite key
        warehouseId: S.String(), // D_W_ID
        districtId: S.Number(), // D_ID (1-10)
        name: S.String(), // D_NAME
        street1: S.String(), // D_STREET_1
        street2: S.String(), // D_STREET_2
        city: S.String(), // D_CITY
        state: S.String(), // D_STATE
        zip: S.String(), // D_ZIP
        tax: S.Number(), // D_TAX
        ytd: S.Number(), // D_YTD
        nextOrderId: S.Number(), // D_NEXT_O_ID
      }),
    },

    // Customer - 3000 customers per district
    customer: {
      schema: S.Schema({
        id: S.Id(), // C_ID composite key
        warehouseId: S.String(), // C_W_ID
        districtId: S.Number(), // C_D_ID
        customerId: S.Number(), // C_ID (1-3000)
        firstName: S.String(), // C_FIRST
        middleName: S.String(), // C_MIDDLE
        lastName: S.String(), // C_LAST
        street1: S.String(), // C_STREET_1
        street2: S.String(), // C_STREET_2
        city: S.String(), // C_CITY
        state: S.String(), // C_STATE
        zip: S.String(), // C_ZIP
        phone: S.String(), // C_PHONE
        since: S.Date(), // C_SINCE
        credit: S.String(), // C_CREDIT (GC or BC)
        creditLimit: S.Number(), // C_CREDIT_LIM
        discount: S.Number(), // C_DISCOUNT
        balance: S.Number(), // C_BALANCE
        ytdPayment: S.Number(), // C_YTD_PAYMENT
        paymentCount: S.Number(), // C_PAYMENT_CNT
        deliveryCount: S.Number(), // C_DELIVERY_CNT
        data: S.String(), // C_DATA
      }),
    },

    // Order - initial 3000 orders per district
    order: {
      schema: S.Schema({
        id: S.Id(), // O_ID composite key
        warehouseId: S.String(), // O_W_ID
        districtId: S.Number(), // O_D_ID
        orderId: S.Number(), // O_ID
        customerId: S.Number(), // O_C_ID
        entryDate: S.Date(), // O_ENTRY_D
        carrierId: S.Number({ nullable: true }), // O_CARRIER_ID
        orderLineCount: S.Number(), // O_OL_CNT
        allLocal: S.Number(), // O_ALL_LOCAL
      }),
    },

    // OrderLine - 5-15 order lines per order
    orderLine: {
      schema: S.Schema({
        id: S.Id(), // composite key
        warehouseId: S.String(), // OL_W_ID
        districtId: S.Number(), // OL_D_ID
        orderId: S.Number(), // OL_O_ID
        lineNumber: S.Number(), // OL_NUMBER
        itemId: S.Number(), // OL_I_ID
        supplyWarehouseId: S.String(), // OL_SUPPLY_W_ID
        deliveryDate: S.Date({ nullable: true }), // OL_DELIVERY_D
        quantity: S.Number(), // OL_QUANTITY
        amount: S.Number(), // OL_AMOUNT
        distInfo: S.String(), // OL_DIST_INFO
      }),
    },

    // NewOrder - subset of orders that have not been delivered
    newOrder: {
      schema: S.Schema({
        id: S.Id(), // composite key
        warehouseId: S.String(), // NO_W_ID
        districtId: S.Number(), // NO_D_ID
        orderId: S.Number(), // NO_O_ID
      }),
    },

    // Item - 100,000 items (static)
    item: {
      schema: S.Schema({
        id: S.Id(), // I_ID
        itemId: S.Number(), // I_ID (1-100000)
        imageId: S.Number(), // I_IM_ID
        name: S.String(), // I_NAME
        price: S.Number(), // I_PRICE
        data: S.String(), // I_DATA
      }),
    },

    // Stock - 100,000 stock items per warehouse
    stock: {
      schema: S.Schema({
        id: S.Id(), // composite key
        warehouseId: S.String(), // S_W_ID
        itemId: S.Number(), // S_I_ID
        quantity: S.Number(), // S_QUANTITY
        dist01: S.String(), // S_DIST_01
        dist02: S.String(), // S_DIST_02
        dist03: S.String(), // S_DIST_03
        dist04: S.String(), // S_DIST_04
        dist05: S.String(), // S_DIST_05
        dist06: S.String(), // S_DIST_06
        dist07: S.String(), // S_DIST_07
        dist08: S.String(), // S_DIST_08
        dist09: S.String(), // S_DIST_09
        dist10: S.String(), // S_DIST_10
        ytd: S.Number(), // S_YTD
        orderCount: S.Number(), // S_ORDER_CNT
        remoteCount: S.Number(), // S_REMOTE_CNT
        data: S.String(), // S_DATA
      }),
    },

    // History - payment history
    history: {
      schema: S.Schema({
        id: S.Id(), // H_ID
        customerId: S.Number(), // H_C_ID
        customerDistrictId: S.Number(), // H_C_D_ID
        customerWarehouseId: S.String(), // H_C_W_ID
        districtId: S.Number(), // H_D_ID
        warehouseId: S.String(), // H_W_ID
        date: S.Date(), // H_DATE
        amount: S.Number(), // H_AMOUNT
        data: S.String(), // H_DATA
      }),
    },
  }),
};
