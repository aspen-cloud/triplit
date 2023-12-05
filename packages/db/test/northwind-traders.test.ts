import { beforeAll, describe, expect, it } from 'vitest';
import DB, { Schema as S } from '../src/index.js';
import CATEGORIES from './sample_data/northwind-tranders/categories.json';
import CUSTOMERS from './sample_data/northwind-tranders/customers.json';
import EMPLOYEE_TERRITORIES from './sample_data/northwind-tranders/employee-territories.json';
import EMPLOYEES from './sample_data/northwind-tranders/employees.json';
import ORDER_DETAILS from './sample_data/northwind-tranders/order-details.json';
import ORDERS from './sample_data/northwind-tranders/orders.json';
import PRODUCTS from './sample_data/northwind-tranders/products.json';
import REGIONS from './sample_data/northwind-tranders/regions.json';
import SHIPPERS from './sample_data/northwind-tranders/shippers.json';
import SUPPLIERS from './sample_data/northwind-tranders/suppliers.json';
import TERRITORIES from './sample_data/northwind-tranders/territories.json';

describe('northwind tranders', () => {
  // Setup classic NorthWind Traders schema
  const schema = {
    collections: {
      customers: {
        schema: S.Schema({
          id: S.Id(),
          companyName: S.String(),
          contactName: S.String(),
          contactTitle: S.String(),
          address: S.String(),
          city: S.String(),
          region: S.String(),
          postalCode: S.String({ nullable: true }),
          country: S.String(),
          phone: S.String(),
          fax: S.String({ nullable: true }),
          orders: S.Query({
            collectionName: 'orders',
            where: [['customerId', '=', '$id']],
          }),
        }),
      },
      orders: {
        schema: S.Schema({
          id: S.Id(),
          customerId: S.String(),
          employeeId: S.String(),
          orderDate: S.Date(),
          requiredDate: S.Date(),
          shippedDate: S.Date({ nullable: true }),
          shipVia: S.String(),
          freight: S.Number(),
          shipName: S.String(),
          shipAddress: S.String(),
          shipCity: S.String(),
          shipRegion: S.String(),
          shipPostalCode: S.String({ nullable: true }),
          shipCountry: S.String(),
          customer: S.Query({
            collectionName: 'customers',
            where: [['id', '=', '$customerId']],
          }),
          employee: S.Query({
            collectionName: 'employees',
            where: [['id', '=', '$employeeId']],
          }),
          orderDetails: S.Query({
            collectionName: 'orderDetails',
            where: [['orderId', '=', '$id']],
          }),
        }),
      },
      employees: {
        schema: S.Schema({
          id: S.Id(),
          lastName: S.String(),
          firstName: S.String(),
          title: S.String(),
          titleOfCourtesy: S.String(),
          birthDate: S.Date(),
          hireDate: S.Date(),
          address: S.String(),
          city: S.String(),
          region: S.String(),
          postalCode: S.String(),
          country: S.String(),
          homePhone: S.String(),
          extension: S.String(),
          photo: S.String({ nullable: true }),
          notes: S.String(),
          reportsTo: S.String({ nullable: true }),
          photoPath: S.String(),
          orders: S.Query({
            collectionName: 'orders',
            where: [['employeeId', '=', '$id']],
          }),
          territoryIds: S.Set(S.String()),
        }),
      },
      products: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          supplierId: S.String(),
          categoryId: S.String(),
          quantityPerUnit: S.String(),
          unitPrice: S.Number(),
          unitsInStock: S.Number(),
          unitsOnOrder: S.Number(),
          reorderLevel: S.Number(),
          discontinued: S.Boolean(),
          supplier: S.Query({
            collectionName: 'suppliers',
            where: [['id', '=', '$supplierId']],
          }),
          category: S.Query({
            collectionName: 'categories',
            where: [['id', '=', '$categoryId']],
          }),
          orderDetails: S.Query({
            collectionName: 'orderDetails',
            where: [['productId', '=', '$id']],
          }),
        }),
      },
      suppliers: {
        schema: S.Schema({
          id: S.Id(),
          companyName: S.String(),
          contactName: S.String(),
          contactTitle: S.String(),
          address: S.String(),
          city: S.String(),
          region: S.String(),
          postalCode: S.String(),
          country: S.String(),
          phone: S.String(),
          fax: S.String({ nullable: true }),
          homePage: S.String({ nullable: true }),
          products: S.Query({
            collectionName: 'products',
            where: [['supplierId', '=', '$id']],
          }),
        }),
      },
      categories: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          description: S.String(),
          picture: S.String(),
          products: S.Query({
            collectionName: 'products',
            where: [['categoryId', '=', '$id']],
          }),
        }),
      },
      orderDetails: {
        schema: S.Schema({
          id: S.Id(),
          orderId: S.String(),
          productId: S.String(),
          unitPrice: S.Number(),
          quantity: S.Number(),
          discount: S.Number(),
          order: S.Query({
            collectionName: 'orders',
            where: [['id', '=', '$orderId']],
          }),
          product: S.Query({
            collectionName: 'products',
            where: [['id', '=', '$productId']],
          }),
        }),
      },
      territories: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          regionId: S.String(),
          region: S.Query({
            collectionName: 'regions',
            where: [['id', '=', '$regionId']],
          }),
        }),
      },
      regions: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
        }),
      },
      shippers: {
        schema: S.Schema({
          id: S.Id(),
          companyName: S.String(),
          phone: S.String(),
          orders: S.Query({
            collectionName: 'orders',
            where: [['shipVia', '=', '$id']],
          }),
        }),
      },
    },
  };
  const db = new DB({
    schema,
  });
  beforeAll(async () => {
    const start = performance.now();
    for (const customer of CUSTOMERS) {
      await db.insert('customers', customer);
    }
    for (const category of CATEGORIES) {
      await db.insert('categories', category);
    }
    for (const employee of EMPLOYEES) {
      await db.insert('employees', employee);
    }
    for (const order of ORDERS) {
      await db.insert('orders', order);
    }
    for (const product of PRODUCTS) {
      await db.insert('products', product);
    }
    for (const supplier of SUPPLIERS) {
      await db.insert('suppliers', supplier);
    }
    for (const territory of TERRITORIES) {
      await db.insert('territories', territory);
    }
    for (const region of REGIONS) {
      await db.insert('regions', region);
    }
    for (const shipper of SHIPPERS) {
      await db.insert('shippers', shipper);
    }
    for (const orderDetail of ORDER_DETAILS) {
      await db.insert('orderDetails', orderDetail);
    }

    // for (const employeeTerritory of EMPLOYEE_TERRITORIES) {
    //   await db.update(
    //     'employees',
    //     employeeTerritory.employeeId,
    //     async (emp) => {
    //       emp.territoryIds.add(employeeTerritory.territoryId);
    //     }
    //   );
    // }

    const end = performance.now();
    console.log(`Inserted all data in ${end - start}ms`);
  });

  it('inserted everything correctly', async () => {
    expect(await db.fetch(db.query('customers').build())).toHaveLength(
      CUSTOMERS.length
    );
    expect(await db.fetch(db.query('categories').build())).toHaveLength(
      CATEGORIES.length
    );
    expect(await db.fetch(db.query('employees').build())).toHaveLength(
      EMPLOYEES.length
    );
    expect(await db.fetch(db.query('orders').build())).toHaveLength(
      ORDERS.length
    );
    expect(await db.fetch(db.query('products').build())).toHaveLength(
      PRODUCTS.length
    );
    expect(await db.fetch(db.query('suppliers').build())).toHaveLength(
      SUPPLIERS.length
    );
    expect(await db.fetch(db.query('territories').build())).toHaveLength(
      TERRITORIES.length
    );
    expect(await db.fetch(db.query('regions').build())).toHaveLength(
      REGIONS.length
    );
    expect(await db.fetch(db.query('shippers').build())).toHaveLength(
      SHIPPERS.length
    );
    expect(await db.fetch(db.query('orderDetails').build())).toHaveLength(
      ORDER_DETAILS.length
    );
  });
});
