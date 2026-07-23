/**
 * Base de datos local para Sistema de Pulpería
 * Usa localStorage para persistencia de datos
 */
const DB = {
    // Claves en localStorage
    keys: {
        products: 'pulperia_products',
        sales: 'pulperia_sales',
        creditCustomers: 'pulperia_credit_customers',
        creditTransactions: 'pulperia_credit_transactions',
        consumption: 'pulperia_consumption',
        settings: 'pulperia_settings'
    },

    // ------ PRODUCTOS / INVENTARIO ------
    getProducts() {
        const data = localStorage.getItem(this.keys.products);
        const products = data ? JSON.parse(data) : [];
        // Migrar productos antiguos
        return products.map(p => ({
            ...p,
            fiado_permitido: p.fiado_permitido !== undefined ? p.fiado_permitido : true,
            isWeighted: p.isWeighted !== undefined ? p.isWeighted : false,
            barcode: p.barcode || ''
        }));
    },
    saveProducts(products) {
        localStorage.setItem(this.keys.products, JSON.stringify(products));
    },
    addProduct(product) {
        const products = this.getProducts();
        product.id = Date.now().toString();
        product.createdAt = new Date().toISOString();
        products.push(product);
        this.saveProducts(products);
        return product;
    },
    updateProduct(id, updates) {
        const products = this.getProducts();
        const idx = products.findIndex(p => p.id === id);
        if (idx !== -1) {
            products[idx] = { ...products[idx], ...updates };
            this.saveProducts(products);
            return products[idx];
        }
        return null;
    },
    deleteProduct(id) {
        let products = this.getProducts();
        products = products.filter(p => p.id !== id);
        this.saveProducts(products);
    },
    getProduct(id) {
        return this.getProducts().find(p => p.id === id);
    },
    // Reducir inventario al vender
    reduceStock(productId, quantity) {
        const product = this.getProduct(productId);
        if (product) {
            product.stock -= quantity;
            this.updateProduct(productId, { stock: product.stock });
        }
    },

    // ------ VENTAS ------
    getSales() {
        return JSON.parse(localStorage.getItem(this.keys.sales) || '[]');
    },
    saveSales(sales) {
        localStorage.setItem(this.keys.sales, JSON.stringify(sales));
    },
    addSale(sale) {
        const sales = this.getSales();
        sale.id = Date.now().toString();
        sale.date = new Date().toISOString();
        sales.push(sale);
        this.saveSales(sales);
        return sale;
    },
    getTodaySales() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return this.getSales().filter(s => new Date(s.date) >= today);
    },
    getSalesByDateRange(startDate, endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return this.getSales().filter(s => {
            const d = new Date(s.date);
            return d >= start && d <= end;
        });
    },

    // ------ CLIENTES FIADO ------
    getCreditCustomers() {
        return JSON.parse(localStorage.getItem(this.keys.creditCustomers) || '[]');
    },
    saveCreditCustomers(customers) {
        localStorage.setItem(this.keys.creditCustomers, JSON.stringify(customers));
    },
    addCreditCustomer(customer) {
        const customers = this.getCreditCustomers();
        customer.id = Date.now().toString();
        customer.createdAt = new Date().toISOString();
        customer.balance = 0; // saldo pendiente
        customers.push(customer);
        this.saveCreditCustomers(customers);
        return customer;
    },
    updateCreditCustomer(id, updates) {
        const customers = this.getCreditCustomers();
        const idx = customers.findIndex(c => c.id === id);
        if (idx !== -1) {
            customers[idx] = { ...customers[idx], ...updates };
            this.saveCreditCustomers(customers);
            return customers[idx];
        }
        return null;
    },

    // ------ TRANSACCIONES FIADO ------
    getCreditTransactions() {
        return JSON.parse(localStorage.getItem(this.keys.creditTransactions) || '[]');
    },
    saveCreditTransactions(transactions) {
        localStorage.setItem(this.keys.creditTransactions, JSON.stringify(transactions));
    },
    addCreditTransaction(transaction) {
        const transactions = this.getCreditTransactions();
        transaction.id = Date.now().toString();
        transaction.date = new Date().toISOString();
        transactions.push(transaction);
        this.saveCreditTransactions(transactions);
        return transaction;
    },
    getCustomerTransactions(customerId) {
        return this.getCreditTransactions().filter(t => t.customerId === customerId);
    },

    // ------ CONSUMO PERSONAL ------
    getConsumptions() {
        return JSON.parse(localStorage.getItem(this.keys.consumption) || '[]');
    },
    saveConsumptions(consumptions) {
        localStorage.setItem(this.keys.consumption, JSON.stringify(consumptions));
    },
    addConsumption(consumption) {
        const consumptions = this.getConsumptions();
        consumption.id = Date.now().toString();
        consumption.date = new Date().toISOString();
        consumptions.push(consumption);
        this.saveConsumptions(consumptions);
        return consumption;
    },

    // ------ CONFIGURACIÓN ------
    getSettings() {
        return JSON.parse(localStorage.getItem(this.keys.settings) || '{"storeName":"Mi Pulpería","currency":"₡","taxRate":0}');
    },
    saveSettings(settings) {
        localStorage.setItem(this.keys.settings, JSON.stringify(settings));
    },

    // ------ REPORTES ------
    getTotalSalesByDateRange(startDate, endDate) {
        const sales = this.getSalesByDateRange(startDate, endDate);
        return sales.reduce((sum, s) => sum + s.total, 0);
    },
    getTotalConsumptionByDateRange(startDate, endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        const consumptions = this.getConsumptions().filter(c => {
            const d = new Date(c.date);
            return d >= start && d <= end;
        });
        return consumptions.reduce((sum, c) => sum + c.total, 0);
    }
};
