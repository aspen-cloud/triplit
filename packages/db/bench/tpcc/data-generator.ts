/**
 * TPC-C Data Generation Utilities
 * Generates random data according to TPC-C specification
 */

// TPC-C constants
export const SYLLABLES = [
  'BAR',
  'OUGHT',
  'ABLE',
  'PRI',
  'PRES',
  'ESE',
  'ANTI',
  'CALLY',
  'ATION',
  'EING',
];

// Random number generator with seed support for reproducibility
export class RandomGenerator {
  private seed: number;

  constructor(seed: number = Date.now()) {
    this.seed = seed;
  }

  // Linear congruential generator
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  // Generate random integer between min and max (inclusive)
  number(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // Generate random string of length n
  string(n: number): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < n; i++) {
      result += chars.charAt(this.number(0, chars.length - 1));
    }
    return result;
  }

  // Generate random alpha string (a-z)
  alphaString(min: number, max: number): string {
    const length = this.number(min, max);
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(this.number(0, chars.length - 1));
    }
    return result;
  }

  // Generate random numeric string
  numericString(n: number): string {
    let result = '';
    for (let i = 0; i < n; i++) {
      result += this.number(0, 9).toString();
    }
    return result;
  }

  // Generate last name using syllables (as per TPC-C spec)
  lastName(num: number): string {
    const idx1 = Math.floor(num / 100) % 10;
    const idx2 = Math.floor(num / 10) % 10;
    const idx3 = num % 10;
    return SYLLABLES[idx1] + SYLLABLES[idx2] + SYLLABLES[idx3];
  }

  // Generate random last name
  randomLastName(): string {
    return this.lastName(this.number(0, 999));
  }

  // Generate zip code (4 digits + 11111)
  zip(): string {
    return this.numericString(4) + '11111';
  }

  // Choose random element from array
  choice<T>(arr: T[]): T {
    return arr[this.number(0, arr.length - 1)];
  }
}

export interface TPCCConfig {
  numWarehouses: number; // W
  itemsPerWarehouse?: number; // Default: 100000
  districtsPerWarehouse?: number; // Default: 10
  customersPerDistrict?: number; // Default: 3000
  ordersPerDistrict?: number; // Default: 3000
}

export interface WarehouseData {
  id: string;
  name: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  tax: number;
  ytd: number;
}

export interface DistrictData {
  id: string;
  warehouseId: string;
  districtId: number;
  name: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  tax: number;
  ytd: number;
  nextOrderId: number;
}

export interface CustomerData {
  id: string;
  warehouseId: string;
  districtId: number;
  customerId: number;
  firstName: string;
  middleName: string;
  lastName: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  since: Date;
  credit: string;
  creditLimit: number;
  discount: number;
  balance: number;
  ytdPayment: number;
  paymentCount: number;
  deliveryCount: number;
  data: string;
}

export interface ItemData {
  id: string;
  itemId: number;
  imageId: number;
  name: string;
  price: number;
  data: string;
}

export interface StockData {
  id: string;
  warehouseId: string;
  itemId: number;
  quantity: number;
  dist01: string;
  dist02: string;
  dist03: string;
  dist04: string;
  dist05: string;
  dist06: string;
  dist07: string;
  dist08: string;
  dist09: string;
  dist10: string;
  ytd: number;
  orderCount: number;
  remoteCount: number;
  data: string;
}

export interface OrderData {
  id: string;
  warehouseId: string;
  districtId: number;
  orderId: number;
  customerId: number;
  entryDate: Date;
  carrierId: number | null;
  orderLineCount: number;
  allLocal: number;
}

export interface OrderLineData {
  id: string;
  warehouseId: string;
  districtId: number;
  orderId: number;
  lineNumber: number;
  itemId: number;
  supplyWarehouseId: string;
  deliveryDate: Date | null;
  quantity: number;
  amount: number;
  distInfo: string;
}

export interface NewOrderData {
  id: string;
  warehouseId: string;
  districtId: number;
  orderId: number;
}

export class TPCCDataGenerator {
  private rng: RandomGenerator;
  private config: Required<TPCCConfig>;

  constructor(config: TPCCConfig, seed: number = 12345) {
    this.rng = new RandomGenerator(seed);
    this.config = {
      numWarehouses: config.numWarehouses,
      itemsPerWarehouse: config.itemsPerWarehouse ?? 100000,
      districtsPerWarehouse: config.districtsPerWarehouse ?? 10,
      customersPerDistrict: config.customersPerDistrict ?? 3000,
      ordersPerDistrict: config.ordersPerDistrict ?? 3000,
    };
  }

  // Generate warehouse data
  generateWarehouse(wId: number): WarehouseData {
    return {
      id: `W${wId}`,
      name: this.rng.alphaString(6, 10),
      street1: this.rng.alphaString(10, 20),
      street2: this.rng.alphaString(10, 20),
      city: this.rng.alphaString(10, 20),
      state: this.rng.alphaString(2, 2).toUpperCase(),
      zip: this.rng.zip(),
      tax: this.rng.number(0, 2000) / 10000, // 0.0000 to 0.2000
      ytd: 300000.0,
    };
  }

  // Generate district data
  generateDistrict(wId: number, dId: number): DistrictData {
    return {
      id: `W${wId}D${dId}`,
      warehouseId: `W${wId}`,
      districtId: dId,
      name: this.rng.alphaString(6, 10),
      street1: this.rng.alphaString(10, 20),
      street2: this.rng.alphaString(10, 20),
      city: this.rng.alphaString(10, 20),
      state: this.rng.alphaString(2, 2).toUpperCase(),
      zip: this.rng.zip(),
      tax: this.rng.number(0, 2000) / 10000,
      ytd: 30000.0,
      nextOrderId: this.config.ordersPerDistrict + 1,
    };
  }

  // Generate customer data
  generateCustomer(wId: number, dId: number, cId: number): CustomerData {
    // 10% of customers have bad credit
    const credit = this.rng.number(1, 10) === 1 ? 'BC' : 'GC';

    return {
      id: `W${wId}D${dId}C${cId}`,
      warehouseId: `W${wId}`,
      districtId: dId,
      customerId: cId,
      firstName: this.rng.alphaString(8, 16),
      middleName: 'OE',
      lastName: this.rng.randomLastName(),
      street1: this.rng.alphaString(10, 20),
      street2: this.rng.alphaString(10, 20),
      city: this.rng.alphaString(10, 20),
      state: this.rng.alphaString(2, 2).toUpperCase(),
      zip: this.rng.zip(),
      phone: this.rng.numericString(16),
      since: new Date(),
      credit,
      creditLimit: 50000.0,
      discount: this.rng.number(0, 5000) / 10000,
      balance: -10.0,
      ytdPayment: 10.0,
      paymentCount: 1,
      deliveryCount: 0,
      data: this.rng.alphaString(300, 500),
    };
  }

  // Generate item data
  generateItem(iId: number): ItemData {
    // 10% of items have "ORIGINAL" in data
    const hasOriginal = this.rng.number(1, 10) === 1;
    let data = this.rng.alphaString(26, 50);
    if (hasOriginal) {
      const pos = this.rng.number(0, data.length - 8);
      data = data.substring(0, pos) + 'ORIGINAL' + data.substring(pos + 8);
    }

    return {
      id: `I${iId}`,
      itemId: iId,
      imageId: this.rng.number(1, 10000),
      name: this.rng.alphaString(14, 24),
      price: this.rng.number(100, 10000) / 100, // $1.00 to $100.00
      data,
    };
  }

  // Generate stock data
  generateStock(wId: number, iId: number): StockData {
    // 10% of stock items have "ORIGINAL" in data
    const hasOriginal = this.rng.number(1, 10) === 1;
    let data = this.rng.alphaString(26, 50);
    if (hasOriginal) {
      const pos = this.rng.number(0, data.length - 8);
      data = data.substring(0, pos) + 'ORIGINAL' + data.substring(pos + 8);
    }

    return {
      id: `W${wId}I${iId}`,
      warehouseId: `W${wId}`,
      itemId: iId,
      quantity: this.rng.number(10, 100),
      dist01: this.rng.alphaString(24, 24),
      dist02: this.rng.alphaString(24, 24),
      dist03: this.rng.alphaString(24, 24),
      dist04: this.rng.alphaString(24, 24),
      dist05: this.rng.alphaString(24, 24),
      dist06: this.rng.alphaString(24, 24),
      dist07: this.rng.alphaString(24, 24),
      dist08: this.rng.alphaString(24, 24),
      dist09: this.rng.alphaString(24, 24),
      dist10: this.rng.alphaString(24, 24),
      ytd: 0,
      orderCount: 0,
      remoteCount: 0,
      data,
    };
  }

  // Generate order data
  generateOrder(
    wId: number,
    dId: number,
    oId: number
  ): {
    order: OrderData;
    orderLines: OrderLineData[];
    newOrder: NewOrderData | null;
  } {
    const olCount = this.rng.number(5, 15);
    const allLocal = 1; // Simplified for benchmark
    // Last 900 orders are new orders (not delivered yet)
    const isNewOrder = oId > this.config.ordersPerDistrict - 900;
    const carrierId = isNewOrder ? null : this.rng.number(1, 10);

    const order: OrderData = {
      id: `W${wId}D${dId}O${oId}`,
      warehouseId: `W${wId}`,
      districtId: dId,
      orderId: oId,
      customerId: this.rng.number(1, this.config.customersPerDistrict),
      entryDate: new Date(),
      carrierId,
      orderLineCount: olCount,
      allLocal,
    };

    const orderLines: OrderLineData[] = [];
    for (let ol = 1; ol <= olCount; ol++) {
      orderLines.push({
        id: `W${wId}D${dId}O${oId}L${ol}`,
        warehouseId: `W${wId}`,
        districtId: dId,
        orderId: oId,
        lineNumber: ol,
        itemId: this.rng.number(1, this.config.itemsPerWarehouse),
        supplyWarehouseId: `W${wId}`,
        deliveryDate: isNewOrder ? null : new Date(),
        quantity: 5,
        amount: isNewOrder ? 0 : this.rng.number(1, 999999) / 100,
        distInfo: this.rng.alphaString(24, 24),
      });
    }

    const newOrder: NewOrderData | null = isNewOrder
      ? {
          id: `W${wId}D${dId}NO${oId}`,
          warehouseId: `W${wId}`,
          districtId: dId,
          orderId: oId,
        }
      : null;

    return { order, orderLines, newOrder };
  }
}
